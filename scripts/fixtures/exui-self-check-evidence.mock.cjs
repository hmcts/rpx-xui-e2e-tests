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
