import type { Page } from "@playwright/test";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? process.env.ADMIN_SEED_PASSWORD ?? "Admin@123";

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function loginAdmin(page: Page, opts: { username?: string; password?: string } = {}) {
  const username = opts.username ?? ADMIN_USERNAME;
  const password = opts.password ?? ADMIN_PASSWORD;
  const bypassSecret = process.env.E2E_BYPASS_SECRET ?? "e2e-playwright-bypass-2024";

  await page.route("**/api/admin/auth/login", async (route) => {
    await route.continue({
      headers: { ...route.request().headers(), "x-e2e-bypass": bypassSecret },
    });
  });

  await page.goto("/admin/login");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector('input[placeholder="admin@example.com"]', { timeout: 30_000 });
  await page.fill('input[placeholder="admin@example.com"]', username);
  await page.fill('input[placeholder="Enter your password"]', password);
  await page.click('button:has-text("Sign In")');
  await page.waitForURL(/\/admin/, { timeout: 25_000 });
}

// ─── Vendor ───────────────────────────────────────────────────────────────────

const MOCK_VENDOR = {
  id: "e2e-vendor-001",
  name: "Test Vendor",
  email: "vendor@e2etest.com",
  phone: "03001234567",
  role: "vendor",
  storeName: "E2E Test Store",
  storeCategory: "Grocery",
  isApproved: true,
  isActive: true,
  vendorId: "e2e-vendor-001",
};

const MOCK_VENDOR_STATS = {
  revenue: 150000,
  orders: 42,
  products: 18,
  rating: 4.5,
  pendingOrders: 3,
};

const MOCK_ORDERS = {
  success: true,
  data: [
    {
      id: "ord-001",
      customerId: "cust-001",
      customerName: "Test Customer",
      totalAmount: 2500,
      status: "pending",
      items: [{ name: "Rice 5kg", qty: 1, price: 2500 }],
      createdAt: new Date().toISOString(),
    },
    {
      id: "ord-002",
      customerId: "cust-002",
      customerName: "Another Customer",
      totalAmount: 1800,
      status: "preparing",
      items: [{ name: "Atta 10kg", qty: 1, price: 1800 }],
      createdAt: new Date(Date.now() - 3600_000).toISOString(),
    },
  ],
  total: 2,
  page: 1,
};

const MOCK_PRODUCTS = {
  success: true,
  data: [
    {
      id: "prod-001",
      name: "Basmati Rice 5kg",
      price: 2500,
      stock: 50,
      category: "Grocery",
      isActive: true,
    },
    {
      id: "prod-002",
      name: "Wheat Flour 10kg",
      price: 1800,
      stock: 30,
      category: "Grocery",
      isActive: true,
    },
    {
      id: "prod-003",
      name: "Cooking Oil 5L",
      price: 3200,
      stock: 20,
      category: "Grocery",
      isActive: false,
    },
  ],
  total: 3,
  page: 1,
};

const MOCK_WALLET = {
  success: true,
  data: {
    balance: 45000,
    currency: "PKR",
    transactions: [
      {
        id: "txn-001",
        type: "credit",
        amount: 2500,
        description: "Order payout",
        date: new Date().toISOString(),
      },
      {
        id: "txn-002",
        type: "credit",
        amount: 1800,
        description: "Order payout",
        date: new Date(Date.now() - 86400_000).toISOString(),
      },
    ],
  },
};

/**
 * Set up mock routes for vendor app so authenticated pages load without real credentials.
 * Call this before page.goto() for any page that requires auth.
 */
