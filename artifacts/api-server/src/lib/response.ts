import type { Response } from "express";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
}

const DEFAULT_UR: Record<number, string> = {
  400: "درخواست غلط ہے۔",
  401: "تصدیق ضروری ہے۔",
  403: "رسائی سے انکار۔",
  404: "وسیلہ نہیں ملا۔",
  429: "بہت زیادہ درخواستیں۔ براہ کرم آہستہ کریں۔",
  500: "ایک غیر متوقع خرابی پیش آئی۔ براہ کرم بعد میں دوبارہ کوشش کریں۔",
  502: "سروس دستیاب نہیں ہے۔",
  503: "سروس دستیاب نہیں ہے۔",
};

export function sendSuccess(
  res: Response,
  data?: unknown,
  message?: string,
  statusCode?: number
): void {
  const code = statusCode ?? 200;
  const body: ApiResponse = { success: true };
  if (data !== undefined) body.data = data;
  if (message) body.message = message;
  res.status(code).json(body);
}

export function sendCreated<T>(res: Response, data: T, message?: string): void {
  sendSuccess(res, data, message, 201);
}

export function sendAccepted<T>(res: Response, data: T, message?: string): void {
  sendSuccess(res, data, message, 202);
}

export function sendError(
  res: Response,
  error: string,
  statusCode?: number,
  message?: string
): void {
  const code = statusCode ?? 500;
  const body: ApiResponse = { success: false, error };
  body.message = message || DEFAULT_UR[code] || DEFAULT_UR[500]!;
  res.status(code).json(body);
}

export function sendErrorWithData<T>(
  res: Response,
  error: string,
  data: T,
  statusCode?: number,
  message?: string
): void {
  const code = statusCode ?? 500;
  const body: ApiResponse<T> = { success: false, error, data };
  body.message = message || DEFAULT_UR[code] || DEFAULT_UR[500]!;
  res.status(code).json(body);
}

export function sendValidationError(res: Response, error: string, message?: string): void {
  sendError(res, error, 400, message || "توثیق کی خرابی۔ اپنا ان پٹ چیک کریں۔");
}

export function sendUnauthorized(
  res: Response,
  error = "Authentication required.",
  message?: string
): void {
  sendError(res, error, 401, message);
}

export function sendForbidden(res: Response, error = "Access denied.", message?: string): void {
  sendError(res, error, 403, message);
}

export function sendNotFound(res: Response, error = "Resource not found.", message?: string): void {
  sendError(res, error, 404, message);
}

export function sendTooManyRequests(res: Response, retryAfterOrMessage?: number | string): void {
  let message = "Too many requests. Please slow down.";
  if (typeof retryAfterOrMessage === "number") {
    res.setHeader("Retry-After", retryAfterOrMessage.toString());
  } else if (typeof retryAfterOrMessage === "string") {
    message = retryAfterOrMessage;
  }
  sendError(res, message, 429);
}

export function sendConflict(res: Response, error = "Conflict.", message?: string): void {
  sendError(res, error, 409, message);
}

export function sendInternalError(res: Response, message?: string): void {
  sendError(res, message ?? "An unexpected error occurred. Please try again later.", 500);
}
