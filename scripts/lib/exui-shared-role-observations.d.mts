export interface SharedRoleResponse {
  status: number;
  bodyBytes: number;
  bodyDigest: string;
  presentMarkers: string[];
}
export function projectSharedRoleResponse(status: number, body: string): SharedRoleResponse;
export function currentSharedRoleObservationBinding(): Record<string, unknown>;
export function saveSharedRoleObservation(file: string, value: unknown): void;
