import { defineConfig } from "drizzle-kit";

// Generates SQL migrations into ./migrations from the Drizzle schema.
// Applied to D1 via `wrangler d1 migrations apply greenscape`.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./migrations",
});
