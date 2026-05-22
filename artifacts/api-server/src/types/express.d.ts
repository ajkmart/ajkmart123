import type {
  riderProfilesTable,
  ridesTable,
  usersTable,
  vendorProfilesTable,
} from "@workspace/db/schema";
import type { InferSelectModel } from "drizzle-orm";

type RiderUser = InferSelectModel<typeof usersTable> &
  Partial<InferSelectModel<typeof riderProfilesTable>>;
type VendorUser = InferSelectModel<typeof usersTable> &
  Partial<InferSelectModel<typeof vendorProfilesTable>>;

declare global {
  namespace Express {
    interface Request {
      log: {
        trace: (...a: unknown[]) => void;
        debug: (...a: unknown[]) => void;
        info: (...a: unknown[]) => void;
        warn: (...a: unknown[]) => void;
        error: (...a: unknown[]) => void;
        fatal: (...a: unknown[]) => void;
      };
      customerId?: string;
      customerPhone?: string;
      customerUser?: InferSelectModel<typeof usersTable>;
      vendorId?: string;
      vendorUser?: VendorUser;
      riderId?: string;
      riderUser?: RiderUser;
      adminId?: string;
      adminRole?: string;
      adminName?: string;
      adminIp?: string;
      adminPermissions?: string[];
      ride?: InferSelectModel<typeof ridesTable>;
      admin?: { id: string; [key: string]: unknown };
      rawBody?: Buffer;
      /** Set by requireRole / customerAuth / riderAuth / vendorAuth middleware */
      userId?: string;
      userPhone?: string;
      userRole?: string;
      userRoles?: string[];
      tokenVersion?: number;
      /** Override params to always be Record<string, string> for Express v5 compatibility */
      params: Record<string, string>;
    }
  }
}
