const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
test('real nested child failure retains allowlisted leaf without private data',async t=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mandatory-failure-child-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'baseline-expected.json'),log=path.join(root,'child.log');
 fs.writeFileSync(file,JSON.stringify({schemaVersion:1,cohort:{},variant:'baseline',directory:path.join(root,'baseline'),environment:{HOME:root,PATH:process.env.PATH,TMPDIR:root,SECRET_CANARY:'PRIVATE_CANARY'}}));
 const digest='sha256:'+crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const invocation=path.join(__dirname,'run-harness-mandatory-email-event-invocation.mjs'),diagnostics=pathToFileURL(path.join(__dirname,'lib/exui-native-failure-diagnostics.mjs')).href;
 const wrapper=`import fs from 'node:fs';import {spawnSync} from 'node:child_process';import {readOwnedFailure,formatNativeFailure,nativeFailurePrefix} from ${JSON.stringify(diagnostics)};const fd=fs.openSync(${JSON.stringify(log)},'wx',0o600);const r=spawnSync(process.execPath,[${JSON.stringify(invocation)},'--expected',${JSON.stringify(file)},'--digest',${JSON.stringify(digest)}],{stdio:['ignore',fd,fd],env:{PATH:process.env.PATH}});fs.closeSync(fd);if(r.status!==2)process.exit(4);const leaf=readOwnedFailure(${JSON.stringify(log)});console.error(nativeFailurePrefix+formatNativeFailure({reason:'MANDATORY_EMAIL_COHORT_CHILD_NOT_CLOSED',child:leaf?.failure}));`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',wrapper],{encoding:'utf8',env:{PATH:process.env.PATH}});assert.equal(result.status,0,result.stderr);
 const {nativeFailurePrefix,sanitizeNativeFailure}=await import('./lib/exui-native-failure-diagnostics.mjs'),line=result.stderr.trim();assert(line.startsWith(nativeFailurePrefix));const record=JSON.parse(line.slice(nativeFailurePrefix.length));
 assert.equal(record.reason,'MANDATORY_EMAIL_COHORT_CHILD_NOT_CLOSED');assert.equal(record.child.reason,'MANDATORY_EMAIL_CHILD_ENVIRONMENT_KEYS');assert(!result.stderr.includes('PRIVATE_CANARY'));assert(!fs.readFileSync(log,'utf8').includes('PRIVATE_CANARY'));
 assert.deepEqual(sanitizeNativeFailure({reason:'FORGED_SECRET_CANARY',source:'../../PRIVATE_CANARY',line:1}),{reason:'NATIVE_OPERATION_FAILED'});
});
test('owned child logs must be private regular files and parsing is bounded and sanitized',async t=>{
 const {readOwnedFailure,nativeFailurePrefix}=await import('./lib/exui-native-failure-diagnostics.mjs'),root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mandatory-failure-log-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'log');fs.writeFileSync(file,'secret-canary\n'+nativeFailurePrefix+JSON.stringify({reason:'MANDATORY_EMAIL_COHORT_CHILD_NOT_CLOSED',child:{reason:'FORGED_SECRET',token:'secret-canary'}})+'\n',{mode:0o600});
 assert.deepEqual(readOwnedFailure(file),{failure:{reason:'MANDATORY_EMAIL_COHORT_CHILD_NOT_CLOSED'},child:{reason:'NATIVE_OPERATION_FAILED'}});
 fs.chmodSync(file,0o644);assert.equal(readOwnedFailure(file),undefined);fs.chmodSync(file,0o600);fs.appendFileSync(file,nativeFailurePrefix+'not-json\n');assert.equal(readOwnedFailure(file),undefined);
});
test('wrapper and image failure codes use a finite allowlist',async()=>{
 const {sanitizeNativeFailure}=await import('./lib/exui-native-failure-diagnostics.mjs');
 for(const reason of ['HARNESS_ODHIN_REPORT_UNAVAILABLE','HARNESS_DIAGNOSTIC_FALLBACK_FAILED','HARNESS_NATIVE_PREPARATION_FAILED','HARNESS_JENKINS_ASSURANCE_COMMAND_FAILED','HARNESS_SELF_CHECK_EVIDENCE_INVALID','NATIVE_IDAM_NATIVE_PINNED_IMAGE_PULL_FAILED_NETWORK_TLS'])assert.deepEqual(sanitizeNativeFailure({reason}),{reason});
 for(const reason of ['NATIVE_SECRET_NATIVE_PINNED_IMAGE_PULL_FAILED_NETWORK_TLS','NATIVE_IDAM_NATIVE_PINNED_IMAGE_PULL_FAILED_SECRET','HARNESS_SECRET_CANARY'])assert.deepEqual(sanitizeNativeFailure({reason}),{reason:'NATIVE_OPERATION_FAILED'});
});
test('real owned invocation failure crosses cohort boundary without leaking child log',async t=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mandatory-failure-cohort-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {spawn}=require('node:child_process'),{campaign}=require('./fixtures/exui-mandatory-email-cohort.mock.cjs'),api=await import('./run-harness-mandatory-email-event-cohort.mjs'),diagnostics=await import('./lib/exui-native-failure-diagnostics.mjs'),fixture=await campaign(root),script=path.join(root,'owned-child.mjs');
 fs.writeFileSync(script,`console.error('PRIVATE_CANARY');console.error(${JSON.stringify(diagnostics.nativeFailurePrefix)}+JSON.stringify({reason:'MANDATORY_EMAIL_CHILD_ENVIRONMENT_KEYS',message:'PRIVATE_CANARY'}));process.exitCode=2;process.disconnect();`);
 let caught;try{await api.runMandatoryEmailSequence(fixture.cohort,{...fixture.options,execute:(command,options)=>api.executeMandatoryEmailChild(command,{...options,launch:(exe,_args,settings)=>spawn(exe,[script],settings)})});}catch(error){caught=error;}
 assert(caught);assert.match(caught.message,/MANDATORY_EMAIL_COHORT_CHILD_NOT_CLOSED/);assert.equal(diagnostics.readMandatoryFailure(caught).child.reason,'MANDATORY_EMAIL_CHILD_ENVIRONMENT_KEYS');
 const failure=JSON.parse(fs.readFileSync(path.join(root,'cohort-failure.json')));assert.equal(failure.code,'MANDATORY_EMAIL_COHORT_CHILD_NOT_CLOSED');assert(!JSON.stringify(failure).includes('PRIVATE_CANARY'));
});
