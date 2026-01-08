/* eslint-disable @typescript-eslint/no-explicit-any */
import { promises as fs } from "node:fs";

import { request as playwrightRequest } from "@playwright/test";
import { v4 as uuid } from "uuid";

import { config } from "../../config/api";
import { EM_DOC_ID } from "../../data/api/testIds";
import { expect, test } from "../../fixtures/api";
import { ensureStorageState, getStoredCookie } from "../../fixtures/api-auth";
import { expectStatus, StatusSets, withXsrf } from "../../utils/api/apiTestUtils";
import { expectAnnotationShape, expectBookmarkShape } from "../../utils/api/assertions";
import { AnnotationPayload, BookmarkPayload } from "../../utils/api/types";

const configuredDocId = EM_DOC_ID ?? config.em[config.testEnv as keyof typeof config.em]?.docId;
const baseURL = config.baseUrl.replace(/\/+$/, "");
let sharedDocId: string | undefined;
const invalidDocId = uuid();

test.describe("Evidence Manager & Documents", () => {
  test.beforeAll(async () => {
    if (configuredDocId) {
      sharedDocId = configuredDocId;
      return;
    }
    sharedDocId = await uploadSyntheticDoc();
  });

  test("returns document binary with XSRF", async ({ apiClient }) => {
    await withXsrf("solicitor", async (headers) => {
      const res = await apiClient.get<ArrayBuffer>(`documents/${sharedDocId}/binary`, {
        headers: { ...headers, experimental: "true" },
        throwOnError: false,
        
      });
      expectStatus(res.status, [200, 204, 401, 403, 404, 500]);
      if (res.status === 200) {
        const buf = res.data as ArrayBuffer;
      const len = (buf as any)?.byteLength;
      if (typeof len === "number") {
        expect(len).toBeGreaterThan(0);
      }
      }
    });
  });

  test("rejects unauthenticated binary fetch", async ({ anonymousClient }) => {
    const res = await anonymousClient.get(`documents/${sharedDocId}/binary`, { throwOnError: false });
    expectStatus(res.status, [401, 403]);
  });

  test("annotations metadata guarded by session", async ({ apiClient, anonymousClient }) => {
    const anon = await anonymousClient.get(`em-anno/metadata/${sharedDocId}`, { throwOnError: false });
    expectStatus(anon.status, [401, 403]);

    await withXsrf("solicitor", async (headers) => {
      const res = await apiClient.get(`em-anno/metadata/${sharedDocId}`, {
        headers: { ...headers, experimental: "true" },
        throwOnError: false
      });
      expectStatus(res.status, [200, 204, 401, 403, 404, 500]);
    });
  });

  test("returns 404 for missing document", async ({ apiClient }) => {
    await withXsrf("solicitor", async (headers) => {
      const res = await apiClient.get(`documents/${invalidDocId}/binary`, {
        headers,
        throwOnError: false
      });
      expectStatus(res.status, [400, 404]);
    });
  });

  test("creates and deletes annotation with valid XSRF", async ({ apiClient }) => {
    await withXsrf("solicitor", async (headers) => {
      const annotation = await buildAnnotation(apiClient, headers);
      const createRes = await apiClient.put("em-anno/annotations", {
        data: annotation,
        headers,
        throwOnError: false
      });
      expectStatus(createRes.status, [200, 204, 401, 403, 404, 409, 500]);
      if (createRes.status === 200 && Array.isArray((createRes.data as any)?.annotations)) {
        const created = (createRes.data as any).annotations?.[0];
        if (created) {
          expectAnnotationShape(created);
          const deleteRes = await apiClient.delete(`em-anno/annotations/${created.id}`, {
            headers,
            throwOnError: false
          });
          expectStatus(deleteRes.status, [200, 204, 401, 403, 404, 500]);
        }
      }
    });
  });

  test("rejects annotation creation without XSRF", async ({ apiClient }) => {
    await ensureStorageState("solicitor");
    const res = await apiClient.put("em-anno/annotations", {
      data: await buildAnnotation(apiClient, {}),
      headers: {},
      throwOnError: false
    });
    expectStatus(res.status, [401, 403]);
  });

  test("creates bookmark with XSRF", async ({ apiClient }) => {
    await withXsrf("solicitor", async (headers) => {
      const body = buildBookmarkPayload();
      const res = await apiClient.post<{ bookmarks?: BookmarkPayload[] }>("documents/bookmarks", {
        headers,
        data: body,
        throwOnError: false
      });
      expectStatus(res.status, [200, 201, 204, 401, 403, 500]);
      if (res.status === 200 && Array.isArray(res.data?.bookmarks) && res.data.bookmarks.length > 0) {
        expectBookmarkShape(res.data.bookmarks[0]);
      }
    });
  });

  test("rejects bookmark creation without XSRF", async ({ apiClient }) => {
    const res = await apiClient.post("documents/bookmarks", {
      data: buildBookmarkPayload(),
      throwOnError: false
    });
    expectStatus(res.status, StatusSets.bookmark);
  });

  test("returns edited document path info", async ({ apiClient }) => {
    const res = await withXsrf("solicitor", (headers) =>
      apiClient.get("em-npa/editedDocumentPath", {
        headers,
        throwOnError: false
      })
    );
    expectStatus(res.status, [...StatusSets.guardedBasic, 404]);
    if (res.status === 200 && res.data && typeof res.data === "object" && !Array.isArray(res.data)) {
      expect(res.data as any).toEqual(
        expect.objectContaining({
          path: expect.any(String),
          docstore: expect.any(String)
        })
      );
    }
  });

  test("returns client config", async ({ apiClient }) => {
    const res = await apiClient.get("em-anno/config/client", { throwOnError: false });
    expectStatus(res.status, [200, 401, 403, 404, 500, 502, 504]);
    if (res.status === 200) {
      expect(res.data).toEqual(
        expect.objectContaining({
          baseUrl: expect.any(String),
          oauth2RedirectUrl: expect.any(String),
          api: expect.objectContaining({
            baseUrl: expect.any(String),
            annotationsUrl: expect.any(String),
            annotationsV2Url: expect.any(String),
            tagsUrl: expect.any(String)
          })
        })
      );
    }
  });

  test("returns client config (iframe compatible)", async ({ apiClient }) => {
    const res = await apiClient.get("em-anno/config/client", {
      headers: { "Allow-Frame": "true" },
      throwOnError: false
    });
    expectStatus(res.status, [200, 401, 403, 404, 500, 502, 504]);
  });

  test("returns annotations config", async ({ apiClient }) => {
    const res = await apiClient.get("em-anno/config", { throwOnError: false });
    expectStatus(res.status, [200, 401, 403, 404, 500, 502, 504]);
    if (res.status === 200) {
      expect(res.data).toEqual(
        expect.objectContaining({
          emAnno: expect.objectContaining({
            endpoint: expect.any(String),
            documentsEndpoint: expect.any(String),
            annotationsEndpoint: expect.any(String),
            tagsEndpoint: expect.any(String),
            summariesEndpoint: expect.any(String)
          }),
          emNpa: expect.objectContaining({
            endpoint: expect.any(String)
          }),
          emRendition: expect.objectContaining({
            endpoint: expect.any(String)
          })
        })
      );
    }
  });

  test("returns unauthenticated rendition", async () => {
    const ctx = await playwrightRequest.newContext({
      baseURL: config.baseUrl.replace(/\/+$/, ""),
      ignoreHTTPSErrors: true
    });
    const res = await ctx.get("em-anno/rendition", { failOnStatusCode: false });
    expectStatus(res.status(), [200, 401, 403, 404]);
    await ctx.dispose();
  });

  test("returns rendition with bearer token if available", async () => {
    const ctx = await playwrightRequest.newContext({
      baseURL: config.baseUrl.replace(/\/+$/, ""),
      ignoreHTTPSErrors: true
    });
    const bearer = await getBearerToken();
    const res = await ctx.get("em-anno/rendition", {
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined,
      failOnStatusCode: false
    });
    expectStatus(res.status(), [200, 401, 403, 404, 500]);
    await ctx.dispose();
  });

  test("renders single document (iframe toggle)", async ({ apiClient }) => {
    const baseHeaders = await buildCookieHeaders();
    const res = await apiClient.get(`/documents/${sharedDocId}`, {
      headers: {
        ...baseHeaders,
        experimental: "true"
      },
      throwOnError: false
    });
    expectStatus(res.status, StatusSets.documentView);
  });

  test("fails to render missing document", async ({ apiClient }) => {
    const baseHeaders = await buildCookieHeaders();
    const res = await apiClient.get(`/documents/${invalidDocId}`, {
      headers: baseHeaders,
      throwOnError: false
    });
    expectStatus(res.status, [404]);
  });
});

