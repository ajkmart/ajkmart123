import { db } from "@workspace/db";
import {
  adminAccountsTable,
  bannersTable,
  demoBackupsTable,
  flashDealsTable,
  liveLocationsTable,
  notificationsTable,
  ordersTable,
  parcelBookingsTable,
  pharmacyOrdersTable,
  platformSettingsTable,
  productsTable,
  promoCodesTable,
  reviewsTable,
  riderProfilesTable,
  ridesTable,
  savedAddressesTable,
  serviceZonesTable,
  systemSnapshotsTable,
  userSettingsTable,
  usersTable,
  vendorProfilesTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { count, eq, isNull, lt } from "drizzle-orm";
import { Router, type IRouter, type NextFunction } from "express";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { sendError, sendNotFound, sendSuccess } from "../lib/response.js";
import { invalidateSettingsCache } from "../middleware/security.js";
import { DEFAULT_PLATFORM_SETTINGS } from "./admin-shared.js";
import { adminAuth } from "./admin.js";

const DEMO_WALLET_BALANCE = "1000";
const UNDO_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

/* ── Table registry — maps snapshot key → drizzle table ref ── */
const TABLE_MAP: Record<string, any> = {
  users: usersTable,
  orders: ordersTable,
  rides: ridesTable,
  pharmacy_orders: pharmacyOrdersTable,
  parcel_bookings: parcelBookingsTable,
  products: productsTable,
  wallet_transactions: walletTransactionsTable,
  notifications: notificationsTable,
  reviews: reviewsTable,
  promo_codes: promoCodesTable,
  flash_deals: flashDealsTable,
  platform_settings: platformSettingsTable,
  saved_addresses: savedAddressesTable,
  user_settings: userSettingsTable,
  live_locations: liveLocationsTable,
  banners: bannersTable,
  vendor_profiles: vendorProfilesTable,
  rider_profiles: riderProfilesTable,
  service_zones: serviceZonesTable,
};

const router: IRouter = Router();

/* ── Admin auth guard — uses the same JWT/secret middleware as the rest of admin routes ── */
router.use(adminAuth);

/* ── Auto-purge expired snapshots on every request ── */
router.use(async (_req, _res, next) => {
  try {
    await db.delete(systemSnapshotsTable).where(lt(systemSnapshotsTable.expiresAt, new Date()));
  } catch (err) {
    logger.debug(
      { err: err instanceof Error ? err.message : String(err) },
      "[system] expired snapshot purge failed — non-fatal"
    );
  }
  next();
});

/* ─────────────────────────────────────────────────────────────────────────────
   SNAPSHOT HELPER — serializes specified table rows to a DB snapshot row
───────────────────────────────────────────────────────────────────────────── */
async function snapshotBefore(label: string, actionId: string, tableKeys: string[]) {
  const tables: Record<string, any[]> = {};
  for (const key of tableKeys) {
    const ref = TABLE_MAP[key];
    if (ref) tables[key] = await db.select().from(ref);
  }
  const id = generateId();
  const expiresAt = new Date(Date.now() + UNDO_WINDOW_MS);
  await db.insert(systemSnapshotsTable).values({
    id,
    label,
    actionId,
    tablesJson: JSON.stringify(tables),
    expiresAt,
  });
  return { snapshotId: id, expiresAt: expiresAt.toISOString() };
}

/* ─────────────────────────────────────────────────────────────────────────────
   RESTORE HELPER — restores rows from a tables map into the DB
───────────────────────────────────────────────────────────────────────────── */
const RESTORE_DELETE_ORDER = [
  "orders",
  "rides",
  "pharmacy_orders",
  "parcel_bookings",
  "wallet_transactions",
  "reviews",
  "notifications",
  "flash_deals",
  "promo_codes",
  "saved_addresses",
  "user_settings",
  "live_locations",
  "banners",
  "products",
  "vendor_profiles",
  "rider_profiles",
  "service_zones",
  "users",
];

const RESTORE_INSERT_ORDER = [
  "users",
  "vendor_profiles",
  "rider_profiles",
  "service_zones",
  "products",
  "banners",
  "promo_codes",
  "flash_deals",
  "saved_addresses",
  "user_settings",
  "live_locations",
  "orders",
  "rides",
  "pharmacy_orders",
  "parcel_bookings",
  "wallet_transactions",
  "reviews",
  "notifications",
];

async function restoreTables(tables: Record<string, any[]>) {
  const restored: Record<string, number> = {};
  const errors: string[] = [];

  const keys = Object.keys(tables);
  const deleteOrder = RESTORE_DELETE_ORDER.filter((k) => keys.includes(k));
  for (const extra of keys) {
    if (!deleteOrder.includes(extra)) deleteOrder.push(extra);
  }
  for (const key of deleteOrder) {
    const ref = TABLE_MAP[key];
    if (!ref) continue;
    try {
      await db.delete(ref);
    } catch (e: unknown) {
      errors.push(`delete ${key}: ${(e as Error).message}`);
    }
  }

  const insertOrder = RESTORE_INSERT_ORDER.filter((k) => keys.includes(k));
  for (const extra of keys) {
    if (!insertOrder.includes(extra)) insertOrder.push(extra);
  }
  for (const key of insertOrder) {
    const ref = TABLE_MAP[key];
    const rows = tables[key];
    if (!ref || !Array.isArray(rows) || rows.length === 0) {
      restored[key] = 0;
      continue;
    }
    const cleaned = rows.map((r: Record<string, unknown>) => {
      const out: Record<string, unknown> = { ...r };
      if (out.createdAt) out.createdAt = new Date(out.createdAt as string);
      if (out.updatedAt) out.updatedAt = new Date(out.updatedAt as string);
      if (out.expiresAt) out.expiresAt = new Date(out.expiresAt as string);
      if (out.scheduledFor) out.scheduledFor = new Date(out.scheduledFor as string);
      return out;
    });
    let insertedCount = 0;
    for (const row of cleaned) {
      try {
        await db.insert(ref).values(row);
        insertedCount++;
      } catch (e: unknown) {
        errors.push(`insert ${key}: ${(e as Error).message}`);
      }
    }
    restored[key] = insertedCount;
  }
  return { restored, errors };
}

/* ─────────────────────────────────────────────────────────────────────────────
   DEMO PRODUCT DATA
───────────────────────────────────────────────────────────────────────────── */
interface DemoProduct {
  name: string;
  price: number;
  originalPrice: number | null;
  category: string;
  unit: string;
  inStock: boolean;
  description: string;
  vendorId: string;
  vendorName: string;
  deliveryTime?: string;
  rating?: number;
}

const MART_PRODUCTS: DemoProduct[] = [
  {
    name: "Basmati Rice 5kg",
    price: 980,
    originalPrice: 1200,
    category: "fruits",
    unit: "5kg bag",
    inStock: true,
    description: "Premium long-grain basmati rice",
    vendorId: "demo_vend_2",
    vendorName: "AJK Mart Store",
  },
  {
    name: "Doodh (Fresh Milk) 1L",
    price: 140,
    originalPrice: null,
    category: "dairy",
    unit: "1 litre",
    inStock: true,
    description: "Fresh pasteurized milk",
    vendorId: "demo_vend_2",
    vendorName: "AJK Mart Store",
  },
  {
    name: "Anday (Eggs) 12pc",
    price: 320,
    originalPrice: 350,
    category: "dairy",
    unit: "12 pieces",
    inStock: true,
    description: "Farm fresh eggs",
    vendorId: "demo_vend_2",
    vendorName: "AJK Mart Store",
  },
  {
    name: "Aata (Wheat Flour) 10kg",
    price: 1100,
    originalPrice: 1350,
    category: "bakery",
    unit: "10kg bag",
    inStock: true,
    description: "Chakki fresh atta",
    vendorId: "demo_vend_6",
    vendorName: "Mirpur General Store",
  },
  {
    name: "Desi Ghee 1kg",
    price: 1800,
    originalPrice: 2100,
    category: "dairy",
    unit: "1kg tin",
    inStock: true,
    description: "Pure desi ghee",
    vendorId: "demo_vend_2",
    vendorName: "AJK Mart Store",
  },
  {
    name: "Cooking Oil 5L",
    price: 1650,
    originalPrice: 1900,
    category: "household",
    unit: "5 litre",
    inStock: true,
    description: "Refined sunflower oil",
    vendorId: "demo_vend_6",
    vendorName: "Mirpur General Store",
  },
  {
    name: "Pyaz (Onion) 1kg",
    price: 80,
    originalPrice: 100,
    category: "fruits",
    unit: "1kg",
    inStock: true,
    description: "Fresh onions",
    vendorId: "demo_vend_2",
    vendorName: "AJK Mart Store",
  },
  {
    name: "Tamatar (Tomato) 1kg",
    price: 120,
    originalPrice: 150,
    category: "fruits",
    unit: "1kg",
    inStock: true,
    description: "Fresh red tomatoes",
    vendorId: "demo_vend_2",
    vendorName: "AJK Mart Store",
  },
  {
    name: "Aaloo (Potato) 5kg",
    price: 350,
    originalPrice: 400,
    category: "fruits",
    unit: "5kg bag",
    inStock: true,
    description: "Fresh potatoes",
    vendorId: "demo_vend_6",
    vendorName: "Mirpur General Store",
  },
  {
    name: "Zeera (Cumin) 100g",
    price: 180,
    originalPrice: 220,
    category: "spices",
    unit: "100g",
    inStock: true,
    description: "Whole cumin seeds",
    vendorId: "demo_vend_2",
    vendorName: "AJK Mart Store",
  },
  {
    name: "Haldi (Turmeric) 200g",
    price: 120,
    originalPrice: 150,
    category: "spices",
    unit: "200g",
    inStock: true,
    description: "Pure turmeric powder",
    vendorId: "demo_vend_6",
    vendorName: "Mirpur General Store",
  },
  {
    name: "Dahi (Yogurt) 500g",
    price: 130,
    originalPrice: null,
    category: "dairy",
    unit: "500g",
    inStock: true,
    description: "Fresh plain yogurt",
    vendorId: "demo_vend_2",
    vendorName: "AJK Mart Store",
  },
  {
    name: "Murgh (Chicken) 1kg",
    price: 520,
    originalPrice: 600,
    category: "meat",
    unit: "1kg",
    inStock: true,
    description: "Fresh broiler chicken",
    vendorId: "demo_vend_2",
    vendorName: "AJK Mart Store",
  },
  {
    name: "Gosht (Beef) 1kg",
    price: 1100,
    originalPrice: 1250,
    category: "meat",
    unit: "1kg",
    inStock: true,
    description: "Fresh beef",
    vendorId: "demo_vend_6",
    vendorName: "Mirpur General Store",
  },
  {
    name: "Ketchup Sauce 500g",
    price: 180,
    originalPrice: 220,
    category: "packaged",
    unit: "500g",
    inStock: true,
    description: "Tomato ketchup",
    vendorId: "demo_vend_2",
    vendorName: "AJK Mart Store",
  },
  {
    name: "Surf Excel 1kg",
    price: 280,
    originalPrice: 320,
    category: "household",
    unit: "1kg",
    inStock: true,
    description: "Washing powder",
    vendorId: "demo_vend_6",
    vendorName: "Mirpur General Store",
  },
  {
    name: "Soap Lifebuoy 6pc",
    price: 280,
    originalPrice: null,
    category: "household",
    unit: "6 bars",
    inStock: true,
    description: "Antibacterial soap",
    vendorId: "demo_vend_2",
    vendorName: "AJK Mart Store",
  },
  {
    name: "Tea Tapal 450g",
    price: 360,
    originalPrice: 420,
    category: "beverages",
    unit: "450g",
    inStock: true,
    description: "Premium tea dust",
    vendorId: "demo_vend_6",
    vendorName: "Mirpur General Store",
  },
  {
    name: "Pepsi 1.5L",
    price: 150,
    originalPrice: null,
    category: "beverages",
    unit: "1.5 litre",
    inStock: true,
    description: "Cold drink",
    vendorId: "demo_vend_2",
    vendorName: "AJK Mart Store",
  },
  {
    name: "Biscuits Parle-G 800g",
    price: 220,
    originalPrice: 260,
    category: "packaged",
    unit: "800g",
    inStock: true,
    description: "Glucose biscuits",
    vendorId: "demo_vend_6",
    vendorName: "Mirpur General Store",
  },
  {
    name: "Bread Bran 400g",
    price: 90,
    originalPrice: null,
    category: "bakery",
    unit: "400g loaf",
    inStock: true,
    description: "Fresh bran bread",
    vendorId: "demo_vend_2",
    vendorName: "AJK Mart Store",
  },
  {
    name: "Shampoo Head&Shoulders",
    price: 380,
    originalPrice: 450,
    category: "household",
    unit: "200ml",
    inStock: true,
    description: "Anti-dandruff shampoo",
    vendorId: "demo_vend_6",
    vendorName: "Mirpur General Store",
  },
  {
    name: "Lemon 1kg",
    price: 160,
    originalPrice: 200,
    category: "fruits",
    unit: "1kg",
    inStock: true,
    description: "Fresh lemons",
    vendorId: "demo_vend_2",
    vendorName: "AJK Mart Store",
  },
  {
    name: "Palak (Spinach) 500g",
    price: 60,
    originalPrice: null,
    category: "fruits",
    unit: "500g",
    inStock: true,
    description: "Fresh spinach",
    vendorId: "demo_vend_6",
    vendorName: "Mirpur General Store",
  },
  {
    name: "Sugar 1kg",
    price: 130,
    originalPrice: 155,
    category: "bakery",
    unit: "1kg",
    inStock: true,
    description: "Refined white sugar",
    vendorId: "demo_vend_2",
    vendorName: "AJK Mart Store",
  },
  {
    name: "Mirch Powder 200g",
    price: 95,
    originalPrice: 120,
    category: "spices",
    unit: "200g",
    inStock: true,
    description: "Red chilli powder",
    vendorId: "demo_vend_6",
    vendorName: "Mirpur General Store",
  },
  {
    name: "Garam Masala 100g",
    price: 110,
    originalPrice: 140,
    category: "spices",
    unit: "100g",
    inStock: true,
    description: "Aromatic spice blend",
    vendorId: "demo_vend_2",
    vendorName: "AJK Mart Store",
  },
  {
    name: "Makhan (Butter) 200g",
    price: 280,
    originalPrice: 320,
    category: "dairy",
    unit: "200g",
    inStock: true,
    description: "Salted butter",
    vendorId: "demo_vend_6",
    vendorName: "Mirpur General Store",
  },
  {
    name: "Cheese Slices 10pc",
    price: 350,
    originalPrice: null,
    category: "dairy",
    unit: "10 slices",
    inStock: true,
    description: "Processed cheese slices",
    vendorId: "demo_vend_2",
    vendorName: "AJK Mart Store",
  },
  {
    name: "Sabz Mirch 250g",
    price: 45,
    originalPrice: null,
    category: "fruits",
    unit: "250g",
    inStock: true,
    description: "Fresh green chillies",
    vendorId: "demo_vend_6",
    vendorName: "Mirpur General Store",
  },
  {
    name: "Adrak Lehsun Paste",
    price: 95,
    originalPrice: null,
    category: "fruits",
    unit: "200g jar",
    inStock: true,
    description: "Ginger garlic paste",
    vendorId: "demo_vend_2",
    vendorName: "AJK Mart Store",
  },
  {
    name: "Machhi (Fish) 500g",
    price: 380,
    originalPrice: null,
    category: "meat",
    unit: "500g",
    inStock: true,
    description: "Fresh river fish",
    vendorId: "demo_vend_6",
    vendorName: "Mirpur General Store",
  },
  {
    name: "Tissue Box 200 pulls",
    price: 120,
    originalPrice: 150,
    category: "household",
    unit: "1 box",
    inStock: true,
    description: "Soft tissue box",
    vendorId: "demo_vend_2",
    vendorName: "AJK Mart Store",
  },
  {
    name: "Toothpaste Colgate 150g",
    price: 195,
    originalPrice: 230,
    category: "household",
    unit: "150g",
    inStock: true,
    description: "Cavity protection toothpaste",
    vendorId: "demo_vend_6",
    vendorName: "Mirpur General Store",
  },
];

const FOOD_PRODUCTS: DemoProduct[] = [
  {
    name: "Biryani (Full)",
    price: 850,
    originalPrice: 1000,
    category: "biryani",
    unit: "serves 4",
    inStock: true,
    description: "Aromatic basmati biryani",
    vendorId: "demo_vend_1",
    vendorName: "Biryani House AJK",
    deliveryTime: "30-40 min",
    rating: 4.8,
  },
  {
    name: "Chicken Karahi",
    price: 750,
    originalPrice: 900,
    category: "desi",
    unit: "serves 3-4",
    inStock: true,
    description: "Spicy chicken karahi",
    vendorId: "demo_vend_5",
    vendorName: "Desi Dhaba Chattar",
    deliveryTime: "25-35 min",
    rating: 4.7,
  },
  {
    name: "Seekh Kebab Plate",
    price: 350,
    originalPrice: 450,
    category: "bbq",
    unit: "6 pieces",
    inStock: true,
    description: "Juicy seekh kebabs with naan",
    vendorId: "demo_vend_3",
    vendorName: "Mirpur Fast Food",
    deliveryTime: "20-30 min",
    rating: 4.6,
  },
  {
    name: "Pizza (Large)",
    price: 1200,
    originalPrice: 1450,
    category: "pizza",
    unit: "12 inch",
    inStock: true,
    description: "Loaded cheese pizza",
    vendorId: "demo_vend_3",
    vendorName: "Mirpur Fast Food",
    deliveryTime: "30-45 min",
    rating: 4.5,
  },
  {
    name: "Burger Meal",
    price: 480,
    originalPrice: 600,
    category: "burger",
    unit: "meal + fries",
    inStock: true,
    description: "Crispy chicken burger with fries",
    vendorId: "demo_vend_3",
    vendorName: "Mirpur Fast Food",
    deliveryTime: "20-25 min",
    rating: 4.4,
  },
  {
    name: "Chowmein Noodles",
    price: 280,
    originalPrice: null,
    category: "chinese",
    unit: "1 plate",
    inStock: true,
    description: "Stir-fried noodles with veggies",
    vendorId: "demo_vend_3",
    vendorName: "Mirpur Fast Food",
    deliveryTime: "15-25 min",
    rating: 4.3,
  },
  {
    name: "Paratha (4pcs)",
    price: 140,
    originalPrice: null,
    category: "breakfast",
    unit: "4 pieces",
    inStock: true,
    description: "Crispy aloo paratha with achar",
    vendorId: "demo_vend_5",
    vendorName: "Desi Dhaba Chattar",
    deliveryTime: "15-20 min",
    rating: 4.5,
  },
  {
    name: "Halwa Puri",
    price: 220,
    originalPrice: 280,
    category: "breakfast",
    unit: "1 plate",
    inStock: true,
    description: "Traditional halwa puri breakfast",
    vendorId: "demo_vend_5",
    vendorName: "Desi Dhaba Chattar",
    deliveryTime: "20-30 min",
    rating: 4.7,
  },
  {
    name: "Daal Makhani",
    price: 320,
    originalPrice: 400,
    category: "desi",
    unit: "serves 2",
    inStock: true,
    description: "Slow-cooked black lentils",
    vendorId: "demo_vend_5",
    vendorName: "Desi Dhaba Chattar",
    deliveryTime: "25-30 min",
    rating: 4.6,
  },
  {
    name: "Nihari",
    price: 650,
    originalPrice: 800,
    category: "desi",
    unit: "serves 2",
    inStock: true,
    description: "Slow-cooked beef nihari",
    vendorId: "demo_vend_1",
    vendorName: "Biryani House AJK",
    deliveryTime: "30-40 min",
    rating: 4.9,
  },
  {
    name: "Zinger Burger",
    price: 380,
    originalPrice: 450,
    category: "burger",
    unit: "1 burger",
    inStock: true,
    description: "Spicy zinger burger",
    vendorId: "demo_vend_3",
    vendorName: "Mirpur Fast Food",
    deliveryTime: "20-25 min",
    rating: 4.4,
  },
  {
    name: "Fruit Chaat",
    price: 180,
    originalPrice: null,
    category: "snacks",
    unit: "1 bowl",
    inStock: true,
    description: "Fresh fruit chaat with masala",
    vendorId: "demo_vend_5",
    vendorName: "Desi Dhaba Chattar",
    deliveryTime: "10-15 min",
    rating: 4.3,
  },
  {
    name: "Lassi (Meethi)",
    price: 120,
    originalPrice: 150,
    category: "beverages",
    unit: "400ml",
    inStock: true,
    description: "Sweet mango lassi",
    vendorId: "demo_vend_1",
    vendorName: "Biryani House AJK",
    deliveryTime: "10-15 min",
    rating: 4.5,
  },
  {
    name: "Mutton Pulao",
    price: 750,
    originalPrice: 900,
    category: "biryani",
    unit: "serves 3",
    inStock: true,
    description: "Tender mutton pulao with raita",
    vendorId: "demo_vend_1",
    vendorName: "Biryani House AJK",
    deliveryTime: "35-45 min",
    rating: 4.7,
  },
  {
    name: "Chicken Wings 8pc",
    price: 420,
    originalPrice: 520,
    category: "bbq",
    unit: "8 pieces",
    inStock: true,
    description: "Crispy fried chicken wings",
    vendorId: "demo_vend_3",
    vendorName: "Mirpur Fast Food",
    deliveryTime: "20-30 min",
    rating: 4.5,
  },
  {
    name: "Peshawari Chapli Kebab",
    price: 400,
    originalPrice: null,
    category: "bbq",
    unit: "4 pieces",
    inStock: true,
    description: "Authentic Peshawari chapli kebab",
    vendorId: "demo_vend_5",
    vendorName: "Desi Dhaba Chattar",
    deliveryTime: "25-35 min",
    rating: 4.6,
  },
  {
    name: "Tandoori Roti 5pc",
    price: 100,
    originalPrice: null,
    category: "desi",
    unit: "5 pieces",
    inStock: true,
    description: "Fresh tandoori roti from clay oven",
    vendorId: "demo_vend_1",
    vendorName: "Biryani House AJK",
    deliveryTime: "15-20 min",
    rating: 4.4,
  },
  {
    name: "Shawarma Roll",
    price: 250,
    originalPrice: 300,
    category: "snacks",
    unit: "1 roll",
    inStock: true,
    description: "Chicken shawarma with garlic sauce",
    vendorId: "demo_vend_3",
    vendorName: "Mirpur Fast Food",
    deliveryTime: "15-20 min",
    rating: 4.5,
  },
  {
    name: "Chai (Kashmiri)",
    price: 80,
    originalPrice: null,
    category: "beverages",
    unit: "1 cup",
    inStock: true,
    description: "Pink Kashmiri chai with nuts",
    vendorId: "demo_vend_5",
    vendorName: "Desi Dhaba Chattar",
    deliveryTime: "10-15 min",
    rating: 4.8,
  },
  {
    name: "Samosa Plate 6pc",
    price: 150,
    originalPrice: 180,
    category: "snacks",
    unit: "6 pieces",
    inStock: true,
    description: "Crispy aloo samosa with chutney",
    vendorId: "demo_vend_1",
    vendorName: "Biryani House AJK",
    deliveryTime: "10-15 min",
    rating: 4.3,
  },
];

async function ensureProductVendors(): Promise<void> {
  const requiredVendors = [...new Set([...MART_PRODUCTS, ...FOOD_PRODUCTS].map((p) => p.vendorId))];
  const existing = await db.select({ id: usersTable.id }).from(usersTable);
  const existingIds = new Set(existing.map((u) => u.id));
  for (const vid of requiredVendors) {
    if (!existingIds.has(vid)) {
      const product = [...MART_PRODUCTS, ...FOOD_PRODUCTS].find((p) => p.vendorId === vid);
      await db.insert(usersTable).values({
        id: vid,
        phone: `+9200000${vid.replace(/\D/g, "").slice(0, 5).padEnd(5, "0")}`,
        name: product?.vendorName || vid,
        roles: "vendor",
        city: "Muzaffarabad",
        area: "System",
        phoneVerified: true,
        approvalStatus: "approved",
        isActive: true,
        walletBalance: "0",
      });
    }
  }
}

async function reseedProducts(): Promise<{ mart: number; food: number }> {
  await db.delete(productsTable);
  await ensureProductVendors();
  let mart = 0,
    food = 0;
  for (const p of MART_PRODUCTS) {
    await db.insert(productsTable).values({
      id: generateId(),
      name: p.name,
      description: p.description,
      price: p.price.toString(),
      originalPrice: p.originalPrice ? p.originalPrice.toString() : null,
      category: p.category,
      type: "mart",
      vendorId: p.vendorId,
      vendorName: p.vendorName,
      unit: p.unit,
      inStock: p.inStock,
      rating: (3.8 + Math.random() * 1.1).toFixed(1),
      reviewCount: Math.floor(Math.random() * 200) + 10,
    });
    mart++;
  }
  for (const p of FOOD_PRODUCTS) {
    await db.insert(productsTable).values({
      id: generateId(),
      name: p.name,
      description: p.description,
      price: p.price.toString(),
      originalPrice: p.originalPrice ? p.originalPrice.toString() : null,
      category: p.category,
      type: "food",
      vendorId: p.vendorId,
      vendorName: p.vendorName,
      unit: p.unit,
      inStock: p.inStock,
      rating: (p.rating || 4.5).toString(),
      reviewCount: Math.floor(Math.random() * 500) + 50,
      deliveryTime: p.deliveryTime || "25-35 min",
    });
    food++;
  }
  return { mart, food };
}

/* ═══════════════════════════════════════════════════════════════════════════
   READ ENDPOINTS
═══════════════════════════════════════════════════════════════════════════ */

/* GET /admin/system/stats */
router.get("/stats", async (_req, res, next: NextFunction) => {
  try {
    const [users] = await db.select({ c: count() }).from(usersTable);
    const [orders] = await db.select({ c: count() }).from(ordersTable);
    const [rides] = await db.select({ c: count() }).from(ridesTable);
    const [pharmacy] = await db.select({ c: count() }).from(pharmacyOrdersTable);
    const [parcel] = await db.select({ c: count() }).from(parcelBookingsTable);
    const [products] = await db.select({ c: count() }).from(productsTable);
    const [walletTx] = await db.select({ c: count() }).from(walletTransactionsTable);
    const [notifications] = await db.select({ c: count() }).from(notificationsTable);
    const [reviews] = await db.select({ c: count() }).from(reviewsTable);
    const [promos] = await db.select({ c: count() }).from(promoCodesTable);
    const [flashDeals] = await db.select({ c: count() }).from(flashDealsTable);
    const [adminAccounts] = await db.select({ c: count() }).from(adminAccountsTable);
    const [settings] = await db.select({ c: count() }).from(platformSettingsTable);
    const [savedAddr] = await db.select({ c: count() }).from(savedAddressesTable);
    const [banners] = await db.select({ c: count() }).from(bannersTable);
    const [vendorProfiles] = await db.select({ c: count() }).from(vendorProfilesTable);
    const [riderProfiles] = await db.select({ c: count() }).from(riderProfilesTable);
    const [serviceZones] = await db.select({ c: count() }).from(serviceZonesTable);

    res.json({
      stats: {
        users: Number(users?.c ?? 0),
        orders: Number(orders?.c ?? 0),
        rides: Number(rides?.c ?? 0),
        pharmacy: Number(pharmacy?.c ?? 0),
        parcel: Number(parcel?.c ?? 0),
        products: Number(products?.c ?? 0),
        walletTx: Number(walletTx?.c ?? 0),
        notifications: Number(notifications?.c ?? 0),
        reviews: Number(reviews?.c ?? 0),
        promos: Number(promos?.c ?? 0),
        flashDeals: Number(flashDeals?.c ?? 0),
        banners: Number(banners?.c ?? 0),
        vendorProfiles: Number(vendorProfiles?.c ?? 0),
        riderProfiles: Number(riderProfiles?.c ?? 0),
        serviceZones: Number(serviceZones?.c ?? 0),
        adminAccounts: Number(adminAccounts?.c ?? 0),
        settings: Number(settings?.c ?? 0),
        savedAddresses: Number(savedAddr?.c ?? 0),
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

/* GET /admin/system/snapshots — list active (non-expired) snapshots */
router.get("/snapshots", async (_req, res, next: NextFunction) => {
  try {
    const rows = await db
      .select({
        id: systemSnapshotsTable.id,
        label: systemSnapshotsTable.label,
        actionId: systemSnapshotsTable.actionId,
        createdAt: systemSnapshotsTable.createdAt,
        expiresAt: systemSnapshotsTable.expiresAt,
      })
      .from(systemSnapshotsTable);

    res.json({
      snapshots: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   ACTION ENDPOINTS — each snapshots first, then executes
═══════════════════════════════════════════════════════════════════════════ */

/* POST /admin/system/reset-demo */
router.post("/reset-demo", async (_req, res, next: NextFunction) => {
  try {
    const snap = await snapshotBefore("Reset Demo Content", "reset-demo", [
      "orders",
      "rides",
      "pharmacy_orders",
      "parcel_bookings",
      "wallet_transactions",
      "reviews",
      "notifications",
      "flash_deals",
      "products",
      "users",
    ]);

    await db
      .update(ordersTable)
      .set({ deletedAt: new Date() })
      .where(isNull(ordersTable.deletedAt));
    await db.delete(ridesTable);
    await db.delete(pharmacyOrdersTable);
    await db.delete(parcelBookingsTable);
    await db.delete(walletTransactionsTable);
    await db.delete(reviewsTable);
    await db.delete(notificationsTable);
    await db.delete(liveLocationsTable);
    await db.delete(flashDealsTable);
    await db.update(usersTable).set({ walletBalance: DEMO_WALLET_BALANCE });
    const { mart, food } = await reseedProducts();

    res.json({
      success: true,
      message: "Demo content reset. Transactional data cleared, products reseeded.",
      reseeded: { mart_products: mart, food_products: food },
      walletReset: `All wallets reset to Rs. ${DEMO_WALLET_BALANCE}`,
      ...snap,
    });
  } catch (err) {
    next(err);
  }
});

/* POST /admin/system/reset-transactional */
router.post("/reset-transactional", async (_req, res, next: NextFunction) => {
  try {
    const snap = await snapshotBefore("Clear Transactional Data", "reset-transactional", [
      "orders",
      "rides",
      "pharmacy_orders",
      "parcel_bookings",
      "wallet_transactions",
      "reviews",
      "notifications",
      "flash_deals",
    ]);

    await db
      .update(ordersTable)
      .set({ deletedAt: new Date() })
      .where(isNull(ordersTable.deletedAt));
    await db.delete(ridesTable);
    await db.delete(pharmacyOrdersTable);
    await db.delete(parcelBookingsTable);
    await db.delete(walletTransactionsTable);
    await db.delete(reviewsTable);
    await db.delete(notificationsTable);
    await db.delete(liveLocationsTable);
    await db.delete(flashDealsTable);

    res.json({
      success: true,
      message: "All transactional data cleared. Users, products and settings preserved.",
      ...snap,
    });
  } catch (err) {
    next(err);
  }
});

/* POST /admin/system/reset-products */
router.post("/reset-products", async (_req, res, next: NextFunction) => {
  try {
    const snap = await snapshotBefore("Reseed Products", "reset-products", ["products"]);
    const { mart, food } = await reseedProducts();
    res.json({
      success: true,
      message: `Products reseeded: ${mart} mart + ${food} food items.`,
      seeded: { mart, food },
      ...snap,
    });
  } catch (err) {
    next(err);
  }
});

/* POST /admin/system/reset-all */
router.post("/reset-all", async (_req, res, next: NextFunction) => {
  try {
    const snap = await snapshotBefore("Full Database Reset", "reset-all", [
      "users",
      "orders",
      "rides",
      "pharmacy_orders",
      "parcel_bookings",
      "wallet_transactions",
      "reviews",
      "notifications",
      "flash_deals",
      "promo_codes",
      "saved_addresses",
      "user_settings",
      "products",
    ]);

    await db
      .update(ordersTable)
      .set({ deletedAt: new Date() })
      .where(isNull(ordersTable.deletedAt));
    await db.delete(ridesTable);
    await db.delete(pharmacyOrdersTable);
    await db.delete(parcelBookingsTable);
    await db.delete(walletTransactionsTable);
    await db.delete(reviewsTable);
    await db.delete(notificationsTable);
    await db.delete(liveLocationsTable);
    await db.delete(flashDealsTable);
    await db.delete(promoCodesTable);
    await db.delete(savedAddressesTable);
    await db.delete(userSettingsTable);
    await db.update(usersTable).set({ deletedAt: new Date() }).where(isNull(usersTable.deletedAt));
    const { mart, food } = await reseedProducts();

    res.json({
      success: true,
      message: "Full database reset complete. Platform settings and admin accounts preserved.",
      preserved: ["platform_settings", "admin_accounts"],
      reseeded: { mart_products: mart, food_products: food },
      ...snap,
    });
  } catch (err) {
    next(err);
  }
});

/* POST /admin/system/reset-settings */
router.post("/reset-settings", async (_req, res, next: NextFunction) => {
  try {
    const snap = await snapshotBefore("Reset Platform Settings", "reset-settings", [
      "platform_settings",
    ]);
    await db.delete(platformSettingsTable);
    invalidateSettingsCache();
    res.json({
      success: true,
      message:
        "All platform settings deleted. Settings will be reseeded to defaults on next admin panel visit.",
      ...snap,
    });
  } catch (err) {
    next(err);
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   REMOVE ALL — complete data wipe (preserves admin_accounts + platform_settings)
═══════════════════════════════════════════════════════════════════════════ */

const REMOVABLE_TABLES = [
  "orders",
  "rides",
  "pharmacy_orders",
  "parcel_bookings",
  "wallet_transactions",
  "reviews",
  "notifications",
  "flash_deals",
  "promo_codes",
  "saved_addresses",
  "user_settings",
  "products",
  "banners",
  "vendor_profiles",
  "rider_profiles",
  "service_zones",
  "live_locations",
  "users",
];

router.post("/remove-all", async (_req, res, _next: NextFunction) => {
  try {
    const snap = await snapshotBefore("Remove All Data", "remove-all", REMOVABLE_TABLES);

    await db.transaction(async (tx) => {
      await tx
        .update(ordersTable)
        .set({ deletedAt: new Date() })
        .where(isNull(ordersTable.deletedAt));
      await tx.delete(ridesTable);
      await tx.delete(pharmacyOrdersTable);
      await tx.delete(parcelBookingsTable);
      await tx.delete(walletTransactionsTable);
      await tx.delete(reviewsTable);
      await tx.delete(notificationsTable);
      await tx.delete(liveLocationsTable);
      await tx.delete(flashDealsTable);
      await tx.delete(promoCodesTable);
      await tx.delete(savedAddressesTable);
      await tx.delete(userSettingsTable);
      await tx.delete(bannersTable);
      await tx.delete(productsTable);
      await tx.delete(vendorProfilesTable);
      await tx.delete(riderProfilesTable);
      await tx.delete(serviceZonesTable);
      await tx
        .update(usersTable)
        .set({ deletedAt: new Date() })
        .where(isNull(usersTable.deletedAt));
    });

    res.json({
      success: true,
      message: "All data removed. Admin accounts and platform settings preserved.",
      preserved: ["admin_accounts", "platform_settings"],
      ...snap,
    });
  } catch (e: unknown) {
    sendError(res, `Remove all failed: ${(e as Error).message}`, 500);
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   SEED DEMO — comprehensive AJK-themed demo data
═══════════════════════════════════════════════════════════════════════════ */

interface DemoUser {
  id: string;
  phone: string;
  name: string;
  role: string;
  roles: string;
  city: string;
  area: string;
  isOnline?: boolean;
}

const DEMO_USERS: DemoUser[] = [
  {
    id: "demo_cust_1",
    phone: "+923001234001",
    name: "Ahmed Khan",
    role: "customer",
    roles: "customer",
    city: "Muzaffarabad",
    area: "Upper Adda",
  },
  {
    id: "demo_cust_2",
    phone: "+923001234002",
    name: "Fatima Bibi",
    role: "customer",
    roles: "customer",
    city: "Muzaffarabad",
    area: "CMH Road",
  },
  {
    id: "demo_cust_3",
    phone: "+923001234003",
    name: "Usman Ali",
    role: "customer",
    roles: "customer",
    city: "Mirpur",
    area: "Allama Iqbal Road",
  },
  {
    id: "demo_cust_4",
    phone: "+923001234004",
    name: "Ayesha Tariq",
    role: "customer",
    roles: "customer",
    city: "Rawalakot",
    area: "Main Bazaar",
  },
  {
    id: "demo_cust_5",
    phone: "+923001234005",
    name: "Bilal Hussain",
    role: "customer",
    roles: "customer",
    city: "Muzaffarabad",
    area: "Chattar",
  },
  {
    id: "demo_cust_6",
    phone: "+923001234006",
    name: "Zainab Malik",
    role: "customer",
    roles: "customer",
    city: "Mirpur",
    area: "Sector F2",
  },
  {
    id: "demo_cust_7",
    phone: "+923001234007",
    name: "Hamza Qureshi",
    role: "customer",
    roles: "customer",
    city: "Muzaffarabad",
    area: "Domel",
  },
  {
    id: "demo_cust_8",
    phone: "+923001234008",
    name: "Sana Noor",
    role: "customer",
    roles: "customer",
    city: "Rawalakot",
    area: "Hajira Road",
  },
  {
    id: "demo_rider_1",
    phone: "+923001234011",
    name: "Imran Siddiqui",
    role: "rider",
    roles: "rider",
    city: "Muzaffarabad",
    area: "Upper Adda",
    isOnline: true,
  },
  {
    id: "demo_rider_2",
    phone: "+923001234012",
    name: "Tariq Mehmood",
    role: "rider",
    roles: "rider",
    city: "Muzaffarabad",
    area: "Chattar",
    isOnline: true,
  },
  {
    id: "demo_rider_3",
    phone: "+923001234013",
    name: "Adeel Shah",
    role: "rider",
    roles: "rider",
    city: "Mirpur",
    area: "Allama Iqbal Road",
    isOnline: true,
  },
  {
    id: "demo_rider_4",
    phone: "+923001234014",
    name: "Naveed Akhtar",
    role: "rider",
    roles: "rider",
    city: "Rawalakot",
    area: "Main Bazaar",
    isOnline: false,
  },
  {
    id: "demo_rider_5",
    phone: "+923001234015",
    name: "Waqas Butt",
    role: "rider",
    roles: "rider",
    city: "Muzaffarabad",
    area: "Domel",
    isOnline: true,
  },
  {
    id: "demo_rider_6",
    phone: "+923001234016",
    name: "Faisal Javed",
    role: "rider",
    roles: "rider",
    city: "Mirpur",
    area: "Sector F2",
    isOnline: false,
  },
  {
    id: "demo_rider_7",
    phone: "+923001234017",
    name: "Kamran Yousaf",
    role: "rider",
    roles: "rider",
    city: "Muzaffarabad",
    area: "Ghari Dupatta",
    isOnline: true,
  },
  {
    id: "demo_rider_8",
    phone: "+923001234018",
    name: "Shahid Afridi",
    role: "rider",
    roles: "rider",
    city: "Rawalakot",
    area: "Hajira Road",
    isOnline: false,
  },
  {
    id: "demo_vend_1",
    phone: "+923001234021",
    name: "Hassan Raza",
    role: "vendor",
    roles: "vendor",
    city: "Muzaffarabad",
    area: "Upper Adda",
  },
  {
    id: "demo_vend_2",
    phone: "+923001234022",
    name: "Kashif Mehmood",
    role: "vendor",
    roles: "vendor",
    city: "Muzaffarabad",
    area: "CMH Road",
  },
  {
    id: "demo_vend_3",
    phone: "+923001234023",
    name: "Rizwan Ahmed",
    role: "vendor",
    roles: "vendor",
    city: "Mirpur",
    area: "Allama Iqbal Road",
  },
  {
    id: "demo_vend_4",
    phone: "+923001234024",
    name: "Sajid Iqbal",
    role: "vendor",
    roles: "vendor",
    city: "Rawalakot",
    area: "Main Bazaar",
  },
  {
    id: "demo_vend_5",
    phone: "+923001234025",
    name: "Nasir Khan",
    role: "vendor",
    roles: "vendor",
    city: "Muzaffarabad",
    area: "Chattar",
  },
  {
    id: "demo_vend_6",
    phone: "+923001234026",
    name: "Amjad Hussain",
    role: "vendor",
    roles: "vendor,rider",
    city: "Mirpur",
    area: "Sector F2",
  },
];

const DEMO_VENDOR_PROFILES = [
  {
    userId: "demo_vend_1",
    storeName: "Biryani House AJK",
    storeCategory: "restaurant",
    storeDescription: "Best biryani in Muzaffarabad since 2010",
    storeHours: "10:00-23:00",
    storeMinOrder: "200",
    storeDeliveryTime: "25-40 min",
    storeAddress: "Upper Adda, Muzaffarabad",
    businessType: "restaurant",
    businessName: "Biryani House",
    storeLat: "34.3699",
    storeLng: "73.4708",
  },
  {
    userId: "demo_vend_2",
    storeName: "AJK Mart Store",
    storeCategory: "grocery",
    storeDescription: "Daily groceries, dairy, meat and household items",
    storeHours: "08:00-22:00",
    storeMinOrder: "100",
    storeDeliveryTime: "20-35 min",
    storeAddress: "CMH Road, Muzaffarabad",
    businessType: "grocery",
    businessName: "AJK Mart",
    storeLat: "34.3712",
    storeLng: "73.4725",
  },
  {
    userId: "demo_vend_3",
    storeName: "Mirpur Fast Food",
    storeCategory: "fast-food",
    storeDescription: "Burgers, shawarma, broast and more",
    storeHours: "11:00-01:00",
    storeMinOrder: "150",
    storeDeliveryTime: "15-25 min",
    storeAddress: "Allama Iqbal Road, Mirpur",
    businessType: "restaurant",
    businessName: "Mirpur Fast Food",
    storeLat: "33.1481",
    storeLng: "73.7520",
  },
  {
    userId: "demo_vend_4",
    storeName: "Rawalakot Pharmacy",
    storeCategory: "pharmacy",
    storeDescription: "Medicines, health products and first aid supplies",
    storeHours: "09:00-21:00",
    storeMinOrder: "50",
    storeDeliveryTime: "25-40 min",
    storeAddress: "Main Bazaar, Rawalakot",
    businessType: "pharmacy",
    businessName: "Rawalakot Pharmacy",
    storeLat: "33.8575",
    storeLng: "73.7610",
  },
  {
    userId: "demo_vend_5",
    storeName: "Desi Dhaba Chattar",
    storeCategory: "restaurant",
    storeDescription: "Authentic desi food — nihari, paye, karahi",
    storeHours: "06:00-00:00",
    storeMinOrder: "150",
    storeDeliveryTime: "30-45 min",
    storeAddress: "Chattar, Muzaffarabad",
    businessType: "restaurant",
    businessName: "Desi Dhaba",
    storeLat: "34.3658",
    storeLng: "73.4655",
  },
  {
    userId: "demo_vend_6",
    storeName: "Mirpur General Store",
    storeCategory: "grocery",
    storeDescription: "Everything for your home — groceries and essentials",
    storeHours: "07:00-23:00",
    storeMinOrder: "100",
    storeDeliveryTime: "20-30 min",
    storeAddress: "Sector F2, Mirpur",
    businessType: "grocery",
    businessName: "Mirpur General Store",
    storeLat: "33.1492",
    storeLng: "73.7498",
  },
];

const DEMO_RIDER_PROFILES = [
  {
    userId: "demo_rider_1",
    vehicleType: "bike",
    vehiclePlate: "AJK-1234",
    drivingLicense: "DL-MZD-001",
  },
  {
    userId: "demo_rider_2",
    vehicleType: "bike",
    vehiclePlate: "AJK-5678",
    drivingLicense: "DL-MZD-002",
  },
  {
    userId: "demo_rider_3",
    vehicleType: "car",
    vehiclePlate: "AJK-9012",
    drivingLicense: "DL-MPR-001",
  },
  {
    userId: "demo_rider_4",
    vehicleType: "bike",
    vehiclePlate: "AJK-3456",
    drivingLicense: "DL-RWK-001",
  },
  {
    userId: "demo_rider_5",
    vehicleType: "car",
    vehiclePlate: "AJK-7890",
    drivingLicense: "DL-MZD-003",
  },
  {
    userId: "demo_rider_6",
    vehicleType: "bike",
    vehiclePlate: "AJK-2345",
    drivingLicense: "DL-MPR-002",
  },
  {
    userId: "demo_rider_7",
    vehicleType: "bike",
    vehiclePlate: "AJK-6789",
    drivingLicense: "DL-MZD-004",
  },
  {
    userId: "demo_rider_8",
    vehicleType: "car",
    vehiclePlate: "AJK-0123",
    drivingLicense: "DL-RWK-002",
  },
];

const DEMO_SERVICE_ZONES = [
  {
    name: "Muzaffarabad City",
    city: "Muzaffarabad",
    lat: "34.3700",
    lng: "73.4711",
    radiusKm: "25",
  },
  { name: "Mirpur City", city: "Mirpur", lat: "33.1484", lng: "73.7515", radiusKm: "20" },
  { name: "Rawalakot", city: "Rawalakot", lat: "33.8578", lng: "73.7607", radiusKm: "15" },
];

const DEMO_BANNERS = [
  {
    title: "Free Delivery",
    subtitle: "On orders above Rs. 500",
    colorFrom: "#0047B3",
    colorTo: "#0066FF",
    icon: "bicycle",
    placement: "home",
    sortOrder: 1,
    linkType: "service",
    linkValue: "mart",
    targetService: "mart",
  },
  {
    title: "Flash Sale Live!",
    subtitle: "Up to 40% off on groceries",
    colorFrom: "#E53E3E",
    colorTo: "#FC8181",
    icon: "flash",
    placement: "home",
    sortOrder: 2,
    linkType: "route",
    linkValue: "/mart",
    targetService: "mart",
  },
  {
    title: "New Restaurants",
    subtitle: "Order from 10+ restaurants",
    colorFrom: "#DD6B20",
    colorTo: "#F6AD55",
    icon: "restaurant",
    placement: "home",
    sortOrder: 3,
    linkType: "service",
    linkValue: "food",
    targetService: "food",
  },
  {
    title: "Ride & Save",
    subtitle: "Book rides at lowest fares",
    colorFrom: "#38A169",
    colorTo: "#68D391",
    icon: "car",
    placement: "home",
    sortOrder: 4,
    linkType: "service",
    linkValue: "ride",
    targetService: "ride",
  },
  {
    title: "Pharmacy Delivery",
    subtitle: "Medicines at your doorstep",
    colorFrom: "#805AD5",
    colorTo: "#B794F4",
    icon: "medkit",
    placement: "home",
    sortOrder: 5,
    linkType: "service",
    linkValue: "pharmacy",
    targetService: "pharmacy",
  },
  {
    title: "Parcel Service",
    subtitle: "Send parcels across AJK",
    colorFrom: "#2B6CB0",
    colorTo: "#63B3ED",
    icon: "cube",
    placement: "home",
    sortOrder: 6,
    linkType: "service",
    linkValue: "parcel",
    targetService: "parcel",
  },
];

const DEMO_PROMO_CODES = [
  {
    code: "WELCOME50",
    description: "50% off your first order",
    discountPct: "50",
    maxDiscount: "200",
    minOrderAmount: "200",
    appliesTo: "all",
    usageLimit: 100,
  },
  {
    code: "FREEDEL",
    description: "Free delivery on any order",
    discountFlat: "50",
    maxDiscount: "50",
    minOrderAmount: "300",
    appliesTo: "mart",
    usageLimit: 200,
  },
  {
    code: "RIDE20",
    description: "Rs. 20 off your next ride",
    discountFlat: "20",
    maxDiscount: "20",
    minOrderAmount: "100",
    appliesTo: "ride",
    usageLimit: 500,
  },
  {
    code: "FOODIE30",
    description: "30% off food orders",
    discountPct: "30",
    maxDiscount: "150",
    minOrderAmount: "300",
    appliesTo: "food",
    usageLimit: 150,
  },
  {
    code: "AJK100",
    description: "Rs. 100 off for AJK residents",
    discountFlat: "100",
    maxDiscount: "100",
    minOrderAmount: "500",
    appliesTo: "all",
    usageLimit: 300,
  },
];

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000);
}
function hoursAgo(n: number) {
  return new Date(Date.now() - n * 3600000);
}

router.post("/seed-demo", async (_req, res, next: NextFunction) => {
  const snap = await snapshotBefore("Load Demo Data", "seed-demo", REMOVABLE_TABLES);

  const counts: Record<string, number> = {};
  try {
    await db
      .update(ordersTable)
      .set({ deletedAt: new Date() })
      .where(isNull(ordersTable.deletedAt));
    await db.delete(ridesTable);
    await db.delete(pharmacyOrdersTable);
    await db.delete(parcelBookingsTable);
    await db.delete(walletTransactionsTable);
    await db.delete(reviewsTable);
    await db.delete(notificationsTable);
    await db.delete(liveLocationsTable);
    await db.delete(flashDealsTable);
    await db.delete(promoCodesTable);
    await db.delete(savedAddressesTable);
    await db.delete(userSettingsTable);
    await db.delete(bannersTable);
    await db.delete(productsTable);
    await db.delete(vendorProfilesTable);
    await db.delete(riderProfilesTable);
    await db.delete(serviceZonesTable);
    await db.update(usersTable).set({ deletedAt: new Date() }).where(isNull(usersTable.deletedAt));

    for (const u of DEMO_USERS) {
      await db
        .insert(usersTable)
        .values({
          ...u,
          walletBalance: DEMO_WALLET_BALANCE,
          phoneVerified: true,
          approvalStatus: "approved",
          isActive: true,
          isOnline: u.isOnline ?? false,
        })
        .onConflictDoUpdate({
          target: usersTable.id,
          set: {
            walletBalance: DEMO_WALLET_BALANCE,
            phoneVerified: true,
            approvalStatus: "approved",
            isActive: true,
            isOnline: u.isOnline ?? false,
            deletedAt: null,
          },
        });
    }
    counts.users = DEMO_USERS.length;

    for (const vp of DEMO_VENDOR_PROFILES) {
      await db.insert(vendorProfilesTable).values(vp);
    }
    counts.vendorProfiles = DEMO_VENDOR_PROFILES.length;

    for (const rp of DEMO_RIDER_PROFILES) {
      await db.insert(riderProfilesTable).values(rp);
    }
    counts.riderProfiles = DEMO_RIDER_PROFILES.length;

    for (const sz of DEMO_SERVICE_ZONES) {
      await db.insert(serviceZonesTable).values(sz);
    }
    counts.serviceZones = DEMO_SERVICE_ZONES.length;

    const { mart, food } = await reseedProducts();
    counts.products = mart + food;

    for (const b of DEMO_BANNERS) {
      await db.insert(bannersTable).values({ id: generateId(), ...b });
    }
    counts.banners = DEMO_BANNERS.length;

    for (const p of DEMO_PROMO_CODES) {
      await db.insert(promoCodesTable).values({
        id: generateId(),
        ...p,
        expiresAt: new Date(Date.now() + 30 * 86400000),
        isActive: true,
      });
    }
    counts.promoCodes = DEMO_PROMO_CODES.length;

    const orderStatuses = [
      "delivered",
      "delivered",
      "delivered",
      "delivered",
      "delivered",
      "delivered",
      "delivered",
      "delivered",
      "picked_up",
      "picked_up",
      "preparing",
      "preparing",
      "pending",
      "pending",
      "cancelled",
      "cancelled",
      "delivered",
      "delivered",
      "delivered",
      "delivered",
      "delivered",
      "delivered",
      "delivered",
      "delivered",
    ];
    const payMethods = ["wallet", "cod", "jazzcash", "easypaisa", "wallet", "cod"];
    const demoOrders: Array<{
      id: string;
      userId: string;
      riderId?: string;
      vendorId: string;
      status: string;
      total: string;
      createdAt: Date;
    }> = [];
    for (let i = 0; i < 24; i++) {
      const cIdx = i % 8;
      const rIdx = i % 8;
      const vIdx = i % 6;
      const status = orderStatuses[i];
      const orderId = generateId();
      const ageInDays = Math.floor(i * 1.5);
      const row = {
        id: orderId,
        userId: `demo_cust_${cIdx + 1}`,
        type: i % 3 === 0 ? "food" : "mart",
        items: JSON.stringify([
          {
            name: i % 3 === 0 ? "Chicken Biryani" : "Basmati Rice 5kg",
            qty: 1 + (i % 3),
            price: (200 + i * 30).toString(),
          },
        ]),
        status,
        total: (200 + i * 50).toString(),
        deliveryAddress: `${DEMO_USERS[cIdx].area}, ${DEMO_USERS[cIdx].city}`,
        paymentMethod: payMethods[i % payMethods.length],
        riderId: ["delivered", "picked_up"].includes(status) ? `demo_rider_${rIdx + 1}` : undefined,
        riderName: ["delivered", "picked_up"].includes(status)
          ? DEMO_USERS[8 + rIdx].name
          : undefined,
        vendorId: `demo_vend_${vIdx + 1}`,
        estimatedTime: "25-40 min",
        paymentStatus: status === "delivered" ? "completed" : "pending",
        createdAt: daysAgo(ageInDays),
      };
      await db.insert(ordersTable).values(row);
      demoOrders.push({
        id: orderId,
        userId: row.userId,
        riderId: row.riderId,
        vendorId: row.vendorId,
        status,
        total: row.total,
        createdAt: row.createdAt,
      });
    }
    counts.orders = 24;

    const rideStatuses = [
      "completed",
      "completed",
      "completed",
      "completed",
      "completed",
      "completed",
      "completed",
      "in_transit",
      "in_transit",
      "accepted",
      "accepted",
      "cancelled",
      "cancelled",
      "completed",
      "completed",
    ];
    const locations = [
      {
        pickup: "Upper Adda, Muzaffarabad",
        drop: "CMH Road, Muzaffarabad",
        pLat: "34.3700",
        pLng: "73.4711",
        dLat: "34.3650",
        dLng: "73.4800",
      },
      {
        pickup: "Chattar, Muzaffarabad",
        drop: "Domel, Muzaffarabad",
        pLat: "34.3720",
        pLng: "73.4750",
        dLat: "34.3600",
        dLng: "73.4600",
      },
      {
        pickup: "Allama Iqbal Road, Mirpur",
        drop: "Sector F2, Mirpur",
        pLat: "33.1484",
        pLng: "73.7515",
        dLat: "33.1400",
        dLng: "73.7600",
      },
      {
        pickup: "Main Bazaar, Rawalakot",
        drop: "Hajira Road, Rawalakot",
        pLat: "33.8578",
        pLng: "73.7607",
        dLat: "33.8500",
        dLng: "73.7500",
      },
      {
        pickup: "Ghari Dupatta, Muzaffarabad",
        drop: "Upper Adda, Muzaffarabad",
        pLat: "34.3800",
        pLng: "73.4900",
        dLat: "34.3700",
        dLng: "73.4711",
      },
    ];
    for (let i = 0; i < 15; i++) {
      const cIdx = i % 8;
      const rIdx = i % 8;
      const loc = locations[i % locations.length];
      const status = rideStatuses[i];
      const dist = (3 + (i % 10)).toString();
      const fare = (100 + i * 25).toString();
      await db.insert(ridesTable).values({
        id: generateId(),
        userId: `demo_cust_${cIdx + 1}`,
        type: i % 3 === 0 ? "car" : "bike",
        status,
        pickupAddress: loc.pickup,
        dropAddress: loc.drop,
        pickupLat: loc.pLat,
        pickupLng: loc.pLng,
        dropLat: loc.dLat,
        dropLng: loc.dLng,
        fare,
        distance: dist,
        riderId: status !== "cancelled" ? `demo_rider_${rIdx + 1}` : undefined,
        riderName: status !== "cancelled" ? DEMO_USERS[8 + rIdx].name : undefined,
        paymentMethod: payMethods[i % payMethods.length],
        createdAt: daysAgo(i * 2),
        completedAt: status === "completed" ? daysAgo(i * 2) : undefined,
        cancelledAt: status === "cancelled" ? daysAgo(i * 2) : undefined,
        cancellationReason: status === "cancelled" ? "Customer cancelled" : undefined,
      });
    }
    counts.rides = 15;

    const pharmaItems = [
      [{ name: "Panadol Extra", qty: 2, price: "45" }],
      [
        { name: "Vitamin C 500mg", qty: 1, price: "120" },
        { name: "ORS Sachet", qty: 3, price: "60" },
      ],
      [{ name: "Cough Syrup", qty: 1, price: "95" }],
      [{ name: "Gaviscon Antacid", qty: 1, price: "85" }],
      [{ name: "Eye Drops", qty: 2, price: "110" }],
      [
        { name: "Brufen 400mg", qty: 1, price: "50" },
        { name: "Dettol 100ml", qty: 1, price: "120" },
      ],
    ];
    const pharmaStatuses = [
      "delivered",
      "delivered",
      "processing",
      "pending",
      "delivered",
      "cancelled",
    ];
    for (let i = 0; i < 6; i++) {
      const cIdx = i % 8;
      await db.insert(pharmacyOrdersTable).values({
        id: generateId(),
        userId: `demo_cust_${cIdx + 1}`,
        riderId: pharmaStatuses[i] === "delivered" ? `demo_rider_${(i % 8) + 1}` : undefined,
        items: JSON.stringify(pharmaItems[i]),
        deliveryAddress: `${DEMO_USERS[cIdx].area}, ${DEMO_USERS[cIdx].city}`,
        contactPhone: DEMO_USERS[cIdx].phone,
        total: pharmaItems[i].reduce((s, it) => s + Number(it.price) * it.qty, 0).toString(),
        paymentMethod: payMethods[i % payMethods.length],
        status: pharmaStatuses[i],
        createdAt: daysAgo(i * 3),
      });
    }
    counts.pharmacyOrders = 6;

    const parcelTypes = [
      "documents",
      "small_package",
      "medium_package",
      "large_package",
      "fragile",
    ];
    const parcelStatuses = [
      "delivered",
      "delivered",
      "in_transit",
      "pending",
      "delivered",
      "cancelled",
    ];
    for (let i = 0; i < 6; i++) {
      const cIdx = i % 8;
      const loc = locations[i % locations.length];
      await db.insert(parcelBookingsTable).values({
        id: generateId(),
        userId: `demo_cust_${cIdx + 1}`,
        senderName: DEMO_USERS[cIdx].name,
        senderPhone: DEMO_USERS[cIdx].phone,
        pickupAddress: loc.pickup,
        receiverName: DEMO_USERS[(cIdx + 1) % 8].name,
        receiverPhone: DEMO_USERS[(cIdx + 1) % 8].phone,
        dropAddress: loc.drop,
        parcelType: parcelTypes[i % parcelTypes.length],
        weight: (0.5 + i * 0.8).toFixed(2),
        description: `Parcel from ${DEMO_USERS[cIdx].name}`,
        fare: (150 + i * 40).toString(),
        paymentMethod: payMethods[i % payMethods.length],
        status: parcelStatuses[i],
        riderId: parcelStatuses[i] === "delivered" ? `demo_rider_${(i % 8) + 1}` : undefined,
        createdAt: daysAgo(i * 4),
      });
    }
    counts.parcelBookings = 6;

    const txTypes = [
      "deposit",
      "payment",
      "refund",
      "deposit",
      "payment",
      "deposit",
      "payment",
      "cashback",
      "deposit",
      "payment",
      "payment",
      "deposit",
      "refund",
      "payment",
      "deposit",
      "payment",
      "cashback",
      "deposit",
      "payment",
      "deposit",
      "payment",
      "deposit",
      "payment",
      "refund",
      "deposit",
      "payment",
      "deposit",
      "payment",
      "cashback",
      "deposit",
      "payment",
      "deposit",
    ];
    for (let i = 0; i < 32; i++) {
      const cIdx = i % 8;
      const txType = txTypes[i];
      const amount =
        txType === "deposit"
          ? (500 + i * 50).toString()
          : txType === "refund"
            ? (100 + i * 20).toString()
            : txType === "cashback"
              ? (20 + i * 5).toString()
              : (150 + i * 30).toString();
      const desc =
        txType === "deposit"
          ? "Wallet top-up via JazzCash"
          : txType === "refund"
            ? "Order refund"
            : txType === "cashback"
              ? "Cashback reward"
              : `Payment for order`;
      await db.insert(walletTransactionsTable).values({
        id: generateId(),
        userId: `demo_cust_${cIdx + 1}`,
        type: txType,
        amount,
        description: desc,
        reference: `TXN-${1000 + i}`,
        paymentMethod: payMethods[i % payMethods.length],
        createdAt: daysAgo(Math.floor(i * 0.8)),
      });
    }
    counts.walletTransactions = 32;

    const reviewComments = [
      "Bohat acha khana tha, time par delivery!",
      "Fresh groceries mili, shukria AJKMart!",
      "Rider bohot cooperative tha, highly recommend",
      "Biryani was amazing, will order again",
      "Delivery thori late thi lekin quality achi thi",
      "Best service in Muzaffarabad!",
      "Paratha was crispy and delicious",
      "Good packaging, everything was fresh",
      "Rider was very polite and professional",
      "Fast delivery, great quality products",
      "Price was a bit high but quality is good",
      "Nihari was outstanding, authentic taste!",
      "Quick delivery, items were well packed",
      "Great experience, ordering again!",
      "Fresh meat, well cut and cleaned",
      "Pharmacy order delivered on time",
      "Very convenient service for groceries",
      "Best biryani in town, hands down!",
      "Excellent customer service",
      "Will definitely recommend to friends",
      "Good variety of products available",
      "Medicine delivery saved my time",
    ];
    for (let i = 0; i < 22; i++) {
      const cIdx = i % 8;
      const order = demoOrders[i % demoOrders.length];
      await db.insert(reviewsTable).values({
        id: generateId(),
        orderId: `review_order_${i}`,
        userId: `demo_cust_${cIdx + 1}`,
        vendorId: order.vendorId,
        riderId: order.riderId || undefined,
        orderType: i % 3 === 0 ? "food" : "mart",
        rating: 3 + (i % 3),
        riderRating: order.riderId ? 3 + ((i + 1) % 3) : undefined,
        comment: reviewComments[i],
        createdAt: daysAgo(i * 1.5),
      });
    }
    counts.reviews = 22;

    const notifTypes = ["order", "ride", "promo", "system", "wallet"];
    const notifData = [
      { title: "Order Delivered!", body: "Your order has been delivered successfully. Enjoy!" },
      { title: "Rider Assigned", body: "A rider has been assigned to your order." },
      { title: "Flash Sale!", body: "40% off on groceries for the next 2 hours!" },
      { title: "Welcome to AJKMart!", body: "Start exploring amazing deals in your area." },
      { title: "Wallet Credited", body: "Rs. 500 has been added to your wallet." },
      { title: "Ride Completed", body: "Your ride has been completed. Rate your experience!" },
      { title: "New Restaurant Added", body: "Desi Dhaba is now available on AJKMart Food!" },
      { title: "Order Confirmed", body: "Your order has been confirmed by the vendor." },
      { title: "Special Offer", body: "Use code WELCOME50 for 50% off your next order!" },
      { title: "Delivery Update", body: "Your order is out for delivery." },
      { title: "Cashback Received", body: "Rs. 30 cashback credited to your wallet." },
      { title: "Rate Your Order", body: "How was your recent order? Leave a review!" },
    ];
    for (let i = 0; i < 12; i++) {
      const cIdx = i % 8;
      const n = notifData[i];
      await db.insert(notificationsTable).values({
        id: generateId(),
        userId: `demo_cust_${cIdx + 1}`,
        title: n.title,
        body: n.body,
        type: notifTypes[i % notifTypes.length],
        isRead: i < 6,
        createdAt: hoursAgo(i * 4),
      });
    }
    counts.notifications = 12;

    const addrLabels = ["Home", "Office", "Shop"];
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 2; j++) {
        await db.insert(savedAddressesTable).values({
          id: generateId(),
          userId: `demo_cust_${i + 1}`,
          label: addrLabels[j],
          address: `${DEMO_USERS[i].area}, ${DEMO_USERS[i].city}`,
          city: DEMO_USERS[i].city,
          isDefault: j === 0,
        });
      }
    }
    counts.savedAddresses = 16;

    const allProducts = await db.select().from(productsTable).limit(100);
    const discountProducts = allProducts.filter(
      (p) => p.originalPrice && Number(p.originalPrice) > Number(p.price)
    );
    const dealEndTime = new Date(Date.now() + 7 * 86400000);
    let dealCount = 0;
    for (const p of discountProducts.slice(0, 5)) {
      const origPrice = Number(p.originalPrice);
      const salePrice = Number(p.price);
      const pct = Math.round(((origPrice - salePrice) / origPrice) * 100);
      await db.insert(flashDealsTable).values({
        id: generateId(),
        productId: p.id,
        title: `${pct}% OFF ${p.name}`,
        badge: "FLASH",
        discountPct: pct.toString(),
        startTime: new Date(),
        endTime: dealEndTime,
        dealStock: 50,
        isActive: true,
      });
      dealCount++;
    }
    counts.flashDeals = dealCount;

    await db.insert(platformSettingsTable).values(DEFAULT_PLATFORM_SETTINGS).onConflictDoNothing();
    invalidateSettingsCache();

    res.json({
      success: true,
      message: "Demo data loaded successfully with AJK-themed content.",
      counts,
      ...snap,
    });
  } catch (e: unknown) {
    next(e as Error);
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   UNDO ENDPOINT
═══════════════════════════════════════════════════════════════════════════ */

/* POST /admin/system/undo/:id */
router.post("/undo/:id", async (req, res, next: NextFunction) => {
  const { id } = req.params as Record<string, string>;
  const [snapshot] = await db
    .select()
    .from(systemSnapshotsTable)
    .where(eq(systemSnapshotsTable.id, id));

  if (!snapshot) {
    res
      .status(404)
      .json({ error: "Snapshot not found. It may have already expired or been dismissed." });
    return;
  }
  if (new Date() > snapshot.expiresAt) {
    await db.delete(systemSnapshotsTable).where(eq(systemSnapshotsTable.id, id));
    res.status(410).json({ error: "Undo window has expired. This action is now permanent." });
    return;
  }

  let tables: Record<string, any[]>;
  try {
    tables = JSON.parse(snapshot.tablesJson);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), code: "SNAPSHOT_PARSE_FAILED" },
      "[system] Snapshot JSON parse failed — data may be corrupted"
    );
    next(new Error("Snapshot data is corrupted."));
    return;
  }

  const { restored, errors } = await restoreTables(tables);

  if (snapshot.actionId === "reset-settings") {
    invalidateSettingsCache();
  }

  await db.delete(systemSnapshotsTable).where(eq(systemSnapshotsTable.id, id));

  res.json({
    success: errors.length === 0,
    message:
      errors.length === 0
        ? `Undo complete. "${snapshot.label}" has been reversed.`
        : `Undo completed with ${errors.length} error(s).`,
    restored,
    errors: errors.length > 0 ? errors : undefined,
  });
});

/* DELETE /admin/system/snapshots/:id — dismiss (discard undo without restoring) */
router.delete("/snapshots/:id", async (req, res, _next: NextFunction) => {
  const { id } = req.params as Record<string, string>;
  await db.delete(systemSnapshotsTable).where(eq(systemSnapshotsTable.id, id));
  res.json({ success: true, message: "Snapshot dismissed. The action is now permanent." });
});

/* ═══════════════════════════════════════════════════════════════════════════
   BACKUP / RESTORE
═══════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────────────────
   DEMO BACKUP ENDPOINTS
   Server-side named snapshots — stored in DB, no file upload/download needed.
───────────────────────────────────────────────────────────────────────────── */

/* GET /admin/system/demo-backups — list all saved demo backups */
router.get("/demo-backups", async (_req, res, next: NextFunction) => {
  try {
    const rows = await db
      .select({
        id: demoBackupsTable.id,
        label: demoBackupsTable.label,
        rowsTotal: demoBackupsTable.rowsTotal,
        sizeKb: demoBackupsTable.sizeKb,
        createdAt: demoBackupsTable.createdAt,
      })
      .from(demoBackupsTable)
      .orderBy(demoBackupsTable.createdAt);
    sendSuccess(res, rows);
  } catch (err) {
    next(err);
  }
});

/* POST /admin/system/demo-backups — create a new demo backup */
router.post("/demo-backups", async (req, res, next: NextFunction) => {
  try {
    const label =
      (req.body?.label as string | undefined)?.trim() ||
      `Demo Backup ${new Date().toLocaleDateString("ur-PK")}`;

    const [
      users,
      orders,
      rides,
      pharmacy,
      parcel,
      products,
      walletTx,
      notifications,
      reviews,
      promos,
      flashDeals,
      settings,
      savedAddr,
      userSettings,
      banners,
      vendors,
      riders,
    ] = await Promise.all([
      db.select().from(usersTable),
      db.select().from(ordersTable),
      db.select().from(ridesTable),
      db.select().from(pharmacyOrdersTable),
      db.select().from(parcelBookingsTable),
      db.select().from(productsTable),
      db.select().from(walletTransactionsTable),
      db.select().from(notificationsTable),
      db.select().from(reviewsTable),
      db.select().from(promoCodesTable),
      db.select().from(flashDealsTable),
      db.select().from(platformSettingsTable),
      db.select().from(savedAddressesTable),
      db.select().from(userSettingsTable),
      db.select().from(bannersTable),
      db.select().from(vendorProfilesTable),
      db.select().from(riderProfilesTable),
    ]);

    const tables = {
      users: users.map((u) => ({ ...u, otpCode: undefined, otpExpiry: undefined })),
      orders,
      rides,
      pharmacy_orders: pharmacy,
      parcel_bookings: parcel,
      products,
      wallet_transactions: walletTx,
      notifications,
      reviews,
      promo_codes: promos,
      flash_deals: flashDeals,
      platform_settings: settings,
      saved_addresses: savedAddr,
      user_settings: userSettings,
      banners,
      vendor_profiles: vendors,
      rider_profiles: riders,
    };

    const tablesJson = JSON.stringify(tables);
    const sizeKb = Math.ceil(Buffer.byteLength(tablesJson, "utf8") / 1024);
    const rowsTotal = Object.values(tables).reduce(
      (s, t) => s + (Array.isArray(t) ? t.length : 0),
      0
    );

    const id = generateId();
    await db.insert(demoBackupsTable).values({ id, label, tablesJson, rowsTotal, sizeKb });

    sendSuccess(res, { id, label, rowsTotal, sizeKb, createdAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

/* POST /admin/system/demo-backups/:id/restore — restore from a demo backup */
router.post("/demo-backups/:id/restore", async (req, res, next: NextFunction) => {
  try {
    const { id } = req.params as Record<string, string>;
    const row = await db
      .select()
      .from(demoBackupsTable)
      .where(eq(demoBackupsTable.id, id))
      .limit(1);
    if (!row[0]) {
      sendNotFound(res, "Demo backup not found");
      return;
    }

    let tables: Record<string, any[]>;
    try {
      tables = JSON.parse(row[0].tablesJson) as Record<string, any[]>;
    } catch (parseErr) {
      logger.error(
        { err: parseErr, code: "DEMO_BACKUP_PARSE_FAILED" },
        "[system] Demo backup JSON parse failed — data corrupted"
      );
      sendError(res, "Demo backup data is corrupted and cannot be parsed", 500);
      return;
    }

    const snap = await snapshotBefore(
      `Demo Restore: ${row[0].label}`,
      "demo-restore",
      Object.keys(TABLE_MAP)
    );
    const { restored, errors } = await restoreTables(tables);

    res.json({
      success: errors.length === 0,
      message:
        errors.length === 0
          ? `Restored from demo backup "${row[0].label}" successfully.`
          : `Restore completed with ${errors.length} error(s).`,
      restored,
      errors: errors.length > 0 ? errors : undefined,
      ...snap,
    });
  } catch (err) {
    next(err);
  }
});

/* DELETE /admin/system/demo-backups/:id — delete a demo backup */
router.delete("/demo-backups/:id", async (req, res, next: NextFunction) => {
  try {
    const { id } = req.params as Record<string, string>;
    await db.delete(demoBackupsTable).where(eq(demoBackupsTable.id, id));
    sendSuccess(res, { deleted: id });
  } catch (err) {
    next(err);
  }
});

/* GET /admin/system/backup — full database export as JSON file */
router.get("/backup", async (_req, res, next: NextFunction) => {
  try {
    const [
      users,
      orders,
      rides,
      pharmacy,
      parcel,
      products,
      walletTx,
      notifications,
      reviews,
      promos,
      flashDeals,
      settings,
      savedAddr,
      userSettings,
    ] = await Promise.all([
      db.select().from(usersTable),
      db.select().from(ordersTable),
      db.select().from(ridesTable),
      db.select().from(pharmacyOrdersTable),
      db.select().from(parcelBookingsTable),
      db.select().from(productsTable),
      db.select().from(walletTransactionsTable),
      db.select().from(notificationsTable),
      db.select().from(reviewsTable),
      db.select().from(promoCodesTable),
      db.select().from(flashDealsTable),
      db.select().from(platformSettingsTable),
      db.select().from(savedAddressesTable),
      db.select().from(userSettingsTable),
    ]);

    const backup = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      platform: "AJKMart",
      tables: {
        users: users.map((u) => ({ ...u, otpCode: undefined, otpExpiry: undefined })),
        orders,
        rides,
        pharmacy_orders: pharmacy,
        parcel_bookings: parcel,
        products,
        wallet_transactions: walletTx,
        notifications,
        reviews,
        promo_codes: promos,
        flash_deals: flashDeals,
        platform_settings: settings,
        saved_addresses: savedAddr,
        user_settings: userSettings,
      },
      counts: {
        users: users.length,
        orders: orders.length,
        rides: rides.length,
        pharmacy_orders: pharmacy.length,
        parcel_bookings: parcel.length,
        products: products.length,
        wallet_transactions: walletTx.length,
        notifications: notifications.length,
        reviews: reviews.length,
        promo_codes: promos.length,
        flash_deals: flashDeals.length,
        platform_settings: settings.length,
        saved_addresses: savedAddr.length,
        user_settings: userSettings.length,
      },
    };

    const filename = `ajkmart-backup-${new Date().toISOString().split("T")[0]}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json(backup);
  } catch (err) {
    next(err);
  }
});

/* POST /admin/system/restore */
router.post("/restore", async (req, res, next: NextFunction) => {
  try {
    const body = req.body as { tables?: Record<string, unknown[]> };
    if (!body?.tables) {
      res.status(400).json({ error: "Invalid backup format. Expected { tables: { ... } }." });
      return;
    }

    const snap = await snapshotBefore("Import Restore", "restore", Object.keys(TABLE_MAP));
    const { restored, errors } = await restoreTables(body.tables);

    res.json({
      success: errors.length === 0,
      message:
        errors.length === 0
          ? "Database restored successfully from backup."
          : `Restore completed with ${errors.length} error(s).`,
      restored,
      errors: errors.length > 0 ? errors : undefined,
      ...snap,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
