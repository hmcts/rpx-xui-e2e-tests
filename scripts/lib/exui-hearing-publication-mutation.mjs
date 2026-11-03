import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { digestCandidateTree } from "./exui-candidate-artifact.mjs";
import { digestBytes } from "./exui-evidence-io.mjs";
import { getReleasePolicy } from "./exui-release-policy.mjs";

export const HEARING_PUBLICATION_SCOPE = "exui-hearing-publication-pilot";
export const HEARING_PUBLICATION_MUTATION =
  "hearing-amendments-use-enabled-map";
const target = "dist/rpx-exui/api/server.bundle.js";
const enabledName = "prodHearingJurisdictions",
  amendmentName = "prodEnableHearingAmendment";
const require = createRequire(import.meta.url);

export function transformHearingPublication(input) {
  assert(
    Buffer.isBuffer(input) || typeof input === "string",
    "UNSUPPORTED_HEARING_BUNDLE_ENCODING",
  );
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8"),
    text = bytes.toString("utf8");
  if (typeof input === "string")
    assert.equal(text, input, "UNSUPPORTED_HEARING_BUNDLE_ENCODING");
  assert(
    Buffer.from(text, "utf8").equals(bytes),
    "UNSUPPORTED_HEARING_BUNDLE_ENCODING",
  );
  const ts = require("typescript");
  const file = ts.createSourceFile(
    "server.bundle.js",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  assert.equal(
    file.parseDiagnostics.length,
    0,
    "INVALID_HEARING_BUNDLE_SYNTAX",
  );
  const data = new Map([
      [enabledName, []],
      [amendmentName, []],
    ]),
    initializers = [];
  function property(node) {
    if (ts.isPropertyAccessExpression(node)) return node.name.text;
    if (
      ts.isElementAccessExpression(node) &&
      node.argumentExpression &&
      ts.isStringLiteral(node.argumentExpression)
    )
      return node.argumentExpression.text;
  }
  function receiver(node) {
    if (ts.isIdentifier(node)) return node.text;
    if (ts.isPropertyAccessExpression(node))
      return receiver(node.expression) + "." + node.name.text;
    throw Error("UNSUPPORTED_HEARING_EXPORT_RECEIVER");
  }
  function scope(node) {
    let current = node.parent;
    while (current && !ts.isBlock(current) && !ts.isSourceFile(current))
      current = current.parent;
    return current;
  }
  function expressionStatement(node) {
    let current = node;
    while (current.parent && !ts.isExpressionStatement(current.parent)) {
      const parent = current.parent;
      assert(
        ts.isParenthesizedExpression(parent) ||
          (ts.isBinaryExpression(parent) &&
            [ts.SyntaxKind.CommaToken, ts.SyntaxKind.EqualsToken].includes(
              parent.operatorToken.kind,
            )),
        "UNSUPPORTED_HEARING_ASSIGNMENT_CONTEXT",
      );
      current = parent;
    }
    assert(
      current.parent && ts.isExpressionStatement(current.parent),
      "UNSUPPORTED_HEARING_ASSIGNMENT_CONTEXT",
    );
    return current.parent;
  }
  function literal(node) {
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) {
      const value = Number(node.text);
      assert(Number.isFinite(value), "UNSUPPORTED_HEARING_NUMBER");
      return value;
    }
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (
      ts.isPrefixUnaryExpression(node) &&
      [ts.SyntaxKind.MinusToken, ts.SyntaxKind.PlusToken].includes(
        node.operator,
      ) &&
      ts.isNumericLiteral(node.operand)
    ) {
      const value =
        Number(node.operand.text) *
        (node.operator === ts.SyntaxKind.MinusToken ? -1 : 1);
      assert(Number.isFinite(value), "UNSUPPORTED_HEARING_NUMBER");
      return value;
    }
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
    assert(ts.isObjectLiteralExpression(node), "HEARING_MAP_MUST_BE_DATA_ONLY");
    const result = Object.create(null),
      keys = new Set();
    for (const entry of node.properties) {
      assert(
        ts.isPropertyAssignment(entry) &&
          !ts.isComputedPropertyName(entry.name),
        "HEARING_MAP_MUST_BE_DATA_ONLY",
      );
      const key =
        ts.isIdentifier(entry.name) ||
        ts.isStringLiteral(entry.name) ||
        ts.isNumericLiteral(entry.name)
          ? entry.name.text
          : null;
      assert(
        key !== null &&
          !["__proto__", "constructor", "prototype"].includes(key) &&
          !keys.has(key),
        "UNSAFE_OR_DUPLICATE_HEARING_DATA_KEY",
      );
      keys.add(key);
      result[key] = literal(entry.initializer);
    }
    return result;
  }
  function walk(node) {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      const name = property(node.left);
      if (data.has(name)) {
        assert(
          ts.isPropertyAccessExpression(node.left) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken,
          "UNSUPPORTED_HEARING_EXPORT_ASSIGNMENT",
        );
        const record = {
          node,
          receiver: receiver(node.left.expression),
          scope: scope(node),
        };
        expressionStatement(node);
        if (ts.isObjectLiteralExpression(node.right)) {
          record.value = literal(node.right);
          data.get(name).push(record);
        } else initializers.push(record);
      }
    } else if (
      (ts.isPostfixUnaryExpression(node) ||
        ts.isPrefixUnaryExpression(node) ||
        ts.isDeleteExpression(node)) &&
      data.has(property(node.operand ?? node.expression))
    )
      throw Error("UNSUPPORTED_HEARING_EXPORT_WRITE");
    ts.forEachChild(node, walk);
  }
  walk(file);
  assert(
    data.get(enabledName).length === 1 && data.get(amendmentName).length === 1,
    "EXPECTED_UNIQUE_HEARING_DATA_ASSIGNMENTS",
  );
  const enabled = data.get(enabledName)[0],
    amendment = data.get(amendmentName)[0];
  assert(
    enabled.receiver === amendment.receiver &&
      enabled.scope === amendment.scope,
    "HEARING_EXPORT_RECEIVER_SCOPE_MISMATCH",
  );
  if (initializers.length) {
    assert.equal(
      initializers.length,
      2,
      "AMBIGUOUS_HEARING_EXPORT_INITIALIZATION",
    );
    let root = initializers[0].node;
    while (
      ts.isBinaryExpression(root.parent) &&
      root.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      root.parent.right === root
    )
      root = root.parent;
    const initialized = new Set();
    let current = root;
    while (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const name = property(current.left);
      assert(
        data.has(name) &&
          !initialized.has(name) &&
          ts.isPropertyAccessExpression(current.left),
        "AMBIGUOUS_HEARING_EXPORT_INITIALIZATION",
      );
      assert(
        receiver(current.left.expression) === enabled.receiver &&
          scope(current) === enabled.scope,
        "HEARING_EXPORT_RECEIVER_SCOPE_MISMATCH",
      );
      initialized.add(name);
      current = current.right;
    }
    assert(
      initialized.size === 2 &&
        ts.isVoidExpression(current) &&
        ts.isNumericLiteral(current.expression) &&
        current.expression.text === "0" &&
        root.getStart(file) <
          Math.min(enabled.node.getStart(file), amendment.node.getStart(file)),
      "AMBIGUOUS_HEARING_EXPORT_INITIALIZATION",
    );
    assert(
      initializers.every((record) => {
        let node = record.node;
        while (node !== root && node.parent) node = node.parent;
        return node === root;
      }),
      "AMBIGUOUS_HEARING_EXPORT_INITIALIZATION",
    );
  }
  function range(node) {
    const start = node.getStart(file),
      end = node.end;
    const byteStart = Buffer.byteLength(text.slice(0, start), "utf8"),
      byteEnd = Buffer.byteLength(text.slice(0, end), "utf8");
    assert(
      bytes.subarray(byteStart, byteEnd).toString("utf8") ===
        text.slice(start, end),
      "INVALID_HEARING_UTF8_RANGE",
    );
    return { utf16: { start, end }, utf8: { start: byteStart, end: byteEnd } };
  }
  const enabledRange = range(enabled.node.right),
    amendmentRange = range(amendment.node.right);
  const inserted = bytes.subarray(
      enabledRange.utf8.start,
      enabledRange.utf8.end,
    ),
    replaced = bytes.subarray(
      amendmentRange.utf8.start,
      amendmentRange.utf8.end,
    );
  assert(!inserted.equals(replaced), "HEARING_MUTATION_MUST_CHANGE_DATA");
  const changed = Buffer.concat([
    bytes.subarray(0, amendmentRange.utf8.start),
    inserted,
    bytes.subarray(amendmentRange.utf8.end),
  ]);
  const resultingRange = {
    start: amendmentRange.utf8.start,
    end: amendmentRange.utf8.start + inserted.length,
  };
  assert(
    changed
      .subarray(0, resultingRange.start)
      .equals(bytes.subarray(0, amendmentRange.utf8.start)) &&
      changed
        .subarray(resultingRange.end)
        .equals(bytes.subarray(amendmentRange.utf8.end)),
    "HEARING_OUTSIDE_RANGE_CHANGED",
  );
  return {
    bytes: changed,
    derivation: {
      target,
      beforeDigest: digestBytes(bytes),
      afterDigest: digestBytes(changed),
      enabledRange,
      amendmentRange,
      resultingRange,
      enabledDataDigest: digestBytes(JSON.stringify(enabled.value)),
      amendmentDataDigest: digestBytes(JSON.stringify(amendment.value)),
      insertedLiteralDigest: digestBytes(inserted),
      replacedLiteralDigest: digestBytes(replaced),
      unchangedOutsideRange: true,
    },
  };
}