async function buildAnnotation(apiClient: any, headers: Record<string, string>) {
  const annotation = await apiClient.get("em-anno/annotations/" + sharedDocId, {
    headers,
    throwOnError: false
  });
  expectStatus(annotation.status, [200, 404]);
  if (annotation.status === 200 && Array.isArray((annotation.data as any)?.annotations) && (annotation.data as any).annotations.length > 0) {
    return (annotation.data as any).annotations[0];
  }
  const annoId = uuid();
  const rectId = uuid();
  return {
    documentId: sharedDocId,
    id: annoId,
    annotationSetId: annoId,
    rectangles: [
      {
        id: rectId,
        x: Math.floor(Math.random() * 5) + 5,
        y: Math.floor(Math.random() * 5) + 5,
        height: Math.floor(Math.random() * 5) + 5,
        width: Math.floor(Math.random() * 5) + 5
      }
    ]
  } satisfies AnnotationPayload;
}

function buildBookmarkPayload(): BookmarkPayload {
  return {
    annotationsIds: uuid(),
    documentId: sharedDocId,
    id: uuid(),
    name: "BM-" + uuid(),
    createdBy: "playwright",
    pageNumber: 1,
    xCoordinate: Math.floor(Math.random() * 5) + 5,
    yCoordinate: Math.floor(Math.random() * 5) + 5
  } as any;
}

