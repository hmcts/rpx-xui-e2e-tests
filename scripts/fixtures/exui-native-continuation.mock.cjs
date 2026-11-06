const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');

// Execute the unchanged production function body with only its process/runtime edges faked.
exports.runNativeController=async function runNativeController(root,mode,sourceOverride){
 const output=path.join(root,'output');fs.mkdirSync(path.join(output,'private'),{recursive:true});
 const candidate=path.join(root,'candidate.json');fs.writeFileSync(candidate,JSON.stringify({candidateRoot:path.join(root,'artifact')}));
 const job=path.join(root,'job.json');fs.writeFileSync(job,JSON.stringify({candidateManifest:candidate,output,browserCache:path.join(root,'browser')}));
 const source=sourceOverride??fs.readFileSync(path.join(__dirname,'../run-harness-ci.mjs'),'utf8');
 const start=source.indexOf('export async function runHarnessCi('),end=source.indexOf('\nif (\n',start);
 assert(start>=0&&end>start,'NATIVE_FUNCTION_BOUNDARY');
 const {reportNativeProgress}=await import('../run-harness-ci.mjs');
 const {cleanupCiCcd}=await import('../lib/exui-candidate-ci-process.mjs');
 let removals=0,cancel;const calls=[];
 const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value));};
 const environment={fs,path,assert,ROOT:root,randomUUID:()=> '11111111-1111-4111-8111-111111111111',
  validateCiJob:value=>value,read:file=>JSON.parse(fs.readFileSync(file)),createCiOutput:()=>output,
  blocked:()=>({status:'BLOCKED',exitCode:2}),writeJsonAtomic:write,writeCiPublicSummary:()=>{},
  writeConfigurationCoverage:()=>{},reportNativeProgress,nativePhaseFailure:()=>({code:'CONTROLLED'}),
  fixedCiPhasesPassed:()=>false,installCiCancellation:options=>{cancel=options.onCancel;return ()=>{};},
  prepareCiJob:async()=>{if(mode==='no-start')throw Error('PRIVATE-PROGRESS-PREFLIGHT-CANARY');return{artifact:{provenance:{platform:'linux/arm64'}},nativeCohortCapture:{}};},
  startCcdRuntime:async(directory,options)=>{calls.push('start');
   if(mode==='cancel-after-create'){
    (options.runDocker??environment.docker)(['create','synthetic-image']);cancel();calls.push('runtime-cancelled:'+Boolean(options.isCancelled?.()));
    try{(options.runDocker??environment.docker)(['create','synthetic-image']);}catch(error){calls.push('cancel-error:'+error.message);throw error;}
    throw Error('CONTROLLED_CANCEL_IGNORED');
   }
   if(mode.includes('-precreation-'))throw Error('CONTROLLED_BEFORE_CREATE');
   if(mode.includes('-created-')){(options.runDocker??environment.docker)(['create','synthetic-image']);throw Error('CONTROLLED_READINESS_AFTER_SETTLED_CREATE');}
   if(mode==='uncertain-create'){options.onCreateUncertainty?.();throw Error('CONTROLLED_CREATE_UNCERTAIN');}return{output:directory};},
  docker:args=>{assert.equal(args[0],'create');calls.push('create');return 'a'.repeat(64);},
  importNativeCallbackDefinition:async()=>{throw Error('CONTROLLED_CALLBACK_IMPORT');},
  importCcdDefinition:()=>{throw Error('CONTROLLED_CLOSED_OPERATION');},
  cleanupCiCcd:directory=>{removals++;calls.push('remove');
   if(mode.endsWith('-missing'))return cleanupCiCcd(directory,{inspect:()=>{throw Error('UNEXPECTED_DOCKER_INSPECT');},stop:()=>{throw Error('UNEXPECTED_DOCKER_STOP');}});
   if(mode.endsWith('-incomplete'))return{cleanupComplete:false};
   if(mode==='remove-retry'&&removals===1)throw Error('CONTROLLED_UNKNOWN_CID');return{cleanupComplete:true};},
  runFixedCiPilots:async operations=>{
   if(mode==='clean-fail')return{status:'FAIL',exitCode:1};
   if(mode==='cancelled'){cancel();return{status:'BLOCKED',exitCode:2};}
   try{await (mode.startsWith('event-')?operations.startEvent():mode.startsWith('callback-')?operations.startCallback():operations.start());}catch{/* Exercise finalization after a controlled operation failure. */}
   if(mode==='remove-retry')try{await operations.stop();}catch{/* Finally will retry, but must not erase unsafe authority. */}
   return{status:'BLOCKED',exitCode:2};
  }};
 const run=vm.runInNewContext('('+source.slice(start,end).replace(/^export /,'')+')',environment);
 const result=await run(job);
 return{result,calls,removals,privateResult:fs.readFileSync(path.join(output,'private/ci-result.json'),'utf8')};
};

