import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {startCcdGateway,realCcdRequest} from './lib/exui-ccd-browser-runtime.mjs';
import {probeRecipientCallbackBackend} from './lib/exui-recipient-callback-backend.mjs';
const output='/tmp/recipient-output';let server;
try{
 const root='/tmp/recipient-probe';const seals=JSON.parse(fs.readFileSync(root+'/source-seals.json'));
 for(const [name,digest] of Object.entries(seals)){assert(!name.includes('..')&&!name.startsWith('/'));assert.equal('sha256:'+createHash('sha256').update(fs.readFileSync(root+'/'+name)).digest('hex'),digest);}
 const chunks=[];let size=0;for await(const chunk of process.stdin){size+=chunk.length;assert(size<65536);chunks.push(chunk);}const {mode,credentials}=JSON.parse(Buffer.concat(chunks));
 fs.mkdirSync(output,{mode:0o700});
 server=await startCcdGateway(output,credentials,null,'exui-ccd-event-capability-pilot',{recipientCallback:{invocationId:'recipient-callback-'+mode}});
 const ready=await fetch('http://127.0.0.1:3101/health',{redirect:'error',signal:AbortSignal.timeout(5000)});assert.equal(ready.status,200);assert.deepEqual(await ready.json(),{status:'UP'});
 const result=await probeRecipientCallbackBackend({mode,credentials,request:(route,credential,options={})=>realCcdRequest(route,credential,{...options,headers:{...options.headers,'content-type':'application/json'},body:options.body?JSON.stringify(options.body):undefined,signal:AbortSignal.timeout(20000)}),readJournal:()=>fs.readFileSync(output+'/recipient-callback.jsonl','utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)),record:(name,value)=>fs.writeFileSync(`${output}/${name}.json`,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600})});
 console.log(JSON.stringify({status:'completed',result}));
}catch{console.log(JSON.stringify({status:'failed',code:'CALLBACK_BACKEND_WORKER_FAILED'}));process.exitCode=2;}
finally{if(server)await new Promise(resolve=>server.close(resolve));}