export async function mockVendorAuth(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("ajkmart_vendor_token", "e2e-fake-vendor-access-token");
    sessionStorage.setItem("ajkmart_vendor_refresh_token", "e2e-fake-vendor-refresh-token");
    localStorage.setItem("ajkmart_vendor_token", "e2e-fake-vendor-access-token");
  });

  await page.route("**/api/vendor/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: MOCK_VENDOR }),
    });
  });
  await page.route("**/api/users/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: MOCK_VENDOR }),
    });
  });
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: MOCK_VENDOR }),
    });
  });
  await page.route("**/api/auth/refresh", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          accessToken: "e2e-fake-vendor-access-token",
          refreshToken: "e2e-fake-vendor-refresh-token",
        },
      }),
    });
  });
  await page.route("**/api/vendor/dashboard**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: MOCK_VENDOR_STATS }),
    });
  });
  await page.route("**/api/vendor/analytics**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: MOCK_VENDOR_STATS }),
    });
  });
  await page.route("**/api/orders**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_ORDERS),
    });
  });
  await page.route("**/api/products**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_PRODUCTS),
      });
    } else {
      await route.continue();
    }
  });
  await page.route("**/api/wallet**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_WALLET),
    });
  });
  await page.route("**/api/vendor/store**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          storeName: "E2E Test Store",
          storeCategory: "Grocery",
          storeIsOpen: true,
          storeDescription: "Test store for E2E",
        },
      }),
    });
  });
  await page.route("**/api/notifications**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [], total: 0 }),
    });
  });
  await page.route("**/api/maps/config**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "osm",
        enabled: true,
        defaultLat: 33.7291,
        defaultLng: 73.3949,
      }),
    });
  });
}

// ─── Rider ────────────────────────────────────────────────────────────────────

const MOCK_RIDER = {
  id: "e2e-rider-001",
  name: "Test Rider",
  phone: "03009876543",
  role: "rider",
  isOnline: false,
  vehicleType: "bike",
  vehiclePlate: "AJK-E2E-001",
  isKycVerified: true,
  rating: 4.8,
  totalRides: 215,
};

const MOCK_RIDER_EARNINGS = {
  success: true,
  data: {
    today: 1200,
    thisWeek: 8500,
    thisMonth: 34000,
    allTime: 180000,
    rides: 215,
    avgPerRide: 837,
  },
};

const MOCK_RIDE_HISTORY = {
  success: true,
  data: [
    {
      id: "ride-001",
      status: "completed",
      fare: 350,
      distance: 3.2,
      from: "Muzaffarabad Bazaar",
      to: "Hospital Road",
      createdAt: new Date().toISOString(),
    },
    {
      id: "ride-002",
      status: "completed",
      fare: 520,
      distance: 5.1,
      from: "Mirpur Chowk",
      to: "AJK University",
      createdAt: new Date(Date.now() - 86400_000).toISOString(),
    },
    {
      id: "ride-003",
      status: "cancelled",
      fare: 0,
      distance: 0,
      from: "Rawalakot",
      to: "Bagh",
      createdAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
    },
  ],
  total: 3,
  page: 1,
};

/**
 * Set up mock routes for rider app so authenticated pages load without real credentials.
 */
export async function mockRiderAuth(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("ajkmart_rider_token", "e2e-fake-rider-access-token");
    localStorage.setItem("ajkmart_rider_refresh_token", "e2e-fake-rider-refresh-token");
  });

  await page.route("**/api/rider/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: MOCK_RIDER }),
    });
  });
  await page.route("**/api/users/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: MOCK_RIDER }),
    });
  });
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: MOCK_RIDER }),
    });
  });
  await page.route("**/api/auth/refresh", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          accessToken: "e2e-fake-rider-access-token",
          refreshToken: "e2e-fake-rider-refresh-token",
        },
      }),
    });
  });
  await page.route("**/api/rider/earnings**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_RIDER_EARNINGS),
    });
  });
  await page.route("**/api/rides**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_RIDE_HISTORY),
      });
    } else {
      await route.continue();
    }
  });
  await page.route("**/api/rider/rides**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_RIDE_HISTORY),
    });
  });
  await page.route("**/api/wallet**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { balance: 8500, currency: "PKR", transactions: [] },
      }),
    });
  });
  await page.route("**/api/rider/status**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { isOnline: false } }),
    });
  });
  await page.route("**/api/locations/rider**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  await page.route("**/api/notifications**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [], total: 0 }),
    });
  });
  await page.route("**/api/rider/profile**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: MOCK_RIDER }),
    });
  });
  await page.route("**/api/rider/penalty**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    });
  });
}
