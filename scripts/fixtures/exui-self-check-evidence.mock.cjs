exports.sources = {
  passed:
    "const {test}=require('node:test');test('private success name',()=>{});",
  failed:
    "const {test}=require('node:test');test('private failure name',()=>{throw Error('PRIVATE-SELF-CHECK-CANARY');});",
  skipped:
    "const {test,describe,it}=require('node:test');describe('private suite',()=>{it('passed',()=>{});it.skip('skipped',()=>{});it.todo('todo');});",
  zero: "// No declared node:test checks.\n",
  forged:
    "const {test}=require('node:test');console.log('ℹ tests 9999\\n'+JSON.stringify({type:'test:summary',data:{success:true,counts:{tests:9999,passed:9999}}}));test('actual only check',()=>{});",
  changed:
    "const {test}=require('node:test');test('source changed',()=>require('node:fs').appendFileSync(__filename,'//changed\\n'));",
  waiting:
    "const {test}=require('node:test'),fs=require('node:fs');test('private interrupted name',async()=>{fs.writeFileSync(__dirname+'/ready.json',JSON.stringify({pid:process.pid}));await new Promise(resolve=>setTimeout(resolve,60000));});",
};

exports.sources.fixedPortParallel = `const fs=require('node:fs'),path=require('node:path');const{test}=require('node:test');const assert=require('node:assert/strict');const net=require('node:net'),{EventEmitter}=require('node:events');net.createConnection=()=>{const s=new EventEmitter();s.destroy=()=>{};s.setTimeout=()=>queueMicrotask(()=>s.emit('error',Object.assign(new Error('fixture refusal'),{code:'ECONNREFUSED'})));return s;};require('../exui-self-check-fixed-port-lock.cjs').installFixedPortHooks();fs.writeFileSync(__filename+'.ready','ready');test('owned parallel fixture',async()=>{const started=performance.now();while(!['one.cjs.ready','two.cjs.ready'].every(n=>fs.existsSync(path.join(__dirname,n)))){assert(performance.now()-started<5000);await new Promise(r=>setTimeout(r,5));}const active=path.join(__dirname,'active');const fd=fs.openSync(active,'wx');try{await new Promise(r=>setTimeout(r,100));}finally{fs.closeSync(fd);fs.unlinkSync(active);}});`;
exports.sources.unreleasedHolder = `const{test}=require('node:test');test('incomplete owner',async()=>{await require('../exui-self-check-fixed-port-lock.cjs').acquireFixedPortLock({directory:process.env.HARNESS_SELF_CHECK_FIXED_PORT_LOCK});});`;