exports.runSelectorController=async function runSelectorController(root,mode,sourceOverride){
 const repo=path.resolve(__dirname,'../..'),source=sourceOverride??fs.readFileSync(path.join(repo,'scripts/run-harness-selector-event-row.mjs'),'utf8');
 const start=source.indexOf('export async function runSelectorEventPhase('),end=source.indexOf('export async function runSelectorEventRow(',start);assert(start>=0&&end>start,'SELECTOR_FUNCTION_BOUNDARY');
 const io=await import('../lib/exui-evidence-io.mjs'),processApi=await import('../lib/exui-candidate-ci-process.mjs'),selector=await import('../run-harness-selector-event-row.mjs');
 let removals=0;const calls=[],known={credentials:{},ccd:{},definition:{},definitionImportDigest:'digest',selectorEventBinding:{},apiContracts:{}};
 const values={assert,fs,path,performance,root:repo+'/',SELECTOR_EVENT_MUTATION:'summary-change-hidden',SELECTOR_EVENT_SCOPE:'exui-ccd-selector-event-row-pilot',
  verifyCandidateArtifact:async()=>({candidateRoot:root,provenance:{platform:'linux/arm64'}}),createFreshHarnessOutput:p=>{fs.mkdirSync(p);return p;},
  writeJsonAtomic:io.writeJsonAtomic,digestBytes:io.digestBytes,NATIVE_HARNESS_SOURCE_FILES:[],
  verifyHarnessDependencies:async()=>{if(mode==='before-prepare')throw Error('CONTROLLED_PREPARATION_NOT_STARTED');return{};},
  spawnSync:(_command,args)=>({status:0,stdout:args[0]==='status'?'':'a'.repeat(40)}),digestCandidateTree:async()=> 'sha256:'+'b'.repeat(64),inspectNativeApiRuntime:()=>({}),inspectNativeBrowserRuntime:()=>({}),
  prepareSelectorRuntime:async()=>{calls.push('prepare');if(mode!=='cleanup-retry'||calls.filter(x=>x==='prepare').length>1)throw Error('CONTROLLED_PREPARATION_FAILURE');return known;},
  classifyNativeFailure:()=>({code:'CONTROLLED'}),afterSelectorChildStopped:selector.afterSelectorChildStopped,
  cleanupCiCcd:directory=>{removals++;calls.push('remove');if(mode==='prepare-complete'||mode==='cleanup-retry'&&removals>1)return{cleanupComplete:true};return processApi.cleanupCiCcd(directory,{inspect:()=>{throw Error('UNEXPECTED_INSPECT');},stop:()=>{throw Error('UNEXPECTED_STOP');}});},
  validateSelectorRuntimeInput:()=>{},assertCopiedSelectorRuntimeEvidence:()=>{},nativeIdentity:()=>({identity:{}}),captureCiPhaseExpectation:()=>({runId:'held'}),captureCiOwnership:()=>({invocations:[]}),reference:()=>({}),
  readSelectorCheckpoint:()=>{},assertSelectorInvocationRemoved:()=>({}),inspectHostContainer:()=>null,cleanupNativeOwnership:async()=>{calls.push('native-remove');},
  executeCiProcess:async options=>{const input={...known,artifact:{candidateRoot:root}},handoff={};options.onPrepared(input,handoff);await options.onSelectorTransition({}, {input,handoff,isTerminated:()=>false});throw Error('CONTROLLED_NO_FINAL_EXECUTION');}
 };
 const run=new Function(...Object.keys(values),source.slice(start,end).replace(/^export /,'')+';return runSelectorEventPhase;')(...Object.values(values));
 const result=await run({candidate:path.join(root,'candidate.json'),browser:root,output:path.join(root,'phase')});return{result,calls,removals};
};
