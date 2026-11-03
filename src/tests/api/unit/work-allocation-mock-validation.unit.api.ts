import { expect, test } from '@playwright/test';

import { assertValidWorkAllocationTaskListMock } from '../../integration/helpers/workAllocationMockValidation.helper.js';
import { buildMyTaskListMock } from '../../integration/mocks/taskList.mock.js';

test.describe('work allocation mock validation helper', { tag: '@svc-internal' }, () => {
  test('accepts valid task-list mocks', () => {
    expect(() => assertValidWorkAllocationTaskListMock(buildMyTaskListMock('test-user', 1))).not.toThrow();
  });

  test('reports missing and malformed mandatory task-list attributes with ticket field names', () => {
    const validTaskList = buildMyTaskListMock('test-user', 1);
    const invalidTaskList = {
      ...validTaskList,
      tasks: [
        {
          ...validTaskList.tasks[0],
          id: '',
          type: '   ',
          due_date: 'Thu, 15 Jan 2026 10:00:00 GMT',
          major_priority: Number.NaN,
          work_type_id: '',
        },
      ],
    };

    try {
      assertValidWorkAllocationTaskListMock(invalidTaskList);
      throw new Error('Expected the invalid task-list mock to throw.');
    } catch (error) {
      const message = (error as Error).message;

      expect(message).toContain('tasks[0].id must be a non-empty string for task_id.');
      expect(message).toContain('tasks[0].type must be a non-empty string for task_type.');
      expect(message).toContain('tasks[0].due_date must be an ISO date-time string for due_date_time.');
      expect(message).toContain('tasks[0].major_priority must be a finite number for priorities.major_priority.');
      expect(message).toContain('tasks[0].work_type_id must be a non-empty string for work_type.id.');
    }
  });

  test('rejects impossible ISO calendar dates in mandatory task fields', () => {
    const validTaskList = buildMyTaskListMock('test-user', 1);
    const invalidTaskList = {
      ...validTaskList,
      tasks: [
        {
          ...validTaskList.tasks[0],
          due_date: '2026-02-31T10:00:00Z',
        },
      ],
    };

    expect(() => assertValidWorkAllocationTaskListMock(invalidTaskList)).toThrow(
      /tasks\[0\]\.due_date must be an ISO date-time string for due_date_time\./
    );
  });
});
