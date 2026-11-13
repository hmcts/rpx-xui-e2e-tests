const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {jointOwnershipPacket:packet}=require('./fixtures/exui-st-cic-joint-ownership.mock.cjs');
const read=file=>JSON.parse(fs.readFileSync(file));
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
const load=()=>import('./lib/exui-st-cic-ownership.mjs');

test('complete raw main/profile packets are disjoint while immutable candidate/browser/dependencies remain shared',async t=>{
 const m=await load(),x=await packet(t);assert.equal(x.check(m),true);
 assert.equal(x.packet.binding.artifact.identity.artifactDigest,x.native.candidate.identity.artifactDigest);
});
for(const field of ['id','name','owner','namespace'])test(`individually replayable raw packets cannot reuse a cross-cohort ${field}`,async t=>{
 const m=await load(),x=await packet(t),rows=read(x.familyFile);rows[0][field]=field==='namespace'?x.stCicRows.find(r=>r.service==='candidate').namespace:x.stCicRows[0][field];write(x.familyFile,rows);
 assert.equal((await x.replayMain()).status,'PASS','old raw boundary remains green');
 assert.deepEqual(x.m.readStCicProfileAdmissionPacket(x.requestPath,x.requestPin),x.packet,'profile raw packet remains valid');
 assert.throws(()=>x.check(m),/ST_CIC_CROSS_COHORT_OWNERSHIP/);
});
test('mutable private workspace reuse and parent/child overlap reject even with separate output folders',async t=>{
 const m=await load(),x=await packet(t),state=path.dirname(x.stCicRows[0].mounts.find(row=>row.target==='/harness').source),file=path.join(x.f.directory,'private/family/container-launch.json');
 for(const current of [state,path.join(state,'nested')]){write(file,{stateRoot:current});assert.equal((await x.replayMain()).status,'PASS');assert.throws(()=>x.check(m),/ST_CIC_CROSS_COHORT_OWNERSHIP/);}
});
test('missing actual resource metadata and altered request pins fail closed',async t=>{
 const m=await load(),x=await packet(t),rows=read(x.familyFile);delete rows[0].id;write(x.familyFile,rows);assert.throws(()=>x.check(m),/ST_CIC_CROSS_COHORT_OWNERSHIP/);
 const y=await packet(t);y.expected.stCicProfileRequest={...y.requestPin,digest:'sha256:'+'0'.repeat(64)};assert.throws(()=>y.check(m),/ST_CIC_CROSS_COHORT_OWNERSHIP/);
 y.expected.stCicProfileRequest=y.requestPin;y.expected.personalServiceRequest={runId:'personal',digest:'sha256:'+'1'.repeat(64)};assert.throws(()=>y.check(m),/ST_CIC_CROSS_COHORT_OWNERSHIP/);
});

test('a separately valid foreign DIVORCE packet cannot reuse ST_CIC owners',async t=>{
 const m=await load(),x=await packet(t),d=await require('./fixtures/exui-divorce-joint-packet.mock.cjs').jointFixture(t);
 const api=await import('./lib/exui-divorce-profile-admission.mjs'),pin=d.descriptor.expected.divorceProfileRequest;
 const sibling=api.readDivorceProfileAdmissionPacket(d.requestFile,pin,d.c.configurationFor);
 const overlap=Object.values(sibling.binding.owners).some(owner=>Object.values(x.packet.binding.owners).includes(owner));
 assert.equal(overlap,true,'the complete independently replayed fixture deliberately exposes owner reuse');
 x.expected.divorceProfileRequest=pin;
 assert.throws(()=>m.assertStCicOwnership(x.f.directory,x.expected,{stCicRequestPath:x.requestPath,divorceRequestPath:d.requestFile}),/ST_CIC_CROSS_COHORT_OWNERSHIP/);
});

test('fixed personal baseline/optional inventories are read from a separately validated packet',async t=>{
 const m=await load(),x=await packet(t),p=await require('./fixtures/exui-personal-service-admission.mock.cjs').personalAdmissionFixture(t);
 const sibling=p.m.readPersonalAdmissionPacket(p.requestPath,p.pin);assert.equal(sibling.admission.status,'passed');
 x.expected.personalServiceRequest=p.pin;
 assert.equal(m.assertStCicOwnership(x.f.directory,x.expected,{stCicRequestPath:x.requestPath,personalRequestPath:p.requestPath}),true);
});
test('fixed Complex context inventories require the actual held request and validated packet',async t=>{
 const m=await load(),x=await packet(t),c=await require('./fixtures/exui-complex-email-admission.mock.cjs').fixture(t),sibling=await c.read();
 x.expected.complexEmailRequest=c.pin;
 assert.equal(m.assertStCicOwnership(x.f.directory,x.expected,{stCicRequestPath:x.requestPath,complexRequestPath:c.requestPath,complexPacket:sibling}),true);
 const changed=structuredClone(sibling);changed.expected.contexts['browser-baseline'].closed.ids=[];
 assert.throws(()=>m.assertStCicOwnership(x.f.directory,x.expected,{stCicRequestPath:x.requestPath,complexRequestPath:c.requestPath,complexPacket:changed}),/ST_CIC_CROSS_COHORT_OWNERSHIP/);
});
