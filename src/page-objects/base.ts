import {
  ExuiCaseDetailsComponent,
  ExuiCaseListComponent,
  ExuiSpinnerComponent,
  createLogger,
} from "@hmcts/playwright-common";
import { Page } from "@playwright/test";

import { ensureAnalyticsAccepted } from "../utils/ui/analytics.utils.js";
import {
  installUiNetworkTracker,
  type UiIdleOptions,
  waitForUiIdle as waitForUiIdleUtil,
} from "../utils/ui/ui-idle.utils.js";

import { ExuiHeaderComponent } from "./components/index.js";

const logger = createLogger({ serviceName: "api-monitor", format: "pretty" });

type BenignApiErrorRule = {
  method: string;
  status: number;
  urlPattern: RegExp;
};

const benignApiErrorRules: BenignApiErrorRule[] = [
  { method: "GET", status: 403, urlPattern: /\/api\/organisation$/ },
  { method: "GET", status: 400, urlPattern: /\/data\/internal\/cases\/\d+$/ },
];

type ApiCall = {
  url: string;
  method: string;
  status: number;
  duration: number;
  timestamp: string;
  error?: string;
};

// A base page inherited by pages & components
// can contain any additional config needed + instantiated page object
export abstract class Base {
  protected readonly logger = logger;
  readonly exuiCaseListComponent: ExuiCaseListComponent;
  readonly exuiCaseDetailsComponent: ExuiCaseDetailsComponent;
  readonly exuiHeader: ExuiHeaderComponent;
  readonly exuiSpinnerComponent: ExuiSpinnerComponent;
  private static readonly monitoredPages = new WeakSet<Page>();
  private static readonly pageApiCalls = new WeakMap<Page, ApiCall[]>();
  private readonly monitoringEnabled = true;
  private readonly maxApiCallsTracked = 500;

  constructor(public readonly page: Page) {
    this.exuiCaseListComponent = new ExuiCaseListComponent(page);
    this.exuiCaseDetailsComponent = new ExuiCaseDetailsComponent(page);
    this.exuiHeader = new ExuiHeaderComponent(page);
    this.exuiSpinnerComponent = new ExuiSpinnerComponent(page);
    installUiNetworkTracker(page);
    Base.getOrInitApiCalls(page);
    if (this.monitoringEnabled && !Base.monitoredPages.has(page)) {
      Base.monitoredPages.add(page);
      this.setupApiMonitoring();
    }
  }

  async acceptAnalyticsCookies(): Promise<void> {
    await ensureAnalyticsAccepted(this.page);
  }

  async waitForUiIdleState(options?: UiIdleOptions): Promise<void> {
    await waitForUiIdleUtil(this.page, options);
    await this.exuiSpinnerComponent.wait();
  }

  async waitForUiIdleStateLenient(timeoutMs = 30_000): Promise<void> {
    await waitForUiIdleUtil(this.page, { timeoutMs, idleMs: 1000 }).catch(
      () => undefined,
    );
    await this.exuiSpinnerComponent.wait();
  }

  public getApiCalls(): ApiCall[] {
    return [...Base.getOrInitApiCalls(this.page)];
  }

  public clearApiCalls(): void {
    const calls = Base.getOrInitApiCalls(this.page);
    calls.length = 0;
  }

  public getApiCallsSummary(): string {
    const apiCalls = Base.getOrInitApiCalls(this.page);
    const slow = apiCalls.filter((call) => call.duration > 5_000);
    const errors = apiCalls.filter((call) => call.status >= 400);
    const serverErrors = errors.filter((call) => call.status >= 500);
    const clientErrors = errors.filter(
      (call) => call.status >= 400 && call.status < 500,
    );

    const totalDuration = apiCalls.reduce(
      (sum, call) => sum + call.duration,
      0,
    );
    const avgDuration =
      apiCalls.length > 0 ? Math.round(totalDuration / apiCalls.length) : 0;

    let summary = [
      "API CALLS SUMMARY:",
      "------------------------------",
      `Total calls: ${apiCalls.length}`,
      `Server errors (5xx): ${serverErrors.length}`,
      `Client errors (4xx): ${clientErrors.length}`,
      `Slow responses (>5s): ${slow.length}`,
      `Average response time: ${avgDuration}ms`,
    ].join("\n");

    if (serverErrors.length > 0) {
      summary += "\n\nSERVER ERRORS (5xx):";
      for (const errorCall of serverErrors) {
        summary += `\n- ${errorCall.method} ${errorCall.url} -> HTTP ${errorCall.status} (${errorCall.duration}ms)`;
      }
    }

    if (clientErrors.length > 0) {
      summary += "\n\nCLIENT ERRORS (4xx):";
      for (const errorCall of clientErrors) {
        summary += `\n- ${errorCall.method} ${errorCall.url} -> HTTP ${errorCall.status} (${errorCall.duration}ms)`;
      }
    }

    if (slow.length > 0) {
      summary += "\n\nSLOW RESPONSES (>5s):";
      for (const slowCall of slow) {
        summary += `\n- ${slowCall.method} ${slowCall.url} -> ${slowCall.duration}ms (HTTP ${slowCall.status})`;
      }
    }

    if (errors.length === 0 && slow.length === 0) {
      summary += "\n\nAll API calls successful and performant";
    }

    return `${summary}\n------------------------------`;
  }

