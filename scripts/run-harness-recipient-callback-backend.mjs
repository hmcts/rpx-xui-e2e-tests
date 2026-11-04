#!/usr/bin/env node
import assert from 'node:assert/strict';
import {callbackFailureCode,parseCallbackWorkerTerminal} from './lib/exui-recipient-callback-diagnostics.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {startCcdRuntime,verifyCcdContainerIdentity,ccdCredentials,docker} from './lib/exui-ccd-runtime.mjs';
import {cleanupCiCcd} from './lib/exui-candidate-ci-process.mjs';
import {prepareRecipientCallbackImport,importRecipientCallback} from './lib/exui-recipient-callback-import.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export const callbackProbeFiles=Object.freeze([
 'scripts/lib/exui-ccd-browser-runtime.mjs','scripts/lib/exui-ccd-role-transition.mjs',
 'scripts/lib/exui-ccd-event-capability.mjs','scripts/lib/exui-native-sources.mjs',
 'scripts/lib/exui-source-shape-contract.mjs',
 'scripts/lib/exui-recipient-callback.mjs','scripts/lib/exui-recipient-callback-fixture.mjs',
 'scripts/lib/exui-recipient-callback-diagnostics.mjs',
 'scripts/lib/exui-recipient-callback-auth.mjs','scripts/lib/exui-recipient-callback-backend.mjs',
 'scripts/fixtures/ccd/event-capability.source.json',
 'scripts/recipient-callback-backend-worker.mjs',
]);
export function stageCallbackProbe(destination,sourceRoot=root){
 fs.mkdirSync(destination,{mode:0o700});const seals={};
 for(const name of callbackProbeFiles){
  const source=path.join(sourceRoot,name);assert.equal(fs.realpathSync(source),source,'CALLBACK_PROBE_SOURCE_ALIAS');assert(fs.lstatSync(source).isFile(),'CALLBACK_PROBE_SOURCE_TYPE');
  const target=path.join(destination,name);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});const bytes=fs.readFileSync(source);fs.writeFileSync(target,bytes,{flag:'wx',mode:0o600});seals[name]='sha256:'+createHash('sha256').update(bytes).digest('hex');
 }
 fs.writeFileSync(path.join(destination,'source-seals.json'),JSON.stringify(seals,null,2)+'\n',{flag:'wx',mode:0o600});return seals;
}
export async function runRecipientCallbackProbe({output,mode='normalize',platform='linux/arm64'}){
 assert(path.isAbsolute(output)&&['normalize','reject'].includes(mode),'CALLBACK_PROBE_ARGUMENTS');
 assert(!fs.existsSync(output),'CALLBACK_PROBE_FRESH_OUTPUT_REQUIRED');fs.mkdirSync(output,{mode:0o700});output=fs.realpathSync(output);
 const runtimePath=path.join(output,'runtime');let phase='prepare-fixture',cancelled=false,child,state,terminal;
 const cancel=()=>{cancelled=true;child?.kill('SIGTERM');};process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
 const receipt={schemaVersion:1,mode,status:'in-progress',runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false};
 const save=()=>fs.writeFileSync(path.join(output,'probe.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});save();
 try{
  const fixtures=path.join(output,'fixture');await prepareRecipientCallbackImport(fixtures);
  phase='start-runtime';state=await startCcdRuntime(runtimePath,{fixtureSelection:'event-capability-baseline',platform,isCancelled:()=>cancelled});assert(!cancelled,'CALLBACK_PROBE_CANCELLED');
  phase='import-callback';receipt.import=await importRecipientCallback(state,{fixtureDirectory:fixtures});save();
  phase='create-actors';const credentials=Object.fromEntries(['allowed','courtadmin','observer'].map(actor=>[actor,ccdCredentials(state,actor)]));
  phase='stage-worker';const staged=path.join(output,'sources');receipt.sourceSeals=stageCallbackProbe(staged);save();
  verifyCcdContainerIdentity(state);docker(['cp',staged+'/.',state.containers.client+':/tmp/recipient-probe']);
  verifyCcdContainerIdentity(state);assert(!cancelled,'CALLBACK_PROBE_CANCELLED');
  phase='execute-worker';terminal=new Promise((resolve,reject)=>{
   child=spawn('docker',['exec','-i',state.containers.client,'node','/tmp/recipient-probe/scripts/recipient-callback-backend-worker.mjs'],{stdio:['pipe','pipe','pipe']});
   let text='',stderr='',tooLarge=false;child.stdout.on('data',bytes=>{if(text.length+bytes.length>65536){tooLarge=true;child.kill('SIGTERM');}else text+=bytes.toString();});child.stderr.on('data',bytes=>{if(Buffer.byteLength(stderr)+bytes.length<=65536)stderr+=bytes.toString();else{tooLarge=true;child.kill('SIGTERM');}});
   child.once('error',()=>reject(Error('CALLBACK_PROBE_EXEC_START_FAILED')));child.once('close',code=>resolve({code,text,stderr,tooLarge}));
   child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({mode,credentials}));
  });
  const result=await Promise.race([terminal,new Promise((_,reject)=>{const timer=setTimeout(()=>{child.kill('SIGTERM');reject(Error('CALLBACK_PROBE_EXEC_TIMEOUT'));},120000);timer.unref();terminal.finally(()=>clearTimeout(timer)).catch(()=>{});})]);
  assert(!cancelled,'CALLBACK_PROBE_CANCELLED');
  const worker=parseCallbackWorkerTerminal(result);
  if(worker.status==='failed') { receipt.workerFailure={code:worker.code,phase:worker.phase};save();throw Error(worker.code); }
  // Terminal failure is retained before optional observation collection can mask it.
  try { verifyCcdContainerIdentity(state);docker(['cp',state.containers.client+':/tmp/recipient-output',path.join(output,'observations')]); }
  catch { throw Error('CALLBACK_PROBE_OBSERVATIONS_COPY_FAILED'); }
  receipt.result=worker.result;receipt.status='backend-feasibility-observed';save();
 }catch(error){receipt.status=cancelled?'cancelled':'failed';receipt.phase=phase;receipt.failure=callbackFailureCode(error);save();}
 finally{
  // Recovery uses independently retained fixed names/CIDs, including partial startup.
  try{receipt.cleanup=cleanupCiCcd(runtimePath);if(state)assert.equal(receipt.cleanup?.cleanupComplete,true,'CALLBACK_PROBE_CLEANUP_REQUIRED');}
  catch{receipt.cleanup={cleanupComplete:false};receipt.status='cleanup-uncertain';}
  if(terminal){const ended=await Promise.race([terminal.then(()=>true,()=>true),new Promise(resolve=>{setTimeout(()=>resolve(false),10000);})]);if(!ended){receipt.execTerminal=false;receipt.status='cleanup-uncertain';}else receipt.execTerminal=true;}
  process.off('SIGINT',cancel);process.off('SIGTERM',cancel);save();
 }
 return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);try{assert(args.length===4&&args[0]==='--output'&&args[2]==='--mode','CALLBACK_PROBE_USAGE');const result=await runRecipientCallbackProbe({output:args[1],mode:args[3]});console.log(JSON.stringify({status:result.status,cleanupComplete:result.cleanup?.cleanupComplete===true}));if(result.status!=='backend-feasibility-observed')process.exitCode=2;}catch{console.error('Callback backend probe rejected.');process.exitCode=2;}
}
