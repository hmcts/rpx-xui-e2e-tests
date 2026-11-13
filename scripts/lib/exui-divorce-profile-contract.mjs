import assert from 'node:assert/strict';
import {sourceProfileJurisdictionConfiguration} from './exui-source-profile-jurisdictions.mjs';
import {digestBytes} from './exui-evidence-io.mjs';
export const DIVORCE_PROFILE_ID='configuration-profile:2260b5331c599e46abfb999b6daeb8612a342c884dd0b88e1c23c04adecc79ce';
export const DIVORCE_PROFILE_FACETS=Object.freeze([
 {facet:'divorce-jurisdiction',fault:'source-profile-drop-divorce-jurisdiction',browser:true},
 {facet:'divorce-global-search',fault:'source-profile-drop-divorce-global-search',browser:true},
 {facet:'divorce-staff',fault:'source-profile-drop-divorce-staff',browser:false},
 {facet:'divorce-mapping',fault:'source-profile-change-divorce-code',browser:false},
 {facet:'divorce-wa',fault:'source-profile-add-divorce-wa-membership',browser:false},
 {facet:'wa-health',fault:'source-profile-enable-wa-health',browser:false},
]);
export const divorceProfileContract=()=>({schemaVersion:1,obligationId:DIVORCE_PROFILE_ID,profile:'default.json',family:'DIVORCE',sourceRevision:'20c6ec129fc1e81061c733e164198ec63a33e71a',consumerRevision:'26d17ebea1b7b470b6cc11409564ce296e8ec621',
 claim:'Source-default DIVORCE capability selection and ABA1 mapping through the listed candidate entrypoints',
 browserFlags:{flag:'feature-global-search',evaluationFlags:{},routeFallback:true,liveProvider:false},
 capabilities:['jurisdictions','globalSearchServices','staffSupportedJurisdictions','serviceRefDataMapping'],facets:structuredClone(DIVORCE_PROFILE_FACETS),
 dispositions:[
  {setting:'LaunchDarkly evaluation',domain:'Controlled empty evaluation; pinned route guard true fallback only, no deployed availability claim'},
  {setting:'wildcardSearchFields/wildcardSearchRoles',domain:'Global Search /globalSearch, not legacy /searchCases query construction'},
  {setting:'services.hearings.*',domain:'DIVORCE absent from hearing eligibility; no hearing API/UI journey in this contract'},
  {setting:'decentralisedCaseTypeConfig/decentralisedServiceMap',domain:'No ext event or NoC entrypoint; separate PCS obligation retained'},
  {setting:'other families memberships/mappings',domain:'Pinned unchanged; declared controls only, no representative credit'},
  {setting:'case-view WA tabs',domain:'Explicitly excluded; backend negative WA membership only'},
  {setting:'deployed overlays/definition permissions/provider correctness',domain:'Outside source-default selection; all independent gaps retained'},
 ],releaseCredit:false,releaseApproval:false});
export function divorceBrowserConfiguration(root,facet,mutation=null) {
 assert(['divorce-jurisdiction','divorce-global-search'].includes(facet),'DIVORCE_PROFILE_FACET');
 const fault=DIVORCE_PROFILE_FACETS.find(x=>x.facet===facet).fault;assert(mutation===null||mutation===fault,'SOURCE_PROFILE_UNKNOWN_FAULT');
 const base=sourceProfileJurisdictionConfiguration(root,facet==='divorce-jurisdiction'?mutation:null),config=base.config;
 if(facet==='divorce-global-search'&&mutation)config.globalSearchServices=config.globalSearchServices.split(',').filter(x=>x!=='DIVORCE').join(',');
 return {config,digest:digestBytes(JSON.stringify(config)),contract:{...base.contract,scope:`exui-${facet}-feasibility`,families:['DIVORCE'],facet,mutation,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false}};
}
export const divorceProfileContractDigest=()=>digestBytes(JSON.stringify(divorceProfileContract()));
