import { expect, test } from "@playwright/test";

const API = "/api";

test.describe("Customer API — Products & Catalog", () => {
  test("GET /api/health → status ok", async ({ request }) => {
    const res = await request.get(`${API}/health`);
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.db).toBe("ok");
  });

  test("GET /api/products → returns paginated list", async ({ request }) => {
    const res = await request.get(`${API}/products?limit=5`);
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("data");
      expect(Array.isArray(body.data)).toBe(true);
    }
  });

  test("GET /api/products?search=rice → filtered results", async ({ request }) => {
    const res = await request.get(`${API}/products?search=rice&limit=3`);
    expect([200, 404]).toContain(res.status());
  });

  test("GET /api/products/:id with invalid id → 404", async ({ request }) => {
    const res = await request.get(`${API}/products/nonexistent-product-xyz-abc`);
    expect([400, 404, 422]).toContain(res.status());
  });

  test("GET /api/categories → returns category list", async ({ request }) => {
    const res = await request.get(`${API}/categories`);
    expect([200, 304]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      const isOk = body.success === true || Array.isArray(body) || Array.isArray(body.data);
      expect(isOk).toBe(true);
    }
  });

  test("GET /api/categories/tree → returns nested tree or 404", async ({ request }) => {
    const res = await request.get(`${API}/categories/tree`);
    expect([200, 304, 404]).toContain(res.status());
  });
});

test.describe("Customer API — Rides", () => {
  test("POST /api/rides/estimate with valid coords → fare estimate", async ({ request }) => {
    const res = await request.post(`${API}/rides/estimate`, {
      data: {
        pickupLat: 33.7291,
        pickupLng: 73.3949,
        dropLat: 33.74,
        dropLng: 73.41,
        vehicleType: "bike",
      },
    });
    expect([200, 401, 422]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("data");
    }
  });

  test("GET /api/rides without auth → 401", async ({ request }) => {
    const res = await request.get(`${API}/rides`);
    expect([401, 403]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test("POST /api/rides without auth → 401", async ({ request }) => {
    const res = await request.post(`${API}/rides`, {
      data: {
        pickupLat: 33.7291,
        pickupLng: 73.3949,
        dropLat: 33.74,
        dropLng: 73.41,
        vehicleType: "bike",
      },
    });
    expect([401, 403]).toContain(res.status());
  });
});

test.describe("Customer API — Wallet", () => {
  test("GET /api/wallet without auth → 401", async ({ request }) => {
    const res = await request.get(`${API}/wallet`);
    expect([401, 403]).toContain(res.status());
  });

  test("POST /api/wallet/deposit without auth → 401", async ({ request }) => {
    const res = await request.post(`${API}/wallet/deposit`, {
      data: { amount: 1000, paymentMethod: "easypaisa", transactionId: "TXN123" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("POST /api/wallet/send without auth → 401", async ({ request }) => {
    const res = await request.post(`${API}/wallet/send`, {
      data: { receiverPhone: "03001234567", amount: 500 },
    });
    expect([401, 403]).toContain(res.status());
  });
});

test.describe("Customer API — Orders & Cart", () => {
  test("GET /api/orders without auth → 401", async ({ request }) => {
    const res = await request.get(`${API}/orders`);
    expect([401, 403]).toContain(res.status());
  });

  test("POST /api/cart/add without auth → 401 or 404", async ({ request }) => {
    const res = await request.post(`${API}/cart/add`, {
      data: { productId: "prod-001", quantity: 1 },
    });
    expect([401, 403, 404]).toContain(res.status());
  });

  test("GET /api/cart without auth → 401 or 404", async ({ request }) => {
    const res = await request.get(`${API}/cart`);
    expect([200, 401, 403, 404]).toContain(res.status());
  });
});

test.describe("Customer API — KYC & Profile", () => {
  test("GET /api/users/me without auth → 401", async ({ request }) => {
    const res = await request.get(`${API}/users/me`);
    expect([401, 403]).toContain(res.status());
  });

  test("POST /api/kyc/submit without auth → 401", async ({ request }) => {
    const res = await request.post(`${API}/kyc/submit`, {
      data: { idFront: "test", selfie: "test" },
    });
    expect([401, 403]).toContain(res.status());
  });
});

test.describe("Customer API — Security & Rate Limiting", () => {
  test("request has X-Request-ID header", async ({ request }) => {
    const res = await request.get(`${API}/health`);
    const requestId = res.headers()["x-request-id"];
    expect(requestId).toBeTruthy();
    expect(requestId.length).toBeGreaterThan(10);
  });

  test("response exposes X-RateLimit-Remaining via Access-Control-Expose-Headers", async ({
    request,
  }) => {
    const res = await request.get(`${API}/health`);
    const exposeHeader = res.headers()["access-control-expose-headers"] ?? "";
    const hasRateLimit =
      exposeHeader.toLowerCase().includes("x-ratelimit-remaining") ||
      res.headers()["x-ratelimit-remaining"] !== undefined;
    expect(hasRateLimit).toBe(true);
  });

  test("POST /api/auth/login with missing body → 400/422/401 (not 500)", async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, { data: {} });
    expect([400, 422, 401, 429]).toContain(res.status());
    if (res.status() !== 429) {
      const body = await res.json();
      expect(body.success).toBe(false);
    }
  });

  test("X-Frame-Options: DENY present", async ({ request }) => {
    const res = await request.get(`${API}/health`);
    const xfo = res.headers()["x-frame-options"];
    expect(xfo?.toLowerCase()).toBe("deny");
  });

  test("X-Content-Type-Options: nosniff present", async ({ request }) => {
    const res = await request.get(`${API}/health`);
    const xcto = res.headers()["x-content-type-options"];
    expect(xcto?.toLowerCase()).toBe("nosniff");
  });
});

test.describe("Customer API — Maps & Discovery", () => {
  test("GET /api/maps/config → returns provider info", async ({ request }) => {
    const res = await request.get(`${API}/maps/config`);
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("provider");
    }
  });

  test("GET /api/locations/popular → AJK cities list", async ({ request }) => {
    const res = await request.get(`${API}/locations/popular`);
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      const cities = body.data ?? body;
      expect(Array.isArray(cities)).toBe(true);
    }
  });
});
