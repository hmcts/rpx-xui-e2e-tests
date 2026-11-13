// Private, finite pre-JSON capture for the two reviewed helper details only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {isDeepStrictEqual}=require('node:util');
const details=require('./harness-public-check-details.cjs'),methods=require('./harness-public-check-steps.cjs'),overview=require('./harness-public-overview.cjs');
const fail=()=>{throw Error('HARNESS_DETAIL_CAPTURE_INVALID');};
const hash=bytes=>'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
const keys=(v,n)=>v&&typeof v==='object'&&!Array.isArray(v)&&isDeepStrictEqual(Object.keys(v).sort(),[...n].sort());
const identity=entry=>JSON.stringify([entry.file,overview.normalize(entry).titlePath]);
const expectedEntries=phase=>phase==='offline'?overview.profiles.harness.filter(entry=>details.declarationsFor(entry).length):[];
function read(file,max=128*1024*1024){
 try{
 if(typeof file!=='string'||!path.isAbsolute(file)||path.normalize(file)!==file||fs.realpathSync(file)!==file||!fs.lstatSync(file).isFile())fail();const bytes=fs.readFileSync(file);if(bytes.length>max)fail();return{bytes,digest:hash(bytes)};
 }catch{fail();}
}
function requestAt(file,digest){
 try{
 if(path.basename(file)!=='detail-request.json'||!/^sha256:[a-f0-9]{64}$/.test(digest))fail();const actual=read(file,64*1024);if(actual.digest!==digest)fail();const value=JSON.parse(actual.bytes);
 if(!keys(value,['schemaVersion','kind','runId','phase','root','output','registryDigest'])||value.schemaVersion!==1||value.kind!=='harness-detail-phase-request'||!/^[a-f0-9-]{36}$/.test(value.runId)||!['offline','aat'].includes(value.phase)||value.output!=='detail-events.json'||value.registryDigest!==details.registryDigest()||!path.isAbsolute(value.root)||fs.realpathSync(value.root)!==value.root||!fs.lstatSync(value.root).isDirectory())fail();return value;
 }catch{fail();}
}
function preparePhase(output,phase,root){
 if(!['offline','aat'].includes(phase)||fs.realpathSync(output)!==output||!fs.lstatSync(output).isDirectory()||fs.lstatSync(path.join(output,'detail-events.json'),{throwIfNoEntry:false}))fail();
 const request={schemaVersion:1,kind:'harness-detail-phase-request',runId:crypto.randomUUID(),phase,root,output:'detail-events.json',registryDigest:details.registryDigest()},file=path.join(output,'detail-request.json'),bytes=JSON.stringify(request,null,2)+'\n';fs.writeFileSync(file,bytes,{flag:'wx',mode:0o400});const digest=hash(bytes);requestAt(file,digest);return{path:file,digest};
}
function validateDocument(value,request,requestDigest){
 if(!keys(value,['schemaVersion','kind','runId','requestDigest','phase','registryDigest','checks'])||value.schemaVersion!==1||value.kind!=='harness-detail-phase-result'||value.runId!==request.runId||value.requestDigest!==requestDigest||value.phase!==request.phase||value.registryDigest!==request.registryDigest||!Array.isArray(value.checks))fail();
 const expected=expectedEntries(request.phase);if(value.checks.length!==expected.length)fail();value.checks.forEach((row,index)=>{if(!keys(row,['file','titlePath','status','parents','details'])||identity(row)!==identity(expected[index]))fail();methods.validateCheckSteps(expected[index],row.parents,row.status);details.validateCapturedDetails(expected[index],row.details,row.parents);});return value;
}
function readCapture(held){
 try{
 if(!keys(held,['request','json','result'])||!['request','json','result'].every(key=>keys(held[key],['path','digest'])))fail();const request=requestAt(held.request.path,held.request.digest),directory=path.dirname(held.request.path);
 if(held.json.path!==path.join(directory,'playwright.json')||held.result.path!==path.join(directory,request.output))fail();
 for(const key of ['json','result'])if(read(held[key].path,key==='result'?64*1024:undefined).digest!==held[key].digest)fail();const document=validateDocument(JSON.parse(read(held.result.path,64*1024).bytes),request,held.request.digest);return{request,document};
 }catch{fail();}
}
function holdPhase(request,jsonFile,jsonDigest){
 const value=requestAt(request.path,request.digest),resultFile=path.join(path.dirname(request.path),value.output),held={request:structuredClone(request),json:{path:jsonFile,digest:jsonDigest},result:{path:resultFile,digest:read(resultFile,64*1024).digest}};readCapture(held);return held;
}
function bindPhase(normalized,held){
 const {request,document}=readCapture(held),selected=normalized.records.filter(row=>details.declarationsFor(row.entry).length);if(selected.length!==document.checks.length||normalized.records.some(row=>row.observed.runnerPhase!==request.phase))fail();
 for(const row of normalized.records){const captured=document.checks.find(check=>identity(check)===identity(row.entry));if(captured){if(row.observed.status!==captured.status||!isDeepStrictEqual(row.observed.checkSteps,captured.parents))fail();const json=row.observed.jsonCheckDetails;if(!Array.isArray(json)||json.length!==captured.details.length)fail();json.forEach((step,index)=>{const actual=captured.details[index];if(!isDeepStrictEqual({...actual,status:actual.status==='skipped'?'passed':actual.status},step))fail();});row.observed.checkDetails=details.validateDetails(row.entry,captured.details,row.observed.checkSteps,row.observed.status);}else row.observed.checkDetails=[];delete row.observed.jsonCheckDetails;}
 return normalized;
}
function verifyCaptures(captures){
 if(!Array.isArray(captures)||!['offline','offline,aat'].includes(captures.map(held=>readCapture(held).request.phase).join(',')))fail();
}
class DetailRecorder{
 constructor(){this.pin={path:process.env.HARNESS_DETAIL_REQUEST_PATH,digest:process.env.HARNESS_DETAIL_REQUEST_DIGEST};this.request=requestAt(this.pin.path,this.pin.digest);this.checks=new Map();this.invalid=false;}
 onBegin(_config,suite){try{const found=suite.allTests().map(test=>this.entry(test)).filter(entry=>details.declarationsFor(entry).length);assert.deepEqual(found.map(identity).sort(),expectedEntries(this.request.phase).map(identity).sort());}catch{this.invalid=true;fail();}}
 entry(test){return overview.normalize({file:path.relative(this.request.root,test.location.file).split(path.sep).join('/'),titlePath:test.titlePath()});}
 onTestEnd(test,result){try{requestAt(this.pin.path,this.pin.digest);const entry=this.entry(test),parents=methods.validateCheckSteps(entry,methods.extractCheckSteps(entry,result.steps,'framework'),result.status),captured=details.captureDetails(entry,result.steps,'framework',parents);if(details.declarationsFor(entry).length){if(result.retry!==0||this.checks.has(identity(entry)))fail();this.checks.set(identity(entry),{file:entry.file,titlePath:entry.titlePath,status:result.status,parents,details:captured});}}catch{this.invalid=true;fail();}}
 onEnd(){try{if(this.invalid)fail();requestAt(this.pin.path,this.pin.digest);const expected=expectedEntries(this.request.phase);if(this.checks.size!==expected.length)fail();const value={schemaVersion:1,kind:'harness-detail-phase-result',runId:this.request.runId,requestDigest:this.pin.digest,phase:this.request.phase,registryDigest:this.request.registryDigest,checks:expected.map(entry=>this.checks.get(identity(entry)))};validateDocument(value,this.request,this.pin.digest);fs.writeFileSync(path.join(path.dirname(this.pin.path),this.request.output),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});}catch{this.invalid=true;fail();}}
}
module.exports=DetailRecorder;
Object.assign(module.exports,{preparePhase,holdPhase,readCapture,bindPhase,verifyCaptures});
