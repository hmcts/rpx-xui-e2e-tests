export const SHARED_NESTED_ID: string;
export const SHARED_NESTED_FAULT: string;
export const SHARED_NESTED_PROOF: string;
export interface SharedNestedFacet {id:string;channel:'email'|'post';recipientCount:1|2;proofId:string;}
export interface SharedNestedValue {serveByPostOrEmail:'email'|'post';emailInformation?:{emailName:string;emailAddress:string};postalInformation?:{postalName:string;postalAddress:Record<string,string|null>};}
export const SHARED_NESTED_FACETS: readonly SharedNestedFacet[];
export function sharedNestedValues(channel:'email'|'post',count:1|2): SharedNestedValue[];

export const SHARED_NESTED_SCOPE:string;
export const SHARED_NESTED_MUTATIONS:readonly string[];
