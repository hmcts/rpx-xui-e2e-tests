function knownJurisdictionDefectExclusions(){
 return Object.fromEntries(['cmc','fr'].map(family=>[family+'ProfileAttempt',{schemaVersion:1,kind:family+'-profile-attempt',status:'NOT_RUN',reason:family.toUpperCase()+'_PROFILE_TEAM_EXCLUDED'}]));
}
module.exports={knownJurisdictionDefectExclusions};
