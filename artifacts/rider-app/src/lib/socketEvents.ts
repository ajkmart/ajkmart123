import { z } from "zod";

/* ── Socket event payload schemas (Zod) ──────────────────────────────────────
   Centralised runtime validation for every socket.io event the rider app
   receives that carries a meaningful payload.  Callers should use the
   `parse*` helpers or the raw schemas via `safeParse`.  Events that carry
   no payload (e.g. `rider:new_request`) don't need a schema here. */

export const RiderLocationPayloadSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  userId: z.string().optional(),
  accuracy: z.number().optional(),
  heading: z.number().nullable().optional(),
  speed: z.number().nullable().optional(),
  timestamp: z.string().optional(),
});
export type RiderLocationPayload = z.infer<typeof RiderLocationPayloadSchema>;

export const RideAssignedPayloadSchema = z.object({
  id: z.string(),
  status: z.string(),
  pickupAddress: z.string().optional().nullable(),
  dropAddress: z.string().optional().nullable(),
  fare: z.union([z.string(), z.number()]).optional().nullable(),
  type: z.string().optional().nullable(),
});
export type RideAssignedPayload = z.infer<typeof RideAssignedPayloadSchema>;

export const RideOtpPayloadSchema = z.object({
  rideId: z.string(),
  otp: z.string(),
});
export type RideOtpPayload = z.infer<typeof RideOtpPayloadSchema>;

export const AdminChatPayloadSchema = z.object({
  message: z.string(),
  sentAt: z.string(),
  from: z.literal("admin"),
});
export type AdminChatPayload = z.infer<typeof AdminChatPayloadSchema>;

/* ── Safe parsers ────────────────────────────────────────────────────────────
   Each returns `null` on validation failure instead of throwing, so event
   handlers can skip malformed payloads without crashing the app. */

export function parseRiderLocationPayload(raw: unknown): RiderLocationPayload | null {
  const result = RiderLocationPayloadSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseRideAssignedPayload(raw: unknown): RideAssignedPayload | null {
  const result = RideAssignedPayloadSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseRideOtpPayload(raw: unknown): RideOtpPayload | null {
  const result = RideOtpPayloadSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseAdminChatPayload(raw: unknown): AdminChatPayload | null {
  const result = AdminChatPayloadSchema.safeParse(raw);
  return result.success ? result.data : null;
}
