import {
  assertAnnotationResponse,
  assertBinaryResponse,
  assertBookmarkResponse,
  buildAnnotation,
  buildBookmark,
  buildXsrfHeader,
  resolveAnnotationSetId,
  resolveConfiguredDocId,
  resolveCreatedAnnotationId,
  resolveCreatedBookmarkId,
  resolveSharedDocId,
  resolveUploadedDocId,
  resolveUserInfoId,
  uploadSyntheticDoc,
} from '../../utils/api/evidenceManagerUtils';

import { test, expect } from './fixtures';


type UploadSyntheticDocDeps = NonNullable<Parameters<typeof uploadSyntheticDoc>[0]>;
type UploadRequestContext = Awaited<ReturnType<NonNullable<UploadSyntheticDocDeps['requestFactory']>>>;
let sharedDocId = '';

test.describe('Evidence Manager helper coverage', { tag: '@svc-evidence-manager' }, () => {
  test('resolveConfiguredDocId and resolveSharedDocId handle overrides', async () => {
    expect(resolveConfiguredDocId('env-doc', 'fallback-doc')).toBe('env-doc');
    expect(resolveConfiguredDocId(undefined, 'fallback-doc')).toBe('fallback-doc');

    const configured = await resolveSharedDocId('configured-doc', async () => 'uploaded-doc');
    expect(configured).toBe('configured-doc');

    const uploaded = await resolveSharedDocId(undefined, async () => 'uploaded-doc');
    expect(uploaded).toBe('uploaded-doc');

    const fallback = await resolveSharedDocId(
      undefined,
      async () => {
        throw new Error('Synthetic document upload failed: HTTP 422');
      },
      () => 'fallback-doc'
    );
    expect(fallback).toBe('fallback-doc');
  });

  test('annotation helpers cover ids and responses', () => {
    const data = { annotations: [{ id: 'anno-1', documentId: 'doc-1', annotationSetId: 'set-1' }] };
    assertAnnotationResponse(200, data);
    assertAnnotationResponse(500, data);
    expect(resolveCreatedAnnotationId(data, 'fallback')).toBe('anno-1');
    expect(resolveCreatedAnnotationId({}, 'fallback')).toBe('fallback');
  });

  test('bookmark helpers cover ids and responses', () => {
    const data = { id: 'bookmark-1', name: 'Bookmark', documentId: 'doc-1' };
    assertBookmarkResponse(200, data);
    assertBookmarkResponse(401, data);
    expect(resolveCreatedBookmarkId(data, 'fallback')).toBe('bookmark-1');
    expect(resolveCreatedBookmarkId({}, 'fallback')).toBe('fallback');
  });

  test('resolveAnnotationSetId handles valid, fallback, and errors', async () => {
    sharedDocId = 'doc-1';
    const apiClient = { get: async () => ({ data: { id: 'set-1' } }) };
    expect(await resolveAnnotationSetId(apiClient, {}, sharedDocId)).toBe('set-1');

    const apiClientMissing = { get: async () => ({ data: { id: 123 } }) };
    const fallback = await resolveAnnotationSetId(apiClientMissing, {}, sharedDocId);
    expect(fallback).toBeTruthy();

    const apiClientError = {
      get: async () => {
        throw new Error('boom');
      },
    };
    const errorFallback = await resolveAnnotationSetId(apiClientError, {}, sharedDocId);
    expect(errorFallback).toBeTruthy();
  });

  test('buildAnnotation and buildBookmark return expected payloads', async () => {
    sharedDocId = 'doc-2';
    const apiClient = { get: async () => ({ data: { id: 'set-2' } }) };
    const annotation = await buildAnnotation(apiClient, {}, sharedDocId);
    expect(annotation.documentId).toBe('doc-2');
    expect(annotation.annotationSetId).toBe('set-2');

    const bookmarkClient = { get: async () => ({ data: { userInfo: { uid: 'user-1' } } }) };
    const bookmark = await buildBookmark(bookmarkClient, sharedDocId);
    expect(bookmark.documentId).toBe('doc-2');
    expect(bookmark.createdBy).toBe('user-1');
  });

  test('resolveUserInfoId and buildXsrfHeader handle variants', () => {
    expect(resolveUserInfoId({ userInfo: { uid: 'uid-1' } })).toBe('uid-1');
    expect(resolveUserInfoId({ userInfo: { id: 'id-1' } })).toBe('id-1');
    expect(resolveUserInfoId()).toBeUndefined();

    expect(buildXsrfHeader('token')).toEqual({ 'X-XSRF-TOKEN': 'token' });
    expect(buildXsrfHeader()).toEqual({});
  });

  test('resolveUploadedDocId handles possible document ids', () => {
    expect(resolveUploadedDocId({ documents: [{ originalDocumentId: 'orig' }] })).toBe('orig');
    expect(resolveUploadedDocId({ documents: [{ documentId: 'doc' }] })).toBe('doc');
    expect(resolveUploadedDocId({ documents: [{ id: 'id' }] })).toBe('id');
    expect(resolveUploadedDocId({ documents: [] })).toBeUndefined();
    expect(resolveUploadedDocId({})).toBeUndefined();
  });

  test('assertBinaryResponse handles binary payloads', () => {
    assertBinaryResponse(200, new ArrayBuffer(4));
    assertBinaryResponse(204, new ArrayBuffer(0));
  });

  test('uploadSyntheticDoc returns uploaded id when ok', async () => {
    let disposed = false;

    const response = {
      ok: () => true,
      json: async () => ({ documents: [{ documentId: 'doc-1' }] }),
    };
    const ctx = {
      post: async () => response,
      dispose: async () => {
        disposed = true;
      },
    };

    const uploaded = await uploadSyntheticDoc({
      ensureStorageState: async () => 'state.json',
      getStoredCookie: async () => 'token',
      requestFactory: async () => ctx as unknown as UploadRequestContext,
    });
    expect(uploaded).toBe('doc-1');
    expect(disposed).toBe(true);
  });

  test('uploadSyntheticDoc fails when response is not ok', async () => {
    let disposed = false;

    const response = {
      ok: () => false,
      status: () => 502,
      json: async () => ({}),
    };
    const ctx = {
      post: async () => response,
      dispose: async () => {
        disposed = true;
      },
    };

    await expect(uploadSyntheticDoc({
      ensureStorageState: async () => 'state.json',
      getStoredCookie: async () => undefined,
      requestFactory: async () => ctx as unknown as UploadRequestContext,
    })).rejects.toThrow('HTTP 502');
    expect(disposed).toBe(true);
  });

  test('uploadSyntheticDoc preserves setup errors', async () => {
    await expect(uploadSyntheticDoc({
      ensureStorageState: async () => {
        throw new Error('boom');
      },
    })).rejects.toThrow('boom');
  });
});
