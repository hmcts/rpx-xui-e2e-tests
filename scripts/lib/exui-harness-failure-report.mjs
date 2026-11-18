import fs from 'node:fs';
import path from 'node:path';
import { sanitizeNativeFailure } from './exui-native-failure-diagnostics.mjs';

const files = ['failure.json', 'index.html'];
const phases = ['preparation', 'native', 'mandatoryEmail', 'reporting', 'diagnostics', 'unknown'];
const nativePhases = ['family', 'scope', 'ccd', 'eventCapability', 'routing', 'recipientCallback', 'selectorEventRow'];
const labels = { preparation: 'Preparation', native: 'Native assurance run', mandatoryEmail: 'Mandatory email checks', reporting: 'Report publication', diagnostics: 'Diagnostic checks', unknown: 'Unknown stage', family: 'Service family', scope: 'Organisation scope', ccd: 'CCD runtime', eventCapability: 'Event capability', routing: 'Routing', recipientCallback: 'Recipient callback', selectorEventRow: 'Selector event row' };
function requireValid(condition) {
  if (!condition) throw new Error('HARNESS_FAILURE_REPORT_INVALID');
}
function object(value, allowed, required = allowed) {
  requireValid(value !== null && typeof value === 'object' && !Array.isArray(value));
  requireValid(Object.keys(value).every(key => allowed.includes(key)) && required.every(key => Object.hasOwn(value, key)));
}
function failure(value) {
  object(value, ['reason', 'code', 'source', 'line'], ['reason']);
  const safe = sanitizeNativeFailure(value);
  requireValid(Object.keys(value).length === Object.keys(safe).length && Object.keys(value).every(key => value[key] === safe[key]));
}
function validate(value) {
  object(value, ['schemaVersion', 'status', 'releaseApproval', 'commit', 'buildNumber', 'primary', 'reportedPhases', 'reportingFailure'], ['schemaVersion', 'status', 'releaseApproval', 'primary', 'reportedPhases']);
  requireValid(value.schemaVersion === 1 && value.status === 'BLOCKED' && value.releaseApproval === false);
  if (Object.hasOwn(value, 'commit')) requireValid(typeof value.commit === 'string' && /^[a-f0-9]{40}$/i.test(value.commit));
  if (Object.hasOwn(value, 'buildNumber')) requireValid(typeof value.buildNumber === 'string' && /^[1-9][0-9]{0,19}$/.test(value.buildNumber));
  object(value.primary, ['phase', 'failure', 'child', 'cleanup'], ['phase', 'failure', 'cleanup']);
  requireValid(phases.includes(value.primary.phase) && ['complete', 'incomplete', 'unknown'].includes(value.primary.cleanup));
  failure(value.primary.failure);
  if (Object.hasOwn(value.primary, 'child')) failure(value.primary.child);
  if (Object.hasOwn(value, 'reportingFailure')) failure(value.reportingFailure);
  requireValid(Array.isArray(value.reportedPhases) && value.reportedPhases.length <= nativePhases.length);
  const seen = new Set();
  for (const row of value.reportedPhases) {
    object(row, ['phase', 'status']);
    requireValid(nativePhases.includes(row.phase) && !seen.has(row.phase) && ['PASS', 'FAIL', 'BLOCKED'].includes(row.status));
    seen.add(row.phase);
  }
  return value;
}
function assertDirectory(directory, allowMissing = false) {
  const absolute = path.resolve(directory);
  for (let current = absolute; ; current = path.dirname(current)) {
    if (fs.existsSync(current) || fs.lstatSync(current, { throwIfNoEntry: false })) {
      const stat = fs.lstatSync(current);
      requireValid(stat.isDirectory() && !stat.isSymbolicLink());
    } else requireValid(allowMissing);
    if (path.dirname(current) === current) break;
  }
  if (fs.existsSync(absolute)) {
    for (const name of fs.readdirSync(absolute)) {
      requireValid(files.includes(name));
      const stat = fs.lstatSync(path.join(absolute, name));
      requireValid(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
    }
  }
  return absolute;
}
const json = value => `${JSON.stringify(value, null, 2)}\n`;
function explanation(value) {
  const imagePull = value.reason.match(/^NATIVE_(API|BROWSER|BROWSERDONOR|DATA|DEFINITION|PROFILE|S2S|IDAM|DATABASE|CLIENT)_NATIVE_PINNED_IMAGE_PULL_FAILED_(NETWORK_DNS|NETWORK_TLS|NETWORK_CONNECTION|NETWORK_PROXY|NETWORK|RATE_LIMIT|ACCESS_DENIED|MANIFEST_UNAVAILABLE|TIMEOUT|UNKNOWN)$/);
  if (imagePull) {
    const causes = { NETWORK_DNS: 'name resolution failed', NETWORK_TLS: 'the secure connection failed', NETWORK_CONNECTION: 'the network connection failed', NETWORK_PROXY: 'the proxy connection failed', NETWORK: 'a network error was reported', RATE_LIMIT: 'the registry reported a rate limit', ACCESS_DENIED: 'the registry denied access', MANIFEST_UNAVAILABLE: 'the requested image manifest was unavailable', TIMEOUT: 'the pull timed out', UNKNOWN: 'the private output did not match a known cause' };
    return `The pinned ${imagePull[1]} container image could not be pulled: ${causes[imagePull[2]]}. This is a classified startup failure, not a product assertion result.`;
  }
  return {
    HARNESS_REPORT_PUBLICATION_FAILED: 'The Harness report publication did not complete successfully; ask the job owner to check the publication stage.',
    HARNESS_ODHIN_REPORT_UNAVAILABLE: 'The Odhín report was unavailable or failed validation.',
    HARNESS_DIAGNOSTIC_FALLBACK_FAILED: 'The diagnostic fallback failed after an earlier Harness failure.',
    HARNESS_NATIVE_PREPARATION_FAILED: 'Preparation did not complete successfully; the failed command needs investigation in private logs.',
    MANDATORY_EMAIL_CHILD_ENVIRONMENT_KEYS: 'The mandatory email child process environment did not contain exactly the required configuration keys.',
    MANDATORY_EMAIL_CHILD_ENVIRONMENT: 'The mandatory email child process configuration was missing, empty, or different from its recorded invocation.',
    MANDATORY_EMAIL_CHILD_IDAM_PROFILE: 'The mandatory email child process identity profile path or digest had an invalid format.',
    MANDATORY_EMAIL_COHORT_CHILD_NOT_CLOSED: 'A mandatory email cohort child process did not reach the required successful termination state.',
    MANDATORY_EMAIL_CONTROLLER_NOT_CLOSED_SUCCESSFULLY: 'The mandatory email controller did not reach the required successful termination state.',
    MANDATORY_EMAIL_FAILURE_RECOVERY_DRIFT: 'The mandatory email cleanup recovery record differed from the runtime resources recorded for this invocation.',
    MANDATORY_EMAIL_COHORT_FAILED: 'The mandatory email cohort failed; its private logs are needed to identify the underlying cause.',
    MANDATORY_EMAIL_BOUND_COHORT_FAILED: 'The mandatory email cohort invocation failed; its private logs are needed to identify the underlying cause.',
    MANDATORY_EMAIL_BOUND_INVOCATION_FAILED: 'The mandatory email invocation failed; its private logs are needed to identify the underlying cause.',
    IDAM_PROFILE_DIGEST_MISMATCH: 'The identity profile file contents did not match the expected digest.',
    IDAM_PROFILE_PRIVATE_FILE_REQUIRED: 'The identity profile did not meet the required private file, ownership, path, or permission checks.',
    IDAM_PROFILE_INVALID: 'The identity profile did not match the required pinned simulator image configuration.',
  }[value.reason] ?? 'The controller reported an operation failure. The private logs are needed to identify the failing command and its underlying cause.';
}
const describe = value => `${value.reason}${value.code ? ` (${value.code})` : ''}${value.source ? ` — ${value.source}:${value.line}` : ''}`;
function render(value) {
  const cause = value.primary.child ?? value.primary.failure;
  const cleanup = { complete: 'The controller reported cleanup complete; this report does not independently verify it.', incomplete: 'Cleanup was reported incomplete. Ask the job owner to check remaining resources.', unknown: 'Cleanup completion was not established. Ask the job owner to check remaining resources.' }[value.primary.cleanup];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'"><title>Harness failure investigation</title></head>
<body><main><h1>Harness failure investigation</h1><p><strong>BLOCKED — no release approval or assurance credit.</strong></p>
<p>This report records a failed Harness invocation. It does not prove product behaviour, successful cleanup, or completed assurance checks.</p>
<h2>Build identity</h2><dl><dt>Commit</dt><dd>${value.commit ?? 'Not recorded'}</dd><dt>Build number</dt><dd>${value.buildNumber ?? 'Not recorded'}</dd></dl>
<h2>Primary failure</h2><p>Stage: ${labels[value.primary.phase]}.</p><p>${explanation(cause)}</p><p>Cause classification: ${describe(cause)}.</p>${value.primary.child ? `<p>Wrapper classification: ${describe(value.primary.failure)}.</p><p>${explanation(value.primary.failure)}</p>` : ''}
<p>Only an allowlisted classification and owned source location are shown. The classification alone does not establish the underlying root cause.</p>
<h2>Cleanup confidence</h2><p>${cleanup}</p>
<h2>Reported native phases — unverified</h2><p>These are controller-reported statuses, not independently validated evidence. Even PASS adds no assurance credit in this failure report.</p>
${value.reportedPhases.length ? `<table><thead><tr><th scope="col">Phase</th><th scope="col">Reported status (unverified)</th></tr></thead><tbody>${value.reportedPhases.map(row => `<tr><th scope="row">${labels[row.phase]}</th><td>${row.status}</td></tr>`).join('')}</tbody></table>` : '<p>No native phase status was recorded.</p>'}
<h2>Secondary reporting failure</h2><p>${value.reportingFailure ? `${explanation(value.reportingFailure)} Classification: ${describe(value.reportingFailure)}. This secondary failure does not replace the primary failure.` : 'No separate reporting failure was recorded.'}</p>
<h2>Next action</h2><p>Ask the job owner for the private logs to investigate the primary failure and confirm cleanup. Private logs are not included in this report.</p>
</main></body></html>
`;
}

export function resetFailureReport(directory) {
  const absolute = assertDirectory(directory, true);
  if (fs.existsSync(absolute)) for (const name of files) fs.rmSync(path.join(absolute, name), { force: true });
}

export function writeFailureReport(directory, input) {
  const value = validate({
    schemaVersion: 1, status: 'BLOCKED', releaseApproval: false,
    ...(input.commit !== undefined ? { commit: input.commit } : {}),
    ...(input.buildNumber !== undefined ? { buildNumber: input.buildNumber } : {}),
    primary: { phase: input.primary?.phase, failure: sanitizeNativeFailure(input.primary?.failure), ...(input.primary?.child ? { child: sanitizeNativeFailure(input.primary.child) } : {}), cleanup: input.primary?.cleanup },
    reportedPhases: (input.reportedPhases ?? []).map(row => ({ phase: row.phase, status: row.status })),
    ...(input.reportingFailure ? { reportingFailure: sanitizeNativeFailure(input.reportingFailure) } : {}),
  });
  resetFailureReport(directory);
  fs.mkdirSync(directory, { recursive: true });
  try {
    fs.writeFileSync(path.join(directory, 'failure.json'), json(value), { flag: 'wx' });
    fs.writeFileSync(path.join(directory, 'index.html'), render(value), { flag: 'wx' });
    return validateFailureReport(directory);
  } catch (error) {
    resetFailureReport(directory);
    throw error;
  }
}

export function validateFailureReport(directory) {
  const absolute = assertDirectory(directory);
  requireValid(fs.readdirSync(absolute).length === files.length);
  for (const name of files) requireValid(fs.statSync(path.join(absolute, name)).size <= 32_000);
  const source = fs.readFileSync(path.join(absolute, 'failure.json'), 'utf8');
  const value = validate(JSON.parse(source));
  requireValid(source === json(value) && fs.readFileSync(path.join(absolute, 'index.html'), 'utf8') === render(value));
  return value;
}
