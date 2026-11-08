import assert from 'node:assert/strict';
import { digestBytes } from './exui-evidence-io.mjs';

export const FR_PROFILE_ID='configuration-profile:51928e898baad9d4eea1dab7b8a57f8c3af624e735f0b3df5ee6863ca0061c49';
export const FR_PROFILE_FACETS=Object.freeze([
 {facet:'fr-jurisdiction',fault:'source-profile-drop-fr-jurisdiction'},
 {facet:'fr-staff',fault:'source-profile-drop-fr-staff'},
 {facet:'fr-mapping',fault:'source-profile-change-fr-code'},
].map(Object.freeze));
const familyList='DIVORCE,PROBATE,FR,PUBLICLAW,IA,SSCS,EMPLOYMENT,HRS,CIVIL,CMC,PRIVATELAW,PCS';
const staffList='ST_CIC,CIVIL,EMPLOYMENT,PRIVATELAW,PUBLICLAW,IA,SSCS,DIVORCE,FR,PROBATE,HRS';
const credits={runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false,releaseApproval:false};
const hasFamily=(value,family)=>typeof value==='string'&&value.split(',').map(item=>item.trim()).includes(family);

export function frProfileContract(){
 return {schemaVersion:1,kind:'source-defined-family-profile',obligationId:FR_PROFILE_ID,profile:'config/default.json',family:'FR',
  sourceRevision:'3734db2bb8f4f6de62db3b42ade9ef6538b65eb0',sourceDigest:'sha256:ab78791c4a5ced4341e79cd6fabe114e12e06b667f59936d66ffb513433c65d1',
  consumerRevision:'20c6ec129fc1e81061c733e164198ec63a33e71a',
  claim:'Candidate default configuration selects FR jurisdiction and staff support and maps FR to ABA2 through the tested EXUI consumers.',
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
 assert.deepEqual(sourceConfig.serviceRefDataMapping.filter(row=>row.service==='FR'),[{service:'FR',serviceCodes:['ABA2']}],'FR_PROFILE_SOURCE_INVALID');
 const config=structuredClone(sourceConfig);
 if(mutation==='source-profile-drop-fr-jurisdiction')config.jurisdictions=config.jurisdictions.split(',').filter(id=>id!=='FR').join(',');
 if(mutation==='source-profile-drop-fr-staff')config.staffSupportedJurisdictions=config.staffSupportedJurisdictions.split(',').filter(id=>id!=='FR').join(',');
 if(mutation==='source-profile-change-fr-code')config.serviceRefDataMapping.find(row=>row.service==='FR').serviceCodes=['ZZZ1'];
 return {config,digest:digestBytes(JSON.stringify(config)),contract:{...frProfileContract(),facet,mutation,scope:`exui-${facet}-candidate-profile`,runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false,releaseApproval:false}};
}

export function assertFrProfileArtifact(artifact){
 assert.equal(artifact.provenance.webappCommit,frProfileContract().consumerRevision,'FR_PROFILE_CONSUMER_INVALID');
 assert.equal(artifact.identity.webappCommit,artifact.provenance.webappCommit,'FR_PROFILE_CONSUMER_INVALID');
}
