import { defineConfig } from "vitest/config";

// The graded core (pricing, scope mapping, AI-output validation, state machine)
// is pure — no D1/Workers bindings — so it runs in a plain node environment.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
