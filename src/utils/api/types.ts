export interface CaseShareResponse {
  id: string;
  caseRef: string;
  caseTitle: string;
}

export type CaseShareResponseVariant =
  | CaseShareResponse[]
  | { cases?: CaseShareResponse[]; sharedCases?: CaseShareResponse[] }
  | { payload?: { cases?: CaseShareResponse[]; sharedCases?: CaseShareResponse[] } };

export interface TaskListResponse {
  tasks: Task[];
}

export interface Task {
  id: string;
  name: string;
  type: string;
  state: string;
}

export interface UserDetailsResponse {
  userInfo?: { id?: string; uid?: string };
}

export interface RoleAccessResponse {
  data?: unknown;
  payload?: { data?: unknown };
}
