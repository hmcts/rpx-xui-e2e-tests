import { expect, test, type Request, type Route } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  setupCaseFileViewDocumentBinaryMockRoutes,
  setupCaseFileViewMockRoutes
} from "../integration/helpers/caseFileViewMockRoutes.helper";
import {
  buildCaseFileViewCaseMock,
  buildCaseFileViewCategoriesMock,
  buildEmptyCaseFileViewCategoriesMock,
  CASE_FILE_VIEW_DOC_IDS
} from "../integration/mocks/caseFileView.mock";

type FakeFulfillPayload = {
  status: number;
  contentType?: string;
  body?: string | Buffer;
};

type FakeRoute = Pick<Route, "request" | "fulfill">;

const buildFakeRoute = (url: string) => {
  let fulfillPayload: FakeFulfillPayload | undefined;
  const route: FakeRoute = {
    request: () =>
      ({
        url: () => url
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

test.describe("Case-file-view support coverage", () => {
  test("case details mock includes the Case File View launcher tab", () => {
    const mock = buildCaseFileViewCaseMock("1690807693531270");
    expect(mock.case_type.jurisdiction.id).toBe("PRIVATELAW");
    expect(mock.tabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "caseFileView",
          label: "Case File View"
        })
      ])
    );
  });

  test("categories mock contains mixed V1 and V2 documents with stable folder hierarchy", () => {
    const mock = buildCaseFileViewCategoriesMock();
    expect(mock.categories.map((category) => category.category_name)).toEqual([
      "Evidence",
      "Orders",
      "Applications"
    ]);
    expect(mock.categories[0].documents.map((document) => document.document_filename)).toEqual([
      "Zeta evidence.pdf",
      "Alpha evidence.pdf",
      "Middle evidence.pdf"
    ]);
    expect(mock.categories[0].documents[0].document_binary_url).toContain(
      `/documentsv2/${CASE_FILE_VIEW_DOC_IDS.evidenceZetaV2}/binary`
    );
    expect(mock.categories[0].documents[1].document_binary_url).toContain(
      `/documents/${CASE_FILE_VIEW_DOC_IDS.evidenceAlphaV1}/binary`
    );
    expect(buildEmptyCaseFileViewCategoriesMock()).toEqual({
      case_version: 2,
      categories: []
    });
  });

  test("route helper wires case details and categories endpoints with configurable payloads", async () => {
    const registrations: Array<{ pattern: string; handler: (route: Route) => Promise<void> }> = [];
    const fakePage = {
      route: async (pattern: string, handler: (route: Route) => Promise<void>) => {
        registrations.push({ pattern, handler });
      }
    };

    await setupCaseFileViewMockRoutes(fakePage as unknown as Page, "1690807693531270", {
      categoriesStatus: 206
    });

    expect(registrations.map((registration) => registration.pattern)).toEqual([
      "**/data/internal/cases/1690807693531270*",
      "**/categoriesAndDocuments/1690807693531270*"
    ]);

    const caseRoute = buildFakeRoute("https://example.test/data/internal/cases/1690807693531270");
    await registrations[0].handler(caseRoute.route as Route);
    expect(caseRoute.lastFulfill()?.status).toBe(200);

    const categoriesRoute = buildFakeRoute("https://example.test/categoriesAndDocuments/1690807693531270");
    await registrations[1].handler(categoriesRoute.route as Route);
    expect(categoriesRoute.lastFulfill()?.status).toBe(206);
    expect(JSON.parse((categoriesRoute.lastFulfill()?.body as string) ?? "{}")).toEqual(buildCaseFileViewCategoriesMock());
  });

  test("binary route helper serves both V1 and V2 document paths", async () => {
    const registrations: Array<{ pattern: string; handler: (route: Route) => Promise<void> }> = [];
    const fakePage = {
      route: async (pattern: string, handler: (route: Route) => Promise<void>) => {
        registrations.push({ pattern, handler });
      }
    };

    await setupCaseFileViewDocumentBinaryMockRoutes(fakePage as unknown as Page);
    expect(registrations.map((registration) => registration.pattern)).toEqual([
      "**/documentsv2/*/binary",
      "**/documents/*/binary"
    ]);

    const v2Route = buildFakeRoute("https://example.test/documentsv2/id/binary");
    await registrations[0].handler(v2Route.route as Route);
    expect(v2Route.lastFulfill()?.status).toBe(200);
    expect(v2Route.lastFulfill()?.contentType).toBe("application/pdf");

    const v1Route = buildFakeRoute("https://example.test/documents/id/binary");
    await registrations[1].handler(v1Route.route as Route);
    expect(v1Route.lastFulfill()?.status).toBe(200);
    expect(v1Route.lastFulfill()?.contentType).toBe("application/pdf");
  });
});
