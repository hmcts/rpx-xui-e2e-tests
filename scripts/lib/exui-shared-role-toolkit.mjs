import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { digestBytes } from './exui-evidence-io.mjs';
import { buildSharedPolicyContracts } from './exui-shared-policy-contracts.mjs';
import { verifyCandidateArtifact } from './exui-candidate-artifact.mjs';

const collectionPath = 'projects/ccd-case-ui-toolkit/src/lib/shared/components/palette/collection/write-collection-field.component.ts';
const reviewedPublishedDigest = 'sha256:bf1da862895bb54e7c1843e777fd0d7868c2cc6cd357527f75056592c6f4e896';
const pinnedImports = "import { MatLegacyDialog as MatDialog } from '@angular/material/legacy-dialog';\nimport { MatDialogConfig } from '@angular/material/dialog';";
const publishedImports = "import { MatDialog, MatDialogConfig } from '@angular/material/dialog';";
const references = () => buildSharedPolicyContracts()[1].sourceReferences.filter(ref => ref.repository === 'hmcts/ccd-case-ui-toolkit');

export function bindSharedRoleToolkitFile(sourcePath, content) {
  const ref = references().find(item => item.path === sourcePath);
  assert(ref && typeof content === 'string', 'SHARED_ROLE_TOOLKIT_SOURCE_REQUIRED');
  const observedDigest = digestBytes(content);
  let disposition = 'exact-source-bytes';
  if (observedDigest !== ref.digest) {
    assert(sourcePath === collectionPath && observedDigest === reviewedPublishedDigest, 'SHARED_ROLE_TOOLKIT_UNREVIEWED_DELTA');
    assert.equal(content.split(publishedImports).length, 2, 'SHARED_ROLE_TOOLKIT_IMPORT_DELTA');
    assert.equal(digestBytes(content.replace(publishedImports, pinnedImports)), ref.digest, 'SHARED_ROLE_TOOLKIT_IMPORT_DELTA');
    disposition = 'reviewed-Material-dialog-import-only; dialog-behaviour-excluded';
  }
  return { path: sourcePath, sourceRevision: ref.revision, sourceDigest: ref.digest, observedDigest, disposition };
}
export function bindSharedRoleToolkitMap(map) {
  assert(Array.isArray(map?.sources) && Array.isArray(map.sourcesContent) && map.sources.length === map.sourcesContent.length, 'SHARED_ROLE_TOOLKIT_MAP');
  return references().map(ref => {
    const matches = map.sources.flatMap((name, index) => name === '../../../' + ref.path ? [index] : []);
    assert.equal(matches.length, 1, 'SHARED_ROLE_TOOLKIT_SOURCE_UNIQUE');
    return bindSharedRoleToolkitFile(ref.path, map.sourcesContent[matches[0]]);
  });
}
// Verify the complete sealed artifact, then bind the shipped map and bundle. The
// map is a package source witness, not a claim about dialog behaviour or CCD code.
export async function bindSharedRoleToolkitArtifact(manifestPath) {
  const artifact = await verifyCandidateArtifact(manifestPath);
  const root = path.join(artifact.candidateRoot, 'node_modules/@hmcts/ccd-case-ui-toolkit/fesm2022');
  const mapBytes = fs.readFileSync(path.join(root, 'hmcts-ccd-case-ui-toolkit.mjs.map'));
  const bundleBytes = fs.readFileSync(path.join(root, 'hmcts-ccd-case-ui-toolkit.mjs'));
  assert(bundleBytes.toString().includes('sourceMappingURL=hmcts-ccd-case-ui-toolkit.mjs.map'), 'SHARED_ROLE_TOOLKIT_MAP_LINK');
  return { candidateIdentity: artifact.identity, bundleDigest: digestBytes(bundleBytes), mapDigest: digestBytes(mapBytes), sources: bindSharedRoleToolkitMap(JSON.parse(mapBytes)), excludes: ['collection-removal-dialog-behaviour', 'CCD-source-to-image-provenance'] };
}
