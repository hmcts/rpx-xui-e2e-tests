import { faker } from "@faker-js/faker";

export const actions = [
  { id: "cancel", title: "Cancel task" },
  { id: "complete", title: "Mark as done" },
  { id: "go", title: "Go to task" },
  { id: "reassign", title: "Reassign task" },
  { id: "unclaim", title: "Unassign task" }
];

export const permissions = {
  values: ["read", "own", "manage", "execute", "cancel", "complete", "claim", "assign", "unassign"]
};

export const caseCategories = ["Protection", "Human rights", "EUSS"];

export const dateOptions = [
  { label: "yesterday", value: faker.date.recent({ days: 2 }) },
  { label: "today", value: new Date() },
  { label: "tomorrow", value: faker.date.soon({ days: 1 }) },
  { label: "next week", value: faker.date.soon({ days: 7 }) },
  { label: "next month", value: faker.date.soon({ days: 30 }) },
  { label: "future", value: faker.date.soon({ days: faker.number.int({ min: 14, max: 180 }) }) }
];

export function buildMyTaskListMock(rowCount = 3, assignee: string) {
  const maxResults = 25;
  const tasks = Array.from({ length: Math.min(rowCount, maxResults) }, () => {
    const createdDate = faker.date.past({ years: 0.25 });
    const dueOpt = faker.helpers.arrayElement(dateOptions);
    const dueDate = dueOpt.value;
    const hearingDate = faker.datatype.boolean()
      ? faker.date.soon({ days: faker.number.int({ min: 1, max: 90 }) })
      : null;

    const formatDate = (date: Date | null) =>
      date ? date.toISOString().replace(/\\.\\d{3}Z$/, "+0000") : "";

    const priority = faker.number.int({ min: 1, max: 10 });
    const caseName = faker.company.name();
    const caseCategory = faker.helpers.arrayElement(caseCategories);
    const locationName = "Taylor House";
    const taskTitle = faker.word.words({ count: { min: 2, max: 5 } });
    const caseId = faker.string.numeric({ length: 16 });
    const linkCaseId = faker.string.numeric({ length: 16 });

    return {
      id: faker.string.uuid(),
      name: taskTitle,
      assignee,
      type: "processApplicationUpdateHearingRequirements",
      task_state: "assigned",
      task_system: "SELF",
      security_classification: "PUBLIC",
      task_title: taskTitle,
      created_date: formatDate(createdDate),
      due_date: formatDate(dueDate),
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
      warnings: false,
      warning_list: { values: [] },
      case_management_category: caseCategory,
      work_type_id: "applications",
      work_type_label: "Applications",
      permissions,
      description: `[Decide an application](/case/IA/Asylum/${linkCaseId}/trigger/decideAnApplication)`,
      role_category: "LEGAL_OPERATIONS",
      minor_priority: priority,
      major_priority: priority * 1000,
      priority_date: formatDate(dueDate),
      dueDate: formatDate(dueDate),
      actions,
      case_name_field: caseName,
      case_category_field: caseCategory,
      location_field: locationName,
      task_field: taskTitle,
      due_date_field: formatDate(dueDate),
      next_hearing_date: hearingDate ? formatDate(hearingDate) : null,
      priority_field: priority
    };
  });

  return {
    tasks,
    total_records: rowCount
  };
}

export function buildDeterministicMyTasksListMock(assignee: string) {
  const baseTasks = [
    {
      case_name: "Smith & Co",
      case_category: "Protection",
      location_name: "Taylor House",
      task_title: "Review documents",
      due_date: new Date(Date.now() - 86400000 * 7).toISOString(),
      priority_field: "urgent",
      minor_priority: 5,
      major_priority: 1000
    },
    {
      case_name: "Jones LLC",
      case_category: "Human rights",
      location_name: "Manchester",
      task_title: "Prepare hearing",
      due_date: new Date().toISOString(),
      priority_field: "high",
      minor_priority: 500,
      major_priority: 5000
    },
    {
      case_name: "Brown Group",
      case_category: "EUSS",
      location_name: "Liverpool",
      task_title: "Send notification",
      due_date: new Date(Date.now() + 86400000).toISOString(),
      priority_field: "medium",
      minor_priority: 500,
      major_priority: 5000
    },
    {
      case_name: "Taylor Inc",
      case_category: "Protection",
      location_name: "Birmingham",
      task_title: "Update records",
      due_date: new Date(Date.now() + 86400000 * 25).toISOString(),
      priority_field: "low",
      minor_priority: 500,
      major_priority: 5000
    }
  ];

  const staticWarningList = {
    values: [
      {
        warningCode: "123",
        warningText: "This warning message is here to test the warning banner functionality."
      }
    ]
  };

  const tasks = baseTasks.map((task, index) => {
    const warnings = index === 0;
    const warning_list = warnings ? staticWarningList : { values: [] };
    return {
      id: `static-id-${index}`,
      name: task.task_title,
      assignee,
      type: "processApplicationUpdateHearingRequirements",
      task_state: "assigned",
      task_system: "SELF",
      security_classification: "PUBLIC",
      task_title: task.task_title,
      created_date: new Date().toISOString(),
      due_date: task.due_date,
      location_name: task.location_name,
      location: "765324",
      execution_type: "Case Management Task",
      jurisdiction: "IA",
      region: "1",
      case_type_id: "Asylum",
      case_id: `static-case-id-${index}`,
      case_category: task.case_category,
      case_name: task.case_name,
      auto_assigned: false,
      warnings,
      warning_list,
      case_management_category: task.case_category,
      work_type_id: "applications",
      work_type_label: "Applications",
      permissions,
      description: `[Decide an application](/case/IA/Asylum/static-case-id-${index}/trigger/decideAnApplication)`,
      role_category: "LEGAL_OPERATIONS",
      minor_priority: task.minor_priority,
      major_priority: task.major_priority,
      priority_date: task.due_date,
      dueDate: task.due_date,
      actions,
      case_name_field: task.case_name,
      case_category_field: task.case_category,
      location_field: task.location_name,
      task_field: task.task_title,
      due_date_field: task.due_date,
      next_hearing_date: null,
      priority_field: task.priority_field
    };
  });

  return {
    tasks,
    total_records: tasks.length
  };
}
