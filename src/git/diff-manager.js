import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';

import { StateManager } from '../supervisor/state-manager.js';

const execFileAsync = promisify(execFile);

const COMMAND_TIMEOUT_MS = 20000;
const MAX_DIFF_BYTES = 512 * 1024;
const MAX_BUFFER_BYTES = 2 * 1024 * 1024;

async function runGit(args, cwd) {
    const result = await execFileAsync('git', args, {
        cwd,
        windowsHide: true,
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER_BYTES
    });

    return result.stdout;
}

function limitText(value, maxBytes = MAX_DIFF_BYTES) {
    const buffer = Buffer.from(value, 'utf8');

    if (buffer.length <= maxBytes) {
        return {
            text: value,
            truncated: false
        };
    }

    return {
        text: buffer.subarray(0, maxBytes).toString('utf8'),
        truncated: true
    };
}

export class DiffManager {
    constructor(repositoryPath = process.cwd(), stateManager = null) {
        this.repositoryPath = path.resolve(repositoryPath);

        this.stateManager = stateManager || new StateManager(
            path.join(this.repositoryPath, 'data', 'experiments.json')
        );

        this.worktreesRoot = path.join(this.repositoryPath, '.worktrees');
    }

    async validateWorktree(worktree) {
        if (!worktree || typeof worktree.path !== 'string') {
            throw new Error('Invalid worktree record.');
        }

        const repositoryRealPath = await fs.realpath(this.repositoryPath);
        const worktreesRealPath = await fs.realpath(this.worktreesRoot);
        const candidateRealPath = await fs.realpath(
            path.resolve(worktree.path)
        );

        const relativePath = path.relative(
            worktreesRealPath,
            candidateRealPath
        );

        if (
            !relativePath ||
            relativePath === '..' ||
            relativePath.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relativePath)
        ) {
            throw new Error('Worktree path is outside the allowed directory.');
        }

        const gitRoot = (await runGit(
            ['rev-parse', '--show-toplevel'],
            candidateRealPath
        )).trim();

        const gitRootRealPath = await fs.realpath(gitRoot);

        if (gitRootRealPath !== candidateRealPath) {
            throw new Error('Git worktree root does not match its registered path.');
        }

        const branch = (await runGit(
            ['branch', '--show-current'],
            candidateRealPath
        )).trim();

        if (branch !== worktree.branch) {
            throw new Error('Worktree branch does not match its experiment record.');
        }

        return {
            repositoryRealPath,
            worktreeRealPath: candidateRealPath,
            branch
        };
    }

    async getCandidateDiff(experiment, worktree) {
        const validated = await this.validateWorktree(worktree);

        const head = (await runGit(
            ['rev-parse', 'HEAD'],
            validated.worktreeRealPath
        )).trim();

        const [stat, numstat, diff, status, untracked] = await Promise.all([
            runGit(
                ['diff', '--no-ext-diff', '--no-renames', '--stat', experiment.baseCommit],
                validated.worktreeRealPath
            ),
            runGit(
                ['diff', '--no-ext-diff', '--no-renames', '--numstat', experiment.baseCommit],
                validated.worktreeRealPath
            ),
            runGit(
                ['diff', '--no-ext-diff', '--no-renames', '--unified=3', experiment.baseCommit],
                validated.worktreeRealPath
            ),
            runGit(
                ['status', '--short', '--untracked-files=all'],
                validated.worktreeRealPath
            ),
            runGit(
                ['ls-files', '--others', '--exclude-standard'],
                validated.worktreeRealPath
            )
        ]);

        const limitedDiff = limitText(diff);

        return {
            agentId: worktree.agentId,
            branch: validated.branch,
            headCommit: head,
            baseCommit: experiment.baseCommit,
            changedFiles: numstat
                .split(/\r?\n/)
                .filter(Boolean)
                .map(line => {
                    const [insertions, deletions, file] = line.split('\t');

                    return {
                        file,
                        insertions: insertions === '-' ? null : Number(insertions),
                        deletions: deletions === '-' ? null : Number(deletions)
                    };
                }),
            summary: stat.trim(),
            workingTreeStatus: status.trim(),
            untrackedFiles: untracked
                .split(/\r?\n/)
                .filter(Boolean),
            diff: limitedDiff.text,
            diffTruncated: limitedDiff.truncated
        };
    }

    async getExperimentDiffs(experimentId) {
        const experiment = await this.stateManager.getExperiment(experimentId);

        if (!experiment) {
            throw new Error(`Experiment "${experimentId}" was not found.`);
        }

        if (!experiment.baseCommit) {
            throw new Error('Experiment does not contain a base commit.');
        }

        if (!Array.isArray(experiment.worktrees) || experiment.worktrees.length === 0) {
            throw new Error('Experiment has no registered worktrees to inspect.');
        }

        const candidates = [];

        // Inspect sequentially to keep Git subprocess usage controlled.
        for (const worktree of experiment.worktrees) {
            candidates.push(
                await this.getCandidateDiff(experiment, worktree)
            );
        }

        return {
            experimentId,
            baseCommit: experiment.baseCommit,
            candidates
        };
    }
}
