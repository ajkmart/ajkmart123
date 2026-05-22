import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireAndForget } from "../../lib/fireAndForget.js";

type LogArgs = Record<string, unknown>;
interface MockLogger {
  warn: ReturnType<typeof vi.fn>;
}

function makeLogger(): MockLogger {
  return { warn: vi.fn() };
}

describe("fireAndForget", () => {
  let logger: MockLogger;

  beforeEach(() => {
    logger = makeLogger();
  });

  it("executes async function without blocking caller", async () => {
    let executed = false;
    const promise = (async () => {
      await new Promise((r) => setTimeout(r, 10));
      executed = true;
    })();

    fireAndForget(
      promise,
      "test:execute",
      logger as unknown as Parameters<typeof fireAndForget>[2]
    );
    // caller should continue immediately
    expect(executed).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(executed).toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("catches errors without throwing (non-fatal)", async () => {
    const err = new Error("boom");
    const promise = Promise.reject(err);

    fireAndForget(
      promise,
      "test:non-fatal",
      logger as unknown as Parameters<typeof fireAndForget>[2]
    );
    await new Promise((r) => setTimeout(r, 20));

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(() =>
      fireAndForget(promise, "", logger as unknown as Parameters<typeof fireAndForget>[2])
    ).not.toThrow();
  });

  it("logs error with correct label and code", async () => {
    const err = Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
    const promise = Promise.reject(err);

    fireAndForget(
      promise,
      "webhook:order_delivered",
      logger as unknown as Parameters<typeof fireAndForget>[2]
    );
    await new Promise((r) => setTimeout(r, 20));

    expect(logger.warn).toHaveBeenCalledOnce();
    const args = logger.warn.mock.calls[0] as [LogArgs, string];
    expect(args[0].label).toBe("webhook:order_delivered");
    expect(args[0].error).toBe("connection refused");
    expect(args[0].code).toBe("ECONNREFUSED");
    expect(args[0].message).toBe("[fireAndForget] webhook:order_delivered failed");
  });

  it("works with a stub logger (warn is no-op)", async () => {
    const stubLog = { warn: () => {} } as unknown as Parameters<typeof fireAndForget>[2];
    const promise = Promise.reject(new Error("fail"));
    expect(() => fireAndForget(promise, "test:stub-logger", stubLog)).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    // no unhandled rejection — stub .warn() swallows the error
  });

  it("includes correlationId and extra meta in log", async () => {
    const promise = Promise.reject(new Error("oops"));

    fireAndForget(
      promise,
      "otp-cleanup",
      logger as unknown as Parameters<typeof fireAndForget>[2],
      {
        userId: "u-123",
        correlationId: "corr-abc",
        extra: "field",
      }
    );
    await new Promise((r) => setTimeout(r, 20));

    const args = logger.warn.mock.calls[0] as [LogArgs, string];
    expect(args[0].correlationId).toBe("corr-abc");
    expect(args[0].userId).toBe("u-123");
    expect(args[0].extra).toBe("field");
  });
});
