
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

async function main() {
  const targetPath = path.join(process.cwd(), 'benchmarks', 'target.js');

  let target;

  try {
    target = await import(pathToFileURL(targetPath).href);
  } catch (error) {
    throw new Error(
      `Cannot load benchmarks/target.js: ${error.message}`
    );
  }

  if (typeof target.runBenchmark !== 'function') {
    throw new Error(
      'benchmarks/target.js must export an async or sync runBenchmark() function.'
    );
  }

  const startedAt = performance.now();

  const result = await target.runBenchmark();

  const durationMs = performance.now() - startedAt;

  if (
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    throw new Error('Benchmark produced an invalid duration.');
  }

  process.stdout.write(
    JSON.stringify({
      success: true,
      durationMs: Number(durationMs.toFixed(3)),
      result
    }) + '\n'
  );
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
