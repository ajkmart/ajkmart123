import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const kycVerificationsTable = pgTable("kyc_verifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  /* personal details */
  fullName: text("full_name"),
  cnic: text("cnic"),
  dateOfBirth: text("date_of_birth"),
  gender: text("gender"),
  address: text("address"),
  city: text("city"),
  /* documents */
  frontIdPhoto: text("front_id_photo"),
  backIdPhoto: text("back_id_photo"),
  selfiePhoto: text("selfie_photo"),
  /* review */
  rejectionReason: text("rejection_reason"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type KycVerification = typeof kycVerificationsTable.$inferSelect;
