const actions = [
  { id: "cancel", title: "Cancel task" },
  { id: "complete", title: "Mark as done" },
  { id: "go", title: "Go to task" },
  { id: "reassign", title: "Reassign task" },
  { id: "unclaim", title: "Unassign task" },
];

const permissions = {
  values: ["read", "own", "manage", "execute", "cancel", "complete", "claim", "assign", "unassign"],
};

const baseDate = new Date("2024-02-01T10:00:00Z");
const isoDate = (offsetDays: number) =>
  new Date(baseDate.getTime() + offsetDays * 86_400_000).toISOString();

const caseCategories = ["Protection", "Human rights", "EUSS"];
const taskTitles = ["Review documents", "Prepare bundle", "Validate application", "Update records"];
const locations = ["Taylor House", "Manchester", "Liverpool", "Birmingham"];

interface TaskItem {
  id: string;
  name: string;
  assignee: string;
  type: string;
  task_state: string;
  task_system: string;
  security_classification: string;
  task_title: string;
  created_date: string;
  due_date: string;
  location_name: string;
  location: string;
  execution_type: string;
  jurisdiction: string;
  region: string;
  case_type_id: string;
  case_id: string;
  case_category: string;
  case_name: string;
  auto_assigned: boolean;
  warnings: boolean;
  warning_list: { values: unknown[] };
  case_management_category: string;
  work_type_id: string;
  work_type_label: string;
  permissions: typeof permissions;
  description: string;
  role_category: string;
  minor_priority: number | string;
  major_priority: number;
  priority_date: string;
  dueDate: string;
  actions: typeof actions;
  case_name_field: string;
  case_category_field: string;
  location_field: string;
  task_field: string;
  due_date_field: string;
  next_hearing_date: string | null;
  priority_field: number | string;
}

export interface TaskListResponse {
  tasks: TaskItem[];
  total_records: number;
}

const buildTask = (index: number, assignee: string): TaskItem => {
  const dueOffset = index + 1;
  const hearingOffset = index % 2 === 0 ? index + 3 : -1;
  const dueDate = isoDate(dueOffset);
  const hearingDate = hearingOffset >= 0 ? isoDate(hearingOffset) : null;
  const caseName = `Case ${index + 1} - ${caseCategories[index % caseCategories.length]}`;
  const taskTitle = taskTitles[index % taskTitles.length];
  const caseCategory = caseCategories[index % caseCategories.length];
  const locationName = locations[index % locations.length];
  const priority = index + 1;
  const caseId = `10000000000000${index}`;

  return {
    id: `task-${index}`,
    name: taskTitle,
    assignee,
    type: "processApplicationUpdateHearingRequirements",
    task_state: "assigned",
    task_system: "SELF",
    security_classification: "PUBLIC",
    task_title: taskTitle,
    created_date: isoDate(-1),
    due_date: dueDate,
    location_name: locationName,
    location: "765324",
    execution_type: "Case Management Task",
    jurisdiction: "IA",
    region: "1",
    case_type_id: "Asylum",
    case_id: caseId,
    case_category: caseCategory,
    case_name: caseName,
    auto_assigned: false,
    warnings: index === 0,
    warning_list:
      index === 0
        ? { values: [{ warningCode: "123", warningText: "Warning banner check" }] }
        : { values: [] },
    case_management_category: caseCategory,
    work_type_id: "applications",
    work_type_label: "Applications",
    permissions,
    description: `[Decide an application](/case/IA/Asylum/${caseId}/trigger/decideAnApplication)`,
    role_category: "LEGAL_OPERATIONS",
    minor_priority: priority,
    major_priority: priority * 1000,
    priority_date: dueDate,
    dueDate,
    actions,
    case_name_field: caseName,
    case_category_field: caseCategory,
    location_field: locationName,
    task_field: taskTitle,
    due_date_field: dueDate,
    next_hearing_date: hearingDate,
    priority_field: priority,
  };
};

/**
 * Deterministic task list mock (capped to 25) used by integration tests.
 */
export function buildMyTaskListMock(rowCount = 3, assignee: string): TaskListResponse {
  const maxResults = 25;
  const tasks = Array.from({ length: Math.min(rowCount, maxResults) }, (_, i) =>
    buildTask(i, assignee),
  );
  return { tasks, total_records: rowCount };
}

/**
 * Fixed set of priority tasks with predictable due dates.
 */
export function buildDeterministicMyTasksListMock(assignee: string): TaskListResponse {
  const baseTasks = [
    {
      case_name: "Smith & Co",
      case_category: "Protection",
      location_name: "Taylor House",
      task_title: "Review documents",
      due_date: isoDate(-7), // 7 days ago
      priority_field: "urgent",
      minor_priority: 5,
      major_priority: 1000,
    },
    {
      case_name: "Jones LLC",
      case_category: "Human rights",
      location_name: "Manchester",
      task_title: "Prepare hearing",
      due_date: isoDate(0), // today
      priority_field: "high",
      minor_priority: 500,
      major_priority: 5000,
    },
    {
      case_name: "Brown Group",
      case_category: "EUSS",
      location_name: "Liverpool",
      task_title: "Send notification",
      due_date: isoDate(1), // tomorrow
      priority_field: "medium",
      minor_priority: 500,
      major_priority: 5000,
    },
    {
      case_name: "Taylor Inc",
      case_category: "Protection",
      location_name: "Birmingham",
      task_title: "Update records",
      due_date: isoDate(25), // next month-ish
      priority_field: "low",
      minor_priority: 500,
      major_priority: 5000,
    },
  ];

  const tasks = baseTasks.map((t, i) => {
    const warnings = i === 0;
    return {
      id: `static-id-${i}`,
      name: t.task_title,
      assignee,
      type: "processApplicationUpdateHearingRequirements",
      task_state: "assigned",
      task_system: "SELF",
      security_classification: "PUBLIC",
      task_title: t.task_title,
      created_date: isoDate(-2),
      due_date: t.due_date,
      location_name: t.location_name,
      location: "765324",
      execution_type: "Case Management Task",
      jurisdiction: "IA",
      region: "1",
      case_type_id: "Asylum",
      case_id: `static-case-id-${i}`,
      case_category: t.case_category,
      case_name: t.case_name,
      auto_assigned: false,
      warnings,
      warning_list: warnings
        ? {
            values: [
              {
                warningCode: "123",
                warningText:
                  "This warning message is here to test the warning banner functionality.",
              },
            ],
          }
        : { values: [] },
      case_management_category: t.case_category,
      work_type_id: "applications",
      work_type_label: "Applications",
      permissions,
      description: `[Decide an application](/case/IA/Asylum/static-case-id-${i}/trigger/decideAnApplication)`,
      role_category: "LEGAL_OPERATIONS",
      minor_priority: t.minor_priority,
      major_priority: t.major_priority,
      priority_date: t.due_date,
      dueDate: t.due_date,
      actions,
      case_name_field: t.case_name,
      case_category_field: t.case_category,
      location_field: t.location_name,
      task_field: t.task_title,
      due_date_field: t.due_date,
      next_hearing_date: null,
      priority_field: t.priority_field,
    };
  });

  return { tasks, total_records: tasks.length };
}
