import { db } from "@workspace/db";
import { weatherConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { Router } from "express";
import { sendError, sendSuccess } from "../lib/response.js";
import { requireFeatureEnabled } from "../middleware/security.js";

const router = Router();

/* Admin toggle: feature_weather. When OFF, the weather config
   endpoint returns 403 so a disabled admin switch is enforced
   server-side and not just hidden in the UI. */
router.use(
  requireFeatureEnabled(
    "feature_weather",
    "Weather feature is currently disabled by the administrator."
  )
);

router.get("/", async (_req, res) => {
  try {
    const [config] = await db
      .select()
      .from(weatherConfigTable)
      .where(eq(weatherConfigTable.id, "default"))
      .limit(1);
    if (!config) {
      sendSuccess(res, {
        config: { widgetEnabled: true, cities: "Muzaffarabad,Rawalakot,Mirpur,Bagh,Kotli,Neelum" },
      });
      return;
    }
    sendSuccess(res, { config: { widgetEnabled: config.widgetEnabled, cities: config.cities } });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

export default router;
