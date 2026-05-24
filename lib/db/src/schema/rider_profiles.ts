import { decimal, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const riderProfilesTable = pgTable(
  "rider_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    vehicleType: text("vehicle_type"),
    vehiclePlate: text("vehicle_plate"),
    vehicleRegNo: text("vehicle_reg_no"),
    drivingLicense: text("driving_license"),
    vehiclePhoto: text("vehicle_photo"),
    documents: text("documents"),
    /* daily earnings goal for rider motivation (PKR) */
    dailyGoal: decimal("daily_goal", { precision: 10, scale: 2 }),
    /* KYC verification status for this rider's documents */
    kycStatus: text("kyc_status").default("pending"),
    kycRejectionReason: text("kyc_rejection_reason"),
    documentsVerifiedAt: timestamp("documents_verified_at"),
    /* Emergency contact phone number */
    emergencyContact: text("emergency_contact"),
    /* Bank details for payouts */
    bankName: text("bank_name"),
    bankAccount: text("bank_account"),
    bankAccountTitle: text("bank_account_title"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("rider_profiles_kyc_status_idx").on(t.kycStatus),
  ]
);

export const insertRiderProfileSchema = createInsertSchema(riderProfilesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertRiderProfile = z.infer<typeof insertRiderProfileSchema>;
export type RiderProfile = typeof riderProfilesTable.$inferSelect;
