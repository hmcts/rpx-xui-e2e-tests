const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {jointPacket}=require('./exui-st-cic-joint-packet.mock.cjs');
const read=file=>JSON.parse(fs.readFileSync(file));
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
async function jointOwnershipPacket(t){
 const x=await jointPacket(t),{nativeInvocations}=await import('../lib/exui-native-contract.mjs');
 // Old source fixtures intentionally omitted complete ownership metadata. Populate
 // finite test-owned raw records; never relax the production ownership contract.
 for(const phase of x.expected.phases){
  const folder=path.join(x.f.directory,'private',phase.phase),file=path.join(folder,'owned-resources.json'),rows=read(file);
  rows.forEach((row,index)=>{row.id??=createHash('sha256').update(phase.phase+index).digest('hex');row.owner??=phase.expected.runId;row.name??=phase.expected.runId+'-ownership-'+index;row.mounts??=[{source:folder,target:'/output',writable:true}];});write(file,rows);
  const inputFile=path.join(folder,'input.json'),input=read(inputFile);if(input.ccd&&!input.ccd.containers){input.ccd=structuredClone(x.f.event.input.ccd);write(inputFile,input);}
  write(path.join(folder,'container-launch.json'),{stateRoot:path.join(path.dirname(x.f.directory),'ownership-state-'+phase.phase)});
  for(const invocation of nativeInvocations(phase.expected.releaseScopeId)){const file=path.join(folder,invocation.invocationId,'candidate-lifecycle.json'),lifecycle=read(file),before=JSON.stringify(lifecycle);for(const info of [lifecycle.before,lifecycle.after]){info.Id??=createHash('sha256').update(phase.phase+invocation.invocationId).digest('hex');info.Name??='/'+phase.expected.runId+'-'+invocation.invocationId+'-candidate';}if(JSON.stringify(lifecycle)!==before)write(file,lifecycle);}
 }
 const main=await import('../lib/exui-native-report-evidence.mjs');
 x.replayMain=()=>main.readNativeReportEvidence(x.f.descriptorPath);
 assert.equal((await x.replayMain()).status,'PASS');
 x.check=m=>m.assertStCicOwnership(x.f.directory,x.expected,{stCicRequestPath:x.requestPath});
 x.familyFile=path.join(x.f.directory,'private/family/owned-resources.json');
 x.stCicRows=read(path.join(x.c.directory,'st-cic-global-search','owned-resources.json'));
 return x;
}
module.exports={jointOwnershipPacket};
