import type { Page } from "@playwright/test";

export const DEFAULT_ROLE_ACCESS_USERS_OPS = [
  {
    name: "case-role-1",
    roleCategory: "LEGAL_OPERATIONS",
    roleName: "Case role A",
    roleId: "role-1",
    location: "Taylor House",
    start: "2026-01-10T09:00:00.000Z",
    end: "2026-02-10T17:00:00.000Z",
    id: "assignment-1",
    actorId: "idam-111",
    email: "alice@example.com"
  },
  {
    name: "case-role-2",
    roleCategory: "LEGAL_OPERATIONS",
    roleName: "Case role B",
    roleId: "role-2",
    location: "Taylor House",
    start: "2026-01-11T09:00:00.000Z",
    end: "2026-02-11T17:00:00.000Z",
    id: "assignment-2",
    actorId: "idam-222",
    email: "bob@example.com"
  }
];

export const DEFAULT_ROLE_ACCESS_USERS_JUDICIAL = [
  {
    name: "case-role-3",
    roleCategory: "JUDICIAL",
    roleName: "Case role A",
    roleId: "role-3",
    location: "Taylor House",
    start: "2026-01-12T09:00:00.000Z",
    end: "2026-02-12T17:00:00.000Z",
    id: "assignment-3",
    actorId: "idam-333",
    email: "judge.alice@example.com"
  },
  {
    name: "case-role-4",
    roleCategory: "JUDICIAL",
    roleName: "Case role B",
    roleId: "role-4",
    location: "Taylor House",
    start: "2026-01-13T09:00:00.000Z",
    end: "2026-02-13T17:00:00.000Z",
    id: "assignment-4",
    actorId: "idam-444",
    email: "judge.bob@example.com"
  }
];

export const DEFAULT_CASEWORKERS = [
  {
    email: "alice@example.com",
    firstName: "Alice",
    idamId: "idam-111",
    lastName: "Example",
    location: {
      id: 227101,
      locationName: "Taylor House"
    },
    roleCategory: "LEGAL_OPERATIONS",
    service: "PUBLICLAW"
  },
  {
    email: "bob@example.com",
    firstName: "Bob",
    idamId: "idam-222",
    lastName: "Example",
    location: {
      id: 227101,
      locationName: "Taylor House"
    },
    roleCategory: "LEGAL_OPERATIONS",
    service: "PUBLICLAW"
  },
  {
    email: "judge.alice@example.com",
    firstName: "Alice",
    idamId: "idam-333",
    lastName: "Judge",
    location: {
      id: 227101,
      locationName: "Taylor House"
    },
    roleCategory: "JUDICIAL",
    service: "PUBLICLAW"
  },
  {
    email: "judge.bob@example.com",
    firstName: "Bob",
    idamId: "idam-444",
    lastName: "Judge",
    location: {
      id: 227101,
      locationName: "Taylor House"
    },
    roleCategory: "JUDICIAL",
    service: "PUBLICLAW"
  }
];

export const DEFAULT_CASEWORKERS_OPS = DEFAULT_CASEWORKERS.filter(
  (caseworker) => caseworker.roleCategory === "LEGAL_OPERATIONS"
);

export const DEFAULT_JUDICIAL_USERS = [
  {
    idamId: "idam-333",
    fullName: "Alice Judge",
    emailId: "judge.alice@example.com"
  },
  {
    idamId: "idam-444",
    fullName: "Bob Judge",
    emailId: "judge.bob@example.com"
  }
];

export type RestrictedAccessMockOverrides = {
  roleAccessStatus?: number;
  roleAccessBody?: unknown;
  caseworkersStatus?: number;
  caseworkersBody?: unknown;
  supportedJurisdictionsStatus?: number;
  supportedJurisdictions?: unknown;
  judicialUsersStatus?: number;
  judicialUsersBody?: unknown;
};

export async function setupRestrictedAccessMocks(
  page: Page,
  overrides: RestrictedAccessMockOverrides = {}
): Promise<void> {
  const {
    roleAccessStatus = 200,
    roleAccessBody = [...DEFAULT_ROLE_ACCESS_USERS_OPS, ...DEFAULT_ROLE_ACCESS_USERS_JUDICIAL],
    caseworkersStatus = 200,
    caseworkersBody = DEFAULT_CASEWORKERS_OPS,
    supportedJurisdictionsStatus = 200,
    supportedJurisdictions = ["PUBLICLAW"],
    judicialUsersStatus = 200,
    judicialUsersBody = DEFAULT_JUDICIAL_USERS
  } = overrides;

  await page.route("**/api/role-access/roles/access-get-by-caseId*", async (route) => {
    await route.fulfill({
      status: roleAccessStatus,
      contentType: "application/json",
      body: JSON.stringify(roleAccessBody)
    });
  });

  await page.route("**/api/wa-supported-jurisdiction/get*", async (route) => {
    await route.fulfill({
      status: supportedJurisdictionsStatus,
      contentType: "application/json",
      body: JSON.stringify(supportedJurisdictions)
    });
  });

  await page.route("**/workallocation/caseworker/getUsersByServiceName*", async (route) => {
    await route.fulfill({
      status: caseworkersStatus,
      contentType: "application/json",
      body: JSON.stringify(caseworkersBody)
    });
  });

  await page.route("**/api/prd/judicial/searchJudicialUserByIdamId*", async (route) => {
    let responseBody = judicialUsersBody;

    if (judicialUsersStatus === 200 && Array.isArray(judicialUsersBody)) {
      let requestedIds: string[] = [];
      try {
        const requestBody = route.request().postDataJSON() as { sidam_ids?: string[] };
        requestedIds = Array.isArray(requestBody?.sidam_ids) ? requestBody.sidam_ids : [];
      } catch {
        requestedIds = [];
      }

      if (requestedIds.length > 0) {
        responseBody = judicialUsersBody.filter((user: { idamId?: string }) =>
          typeof user?.idamId === "string" ? requestedIds.includes(user.idamId) : false
        );
      }
    }

    await route.fulfill({
      status: judicialUsersStatus,
      contentType: "application/json",
      body: JSON.stringify(responseBody)
    });
  });
}
