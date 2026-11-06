import {
  cookieCanaries,
  inertInteractionHtml,
  INERT_ACTION_TIMEOUT_MS,
  queryCanary,
} from "../../../data/harness-playwright165.mock";
import {
  ConstructorInitializedProbe,
  expect,
  NativeFieldOrderProbe,
  test,
} from "../../../fixtures/harnessPlaywright165";

test("ES2022 native fields precede constructor parameter assignment", () => {
  const probe = new NativeFieldOrderProbe("constructor-ready");
  expect(probe.earlyValue).toBeUndefined();
  expect(probe.constructorValue).toBe("constructor-ready");
});

test("constructor initialization safely reads its dependency", () => {
  const probe = new ConstructorInitializedProbe({ value: "dependency-ready" });
  expect(probe.value).toBe("dependency-ready");
});

test("inert action intentionally times out then a real click works after uninert", async ({ page }) => {
  await page.setContent(inertInteractionHtml);
  const button = page.getByTestId("submit-canary");
  await expect(button).toBeVisible();
  await expect(button.click({ timeout: INERT_ACTION_TIMEOUT_MS })).rejects.toThrow(/Timeout/);
  await expect(page.getByRole("status")).toHaveText("Unchanged");
  await page.getByTestId("interaction-gate").evaluate((element) => element.removeAttribute("inert"));
  await button.click();
  await expect(page.getByRole("status")).toHaveText("Clicked");
});

test("host-only cookie excludes subdomains while dotted domain includes them", async ({ context }) => {
  await context.addCookies(cookieCanaries);
  const host = await context.cookies("https://compat.invalid/");
  expect(host.map((cookie) => cookie.name).sort()).toEqual(["domain_wide", "host_only"]);
  const subdomain = await context.cookies("https://child.compat.invalid/");
  expect(subdomain.map((cookie) => cookie.name)).toEqual(["domain_wide"]);
  expect(await context.cookies("https://notcompat.invalid/")).toEqual([]);
});

test("cookie /api path matches itself and descendants but excludes /apiv2", async ({ context }) => {
  await context.addCookies(cookieCanaries);
  const exact = await context.cookies("https://child.compat.invalid/api");
  expect(exact.map((cookie) => cookie.name).sort()).toEqual(["api_path", "domain_wide"]);
  const descendant = await context.cookies("https://child.compat.invalid/api/items");
  expect(descendant.map((cookie) => cookie.name).sort()).toEqual(["api_path", "domain_wide"]);
  const sibling = await context.cookies("https://child.compat.invalid/apiv2");
  expect(sibling.map((cookie) => cookie.name)).toEqual(["domain_wide"]);
});

test("string request params append and preserve existing query values", async ({ request, queryEndpoint }) => {
  const response = await request.get(`${queryEndpoint}${queryCanary.existingQuery}`, {
    params: queryCanary.appendedQuery,
  });
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual(queryCanary.expectedEntries);
});

test("URLSearchParams append and preserve existing query values", async ({ request, queryEndpoint }) => {
  const response = await request.get(`${queryEndpoint}${queryCanary.existingQuery}`, {
    params: new URLSearchParams(queryCanary.appendedQuery),
  });
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual(queryCanary.expectedEntries);
});
