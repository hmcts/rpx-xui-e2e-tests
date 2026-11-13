/* Reviewed check methods and finite execution scalars only; never raw diagnostic text. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const overview = require('./harness-public-overview.cjs');
const fail = () => { throw new Error('PUBLIC_ODHIN_CHECK_STEPS_INVALID'); };
const identity = entry => JSON.stringify([entry.file, overview.normalize(entry).titlePath]);
const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) && isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort());
const plain = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value);
const statuses = ['passed','failed','skipped','timedOut'];
let registry;
function methods() {
  if (registry) return registry;
  const bytes = fs.readFileSync(path.join(__dirname,'fixtures/harness-public-check-methods.json'));
  const document = JSON.parse(bytes);
  const expected = new Set(overview.profiles['local-aat'].map(identity)), found = new Map(), ids = new Set();
  if (!keys(document,['schemaVersion','checks']) || document.schemaVersion !== 1 || !Array.isArray(document.checks) || document.checks.length !== expected.size) fail();
  for (const row of document.checks) {
    if (!keys(row,['file','titlePath','purpose','boundary','steps']) || typeof row.file !== 'string' || !Array.isArray(row.titlePath) || !row.titlePath.every(part=>typeof part==='string') || !plain(row.purpose,1600) || !plain(row.boundary,1600) || !Array.isArray(row.steps) || !row.steps.length || row.steps.length > 32) fail();
    const key = identity(row);
    if (!expected.has(key) || found.has(key)) fail();
    for (const step of row.steps) {
      if (!keys(step,['id','label']) || !/^[a-z][a-z0-9-]{0,95}$/.test(step.id ?? '') || !plain(step.label,400) || ids.has(step.id)) fail();
      ids.add(step.id);
    }
    found.set(key,{...row,titlePath:overview.normalize(row).titlePath});
  }
  registry = {digest:'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex'),checks:found};
  return registry;
}
function methodFor(entry) {
  const method = methods().checks.get(identity(entry));
  if (!method) fail();
  return structuredClone(method);
}
function validateCheckSteps(entry, records, status) {
  const method = methodFor(entry), declared = method.steps.map(step=>step.id), seen = new Set();
  if (!Array.isArray(records) || records.length > declared.length || !statuses.includes(status)) fail();
  let previous = -1;
  records.forEach((row,index)=>{
    if (!keys(row,['id','status','durationMs','order']) || !['passed','failed','incomplete'].includes(row.status) || !Number.isSafeInteger(row.order) || row.order !== index+1 || seen.has(row.id)) fail();
    const position = declared.indexOf(row.id);
    if (position <= previous || position < 0) fail();
    if (row.status === 'incomplete' ? row.durationMs !== null : !Number.isFinite(row.durationMs) || row.durationMs < 0 || row.durationMs > Number.MAX_SAFE_INTEGER) fail();
    previous = position; seen.add(row.id);
  });
  if (status === 'passed' && (records.length !== declared.length || records.some(row=>row.status !== 'passed'))) fail();
  return structuredClone(records);
}
function extractCheckSteps(entry, rawSteps, format = 'framework') {
  const method = methodFor(entry), allowed = new Set(method.steps.map(step=>step.id)), result = [];
  if (!['framework','json'].includes(format)) fail();
  if (rawSteps === undefined) return result;
  if (!Array.isArray(rawSteps)) fail();
  let visited = 0;
  function visit(steps,depth) {
    if (depth > 32 || !Array.isArray(steps)) fail();
    for (const step of steps) {
      if (++visited > 20000 || !step || typeof step !== 'object' || Array.isArray(step)) fail();
      // The framework includes hooks/fixtures/automatic expectations. JSON1.65 keeps test.step only.
      if (format === 'framework' && ['hook','fixture'].includes(step.category)) continue;
      const named = typeof step.title === 'string' && step.title.startsWith('harness-check:') && (format === 'json' ? step.category === undefined : step.category === 'test.step');
      if (named) {
        const id = step.title.slice('harness-check:'.length);
        if (!allowed.has(id) || result.some(row=>row.id===id) || !Number.isFinite(step.duration) || step.duration < -1 || step.duration > Number.MAX_SAFE_INTEGER) fail();
        result.push({id,status:step.duration===-1?'incomplete':step.error===undefined?'passed':'failed',durationMs:step.duration===-1?null:step.duration,order:result.length+1});
      }
      if (step.steps !== undefined) visit(step.steps,depth+1);
    }
  }
  visit(rawSteps,0);
  return result;
}
const escape = value => String(value).replace(/[&<>"']/g, char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
function renderInfo(entry, records, status) {
  validateCheckSteps(entry,records,status);
  const method = methodFor(entry), group = overview.groupFor(entry.file), boundary = overview.definitions[group];
  return `<section data-harness-check-info="${escape(identity(entry))}" data-check-boundary="${group}"><h3>What this check covers</h3><p>${escape(method.purpose)}</p><p><strong>${escape(boundary.title)}</strong></p><p>${escape(boundary.boundary)}</p><p>${escape(method.boundary)}</p><p>Check outcome: ${status}. Recorded method stages: ${records.length} of ${method.steps.length}. Supporting diagnostic evidence; no release credit.</p></section>`;
}
function renderSteps(entry, records, status, details) {
  validateCheckSteps(entry,records,status);
  const method = methodFor(entry), byId = new Map(records.map(row=>[row.id,row]));
  return `<section data-harness-check-steps="${escape(identity(entry))}"><h3>Recorded check steps</h3><p>Only reviewed named stages recorded by this execution appear as completed. Automatic expectations and detailed diagnostics remain private. Missing stages are Not recorded; a failed setup does not prove the declared operation ran.</p><table class="table table-sm"><thead><tr><th scope="col">Reviewed operation</th><th scope="col">Observed outcome</th><th scope="col">Recorded duration</th><th scope="col">Execution order</th></tr></thead><tbody>${method.steps.map(step=>{const observed=byId.get(step.id);return `<tr data-declared-step-id="${step.id}"${observed?` data-check-step-id="${step.id}"`:""}><th scope="row">${escape(step.label)}</th><td>${observed?observed.status==='incomplete'?'Started; completion not recorded':observed.status:'Not recorded'}</td><td>${observed&&observed.durationMs!==null?`${observed.durationMs} ms`:'Not recorded'}</td><td>${observed?observed.order:'Not recorded'}</td></tr>`;}).join('')}</tbody></table>${require('./harness-public-check-details.cjs').renderDetails(entry,details,records,status)}</section>`;
}
function methodEvidence(entries, results) {
  return {schemaVersion:1,manifestDigest:methods().digest,checks:entries.map(entry=>{
    const observed=results.get(identity(entry));
    return {file:entry.file,titlePath:overview.normalize(entry).titlePath,status:observed.status,runnerPhase:observed.runnerPhase??'direct',workerIndex:observed.workerIndex??-1,steps:validateCheckSteps(entry,observed.checkSteps,observed.status)};
  })};
}
function validateMethodEvidence(document, entries, counts) {
  if (!keys(document,['schemaVersion','manifestDigest','checks']) || document.schemaVersion!==1 || document.manifestDigest!==methods().digest || !Array.isArray(document.checks) || document.checks.length!==entries.length) fail();
  const actualCounts=Object.fromEntries(statuses.map(status=>[status,0]));
  document.checks.forEach((row,index)=>{
    if (!keys(row,['file','titlePath','status','runnerPhase','workerIndex','steps']) || identity(row)!==identity(entries[index])) fail();
    if(!['direct','offline','aat'].includes(row.runnerPhase)||!Number.isSafeInteger(row.workerIndex)||row.workerIndex < -1)fail();
    validateCheckSteps(entries[index],row.steps,row.status); actualCounts[row.status]++;
  });
  if (!isDeepStrictEqual(actualCounts,counts)) fail();
}
module.exports={methodFor,extractCheckSteps,validateCheckSteps,renderInfo,renderSteps,methodEvidence,validateMethodEvidence};
