/**
 * Integration test global setup.
 * Runs in the same vitest worker as the test files (setupFiles).
 * Overrides DATABASE_URL with TEST_DATABASE_URL when provided.
 */

if (process.env["TEST_DATABASE_URL"]) {
  process.env["DATABASE_URL"] = process.env["TEST_DATABASE_URL"];
}
