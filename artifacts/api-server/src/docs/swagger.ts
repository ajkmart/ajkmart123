/**
 * OpenAPI spec built from inline JSDoc @openapi / @swagger comments.
 *
 * Exports a plain spec object so callers can pass it directly to
 * swaggerUi.setup() or serve it as JSON.  The router is NOT exported here —
 * mounting decisions live in routes/index.ts.
 */
import { createRequire } from "module";
import { dirname, resolve } from "path";
import swaggerJsdoc from "swagger-jsdoc";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/* Read version from the local package.json without a top-level await */
const _require = createRequire(import.meta.url);
const pkgVersion: string = (() => {
  try {
    /* Works whether running from src/ (dev) or dist/ (prod) */
    const candidates = [
      resolve(__dirname, "..", "..", "package.json"), // src/docs -> root
      resolve(__dirname, "..", "package.json"), // dist -> root
      resolve(process.cwd(), "package.json"),
    ];
    for (const c of candidates) {
      try {
        const pkg = _require(c) as { version?: string };
        if (pkg.version) return pkg.version;
      } catch (err) {
        logger.warn(
          { err },
          "[swagger] Could not read version from package candidate — trying next"
        );
      }
    }
  } catch (err) {
    logger.warn({ err }, "[swagger] Could not resolve package version — falling back to 1.0.0");
  }
  return "1.0.0";
})();

/* swagger-jsdoc scans STATIC JSDoc comments — always point at .ts source files
   regardless of whether we're in dev (tsx) or a compiled bundle.

   Dev  (tsx):  __dirname === …/src/docs/    → resolve("../routes") === …/src/routes
   Prod (esbuild): __dirname === …/dist/     → resolve("../src/routes") === …/src/routes */
const srcRoutesDir = __filename.endsWith(".ts")
  ? resolve(__dirname, "..", "routes")
  : resolve(__dirname, "..", "src", "routes");

const ext = ".ts"; /* swagger-jsdoc reads comments from source files only */

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.1.0",
    info: {
      title: "AJKMart API",
      version: pkgVersion,
      description:
        "AJKMart super-app API — authentication, e-commerce, food delivery, ride-hailing, pharmacy, parcels, inter-city transport, and admin operations.",
      contact: { name: "AJKMart Support", email: "support@ajkmart.com" },
    },
    servers: [
      {
        url: process.env["APP_BASE_URL"] ? `${process.env["APP_BASE_URL"]}/api` : `/api`,
        description: "Current environment",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Customer / user JWT access token (Authorization: Bearer <token>)",
        },
        AdminBearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Admin JWT access token (admin-auth-v2 flow)",
        },
      },
      schemas: {
        ApiSuccess: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: { type: "object" },
            message: { type: "string", example: "OK" },
          },
        },
        ApiError: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: { type: "string", example: "Something went wrong" },
          },
        },
        Session: {
          type: "object",
          properties: {
            id: { type: "string" },
            deviceName: { type: "string" },
            browser: { type: "string" },
            os: { type: "string" },
            ip: { type: "string" },
            location: { type: "string", nullable: true },
            lastActiveAt: { type: "string", format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
  },
  apis: [
    /* Auth endpoints — the five required + extras that are already annotated */
    resolve(srcRoutesDir, "auth", `otp${ext}`) /* POST /auth/send-otp, /auth/verify-otp */,
    resolve(srcRoutesDir, "auth", `password${ext}`) /* POST /auth/login */,
    resolve(srcRoutesDir, "auth", `register${ext}`) /* POST /auth/register */,
    resolve(srcRoutesDir, "auth", `refresh${ext}`) /* POST /auth/refresh, /auth/logout */,
    resolve(srcRoutesDir, "auth", `sessions${ext}`) /* POST /auth/sessions/revoke */,
    resolve(srcRoutesDir, "auth", `misc${ext}`) /* POST /auth/recovery/reset-password */,
    resolve(srcRoutesDir, "auth", `two-factor${ext}`),
    resolve(srcRoutesDir, "auth", `magic-link${ext}`),
    resolve(srcRoutesDir, "auth", `social${ext}`),
    resolve(srcRoutesDir, "auth", `email-otp${ext}`),
    resolve(srcRoutesDir, "auth", `identifier${ext}`),
    resolve(srcRoutesDir, "admin", "system", `users${ext}`),
    resolve(srcRoutesDir, `health${ext}`),
    resolve(srcRoutesDir, `users${ext}`),
    resolve(srcRoutesDir, `orders${ext}`),
    resolve(srcRoutesDir, `wallet${ext}`),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
