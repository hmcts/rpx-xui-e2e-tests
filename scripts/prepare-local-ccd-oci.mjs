#!/usr/bin/env node
import { safeLocalCcdFailure, buildLocalCcdDerivative, verifyLocalCcdDerivative, loadLocalCcdDerivative } from './lib/exui-local-ccd-oci.mjs';
const [command,...args]=process.argv.slice(2),options={};
const names={'--base':'baseArchive','--derived':'derivedArchive','--artifact-root':'artifactRoot','--output':'output','--builder':'builder'};
try {
 for(let i=0;i<args.length;i+=2){if(!names[args[i]]||!args[i+1]||options[names[args[i]]])throw Error();options[names[args[i]]]=args[i+1];}
 if(!['build','verify','load'].includes(command)||!options.baseArchive||!options.artifactRoot||(command==='build'&&(!options.output||!options.builder))||(command!=='build'&&!options.derivedArchive)||(command==='load'&&!options.output))throw Error();
 const receipt=command==='build'?buildLocalCcdDerivative(options):command==='load'?loadLocalCcdDerivative(options):verifyLocalCcdDerivative(options);
 console.log(JSON.stringify({status:receipt.status??'verified',profile:'ccd-results-internal-id-fix-feasibility',configDigest:receipt.configDigest??receipt.verification?.configDigest,runtimeAcceptance:false,catalogueCredit:false}));
} catch(error) {console.error(safeLocalCcdFailure(error));process.exitCode=1;}
