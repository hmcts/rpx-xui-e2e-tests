const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {eventV3Fixture}=require('./exui-event-v3.mock.cjs');
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
// Synthetic protocol/report/import data, never a native execution or readback oracle.
exports.eventV3PolicySemanticFixture=async(t,invocationId)=>{
 const f=await eventV3Fixture(t),index=f.expected.faults.findIndex(row=>row.invocationId===invocationId);
 if(index<0)throw Error('UNIT_FIXED_FAULT_REQUIRED');
 const saveRun=()=>{f.runPin={path:'run.json',digest:hash(fs.readFileSync(path.join(f.directory,'run.json')))};};
 const run=f.read('run.json');
 for(const row of run.mutations){const entry=f.expected.faults.find(item=>item.invocationId===row.mutationId),capture=f.read(entry.capture.path),derivation=f.read(row.derivationArtifact.path);derivation.runtimeRecord=capture.runtimeRecord;row.derivationArtifact=f.put(row.derivationArtifact.path,derivation);}
 f.put('run.json',run);saveRun();
 f.changeFaultReport=(change,id=invocationId)=>{
  const current=f.read('run.json'),reference=current.executionArtifacts.find(row=>row.path===id+'/execution.json'),execution=f.read(reference.path),report=f.read(execution.resultArtifact.path);
  change(report);execution.resultArtifact=f.put(execution.resultArtifact.path,report);Object.assign(reference,f.put(reference.path,execution));f.put('run.json',current);saveRun();
 };
 f.changeDerivation=(change,id=invocationId)=>{
  const current=f.read('run.json'),row=current.mutations.find(item=>item.mutationId===id),value=f.read(row.derivationArtifact.path);change(value);row.derivationArtifact=f.put(row.derivationArtifact.path,value);f.put('run.json',current);saveRun();
 };
 f.changeFaultImport=(change,id=invocationId)=>{
  const ordinal=f.expected.faults.findIndex(row=>row.invocationId===id),entry=f.expected.faults[ordinal],capture=f.read(entry.capture.path),runtime=f.read(capture.runtimeRecord.path),file=path.join(runtime.ccd.output,'definition-import.json'),receipt=JSON.parse(fs.readFileSync(file));
  change(receipt);const bytes=JSON.stringify(receipt);fs.writeFileSync(file,bytes);const pin=hash(bytes);
  f.rewriteRuntime(ordinal,current=>{current.definition=receipt;current.definitionImportDigest=pin;});
  const manifest=f.read(id+'/manifest.json');manifest.runtimeMetadata.definitionImportDigest=pin;f.put(id+'/manifest.json',manifest);
  f.changeDerivation(value=>{value.runtimeRecord=f.read(f.expected.faults[ordinal].capture.path).runtimeRecord;value.mutantRuntimeMetadata.definitionImportDigest=pin;},id);
 };
 return Object.assign(f,{invocationId,index,saveRun});
};
