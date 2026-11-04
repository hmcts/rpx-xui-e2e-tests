const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const diagnostic = { schemaVersion: 1, phase: 'eventCapability', invocation: 'ccd-remove-readonly-recipient-read', category: 'transition', code: 'CI_NATIVE_CLEANUP_INCOMPLETE', firstCausalCode: 'CCD_IMPORTED_DEFINITION_DRIFT' };
const temp = (t) => { const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'native-failure-')); t.after(() => fs.rmSync(root, {recursive:true,force:true})); return root; };

test('validated public summary retains a bounded first-causal diagnostic', async t => {
  const {writePublicSummary,validatePublicSummary} = await import('./lib/exui-evidence-io.mjs');
  const file = path.join(temp(t),'summary.json');
  writePublicSummary(file,{status:'BLOCKED',failure:diagnostic});
  assert.deepEqual(validatePublicSummary(file).failure,diagnostic);
});

test('nested and aggregate errors retain the first known cause without private assertion payloads', async () => {
  const {nativeFailure} = await import('./lib/exui-native-failure.mjs');
  const inner = new Error('CCD_IMPORTED_DEFINITION_DRIFT\nPRIVATE-CANARY Authorization: Bearer token /private/secret');
  const error = new AggregateError([new Error('CI_NATIVE_CLEANUP_INCOMPLETE', {cause:inner}),new Error('PRIVATE-CANARY')],'CI_NATIVE_CLEANUP_INCOMPLETE');
  assert.deepEqual(nativeFailure(error, diagnostic),diagnostic);
  for (const value of ['PRIVATE_CANARY_TOKEN', 'Authorization: Bearer PRIVATE-CANARY', '/private/PRIVATE-CANARY', 'CI_EVENT_SOURCE_ROLES_PRIVATE_CANARY']) {
    const result = nativeFailure(new Error(value), {phase:value,invocation:value,category:value});
    assert.deepEqual(result,{schemaVersion:1,phase:'unknown',invocation:null,category:'unknown',code:'NATIVE_FAILURE_UNCLASSIFIED',firstCausalCode:'NATIVE_FAILURE_UNCLASSIFIED'});
  }
  const cyclic = new Error('PRIVATE-CANARY'); cyclic.cause=cyclic;
  assert.equal(nativeFailure(cyclic).firstCausalCode,'NATIVE_FAILURE_UNCLASSIFIED');
});

test('an unannotated wrapper cannot replace its structured causal phase with outer preflight context', async () => {
  const {annotateNativeFailure,nativeFailure}=await import('./lib/exui-native-failure.mjs');
  const inner=annotateNativeFailure(new Error('CCD_IMPORTED_DEFINITION_DRIFT'),{phase:'eventCapability',invocation:'ccd-remove-readonly-recipient-read',category:'transition'});
  const outer=new AggregateError([inner,new Error('HOST_DOCKER_RM_FAILED')],'CI_NATIVE_CLEANUP_INCOMPLETE');
  assert.deepEqual(nativeFailure(outer,{phase:'preflight',category:'preflight'}),diagnostic);
});

test('public summary rejects forged diagnostic fields and never grants PASS failure credit', async t => {
  const {writePublicSummary,validatePublicSummary} = await import('./lib/exui-evidence-io.mjs');
  const file = path.join(temp(t),'summary.json');
  for (const patch of [{raw:'PRIVATE-CANARY'},{code:'SECRET_TOKEN'},{phase:'/private/secret'},{category:'Authorization'},{invocation:'unknown-private-invocation'},{firstCausalCode:'COOKIE_SECRET'}]) {
    writePublicSummary(file,{status:'BLOCKED',failure:diagnostic});
    const value=JSON.parse(fs.readFileSync(file));value.failure={...diagnostic,...patch};
    fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
    assert.throws(()=>validatePublicSummary(file),/UNSAFE_PUBLIC_SUMMARY/);
    writePublicSummary(file,{status:'BLOCKED',failure:{...diagnostic,...patch}});
    assert.doesNotMatch(fs.readFileSync(file,'utf8'),/PRIVATE-CANARY|SECRET_TOKEN|private\/secret|Authorization|unknown-private-invocation|COOKIE_SECRET/);
  }
  writePublicSummary(file,{status:'PASS',failure:diagnostic});
  assert.equal(validatePublicSummary(file).failure,undefined);
});

test('child preflight IPC preserves its safe cause before any launch handoff exists', async t => {
  const {executeCiProcess} = await import('./lib/exui-candidate-ci-process.mjs');
  const root=temp(t),script=path.join(root,'child.mjs');
  const library=pathToFileURL(path.join(__dirname,'lib/exui-native-failure.mjs')).href;
  fs.writeFileSync(script,`import {reportNativeFailure} from ${JSON.stringify(library)};reportNativeFailure(new Error('CCD_CANDIDATE_PLATFORM_MISMATCH\\nPRIVATE-CANARY'),{phase:'eventCapability',category:'preflight'});process.exitCode=2;`);
  await assert.rejects(executeCiProcess({script,args:['--scope','exui-ccd-event-capability-pilot'],output:path.join(root,'phase'),onPrepared:()=>assert.fail('preflight created handoff')}),error=>{
    assert.equal(error.nativeFailure.code,'CCD_CANDIDATE_PLATFORM_MISMATCH');
    assert.equal(error.nativeFailure.firstCausalCode,'CCD_CANDIDATE_PLATFORM_MISMATCH');
    assert.equal(error.nativeFailure.phase,'eventCapability');
    assert.equal(error.nativeFailure.category,'preflight');
    assert.doesNotMatch(JSON.stringify(error.nativeFailure),/PRIVATE-CANARY/);
    return true;
  });
});

