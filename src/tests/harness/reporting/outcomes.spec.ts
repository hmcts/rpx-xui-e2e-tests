import { expect, test } from "@playwright/test";

test("REPORTING_PASS_ID", () => {
  expect(2 + 2).toBe(4);
});

test("REPORTING_NAMED_FAILURE_ID", () => {
  expect(process.env.EXUI_REPORTING_NAMED_FAILURE ?? "off").toBe("off");
});
