import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Stores experiment state in a local JSON file.
 *
 * Each experiment has an experimentId, status, timestamps,
 * and an array of candidate/worktree records.
 */
export class StateManager {
  #filePath;
  #queue = Promise.resolve();

  constructor(filePath = resolve(process.cwd(), 'data', 'experiments.json')) {
    this.#filePath = resolve(filePath);
  }

  /**
   * Serialize operations so simultaneous requests do not overwrite
   * each other's updates.
   */
  #runExclusive(operation) {
    const result = this.#queue.then(operation, operation);

    this.#queue = result.then(
      () => undefined,
      () => undefined
    );

    return result;
  }

  async #readState() {
    try {
      const content = await readFile(this.#filePath, 'utf8');
      const state = JSON.parse(content);

      if (!state || !Array.isArray(state.experiments)) {
        throw new Error('Experiment state file has an invalid format.');
      }

      return state;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          version: 1,
          experiments: []
        };
      }

      throw error;
    }
  }

  async #writeState(state) {
    await mkdir(dirname(this.#filePath), { recursive: true });

    const temporaryPath = `${this.#filePath}.${randomUUID()}.tmp`;

    try {
      await writeFile(
        temporaryPath,
        JSON.stringify(state, null, 2),
        'utf8'
      );

      await rename(temporaryPath, this.#filePath);
    } catch (error) {
      // Remove an incomplete temporary file if writing failed.
      await import('node:fs/promises').then(({ rm }) =>
        rm(temporaryPath, { force: true })
      );
      throw error;
    }
  }

  /**
   * Save a newly created experiment.
   */
  async createExperiment(experiment) {
    return this.#runExclusive(async () => {
      if (!experiment || typeof experiment !== 'object') {
        throw new TypeError('An experiment object is required.');
      }

      if (!experiment.experimentId) {
        throw new Error('experimentId is required.');
      }

      const state = await this.#readState();

      const alreadyExists = state.experiments.some(
        item => item.experimentId === experiment.experimentId
      );

      if (alreadyExists) {
        throw new Error(
          `Experiment "${experiment.experimentId}" already exists.`
        );
      }

      const now = new Date().toISOString();

      const record = {
        ...experiment,
        status: experiment.status || 'created',
        createdAt: experiment.createdAt || now,
        updatedAt: now
      };

      state.experiments.push(record);
      await this.#writeState(state);

      return record;
    });
  }

  /**
   * Retrieve one experiment by ID.
   */
  async getExperiment(experimentId) {
    return this.#runExclusive(async () => {
      const state = await this.#readState();

      return state.experiments.find(
        item => item.experimentId === experimentId
      ) || null;
    });
  }

  /**
   * Retrieve all experiments, newest first.
   */
  async listExperiments() {
    return this.#runExclusive(async () => {
      const state = await this.#readState();

      return [...state.experiments].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
    });
  }

  /**
   * Update an experiment using a partial object of changed fields.
   */
  async updateExperiment(experimentId, updates) {
    return this.#runExclusive(async () => {
      if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
        throw new TypeError('Updates must be an object.');
      }

      const state = await this.#readState();

      const index = state.experiments.findIndex(
        item => item.experimentId === experimentId
      );

      if (index === -1) {
        return null;
      }

      // Keep the original ID and creation timestamp immutable.
      const current = state.experiments[index];

      const updated = {
        ...current,
        ...updates,
        experimentId: current.experimentId,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString()
      };

      state.experiments[index] = updated;

      await this.#writeState(state);

      return updated;
    });
  }

  /**
   * Delete an experiment record.
   * This does not delete its Git worktrees.
   */
  async deleteExperiment(experimentId) {
    return this.#runExclusive(async () => {
      const state = await this.#readState();

      const originalLength = state.experiments.length;

      state.experiments = state.experiments.filter(
        item => item.experimentId !== experimentId
      );

      if (state.experiments.length === originalLength) {
        return false;
      }

      await this.#writeState(state);
      return true;
    });
  }
}
