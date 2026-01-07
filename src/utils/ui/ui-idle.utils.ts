import type { Page, Request, Response } from "@playwright/test";

import config from "./config.utils.js";

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value?.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildAllowlist = (): RegExp | null => {
  const fromEnv = process.env.PW_UI_IDLE_ALLOWLIST?.trim();
  if (fromEnv) {
    try {
      return new RegExp(fromEnv, "i");
    } catch {
      return null;
    }
  }

  const hosts = new Set<string>();
  const addHost = (value?: string) => {
    if (!value?.trim()) return;
    try {
      hosts.add(new URL(value).host);
    } catch {
      return;
    }
  };

  addHost(config.urls.exuiDefaultUrl);
  addHost(config.urls.manageCaseBaseUrl);

  if (!hosts.size) return null;
  const pattern = Array.from(hosts).map(escapeRegExp).join("|");
  return new RegExp(`^https?://(?:${pattern})(?:/|$)`, "i");
};

const DEFAULT_IDLE_TIMEOUT_MS = parseNumber(process.env.PW_UI_IDLE_TIMEOUT_MS, 30_000);
const DEFAULT_IDLE_QUIET_MS = parseNumber(process.env.PW_UI_IDLE_QUIET_MS, 400);
const FAIL_ON_HTTP_ERRORS = process.env.PW_UI_FAIL_ON_HTTP_ERRORS === "1";
const FAIL_ON_4XX = process.env.PW_UI_FAIL_ON_HTTP_4XX === "1";

const DEFAULT_IGNORE_PATTERNS: RegExp[] = [
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /\/analytics\//i,
  /\/rb_[^/?]+/i,
  /dynatrace/i,
  /ruxit/i,
];

type UiNetworkError = { status: number; url: string };

export interface UiIdleOptions {
  timeoutMs?: number;
  idleMs?: number;
}

interface UiNetworkTrackerOptions {
  allowlist: RegExp | null;
  ignorePatterns: RegExp[];
  failOnStatus: number;
}

class UiNetworkTracker {
  private readonly pending = new Set<Request>();
  private lastError: UiNetworkError | null = null;
  private readonly allowlist: RegExp | null;
  private readonly ignorePatterns: RegExp[];
  private readonly failOnStatus: number;

  constructor(private readonly page: Page, options: UiNetworkTrackerOptions) {
    this.allowlist = options.allowlist;
    this.ignorePatterns = options.ignorePatterns;
    this.failOnStatus = options.failOnStatus;

    this.page.on("request", (request) => this.onRequest(request));
    this.page.on("requestfinished", (request) => this.onRequestDone(request));
    this.page.on("requestfailed", (request) => this.onRequestDone(request));
    this.page.on("response", (response) => this.onResponse(response));
  }

  private shouldTrack(request: Request): boolean {
    const resourceType = request.resourceType();
    if (resourceType !== "xhr" && resourceType !== "fetch") return false;

    const url = request.url();
    if (this.ignorePatterns.some((pattern) => pattern.test(url))) {
      return false;
    }
    if (this.allowlist && !this.allowlist.test(url)) {
      return false;
    }
    return true;
  }

  private onRequest(request: Request): void {
    if (!this.shouldTrack(request)) return;
    this.pending.add(request);
  }

  private onRequestDone(request: Request): void {
    if (!this.shouldTrack(request)) return;
    this.pending.delete(request);
  }

  private onResponse(response: Response): void {
    const request = response.request();
    if (!this.shouldTrack(request)) return;

    const status = response.status();
    if (Number.isFinite(this.failOnStatus) && status >= this.failOnStatus) {
      this.lastError = { status, url: response.url() };
    }
  }

  async waitForIdle(timeoutMs: number, idleMs: number): Promise<void> {
    const start = Date.now();
    const quietMs = Math.max(0, idleMs);
    let lastPendingCount = this.pending.size;
    let lastPendingChange = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (this.pending.size !== lastPendingCount) {
        lastPendingCount = this.pending.size;
        lastPendingChange = Date.now();
      }

      if (this.pending.size > 0 && Date.now() - lastPendingChange > timeoutMs) {
        // Treat stalled requests as idle so UI waits don't hang forever.
        this.pending.clear();
        return;
      }

      if (this.lastError) {
        const { status, url } = this.lastError;
        this.lastError = null;
        throw new Error(`UI API response ${status} for ${url}`);
      }

      if (this.pending.size === 0) {
        await this.page.waitForTimeout(quietMs);
        if (this.pending.size === 0) {
          return;
        }
      } else {
        await this.page.waitForTimeout(50);
      }
    }

    throw new Error(
      `UI network idle timeout after ${timeoutMs}ms (pending requests: ${this.pending.size}).`
    );
  }
}

const trackers = new WeakMap<Page, UiNetworkTracker>();

export const installUiNetworkTracker = (page: Page): UiNetworkTracker => {
  const existing = trackers.get(page);
  if (existing) return existing;

  const tracker = new UiNetworkTracker(page, {
    allowlist: buildAllowlist(),
    ignorePatterns: DEFAULT_IGNORE_PATTERNS,
    failOnStatus: FAIL_ON_HTTP_ERRORS ? (FAIL_ON_4XX ? 400 : 500) : Number.POSITIVE_INFINITY,
  });

  trackers.set(page, tracker);
  page.once("close", () => trackers.delete(page));
  return tracker;
};

export const waitForUiIdle = async (page: Page, options: UiIdleOptions = {}): Promise<void> => {
  const tracker = installUiNetworkTracker(page);
  const timeoutMs = options.timeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const idleMs = options.idleMs ?? DEFAULT_IDLE_QUIET_MS;
  await tracker.waitForIdle(timeoutMs, idleMs);
};
