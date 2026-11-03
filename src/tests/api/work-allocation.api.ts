import type { UserDetailsResponse } from '../../utils/api/types';
import {
  assertAllWorkResponse,
  assertAvailableTasksResponse,
  assertCaseworkerListResponse,
  assertLocationsListResponse,
  assertMyWorkDashboardResponse,
  assertMyWorkTotalsResponse,
  assertStateTransition,
  assertTaskNamesResponse,
  assertTaskSearchResponse,
  assertTypesOfWorkResponse,
  extractMyWorkCases,
  fetchFirstTask,
  hasSeededEnvTasks,
  isActionSuccessStatus,
  maybeAssertStateTransition,
  resolveLocationId,
  resolveSeededTaskIds,
  resolveUserId,
  runSeededAction,
  selectTaskId,
  toArray,
  toLocationList,
} from '../../utils/api/workAllocationUtils';

import { test, expect } from './fixtures';

test.describe('Work allocation helper coverage', { tag: '@svc-work-allocation' }, () => {
  test('toArray utility normalizes API response formats (arrays, task_names, taskNames, typesOfWork) to consistent array output', () => {
    // Given: Various API response payload formats from work allocation endpoints
    // When: Normalizing different response shapes to arrays
    // Then: toArray correctly extracts arrays from all known payload structures
    expect(toArray(['a'])).toEqual(['a']);
    expect(toArray({ task_names: ['b'] })).toEqual(['b']);
    expect(toArray({ taskNames: ['c'] })).toEqual(['c']);
    expect(toArray({ typesOfWork: ['d'] })).toEqual(['d']);
    expect(toArray({})).toEqual([]);
  });

  test('helper selectors cover ids, locations, and seeded tasks', () => {
    expect(resolveUserId({ userInfo: { id: 'id-1' } } as UserDetailsResponse)).toBe('id-1');
    expect(resolveUserId({ userInfo: { uid: 'uid-1' } } as UserDetailsResponse)).toBe('uid-1');
    expect(resolveUserId()).toBeUndefined();

    expect(resolveLocationId(200, [{ id: 'loc-1' }])).toBe('loc-1');
    expect(resolveLocationId(500, [{ id: 'loc-2' }])).toBeUndefined();
    expect(resolveLocationId(200, [])).toBeUndefined();

    expect(resolveSeededTaskIds({ id: 'task-1', type: 'assigned' })).toEqual({ sampleMyTaskId: 'task-1' });
    expect(resolveSeededTaskIds({ id: 'task-2', type: 'unassigned' })).toEqual({ sampleTaskId: 'task-2' });
    expect(resolveSeededTaskIds()).toEqual({});
  });

  test('task id selection helpers cover fallbacks', () => {
    expect(toLocationList('loc-1')).toEqual(['loc-1']);
    expect(toLocationList()).toEqual([]);

    expect(selectTaskId(['first', 'second'], 'fallback')).toBe('first');
    expect(selectTaskId([undefined, 'second'], 'fallback')).toBe('second');
    expect(selectTaskId([undefined, undefined], 'fallback')).toBe('fallback');

    expect(hasSeededEnvTasks()).toBe(false);
    expect(hasSeededEnvTasks('task')).toBe(true);
    expect(isActionSuccessStatus(200)).toBe(true);
    expect(isActionSuccessStatus(204)).toBe(true);
    expect(isActionSuccessStatus(400)).toBe(false);

    expect(extractMyWorkCases([{ id: 'case-1' }])).toHaveLength(1);
    expect(extractMyWorkCases({ cases: [{ id: 'case-2' }] })).toHaveLength(1);
    expect(extractMyWorkCases({})).toEqual([]);
  });

  test('runSeededAction covers seeded and skipped paths', async () => {
    let xsrfCalls = 0;
    const apiClient = {
      post: async () => ({ status: 200 }),
    };
    const withXsrfFn = async (_role: string, fn: (headers: Record<string, string>) => Promise<void>) => {
      xsrfCalls += 1;
      return fn({ 'X-XSRF-TOKEN': 'token' });
    };
    const executed = await runSeededAction('claim', () => 'task-1', {
      apiClient,
      withXsrfFn,
      hasSeededEnvTasksFn: () => true,
      envTaskId: 'task-1',
      envAssignedTaskId: undefined,
    });
    expect(executed).toBe(true);
    expect(xsrfCalls).toBe(1);

    const skipped = await runSeededAction('claim', () => '', {
      apiClient,
      withXsrfFn,
      hasSeededEnvTasksFn: () => false,
      envTaskId: undefined,
      envAssignedTaskId: undefined,
    });
    expect(skipped).toBe(false);
  });

  test('assertStateTransition covers claim/assign/unclaim/complete', () => {
    assertStateTransition('claim', { assignee: '', task_state: 'unassigned' }, { assignee: 'user-1', task_state: 'assigned' });
    assertStateTransition(
      'assign',
      { assignee: 'user-2', task_state: 'assigned' },
      { assignee: 'user-3', task_state: 'assigned' }
    );
    assertStateTransition('unclaim', { assignee: 'user-1', task_state: 'assigned' }, { assignee: '', task_state: 'unassigned' });
    assertStateTransition('cancel', { assignee: 'user-1', task_state: 'assigned' }, { assignee: '', task_state: 'cancelled' });
    assertStateTransition(
      'complete',
      { assignee: 'user-1', task_state: 'assigned' },
      { assignee: 'user-1', task_state: 'completed' }
    );
  });

  test('assertStateTransition handles missing data', () => {
    assertStateTransition('claim');
    assertStateTransition('assign', { assigned_to: 'user-1', state: 'assigned' }, { assigned_to: 'user-2', state: 'assigned' });
    assertStateTransition('unassign', { assigned_to: 'user-1', state: 'assigned' }, { assigned_to: '', state: 'unassigned' });
  });

  test('maybeAssertStateTransition handles success and guarded statuses', () => {
    const asserted = maybeAssertStateTransition(
      'claim',
      { assignee: '', task_state: 'unassigned' },
      { assignee: 'user-1', task_state: 'assigned' },
      200
    );
    expect(asserted).toBe(true);
    const skipped = maybeAssertStateTransition('claim', undefined, undefined, 500);
    expect(skipped).toBe(false);
  });

  test('fetchFirstTask returns first task when available', async () => {
    const apiClient = {
      post: async () => ({
        status: 200,
        data: { tasks: [{ id: 'task-1', task_state: 'assigned' }] },
      }),
    };
    const task = await fetchFirstTask(apiClient);
    expect(task?.id).toBe('task-1');
  });

  test('fetchFirstTask returns undefined on non-200 response', async () => {
    const apiClient = {
      post: async () => ({
        status: 500,
        data: {},
      }),
    };
    const task = await fetchFirstTask(apiClient);
    expect(task).toBeUndefined();
  });

  test('fetchFirstTask returns undefined on empty task list', async () => {
    const apiClient = {
      post: async () => ({
        status: 200,
        data: { tasks: [] },
      }),
    };
    const task = await fetchFirstTask(apiClient);
    expect(task).toBeUndefined();
  });

  test('fetchFirstTask returns undefined when tasks are not array', async () => {
    const apiClient = {
      post: async () => ({
        status: 200,
        data: { tasks: {} },
      }),
    };
    const task = await fetchFirstTask(apiClient);
    expect(task).toBeUndefined();
  });

  test('fetchFirstTask degrades on request timeout unless strict mode is requested', async () => {
    const timeoutClient = {
      post: async () => {
        throw new Error('Timeout 30000ms exceeded');
      },
    };

    await expect(fetchFirstTask(timeoutClient)).resolves.toBeUndefined();
    await expect(fetchFirstTask(timeoutClient, undefined, ['assigned'], 'AllWork', { failOnRequestError: true })).rejects.toThrow(
      'Timeout 30000ms exceeded'
    );

    const observedOptions: Array<{ timeoutMs?: number }> = [];
    const successfulClient = {
      post: async (_endpoint: string, options?: Record<string, unknown>) => {
        observedOptions.push({ timeoutMs: options?.timeoutMs as number | undefined });
        return { status: 200, data: { tasks: [{ id: 'task-1' }] } };
      },
    };

    await expect(fetchFirstTask(successfulClient, undefined, ['assigned'], 'AllWork', { timeoutMs: 7_500 })).resolves.toEqual({
      id: 'task-1',
    });
    expect(observedOptions[0]?.timeoutMs).toBe(7_500);

    let retryCalls = 0;
    const retryClient = {
      post: async () => {
        retryCalls += 1;
        return { status: 502, data: { tasks: [] } };
      },
    };
    await expect(fetchFirstTask(retryClient, undefined, ['assigned'], 'AllWork', { retries: 0 })).resolves.toBeUndefined();
    expect(retryCalls).toBe(1);
  });

  test('assertLocationsListResponse covers guarded and populated data', () => {
    assertLocationsListResponse(200, [{ id: 'loc-1', locationName: 'Location' }]);
    assertLocationsListResponse(200, []);
    assertLocationsListResponse(401, undefined);
  });

  test('assertTaskNamesResponse covers array and empty data', () => {
    assertTaskNamesResponse(200, ['task']);
    assertTaskNamesResponse(200, { task_names: ['task'] });
    assertTaskNamesResponse(200, []);
    assertTaskNamesResponse(500, undefined);
  });

  test('assertTypesOfWorkResponse covers object shapes', () => {
    assertTypesOfWorkResponse(200, [{ id: 'type-1' }]);
    assertTypesOfWorkResponse(200, { typesOfWork: [{ id: 'type-2' }] });
    assertTypesOfWorkResponse(200, []);
    assertTypesOfWorkResponse(500, undefined);
  });

  test('assertTaskSearchResponse covers success and failure', () => {
    assertTaskSearchResponse(200, { tasks: [{ id: 'task-1', task_state: 'assigned' }] });
    assertTaskSearchResponse(500, undefined);
  });

  test('assertAvailableTasksResponse covers success and guarded', () => {
    assertAvailableTasksResponse(200, { tasks: [{ id: 'task-1', task_state: 'assigned' }] });
    assertAvailableTasksResponse(401, undefined);
  });

  test('assertAllWorkResponse covers success and guarded', () => {
    assertAllWorkResponse(200, { tasks: [{ id: 'task-1', task_state: 'assigned' }] });
    assertAllWorkResponse(500, undefined);
  });

  test('assertMyWorkDashboardResponse covers case arrays', () => {
    assertMyWorkDashboardResponse(200, { cases: [{ id: 'case-1' }] });
    assertMyWorkDashboardResponse(200, []);
    assertMyWorkDashboardResponse(200, { other: [] });
    assertMyWorkDashboardResponse(401, undefined);
  });

  test('assertMyWorkTotalsResponse covers totals and cases', () => {
    assertMyWorkTotalsResponse(200, { total_records: 1, cases: [] });
    assertMyWorkTotalsResponse(200, { cases: [{ id: 'case-1' }] });
    assertMyWorkTotalsResponse(200, { total_records: 'nope', cases: null });
    assertMyWorkTotalsResponse(200, undefined);
    assertMyWorkTotalsResponse(401, undefined);
  });

  test('assertCaseworkerListResponse covers list and empty payloads', () => {
    assertCaseworkerListResponse(200, [{ firstName: 'A', lastName: 'B', idamId: 'id' }]);
    assertCaseworkerListResponse(200, []);
    assertCaseworkerListResponse(500, undefined);
  });
});
