import fs from 'node:fs';
import path from 'node:path';
import {startCcdRuntime,stopCcdRuntime,importCcdDefinition,proveCcdPolicy,loadCcdRuntimeForReuse} from './lib/exui-ccd-runtime.mjs';
const platformIndex=process.argv.indexOf('--platform');
if(platformIndex>=0&&!process.argv[platformIndex+1])throw new Error('CCD_PLATFORM_REQUIRED');
const platform=platformIndex<0?'linux/arm64':process.argv[platformIndex+1];
const outputIndex=process.argv.indexOf('--output');
if(outputIndex>=0&&!process.argv[outputIndex+1])throw new Error('CCD_OUTPUT_PATH_REQUIRED');
const output=path.resolve(outputIndex<0?'test-results/harness-ccd':process.argv[outputIndex+1]);
let state;
try {
 if(process.argv.includes('--stop')){state=JSON.parse(fs.readFileSync(path.join(output,'runtime.json')));stopCcdRuntime(state);console.log('Owned CCD runtime removed');}
 else {state=process.argv.includes('--reuse')?loadCcdRuntimeForReuse(output,undefined,{elasticsearch:process.argv.includes('--elasticsearch')}):await startCcdRuntime(output,{platform,elasticsearch:process.argv.includes('--elasticsearch')});importCcdDefinition(state);const proof=proveCcdPolicy(state);console.log(JSON.stringify({namespace:state.namespace,output,caseId:proof.caseId,policy:proof.policy}));}
}catch(error){console.error(error.message);process.exitCode=1;}
