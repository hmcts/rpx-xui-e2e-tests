export function currentSharedNestedBinding(): Record<string,unknown>;
export function saveSharedNestedObservation(file:string,value:unknown):void;
export function replaySharedNestedObservation(value:unknown,expected:{binding:unknown;actorId:string;facetId:string;mutation:string|null}):{facetId:string;recipientCount:number;intendedRecipientCount:number;mutation:string|null};
export function assertSharedNestedIntendedPersistence(observation: unknown): void;
