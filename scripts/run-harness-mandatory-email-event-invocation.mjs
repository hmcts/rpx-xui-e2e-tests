import {readMandatoryEmailRunContext} from './lib/exui-mandatory-email-event-contract.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mandatoryEmailFile,mandatoryEmailDigest,mandatoryEmailProducer,mandatoryEmailChildCommand} from './lib/exui-mandatory-email-event-invocation-binding.mjs';
import {runCallbackUi} from './run-harness-recipient-callback-ui.mjs';
import {writeJsonAtomic} from './lib/exui-evidence-io.mjs';

// The one owned child channel authenticates these finite barriers. No env/file polling fallback.
export async function mandatoryEmailParentAck(kind,packet,{channel=process,signal,timeoutMs=30_000}={}){
  assert(['mandatory-email-creation','mandatory-email-prepared'].includes(kind),'MANDATORY_EMAIL_IPC_KIND');
  assert(typeof channel.send==='function'&&channel.connected,'MANDATORY_EMAIL_IPC_REQUIRED');
  assert(!signal?.aborted,'MANDATORY_EMAIL_CHILD_CANCELLED');
  // process.send uses JSON here; bind the exact encoded packet, including the
  // same omission of optional undefined metadata as input.json on disk.
  const wire=JSON.stringify(structuredClone(packet));assert(typeof wire==='string'&&Buffer.byteLength(wire)<=4*1024*1024,'MANDATORY_EMAIL_IPC_PACKET_SIZE');
  const snapshot=JSON.parse(wire),digest=mandatoryEmailDigest(snapshot);
  let timer,onMessage,onDisconnect,onAbort;
  try{
    const acknowledgement=new Promise((resolve,reject)=>{
      onMessage=value=>{try{assert.deepEqual(value,{kind:kind+'-ack',digest},'MANDATORY_EMAIL_ACK_MISMATCH');resolve();}catch(error){reject(error);}};
      onDisconnect=()=>reject(Error('MANDATORY_EMAIL_PARENT_DISCONNECTED'));
      onAbort=()=>reject(Error('MANDATORY_EMAIL_CHILD_CANCELLED'));
      channel.on('message',onMessage);channel.once('disconnect',onDisconnect);signal?.addEventListener('abort',onAbort,{once:true});
      timer=setTimeout(()=>reject(Error('MANDATORY_EMAIL_PARENT_ACK_TIMEOUT')),timeoutMs);
      if(signal?.aborted)onAbort();
    });
    const sent=new Promise((resolve,reject)=>channel.send({kind,packet:snapshot},error=>error?reject(Error('MANDATORY_EMAIL_IPC_SEND_FAILED')):resolve()));
    await Promise.all([sent,acknowledgement]);
  }finally{clearTimeout(timer);channel.removeListener('message',onMessage);channel.removeListener('disconnect',onDisconnect);signal?.removeEventListener('abort',onAbort);}
}
export async function runMandatoryEmailInvocation(expectedFile,digest){
  mandatoryEmailChildCommand(expectedFile,digest);
  const request=mandatoryEmailFile(path.dirname(expectedFile),path.basename(expectedFile));assert.equal(request.digest,digest,'MANDATORY_EMAIL_CHILD_EXPECTED_DIGEST');
  const expected=JSON.parse(request.bytes),{cohort,variant,directory}=expected;
  assert.deepEqual(Object.keys(expected).sort(),['schemaVersion','cohort','variant','directory','environment'].sort(),'MANDATORY_EMAIL_CHILD_REQUEST_SCHEMA');assert.equal(expected.schemaVersion,1,'MANDATORY_EMAIL_CHILD_REQUEST_VERSION');
  assert.deepEqual(Object.keys(expected.environment).sort(),['HOME','PATH','TMPDIR'],'MANDATORY_EMAIL_CHILD_ENVIRONMENT_KEYS');
  assert(['baseline','name-optional','address-optional'].includes(variant),'MANDATORY_EMAIL_CHILD_VARIANT');
  assert.equal(path.basename(expectedFile),variant+'-expected.json','MANDATORY_EMAIL_CHILD_FILE');assert.equal(directory,path.join(path.dirname(expectedFile),variant),'MANDATORY_EMAIL_CHILD_DIRECTORY');
  readMandatoryEmailRunContext(cohort);
  assert.deepEqual(mandatoryEmailProducer(),cohort.producer,'MANDATORY_EMAIL_CHILD_SOURCE');
  for(const key of ['HOME','PATH','TMPDIR'])assert.equal(process.env[key],expected.environment[key],'MANDATORY_EMAIL_CHILD_ENVIRONMENT');
  const cancellation=new AbortController(),cancel=()=>{if(!cancellation.signal.aborted)cancellation.abort();};process.on('SIGINT',cancel);process.on('SIGTERM',cancel);
  try{
    const receipt=await runCallbackUi({candidate:cohort.candidateManifest,browser:cohort.browser.root,output:directory,variant,scenario:'mandatory-email-event',signal:cancellation.signal,mandatoryLifecycle:{
      creationStarted:packet=>{readMandatoryEmailRunContext(cohort);return mandatoryEmailParentAck('mandatory-email-creation',packet,{signal:cancellation.signal});},
      prepared:packet=>{readMandatoryEmailRunContext(cohort);return mandatoryEmailParentAck('mandatory-email-prepared',packet,{signal:cancellation.signal});},
    }});
    assert(!cancellation.signal.aborted,'MANDATORY_EMAIL_CHILD_CANCELLED');
    assert.equal(receipt.status,variant==='baseline'?'mandatory-email-event-feasibility-observed':'mandatory-email-optional-fault-detected','MANDATORY_EMAIL_CHILD_PROOF');
    assert.deepEqual([receipt.nativeCleanupComplete,receipt.cleanup?.cleanupComplete,receipt.workspaceCleanupComplete],[true,true,true],'MANDATORY_EMAIL_CHILD_CLEANUP');
    assert.equal(mandatoryEmailFile(path.dirname(expectedFile),path.basename(expectedFile)).digest,digest,'MANDATORY_EMAIL_CHILD_EXPECTED_DRIFT');
    assert.deepEqual(mandatoryEmailProducer(),cohort.producer,'MANDATORY_EMAIL_CHILD_SOURCE_DRIFT');
    readMandatoryEmailRunContext(cohort);
    writeJsonAtomic(path.join(directory,'mandatory-email-child-completion.json'),{schemaVersion:1,kind:'mandatory-email-child-completion',variant,expectedDigest:digest,receiptDigest:mandatoryEmailFile(directory,'receipt.json').digest,frameworkTerminal:JSON.parse(mandatoryEmailFile(directory,'baseline/framework-terminal.json').bytes),cancelled:false,cleanupComplete:true});
    fs.chmodSync(path.join(directory,'mandatory-email-child-completion.json'),0o600);
  }finally{process.off('SIGINT',cancel);process.off('SIGTERM',cancel);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  process.umask(0o077);
  try{const args=process.argv.slice(2);assert.equal(args.length,4);assert.deepEqual([args[0],args[2]],['--expected','--digest']);await runMandatoryEmailInvocation(args[1],args[3]);}
  catch{console.error('MANDATORY_EMAIL_BOUND_INVOCATION_FAILED');process.exitCode=2;}
  finally{if(process.connected)process.disconnect();}
}
