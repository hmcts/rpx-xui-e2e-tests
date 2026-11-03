import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const canonicalDefinitionJson = value => JSON.stringify(canonical(value));
function canonical(value) {
  return Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
}
export const definitionDigest = value => 'sha256:' + createHash('sha256').update(canonicalDefinitionJson(value)).digest('hex');
const pathValid = value => typeof value === 'string' && !value.startsWith('/') && !value.includes('\\') && value.split('/').every(part => part && part !== '.' && part !== '..');
const key = (...values) => values.map(value => value ?? '').join('|');
const sheets = new Set(['CaseType', 'CaseField', 'ComplexTypes', 'FixedLists', 'CaseEvent', 'CaseEventToFields',
  'CaseEventToComplexTypes', 'AuthorisationCaseEvent', 'AuthorisationCaseField', 'AuthorisationComplexType',
  'CaseTypeTab', 'SearchResultFields', 'SearchInputFields', 'WorkBasketInputFields', 'WorkBasketResultFields']);
const structuralKeys = new Set(['ID', 'CaseTypeID', 'CaseEventID', 'CaseFieldID', 'ListElementCode', 'FieldType', 'FieldTypeParameter']);

export function validateDefinitionProjection(projection) {
  assert(Array.isArray(projection), 'DEFINITION_PROJECTION_REQUIRED');
  const paths = new Set();
  for (const item of projection) {
    assert(item && pathValid(item.path) && !paths.has(item.path), 'INVALID_DEFINITION_PROJECTION_PATH');
    paths.add(item.path);
    const keys = Object.keys(item).sort().join(',');
    assert(keys === 'allRows,path' && item.allRows === true || keys === 'ids,path' && Array.isArray(item.ids) &&
      item.ids.length > 0 && item.ids.every(id => typeof id === 'string' && id.length > 0) && new Set(item.ids).size === item.ids.length,
    'INVALID_DEFINITION_PROJECTION_SELECTOR');
  }
}

