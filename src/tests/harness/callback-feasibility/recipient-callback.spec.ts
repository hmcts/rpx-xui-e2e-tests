import { test } from "../../../fixtures/harnessCallback";
import { runRecipientCallbackJourney } from "../../../fixtures/harnessCallbackJourney";

const variant=process.env.EXUI_CALLBACK_VARIANT;
if(variant!==undefined&&variant!=="baseline"&&variant!=="binding-omitted")throw new Error("CALLBACK_VARIANT_INVALID");

test("candidate callback rejects edited data, corrects through CYA and persists normalization", async ({page,playwright})=>{
 await runRecipientCallbackJourney({page,playwright,mode:"feasibility",variant:variant??"baseline",step:test.step});
});
