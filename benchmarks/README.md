# Benchmark Contract

## Purpose

Measure the performance of competing AI-generated implementations
using the same workload.

## Required file

Each candidate worktree must contain:

`benchmarks/target.js`

## Required export

```js
export async function runBenchmark() {
  // Execute the experiment's benchmark workload.

  return {
    // Return the result needed to verify correctness.
  };
}
