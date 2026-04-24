import { expect, test, type Request, type Route } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  listCreateCaseOptionCandidates,
  matchCreateCaseOption,
  resolveCreateCaseStartEvent
} from "../../page-objects/pages/exui/createCase.options";
import {
  routeCaseCreationFlow,
  setupCreateCaseBaseRoutes
} from "../integration/helpers/createCaseMockRoutes.helper";
import {
  buildCreateCaseAclGroup,
  divorcePocCaseData
} from "../integration/mocks/createCase.mock";

type FakeFulfillPayload = {
  status: number;
  contentType?: string;
  body?: string | Buffer;
};

type FakeRoute = Pick<Route, "request" | "fulfill">;

const routePatternText = (pattern: string | RegExp): string =>
  typeof pattern === "string" ? pattern : pattern.toString();

const buildFakeRoute = (url: string, method = "GET", postDataJSON?: unknown) => {
  let fulfillPayload: FakeFulfillPayload | undefined;
  const route: FakeRoute = {
    request: () =>
      ({
        url: () => url,
        method: () => method,
        postDataJSON: () => postDataJSON
      }) as unknown as Request,
    fulfill: async (payload: FakeFulfillPayload) => {
      fulfillPayload = payload;
    }
  };

  return {
    route,
    lastFulfill: () => fulfillPayload
  };
};

test.describe("coverage-create-case", () => {
  test("divorcePocCaseData preserves hidden-field and retention contract", async () => {
    const mock = divorcePocCaseData();
    const textField1 = mock.case_fields.find((field) => field.id === "TextField1");
    const textField2 = mock.case_fields.find((field) => field.id === "TextField2");
    const gender = mock.case_fields.find((field) => field.id === "Gender");
    const person1 = mock.case_fields.find((field) => field.id === "Person1");

    expect(textField1).toMatchObject({
      show_condition: 'TextField0!="Hide TextField1" AND TextField0!="Hide all"',
      retain_hidden_value: null
    });
    expect(textField2).toMatchObject({
      show_condition: 'TextField0!="Hide TextField2" AND TextField0!="Hide all"',
      retain_hidden_value: true
    });
    expect(gender).toMatchObject({
      show_condition: 'TextField0!="Hide all"',
      retain_hidden_value: true
    });
    expect(person1).toMatchObject({
      retain_hidden_value: true
    });
    expect(mock.end_button_label).toBe("Test submit");
    expect(mock.wizard_pages.map((page) => page.id)).toEqual(["createCasePage_1", "createCasePage_2"]);
  });

  test("buildCreateCaseAclGroup expands string and override entries", async () => {
    expect(
      buildCreateCaseAclGroup([
        "caseworker-divorce-solicitor",
        { role: "caseworker-divorce-courtadmin", update: false, delete: false }
      ])
    ).toEqual([
      {
        role: "caseworker-divorce-solicitor",
        create: true,
        read: true,
        update: true,
        delete: true
      },
      {
        role: "caseworker-divorce-courtadmin",
        create: true,
        read: true,
        update: false,
        delete: false
      }
    ]);
  });

  test("create-case option matching preserves source-style aliases", () => {
    const options = [
      { label: "Family Private Law", value: "PRIVATELAW" },
      { label: "C100 & FL401 Applications", value: "PRLAPPS" }
    ];

    expect(listCreateCaseOptionCandidates("DIVORCE")).toEqual([
      "DIVORCE",
      "PRIVATELAW",
      "Family Private Law"
    ]);
    expect(matchCreateCaseOption(options, "DIVORCE")).toEqual(options[0]);
    expect(matchCreateCaseOption(options, "XUI Case PoC")).toEqual(options[1]);
    expect(matchCreateCaseOption(options, "xuiTestCaseType")).toEqual(options[1]);
  });

  test("resolveCreateCaseStartEvent prefers a source-style default event when start is gated", () => {
    const options = [
      { label: "TS-Solicitor application", value: "ts-solicitor-application" },
      { label: "Solicitor application", value: "solicitor-application" }
    ];

    expect(resolveCreateCaseStartEvent(options)).toEqual(options[1]);
    expect(resolveCreateCaseStartEvent(options, "TS-Solicitor application")).toEqual(options[0]);
  });

  test("resolveCreateCaseStartEvent falls back to the first non-technical option when no preferred label exists", () => {
    const options = [
      { label: "TS-First option", value: "ts-first-option" },
      { label: "General case creation", value: "general-case-creation" }
    ];

    expect(resolveCreateCaseStartEvent(options)).toEqual(options[1]);
  });

  test("setupCreateCaseBaseRoutes wires validate and trigger endpoints", async () => {
    const registrations: Array<{ pattern: string; handler: (route: Route) => Promise<void> }> = [];
    const fakePage = {
      route: async (pattern: string, handler: (route: Route) => Promise<void>) => {
        registrations.push({ pattern, handler });
      },
      addInitScript: async () => undefined
    };

    await setupCreateCaseBaseRoutes(fakePage as unknown as Page);

    expect(registrations.map((registration) => routePatternText(registration.pattern))).toEqual(
      expect.arrayContaining([
        "**/data/case-types/xuiTestJurisdiction/validate*",
        "**/data/internal/case-types/xuiTestJurisdiction/event-triggers/createCase*"
      ])
    );

    const validateRegistration = registrations.find((registration) =>
      routePatternText(registration.pattern).includes("/data/case-types/xuiTestJurisdiction/validate")
    );
    const validateRoute = buildFakeRoute(
      "https://example.test/data/case-types/xuiTestJurisdiction/validate",
      "POST",
      { data: { TextField0: "abc" } }
    );
    await validateRegistration!.handler(validateRoute.route as Route);
    expect(validateRoute.lastFulfill()?.status).toBe(200);
    expect(JSON.parse((validateRoute.lastFulfill()?.body as string) ?? "{}")).toEqual({
      data: { TextField0: "abc" },
      _links: {
        self: {
          href: "https://example.test/data/case-types/xuiTestJurisdiction/validate"
        }
      }
    });
  });

  test("routeCaseCreationFlow captures the submission payload and serves created case details", async () => {
    const registrations: Array<{ pattern: string; handler: (route: Route) => Promise<void> }> = [];
    const fakePage = {
      route: async (pattern: string, handler: (route: Route) => Promise<void>) => {
        registrations.push({ pattern, handler });
      }
    };

    const capturedRequestPromise = routeCaseCreationFlow(fakePage as unknown as Page);

    const createRoute = buildFakeRoute(
      "https://example.test/data/case-types/xuiTestJurisdiction/cases?ignore-warning=false",
      "POST",
      { data: { TextField0: "hello" } }
    );
    const createRegistration = registrations.find((registration) =>
      routePatternText(registration.pattern).includes("/data/case-types/xuiTestJurisdiction/cases")
    );
    await createRegistration!.handler(createRoute.route as Route);
    expect(createRoute.lastFulfill()?.status).toBe(201);
    await expect(capturedRequestPromise).resolves.toEqual({ data: { TextField0: "hello" } });

    const caseRoute = buildFakeRoute("https://example.test/data/internal/cases/1234123412341234");
    const caseRegistration = registrations.find((registration) =>
      routePatternText(registration.pattern).includes("/data/internal/cases/1234123412341234")
    );
    await caseRegistration!.handler(caseRoute.route as Route);
    expect(caseRoute.lastFulfill()?.status).toBe(200);
    expect(JSON.parse((caseRoute.lastFulfill()?.body as string) ?? "{}")).toMatchObject({
      case_id: "1234123412341234",
      state: {
        id: "CaseCreated",
        name: "Case created"
      }
    });
  });
});
