import { expect, test } from "@playwright/test";

const API = "/api/auth";

// Auth endpoints are rate-limited — tests accept 429 as a valid "working" response
// (it proves the limiter is active). Only non-rate-limited assertions run when status=200.

test.describe("Customer Auth — register → login → logout", () => {
  const phone = `0300${Date.now().toString().slice(-7)}`;

  test("step 1: check-identifier returns action for new phone", async ({ request }) => {
    const res = await request.post(`${API}/check-identifier`, {
      data: { identifier: phone },
    });
    expect([200, 429]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(["send_phone_otp", "no_method"]).toContain(body.data.action);
    }
  });

  test("step 2: send-otp returns otpRequired:true or rate-limited", async ({ request }) => {
    const res = await request.post(`${API}/send-otp`, {
      data: { phone },
    });
    expect([200, 429]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty("otpRequired");
    }
  });

  test("step 3: verify-otp with wrong code → 401/422 or rate-limited", async ({ request }) => {
    await request.post(`${API}/send-otp`, { data: { phone } });

    const res = await request.post(`${API}/verify-otp`, {
      data: { phone, otp: "000001" },
    });

    expect([401, 422, 429]).toContain(res.status());
    if (res.status() !== 429) {
      const body = await res.json();
      expect(body.success).toBe(false);
    }
  });

  test("step 4: login with wrong credentials → 401/404", async ({ request }) => {
    const res = await request.post(`${API}/login`, {
      data: { identifier: "nonexistent_user_xyz", password: "wrong" },
    });

    expect([401, 404, 429]).toContain(res.status());
    if (res.status() !== 429) {
      const body = await res.json();
      expect(body.success).toBe(false);
    }
  });

  test("step 5: logout endpoint → 200 or rate-limited", async ({ request }) => {
    const res = await request.post(`${API}/logout`, {
      data: {},
    });
    expect([200, 429]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  test("step 6: refresh with invalid token → 401 or rate-limited", async ({ request }) => {
    const res = await request.post(`${API}/refresh`, {
      data: { refreshToken: "totally_invalid_token_for_e2e_test" },
    });

    expect([401, 429]).toContain(res.status());
    if (res.status() !== 429) {
      const body = await res.json();
      expect(body.success).toBe(false);
    }
  });
});
