export const APPLICANT_RESULT_VARIANTS: readonly string[];
export function applicantResultContract(view:string): {field:string;label:string;order:number};
export function applicantResultObserved(view:string,columns:Array<{case_field_id:string;label:string;order:number}>): {field:string;label:string;order:number};
export function applicantResultDefinition(variant?:string): {sheets:Record<string,Array<{CaseFieldID:string;Label:string;DisplayOrder:number}>>};
