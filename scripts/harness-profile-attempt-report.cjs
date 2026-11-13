const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const report=require('./harness-cmc-profile-report.cjs');
const fail='PROFILE_ATTEMPT_REPORT_INVALID';

function buildProfileAttemptReporterOption(env=process.env){
 const file=env.HARNESS_PROFILE_ATTEMPTS_PATH;if(file===undefined)return {};
 assert(typeof file==='string'&&path.isAbsolute(file)&&path.normalize(file)===file&&path.basename(file)==='assurance-profile-attempts.json'&&path.basename(path.dirname(file))==='private',fail);
 const info=fs.lstatSync(file);assert(info.isFile()&&!info.isSymbolicLink()&&fs.realpathSync(file)===file&&(info.mode&0o077)===0,fail);
 const packet=JSON.parse(fs.readFileSync(file));assert.deepEqual(Object.keys(packet).sort(),['schemaVersion','kind',...(Object.hasOwn(packet,'frProfileAttempt')?['frProfileAttempt']:[]),...(Object.hasOwn(packet,'cmcProfileAttempt')?['cmcProfileAttempt']:[])].sort(),fail);assert.equal(packet.schemaVersion,1,fail);assert.equal(packet.kind,'assurance-profile-attempts',fail);
 if(packet.frProfileAttempt)report.renderFrProfileAttempt(packet.frProfileAttempt);if(packet.cmcProfileAttempt)report.renderCmcProfileAttempt(packet.cmcProfileAttempt);
 assert(packet.frProfileAttempt||packet.cmcProfileAttempt,fail);
 return {...(packet.frProfileAttempt?{frProfileAttempt:packet.frProfileAttempt}:{}),...(packet.cmcProfileAttempt?{cmcProfileAttempt:packet.cmcProfileAttempt}:{})};
}

module.exports={buildProfileAttemptReporterOption};