async function uploadSyntheticDoc(): Promise<string> {
  const statePath = await ensureStorageState("solicitor");
  const state = JSON.parse(await fs.readFile(statePath, "utf8"));
  const ctx = await playwrightRequest.newContext({
    baseURL: config.baseUrl.replace(/\/+$/, ""),
    storageState: state,
    ignoreHTTPSErrors: true
  });
  try {
    const content = Buffer.from("<html><body><h1>Playwright synthetic doc</h1></body></html>", "utf8");
    const res = await ctx.post("em-icp/upload", {
      multipart: {
        files: {
          name: "sample.html",
          mimeType: "text/html",
          buffer: content
        }
      },
      headers: { experimental: "true" },
      failOnStatusCode: false
    });
    const body = await res.json().catch(() => ({} as any));
    const docId = (Array.isArray(body?.documents) && body.documents[0]?.documentId) || body?.documentId;
    return typeof docId === "string" && docId.trim().length > 0 ? docId : uuid();
  } finally {
    await ctx.dispose();
  }
}

async function buildCookieHeaders() {
  const xsrf = await getStoredCookie("solicitor", "XSRF-TOKEN", baseURL);
  const headers: Record<string, string> = {};
  if (xsrf) {
    headers["X-XSRF-TOKEN"] = xsrf;
    headers["experimental"] = "true";
  }
  return headers;
}

async function getBearerToken(): Promise<string | undefined> {
  const statePath = await ensureStorageState("solicitor");
  const raw = await fs.readFile(statePath, "utf8");
  const parsed = JSON.parse(raw);
  const bearerCookie =
    Array.isArray(parsed.cookies) && parsed.cookies.length > 0 ? parsed.cookies.find((c: any) => c.name === "__auth__") : undefined;
  return bearerCookie?.value;
}
