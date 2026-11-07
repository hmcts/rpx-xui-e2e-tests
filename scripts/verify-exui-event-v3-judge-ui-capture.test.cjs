const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const ts=require('typescript');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const spec=path.join(__dirname,'../src/tests/harness/ccd/event-capability.spec.ts');
const fixture=path.join(__dirname,'../src/fixtures/harnessCcdEvent.ts');
function captureStatement(){
 const source=ts.createSourceFile(spec,fs.readFileSync(spec,'utf8'),ts.ScriptTarget.Latest,true);
 const nodes=[];
 function visit(n){
  if(ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(source)==='saveCcdEventObservation'&&n.expression.arguments[0]?.text==='judge-event-ui') nodes.push(n);
  ts.forEachChild(n,visit);
 }
 visit(source);assert.equal(nodes.length,1,'one actual judge UI capture is required');return nodes[0].getText(source);
}
test('judge UI receipt copies actual measured response, actor, marker text and visibility only',async()=>{
 const code=captureStatement();
 for(const visible of [true,false]){
  let saved;
  const page={getByText:(text,options)=>{assert.equal(text,'event@harness.example.com');assert.deepEqual(options,{exact:true});return {textContent:async()=> 'measured marker',isVisible:async()=>visible};}};
  await new AsyncFunction('page','caseId','sessionUser','sessionResponse','saveCcdEventObservation',code)(page,'observed-case',{uid:'actual-actor',roles:['private-role'],token:'SECRET_CANARY'},{status:()=>207},(name,value)=>{assert.equal(name,'judge-event-ui');saved=value;});
  assert.deepEqual(saved,{schemaVersion:1,kind:'judge-event-ui-observation',caseId:'observed-case',actorId:'actual-actor',userDetailsStatus:207,visibleMarkers:[{text:'measured marker',visible}]});
  assert(!JSON.stringify(saved).includes('SECRET_CANARY'));
 }
});
test('judge UI receipt uses finite private write-once saver and preserves failed capture',async t=>{
 const source=ts.createSourceFile(fixture,fs.readFileSync(fixture,'utf8'),ts.ScriptTarget.Latest,true);
 const fn=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text==='saveCcdEventObservation');
 const code=ts.transpileModule(fn.getText(source).replace('export ',''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'judge-ui-capture-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const processFake={env:{EXUI_CCD_EVIDENCE:root}};
 const save=new Function('fs','path','process','sharedRoleEventEnvelope','eventProofInputs','ccdEventPersonas',code+';return saveCcdEventObservation;')(fs,path,processFake,()=>{throw Error('foreign role wrapper');},()=>{throw Error('foreign proof');},()=>{throw Error('foreign persona');});
 save('judge-event-ui',{actual:true});
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'judge-event-ui-observation.json'))),{actual:true});
 assert.equal(fs.statSync(path.join(root,'judge-event-ui-observation.json')).mode&0o777,0o600);
 assert.throws(()=>save('judge-event-ui',{actual:false}),/EEXIST/);
 const page={getByText:()=>({textContent:async()=>{throw Error('MEASURE_FAILED');}})};
 await assert.rejects(new AsyncFunction('page','caseId','sessionUser','sessionResponse','saveCcdEventObservation',captureStatement())(page,'case',{id:'actor'},{status:()=>200},save),/MEASURE_FAILED/);
});
