import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { replaySharedNestedNativeBindings } from './lib/exui-shared-nested-native-binding.mjs';
import { writeJsonAtomic } from './lib/exui-evidence-io.mjs';
const names=['--candidate-artifact','--ccd-phase','--output','--ccd-source-inputs'];
try {
  const args=process.argv.slice(2),options={};
  if(![6,8].includes(args.length))throw Error('SHARED_NESTED_ARGUMENTS');
  for(let index=0;index<args.length;index+=2){if(!names.includes(args[index])||Object.hasOwn(options,args[index])||!path.isAbsolute(args[index+1]??''))throw Error('SHARED_NESTED_ARGUMENTS');options[args[index]]=args[index+1];}
  if(!names.slice(0,3).every(name=>options[name]))throw Error('SHARED_NESTED_ARGUMENTS');
  const result=await replaySharedNestedNativeBindings({harnessRoot:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),candidateArtifactPath:options['--candidate-artifact'],ccdPhaseDirectory:options['--ccd-phase'],...(options['--ccd-source-inputs']?{sourceImageInputs:JSON.parse(fs.readFileSync(options['--ccd-source-inputs'],'utf8'))}:{})});
  writeJsonAtomic(options['--output'],result);
  console.log(JSON.stringify({status:'BLOCKED',catalogueCredit:false,missingAcceptanceEvidence:result.missingAcceptanceEvidence}));process.exitCode=2;
} catch(error) {
  const code=/^SHARED_NESTED_[A-Z_]+$/.test(error?.message??'')?error.message:'SHARED_NESTED_EVIDENCE_REJECTED';
  console.log(JSON.stringify({status:'BLOCKED',code,catalogueCredit:false}));process.exitCode=2;
}
