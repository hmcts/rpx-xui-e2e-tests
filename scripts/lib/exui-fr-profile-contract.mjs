import assert from 'node:assert/strict';
import { digestBytes } from './exui-evidence-io.mjs';

export const FR_PROFILE_ID='configuration-profile:3b1c3a1c7c3082ca986bbb8d1ce6f625ba1d54aa831e31f1678845db95229fbe';
export const FR_PROFILE_FACETS=Object.freeze([
 {facet:'fr-jurisdiction',fault:'source-profile-drop-fr-jurisdiction'},
 {facet:'fr-staff',fault:'source-profile-drop-fr-staff'},
 {facet:'fr-mapping',fault:'source-profile-change-divorce-aba2-code'},
].map(Object.freeze));
const familyList='DIVORCE,PROBATE,FR,PUBLICLAW,IA,SSCS,EMPLOYMENT,HRS,CIVIL,CMC,PRIVATELAW,PCS';
const staffList='ST_CIC,CIVIL,EMPLOYMENT,PRIVATELAW,PUBLICLAW,IA,SSCS,DIVORCE,FR,PROBATE,HRS,PCS';
const credits={runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false,releaseApproval:false};
const hasFamily=(value,family)=>typeof value==='string'&&value.split(',').map(item=>item.trim()).includes(family);

export function frProfileContract(){
 return {schemaVersion:1,kind:'source-defined-family-profile',obligationId:FR_PROFILE_ID,profile:'config/default.json',family:'FR',
  sourceRevision:'02c16611cb863100701af639ddb446b88e0097f1',sourceDigest:'sha256:dfa4df801a06ded03cae6acf9145344207a0fb0c5b6680f360df66b495e2eb73',
  consumerRevision:'02c16611cb863100701af639ddb446b88e0097f1',
  claim:'Diagnostic only: candidate FR jurisdiction and staff support, plus Financial Remedy ABA2 mapping through DIVORCE. This mixed-family cohort earns no FR catalogue credit.',
  capabilities:['jurisdictions','staffSupportedJurisdictions','serviceRefDataMapping'],facets:structuredClone(FR_PROFILE_FACETS),
  noClaims:['globalSearchServices','waSupportedJurisdictions','services.hearings.hearingsJurisdictions','services.hearings.*.caseTypes','deployed overlays','CCD definitions or authorisations','production role/ref-data correctness','full FR case journey'],
  syntheticBoundary:'Synthetic session and reference providers; candidate EXUI routes and configuration are real.',...credits};
}
export const frProfileContractDigest=()=>digestBytes(JSON.stringify(frProfileContract()));

export function frProfileConfiguration(sourceConfig,facet,mutation=null){
 const selected=FR_PROFILE_FACETS.find(item=>item.facet===facet);
 assert(selected,'FR_PROFILE_FACET_INVALID');
 assert(mutation===null||mutation===selected.fault,'FR_PROFILE_FAULT_INVALID');
 assert(sourceConfig&&typeof sourceConfig==='object'&&!Array.isArray(sourceConfig),'FR_PROFILE_SOURCE_INVALID');
 assert.equal(sourceConfig.jurisdictions,familyList,'FR_PROFILE_SOURCE_INVALID');
 assert.equal(sourceConfig.staffSupportedJurisdictions,staffList,'FR_PROFILE_SOURCE_INVALID');
 assert.equal(hasFamily(sourceConfig.globalSearchServices,'FR'),false,'FR_PROFILE_SOURCE_INVALID');
 assert.equal(hasFamily(sourceConfig.waSupportedJurisdictions,'FR'),false,'FR_PROFILE_SOURCE_INVALID');
 assert.equal(hasFamily(sourceConfig.services?.hearings?.hearingsJurisdictions,'FR'),false,'FR_PROFILE_SOURCE_INVALID');
 assert.deepEqual(sourceConfig.serviceRefDataMapping.filter(row=>row.service==='FR'),[],'FR_PROFILE_SOURCE_INVALID');
 assert.deepEqual(sourceConfig.serviceRefDataMapping.filter(row=>row.service==='DIVORCE'),[{service:'DIVORCE',serviceCodes:['ABA1','ABA2']}],'FR_PROFILE_SOURCE_INVALID');
 const config=structuredClone(sourceConfig);
 if(mutation==='source-profile-drop-fr-jurisdiction')config.jurisdictions=config.jurisdictions.split(',').filter(id=>id!=='FR').join(',');
 if(mutation==='source-profile-drop-fr-staff')config.staffSupportedJurisdictions=config.staffSupportedJurisdictions.split(',').filter(id=>id!=='FR').join(',');
 if(mutation==='source-profile-change-divorce-aba2-code')config.serviceRefDataMapping.find(row=>row.service==='DIVORCE').serviceCodes=['ABA1','ZZZ1'];
 return {config,digest:digestBytes(JSON.stringify(config)),contract:{...frProfileContract(),facet,mutation,scope:`exui-${facet}-candidate-profile`,runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false,releaseApproval:false}};
}

export function assertFrProfileArtifact(artifact){
 // The runtime binding checks the actual candidate commit independently of the reviewed source revision.
 assert(/^[a-f0-9]{40}$/.test(artifact.provenance.webappCommit),'FR_PROFILE_CONSUMER_INVALID');
 assert.equal(artifact.identity.webappCommit,artifact.provenance.webappCommit,'FR_PROFILE_CONSUMER_INVALID');
}
