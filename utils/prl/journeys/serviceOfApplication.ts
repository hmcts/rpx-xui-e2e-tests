import { expect, type Page } from "@playwright/test";

import { PrlManageCasesSession } from "../../prl/manageCasesSession";

export interface ServiceOfApplicationOptions {
  page: Page;
}

export async function completeServiceOfApplication({
  page,
}: ServiceOfApplicationOptions): Promise<string> {
  const session = new PrlManageCasesSession(page);
  await session.loginAsSolicitor();

  const caseRef = await session.findCaseWithEvent("Service of application");

  const selectByRole = page
    .getByRole("combobox", {
      name: /next step/i,
    })
    .first();
  const selectByName = page.locator("select[name='nextStep']").first();
  const hasRoleLocator = (await selectByRole.count()) > 0;
  const nextStepSelect = hasRoleLocator ? selectByRole : selectByName;
  await expect(nextStepSelect).toBeVisible({ timeout: 30_000 });
  await expect(nextStepSelect).toBeEnabled();

  const maybeClickTrigger = async (label: RegExp): Promise<void> => {
    const trigger = page.getByRole("button", { name: label });
    if ((await trigger.count()) === 0) {
      return;
    }
    if (await trigger.isVisible()) {
      await trigger.click();
      await nextStepSelect.waitFor({ state: "visible", timeout: 10_000 });
    }
  };

  await maybeClickTrigger(/next steps/i);
  await maybeClickTrigger(/select action/i);

  let serviceValue: string | undefined;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    serviceValue = await nextStepSelect.evaluate((select) => {
      const el = select as HTMLSelectElement;
      const options = Array.from(el.options ?? []);
      const match = options.find((option) => /Service of application/i.test(option.textContent ?? option.label ?? ""));
      return match?.value;
    });
    if (serviceValue) {
      break;
    }
    await nextStepSelect.dispatchEvent("focus");
    await nextStepSelect.dispatchEvent("click");
    await page.waitForTimeout(1_000);
  }
  if (!serviceValue) {
    throw new Error("Unable to resolve Service of application option value");
  }
  await nextStepSelect.selectOption(serviceValue);
  await page.getByRole("button", { name: /^go$/i }).click();

  await page.getByLabel(/personally served/i).check();
  await page.getByLabel(/Court bailiff/i).check();
  const localAuthority = page.getByLabel(
    /Does the local Authority need to be served/i,
  );
  if (await localAuthority.isVisible()) {
    await localAuthority.check();
  }
  await page.getByRole("button", { name: /continue/i }).click();

  await page.getByLabel(/Serve order now/i).check();
  await page.getByRole("button", { name: /continue/i }).click();

  const submitButton = page.getByRole("button", { name: /submit/i });
  await submitButton.waitFor({ state: "visible", timeout: 10_000 });
  await submitButton.click();
  await page
    .getByText(/Service of application/, { exact: false })
    .waitFor({ timeout: 15_000 });

  return caseRef;
}
