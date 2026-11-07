const test=require('node:test');
const assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const form={grant_type:'password',password:'synthetic-password',username:'synthetic-user',scope:'openid profile roles manage-user create-user search-user',client_id:'xuiwebapp',client_secret:'synthetic-client-value'};
const encoded=()=>new URLSearchParams(form).toString();
async function invoke(handle,{method='POST',url='/o/token',raw=encoded(),chunks,error=false}={}) {
  const request=error?Readable.from((async function*(){yield Buffer.from(raw.slice(0,10));throw Error('PRIVATE-READ-CANARY');})()):Readable.from(chunks??[Buffer.from(raw)]);
  Object.assign(request,{method,url});
  const response={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=JSON.parse(body);}};
  return {handled:await handle(request,response),response};
}
test('synthetic system auth accepts only the fixed complete form and retains warm-cache JWT expiry',async()=>{
  const {handleProfileSystemAuth}=await import('./lib/exui-profile-system-auth-provider.mjs');
  const result=await invoke(handleProfileSystemAuth);assert.equal(result.handled,true);assert.equal(result.response.status,200);
  assert.deepEqual(result.response.headers,{'content-type':'application/json'});
  const token=result.response.body.access_token.split('.');assert.equal(token.length,3);
  assert.deepEqual(JSON.parse(Buffer.from(token[1],'base64url')),{sub:'synthetic-user',exp:4102444800});
  const reversed=new URLSearchParams(Object.entries(form).reverse()).toString();assert.equal((await invoke(handleProfileSystemAuth,{raw:reversed})).handled,true);
  for(const input of [{method:'GET'},{url:'/o/token?extra=true'},{raw:encoded()+'&username=synthetic-user'},{raw:encoded()+'&extra=PRIVATE-CANARY'},{raw:new URLSearchParams({...form,password:'PRIVATE-CANARY'}).toString()},{raw:new URLSearchParams({...form,scope:'openid'}).toString()},{raw:encoded().replace('grant_type=password&','')},{error:true}]) {
    const denied=await invoke(handleProfileSystemAuth,input);assert.equal(denied.handled,false);assert.equal(denied.response.status,undefined);
  }
});
test('synthetic system auth counts bytes across chunks at the exact 4KiB boundary',async()=>{
  const {handleProfileSystemAuth}=await import('./lib/exui-profile-system-auth-provider.mjs');
  // URLSearchParams ignores empty fields; they add bytes without changing the accepted form.
  const raw=encoded().padEnd(4096,'&');
  assert.equal((await invoke(handleProfileSystemAuth,{raw})).handled,true);
  for(const chunks of [[Buffer.from(raw+'&')],[Buffer.from(raw.slice(0,2000)),Buffer.from(raw.slice(2000)+'&')]])assert.equal((await invoke(handleProfileSystemAuth,{chunks})).handled,false);
});
test('DIVORCE keeps its fixed system-auth exchange and rejects foreign auth without journalling',async()=>{
  const {handleDivorceProvider}=await import('./lib/exui-source-profile-divorce-provider.mjs');
  for(const facet of ['staff','mapping']) {
    const journal=[],handle=(req,res)=>handleDivorceProvider(req,res,{facet,journal,output:'/must-not-write-auth'});
    const result=await invoke(handle);assert.equal(result.handled,true);
    assert.deepEqual(JSON.parse(Buffer.from(result.response.body.access_token.split('.')[1],'base64url')),{sub:'synthetic-user',exp:4102444800});
    assert.equal((await invoke(handle,{raw:encoded()+'&extra=PRIVATE-CANARY'})).handled,false);assert.deepEqual(journal,[]);
  }
});
