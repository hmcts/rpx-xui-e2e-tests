// Reviewed helper expectations and actual named-event scalars only. Never parser inputs or error text.
const {isDeepStrictEqual}=require('node:util');
const crypto=require('node:crypto');
const overview=require('./harness-public-overview.cjs');
const fail=()=>{throw Error('PUBLIC_ODHIN_CHECK_DETAILS_INVALID');};
const identity=entry=>JSON.stringify([entry.file,overview.normalize(entry).titlePath]);
const declaration={file:'src/tests/api/auth-coverage-basic.api.ts',titlePath:['','','auth-coverage-basic.api.ts','Auth helper coverage - basic utilities','extractCsrf parses token and returns undefined when missing'],parentId:'auth-basic-csrf',details:[
 {id:'csrf-present',label:'Parse supplied HTML containing a CSRF input',expected:'The parser returns the test-owned token supplied in the HTML. Token values remain private.'},
 {id:'csrf-absent',label:'Parse supplied HTML without a CSRF input',expected:'The parser returns undefined when the input is absent.'},
]};
const digest='sha256:'+crypto.createHash('sha256').update(JSON.stringify(declaration)).digest('hex');
const keys=(v,n)=>v&&typeof v==='object'&&!Array.isArray(v)&&isDeepStrictEqual(Object.keys(v).sort(),[...n].sort());
const declarationsFor=entry=>identity(entry)===identity(declaration)?structuredClone(declaration.details):[];
function validateCapturedDetails(entry,records,parents){
 const declared=declarationsFor(entry),parent=parents.find(row=>row.id===declaration.parentId);
 if(!Array.isArray(records)||records.length>declared.length)fail();
 records.forEach((row,index)=>{
  if(!keys(row,['id','parentId','status','durationMs','order'])||row.id!==declared[index]?.id||row.parentId!==declaration.parentId||row.order!==index+1||!['passed','failed','skipped','incomplete'].includes(row.status)||!parent)fail();
  if(row.status==='incomplete'?row.durationMs!==null:!Number.isFinite(row.durationMs)||row.durationMs<0||row.durationMs>Number.MAX_SAFE_INTEGER)fail();
  if(parent.status==='passed'&&!['passed','skipped'].includes(row.status)||index>0&&!['passed','skipped'].includes(records[index-1].status))fail();
  // Installed1.65 uses the same worker Date.now endpoints for parent and child,
  // and JSON copies these durations unchanged. Reject clock anomalies; never sum.
  if(parent.status!=='incomplete'&&row.durationMs!==null&&(!Number.isFinite(parent.durationMs)||row.durationMs>parent.durationMs))fail();
 });
 return structuredClone(records);
}
function validateDetails(entry,records,parents,status){
 if(!['passed','failed','skipped','timedOut'].includes(status))fail();
 const safe=validateCapturedDetails(entry,records,parents),declared=declarationsFor(entry);
 if(declared.length&&status==='passed'&&(safe.length!==declared.length||safe.some(row=>row.status!=='passed')))fail();
 return safe;
}
function captureDetails(entry,rawSteps,format,parents){
 if(!['framework','json'].includes(format)||rawSteps!==undefined&&!Array.isArray(rawSteps))fail();
 const records=[];let count=0;
 function visit(steps,parent,depth){
  if(depth>32||!Array.isArray(steps))fail();
  for(const step of steps){
   if(++count>20000||!step||typeof step!=='object'||Array.isArray(step))fail();
   if(format==='framework'&&['hook','fixture'].includes(step.category))continue;
   const named=format==='json'?step.category===undefined:step.category==='test.step';
   let next=null;
   if(named&&typeof step.title==='string'&&step.title.startsWith('harness-check:'))next=step.title.slice(14);
   if(typeof step.title==='string'&&step.title.startsWith('harness-detail:')){
    if(!named||parent!==declaration.parentId||!declarationsFor(entry).length||!Number.isFinite(step.duration)||step.duration< -1||step.duration>Number.MAX_SAFE_INTEGER)fail();
    const skipped=Array.isArray(step.annotations)&&step.annotations.some(annotation=>annotation?.type==='skip');
    records.push({id:step.title.slice(15),parentId:parent,status:step.duration===-1?'incomplete':skipped?'skipped':step.error===undefined?'passed':'failed',durationMs:step.duration===-1?null:step.duration,order:records.length+1});next=null;
   }
   if(step.steps!==undefined)visit(step.steps,next,depth+1);
  }
 }
 visit(rawSteps??[],null,0);return validateCapturedDetails(entry,records,parents);
}
function extractDetails(entry,rawSteps,format,parents,status){return validateDetails(entry,captureDetails(entry,rawSteps,format,parents),parents,status);}
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderDetails(entry,records,parents,status){
 const declared=declarationsFor(entry);if(!declared.length)return '';
 if(records!==undefined)validateDetails(entry,records,parents,status);
 return `<section data-harness-check-details="${escape(identity(entry))}"><h4>Helper assertion details</h4><p>Source-defined expected assertions are separate from actual named-event outcomes. These checks use test-owned HTML; no application, browser journey, CCD or live authentication is exercised. Historical individual outcomes and durations are Not recorded.</p><table class="table table-sm"><thead><tr><th scope="col">Reviewed operation</th><th scope="col">Source-defined expected assertion</th><th scope="col">Recorded outcome</th><th scope="col">Recorded duration</th><th scope="col">Order within parent stage</th></tr></thead><tbody>${declared.map((row,index)=>{const observed=records?.[index];return `<tr data-declared-detail-id="${row.id}"${observed?` data-check-detail-id="${row.id}"`:''}><th scope="row">${escape(row.label)}</th><td>${escape(row.expected)}</td><td>${observed?observed.status==='incomplete'?'Started; completion not recorded':observed.status:'Not recorded'}</td><td>${observed?.durationMs!==undefined&&observed.durationMs!==null?`${observed.durationMs} ms`:'Not recorded'}</td><td>${observed?observed.order:'Not recorded'}</td></tr>`;}).join('')}</tbody></table></section>`;
}
function detailEvidence(entries,results){return{schemaVersion:1,registryDigest:digest,checks:entries.filter(entry=>declarationsFor(entry).length).map(entry=>{const observed=results.get(identity(entry));return{file:entry.file,titlePath:overview.normalize(entry).titlePath,details:validateDetails(entry,observed.checkDetails,observed.checkSteps,observed.status)};})};}
function validateEvidence(document,entries,methods){
 if(!keys(document,['schemaVersion','registryDigest','checks'])||document.schemaVersion!==1||document.registryDigest!==digest||!Array.isArray(document.checks))fail();
 const expected=entries.filter(entry=>declarationsFor(entry).length);if(document.checks.length!==expected.length)fail();
 document.checks.forEach((row,index)=>{if(!keys(row,['file','titlePath','details'])||identity(row)!==identity(expected[index]))fail();const parent=methods.checks.find(check=>identity(check)===identity(row));if(!parent)fail();validateDetails(expected[index],row.details,parent.steps,parent.status);});
}
const recordsFor=(document,entry)=>document?.checks.find(row=>identity(row)===identity(entry))?.details;
module.exports={declarationsFor,captureDetails,extractDetails,validateCapturedDetails,validateDetails,renderDetails,detailEvidence,validateEvidence,recordsFor,registryDigest:()=>digest};
