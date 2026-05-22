import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodSchema } from "zod";
import { logger } from "../lib/logger.js";

interface ValidationTarget {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

interface ValidationErrorDetail {
  field: string;
  message: string;
}

const formatZodDetails = (err: ZodError): ValidationErrorDetail[] =>
  err.errors.map((e) => ({
    field: e.path.length > 0 ? e.path.join(".") : "_root",
    message: e.message,
  }));

const VALIDATION_ERROR_UR = "توثیق کی خرابی۔ اپنا ان پٹ چیک کریں۔";

interface ValidateOptions {
  status?: number;
}

export function validate(schema: ValidationTarget, opts: ValidateOptions = {}) {
  const statusCode = opts.status ?? 400;
  return (req: Request, res: Response, next: NextFunction) => {
    if (schema.body) {
      const result = schema.body.safeParse(req.body);
      if (!result.success) {
        logger.warn(
          { validationErrors: result.error.errors, url: req.url, method: req.method },
          "Request body validation failed"
        );
        res.status(statusCode).json({
          success: false,
          error: "Validation Failed",
          message: VALIDATION_ERROR_UR,
          code: "VALIDATION",
          details: formatZodDetails(result.error),
        });
        return;
      }
      req.body = result.data;
    }

    if (schema.query) {
      const result = schema.query.safeParse(req.query);
      if (!result.success) {
        logger.warn(
          { validationErrors: result.error.errors, url: req.url, method: req.method },
          "Request query validation failed"
        );
        res.status(statusCode).json({
          success: false,
          error: "Validation Failed",
          message: VALIDATION_ERROR_UR,
          code: "VALIDATION",
          details: formatZodDetails(result.error),
        });
        return;
      }
      const parsed = result.data as Record<string, unknown>;
      Object.keys(req.query).forEach((k) => {
        if (!(k in parsed)) delete (req.query as Record<string, unknown>)[k];
      });
      Object.assign(req.query, parsed);
    }

    if (schema.params) {
      const result = schema.params.safeParse(req.params);
      if (!result.success) {
        logger.warn(
          { validationErrors: result.error.errors, url: req.url, method: req.method },
          "Request params validation failed"
        );
        res.status(statusCode).json({
          success: false,
          error: "Validation Failed",
          message: VALIDATION_ERROR_UR,
          code: "VALIDATION",
          details: formatZodDetails(result.error),
        });
        return;
      }
      req.params = result.data as Record<string, string>;
    }

    next();
  };
}

export function validateBody(schema: ZodSchema, opts: ValidateOptions = {}) {
  return validate({ body: schema }, opts);
}

export function validateQuery(schema: ZodSchema, opts: ValidateOptions = {}) {
  return validate({ query: schema }, opts);
}

export function validateParams(schema: ZodSchema, opts: ValidateOptions = {}) {
  return validate({ params: schema }, opts);
}
