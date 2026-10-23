import { defineConfig } from "vitest/config";
import { workflow } from "@workflow/vitest";
export default defineConfig({
  plugins: [workflow()],
  test: {
    include: ["test/workflow.integration.mjs"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
