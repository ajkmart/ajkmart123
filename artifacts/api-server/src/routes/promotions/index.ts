import { Router } from "express";
import campaignsRouter from "./campaigns.js";
import offersRouter from "./offers.js";
import publicRouter from "./public.js";

const router = Router();

router.use("/", publicRouter);
router.use("/", campaignsRouter);
router.use("/", offersRouter);

export default router;
