import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {digestBytes} from './exui-evidence-io.mjs';
import {APPLICANT_RESULTS_SCOPE,APPLICANT_RESULTS_MUTATIONS} from './exui-applicant-results-contract.mjs';
import {validateApplicantResultTransitionRequest,selectApplicantResultRuntime} from './exui-applicant-results-transition.mjs';
function snapshot(file) {
 const before=fs.lstatSync(file,{bigint:true});assert(before.isFile()&&fs.realpathSync(file)===file,'RESULT_TRANSITION_REQUEST_ALIAS');
 const bytes=fs.readFileSync(file),after=fs.lstatSync(file,{bigint:true});
 const identity=stat=>({dev:stat.dev,ino:stat.ino,size:stat.size,mtime:stat.mtimeNs,ctime:stat.ctimeNs});
 assert.deepEqual(identity(before),identity(after),'RESULT_TRANSITION_REQUEST_CHANGED');return {stamp:{...identity(after),digest:digestBytes(bytes)},value:JSON.parse(bytes)};
}
// Fixed three-step handshake. This watcher never decides whether a proof passes.
export function createApplicantResultWatcher(output,onTransition,state) {
 const accepted=[];let priorInput;
 return async()=>{
  const current=state();
  for(const [index,variant] of APPLICANT_RESULTS_MUTATIONS.entries()){
   const file=path.join(output,`results-transition-${variant}.json`),exists=fs.existsSync(file);
   if(index<accepted.length){assert(exists,'RESULT_TRANSITION_REQUEST_CHANGED');assert.deepEqual(snapshot(file).stamp,accepted[index],'RESULT_TRANSITION_REQUEST_CHANGED');continue;}
   if(!exists)continue;
   assert.equal(index,accepted.length,'RESULT_TRANSITION_OUT_OF_ORDER');
   assert(current.expected&&current.input&&current.handoff,'RESULT_TRANSITION_BEFORE_PREPARATION');
   assert.equal(current.input.releaseScopeId,APPLICANT_RESULTS_SCOPE,'RESULT_TRANSITION_SCOPE');
   assert.equal(typeof onTransition,'function','RESULT_TRANSITION_CALLBACK_REQUIRED');
   assert(!current.isTerminated(),'RESULT_TRANSITION_CHILD_TERMINATED');
   const observed=snapshot(file);validateApplicantResultTransitionRequest(current.input,observed.value,priorInput??current.input);
   const record=await onTransition(observed.value,{...current,priorInput:priorInput??current.input});
   assert(!current.isTerminated(),'RESULT_TRANSITION_CHILD_TERMINATED');
   assert.deepEqual(snapshot(file).stamp,observed.stamp,'RESULT_TRANSITION_REQUEST_CHANGED');
   priorInput=selectApplicantResultRuntime(current.input,variant,record);
   accepted.push(observed.stamp);
  }
 };
}
