const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const token = 'synthetic.service.signature';
test('support only: callback service verifier uses fixed owned S2S and exact verified identity',async()=>{
 const {createOwnedCallbackServiceVerifier}=await import('./lib/exui-recipient-callback-auth.mjs');
 const calls=[];
 const verify=createOwnedCallbackServiceVerifier({fetchService:async(url,options)=>{calls.push({url,options});return new Response('ccd_data',{status:200});}});
 assert.equal(await verify(token),'ccd_data');assert.equal(await verify('Bearer '+token),'ccd_data');
 assert(calls.every(c=>c.url==='http://127.0.0.1:4502/details'&&c.options.headers.Authorization==='Bearer '+token&&c.options.redirect==='error'));
});
for(const [name,status,body] of [['wrong service',200,'ccd_gw'],['user bearer',401,'unauthorized'],['JSON',200,'{"service":"ccd_data"}'],['whitespace',200,'ccd_data\n'],['redirect',302,'ccd_data'],['oversized',200,'x'.repeat(65)]])
 test('support only: callback S2S denies '+name,async()=>{
  const {createOwnedCallbackServiceVerifier}=await import('./lib/exui-recipient-callback-auth.mjs');
  assert.equal(await createOwnedCallbackServiceVerifier({fetchService:async()=>new Response(body,{status})})(token),null);
 });
test('support only: malformed bearer and thrown private diagnostics deny without exposure',async()=>{
 const {createOwnedCallbackServiceVerifier}=await import('./lib/exui-recipient-callback-auth.mjs');let calls=0;
 const verify=createOwnedCallbackServiceVerifier({fetchService:async()=>{calls++;throw Error('private-token-value');}});
 for(const value of [undefined,'','Bearer ','Basic '+token,'Bearer Bearer '+token,'bearer '+token,token+'\n'])assert.equal(await verify(value),null);
 assert.equal(calls,0);assert.equal(await verify(token),null);
});
test('support only: opt-in gateway dispatch precedes body consumption and retains only responder evidence',()=>{
 const source=fs.readFileSync('scripts/lib/exui-ccd-browser-runtime.mjs','utf8');
 assert(source.indexOf('await callback(request, response)')<source.indexOf('for await (const chunk of request)'));
 assert(source.includes('scope, EVENT_CAPABILITY_SCOPE, "CCD_CALLBACK_EVENT_SCOPE_REQUIRED"'));
 assert(source.includes('verifyServiceAuthorization: createOwnedCallbackServiceVerifier()'));
 assert(source.includes('JSON.stringify(evidence)'));
});

test('support only: gateway rejects wrong scope, unknown option and invocation before listening',async()=>{
 const {startCcdGateway}=await import('./lib/exui-ccd-browser-runtime.mjs');
 await assert.rejects(startCcdGateway('/unused',{},null,'exui-ccd-pilot',{unknown:true}),/CCD_GATEWAY_OPTIONS_INVALID/);
 await assert.rejects(startCcdGateway('/unused',{},null,'exui-ccd-pilot',{recipientCallback:{invocationId:'recipient-callback-reject'}}),/CCD_CALLBACK_EVENT_SCOPE_REQUIRED/);
 await assert.rejects(startCcdGateway('/unused',{},null,'exui-ccd-event-capability-pilot',{recipientCallback:{invocationId:'recipient-callback-reject',other:true}}),/CCD_CALLBACK_OPTIONS_INVALID/);
 await assert.rejects(startCcdGateway('/unused',{},null,'exui-ccd-event-capability-pilot',{recipientCallback:{invocationId:'unknown'}}),/CALLBACK_INVOCATION_REQUIRED/);
});

test('support only: gateway refuses a previous callback evidence journal before listener startup',async t=>{
 const os=require('node:os'),path=require('node:path');
 const {startCcdGateway}=await import('./lib/exui-ccd-browser-runtime.mjs');
 const output=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'callback-journal-'));
 t.after(()=>fs.rmSync(output,{recursive:true,force:true}));
 const file=path.join(output,'recipient-callback.jsonl');fs.writeFileSync(file,'prior-observation');
 await assert.rejects(startCcdGateway(output,{},null,'exui-ccd-event-capability-pilot',{recipientCallback:{invocationId:'recipient-callback-reject'}}),/EEXIST/);
 assert.equal(fs.readFileSync(file,'utf8'),'prior-observation');
});
