import path from "node:path";

const defaultStoragePath = path.join(
  process.cwd(),
  "test-results",
  "storage-states",
  "ui",
  "solicitor.json"
);

export const resolveUiStoragePath = (): string =>
  process.env.PW_UI_STORAGE_PATH ?? defaultStoragePath;

export const shouldUseUiStorage = (): boolean =>
  process.env.PW_UI_STORAGE === "1" || Boolean(process.env.PW_UI_STORAGE_PATH);
