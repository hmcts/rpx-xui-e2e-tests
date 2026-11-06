import { feasibilityTest } from "../../../fixtures/harnessCallback";
import { runSelectorEventRow } from "../../../fixtures/harnessSelectorEventRow";

const test = feasibilityTest("selector-event-row-ui-feasibility");
const variant = process.env.EXUI_CALLBACK_VARIANT;
if (process.env.EXUI_SELECTOR_EVENT_ROW !== "true" || (variant !== "baseline" && variant !== "summary-hidden")) throw Error("SELECTOR_EVENT_ROW_SELECTION_REQUIRED");

test("optional source event field retains page placement, summary change and persisted selection", async ({ page, playwright }) => {
  await runSelectorEventRow({ page, playwright, variant, step: test.step });
});
