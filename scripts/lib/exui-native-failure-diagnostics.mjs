import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const codes = new Set(['ENOENT', 'EACCES', 'EPERM', 'ENOSPC', 'ENOMEM', 'ENOBUFS', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ERR_ASSERTION', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER']);
const contracts = new Set(['COMPLEX_EMAIL_ROLE_REGISTRATION', 'COMPLEX_EMAIL_IMPORT_REJECTED', 'COMPLEX_EMAIL_DESCRIPTOR_FAILED', 'COMPLEX_EMAIL_METADATA_ROWS', 'COMPLEX_EMAIL_CLASSIFICATION', 'COMPLEX_EMAIL_FIELD_TYPE', 'COMPLEX_EMAIL_PROBE_TYPE', 'COMPLEX_EMAIL_WORKBOOK_FAILED', 'CI_SELECTOR_COMPLETION_REQUIRED', 'CI_SELECTOR_CLEANUP_INCOMPLETE', 'CI_SELECTOR_NATIVE_PHASE_REQUIRED', 'CI_SELECTOR_JOB_IDENTITY', 'CI_SELECTOR_JOB_CANDIDATE', 'CI_SELECTOR_RECEIPT_CHANGED', 'SELECTOR_CONTROLLER_FAILED', 'SELECTOR_TRANSITION_ACK_TIMEOUT', 'SELECTOR_TRANSITION_CANCELLED', 'SELECTOR_SOURCE_NOT_CLEAN', 'RESULT_CONTROLLER_FAILED', 'LOCAL_CCD_OCI_VERIFICATION_FAILED', 'CI_CLEAN_HARNESS_REQUIRED', 'CI_JOB_CANCELLED', 'CI_EVENT_TRANSITION_CHILD_TERMINATED', 'CI_EVENT_TRANSITION_CANCELLED', 'CI_PHASE_LAUNCH_INPUTS_REQUIRED', 'EVENT_TRANSITION_ACK_TIMEOUT', 'EVENT_TRANSITION_CANCELLED', 'NATIVE_CONTROLLER_INTERRUPTED', 'CI_CONTAINER_INSPECTION_FAILED', 'CI_TOOL_COMMAND_FAILED']);
const sources = new Set(['exui-complex-email-text.mjs', 'exui-complex-email-import.mjs', 'run-harness-selector-event-row.mjs', 'exui-selector-event-row-runtime.mjs', 'exui-selector-event-row-transition.mjs', 'exui-selector-event-row-evidence.mjs', 'exui-selector-event-row-observations.mjs', 'run-harness-recipient-callback-ui.mjs', 'exui-selector-event-row-contract.mjs', 'exui-selector-event-row-facets.mjs', 'exui-recipient-callback-import.mjs', 'exui-local-ccd-oci.mjs', 'exui-local-ccd-runtime-profile.mjs', 'run-harness-applicant-results.mjs', 'run-harness-applicant-results-candidate.mjs', 'exui-applicant-results-runtime.mjs', 'exui-applicant-results-transition.mjs', 'exui-applicant-results-evidence.mjs', 'exui-applicant-results-watch.mjs', 'exui-applicant-result-dates.mjs', 'run-harness-ci.mjs', 'run-harness-candidate.mjs', 'run-harness-ccd-candidate.mjs', 'exui-native-host.mjs', 'exui-host-invocation.mjs', 'exui-ccd-event-transition.mjs', 'exui-native-proof-validation.mjs', 'exui-candidate-ci-process.mjs', 'exui-candidate-ci-evidence.mjs', 'exui-ccd-runtime.mjs']);
const phases = new Set(['family', 'scope', 'ccd', 'eventCapability', 'routing', 'recipientCallback', 'selectorEventRow']);
const signals = new Set(['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGABRT', 'SIGSEGV']);
export const nativeFailurePrefix = '[harness-native-failure] ';

// Only fixed classifications and owned source locations cross the private-log boundary.
export function classifyNativeFailure(error) {
  const firstLine = typeof error?.message === 'string' ? error.message.split('\n', 1)[0] : '';
  const result = { reason: contracts.has(firstLine) ? firstLine : 'NATIVE_OPERATION_FAILED' };
  if (codes.has(error?.code)) result.code = error.code;
  for (const frame of String(error?.stack ?? '').split('\n').slice(1)) {
    const match = frame.match(/(?:file:\/\/)?([^\s()]+):(\d+):(\d+)\)?$/);
    if (!match) continue;
    const file = path.relative(root, match[1]);
    if (!file.startsWith('scripts/') || file.includes('..') || !sources.has(path.basename(file))) continue;
    result.source = path.basename(file);
    result.line = Number(match[2]);
    break;
  }
  return sanitizeNativeFailure(result);
}

export function sanitizeNativeFailure(value) {
  const result = { reason: contracts.has(value?.reason) ? value.reason : 'NATIVE_OPERATION_FAILED' };
  if (codes.has(value?.code)) result.code = value.code;
  if (sources.has(value?.source) && Number.isInteger(value?.line) && value.line > 0 && value.line < 100000) {
    result.source = value.source;
    result.line = value.line;
  }
  return result;
}

export function nativePhaseFailure(error, phase, terminal, artifacts, child) {
  return {
    ...classifyNativeFailure(error),
    ...(phases.has(phase) ? { phase } : {}),
    ...(terminal ? { terminal: {
      code: Number.isInteger(terminal.code) && terminal.code >= 0 && terminal.code <= 255 ? terminal.code : null,
      signal: signals.has(terminal.signal) ? terminal.signal : null,
    } } : {}),
    artifacts: Object.fromEntries(['run', 'gate', 'baselineReport'].map(key => [key, artifacts?.[key] === true])),
    ...(child ? { child: sanitizeNativeFailure(child) } : {}),
  };
}

export function readChildFailure(log) {
  for (const line of log.split('\n').reverse()) {
    if (!line.startsWith(nativeFailurePrefix)) continue;
    try { return sanitizeNativeFailure(JSON.parse(line.slice(nativeFailurePrefix.length))); } catch { return undefined; }
  }
}

export function formatNativeFailure(value) {
  const failure = nativePhaseFailure({message: value?.reason, code: value?.code}, value?.phase, value?.terminal, value?.artifacts, value?.child);
  Object.assign(failure, sanitizeNativeFailure(value));
  return JSON.stringify(failure);
}
