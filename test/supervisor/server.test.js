
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupervisorServer } from '../../src/supervisor/server.js';

async function withServer(callback) {
  const server = createSupervisorServer();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
}

test('GET /health returns supervisor status', async () => {
  await withServer(async baseUrl => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(
      body.service,
      'git-worktree-experiment-supervisor'
    );
  });
});

test('GET /api/experiments returns an experiments array', async () => {
  await withServer(async baseUrl => {
    const response = await fetch(`${baseUrl}/api/experiments`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.experiments));
  });
});

test('unknown routes return 404', async () => {
  await withServer(async baseUrl => {
    const response = await fetch(`${baseUrl}/unknown-route`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error, 'Route not found.');
  });
});

test('invalid JSON request returns 400', async () => {
  await withServer(async baseUrl => {
    const response = await fetch(`${baseUrl}/api/experiments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: '{invalid-json'
    });

    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /invalid JSON/i);
  });
});
