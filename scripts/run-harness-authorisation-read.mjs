#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runAuthorisationRead} from './run-harness-authorisation-create.mjs';
import {AUTHORISATION_ROW_NO_CREDIT} from './lib/exui-authorisation-row-contract.mjs';
export {runAuthorisationRead,authorisationReadProducer} from './run-harness-authorisation-create.mjs';
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.umask(0o077);try{assert.deepEqual(process.argv.slice(2,3),['--output']);assert.equal(process.argv.length,4);const result=await runAuthorisationRead(process.argv[3]);console.log(JSON.stringify({status:result.summary.status,kind:result.summary.kind,failedStage:result.summary.failedStage??null,contextPinsDigest:result.summary.contextPinsDigest,completedContexts:result.summary.variants.filter(item=>item.status==='PASS').length,...AUTHORISATION_ROW_NO_CREDIT}));process.exitCode=result.exitCode;}catch{console.error('AUTH_READ_STANDALONE_BLOCKED');process.exitCode=2;}
}
