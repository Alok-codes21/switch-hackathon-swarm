import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ExperimentManager } from './experiment-manager.js';
import { PromotionManager } from '../git/promotion-manager.js';

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '127.0.0.1';
const MAX_BODY_SIZE = 1024 * 1024;

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });

  response.end(JSON.stringify(data));
}

async function readJsonBody(request) {
  const chunks = [];
  let totalSize = 0;

  for await (const chunk of request) {
    totalSize += chunk.length;

    if (totalSize > MAX_BODY_SIZE) {
      const error = new Error('Request body is too large.');
      error.statusCode = 413;
      throw error;
    }

    chunks.push(chunk);
  }

  if (totalSize === 0) {
    return {};
  }

  const contentType = request.headers['content-type'] || '';

  if (!contentType.includes('application/json')) {
    const error = new Error('Content-Type must be application/json.');
    error.statusCode = 415;
    throw error;
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Request body contains invalid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

export function createSupervisorServer({
  repositoryPath = process.cwd()
} = {}) {
  const root = path.resolve(repositoryPath);

  const experimentManager = new ExperimentManager(root);

  const promotionManager = new PromotionManager(
    root,
    experimentManager.stateManager
  );

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(
        request.url,
        `http://${request.headers.host || 'localhost'}`
      );

      const pathname = url.pathname;
      const method = request.method;

      // Basic health check.
      if (method === 'GET' && pathname === '/health') {
        return sendJson(response, 200, {
          success: true,
          service: 'git-worktree-experiment-supervisor'
        });
      }

      // Start experiment.
      if (method === 'POST' && pathname === '/api/experiments') {
        const payload = await readJsonBody(request);
        const result = await experimentManager.startExperiment(payload);

        return sendJson(response, 201, result);
      }

      // List all experiments.
      if (method === 'GET' && pathname === '/api/experiments') {
        const experiments = await experimentManager.listExperiments();

        return sendJson(response, 200, {
          experiments
        });
      }

      const experimentRoute = pathname.match(
        /^\/api\/experiments\/([^/]+)(?:\/(cancel|promote))?$/
      );

      if (experimentRoute) {
        const experimentId = decodeURIComponent(experimentRoute[1]);
        const action = experimentRoute[2];

        if (method === 'GET' && !action) {
          const experiment = await experimentManager.getExperiment(
            experimentId
          );

          if (!experiment) {
            return sendJson(response, 404, {
              error: 'Experiment not found.'
            });
          }

          return sendJson(response, 200, experiment);
        }

        if (method === 'POST' && action === 'cancel') {
          const result = await experimentManager.cancelExperiment(
            experimentId
          );

          return sendJson(
            response,
            result.success ? 200 : 409,
            result
          );
        }

        if (method === 'POST' && action === 'promote') {
          const body = await readJsonBody(request);

          const result = await promotionManager.promoteCandidate(
            experimentId,
            body.agentId,
            body.approvedBy
          );

          return sendJson(response, 200, result);
        }
      }

      return sendJson(response, 404, {
        error: 'Route not found.'
      });
    } catch (error) {
      const statusCode = error.statusCode || 400;

      console.error('[Supervisor API]', error.message);

      return sendJson(response, statusCode, {
        error: error.message || 'Internal server error.'
      });
    }
  });

  return server;
}

export function startSupervisorServer() {
  const port = Number(process.env.SUPERVISOR_PORT || DEFAULT_PORT);
  const host = process.env.SUPERVISOR_HOST || DEFAULT_HOST;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SUPERVISOR_PORT must be a valid TCP port.');
  }

  const server = createSupervisorServer();

  server.listen(port, host, () => {
    console.log('==============================================');
    console.log(' Git Worktree Experiment Supervisor');
    console.log('==============================================');
    console.log(` API: http://${host}:${port}`);
    console.log(` Health: http://${host}:${port}/health`);
    console.log(' Waiting for experiment requests...');
  });

  return server;
}

// Allow this file to run directly without affecting imports.
const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  startSupervisorServer();
}
