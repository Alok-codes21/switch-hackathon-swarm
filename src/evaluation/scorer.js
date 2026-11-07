import path from 'node:path';
import { StateManager } from '../supervisor/state-manager.js';

function median(values) {
    if (values.length === 0) {
        return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }

    return sorted[middle];
}

export class Scorer {
    constructor(repositoryPath = process.cwd()) {
        this.stateManager = new StateManager(
            path.join(repositoryPath, 'data', 'experiments.json')
        );
    }

    /**
     * Evaluate all candidates.
     *
     * candidateRuns example:
     * [
     *   {
     *     agentId: 'agent-a',
     *     testsPassed: true,
     *     testsExecuted: 10,
     *     passed: 10,
     *     failed: 0,
     *     benchmarks: [
     *       { durationMs: 120 },
     *       { durationMs: 115 }
     *     ]
     *   }
     * ]
     */
    async evaluateExperiment(experimentId, candidateRuns) {
        if (!Array.isArray(candidateRuns) || candidateRuns.length === 0) {
            throw new Error('Candidate results are required.');
        }

        const experiment = await this.stateManager.getExperiment(experimentId);

        if (!experiment) {
            throw new Error(`Experiment "${experimentId}" was not found.`);
        }

        if (!['running', 'evaluating'].includes(experiment.status)) {
            throw new Error(
                `Cannot evaluate an experiment with status "${experiment.status}".`
            );
        }

        const expectedAgentIds = new Set(
            (experiment.agents || []).map(agent => agent.id)
        );

        const receivedAgentIds = new Set();

        const candidates = candidateRuns.map(run => {
            if (!run || !expectedAgentIds.has(run.agentId)) {
                throw new Error(
                    `Unknown candidate agent: ${run?.agentId ?? 'undefined'}`
                );
            }

            if (receivedAgentIds.has(run.agentId)) {
                throw new Error(
                    `Duplicate candidate result for agent: ${run.agentId}`
                );
            }

            receivedAgentIds.add(run.agentId);

            const testsExecuted = Number(run.testsExecuted ?? 0);
            const passed = Number(run.passed ?? 0);
            const failed = Number(run.failed ?? 0);

            const testsPassed =
                run.testsPassed === true &&
                Number.isInteger(testsExecuted) &&
                testsExecuted > 0 &&
                Number.isInteger(passed) &&
                Number.isInteger(failed) &&
                failed === 0 &&
                passed === testsExecuted;

            const benchmarks = Array.isArray(run.benchmarks)
                ? run.benchmarks
                : [];

            const validMeasurements = benchmarks
                .map(item => item?.durationMs)
                .filter(value =>
                    typeof value === 'number' &&
                    Number.isFinite(value) &&
                    value >= 0
                );

            const medianMs = median(validMeasurements);

            return {
                agentId: run.agentId,
                tests: testsPassed ? 'passed' : 'failed',
                testsPassed,
                testsExecuted,
                passed,
                failed,
                medianMs,
                benchmarkCount: validMeasurements.length,
                eligible: testsPassed && medianMs !== null
            };
        });

        // Missing results are never silently treated as successful.
        for (const agentId of expectedAgentIds) {
            if (!receivedAgentIds.has(agentId)) {
                candidates.push({
                    agentId,
                    tests: 'not-run',
                    testsPassed: false,
                    testsExecuted: 0,
                    passed: 0,
                    failed: 0,
                    medianMs: null,
                    benchmarkCount: 0,
                    eligible: false
                });
            }
        }

        // Lowest median wins among candidates that passed all required tests.
        const eligible = candidates
            .filter(candidate => candidate.eligible)
            .sort((a, b) =>
                a.medianMs - b.medianMs ||
                a.agentId.localeCompare(b.agentId)
            );

        const winner = eligible.length > 0
            ? eligible[0].agentId
            : null;

        const hasBenchmarkMeasurements = candidates.some(
            candidate => candidate.benchmarkCount > 0
        );

        const evaluationStatus = hasBenchmarkMeasurements
            ? 'completed'
            : 'awaiting_benchmark';

        const updated = await this.stateManager.updateExperiment(
            experimentId,
            {
                status: evaluationStatus,
                candidates,
                winner,
                requiresHumanApproval: true,
                evaluatedAt: new Date().toISOString()
            }
        );

        return {
            experimentId,
            status: updated.status,
            winner,
            candidates,
            requiresHumanApproval: true
        };
    }
}
