/**
 * fake-agent.js
 * Stands in for a real AI agent CLI (OpenCode) in tests: it does real work
 * (writes files, prints output) so the whole swarm flow can be tested without
 * an AI subscription. It detects the judge prompt and prints a verdict.
 */
import fs from 'node:fs';

const prompt = process.argv.slice(2).join(' ');
const wait = Number(process.env.FAKE_AGENT_SLEEP_MS || 400);

setTimeout(() => {
  if (prompt.includes('WINNER:')) {
    console.log('Comparison: Agent B produced a more concrete result for the given problem.');
    console.log('WINNER: agent-b');
  } else {
    fs.writeFileSync('SUMMARY.md', `# Summary\nApproach: handled "${prompt.slice(0, 60)}"\nProduced demo.txt with the answer.\n`);
    fs.writeFileSync('demo.txt', 'fake-agent real output\n');
    console.log(`work done for: ${prompt.slice(0, 60)}`);
  }
}, wait);
