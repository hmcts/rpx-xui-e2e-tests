import type { Task, TaskListResponse } from "./types";

export class TaskBuilder {
  private readonly task: Partial<Task> = {
    id: "default-task-id",
    task_state: "unassigned",
    task_title: "Default Task",
    assignee: null,
    case_id: null,
    case_name: null,
    location_name: null,
    created_date: new Date().toISOString(),
    due_date: null
  };

  withId(id: string): this {
    this.task.id = id;
    return this;
  }

  withTitle(title: string): this {
    this.task.task_title = title;
    return this;
  }

  assigned(assignee = "default-user-id"): this {
    this.task.task_state = "assigned";
    this.task.assignee = assignee;
    return this;
  }

  unassigned(): this {
    this.task.task_state = "unassigned";
    this.task.assignee = null;
    return this;
  }

  completed(): this {
    this.task.task_state = "completed";
    return this;
  }

  cancelled(): this {
    this.task.task_state = "cancelled";
    return this;
  }

  withCase(caseId: string, caseName?: string): this {
    this.task.case_id = caseId;
    this.task.case_name = caseName || `Case ${caseId}`;
    return this;
  }

  atLocation(locationName: string): this {
    this.task.location_name = locationName;
    return this;
  }

  createdOn(date: string | Date): this {
    this.task.created_date = typeof date === "string" ? date : date.toISOString();
    return this;
  }

  dueOn(date: string | Date): this {
    this.task.due_date = typeof date === "string" ? date : date.toISOString();
    return this;
  }

  overdue(): this {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    this.task.due_date = yesterday.toISOString();
    return this;
  }

  build(): Task {
    return this.task as Task;
  }

  buildMany(count: number): Task[] {
    const tasks: Task[] = [];
    for (let i = 0; i < count; i += 1) {
      const taskCopy = { ...this.task } as Task;
      taskCopy.id = `${this.task.id}-${i}`;
      tasks.push(taskCopy);
    }
    return tasks;
  }
}

export class TaskListBuilder {
  private readonly taskList: Partial<TaskListResponse> = {
    tasks: [],
    total_records: 0
  };

  withTasks(tasks: Task[]): this {
    this.taskList.tasks = tasks;
    this.taskList.total_records = tasks.length;
    return this;
  }

  addTask(task: Task): this {
    this.taskList.tasks = [...(this.taskList.tasks || []), task];
    this.taskList.total_records = this.taskList.tasks.length;
    return this;
  }

  withTotalRecords(total: number): this {
    this.taskList.total_records = total;
    return this;
  }

  empty(): this {
    this.taskList.tasks = [];
    this.taskList.total_records = 0;
    return this;
  }

  build(): TaskListResponse {
    return this.taskList as TaskListResponse;
  }
}

export class TaskSearchBuilder {
  private readonly searchRequest: Record<string, unknown> = {
    view: "MyTasks",
    searchRequest: []
  };

  view(viewName: "MyTasks" | "AllWork" | "AvailableTasks"): this {
    this.searchRequest.view = viewName;
    return this;
  }

  inLocations(locationIds: string[]): this {
    this.searchRequest.searchRequest = [
      ...(this.searchRequest.searchRequest as unknown[]),
      { key: "location", operator: "IN", values: locationIds }
    ];
    return this;
  }

  withStates(states: string[]): this {
    this.searchRequest.searchRequest = [
      ...(this.searchRequest.searchRequest as unknown[]),
      { key: "state", operator: "IN", values: states }
    ];
    return this;
  }

  forJurisdiction(jurisdiction: string): this {
    this.searchRequest.searchRequest = [
      ...(this.searchRequest.searchRequest as unknown[]),
      { key: "jurisdiction", operator: "EQUAL", values: [jurisdiction] }
    ];
    return this;
  }

  searchByCaseworker(): this {
    (this.searchRequest as { searchBy?: string }).searchBy = "caseworker";
    return this;
  }

  paginate(first: number, pageSize: number): this {
    (this.searchRequest as { first?: number; pageSize?: number }).first = first;
    (this.searchRequest as { pageSize?: number }).pageSize = pageSize;
    return this;
  }

  sortBy(field: string, order: "asc" | "desc" = "asc"): this {
    (this.searchRequest as { sortedBy?: { field: string; order: string } }).sortedBy = { field, order };
    return this;
  }

  build(): Record<string, unknown> {
    return this.searchRequest;
  }
}

export class LocationBuilder {
  private readonly location: { id: string; locationName: string; services: string[] } = {
    id: "default-location-id",
    locationName: "Default Location",
    services: []
  };

  withId(id: string): this {
    this.location.id = id;
    return this;
  }

  withName(name: string): this {
    this.location.locationName = name;
    return this;
  }

  withServices(services: string[]): this {
    this.location.services = services;
    return this;
  }

  build(): Record<string, unknown> {
    return this.location;
  }

  buildMany(count: number): Array<Record<string, unknown>> {
    const locations: Array<Record<string, unknown>> = [];
    for (let i = 0; i < count; i += 1) {
      const locationCopy = { ...this.location };
      locationCopy.id = `${this.location.id}-${i}`;
      locations.push(locationCopy);
    }
    return locations;
  }
}

export class UserDetailsBuilder {
  private readonly userDetails: Record<string, unknown> = {
    userInfo: {
      id: "default-user-id",
      uid: "default-user-id",
      email: "test@example.com",
      name: "Test User"
    },
    roleAssignmentInfo: []
  };

  withId(id: string): this {
    const userInfo = this.userDetails.userInfo as Record<string, unknown>;
    userInfo.id = id;
    userInfo.uid = id;
    return this;
  }

  withEmail(email: string): this {
    (this.userDetails.userInfo as Record<string, unknown>).email = email;
    return this;
  }

  withName(name: string): this {
    (this.userDetails.userInfo as Record<string, unknown>).name = name;
    return this;
  }

  withRoles(roles: string[]): this {
    this.userDetails.roleAssignmentInfo = roles.map((role) => ({
      roleName: role,
      roleType: "CASE",
      classification: "PUBLIC"
    }));
    return this;
  }

  build(): Record<string, unknown> {
    return this.userDetails;
  }
}

export const TestData = {
  task: (): Task => new TaskBuilder().build(),
  assignedTask: (assignee = "user-1"): Task => new TaskBuilder().assigned(assignee).build(),
  unassignedTask: (): Task => new TaskBuilder().unassigned().build(),
  taskList: (count: number): TaskListResponse => {
    const tasks = new TaskBuilder().buildMany(count);
    return new TaskListBuilder().withTasks(tasks).build();
  },
  emptyTaskList: (): TaskListResponse => new TaskListBuilder().empty().build(),
  location: (id: string, name: string): Record<string, unknown> =>
    new LocationBuilder().withId(id).withName(name).build(),
  user: (id: string, email: string): Record<string, unknown> =>
    new UserDetailsBuilder().withId(id).withEmail(email).build()
};
