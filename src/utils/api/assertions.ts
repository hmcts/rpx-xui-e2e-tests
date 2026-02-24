import { expect } from "@playwright/test";

import {
  AddressLookupResponseSchema,
  AnnotationPayloadSchema,
  BookmarkPayloadSchema,
  CaseShareResponseSchema,
  EmAnnotationsConfigSchema,
  EmClientConfigSchema,
  EditedDocumentPathSchema,
  ExternalConfigCheckSchema,
  FeatureFlagConfigValueSchema,
  HealthCheckResponseSchema,
  RoleAssignmentSchema,
  TaskListSchema,
  UserDetailsResponseSchema,
} from "./types";

export function expectTaskList(payload: unknown) {
  const parsed = TaskListSchema.parse(payload);
  expect(parsed).toBeTruthy();
  expect(typeof parsed).toBe("object");
  expect(Array.isArray(parsed.tasks)).toBe(true);
  if ((parsed.tasks?.length ?? 0) > 0) {
    expect(parsed.tasks![0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        task_state: expect.any(String),
      }),
    );
  }
  return parsed;
}

export function expectRoleAssignmentShape(role: unknown) {
  const parsed = RoleAssignmentSchema.parse(role);
  expect(parsed).toEqual(
    expect.objectContaining({
      roleCategory: expect.any(String),
      roleName: expect.any(String),
    }),
  );
  if (parsed.actorId !== undefined) {
    expect(typeof parsed.actorId).toBe("string");
  }
  if (parsed.actions !== undefined) {
    expect(Array.isArray(parsed.actions)).toBe(true);
  }
  return parsed;
}

export function expectBookmarkShape(bookmark: unknown) {
  const parsed = BookmarkPayloadSchema.parse(bookmark);
  expect(parsed).toEqual(
    expect.objectContaining({
      id: expect.any(String),
      name: expect.any(String),
      documentId: expect.any(String),
    }),
  );
  return parsed;
}

export function expectAnnotationShape(annotation: unknown) {
  const parsed = AnnotationPayloadSchema.parse(annotation);
  expect(parsed).toEqual(
    expect.objectContaining({
      id: expect.any(String),
      documentId: expect.any(String),
      annotationSetId: expect.any(String),
    }),
  );
  return parsed;
}

export function expectCaseShareShape(payload: unknown, property: string) {
  const parsed = CaseShareResponseSchema.parse(payload);
  switch (property) {
    case "organisations":
      expect(parsed).toEqual(
        expect.objectContaining({
          organisations: expect.arrayContaining([
            expect.objectContaining({
              organisationIdentifier: expect.any(String),
              name: expect.any(String),
            }),
          ]),
        }),
      );
      break;
    case "users":
      expect(parsed).toEqual(
        expect.objectContaining({
          users: expect.arrayContaining([
            expect.objectContaining({
              userIdentifier: expect.any(String),
              email: expect.any(String),
            }),
          ]),
        }),
      );
      break;
    case "cases":
    case "sharedCases":
      expect(parsed).toEqual(
        expect.objectContaining({
          [property]: expect.arrayContaining([
            expect.objectContaining({
              caseId: expect.any(String),
              sharedWith: expect.any(Array),
            }),
          ]),
        }),
      );
      break;
    default:
      break;
  }
  return parsed;
}

export function expectAddressLookupShape(response: unknown) {
  if (isHtmlDocumentPayload(response)) {
    return response;
  }
  const normalisedPayload =
    Array.isArray(response) &&
    response.every((item) => typeof item === "object")
      ? { results: response, header: undefined }
      : response;
  const parsed = AddressLookupResponseSchema.parse(normalisedPayload);
  expect(parsed).toHaveProperty("results");
  expect(parsed).toHaveProperty("header");
  expect(Array.isArray(parsed.results)).toBe(true);
  if ((parsed.results?.length ?? 0) > 0) {
    const dpa = parsed.results![0]?.DPA;
    expect(dpa).toBeTruthy();
    expect(dpa).toEqual(
      expect.objectContaining({
        POSTCODE: expect.any(String),
        ADDRESS: expect.any(String),
        POST_TOWN: expect.any(String),
      }),
    );
  }
  return parsed;
}

