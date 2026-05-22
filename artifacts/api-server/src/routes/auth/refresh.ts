import { Router, type IRouter } from "express";
import { validateBody as sharedValidateBody } from "../../middleware/validate.js";
import { handleRefreshToken } from "./auth-common.js";
import { refreshTokenSchema } from "./helpers.js";

const router: IRouter = Router();

router.post("/refresh", sharedValidateBody(refreshTokenSchema), handleRefreshToken);
router.post("/refresh-token", sharedValidateBody(refreshTokenSchema), handleRefreshToken);

export default router;
