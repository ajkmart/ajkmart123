import { db } from "@workspace/db";
import { deepLinksTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { Router } from "express";

const router = Router();

router.get("/:code", async (req, res) => {
  try {
    const code = req.params["code"] as string;
    const [link] = await db
      .select()
      .from(deepLinksTable)
      .where(eq(deepLinksTable.shortCode, code))
      .limit(1);

    if (!link) {
      res.status(404).json({ error: "Link not found" });
      return;
    }

    await db
      .update(deepLinksTable)
      .set({ clickCount: sql`${deepLinksTable.clickCount} + 1` })
      .where(eq(deepLinksTable.id, link.id));

    const params = link.params as Record<string, string>;
    const queryParts = Object.entries(params).map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
    );
    const query = queryParts.length ? `?${queryParts.join("&")}` : "";

    const appScheme = `ajkmart://${link.targetScreen}${query}`;

    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>AJKMart - Redirecting...</title>
  <meta http-equiv="refresh" content="2;url=${appScheme}">
  <style>
    body { font-family: -apple-system, sans-serif; text-align: center; padding: 60px 20px; background: #f8fafc; }
    .card { max-width: 400px; margin: 0 auto; background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    h2 { color: #1e293b; margin-bottom: 8px; }
    p { color: #64748b; }
    .spinner { border: 3px solid #e2e8f0; border-top: 3px solid #6366F1; border-radius: 50%; width: 32px; height: 32px; animation: spin 1s linear infinite; margin: 20px auto; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    a { color: #6366F1; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2>Opening AJKMart...</h2>
    <p>You'll be redirected to the app automatically.</p>
    <p style="margin-top:16px"><a href="${appScheme}">Tap here if nothing happens</a></p>
  </div>
  <script>window.location.href = "${appScheme}";</script>
</body>
</html>`);
  } catch (_err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
