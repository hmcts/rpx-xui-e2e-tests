const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {completeCohort,completeAdmission}=require('./fixtures/exui-st-cic-cohort-packet.mock.cjs');
test('complete five-pair ST_CIC raw cohort and standalone gate retain every credit flag false',async t=>{
 const p=await completeAdmission(t),result=p.admit();assert.equal(result.accepted,1);assert.equal(result.baselineProofs,5);assert.equal(result.effectiveFaults,5);for(const key of ['runtimeAcceptance','catalogueCredit','wholeProfileSatisfied','releaseCredit','releaseApproval'])assert.equal(result[key],false);assert.equal(p.replay().proofs.length,5);
});
test('raw cohort rejects substituted identity, terminals, lifecycle, late health journal and private state',async t=>{
 const p=await completeCohort(t),base='st-cic-staff/baseline/';
 for(const [name,change]of [
 ['cohort-input.json',x=>x.producer.commit='b'.repeat(40)],['cohort-input.json',x=>x.owners['st-cic-wa']=x.owners['st-cic-staff']],
 ['st-cic-staff/profile-feasibility.json',x=>x.harnessSourceState='sealed-working-tree'],['st-cic-staff/profile-feasibility.json',x=>x.privateStateRemoved=false],
 ['st-cic-staff/profile-feasibility.json',x=>x.cleanup.complete=false],[base+'cohort-host-terminal.json',x=>x.code=1],
 [base+'runtime-identity.json',x=>x.runtime.architecture='amd64'],[base+'manifest.json',x=>x.identity.webappCommit='foreign'],[base+'cohort-host-tools.json',x=>x.observations.at(-1).running=true],[base+'cohort-host-tools.json',x=>x.observations.at(-1).id='f'.repeat(64)],[base+'cohort-host-tools.json',x=>x.terminal.code=2],[base+'candidate-lifecycle.json',x=>x.before.Config.Cmd.push('foreign')],
 ['st-cic-wa-health/baseline/profile-st-cic-destinations.json',x=>x.push({method:'GET',path:'/health'})],
 ['st-cic-global-search/baseline/profile-st-cic-selection.json',x=>x.selected='ALL'],
 ['st-cic-mapping/baseline/profile-st-cic-observations.json',x=>x.observations[1].body=[]]
 ]){const file=path.join(p.directory,name),saved=fs.readFileSync(file),value=JSON.parse(saved);change(value);p.write(file,value);assert.throws(p.replay,name);fs.writeFileSync(file,saved);}
 assert.equal(p.replay().proofs.length,5);
});
test('parent pins and complete raw seal reject changed authority and coherently forged worker success',async t=>{
 const p=await completeAdmission(t);for(const name of ['expected-input.json','independent-controller-launch.json','independent-controller-terminal.json','independent-controller-cleanup.json']){const file=path.join(p.parent,name),saved=fs.readFileSync(file);p.write(file,{foreign:true});assert.throws(p.admit,name);fs.writeFileSync(file,saved);}
 const file=path.join(p.directory,'st-cic-wa/baseline/profile-worker-result.json'),saved=fs.readFileSync(file),value=JSON.parse(saved);value.catalogueCredit=true;p.write(file,value);assert.throws(p.admit);fs.writeFileSync(file,saved);assert.equal(p.admit().accepted,1);
});
test('symlinked authority and extra facet scope cannot be hidden by successful neighbouring records',async t=>{
 const p=await completeAdmission(t),file=path.join(p.directory,'st-cic-wa/baseline/cohort-host-terminal.json'),saved=fs.readFileSync(file),other=path.join(p.parent,'held-terminal.json');fs.writeFileSync(other,saved);fs.unlinkSync(file);fs.symlinkSync(other,file);assert.throws(p.replay,/ALIAS/);fs.unlinkSync(file);fs.writeFileSync(file,saved);fs.mkdirSync(path.join(p.directory,'foreign-facet'));assert.throws(p.replay,/INVENTORY/);
});
test('dirty M1 source cannot mint committed producer authority',async()=>{
 const cp=require('node:child_process'),{syncBuiltinESMExports}=require('node:module'),original=cp.execFileSync,m=await import('./lib/exui-st-cic-profile-cohort.mjs');let calls=0;
 try{cp.execFileSync=(command,args)=>{calls++;assert.equal(command,'git');assert.equal(args[0],'status');return '?? scripts/lib/exui-st-cic-profile-cohort.mjs';};syncBuiltinESMExports();assert.throws(()=>m.stCicProducerBinding('/synthetic/dirty'),/COMMITTED_SOURCE/);assert.equal(calls,1);}finally{cp.execFileSync=original;syncBuiltinESMExports();}
});

