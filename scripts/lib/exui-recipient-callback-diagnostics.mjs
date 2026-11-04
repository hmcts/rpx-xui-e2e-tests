const known = new Set(["CALLBACK_PAGE_FIELD_ORDER_SCHEMA", "CALLBACK_PAGE_FIELD_ID_DUPLICATE", "CALLBACK_PAGE_FIELD_ORDER_DUPLICATE", "CALLBACK_PROBE_STAGED_FILES_INVALID", "CALLBACK_PROBE_MODULE_MISSING", "CALLBACK_PROBE_INPUT_INVALID", "CALLBACK_PROBE_STARTUP_SYNTAX", "CALLBACK_PROBE_STARTUP_PERMISSION", "CALLBACK_PROBE_TERMINAL_INVALID", "CALLBACK_PROBE_OBSERVATIONS_COPY_FAILED", "CALLBACK_EVENTS_SCHEMA", "CALLBACK_EXTRA_PAGE_ENDPOINT", "CALLBACK_IMPORTED_CASE_TYPE", "CALLBACK_IMPORTED_VERSION", "CALLBACK_IMPORT_DIRECTORY_REQUIRED", "CALLBACK_IMPORT_READBACK_FAILED", "CALLBACK_IMPORT_REJECTED", "CALLBACK_IMPORT_ROLE_FAILED", "CALLBACK_IMPORT_SEAL_MISMATCH", "CALLBACK_PAGE_CASE_TYPE", "CALLBACK_PAGE_EVENT", "CALLBACK_PAGE_FIELD_REQUIRED", "CALLBACK_PAGE_REQUIRED", "CALLBACK_PAGE_SCHEMA", "CALLBACK_PAGE_URL", "CALLBACK_PROBE_ACTOR_ISOLATION", "CALLBACK_PROBE_ARGUMENTS", "CALLBACK_PROBE_BUSINESS_MESSAGE", "CALLBACK_PROBE_BUSINESS_STATUS", "CALLBACK_PROBE_CANCELLED", "CALLBACK_PROBE_CASE_ID", "CALLBACK_PROBE_CLEANUP_REQUIRED", "CALLBACK_PROBE_CREATE", "CALLBACK_PROBE_CREATE_TOKEN", "CALLBACK_PROBE_EVENT_TOKEN", "CALLBACK_PROBE_EVENT_TOKEN_SCHEMA", "CALLBACK_PROBE_EXEC_START_FAILED", "CALLBACK_PROBE_EXEC_TIMEOUT", "CALLBACK_PROBE_FRESH_OUTPUT_REQUIRED", "CALLBACK_PROBE_HISTORY", "CALLBACK_PROBE_JOURNAL_BINDING", "CALLBACK_PROBE_MODE", "CALLBACK_PROBE_NORMALIZED_DATA", "CALLBACK_PROBE_NO_BUSINESS_ERROR", "CALLBACK_PROBE_NO_CALLBACK", "CALLBACK_PROBE_NO_NORMALIZATION", "CALLBACK_PROBE_PERSISTED_NORMALIZATION", "CALLBACK_PROBE_SOURCE_ALIAS", "CALLBACK_PROBE_SOURCE_TYPE", "CALLBACK_PROBE_SUBMIT", "CALLBACK_PROBE_TOKEN_SCHEMA", "CALLBACK_PROBE_USAGE", "CALLBACK_PROBE_VALIDATE", "CALLBACK_PROBE_VALIDATION_PERSISTED", "CALLBACK_PROBE_VALIDATION_SCHEMA", "CALLBACK_PROBE_VERSION", "CALLBACK_PROBE_WORKER_FAILED", "CALLBACK_PROBE_WORKER_RESULT", "CALLBACK_UNEXPECTED_EVENT_STAGE", "CALLBACK_WORKBOOK_FAILED"]);
export function callbackFailureCode(error) {
  const first = typeof error?.message === "string" ? error.message.split("\n", 1)[0] : "";
  return known.has(first) ? first : "CALLBACK_PROBE_UNCLASSIFIED_FAILURE";
}

// Raw stderr is bounded in memory by the caller and never retained or returned.
export function callbackStartupCode(stderr) {
 if (/ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND/.test(stderr)) return 'CALLBACK_PROBE_MODULE_MISSING';
 if (/SyntaxError:/.test(stderr)) return 'CALLBACK_PROBE_STARTUP_SYNTAX';
 if (/EACCES|permission denied/i.test(stderr)) return 'CALLBACK_PROBE_STARTUP_PERMISSION';
 return 'CALLBACK_PROBE_TERMINAL_INVALID';
}
export function callbackMissingModuleIdentity(stderr, files = []) {
 // Match only Node's quoted missing-module operand, then exact approved paths.
 const match = /Cannot find (?:module|package) ['"]([^'"\r\n]+)['"]/.exec(stderr);
 if (!match) return undefined;
 return files.find(name => match[1] === '/tmp/recipient-probe/' + name || match[1] === 'file:///tmp/recipient-probe/' + name);
}
export function parseCallbackWorkerTerminal(result, files = []) {
 if (result.tooLarge) throw Error('CALLBACK_PROBE_TERMINAL_INVALID');
 let worker;try { worker=JSON.parse(result.text); } catch { const error=Error(callbackStartupCode(result.stderr || ''));const identity=callbackMissingModuleIdentity(result.stderr || '',files);if(identity)error.moduleIdentity=identity;throw error; }
 if (!worker || !['failed','completed'].includes(worker.status)) throw Error('CALLBACK_PROBE_TERMINAL_INVALID');
 if (worker.status==='failed') return {status:'failed',code:callbackFailureCode({message:worker.code}),phase:['verify-source','load-modules','read-input','start-gateway','backend-flow'].includes(worker.phase)?worker.phase:'unknown'};
 if (result.code!==0) throw Error('CALLBACK_PROBE_WORKER_FAILED');
 return worker;
}
