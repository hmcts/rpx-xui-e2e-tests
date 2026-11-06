const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');

// Execute the unchanged production function body with only its process/runtime edges faked.
exports.runNativeController=async function runNativeController(root,mode,sourceOverride){
 const output=path.join(root,'output');fs.mkdirSync(path.join(output,'private'),{recursive:true});
 const candidate=path.join(root,'candidate.json');fs.writeFileSync(candidate,JSON.stringify({candidateRoot:path.join(root,'artifact')}));
 const job=path.join(root,'job.json');fs.writeFileSync(job,JSON.stringify({candidateManifest:candidate,output,browserCache:path.join(root,'browser')}));
 const source=sourceOverride??fs.readFileSync(path.join(__dirname,'../run-harness-ci.mjs'),'utf8');
 const start=source.indexOf('export async function runHarnessCi('),end=source.indexOf('\nif (\n',start);
 assert(start>=0&&end>start,'NATIVE_FUNCTION_BOUNDARY');
 let removals=0,cancel;const calls=[];
 const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value));};
 const environment={fs,path,assert,ROOT:root,randomUUID:()=> '11111111-1111-4111-8111-111111111111',
  validateCiJob:value=>value,read:file=>JSON.parse(fs.readFileSync(file)),createCiOutput:()=>output,
  blocked:()=>({status:'BLOCKED',exitCode:2}),writeJsonAtomic:write,writeCiPublicSummary:()=>{},
  writeConfigurationCoverage:()=>{},reportNativeProgress:()=>{},nativePhaseFailure:()=>({code:'CONTROLLED'}),
  fixedCiPhasesPassed:()=>false,installCiCancellation:options=>{cancel=options.onCancel;return ()=>{};},
  prepareCiJob:async()=>{if(mode==='no-start')throw Error('CONTROLLED_PREFLIGHT');return{artifact:{provenance:{platform:'linux/arm64'}},nativeCohortCapture:{}};},
  startCcdRuntime:async(directory,options)=>{calls.push('start');if(mode==='uncertain-create'){options.onCreateUncertainty?.();throw Error('CONTROLLED_CREATE_UNCERTAIN');}return{output:directory};},
  importCcdDefinition:()=>{throw Error('CONTROLLED_CLOSED_OPERATION');},
  cleanupCiCcd:()=>{removals++;calls.push('remove');if(mode==='remove-retry'&&removals===1)throw Error('CONTROLLED_UNKNOWN_CID');return{cleanupComplete:true};},
  runFixedCiPilots:async operations=>{
   if(mode==='clean-fail')return{status:'FAIL',exitCode:1};
   if(mode==='cancelled'){cancel();return{status:'BLOCKED',exitCode:2};}
   try{await operations.start();}catch{/* Exercise finalization after a controlled operation failure. */}
   if(mode==='remove-retry')try{await operations.stop();}catch{/* Finally will retry, but must not erase unsafe authority. */}
   return{status:'BLOCKED',exitCode:2};
  }};
 const run=vm.runInNewContext('('+source.slice(start,end).replace(/^export /,'')+')',environment);
 const result=await run(job);
 return{result,calls,removals,privateResult:fs.readFileSync(path.join(output,'private/ci-result.json'),'utf8')};
};
