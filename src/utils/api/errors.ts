import type { ApiUserRole } from "./auth";

/**
 * Base class for EXUI API test errors with structured context.
 */
export abstract class ExuiTestError extends Error {
  constructor(
    message: string,
    public readonly context: Record<string, unknown> = {},
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = this.constructor.name;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      context: this.context,
      stack: this.stack,
      cause: this.cause
        ? {
            name: this.cause.name,
            message: this.cause.message,
          }
        : undefined,
    };
  }
}

export class AuthenticationError extends ExuiTestError {
  constructor(
    message: string,
    public readonly role: ApiUserRole,
    context: Record<string, unknown> = {},
    cause?: Error,
  ) {
    super(message, { role, ...context }, cause);
  }
}

export class StorageStateCorruptedError extends ExuiTestError {
  constructor(
    message: string,
    public readonly storagePath: string,
    context: Record<string, unknown> = {},
    cause?: Error,
  ) {
    super(message, { storagePath, ...context }, cause);
  }
}

export class ApiRetryExhaustedError extends ExuiTestError {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly attempts: number,
    context: Record<string, unknown> = {},
    cause?: Error,
  ) {
    super(message, { endpoint, attempts, ...context }, cause);
  }
}

export class ConfigurationError extends ExuiTestError {
  constructor(
    message: string,
    public readonly configKey: string,
    context: Record<string, unknown> = {},
    cause?: Error,
  ) {
    super(message, { configKey, ...context }, cause);
  }
}

export class SessionCaptureError extends ExuiTestError {
  constructor(
    message: string,
    public readonly userIdentifier: string,
    context: Record<string, unknown> = {},
    cause?: Error,
  ) {
    super(message, { userIdentifier, ...context }, cause);
  }
}
