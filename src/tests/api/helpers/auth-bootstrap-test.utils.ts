export type FakeResponse = {
  status: () => number;
  url?: () => string;
  text?: () => Promise<string>;
  json?: () => Promise<unknown>;
};

export type FakeRequestContext = {
  get: (url: string) => Promise<FakeResponse>;
  post: (url: string, opts?: unknown) => Promise<FakeResponse>;
  storageState: (opts?: unknown) => Promise<void>;
  dispose: () => Promise<void>;
};

export const statusFn = (code: number) => () => code;

export function createFormLoginContext(
  loginStatus: number,
  postStatus: number,
  html: string,
  isAuthenticated = true,
  authStatus = 200,
): FakeRequestContext {
  const loginPage: FakeResponse = {
    status: statusFn(loginStatus),
    url: () => "https://example.test/login",
    text: async () => html,
  };

  return {
    get: async (url: string) => {
      if (url === "auth/login") {
        return loginPage;
      }
      if (url === "auth/isAuthenticated") {
        return {
          status: statusFn(authStatus),
          json: async () => isAuthenticated,
        };
      }
      return { status: statusFn(200) };
    },
    post: async () => ({ status: statusFn(postStatus) }),
    storageState: async () => {},
    dispose: async () => {},
  };
}

export function buildAuthContext(): FakeRequestContext {
  return {
    get: async (url: string) =>
      url.includes("isAuthenticated")
        ? { status: () => 200, json: async () => true }
        : { status: () => 200 },
    post: async () => ({ status: () => 200 }),
    storageState: async () => {},
    dispose: async () => {},
  };
}
