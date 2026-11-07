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
 *   MM_SLASH_TOKEN     strongly recommended; requests with a different token are rejected.
 *                      Without it the server still starts (loud warning) so local demos keep working
 *   SUPERVISOR_API_URL default http://127.0.0.1:3000 (Person 2 supervisor; mock fallback when down)
 *   SWITCH_API_URL     default http://localhost:49921
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import http from 'node:http';
import { CommandHandler } from '../chat/commands.js';
import { SwitchAgentBridge } from '../switch/agent-bridge.js';

const PORT = Number(process.env.PORT || 4000);
const MM_SLASH_TOKEN = process.env.MM_SLASH_TOKEN || '';
const SWITCH_API_URL = process.env.SWITCH_API_URL || 'http://localhost:49921';
const SUPERVISOR_API_URL = process.env.SUPERVISOR_API_URL || 'http://127.0.0.1:3000';

// These commands can start agents, cancel experiments and promote candidates,
// so run this server WITH a token in any real setup. Without one we still start
// (the demo room is local and private), but warn loudly on every startup.
// Note: Mattermost's user_name is a chat display name, not a verified identity;
// it is shown in the approval message but is not proof of who approved.
if (!MM_SLASH_TOKEN) {
  console.warn('============================================================');
  console.warn('[slash] WARNING: MM_SLASH_TOKEN is NOT set. Requests are NOT');
  console.warn('[slash] authenticated - anyone who can reach this port can run');
  console.warn('[slash] /experiment, /cancel and /promote. Set MM_SLASH_TOKEN');
  console.warn('[slash] from the Mattermost slash command integration.');
  console.warn('============================================================');
}

function tokenOk(given) {
  if (!MM_SLASH_TOKEN) return true; // insecure local-test mode only
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(MM_SLASH_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const bridge = new SwitchAgentBridge(SWITCH_API_URL, SUPERVISOR_API_URL);
const handler = new CommandHandler(bridge, bridge);

const ROUTES = {
  '/slash/experiment': '/experiment',
  '/slash/status': '/status',
  '/slash/cancel': '/cancel',
  '/slash/promote': '/promote',
};

const MAX_BODY = 100_000;
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let settled = false;
    req.on('data', (chunk) => {
      if (settled) return;
      data += chunk;
      if (data.length > MAX_BODY) {
        // Reject exactly once and drain the rest so the socket stays usable.
        settled = true;
        reject(new Error('body too large'));
        req.resume();
      }
    });
    req.on('end', () => { if (!settled) { settled = true; resolve(data); } });
    req.on('error', (err) => { if (!settled) { settled = true; reject(err); } });
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

    if (!tokenOk(params.get('token'))) {
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
    if (err && err.message === 'body too large') {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'payload too large' }));
      return;
    }
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
