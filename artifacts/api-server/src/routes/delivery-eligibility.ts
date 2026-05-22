import { db } from "@workspace/db";
import { productsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { checkDeliveryEligibility, checkUserOnlyEligibility } from "../lib/delivery-access.js";
import { logger } from "../lib/logger.js";
import { sendSuccess } from "../lib/response.js";
import { customerAuth } from "../middleware/security.js";

const router: IRouter = Router();

router.get("/", customerAuth, async (req, res) => {
  try {
    const userId = req.customerId!;
    let vendorId = req.query["vendorId"] as string | undefined;
    const productId = req.query["productId"] as string | undefined;
    const serviceType = (req.query["serviceType"] as string) || "all";

    if (!vendorId && productId) {
      try {
        const [prod] = await db
          .select({ vendorId: productsTable.vendorId })
          .from(productsTable)
          .where(eq(productsTable.id, productId))
          .limit(1);
        vendorId = prod?.vendorId ?? undefined;
      } catch (err) {
        logger.warn(
          { productId, err: err instanceof Error ? err.message : String(err) },
          "[delivery-eligibility] vendor lookup failed — proceeding without vendor context"
        );
      }
    }

    if (vendorId) {
      const result = await checkDeliveryEligibility(userId, vendorId, serviceType);
      sendSuccess(res, result);
    } else {
      const result = await checkUserOnlyEligibility(userId, serviceType);
      sendSuccess(res, result);
    }
  } catch (_e: unknown) {
    sendSuccess(res, { eligible: true });
  }
});

export default router;
