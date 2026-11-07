const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { tinyTree, fakeModule, original, parallel, flatNodes, deferred } = require('./fixtures/exui-parallel-candidate-tree.mock.cjs');
const reference = async (...args) => (await import('./fixtures/exui-candidate-artifact-frozen-digest.mjs')).digestCandidateTree(...args);
const experimental = async (...args) => (await import('./lib/exui-candidate-artifact.mjs')).digestCandidateTree(...args);

for(const umask of [0o022,0o077]) test(`exact reference identity on sorted nested large/mode/link fixture under umask ${umask.toString(8)}`,async t=>{
  const previous=process.umask(umask);t.after(()=>process.umask(previous));const root=await tinyTree(t);
  for(const replacements of [new Map(),new Map([['a-first',''],['empty',Buffer.alloc(0)],['nested/large','replacement']]),new Map([['z-last',null],['a-first',undefined],['missing','unused']])]) assert.equal(await experimental(root,replacements),await reference(root,replacements));
  const before=await experimental(root);await fs.chmod(path.join(root,'a-first'),0o640);assert.notEqual(await experimental(root),before);assert.equal(await experimental(root),await reference(root));
});

test('exact ordered transcript and single metadata traversal match original',async t=>{
  const nodes=flatNodes();nodes.set('05',{kind:'link',target:'/synthetic-candidate/00',link:'00',mode:0o777});
  const old=await fakeModule(t,original,nodes),next=await fakeModule(t,parallel,nodes);
  assert.equal(await next.api.digestCandidateTree(next.root),await old.api.digestCandidateTree(old.root));
  assert.deepEqual(next.transcript,old.transcript);
  for(const operation of ['lstat','realpath','readlink','readdir','readFile']) assert.deepEqual(next.calls.filter(([op])=>op===operation),old.calls.filter(([op])=>op===operation),operation);
});

for(const fault of ['escape','dangling','unsupported','missing','directory']) test(`reference failure preserved: ${fault}`,async t=>{
  const nodes=flatNodes(2);
  if(fault==='escape')nodes.set('01',{kind:'link',target:'/outside',link:'../outside'});
  if(fault==='dangling')nodes.set('01',{kind:'link',realpathError:Object.assign(Error('dangling'),{code:'ENOENT'})});
  if(fault==='unsupported')nodes.set('01',{kind:'fifo'});
  if(fault==='missing')nodes.delete('01');
  if(fault==='directory')nodes.get('').directoryError=Object.assign(Error('directory denied'),{code:'EACCES'});
  const old=await fakeModule(t,original,nodes),next=await fakeModule(t,parallel,nodes);
  const error=async f=>{try{await f.api.digestCandidateTree(f.root);assert.fail('must reject');}catch(e){return{message:e.message,code:e.code};}};
  assert.deepEqual(await error(next),await error(old));assert.equal(next.active.size,0);
});

test('four-file cap permits overlap, out-of-order completion preserves transcript',{timeout:1000},async t=>{
  const nodes=flatNodes(),gates=new Map([...nodes.keys()].filter(Boolean).map(k=>[k,deferred()])),started=deferred();let count=0;
  const next=await fakeModule(t,parallel,nodes,{read:async key=>{if(++count===4)started.resolve();await gates.get(key).promise;return Buffer.from(key);}});
  const running=next.api.digestCandidateTree(next.root);
  // Root metadata occupies a FIFO slot until drained; four regular reads still overlap.
  await started.promise;await new Promise(resolve=>setImmediate(resolve));assert.equal(next.maxActive,4);assert.equal(count,4);
  for(const key of [...gates.keys()].reverse())gates.get(key).resolve();
  const observed=await running;const old=await fakeModule(t,original,nodes);
  assert.equal(observed,await old.api.digestCandidateTree(old.root));assert.equal(next.maxActive,4);assert.equal(next.active.size,0);assert.deepEqual(next.transcript,old.transcript);
});

