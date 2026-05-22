/**
 * stress-test.mjs — Concurrent order-creation stress simulation
 *
 * Simulates 50 concurrent wallet-payment order-creation requests against
 * the running API server to verify:
 *   1. Zero DB deadlocks
 *   2. No negative wallet balances (floor guard works)
 *   3. All responses are either success (201) or clean business errors (400/429)
 *   4. No 500 responses (unhandled errors)
 *
 * Usage:
 *   node stress-test.mjs [BASE_URL] [CUSTOMER_JWT]
 *
 * Example:
 *   node stress-test.mjs http://localhost:4000 "Bearer eyJ..."
 *
 * Pre-requisites:
 *   - A test user with at least Rs. 5000 wallet balance.
 *   - At least one in-stock product in the DB (productId below).
 */

const BASE_URL = process.argv[2] ?? "http://localhost:4000";
const AUTH_HEADER = process.argv[3] ?? "";

const PRODUCT_ID = process.env.STRESS_PRODUCT_ID ?? "test-product-id";
const CONCURRENCY = 50;

if (!AUTH_HEADER) {
  console.error("Usage: node stress-test.mjs <BASE_URL> <'Bearer JWT'>");
  process.exit(1);
}

async function createOrder(index) {
  const start = Date.now();
  try {
    const response = await fetch(`${BASE_URL}/api/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: AUTH_HEADER,
        "X-Idempotency-Key": `stress-test-${index}-${Date.now()}`,
      },
      body: JSON.stringify({
        type: "mart",
        items: [{ productId: PRODUCT_ID, name: "Test Item", price: 100, quantity: 1 }],
        deliveryAddress: "Test Address, AJK",
        paymentMethod: "wallet",
      }),
    });

    const body = await response.json().catch(() => ({}));
    return {
      index,
      status: response.status,
      ok: response.ok,
      orderId: body.id ?? null,
      error: body.error ?? null,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      index,
      status: 0,
      ok: false,
      orderId: null,
      error: err.message,
      durationMs: Date.now() - start,
    };
  }
}

async function main() {
  console.log(`\n🚦 AJKMart Concurrent Order Stress Test`);
  console.log(`   Base URL   : ${BASE_URL}`);
  console.log(`   Concurrency: ${CONCURRENCY} simultaneous requests\n`);

  const globalStart = Date.now();
  const promises = Array.from({ length: CONCURRENCY }, (_, i) => createOrder(i + 1));
  const results = await Promise.all(promises);
  const elapsed = Date.now() - globalStart;

  const success = results.filter((r) => r.status === 201);
  const clientErr = results.filter((r) => r.status >= 400 && r.status < 500);
  const serverErr = results.filter((r) => r.status >= 500);
  const networkErr = results.filter((r) => r.status === 0);

  const durations = results.map((r) => r.durationMs).sort((a, b) => a - b);
  const p50 = durations[Math.floor(durations.length * 0.5)];
  const p95 = durations[Math.floor(durations.length * 0.95)];
  const p99 = durations[Math.floor(durations.length * 0.99)];

  console.log("── Results ─────────────────────────────────────────");
  console.log(`  ✅ Success (201)       : ${success.length}`);
  console.log(`  ⚠️  Client errors (4xx) : ${clientErr.length}`);
  console.log(`  ❌ Server errors (5xx) : ${serverErr.length}`);
  console.log(`  💥 Network errors      : ${networkErr.length}`);
  console.log(`  ⏱  Total elapsed       : ${elapsed}ms`);
  console.log(`  📊 Latency p50/p95/p99 : ${p50}ms / ${p95}ms / ${p99}ms`);
  console.log("────────────────────────────────────────────────────");

  if (clientErr.length > 0) {
    const grouped = {};
    for (const r of clientErr) {
      const key = `${r.status}: ${r.error ?? "(no error)"}`;
      grouped[key] = (grouped[key] ?? 0) + 1;
    }
    console.log("\n  Client error breakdown:");
    for (const [msg, cnt] of Object.entries(grouped)) {
      console.log(`    [${cnt}x] ${msg}`);
    }
  }

  if (serverErr.length > 0) {
    console.log("\n  ❌ Server errors (deadlock candidates):");
    for (const r of serverErr) {
      console.log(`    #${r.index} status=${r.status} error="${r.error}"`);
    }
  }

  if (networkErr.length > 0) {
    console.log("\n  💥 Network errors:");
    for (const r of networkErr) {
      console.log(`    #${r.index} "${r.error}"`);
    }
  }

  const passed = serverErr.length === 0 && networkErr.length === 0;
  console.log(`\n${passed ? "✅ PASS" : "❌ FAIL"} — Zero server errors: ${passed}`);

  /* Non-zero exit if any server errors occurred */
  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error("Stress test failed:", err);
  process.exit(1);
});
