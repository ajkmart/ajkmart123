/**
 * Shared admin-side input validators. Centralised so individual pages
 * stop hand-rolling regexes and mismatched checks.
 */

import { z } from "zod";

export const PHONE_REGEX = /^\+?[1-9]\d{6,14}$/;
export const PK_PHONE_REGEX = /^(?:\+?92|0)3\d{9}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

/** Accepts E.164 (+countrycode + 7-15 digits) OR Pakistani local 03xxxxxxxxx. */
export function isValidPhone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return PHONE_REGEX.test(trimmed) || PK_PHONE_REGEX.test(trimmed);
}

/** Splits a comma separated string into a deduped, trimmed list. */
export function splitCsv(value: string | null | undefined): string[] {
  if (!value) return [];
  const out = new Set<string>();
  for (const piece of value.split(",")) {
    const t = piece.trim();
    if (t) out.add(t);
  }
  return Array.from(out);
}

// ---------------------------------------------------------------------------
// Zod schemas for admin forms
// ---------------------------------------------------------------------------

export const productSchema = z.object({
  name: z.string().min(1, "Name is required").max(120, "Name must be 120 characters or fewer"),
  category: z.string().min(1, "Category is required — search and select one from the dropdown"),
  type: z.string().min(1, "Type is required"),
  price: z
    .string()
    .min(1, "Price is required")
    .refine((v) => !isNaN(Number(v)) && Number(v) >= 1, {
      message: "Price must be at least 1",
    })
    .refine((v) => Number(v) <= 1_000_000, {
      message: "Price must be 1,000,000 or less",
    }),
  originalPrice: z
    .string()
    .optional()
    .refine((v) => !v || (!isNaN(Number(v)) && Number(v) >= 1), {
      message: "Original price must be at least 1",
    })
    .refine((v) => !v || Number(v) <= 1_000_000, {
      message: "Original price must be 1,000,000 or less",
    }),
  description: z.string().max(500, "Description must be 500 characters or fewer").optional(),
  unit: z.string().max(32, "Unit must be 32 characters or fewer").optional(),
  vendorName: z.string().max(120, "Vendor name must be 120 characters or fewer").optional(),
  deliveryTime: z.string().max(48, "Delivery time must be 48 characters or fewer").optional(),
  inStock: z.boolean(),
  image: z.string().optional(),
});

export type ProductFormErrors = Partial<Record<keyof z.infer<typeof productSchema>, string>>;

export const createUserSchema = z
  .object({
    name: z.string(),
    phone: z.string(),
    email: z.string(),
    username: z.string(),
    tempPassword: z.string(),
    role: z.string(),
    city: z.string(),
    area: z.string(),
  })
  .superRefine((data, ctx) => {
    if (!data.name.trim() && !data.phone.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Name ya phone mein se koi ek zaroor dein",
        path: ["general"],
      });
    }
    if (
      data.phone.trim() &&
      !/^(\+?92|0)?3\d{9}$/.test(data.phone.trim().replace(/[\s\-()+]/g, ""))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Valid Pakistani mobile number enter karein (e.g. 03001234567)",
        path: ["phone"],
      });
    }
    if (data.email.trim() && !data.email.trim().includes("@")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Valid email address darj karein",
        path: ["email"],
      });
    }
    if (data.username.trim() && data.username.trim().replace(/[^a-z0-9_]/gi, "").length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Username kam az kam 3 characters ka hona chahiye",
        path: ["username"],
      });
    }
    if (data.tempPassword.trim()) {
      const pw = data.tempPassword.trim();
      if (pw.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Password kam az kam 8 characters ka hona chahiye",
          path: ["tempPassword"],
        });
      } else if (!/[A-Z]/.test(pw)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Password mein kam az kam ek capital letter hona chahiye",
          path: ["tempPassword"],
        });
      } else if (!/[0-9]/.test(pw)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Password mein kam az kam ek number hona chahiye",
          path: ["tempPassword"],
        });
      }
    }
  });

export type CreateUserFormErrors = Record<string, string>;
