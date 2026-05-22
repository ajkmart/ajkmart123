/**
 * /api/docs — Interactive Swagger UI served from the existing OpenAPI 3.1.0 spec.
 *
 * Gated behind `adminAuth` so the interactive docs (which allow test calls) are
 * only accessible to authenticated admin users.
 *
 * The spec is parsed from disk at module load time and passed directly to
 * swagger-ui-express, so no extra HTTP round-trip is needed to fetch the spec.
 */

import { Router } from "express";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import swaggerUi from "swagger-ui-express";
import { fileURLToPath } from "url";
import { parse as yamlParse } from "yaml";
import { logger } from "../lib/logger.js";
import { adminAuth } from "./admin-shared.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadSpec(): Record<string, unknown> {
  const candidates = [
    resolve(__dirname, "../../../../lib/api-spec/openapi.yaml"),
    resolve(__dirname, "../../../../../lib/api-spec/openapi.yaml"),
    resolve(process.cwd(), "lib/api-spec/openapi.yaml"),
  ];

  for (const candidate of candidates) {
    try {
      const raw = readFileSync(candidate, "utf-8");
      const parsed = yamlParse(raw) as Record<string, unknown>;
      logger.info(`[docs] Loaded OpenAPI spec from ${candidate}`);
      return parsed;
    } catch (err) {
      logger.debug(
        { error: err instanceof Error ? err.message : String(err) },
        "[docs] OpenAPI candidate not found — trying next"
      );
      // try next candidate
    }
  }

  logger.warn("[docs] Could not find openapi.yaml — Swagger UI will show a minimal spec");
  return {
    openapi: "3.1.0",
    info: { title: "AJKMart API", version: "0.1.0", description: "Spec file not found at startup" },
    paths: {},
  };
}

const spec = loadSpec();

const swaggerUiOptions: swaggerUi.SwaggerUiOptions = {
  customSiteTitle: "AJKMart API Docs",
  customCss: `
    .swagger-ui .topbar { background: #1e293b; border-bottom: 1px solid #334155; }
    .swagger-ui .topbar-wrapper img { display: none; }
    .swagger-ui .topbar-wrapper::before {
      content: "AJKMart API Docs";
      color: #a5b4fc;
      font-weight: 700;
      font-size: 1.1rem;
      font-family: system-ui, sans-serif;
      margin-left: 4px;
    }
    .swagger-ui { font-family: system-ui, sans-serif; }
    body { background: #0f172a; }
  `,
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    tryItOutEnabled: false,
    deepLinking: true,
  },
};

const router = Router();

router.use(adminAuth);
router.use(swaggerUi.serve as unknown as import("express").RequestHandler[]);
router.use(swaggerUi.setup(spec, swaggerUiOptions) as unknown as import("express").RequestHandler);

export default router;
