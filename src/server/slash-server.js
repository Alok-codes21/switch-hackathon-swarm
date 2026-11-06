#!/usr/bin/env node
/**
 * slash-server.js
 * Native Mattermost slash commands for the swarm: /experiment /status /cancel /promote
 *
 * Mattermost has no Switch slash commands, so this tiny server gives the room
 * real "/command" typing. Mattermost POSTs each command here; the answer is
 * returned with response_type "in_channel", so EVERYONE in the channel sees it
 * (no "Only visible to you" problem).
 *
 * Setup: docs/PERSON1-TASK3-4-SETUP.md, Option B.
 *
 * Env:
 *   PORT               default 4000
 *   MM_SLASH_TOKEN     optional; when set, requests with a different token are rejected
 *   SUPERVISOR_API_URL default http://127.0.0.1:3000 (Person 2 supervisor; mock fallback when down)
 *   SWITCH_API_URL     default http://localhost:49921
 */

import 'dotenv/config';
import http from 'node:http';
import { CommandHandler } from '../chat/commands.js';
import { SwitchAgentBridge } from '../switch/agent-bridge.js';

const PORT = Number(process.env.PORT || 4000);
const MM_SLASH_TOKEN = process.env.MM_SLASH_TOKEN || '';
const SWITCH_API_URL = process.env.SWITCH_API_URL || 'http://localhost:49921';
const SUPERVISOR_API_URL = process.env.SUPERVISOR_API_URL || 'http://127.0.0.1:3000';

const bridge = new SwitchAgentBridge(SWITCH_API_URL, SUPERVISOR_API_URL);
if (!MM_SLASH_TOKEN) console.warn('[slash] WARNING: MM_SLASH_TOKEN is not set, so requests are not authenticated. Set it unless this is a local test.');
const handler = new CommandHandler(bridge, bridge);

const ROUTES = {
  '/slash/experiment': '/experiment',
  '/slash/status': '/status',
  '/slash/cancel': '/cancel',
  '/slash/promote': '/promote',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 100_000) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, commands: Object.keys(ROUTES) }));
    return;
  }

  const command = ROUTES[req.url];
  if (req.method !== 'POST' || !command) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  try {
    const body = await readBody(req);
    const params = new URLSearchParams(body);

    if (MM_SLASH_TOKEN && params.get('token') !== MM_SLASH_TOKEN) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text: 'Invalid slash command token.' }));
      return;
    }

    const args = (params.get('text') || '').trim();
    const userId = params.get('user_name') || 'mattermost-user';
    const reply = await handler.handleMessage(`${command} ${args}`, userId);

    // response_type "in_channel" = posted publicly in the channel for everyone.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ response_type: 'in_channel', text: reply || 'Nothing to do.' }));
  } catch (err) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ response_type: 'ephemeral', text: `Command failed: ${err.message}` }));
  }
});

server.listen(PORT, () => {
  console.log(`Swarm slash-command server listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  for (const path of Object.keys(ROUTES)) {
    console.log(`  POST ${path}`);
  }
});