test('IPC rejects malformed, oversized and wrong-launch records, then keeps the first valid failure', async t => {
  const {executeCiProcess}=await import('./lib/exui-candidate-ci-process.mjs');
  const root=temp(t),script=path.join(root,'child.cjs');
  const failure={...diagnostic,invocation:'baseline'};
  const malformed=[
    {type:'harness-native-failure',failure,raw:'PRIVATE-CANARY'},
    {type:'harness-native-failure',failure:{...failure,raw:'PRIVATE-CANARY'}},
    {type:'harness-native-failure',failure:{...failure,code:'S'.repeat(100000)}},
    {type:'harness-native-failure',failure:{...failure,phase:'scope'}},
    {type:'harness-native-failure',failure:diagnostic},
    {type:'harness-native-failure',failure:{...failure,category:'preflight'}},
  ];
  fs.writeFileSync(script,`for(const m of ${JSON.stringify(malformed)})process.send(m);process.send({type:'harness-native-failure',failure:${JSON.stringify(failure)}});process.send({type:'harness-native-failure',failure:${JSON.stringify({...failure,firstCausalCode:'ENOENT'})}});process.exitCode=2;`);
  await assert.rejects(executeCiProcess({script,args:['--scope','exui-ccd-event-capability-pilot','--only','baseline'],output:path.join(root,'phase'),onPrepared:()=>assert.fail('unexpected handoff')}),error=>{
    assert.deepEqual(error.nativeFailure,failure);return true;
  });
});

test('missing preflight IPC does not invent a causal code', async t => {
  const {executeCiProcess}=await import('./lib/exui-candidate-ci-process.mjs');
  const root=temp(t),script=path.join(root,'child.cjs');
  fs.writeFileSync(script,"console.error('PRIVATE-CANARY');process.exitCode=2;");
  await assert.rejects(executeCiProcess({script,args:['--scope','exui-ccd-event-capability-pilot'],output:path.join(root,'phase'),onPrepared:()=>assert.fail('unexpected handoff')}),error=>{
    assert.equal(error.nativeFailure.code,'CI_PHASE_LAUNCH_INPUTS_REQUIRED');
    assert.equal(error.nativeFailure.firstCausalCode,'NATIVE_FAILURE_UNCLASSIFIED');return true;
  });
});

test('transition diagnostics survive a later cleanup exception through the real fixed CI sequence', async () => {
  const {runFixedCiPilots} = await import('./run-harness-ci.mjs');
  const {annotateNativeFailure,nativeFailure} = await import('./lib/exui-native-failure.mjs');
  await assert.rejects(runFixedCiPilots({
    phase:async name=>{
      if(name==='eventCapability')throw annotateNativeFailure(new Error('CCD_IMPORTED_DEFINITION_DRIFT\nPRIVATE-CANARY'),{phase:name,invocation:'ccd-remove-readonly-recipient-read',category:'transition'});
      return {status:'PASS',exitCode:0};
    },derive:async()=>{},start:async()=>{},stop:async()=>{},startEvent:async()=>{},
    stopEvent:async()=>{throw new Error('CI_NATIVE_CLEANUP_INCOMPLETE');},
  }),error=>{
    const result=nativeFailure(error);
    assert.equal(result.firstCausalCode,'CCD_IMPORTED_DEFINITION_DRIFT');
    assert.equal(result.phase,'eventCapability');assert.equal(result.category,'transition');
    assert.equal(result.invocation,'ccd-remove-readonly-recipient-read');
    return true;
  });
});

test('Jenkins publication and console preserve safe diagnostic context and redact legacy unknown messages', async t => {
  const {publishSummary,logNativeCompletion}=await import('./run-harness-jenkins-assurance.mjs');
  const {writePublicSummary,validatePublicSummary}=await import('./lib/exui-evidence-io.mjs');
  const root=temp(t);fs.mkdirSync(path.join(root,'public'));fs.mkdirSync(path.join(root,'private'));
  writePublicSummary(path.join(root,'public/release-assurance-summary.json'),{status:'BLOCKED',failure:diagnostic});
  const target=path.join(root,'published.json');
  assert.equal(publishSummary(root,target),'BLOCKED');
  assert.deepEqual(validatePublicSummary(target).failure,diagnostic);
  fs.writeFileSync(path.join(root,'private/ci-result.json'),JSON.stringify({status:'BLOCKED',phaseResults:[{phase:'ccd',status:'PASS'}],cleanupComplete:true,failure:diagnostic}));
  const messages=[];t.mock.method(console,'log',m=>messages.push(m));logNativeCompletion(root);
  assert.match(messages[0],/first causal CCD_IMPORTED_DEFINITION_DRIFT.*phase eventCapability.*invocation ccd-remove-readonly-recipient-read.*category transition/);
  fs.writeFileSync(path.join(root,'private/ci-result.json'),JSON.stringify({status:'BLOCKED',phaseResults:[],cleanupComplete:true}));
  fs.writeFileSync(path.join(root,'private/orchestration-error.json'),JSON.stringify({message:'PRIVATE_CANARY_TOKEN'}));
  logNativeCompletion(root);assert.match(messages[1],/NATIVE_FAILURE_UNCLASSIFIED/);assert.doesNotMatch(messages.join('\n'),/PRIVATE_CANARY_TOKEN|NATIVE_PREFLIGHT_FAILED/);
});
