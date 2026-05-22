import { vi } from "vitest";

vi.mock("../src/lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
  pinoInstance: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/lib/redis.js", () => ({
  redisClient: null,
}));

vi.mock("../src/lib/metrics/responseTime.js", () => ({
  recordResponseTime: vi.fn(),
}));
