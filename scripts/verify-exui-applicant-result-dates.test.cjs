const {test}=require('node:test');const assert=require('node:assert/strict');
const load=()=>import('./lib/exui-applicant-result-dates.mjs');
const state={owner:'harness-results',namespace:'1'.repeat(64),images:{data:{id:'sha256:'+'2'.repeat(64)},definition:{id:'sha256:'+'3'.repeat(64)}}};
const options={workbookDigest:'sha256:'+'4'.repeat(64)};
test('result dates: read-only owned exact-version witness binds both source rows and dependencies',async()=>{
 const {readApplicantResultDates,expectedApplicantResultDates,assertApplicantResultDates}=await load();
 for(const variant of ['baseline','applicant-binding','applicant-label','applicant-order']){
  let checked=0,queries=0;
  const record=readApplicantResultDates(state,3,{...options,variant,inspect:s=>{assert.equal(s,state);checked++;},runDocker:(args,sql)=>{
   queries++;assert.deepEqual(args,['exec','-i',state.namespace,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','ccd_definition']);assert(sql.startsWith('BEGIN READ ONLY;'));assert(sql.includes('ct.version=3'));assert(sql.includes('pg_typeof(r.live_from)'));assert(!sql.includes('MAX('));return JSON.stringify(expectedApplicantResultDates(3,variant));
  }});
  assert.equal(queries,1);assert.equal(checked,2);assert.equal(record.activationClaim,false);assert.equal(record.sourceRows.length,2);assertApplicantResultDates(record,state,3,{...options,variant});
 }
});
test('result dates: old or changed valid date and stale source/version/image cannot satisfy retention',async()=>{
 const {expectedApplicantResultDates,applicantResultDateRecord,assertApplicantResultDates,readApplicantResultDates}=await load();
 const canonical=expectedApplicantResultDates(3);
 for(const mutate of [r=>{r[0].live_from='2020-07-01';},r=>{r[0].live_from='2022-07-01';},r=>{r[0].sql_type='text';},r=>{r[0].version=2;},r=>{r[0].field='respondentName';},r=>{r.pop();},r=>{r.push(r[0]);},r=>{r[0].path='nested';},r=>{r[0].unscoped_role=false;}]){
  const rows=structuredClone(canonical);mutate(rows);assert.throws(()=>applicantResultDateRecord(rows,state,3,options),/ROWS_MISMATCH/);
 }
 const record=applicantResultDateRecord(canonical,state,3,options);record.dependencyImages.data='sha256:'+'5'.repeat(64);assert.throws(()=>assertApplicantResultDates(record,state,3,options),/BINDING_MISMATCH/);
 let contacted=false;assert.throws(()=>readApplicantResultDates(state,'3;DELETE',{...options,inspect:()=>{contacted=true;}}),/VERSION_REQUIRED/);assert.equal(contacted,false);
});
