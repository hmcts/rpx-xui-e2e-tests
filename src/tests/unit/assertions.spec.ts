import {
  expectTaskList,
  expectRoleAssignmentShape,
  expectBookmarkShape,
  expectAnnotationShape,
  expectCaseShareShape,
  expectAddressLookupShape
} from "../api/utils/assertions.js";

describe("api assertions helpers", () => {
  it("validates task list and handles empty arrays", () => {
    const parsed = expectTaskList({ tasks: [] });
    expect(parsed.tasks).toEqual([]);
  });

  it("validates role assignment shape", () => {
    const parsed = expectRoleAssignmentShape({ roleCategory: "judge", roleName: "caseworker", actorId: "123" });
    expect(parsed.roleCategory).toBe("judge");
  });

  it("validates bookmark shape", () => {
    const parsed = expectBookmarkShape({ id: "1", name: "n", documentId: "doc" });
    expect(parsed.id).toBe("1");
  });

  it("validates annotation shape", () => {
    const parsed = expectAnnotationShape({ id: "a", documentId: "d", annotationSetId: "set" });
    expect(parsed.annotationSetId).toBe("set");
  });

  it("validates case share for users and cases", () => {
    const payload = {
      users: [{ userIdentifier: "u1", email: "u1@example.com" }],
      cases: [{ caseId: "c1", sharedWith: [] }],
      sharedCases: [{ caseId: "c2", sharedWith: [] }],
      organisations: [{ organisationIdentifier: "org1", name: "Org 1" }]
    };
    const users = expectCaseShareShape(payload, "users");
    const cases = expectCaseShareShape(payload, "cases");
    const sharedCases = expectCaseShareShape(payload, "sharedCases");
    const orgs = expectCaseShareShape(payload, "organisations");
    expect(users.users?.[0].userIdentifier).toBe("u1");
    expect(cases.cases?.[0].caseId).toBe("c1");
    expect(sharedCases.sharedCases?.[0].caseId).toBe("c2");
    expect(orgs.organisations?.[0].organisationIdentifier).toBe("org1");
  });

  it("covers task list and role assignment optional branches", () => {
    const taskList = expectTaskList({ tasks: [{ id: "t1", task_state: "assigned" }] });
    expect(taskList.tasks?.[0]?.id).toBe("t1");

    const role = expectRoleAssignmentShape({ roleCategory: "legal", roleName: "reader", actorId: "act", actions: ["a"] });
    expect(role.actions).toEqual(["a"]);
  });

  it("validates address lookup shape", () => {
    const parsed = expectAddressLookupShape({
      header: {},
      results: [{ DPA: { POSTCODE: "AB1 2CD", ADDRESS: "123 Street", POST_TOWN: "Town" } }]
    });
    expect(parsed.results?.length).toBe(1);
  });
});
