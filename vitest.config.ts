import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/calc/**/*.ts"],
      exclude: ["src/calc/**/*.test.ts"],
      reporter: ["text", "json-summary"],
      // The calculation module is fully covered - assumption A10.
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
