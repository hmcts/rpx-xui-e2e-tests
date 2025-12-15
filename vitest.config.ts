import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/tests/unit/**/*.spec.ts"],
    exclude: ["node_modules", "dist", "src/tests/ui/**", "src/tests/api/**", "src/tests/common/**"],
    environment: "node",
    globals: true
  }
});
