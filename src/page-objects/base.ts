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

import {
  ExuiBodyComponent,
  ExuiFooterComponent,
  ExuiHeaderComponent,
} from "./components/index.js";

type ApiCall = {
  url: string;
  method: string;
  status: number;
  duration: number;
  timestamp: string;
  error?: string;
};

const logger = createLogger({ serviceName: "api-monitor", format: "pretty" });
const shouldLogApiMonitorEvents = process.env.PW_API_MONITOR_LOG !== "0";

// A base page inherited by pages & components
// can contain any additional config needed + instantiated page object
export abstract class Base {
  protected readonly logger = logger;
  readonly exuiCaseListComponent: ExuiCaseListComponent;
  readonly exuiCaseDetailsComponent: ExuiCaseDetailsComponent;
  readonly exuiBodyComponent: ExuiBodyComponent;
  readonly exuiFooter: ExuiFooterComponent;
  readonly exuiHeader: ExuiHeaderComponent;
  readonly exuiSpinnerComponent: ExuiSpinnerComponent;
  private static readonly monitoredPages = new WeakSet<Page>();
  private apiCalls: ApiCall[] = [];
  private readonly monitoringEnabled = true;
  private readonly maxApiCallsTracked = 500;

  constructor(public readonly page: Page) {
    this.exuiCaseListComponent = new ExuiCaseListComponent(page);
    this.exuiCaseDetailsComponent = new ExuiCaseDetailsComponent(page);
    this.exuiBodyComponent = new ExuiBodyComponent(page);
    this.exuiFooter = new ExuiFooterComponent(page);
    this.exuiHeader = new ExuiHeaderComponent(page);
    this.exuiSpinnerComponent = new ExuiSpinnerComponent(page);
    installUiNetworkTracker(page);
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
    await waitForUiIdleUtil(this.page, { timeoutMs, idleMs: 1000 }).catch(() => undefined);
    await this.exuiSpinnerComponent.wait();
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
      const call: ApiCall = {
        url: this.sanitizeUrl(url),
        method: request.method(),
        status,
        duration,
        timestamp: new Date().toISOString(),
      };

      this.apiCalls.push(call);
      if (this.apiCalls.length > this.maxApiCallsTracked) {
        this.apiCalls.shift();
      }

      if (status >= 500) {
        call.error = `HTTP ${status} - Server Error`;
        if (shouldLogApiMonitorEvents) {
          logger.error("DOWNSTREAM_API_FAILURE", {
            url: call.url,
            status,
            duration: duration === -1 ? "unknown" : `${duration}ms`,
            method: request.method(),
          });
        }
      } else if (duration !== -1 && duration > 5000) {
        if (shouldLogApiMonitorEvents) {
          logger.warn("SLOW_API_RESPONSE", {
            url: call.url,
            duration: `${duration}ms`,
            status,
            method: request.method(),
          });
        }
      } else if (status >= 400) {
        call.error = `HTTP ${status} - Client Error`;
        if (shouldLogApiMonitorEvents) {
          logger.warn("CLIENT_ERROR", {
            url: call.url,
            status,
            method: request.method(),
          });
        }
      }
    });

    this.page.on("requestfailed", (request) => {
      const url = request.url();
      if (!this.isBackendApi(url)) {
        return;
      }

      this.apiCalls.push({
        url: this.sanitizeUrl(url),
        method: request.method(),
        status: 0,
        duration: -1,
        timestamp: new Date().toISOString(),
        error: request.failure()?.errorText,
      });
      if (this.apiCalls.length > this.maxApiCallsTracked) {
        this.apiCalls.shift();
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

  private sanitizeUrl(url: string): string {
    return url.split("?")[0];
  }

  public getApiCalls(): ApiCall[] {
    return [...this.apiCalls];
  }

  public clearApiCalls(): void {
    this.apiCalls = [];
  }

  protected getApiTimingStats(sampleSize = 50): { count: number; avg: number; p95: number } {
    const durations = this.apiCalls
      .slice(-sampleSize)
      .map((call) => call.duration)
      .filter((duration) => Number.isFinite(duration) && duration > 0)
      .sort((left, right) => left - right);
    const count = durations.length;
    if (count === 0) {
      return { count: 0, avg: 0, p95: 0 };
    }
    const avg = Math.round(durations.reduce((sum, duration) => sum + duration, 0) / count);
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
    } = {}
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
}
