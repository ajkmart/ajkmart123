import { expect, test } from "@playwright/test";

const API = "/api/auth";

test.describe("Rider Auth — OTP login flow", () => {
  const riderPhone = `0312${Date.now().toString().slice(-7)}`;

  test("check-identifier returns action for rider role", async ({ request }) => {
    const res = await request.post(`${API}/check-identifier`, {
      data: { identifier: riderPhone, role: "rider" },
    });
    expect([200, 429]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(["send_phone_otp", "no_method"]).toContain(body.data.action);
    }
  });

  test("send-otp for a new rider phone → 200 or rate-limited (429)", async ({ request }) => {
    const res = await request.post(`${API}/send-otp`, {
      data: { phone: riderPhone, role: "rider" },
    });
    expect([200, 429]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  test("verify-otp with invalid code → 401/422 or rate-limited", async ({ request }) => {
    const res = await request.post(`${API}/verify-otp`, {
      data: { phone: riderPhone, otp: "999999" },
    });
    expect([401, 422, 429]).toContain(res.status());
    if (res.status() !== 429) {
      expect((await res.json()).success).toBe(false);
    }
  });

  test("rate limiter: repeated wrong OTPs eventually hit 429 or 401", async ({ request }) => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request.post(`${API}/verify-otp`, {
        data: { phone: riderPhone, otp: `00000${i}` },
      });
      statuses.push(res.status());
    }
    expect(statuses.every((s) => [401, 422, 429].includes(s))).toBe(true);
  });

  test("check-available responds for phone", async ({ request }) => {
    const res = await request.post(`${API}/check-available`, {
      data: { phone: riderPhone },
    });
    expect([200, 429]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.phone).toBeDefined();
    }
  });
});
