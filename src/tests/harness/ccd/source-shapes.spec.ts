import assert from "node:assert/strict";

import { test } from '../../../fixtures/harnessCcdEvent';
import { shapes, runSourceShape } from '../../../fixtures/harnessSourceShapes';

const mutation = process.env.EXUI_HARNESS_MUTATION;
assert([undefined, ...shapes.map(id => `ccd-shape-${id}`)].includes(mutation), "SOURCE_SHAPE_MUTATION_REQUIRED");
const selected = shapes.filter(id => !mutation || mutation === `ccd-shape-${id}`);
test.describe.configure({ retries: 0 });
for (const shape of selected) {
  test(`source shape ${shape} is consumed by candidate and persisted by CCD`, {
    annotation: { type: 'harness-proof', description: `ccd-source-shape-${shape}${mutation ? '-fault' : ''}` },
  }, async ({page, request}) => {
    await runSourceShape(shape,page,request);
  });
}