  protected getApiTimingStats(sampleSize = 50): {
    count: number;
    avg: number;
    p95: number;
  } {
    const durations = Base.getOrInitApiCalls(this.page)
      .slice(-sampleSize)
      .map((call) => call.duration)
      .filter((duration) => Number.isFinite(duration) && duration > 0)
      .sort((left, right) => left - right);
    const count = durations.length;
    if (count === 0) {
      return { count: 0, avg: 0, p95: 0 };
    }
    const avg = Math.round(
      durations.reduce((sum, duration) => sum + duration, 0) / count,
    );
    const p95Index = Math.floor(0.95 * (count - 1));
    const p95 = durations[p95Index] ?? durations[count - 1];
    return { count, avg, p95 };
  }

  protected getRecommendedTimeoutMs(
    options: {
      min?: number;
      max?: number;
      multiplier?: number;
      fallback?: number;
      sampleSize?: number;
    } = {},
  ): number {
    const {
      min = 15_000,
      max = 120_000,
      multiplier = 4,
      fallback = 120_000,
      sampleSize = 50,
    } = options;
    const stats = this.getApiTimingStats(sampleSize);
    if (stats.count === 0) {
      return fallback;
    }
    const computed = Math.ceil(stats.avg * multiplier);
    return Math.min(max, Math.max(min, computed));
  }

  private static getOrInitApiCalls(page: Page): ApiCall[] {
    const existing = Base.pageApiCalls.get(page);
    if (existing) {
      return existing;
    }
    const initial: ApiCall[] = [];
    Base.pageApiCalls.set(page, initial);
    return initial;
  }

  private setupApiMonitoring(): void {
    this.page.on("response", async (response) => {
      const request = response.request();
      const url = request.url();
      if (!this.isBackendApi(url)) {
        return;
      }

      const timing = request.timing();
      const duration = timing.responseEnd;
      const status = response.status();
      const method = request.method().toUpperCase();
      const sanitizedUrl = this.sanitizeUrl(url);

      const call: ApiCall = {
        url: sanitizedUrl,
        method,
        status,
        duration,
        timestamp: new Date().toISOString(),
      };

      const apiCalls = Base.getOrInitApiCalls(this.page);
      apiCalls.push(call);
      if (apiCalls.length > this.maxApiCallsTracked) {
        apiCalls.shift();
      }

      if (status >= 500) {
        call.error = `HTTP ${status} - Server Error`;
        this.logger.error("DOWNSTREAM_API_FAILURE", {
          url: call.url,
          status,
          duration: duration === -1 ? "unknown" : `${duration}ms`,
          method,
        });
      } else if (duration !== -1 && duration > 5_000) {
        this.logger.warn("SLOW_API_RESPONSE", {
          url: call.url,
          duration: `${duration}ms`,
          status,
          method,
        });
      } else if (
        status >= 400 &&
        status < 500 &&
        !this.isKnownBenignApiError(sanitizedUrl, method, status)
      ) {
        call.error = `HTTP ${status} - Client Error`;
        this.logger.warn("CLIENT_ERROR", {
          url: call.url,
          status,
          method,
        });
      }
    });
  }

  private isBackendApi(url: string): boolean {
    return (
      (url.includes("/api/") ||
        url.includes("/data/") ||
        url.includes("/auth/") ||
        url.includes("/workallocation/") ||
        url.includes("/aggregated/") ||
        url.includes("/caseworkers/")) &&
      !url.includes(".js") &&
      !url.includes(".css") &&
      !url.includes(".woff")
    );
  }

  private isKnownBenignApiError(
    url: string,
    method: string,
    status: number,
  ): boolean {
    return benignApiErrorRules.some((rule) => {
      return (
        rule.status === status &&
        rule.method === method &&
        rule.urlPattern.test(url)
      );
    });
  }

  private sanitizeUrl(url: string): string {
    return url.split("?")[0];
  }
}