test('later read failure waits for earlier pending read and chooses first DFS failure',async t=>{
  const nodes=flatNodes(5),first=deferred(),later=deferred(),started=deferred();let launched=0,settled=false;
  const firstError=Error('first ordered read'),laterError=Error('later completed read');
  const next=await fakeModule(t,parallel,nodes,{read:async key=>{if(++launched===3)started.resolve();if(key==='00')return first.promise;if(key==='01')return later.promise;return Buffer.from(key);}});
  const running=next.api.digestCandidateTree(next.root).finally(()=>settled=true);const checked=assert.rejects(running,error=>error===firstError);
  await started.promise;later.reject(laterError);await Promise.resolve();assert.equal(settled,false);first.reject(firstError);await checked;assert.equal(next.active.size,0);assert(launched<=4);
});

test('earlier file error outranks later metadata error and all reads settle',async t=>{
  const nodes=flatNodes(3),gate=deferred(),seen=deferred(),fileError=Object.assign(Error('earlier read denied'),{code:'EACCES'});
  nodes.get('01').statError=Error('later metadata');
  const next=await fakeModule(t,parallel,nodes,{read:async()=>{seen.resolve();return gate.promise;}});
  const checked=assert.rejects(next.api.digestCandidateTree(next.root),error=>error===fileError);await seen.promise;gate.reject(fileError);await checked;assert.equal(next.active.size,0);
});

test('late stream I/O error propagates unchanged after stream finally joins',async t=>{
  const nodes=flatNodes(1);nodes.get('00').data='x'.repeat(1024*1024+1);let closed=false;const failure=Object.assign(Error('late stream failure'),{code:'EIO'});
  const next=await fakeModule(t,parallel,nodes,{async *stream(){try{yield Buffer.from('prefix');throw failure;}finally{closed=true;}}});
  await assert.rejects(next.api.digestCandidateTree(next.root),error=>error===failure);assert(closed);assert.equal(next.active.size,0);assert(next.calls.some(([op])=>op==='stream'));assert(!next.calls.some(([op])=>op==='readFile'));
});

test('observed read failure during pending metadata schedules no subsequent file read',async t=>{
  const nodes=flatNodes(3),readGate=deferred(),metadataGate=deferred(),metadataStarted=deferred();
  const next=await fakeModule(t,parallel,nodes,{read:async()=>readGate.promise,beforeStat:async key=>{if(key==='01'){metadataStarted.resolve();await metadataGate.promise;}}});
  const failure=Error('read rejected while metadata pending');
  const checked=assert.rejects(next.api.digestCandidateTree(next.root),error=>error===failure);
  await metadataStarted.promise;readGate.reject(failure);await Promise.resolve();metadataGate.resolve();await checked;
  assert.deepEqual(next.calls.filter(([op])=>op==='readFile').map(([,file])=>file),['00']);assert.equal(next.active.size,0);
});

test('failure returns only after an already-started sibling read settles',async t=>{
  const nodes=flatNodes(2),first=deferred(),sibling=deferred(),started=deferred();let count=0,terminal=false;
  const next=await fakeModule(t,parallel,nodes,{read:async key=>{if(++count===2)started.resolve();return key==='00'?first.promise:sibling.promise;}});
  const failure=Error('first failed file');
  const running=next.api.digestCandidateTree(next.root).finally(()=>terminal=true),checked=assert.rejects(running,error=>error===failure);
  await started.promise;first.reject(failure);await new Promise(resolve=>setImmediate(resolve));assert.equal(terminal,false);
  sibling.resolve(Buffer.from('01'));await checked;assert.equal(next.active.size,0);
});

test('actual filesystem rejects escaped and dangling symlinks just like the reference',async t=>{
  const root=await tinyTree(t),link=path.join(root,'zz-invalid-link');
  await fs.symlink('..',link);
  for(const run of [reference,experimental])await assert.rejects(run(root),/Artifact symlink escapes root: zz-invalid-link/);
  await fs.unlink(link);await fs.symlink('missing-target',link);
  for(const run of [reference,experimental])await assert.rejects(run(root),{code:'ENOENT'});
});
