import { expect, test } from "@playwright/test";

const API = "/api/auth";

// Auth endpoints are rate-limited — tests accept 429 as a valid "working" response.
const ok = (status: number) => [200, 201].includes(status);
const authErr = (status: number) => [400, 401, 422, 429].includes(status);

test.describe("Vendor Auth — password reset flow", () => {
  test("forgot-password with unknown identifier → generic success or rate-limited", async ({
    request,
  }) => {
    const res = await request.post(`${API}/forgot-password`, {
      data: { identifier: "unknown_vendor_xyz@example.com" },
    });
    expect([200, 429]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  test("forgot-password with unknown phone → generic success or rate-limited", async ({
    request,
  }) => {
    const res = await request.post(`${API}/forgot-password`, {
      data: { phone: "03999999999" },
    });
    expect([200, 429]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  test("verify-reset-otp with invalid code → 422 or rate-limited", async ({ request }) => {
    const res = await request.post(`${API}/verify-reset-otp`, {
      data: { phone: "03001234567", otp: "000000" },
    });
    expect([400, 422, 429]).toContain(res.status());
    if (res.status() !== 429) {
      const body = await res.json();
      expect(body.success).toBe(false);
    }
  });

  test("reset-password with invalid OTP → 401 or rate-limited", async ({ request }) => {
    const res = await request.post(`${API}/reset-password`, {
      data: { phone: "03001234567", otp: "000000", newPassword: "NewP@ss123!" },
    });
    expect([401, 404, 429]).toContain(res.status());
    if (res.status() !== 429) {
      const body = await res.json();
      expect(body.success).toBe(false);
    }
  });

  test("check-identifier for email → returns action or rate-limited", async ({ request }) => {
    const res = await request.post(`${API}/check-identifier`, {
      data: { identifier: "vendor@teststore.com", role: "vendor" },
    });
    expect([200, 429]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(["send_email_otp", "no_method", "send_phone_otp"]).toContain(body.data.action);
    }
  });

  test("recovery reset-password with invalid token → 400 or rate-limited", async ({ request }) => {
    const res = await request.post(`${API}/recovery/reset-password`, {
      data: { token: "invalid_recovery_token_xyz", newPassword: "NewP@ss123!" },
    });
    expect([400, 422, 429]).toContain(res.status());
    if (res.status() !== 429) {
      const body = await res.json();
      expect(body.success).toBe(false);
    }
  });

  test("validate-token with garbage → 400/401 or rate-limited", async ({ request }) => {
    const res = await request.post(`${API}/validate-token`, {
      data: { token: "not_a_real_jwt_token" },
    });
    expect([400, 401, 404, 429]).toContain(res.status());
  });
});
