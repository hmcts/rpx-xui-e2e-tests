import { type Mock, vi } from "vitest";
import { seedRoleAccessCaseId } from "../api/utils/role-access.js";
import { withXsrf } from "../api/utils/apiTestUtils.js";
import { extractCaseShareEntries } from "../api/utils/types.js";

vi.mock("../api/utils/apiTestUtils.js", () => ({
  withXsrf: vi.fn()
}));

vi.mock("../api/utils/types.js", () => ({
  extractCaseShareEntries: vi.fn()
}));

describe("role access utils", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns first caseId when available", async () => {
    const apiClient = {
      get: vi.fn().mockResolvedValue({ data: { cases: [{ caseId: "abc123" }] } })
    };
    (extractCaseShareEntries as unknown as Mock).mockReturnValue([{ caseId: "abc123" }]);
    (withXsrf as unknown as Mock).mockImplementation(async (_role, cb) => cb({}));

    const result = await seedRoleAccessCaseId(apiClient);
    expect(result).toBe("abc123");
    expect(apiClient.get).toHaveBeenCalled();
  });

  it("returns undefined on missing ids or errors", async () => {
    const apiClient = { get: vi.fn().mockResolvedValue({ data: [] }) };
    (extractCaseShareEntries as unknown as Mock).mockReturnValue([]);
    (withXsrf as unknown as Mock).mockImplementation(async (_role, cb) => cb({}));

    const emptyResult = await seedRoleAccessCaseId(apiClient);
    expect(emptyResult).toBeUndefined();

    (withXsrf as unknown as Mock).mockImplementation(async () => {
      throw new Error("boom");
    });
    const errored = await seedRoleAccessCaseId(apiClient);
    expect(errored).toBeUndefined();
  });
});
