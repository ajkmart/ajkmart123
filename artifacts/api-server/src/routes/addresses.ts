import { db } from "@workspace/db";
import { savedAddressesTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { generateId } from "../lib/id.js";
import {
  sendCreated,
  sendError,
  sendForbidden,
  sendNotFound,
  sendSuccess,
  sendValidationError,
} from "../lib/response.js";
import { customerAuth } from "../middleware/security.js";
import { validateBody } from "../middleware/validate.js";

const router: IRouter = Router();

router.use(customerAuth);

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "").trim();

router.get("/", async (req, res) => {
  try {
    const userId = req.customerId!;
    const addresses = await db
      .select()
      .from(savedAddressesTable)
      .where(eq(savedAddressesTable.userId, userId))
      .orderBy(savedAddressesTable.createdAt);
    sendSuccess(res, {
      addresses: addresses.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

const createAddressSchema = z.object({
  label: z
    .string()
    .min(1, "Label is required")
    .max(100, "Label must be 100 characters or less")
    .transform(stripHtml),
  address: z
    .string()
    .min(1, "Address is required")
    .max(500, "Address must be 500 characters or less")
    .transform(stripHtml),
  city: z
    .string()
    .max(100, "City must be 100 characters or less")
    .optional()
    .transform((v) => (v ? stripHtml(v) : v)),
  icon: z.string().optional(),
  isDefault: z.boolean().optional(),
});

const updateAddressSchema = z.object({
  label: z.string().min(1).max(100).transform(stripHtml).optional(),
  address: z.string().min(1).max(500).transform(stripHtml).optional(),
  city: z
    .string()
    .max(100)
    .optional()
    .transform((v) => (v ? stripHtml(v) : v)),
  icon: z.string().optional(),
  isDefault: z.boolean().optional(),
});

router.post("/", validateBody(createAddressSchema), async (req, res) => {
  try {
    const userId = req.customerId!;
    const { label, address, city, icon, isDefault } = req.body;

    const existing = await db
      .select({ id: savedAddressesTable.id })
      .from(savedAddressesTable)
      .where(eq(savedAddressesTable.userId, userId));
    if (existing.length >= 5) {
      sendValidationError(res, "Maximum 5 addresses allowed", "زیادہ سے زیادہ 5 پتے مجاز ہیں۔");
      return;
    }

    const id = generateId();

    await db.transaction(async (tx) => {
      if (isDefault) {
        await tx
          .update(savedAddressesTable)
          .set({ isDefault: false })
          .where(eq(savedAddressesTable.userId, userId));
      }
      await tx.insert(savedAddressesTable).values({
        id,
        userId,
        label,
        address,
        city: city || null,
        icon: icon || "location-outline",
        isDefault: isDefault ?? false,
      });
    });

    const [addr] = await db
      .select()
      .from(savedAddressesTable)
      .where(eq(savedAddressesTable.id, id))
      .limit(1);
    sendCreated(res, { ...addr, createdAt: addr!.createdAt.toISOString() });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.put("/:id", validateBody(updateAddressSchema), async (req, res) => {
  try {
    const userId = req.customerId!;
    const { label, address, city, icon, isDefault } = req.body;
    const { id } = req.params as Record<string, string>;

    const [existing] = await db
      .select()
      .from(savedAddressesTable)
      .where(eq(savedAddressesTable.id, id!))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Address not found", "پتہ نہیں ملا۔");
      return;
    }
    if (existing.userId !== userId) {
      sendForbidden(res, "Access denied", "رسائی سے انکار۔");
      return;
    }

    /* Build the update payload only from fields that were explicitly provided in
       the request body — undefined values are omitted so Drizzle never writes
       null over an existing value for a field the caller did not touch. */
    const patch: Record<string, unknown> = {};
    if (label !== undefined) patch.label = label;
    if (address !== undefined) patch.address = address;
    if (city !== undefined) patch.city = city;
    if (icon !== undefined) patch.icon = icon;
    if (isDefault !== undefined) patch.isDefault = isDefault;

    await db.transaction(async (tx) => {
      if (isDefault) {
        await tx
          .update(savedAddressesTable)
          .set({ isDefault: false })
          .where(eq(savedAddressesTable.userId, userId));
      }
      await tx.update(savedAddressesTable).set(patch).where(eq(savedAddressesTable.id, id!));
    });

    sendSuccess(res, null);
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.patch("/:id/set-default", async (req, res) => {
  try {
    const userId = req.customerId!;
    const { id } = req.params as Record<string, string>;

    const [existing] = await db
      .select()
      .from(savedAddressesTable)
      .where(eq(savedAddressesTable.id, id!))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Address not found", "پتہ نہیں ملا۔");
      return;
    }
    if (existing.userId !== userId) {
      sendForbidden(res, "Access denied", "رسائی سے انکار۔");
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(savedAddressesTable)
        .set({ isDefault: false })
        .where(eq(savedAddressesTable.userId, userId));
      await tx
        .update(savedAddressesTable)
        .set({ isDefault: true })
        .where(and(eq(savedAddressesTable.id, id!), eq(savedAddressesTable.userId, userId)));
    });

    sendSuccess(res, null);
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const userId = req.customerId!;
    const addrId = req.params["id"] as string;

    const [existing] = await db
      .select()
      .from(savedAddressesTable)
      .where(eq(savedAddressesTable.id, addrId))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Address not found", "پتہ نہیں ملا۔");
      return;
    }
    if (existing.userId !== userId) {
      sendForbidden(res, "Access denied", "رسائی سے انکار۔");
      return;
    }

    await db.transaction(async (tx) => {
      await tx.delete(savedAddressesTable).where(eq(savedAddressesTable.id, addrId));

      /* If the deleted address was the default, promote the most recently
         created remaining address so there is always at most one default. */
      if (existing.isDefault) {
        const remaining = await tx
          .select({ id: savedAddressesTable.id })
          .from(savedAddressesTable)
          .where(eq(savedAddressesTable.userId, userId))
          .orderBy(savedAddressesTable.createdAt)
          .limit(1);
        if (remaining.length > 0) {
          await tx
            .update(savedAddressesTable)
            .set({ isDefault: true })
            .where(eq(savedAddressesTable.id, remaining[0]!.id));
        }
      }
    });

    sendSuccess(res, null);
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

export default router;