export function expectUserDetailsShape(payload: unknown) {
  const parsed = UserDetailsResponseSchema.parse(payload);
  expect(parsed.userInfo).toEqual(
    expect.objectContaining({
      email: expect.any(String),
      roles: expect.arrayContaining([expect.any(String)]),
    }),
  );
  expect(parsed.userInfo?.uid ?? parsed.userInfo?.id).toBeDefined();
  if (parsed.userInfo?.given_name || parsed.userInfo?.forename) {
    expect(parsed.userInfo?.given_name ?? parsed.userInfo?.forename).toEqual(
      expect.any(String),
    );
  }
  if (parsed.userInfo?.family_name || parsed.userInfo?.surname) {
    expect(parsed.userInfo?.family_name ?? parsed.userInfo?.surname).toEqual(
      expect.any(String),
    );
  }
  expect(parsed).toEqual(
    expect.objectContaining({
      roleAssignmentInfo: expect.any(Array),
      canShareCases: expect.any(Boolean),
      sessionTimeout: expect.objectContaining({
        idleModalDisplayTime: expect.any(Number),
        pattern: expect.any(String),
      }),
    }),
  );
  return parsed;
}

export function expectExternalConfigCheckShape(payload: unknown) {
  const parsed = ExternalConfigCheckSchema.parse(payload);
  expect(parsed.clientId).toEqual(expect.any(String));
  expect(parsed.protocol).toEqual(expect.any(String));
  return parsed;
}

export function expectFeatureFlagValueShape(payload: unknown) {
  return FeatureFlagConfigValueSchema.parse(payload);
}

export function expectHealthCheckShape(payload: unknown) {
  const parsed = HealthCheckResponseSchema.parse(payload);
  if (parsed.healthState !== undefined) {
    expect(typeof parsed.healthState).toBe("boolean");
  }
  return parsed;
}

export function expectEditedDocumentPathShape(payload: unknown) {
  if (isHtmlDocumentPayload(payload)) {
    return payload;
  }
  const parsed = EditedDocumentPathSchema.parse(payload);
  expect(parsed).toEqual(
    expect.objectContaining({
      path: expect.any(String),
      docstore: expect.any(String),
    }),
  );
  return parsed;
}

export function expectEmClientConfigShape(payload: unknown) {
  const parsed = EmClientConfigSchema.parse(payload);
  expect(parsed).toEqual(
    expect.objectContaining({
      baseUrl: expect.any(String),
      oauth2RedirectUrl: expect.any(String),
      api: expect.objectContaining({
        baseUrl: expect.any(String),
        annotationsUrl: expect.any(String),
        annotationsV2Url: expect.any(String),
        tagsUrl: expect.any(String),
      }),
    }),
  );
  return parsed;
}

export function expectEmAnnotationsConfigShape(payload: unknown) {
  const parsed = EmAnnotationsConfigSchema.parse(payload);
  expect(parsed).toEqual(
    expect.objectContaining({
      emAnno: expect.objectContaining({
        endpoint: expect.any(String),
        documentsEndpoint: expect.any(String),
        annotationsEndpoint: expect.any(String),
        tagsEndpoint: expect.any(String),
        summariesEndpoint: expect.any(String),
      }),
      emNpa: expect.objectContaining({
        endpoint: expect.any(String),
      }),
      emRendition: expect.objectContaining({
        endpoint: expect.any(String),
      }),
    }),
  );
  return parsed;
}

function isHtmlDocumentPayload(payload: unknown): payload is string {
  if (typeof payload !== "string") {
    return false;
  }
  const trimmed = payload.trim().toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}
