import { performance } from 'node:perf_hooks';

export function timeEventRuntimePreparation(records, { runId, invocationId, step, action }, { clock = () => performance.now(), timestamp = () => new Date().toISOString() } = {}) {
  let startedAt, started;
  try { startedAt = timestamp(); started = clock(); } catch { /* Diagnostic timing must never prevent proof work. */ }
  const record = status => {
    if (startedAt === undefined || started === undefined) return;
    try {
      const ended = clock();
      records.push({
        sequence: records.length + 1,
        runId,
        invocationId,
        step,
        status,
        startedAt,
        durationMs: Math.max(0, Math.round(ended - started)),
      });
    } catch { /* Diagnostic timing must never alter proof results. */ }
  };
  const complete = value => { record('completed'); return value; };
  const fail = error => { record('failed'); throw error; };
  try {
    const result = action();
    return result && typeof result.then === 'function'
      ? result.then(complete, fail)
      : complete(result);
  } catch (error) {
    return fail(error);
  }
}
