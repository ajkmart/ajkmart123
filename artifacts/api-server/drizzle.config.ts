import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required — provision the database or set it in Replit Secrets.");
}

export default defineConfig({
  schema: path.join(__dirname, "../../lib/db/src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
