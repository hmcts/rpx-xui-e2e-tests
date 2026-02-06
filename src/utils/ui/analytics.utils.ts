import type { Page } from "@playwright/test";

const analyticsSelector =
  "body > exui-root > xuilib-cookie-banner > div > div > div.govuk-button-group > button:nth-child(1)";

export const installAnalyticsAutoAccept = async (page: Page): Promise<void> => {
  await page.addInitScript((selector) => {
    const attemptClick = () => {
      const direct = document.querySelector(selector);
      if (direct instanceof HTMLElement) {
        direct.click();
        return true;
      }

      const buttons = Array.from(document.querySelectorAll("button"));
      const fallback = buttons.find((button) =>
        /accept analytics cookies/i.test(button.textContent ?? ""),
      );
      if (fallback instanceof HTMLElement) {
        fallback.click();
        return true;
      }

      return false;
    };

    attemptClick();
    const observer = new MutationObserver(() => {
      attemptClick();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }, analyticsSelector);
};

const resolveCookieDomain = (
  page: Page,
  baseUrl?: string,
): string | undefined => {
  const candidate = baseUrl ?? page.url() ?? "";
  try {
    return new URL(candidate).hostname;
  } catch {
    return undefined;
  }
};

const setAnalyticsAcceptanceCookie = async (
  page: Page,
  baseUrl?: string,
): Promise<boolean> => {
  const cookies = await page.context().cookies();
  const userId = cookies.find((cookie) => cookie.name === "__userid__")?.value;
  if (!userId) return false;

  const domain = resolveCookieDomain(page, baseUrl);
  if (!domain) return false;

  const secure = (baseUrl ?? page.url()).startsWith("https://");
  await page.context().addCookies([
    {
      name: `hmcts-exui-cookies-${userId}-mc-accepted`,
      value: "true",
      domain,
      path: "/",
      expires: -1,
      httpOnly: false,
      secure,
      sameSite: "Lax",
    },
  ]);
  return true;
};

export const acceptAnalyticsCookiesOnPage = async (
  page: Page,
): Promise<boolean> => {
  const analyticsButton = page.locator(analyticsSelector);
  if (await analyticsButton.isVisible().catch(() => false)) {
    await analyticsButton.click();
    return true;
  }

  const analyticsRoleButton = page.getByRole("button", {
    name: /accept analytics cookies/i,
  });
  if (await analyticsRoleButton.isVisible().catch(() => false)) {
    await analyticsRoleButton.click();
    return true;
  }

  return false;
};

export const ensureAnalyticsAccepted = async (
  page: Page,
  baseUrl?: string,
): Promise<boolean> => {
  if (await acceptAnalyticsCookiesOnPage(page)) {
    return true;
  }

  const cookieSet = await setAnalyticsAcceptanceCookie(page, baseUrl);
  if (!cookieSet) return false;

  await page.reload({ waitUntil: "domcontentloaded" });
  await acceptAnalyticsCookiesOnPage(page);
  return true;
};
