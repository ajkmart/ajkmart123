import { Router } from "express";
import bookingRouter from "./booking.js";
import dispatchRouter from "./dispatch.js";
import trackingRouter from "./tracking.js";

export { dispatchScheduledRides, startDispatchEngine } from "./dispatch.js";

const router = Router();

router.use("/", bookingRouter);
router.use("/", trackingRouter);
router.use("/", dispatchRouter);

export default router;
