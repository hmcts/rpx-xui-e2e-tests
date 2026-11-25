import assert from 'node:assert/strict';
import {digestBytes} from './exui-evidence-io.mjs';
import {sourceProfileJurisdictionConfiguration} from './exui-source-profile-jurisdictions.mjs';

export const CMC_PROFILE_ID='configuration-profile:57daf2b4a9f9cc6465db5cdeec7e1024dd4dc4e20bd20086e47102b521199449';
export const CMC_PROFILE_FACET=Object.freeze({facet:'cmc-jurisdiction',fault:'source-profile-drop-cmc-jurisdiction'});
const credits={runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false,releaseApproval:false};

export function cmcProfileContract(){
 return {schemaVersion:1,kind:'source-defined-family-profile',obligationId:CMC_PROFILE_ID,profile:'config/default.json',family:'CMC',
  sourceRevision:'02c16611cb863100701af639ddb446b88e0097f1',sourceDigest:'sha256:dfa4df801a06ded03cae6acf9145344207a0fb0c5b6680f360df66b495e2eb73',
  consumerRevision:'e47ccdf14eba61dce892bd49d9a460d55775f202',claim:'Candidate default configuration selects CMC in the jurisdiction list served by the EXUI candidate.',
  capabilities:['jurisdictions'],facets:[CMC_PROFILE_FACET],
  noClaims:['staffSupportedJurisdictions','globalSearchServices','waSupportedJurisdictions','serviceRefDataMapping','hearings jurisdictions or case types','deployed overlays','CCD definitions or authorisations','production CMC readiness','full CMC case journey'],
  syntheticBoundary:'Synthetic session and jurisdiction rows; candidate EXUI route and candidate configuration are real.',...credits};
}
export const cmcProfileContractDigest=()=>digestBytes(JSON.stringify(cmcProfileContract()));

export function projectCmcJurisdiction(config,mutation=null){
 assert(mutation===null||mutation===CMC_PROFILE_FACET.fault,'CMC_PROFILE_FAULT_INVALID');
 assert(config&&typeof config.jurisdictions==='string'&&config.jurisdictions.split(',').includes('CMC'),'CMC_PROFILE_SOURCE_INVALID');
 const projected=structuredClone(config);
 if(mutation)projected.jurisdictions=projected.jurisdictions.split(',').filter(id=>id!=='CMC').join(',');
 return projected;
}

export function cmcProfileConfiguration(candidateRoot,mutation=null){
 assert(mutation===null||mutation===CMC_PROFILE_FACET.fault,'CMC_PROFILE_FAULT_INVALID');
 const {config}=sourceProfileJurisdictionConfiguration(candidateRoot);
 assert(config.jurisdictions.split(',').includes('CMC'),'CMC_PROFILE_SOURCE_INVALID');
 for(const key of ['globalSearchServices','waSupportedJurisdictions','staffSupportedJurisdictions','services.hearings.hearingsJurisdictions']){
  const value=key.split('.').reduce((current,part)=>current?.[part],config);
  assert(!(typeof value==='string'&&value.split(',').includes('CMC')),'CMC_PROFILE_SOURCE_INVALID');
 }
 const projected=projectCmcJurisdiction(config,mutation);
 return {config:projected,digest:digestBytes(JSON.stringify(projected)),contract:{...cmcProfileContract(),facet:CMC_PROFILE_FACET.facet,mutation,scope:'exui-cmc-jurisdiction-candidate-profile',...credits}};
}

export function assertCmcProfileArtifact(artifact){
 // consumerRevision records the original review; runtime evidence binds the actual candidate.
 assert(/^[a-f0-9]{40}$/.test(artifact.provenance.webappCommit),'CMC_PROFILE_CONSUMER_INVALID');
 assert.equal(artifact.identity.webappCommit,artifact.provenance.webappCommit,'CMC_PROFILE_CONSUMER_INVALID');
}
