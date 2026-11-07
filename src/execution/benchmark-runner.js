import { CommandRunner } from './command-runner.js';

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
}

function parseBenchmarkOutput(stdout) {
    const lines = stdout.trim().split(/\r?\n/).filter(Boolean);

    if (lines.length === 0) {
        throw new Error('Benchmark produced no output.');
    }

    let output;

    try {
        output = JSON.parse(lines.at(-1));
    } catch {
        throw new Error('Benchmark output is not valid JSON.');
    }

    if (
        output.success !== true ||
        !Number.isFinite(output.durationMs) ||
        output.durationMs <= 0
    ) {
        throw new Error('Benchmark returned invalid results.');
    }

    return output;
}

export class BenchmarkRunner {
    constructor(repositoryPath = process.cwd()) {
        this.commandRunner = new CommandRunner(repositoryPath);
        this.commandId = 'node-benchmark';
    }

    async runAgent(agentId, worktreePath, options = {}) {
        const warmups = options.warmups ?? 1;
        const runs = options.runs ?? 5;

        if (!Number.isInteger(warmups) || warmups < 0 || warmups > 5) {
            throw new Error('Warmups must be between 0 and 5.');
        }

        if (!Number.isInteger(runs) || runs < 3 || runs > 20) {
            throw new Error('Benchmark runs must be between 3 and 20.');
        }

        for (let i = 0; i < warmups; i++) {
            const result = await this.commandRunner.run(
                this.commandId,
                worktreePath
            );

            if (!result.success) {
                throw new Error(
                    `Benchmark warmup failed for ${agentId}: ${result.stderr}`
                );
            }

            parseBenchmarkOutput(result.stdout);
        }

        const benchmarks = [];

        for (let i = 0; i < runs; i++) {
            const result = await this.commandRunner.run(
                this.commandId,
                worktreePath
            );

            if (!result.success) {
                throw new Error(
                    `Benchmark failed for ${agentId}: ${result.stderr}`
                );
            }

            const output = parseBenchmarkOutput(result.stdout);

            benchmarks.push({
                run: i + 1,
                durationMs: Number(output.durationMs.toFixed(3)),
                result: output.result ?? null
            });
        }

        const durations = benchmarks.map(item => item.durationMs);
        const average =
            durations.reduce((sum, value) => sum + value, 0) / durations.length;

        return {
            agentId,
            success: true,
            runs,
            benchmarks,
            statistics: {
                medianMs: Number(median(durations).toFixed(3)),
                averageMs: Number(average.toFixed(3)),
                fastestMs: Number(Math.min(...durations).toFixed(3)),
                slowestMs: Number(Math.max(...durations).toFixed(3))
            }
        };
    }

    async runExperiment(worktrees, options = {}) {
        if (!Array.isArray(worktrees) || worktrees.length < 2) {
            throw new Error('At least two agent worktrees are required.');
        }

        const results = [];

        for (const worktree of worktrees) {
            try {
                results.push(
                    await this.runAgent(
                        worktree.agentId,
                        worktree.path,
                        options
                    )
                );
            } catch (error) {
                results.push({
                    agentId: worktree.agentId,
                    success: false,
                    error: error.message,
                    benchmarks: [],
                    statistics: null
                });
            }
        }

        return results;
    }
}
