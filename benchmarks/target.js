/**
 * Shared benchmark contract.
 *
 * Both candidate implementations must:
 * - Use the same input data.
 * - Perform the same task.
 * - Return equivalent results.
 * - Export an async or synchronous runBenchmark() function.
 */

export async function runBenchmark() {
  throw new Error(
    'Benchmark workload is not configured. ' +
    'Implement runBenchmark() using the experiment task.'
  );
}