test('public admission has no replacement configuration oracle and exact source bytes remain mandatory',async t=>{
 const p=await completeAdmission(t),m=await import(process.env.ST_CIC_ADMISSION_TEST_MODULE??'./lib/exui-st-cic-profile-admission.mjs'),file=path.join(p.expected.artifact.candidateRoot,'config/default.json');fs.writeFileSync(file,'{}');let called=false;
 assert.throws(()=>m.admitStCicProfile(p.parent,p.pins,{configurationFor:()=>{called=true;return {};}}),/SOURCE_PROFILE_CONFIG_DRIFT/);assert.equal(called,false);
});
test('missing raw facet/fault/tools authority, reused resources and changed seals cannot qualify',async t=>{
 const p=await completeAdmission(t);
 for(const name of ['st-cic-wa/baseline/cohort-host-tools.json','st-cic-staff/source-profile-drop-st-cic-staff/profile-worker-result.json']){const file=path.join(p.directory,name),saved=fs.readFileSync(file);fs.unlinkSync(file);assert.throws(p.admit);fs.writeFileSync(file,saved);}
 const file=path.join(p.directory,'st-cic-wa/owned-resources.json'),saved=fs.readFileSync(file),rows=JSON.parse(saved);rows[1].id=rows[0].id;p.write(file,rows);assert.throws(p.admit);fs.writeFileSync(file,saved);
 const extra=path.join(p.directory,'st-cic-wa/creation-attempts.json');p.write(extra,[{state:'pending'}]);assert.throws(p.replay,/INVENTORY/);fs.unlinkSync(extra);
 const late=path.join(p.directory,'st-cic-wa/baseline/playwright.log'),originalLog=fs.readFileSync(late);fs.writeFileSync(late,'changed after parent seal');assert.throws(p.admit);fs.writeFileSync(late,originalLog);assert.equal(p.admit().accepted,1);
});
test('postterminal removal audit queries every recorded CID and deterministic name, rejecting any present actor',async t=>{
 const p=await completeAdmission(t),{stCicRemovalObservations}=await import('./run-harness-st-cic-profile-admission.mjs'),seen=[];
 const result=stCicRemovalObservations(p.parent,p.expected,id=>{seen.push(id);return null;});assert.equal(result.length,20);assert.equal(seen.length,40);assert.equal(new Set(seen).size,40);
 const present=result[0].id;assert.throws(()=>stCicRemovalObservations(p.parent,p.expected,id=>id===present?{Id:present}:null),/RESOURCE_PRESENT/);
});
test('controller waits for observed close and preserves cancellation settlement without starting on pre-cancel',async()=>{
 const {EventEmitter}=require('node:events'),{executeStCicController,stCicControllerCommand}=await import('./run-harness-st-cic-profile-admission.mjs');
 const command=stCicControllerCommand({artifactPath:'/synthetic/artifact.json',browserRoot:'/synthetic/browser',output:'/synthetic/parent'}),target=new EventEmitter();
 const normal=await executeStCicController(command,{signalTarget:target,launch:()=>{const child=new EventEmitter();queueMicrotask(()=>{child.emit('exit',0,null);child.emit('close',2,null);});return child;}});assert.equal(normal.code,2);assert.equal(normal.observed,true);
 const signal=new AbortController();signal.abort();let starts=0;await assert.rejects(executeStCicController(command,{signal:signal.signal,signalTarget:target,launch:()=>{starts++;}}),/CANCELLED/);assert.equal(starts,0);
 const early=executeStCicController(command,{signalTarget:target,launch:()=>{starts++;}});target.emit('SIGTERM');await assert.rejects(early,/CANCELLED/);assert.equal(starts,0);
 let terminated=false,closed=false;const cancelling=executeStCicController(command,{signalTarget:target,launch:()=>{const child=new EventEmitter();queueMicrotask(()=>target.emit('SIGTERM'));return child;},terminate:async child=>{terminated=true;queueMicrotask(()=>{closed=true;child.emit('close',null,'SIGTERM');});return {observed:true,forced:false};}});const ended=await cancelling;assert(terminated&&closed);assert.equal(ended.cancelled,true);assert.equal(ended.observed,true);assert.equal(ended.signal,'SIGTERM');assert.equal(target.listenerCount('SIGTERM'),0);
});

