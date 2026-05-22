/**
 * requireRole — re-exported from the canonical implementation in security.ts.
 *
 * The original copy of requireRole that lived here has been removed.
 * The canonical implementation (which includes vendorApprovalCheck support)
 * lives in middleware/security.ts. All call sites use that module directly.
 *
 * This file is kept as a thin re-export for backward compatibility.
 */
export { requireRole } from "./security.js";