// Source relationships only: no merged-environment, built-in CCD or expression semantics.
export function buildDefinitionReferenceGraph({ documents, projection }) {
  validateDefinitionProjection(projection);
  assert(Array.isArray(documents), 'DEFINITION_DOCUMENTS_REQUIRED');
  const nodes = [], edges = [], gaps = [], dependencies = {}, seenPaths = new Set();
  const gap = (kind, source, target, candidates = []) => {
    const value = { kind, source, ...(target !== undefined ? { target } : {}), ...(candidates.length ? { candidates } : {}) };
    gaps.push({ id: `definition-gap:${definitionDigest(value).slice(7)}`, ...value });
  };
  const selected = new Set();
  for (const document of [...documents].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) {
    assert(pathValid(document.path) && !seenPaths.has(document.path), 'INVALID_DEFINITION_DOCUMENT_PATH');
    seenPaths.add(document.path);
    const relative = document.path.split('/json/')[1] ?? document.path;
    const kind = relative.split('/')[0].replace(/\.json$/, '');
    const selector = projection.find(item => item.path === document.path);
    if (document.format !== 'array') {
      gap('unsupported-document-format', { path: document.path }, document.format);
      continue;
    }
    if (!document.rows.length && !selector) gap('unreviewed-empty-document', { path: document.path });
    const found = new Set();
    for (const [position, row] of document.rows.entries()) {
      assert(row.index === position && row.value && typeof row.value === 'object' && !Array.isArray(row.value), 'INVALID_DEFINITION_ROW');
      const rowDigest = definitionDigest(row.value);
      const node = { id: `${document.path}#${row.index}:${rowDigest.slice(7)}`, path: document.path, index: row.index, rowDigest, kind, value: row.value };
      nodes.push(node);
      const source = { path: node.path, row: node.index };
      if (selector && (selector.allRows || selector.ids.includes(row.value.ID))) {
        selected.add(node.id); found.add(row.value.ID);
      } else gap('unreviewed-row', source, rowDigest);
      if (!sheets.has(kind)) gap('unreviewed-sheet-kind', source, kind);
      for (const name of Object.keys(row.value)) {
        if (/Condition/.test(name)) gap('opaque-expression', source, { key: name, value: row.value[name] });
        else if (!structuralKeys.has(name)) gap('uninterpreted-row-key', source, name);
      }
    }
    if (selector?.ids) for (const id of selector.ids) assert(found.has(id), `PROJECTION_SELECTOR_NO_MATCH:${document.path}:${id}`);
  }
  for (const selector of projection) assert(seenPaths.has(selector.path), `PROJECTION_SOURCE_MISSING:${selector.path}`);
  const indices = Object.fromEntries(['caseType', 'field', 'event', 'complex', 'list'].map(name => [name, new Map()]));
  const put = (index, name, node) => { if (typeof name === 'string' && name) indices[index].set(name, [...(indices[index].get(name) ?? []), node]); };
  for (const node of nodes) {
    const row = node.value;
    if (node.kind === 'CaseType') put('caseType', row.ID, node);
    if (node.kind === 'CaseField') put('field', key(row.CaseTypeID, row.ID), node);
    if (node.kind === 'CaseEvent') put('event', key(row.CaseTypeID, row.ID), node);
    if (node.kind === 'ComplexTypes') put('complex', row.ID, node);
    if (node.kind === 'FixedLists') put('list', row.ID, node);
  }
  const complex = (name, scope) => (indices.complex.get(name) ?? []).filter(node => !node.value.CaseTypeID || node.value.CaseTypeID === scope);
  const reference = (node, kind, target, candidates, group = false, missingKind = 'unresolved-reference') => {
    const duplicate = group && new Set(candidates.map(item => key(item.value.CaseTypeID, item.value.ListElementCode))).size !== candidates.length;
    const scopes = group && new Set(candidates.map(item => item.value.CaseTypeID ?? '')).size > 1;
    const status = !candidates.length ? 'unresolved' : !group && candidates.length > 1 || duplicate || scopes ? 'ambiguous' : 'resolved';
    const ids = candidates.map(item => item.id).sort();
    edges.push({ source: node.id, kind, target, candidates: ids, status });
    if (status !== 'resolved') gap(status === 'ambiguous' ? 'ambiguous-reference' : missingKind, { path: node.path, row: node.index }, target, ids);
    return candidates;
  };
  const typeTarget = node => node.value.FieldType === 'Collection' ? node.value.FieldTypeParameter : node.value.FieldType;
  function nested(node) {
    const row = node.value;
    if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(row.ListElementCode ?? '')) {
      gap('unsupported-member-path', { path: node.path, row: node.index }, row.ListElementCode); return;
    }
    let types = typeof row.ID === 'string' ? [row.ID] : [];
    if (!types.length) types = (indices.field.get(key(row.CaseTypeID, row.CaseFieldID)) ?? []).map(typeTarget);
    if (types.length !== 1) { gap('unresolved-complex-context', { path: node.path, row: node.index }, row.CaseFieldID); return; }
    const segments = row.ListElementCode.split('.');
    for (let i = 0; i < segments.length; i++) {
      const members = complex(types[0], row.CaseTypeID);
      if (!members.length) { reference(node, 'nested-member', `${types[0]}.${segments.slice(i).join('.')}`, [], false, 'external-type'); return; }
      const candidates = reference(node, 'nested-member', `${types[0]}.${segments[i]}`, members.filter(item => item.value.ListElementCode === segments[i]));
      if (candidates.length !== 1) return;
      types = [typeTarget(candidates[0])];
      if (candidates[0].value.FieldType === 'Collection') reference(node, 'nested-collection-type', types[0], complex(types[0], row.CaseTypeID), true, 'external-type');
    }
  }
  for (const node of nodes) {
    const row = node.value, source = { path: node.path, row: node.index };
    if (row.CaseTypeID) reference(node, 'case-type', row.CaseTypeID, indices.caseType.get(row.CaseTypeID) ?? []);
    if (row.CaseEventID) reference(node, 'case-event', key(row.CaseTypeID, row.CaseEventID), indices.event.get(key(row.CaseTypeID, row.CaseEventID)) ?? []);
    if (row.CaseFieldID) {
      const fieldKey = key(row.CaseTypeID, row.CaseFieldID), fields = indices.field.get(fieldKey) ?? [];
      if (fields.length || !['CaseEventToComplexTypes', 'AuthorisationComplexType'].includes(node.kind)) reference(node, 'case-field', fieldKey, fields);
      else {
        const local = nodes.filter(item => item.kind === 'ComplexTypes' && item.value.ListElementCode === row.CaseFieldID && typeTarget(item) === row.ID);
        reference(node, 'nested-field-context', row.CaseFieldID, local, false, 'unresolved-complex-context');
      }
    }
    if (['CaseField', 'ComplexTypes'].includes(node.kind)) {
      if (typeof row.FieldType !== 'string' || !row.FieldType) { gap('missing-type', source); continue; }
      const list = ['FixedList', 'FixedRadioList', 'MultiSelectList'].includes(row.FieldType);
      const target = list || row.FieldType === 'Collection' ? row.FieldTypeParameter : row.FieldType;
      if (typeof target !== 'string' || !target) gap('missing-type-parameter', source, row.FieldType);
      else reference(node, list ? 'fixed-list' : row.FieldType === 'Collection' ? 'collection-type' : 'field-type', target,
        list ? indices.list.get(target) ?? [] : complex(target, row.CaseTypeID), true, list ? 'unresolved-reference' : 'external-type');
    }
    if (['CaseEventToComplexTypes', 'AuthorisationComplexType'].includes(node.kind)) nested(node);
  }
  const adjacency = new Map(nodes.map(node => [node.id, []]));
  for (const edge of edges) for (const candidate of edge.candidates) adjacency.get(edge.source).push(candidate);
  // Explicit stack avoids recursion limits in externally supplied source graphs.
  const byId = new Map(nodes.map(node => [node.id, node]));
  const done = new Set();
  for (const start of nodes) {
    if (done.has(start.id)) continue;
    const active = new Set(), stack = [{ id: start.id, next: 0 }];
    while (stack.length) {
      const top = stack.at(-1); active.add(top.id);
      const next = adjacency.get(top.id)[top.next++];
      if (!next) { active.delete(top.id); done.add(top.id); stack.pop(); continue; }
      if (active.has(next)) { gap('reference-cycle', { path: byId.get(top.id).path, row: byId.get(top.id).index }, next); continue; }
      if (!done.has(next)) stack.push({ id: next, next: 0 });
    }
  }
  for (const id of selected) {
    const seen = new Set(), queue = [id], paths = new Set();
    while (queue.length) {
      const current = queue.pop(); if (seen.has(current)) continue;
      seen.add(current); paths.add(byId.get(current).path);
      for (const target of adjacency.get(current)) queue.push(target);
    }
    dependencies[id] = [...paths].sort();
  }
  edges.sort((a, b) => canonicalDefinitionJson(a) < canonicalDefinitionJson(b) ? -1 : canonicalDefinitionJson(a) > canonicalDefinitionJson(b) ? 1 : 0);
  return { schemaVersion: 1, nodes, edges, gaps: [...new Map(gaps.map(item => [item.id, item])).values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0), dependencies };
}
