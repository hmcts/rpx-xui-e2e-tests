import type { Page } from "@playwright/test";

const ANALYTICS_BUTTON_PATTERN = /accept (additional|analytics) cookies/i;
const ANALYTICS_BUTTON_PATTERN_SOURCE = ANALYTICS_BUTTON_PATTERN.source;

const clickAnalyticsButtonInOpenShadowDom = async (page: Page): Promise<boolean> =>
  page
    .evaluate((patternSource) => {
      const pattern = new RegExp(patternSource, "i");
      const queue: Array<Document | ShadowRoot> = [document];
      const visited = new Set<Document | ShadowRoot>();

      while (queue.length > 0) {
        const currentRoot = queue.shift();
        if (!currentRoot || visited.has(currentRoot)) {
          continue;
        }
        visited.add(currentRoot);

        const buttons = Array.from(currentRoot.querySelectorAll("button"));
        const matchingButton = buttons.find((button) => {
          const buttonLabel = `${button.textContent ?? ""} ${button.getAttribute("aria-label") ?? ""}`.trim();
          return pattern.test(buttonLabel);
        });
        if (matchingButton instanceof HTMLElement) {
          matchingButton.click();
          return true;
        }

        const hosts = Array.from(currentRoot.querySelectorAll("*"));
        for (const host of hosts) {
          if (host.shadowRoot) {
            queue.push(host.shadowRoot);
          }
        }
      }

      return false;
    }, ANALYTICS_BUTTON_PATTERN_SOURCE)
    .catch(() => false);

export const installAnalyticsAutoAccept = async (page: Page): Promise<void> => {
  await page.addInitScript((patternSource) => {
    const pattern = new RegExp(patternSource, "i");
    const scanRoots = (): Array<Document | ShadowRoot> => {
      const queue: Array<Document | ShadowRoot> = [document];
      const roots: Array<Document | ShadowRoot> = [];
      const visited = new Set<Document | ShadowRoot>();

      while (queue.length > 0) {
        const currentRoot = queue.shift();
        if (!currentRoot || visited.has(currentRoot)) {
          continue;
        }
        visited.add(currentRoot);
        roots.push(currentRoot);

        const hosts = Array.from(currentRoot.querySelectorAll("*"));
        for (const host of hosts) {
          if (host.shadowRoot) {
            queue.push(host.shadowRoot);
          }
        }
      }

      return roots;
    };

    const attemptClick = () => {
      for (const root of scanRoots()) {
        const buttons = Array.from(root.querySelectorAll("button"));
        const matchingButton = buttons.find((button) => {
          const label = `${button.textContent ?? ""} ${button.getAttribute("aria-label") ?? ""}`.trim();
          return pattern.test(label);
        });
        if (matchingButton instanceof HTMLElement) {
          matchingButton.click();
          return true;
        }
      }
      return false;
    };

    const startObserver = () => {
      attemptClick();
      if (!document.documentElement) {
        return;
      }
      const observer = new MutationObserver(() => {
        attemptClick();
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", startObserver, { once: true });
      return;
    }

    startObserver();
  }, ANALYTICS_BUTTON_PATTERN_SOURCE);
};

const resolveCookieDomain = (page: Page, baseUrl?: string): string | undefined => {
  const candidate = baseUrl ?? page.url() ?? "";
  try {
    return new URL(candidate).hostname;
  } catch {
    return undefined;
  }
};

const setAnalyticsAcceptanceCookie = async (page: Page, baseUrl?: string): Promise<boolean> => {
  const cookies = await page.context().cookies();
  const userId = cookies.find((cookie) => cookie.name === "__userid__")?.value;
  if (!userId) return false;

  const domain = resolveCookieDomain(page, baseUrl);
  if (!domain) return false;

  await page.context().addCookies([
    {
      name: `hmcts-exui-cookies-${userId}-mc-accepted`,
      value: "true",
      domain,
      path: "/",
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: "Lax"
    }
  ]);
  return true;
};

export const acceptAnalyticsCookiesOnPage = async (page: Page): Promise<boolean> => {
  const analyticsRoleButton = page.getByRole("button", {
    name: ANALYTICS_BUTTON_PATTERN
  }).first();
  const roleButtonVisible = await analyticsRoleButton
    .waitFor({ state: "visible", timeout: 1_000 })
    .then(() => true)
    .catch(() => false);
  if (roleButtonVisible) {
    await analyticsRoleButton.click({ timeout: 2_000 }).catch(() => undefined);
    return true;
  }

  return clickAnalyticsButtonInOpenShadowDom(page);
};

export const ensureAnalyticsAccepted = async (
  page: Page,
  baseUrl?: string
): Promise<boolean> => {
  if (await acceptAnalyticsCookiesOnPage(page)) {
    return true;
  }

  const cookieSet = await setAnalyticsAcceptanceCookie(page, baseUrl);
  if (!cookieSet) return false;

  await acceptAnalyticsCookiesOnPage(page).catch(() => false);
  return true;
};
