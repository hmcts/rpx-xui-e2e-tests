const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { fileURLToPath, pathToFileURL } = require('node:url');

const original = pathToFileURL(path.join(__dirname, 'exui-candidate-artifact-frozen-digest.mjs'));
const parallel = pathToFileURL(path.join(__dirname, '../lib/exui-candidate-artifact.mjs'));
async function tinyTree(t) {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'parallel-tree-fixture-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'nested'));
  await fs.mkdir(path.join(root, 'empty-directory'));
  for (const [name, contents] of [['z-last','last'],['a-first','first'],['empty',''],['nested/é-case','unicode'],['nested/large',Buffer.alloc(1024 * 1024 + 19, 7)]]) await fs.writeFile(path.join(root,name),contents);
  await fs.chmod(path.join(root,'a-first'),0o751);
  await fs.symlink('../a-first',path.join(root,'nested/link'));
  return root;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes,no) => { resolve=yes; reject=no; });
  return { promise, resolve, reject };
}
// Synthetic IO only in import-relocated test copies; no production injection API.
async function fakeModule(t, moduleUrl, nodes, {read, stream, beforeStat} = {}) {
  const root='/synthetic-candidate';
  const transcript=[], calls=[], active=new Set(); let maxActive=0;
  const stat = node => ({mode:node.mode??0o644,size:Buffer.byteLength(node.data??''),isSymbolicLink:()=>node.kind==='link',isDirectory:()=>node.kind==='directory',isFile:()=>node.kind==='file'});
  const name = absolute => path.relative(root,absolute);
  const io={
    constants:{},
    async realpath(file) { calls.push(['realpath',name(file)]);const node=nodes.get(name(file));if(node?.realpathError)throw node.realpathError;return node?.target??file; },
    async lstat(file) { calls.push(['lstat',name(file)]);if(beforeStat)await beforeStat(name(file));const node=nodes.get(name(file));if(!node)throw Object.assign(Error('missing:'+name(file)),{code:'ENOENT'});if(node.statError)throw node.statError;return stat(node); },
    async readdir(file) {calls.push(['readdir',name(file)]);const node=nodes.get(name(file));if(node.directoryError)throw node.directoryError;return node.children;},
    async readlink(file) {calls.push(['readlink',name(file)]);return nodes.get(name(file)).link;},
    async readFile(file) {const key=name(file);calls.push(['readFile',key]);active.add(key);maxActive=Math.max(maxActive,active.size);try{return read?await read(key):Buffer.from(nodes.get(key).data);}finally{active.delete(key);}},
    async *createReadStream(file) {const key=name(file);calls.push(['stream',key]);active.add(key);maxActive=Math.max(maxActive,active.size);try{if(stream)yield* stream(key);else yield Buffer.from(nodes.get(key).data);}finally{active.delete(key);}},
    createHash(algorithm) {const actual=createHash(algorithm),isTranscript=io.hashCount++===0;return{update(value){if(isTranscript)transcript.push(Buffer.from(value));actual.update(value);return this;},digest(format){return actual.digest(format);}};},hashCount:0
  };
  const key='hash_fixture_'+randomUUID().replaceAll('-','');globalThis[key]=io;t.after(()=>delete globalThis[key]);
  const url = body => 'data:text/javascript;base64,'+Buffer.from(body).toString('base64');
  const promises=url(`const f=globalThis[${JSON.stringify(key)}];export const {lstat,readFile,readdir,readlink,realpath,cp,lchmod}=f;`);
  const streams=url(`const f=globalThis[${JSON.stringify(key)}];export const {constants,createReadStream}=f;`);
  const crypto=url(`const f=globalThis[${JSON.stringify(key)}];export const {createHash}=f;`);
  let source=await fs.readFile(fileURLToPath(moduleUrl),'utf8');
  source=source.replaceAll("'node:fs/promises'",JSON.stringify(promises)).replaceAll("'node:fs'",JSON.stringify(streams)).replaceAll("'node:crypto'",JSON.stringify(crypto));
  const api=await import(url(source));
  return {api,root,transcript,calls,active,get maxActive(){return maxActive;}};
}
function flatNodes(count=8) {
  const names=Array.from({length:count},(_,i)=>String(i).padStart(2,'0'));
  return new Map([['',{kind:'directory',mode:0o755,children:[...names].reverse()}],...names.map(name=>[name,{kind:'file',data:name}])]);
}

module.exports = { original, parallel, tinyTree, deferred, fakeModule, flatNodes };