test('actual wrapper startup requires fresh owners before fresh output and never reads future cohort metadata',async t=>{
 const {startupModule}=require('./fixtures/exui-st-cic-cohort-packet.mock.cjs'),p=await completeCohort(t),base=fs.mkdtempSync(path.join(path.dirname(p.directory),'wrapper-boundary-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const host=await import('./lib/exui-host-invocation.mjs'),cohort=await import('./lib/exui-st-cic-profile-cohort.mjs');
 for(const present of [false,true]){const output=path.join(base,present?'present':'absent');let inspected=0,launches=0;
  const wrapper=await startupModule('scripts/run-harness-st-cic-profile-admission.mjs',{'./run-harness-st-cic-profile.mjs':{prepareStCicProfileBinding:async()=>p.expected},'./lib/exui-st-cic-profile-cohort.mjs':{...cohort,stCicProducerBinding:()=>p.expected.producer},'./lib/exui-host-invocation.mjs':{...host,inspectHostContainer:()=>{inspected++;assert.equal(fs.existsSync(output),false);return present?{Id:'occupied'}:null;}},'node:child_process':{spawn:(file,args,options)=>{launches++;assert.equal(path.basename(file),'node');assert(args[0].endsWith('/scripts/run-harness-st-cic-profile.mjs'));assert.deepEqual(Object.keys(options.env).sort(),['HOME','PATH','TMPDIR']);const child=new(require('node:events').EventEmitter)();queueMicrotask(()=>child.emit('close',2,null));return child;}}});
  await assert.rejects(wrapper.runStCicProfileAdmission({artifactPath:'/synthetic/artifact.json',browserRoot:p.expected.browser.root,output}),present?/OWNER_NOT_FRESH/:/ST_CIC_ADMISSION_CONTROLLER/);
  assert.equal(inspected,present?1:20);assert.equal(launches,present?0:1);assert.equal(fs.existsSync(output),!present);assert.equal(fs.existsSync(path.join(output,'admission-request.json')),false);if(!present){const observed=JSON.parse(fs.readFileSync(path.join(output,'independent-controller-terminal.json')));assert.equal(observed.code,2);assert.equal(observed.observed,true);}
 }
});
test('actual direct child protects browser and dependency input roots before any output write',async t=>{
 const {startupModule}=require('./fixtures/exui-st-cic-cohort-packet.mock.cjs'),p=await completeCohort(t),base=fs.mkdtempSync(path.join(path.dirname(p.directory),'child-boundary-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));const browserRoot=path.join(base,'browser'),dependencies=path.join(base,'dependencies'),artifactPath=path.join(base,'artifact.json');fs.mkdirSync(browserRoot);fs.mkdirSync(dependencies);for(const directory of [browserRoot,dependencies])fs.writeFileSync(path.join(directory,'sentinel.txt'),'immutable unit input');fs.writeFileSync(artifactPath,'synthetic manifest precondition');let protectWrites=true,writes=0;const cohort=await import('./lib/exui-st-cic-profile-cohort.mjs'),artifact=await import('./lib/exui-candidate-artifact.mjs'),oci=await import('./lib/exui-oci-runtime.mjs');let starts=0;
 const child=await startupModule('scripts/run-harness-st-cic-profile.mjs',{'node:fs':{...fs,realpathSync:value=>path.resolve(value)===path.resolve(process.env.ST_CIC_STARTUP_TEST_ROOT??path.resolve(__dirname,'..'),'node_modules')?dependencies:fs.realpathSync(value),mkdirSync:(...args)=>{if(protectWrites){writes++;throw Error('UNSAFE_OUTPUT_WRITE_CANARY');}return fs.mkdirSync(...args);},writeFileSync:(...args)=>{if(protectWrites){writes++;throw Error('UNSAFE_OUTPUT_WRITE_CANARY');}return fs.writeFileSync(...args);}},'./lib/exui-st-cic-profile-cohort.mjs':{...cohort,stCicProducerBinding:()=>p.expected.producer},'./lib/exui-source-profile-sources.mjs':{PROFILE_SOURCE_FILES:cohort.ST_CIC_COHORT_FILES},'./lib/exui-candidate-artifact.mjs':{...artifact,verifyCandidateArtifact:async()=>p.expected.artifact,digestCandidateTree:async()=>p.expected.browser.digest},'./lib/exui-native-containers.mjs':{inspectNativeApiRuntime:()=>p.expected.runtime,inspectNativeBrowserRuntime:()=>p.expected.browser.image},'./lib/exui-harness-dependencies.mjs':{verifyHarnessDependencies:async()=>p.expected.browser.dependencies},'./lib/exui-oci-runtime.mjs':{...oci,browserExecutable:()=> 'chromium'},'./run-harness-source-profile-jurisdictions.mjs':{runSourceProfileFeasibility:async()=>{starts++;throw Error('CHILD_EXECUTION_CANARY');}}});
 const harness=process.env.ST_CIC_STARTUP_TEST_ROOT??path.resolve(__dirname,'..'),sourceAlias=path.dirname(harness)+'/./'+path.basename(harness)+'/st-cic-unit-must-never-create';
 for(const output of [path.join(browserRoot,'fresh-output'),path.join(dependencies,'st-cic-unit-must-never-create'),sourceAlias,browserRoot,dependencies,base]){const existed=fs.existsSync(output);await assert.rejects(child.runStCicProfile({artifactPath,browserRoot,output}),/OUTPUT.*(OVERLAP|INPUT)|IMMUTABLE|FRESH/);assert.equal(fs.existsSync(output),existed);assert.equal(starts,0);assert.equal(writes,0);for(const directory of [browserRoot,dependencies])assert.equal(fs.readFileSync(path.join(directory,'sentinel.txt'),'utf8'),'immutable unit input');}
 protectWrites=false;const output=path.join(base,'fresh-disjoint');await assert.rejects(child.runStCicProfile({artifactPath,browserRoot,output}),/CHILD_EXECUTION_CANARY/);assert.equal(starts,1);assert.equal(fs.existsSync(path.join(output,'cohort-input.json')),true);assert.equal(fs.existsSync(path.join(output,'st-cic-profile-cohort.json')),false);
});
test('repeated cancellation retains signal handlers through close and forwards termination once',async()=>{
 const {EventEmitter}=require('node:events'),{startupModule}=require('./fixtures/exui-st-cic-cohort-packet.mock.cjs'),{executeStCicController,stCicControllerCommand}=await startupModule('scripts/run-harness-st-cic-profile-admission.mjs');const target=new EventEmitter(),command=stCicControllerCommand({artifactPath:'/synthetic/artifact.json',browserRoot:'/synthetic/browser',output:'/synthetic/parent'});let forwards=0,held=false,secondHandled=false,child,settle;
 const promise=executeStCicController(command,{signalTarget:target,launch:()=>{child=new EventEmitter();queueMicrotask(()=>{target.emit('SIGTERM');held=target.listenerCount('SIGTERM')>0;secondHandled=target.emit('SIGTERM');queueMicrotask(()=>{child.emit('close',null,'SIGTERM');settle({observed:true,forced:false});});});return child;},terminate:()=>{forwards++;return new Promise(resolve=>{settle=resolve;});}});
 const terminal=await promise;assert.equal(held,true);assert.equal(secondHandled,true);assert.equal(forwards,1);assert.equal(terminal.cancelled,true);assert.equal(target.listenerCount('SIGTERM'),0);
});
test('successful CLI output excludes internal request path and raw result',async()=>{
 const vm=require('node:vm'),{pathToFileURL,fileURLToPath}=require('node:url'),file=path.join(process.env.ST_CIC_STARTUP_TEST_ROOT??path.resolve(__dirname,'..'),'scripts/run-harness-st-cic-profile-admission.mjs'),source=fs.readFileSync(file,'utf8'),footer=source.slice(source.indexOf('if(process.argv[1]'));const lines=[],result={status:'passed',obligationId:'configuration-profile:st-cic',receiptDigest:'sha256:'+'a'.repeat(64),reportRequest:{path:'/PRIVATE-CANARY/output/admission-request.json',digest:'sha256:'+'b'.repeat(64),runId:'private-run'},privateOther:'PRIVATE-CANARY'};
 const code=footer.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(file).href));await vm.runInNewContext('process.argv='+JSON.stringify(['node',file,'--artifact','/synthetic/artifact','--browser-root','/synthetic/browser','--output','/synthetic/output'])+';(async()=>{'+code+'})()',{path,fileURLToPath,assert,process:{argv:['node',file,'--artifact','/synthetic/artifact','--browser-root','/synthetic/browser','--output','/synthetic/output'],umask:()=>{},exitCode:0},console:{log:x=>lines.push(x),error:()=>{}},runStCicProfileAdmission:async()=>result});
 assert.equal(lines.length,1);assert(!lines[0].includes('PRIVATE-CANARY'));const value=JSON.parse(lines[0]);assert.equal(value.status,'passed');assert.equal(value.obligationId,result.obligationId);assert.equal(value.receiptDigest,result.receiptDigest);assert.equal(Object.hasOwn(value,'reportRequest'),false);
});

test('controller forced or unobserved termination cannot manufacture normal completion or release handlers early',async()=>{
 const {EventEmitter}=require('node:events'),{executeStCicController,stCicControllerCommand}=await import('./run-harness-st-cic-profile-admission.mjs');const command=stCicControllerCommand({artifactPath:'/synthetic/artifact.json',browserRoot:'/synthetic/browser',output:'/synthetic/parent'});
 for(const force of [true,false]){const target=new EventEmitter();let child,forwards=0;const running=executeStCicController(command,{signalTarget:target,launch:()=>{child=new EventEmitter();queueMicrotask(()=>target.emit('SIGTERM'));return child;},terminate:async()=>{forwards++;if(!force)throw Error('UNOBSERVED_CANARY');queueMicrotask(()=>child.emit('close',137,'SIGKILL'));return {observed:true,forced:true};}});
  if(force){const terminal=await running;assert.equal(terminal.forced,true);assert.equal(terminal.code,137);assert.equal(terminal.cancelled,true);}else{await assert.rejects(running,/UNOBSERVED_CANARY/);assert.equal(target.listenerCount('SIGTERM'),1);target.emit('SIGINT');child.emit('close',null,'SIGTERM');}
  assert.equal(forwards,1);assert.equal(target.listenerCount('SIGTERM'),0);assert.equal(target.listenerCount('SIGINT'),0);
 }
});

test('ST_CIC cohort inventory accepts only the exact shared proof-runner log filename',async t=>{
 const p=await completeCohort(t);
 for(const facet of fs.readdirSync(p.directory)){const folder=path.join(p.directory,facet);if(!fs.statSync(folder).isDirectory())continue;for(const invocation of fs.readdirSync(folder)){const current=path.join(folder,invocation);if(fs.statSync(current).isDirectory()){fs.writeFileSync(path.join(current,'playwright.log'),'synthetic opaque runner output');fs.writeFileSync(path.join(current,'provider-requests.jsonl'),JSON.stringify({method:'GET',path:'/o/.well-known/openid-configuration',query:{},body:null})+'\n');}}}
 assert.equal(p.replay().proofs.length,5);
 const folder=path.join(p.directory,'st-cic-wa','baseline'),log=path.join(folder,'playwright.log');
 for(const name of ['unexpected.log','proof-client.log']){const extra=path.join(folder,name);fs.writeFileSync(extra,'not a permitted runner artifact');assert.throws(p.replay,/ST_CIC_COHORT_INVENTORY/);fs.unlinkSync(extra);}
 const bytes=fs.readFileSync(log),outside=path.join(path.dirname(p.directory),'aliased-runner.log');fs.writeFileSync(outside,bytes);fs.unlinkSync(log);fs.symlinkSync(outside,log);assert.throws(p.replay,/ALIAS/);fs.unlinkSync(log);fs.writeFileSync(log,bytes);assert.equal(p.replay().proofs.length,5);
});
