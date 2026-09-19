import {
  applyOpsFromDto,
  bulkEdit,
  getBookmarkDetail,
  queryLibrary,
  saveUrls,
  type ApplyOpsResponse as CoreApplyOpsResponse,
  type BookmarkDetailDto as CoreBookmarkDetailDto,
  type BookmarkRowDto as CoreBookmarkRowDto,
  type BulkEditRequest as CoreBulkEditRequest,
  type BulkEditResponse as CoreBulkEditResponse,
  type LibraryQueryInput as CoreLibraryQueryInput,
  type OpInputDto as CoreOpInputDto,
  type Page as CorePage,
  type SaveUrlsRequest as CoreSaveUrlsRequest,
  type SaveUrlsResponse as CoreSaveUrlsResponse,
} from '@cairn/core';
import { IPC } from '../../shared/protocol.js';
import type {
  ApplyOpsRequest, ApplyOpsResponse, BookmarkDetailDto, BookmarkRowDto, BulkEditRequest,
  BulkEditResponse, LibraryQuery, OpInputDto, Page, SaveUrlsRequest, SaveUrlsResponse,
} from '../../shared/protocol.js';
import { library } from '../library.js';
import { asArray, asObject, asString, asStringArray, handle } from './registry.js';

// Channels 2–6. Every handler is three lines — the work is in @cairn/core/library, which is
// unit-tested against an in-memory database; this file only translates and guards.

// ── the DTO contract ──────────────────────────────────────────────────────────────────────
// protocol.ts cannot import @cairn/core (the preload bundle must stay dependency-free), so the
// DTOs are declared twice. These assignments are the proof that the two declarations are the same
// type: if either side drifts, `npm run typecheck` fails here and nowhere else.
type Same<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? 'same'
    : 'core type is not assignable to the protocol type'
  : 'protocol type is not assignable to the core type';
/** `never` would satisfy any constraint, so the failure case is a message, not a bottom type. */
type Expect<T extends 'same'> = T;

export type DtoContract = [
  Expect<Same<BookmarkRowDto, CoreBookmarkRowDto>>,
  Expect<Same<BookmarkDetailDto, CoreBookmarkDetailDto>>,
  Expect<Same<Page<BookmarkRowDto>, CorePage<CoreBookmarkRowDto>>>,
  Expect<Same<LibraryQuery, CoreLibraryQueryInput>>,
  Expect<Same<SaveUrlsRequest, CoreSaveUrlsRequest>>,
  Expect<Same<SaveUrlsResponse, CoreSaveUrlsResponse>>,
  Expect<Same<BulkEditRequest, CoreBulkEditRequest>>,
  Expect<Same<BulkEditResponse, CoreBulkEditResponse>>,
  Expect<Same<OpInputDto, CoreOpInputDto>>,
  Expect<Same<ApplyOpsResponse, CoreApplyOpsResponse>>,
];

function validateQuery(raw: unknown): LibraryQuery {
  const q = asObject(raw, 'library:query');
  if (typeof q['limit'] !== 'number') throw new Error('library:query needs a numeric limit');
  if (typeof q['sort'] !== 'string') throw new Error('library:query needs a sort');
  if (q['tagIds'] !== undefined) asStringArray(q['tagIds'], 'tagIds');
  return q as unknown as LibraryQuery;
}

function validateSave(raw: unknown): SaveUrlsRequest {
  const r = asObject(raw, 'library:saveUrls');
  const items = asArray(r['items'], 'items');
  for (const item of items) asString(asObject(item, 'item')['url'], 'item.url');
  return r as unknown as SaveUrlsRequest;
}

function validateBulk(raw: unknown): BulkEditRequest {
  const r = asObject(raw, 'library:bulkEdit');
  asStringArray(r['ids'], 'ids');
  for (const key of ['addTags', 'removeTags'] as const) {
    if (r[key] !== undefined) asStringArray(r[key], key);
  }
  return r as unknown as BulkEditRequest;
}

function validateApplyOps(raw: unknown): ApplyOpsRequest {
  const r = asObject(raw, 'library:applyOps');
  for (const op of asArray(r['ops'], 'ops')) {
    const o = asObject(op, 'op');
    asString(o['entity'], 'op.entity');
    asString(o['entityId'], 'op.entityId');
    asString(o['op'], 'op.op');
  }
  return r as unknown as ApplyOpsRequest;
}

export function registerLibraryIpc(): void {
  handle<LibraryQuery, Page<BookmarkRowDto>>(
    IPC.LIB_QUERY,
    (query) => queryLibrary(library().db, query),
    { validate: validateQuery },
  );

  handle<{ id: string }, BookmarkDetailDto | null>(
    IPC.LIB_GET,
    ({ id }) => getBookmarkDetail(library().db, id),
    { validate: (raw) => ({ id: asString(asObject(raw, 'library:get')['id'], 'id') }) },
  );

  handle<SaveUrlsRequest, SaveUrlsResponse>(
    IPC.LIB_SAVE_URLS,
    (request) => saveUrls(library().ctx, request),
    { validate: validateSave },
  );

  handle<ApplyOpsRequest, ApplyOpsResponse>(
    IPC.LIB_APPLY_OPS,
    (request) => applyOpsFromDto(library().ctx, request.ops),
    { validate: validateApplyOps },
  );

  handle<BulkEditRequest, BulkEditResponse>(
    IPC.LIB_BULK_EDIT,
    (request) => bulkEdit(library().ctx, request),
    { validate: validateBulk },
  );
}
