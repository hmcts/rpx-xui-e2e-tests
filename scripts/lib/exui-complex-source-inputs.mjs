import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {digestBytes} from './exui-evidence-io.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),fail='COMPLEX_COHORT';
export function prepareComplexSourceInputs(inputs){
 const names=['python','sourceArchive','definitionArchive','javaHome','lombok','mapstruct'];assert.deepEqual(Object.keys(inputs).sort(),names.slice().sort(),fail);
 const prepared=Object.fromEntries(names.map(key=>{const file=inputs[key];assert(path.isAbsolute(file)&&fs.realpathSync(file)===file,fail);const info=fs.lstatSync(file);assert(key==='javaHome'?info.isDirectory():info.isFile(),fail);return [key,{path:file,digest:info.isFile()?digestBytes(fs.readFileSync(file)):null}];}));
 const witnessPath=path.join(root,'scripts/fixtures/ccd/complex-email-application-class-witnesses.json'),bytes=fs.readFileSync(witnessPath);assert.equal(digestBytes(bytes),'sha256:defb7e908eddcc192e389bff882ac868a637b2a02dc884a8c65da54034f8ddb3',fail);const witness=JSON.parse(bytes);
 assert.equal(prepared.sourceArchive.digest,witness.sourceArchiveDigest,fail);assert.equal(prepared.definitionArchive.digest,'sha256:4343d615ca395974e5651e7eae06296e4a19ce161c40d5b4ba18bf242eb24eb4',fail);
 const tools=witness.javaFiles.map(row=>({path:path.join(inputs.javaHome,row.path),digest:row.digest}));
 tools.push(...witness.processors.map(row=>({path:inputs[row.name],digest:row.digest})));
 for(const item of tools){assert.equal(fs.realpathSync(item.path),item.path,fail);assert.equal(digestBytes(fs.readFileSync(item.path)),item.digest,fail);}
 return {prepared,tools};
}
