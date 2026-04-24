import { expect, test } from "@playwright/test";

import { getChallengedAccessReasonDetails } from "../integration/helpers/accessRequests.helper.js";
import {
  ACCESS_REQUEST_CASE_ID,
  buildChallengedAccessCaseDetailsMock,
  buildReviewSpecificAccessTaskMock,
  buildSpecificAccessRoleMock
} from "../integration/mocks/accessRequests.mock.js";

test.describe("access requests helper coverage", () => {
  test("buildReviewSpecificAccessTaskMock keeps the access-request task identifiers by default", () => {
    const taskMock = buildReviewSpecificAccessTaskMock() as {
      task?: Record<string, unknown>;
    };

    expect(taskMock.task?.id).toBe("task-review-specific-access");
    expect(taskMock.task?.case_id).toBe(ACCESS_REQUEST_CASE_ID);
    expect(taskMock.task?.state).toBe("assigned");
  });

  test("buildSpecificAccessRoleMock exposes the request metadata used by review flows", () => {
    const roleMock = buildSpecificAccessRoleMock() as Record<string, unknown>;

    expect(roleMock.actorId).toBe("caseworker-123");
    expect(roleMock.requestedRole).toBe("specific-access-legal-ops");
    expect(roleMock.notes).toBe("Need to review linked proceedings");
  });

  test("buildChallengedAccessCaseDetailsMock marks the case as challenged access", () => {
    const caseDetailsMock = buildChallengedAccessCaseDetailsMock() as {
      metadataFields?: Array<Record<string, unknown>>;
    };
    const accessProcessField = caseDetailsMock.metadataFields?.find(
      (field) => field.id === "[ACCESS_PROCESS]"
    );

    expect(accessProcessField?.value).toBe("CHALLENGED");
  });

  test("getChallengedAccessReasonDetails parses the nested JSON access reason payload", () => {
    const details = getChallengedAccessReasonDetails({
      requestedRoles: [
        {
          attributes: {
            accessReason: JSON.stringify({
              reason: 3,
              otherReason: "Urgent safeguarding review required before hearing."
            })
          }
        }
      ]
    });

    expect(details).toEqual({
      reason: 3,
      otherReason: "Urgent safeguarding review required before hearing."
    });
  });
});
