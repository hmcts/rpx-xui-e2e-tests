import { feasibilityTest } from "../../../fixtures/harnessCallback";
import { runPersonalService } from "../../../fixtures/harnessPersonalService";
const test = feasibilityTest("personal-service-ui-feasibility");
const variant = process.env.EXUI_CALLBACK_VARIANT;
if (process.env.EXUI_PERSONAL_SERVICE !== "true" || (variant !== "baseline" && variant !== "optional")) throw Error("PERSONAL_SERVICE_SELECTION_REQUIRED");

test("personal-service source event row requires an answer and preserves a filled answer", async ({page,playwright}) => {
 await runPersonalService({page,playwright,variant,step:test.step});
});