// Callers supply independently seal-verified artifacts. Normalize every other entry, mode and link against the base payload.
export async function verifyHearingPublicationMutant(baseline, mutant) {
  const before = await fs.readFile(path.join(baseline.candidateRoot, target)),
    expected = transformHearingPublication(before),
    changed = await fs.readFile(path.join(mutant.candidateRoot, target));
  assert(changed.equals(expected.bytes), "HEARING_TRANSFORMATION_MISMATCH");
  assert.notEqual(
    mutant.payloadDigest,
    baseline.payloadDigest,
    "HEARING_MUTATION_MUST_CHANGE_PAYLOAD",
  );
  assert.notEqual(
    mutant.identity.artifactDigest,
    baseline.identity.artifactDigest,
    "HEARING_MUTATION_MUST_CHANGE_ARTIFACT",
  );
  const normalized = await digestCandidateTree(
    mutant.candidateRoot,
    new Map([[target, before]]),
  );
  assert.equal(
    normalized,
    baseline.payloadDigest,
    "UNRELATED_HEARING_MUTANT_PAYLOAD_CHANGE",
  );
  assert.deepEqual(
    mutant.provenance,
    baseline.provenance,
    "HEARING_MUTANT_PROVENANCE_CHANGED",
  );
  const { artifactDigest: baseDigest, ...baseIdentity } = baseline.identity,
    { artifactDigest: mutantDigest, ...mutantIdentity } = mutant.identity;
  assert.deepEqual(
    mutantIdentity,
    baseIdentity,
    "UNRELATED_HEARING_MUTANT_IDENTITY_CHANGE",
  );
  return {
    transformation:
      "replace-prod-amendment-map-with-candidate-prod-enabled-map",
    mutationDefinitionDigest: getReleasePolicy(
      HEARING_PUBLICATION_SCOPE,
    ).mutationDefinitions.find(
      (item) => item.mutationId === HEARING_PUBLICATION_MUTATION,
    ).definitionDigest,
    ...expected.derivation,
    baselineArtifactDigest: baseDigest,
    mutantArtifactDigest: mutantDigest,
    baselinePayloadDigest: baseline.payloadDigest,
    mutantPayloadDigest: mutant.payloadDigest,
    normalizedPayloadDigest: normalized,
    baselineIdentity: baseline.identity,
    mutantIdentity: mutant.identity,
    artifactKind: "derived-test-artifact-not-owner-built",
  };
}
