/**
 * @workspace/auth-react – Shared Component Tests
 */

import { describe, expect, it } from "vitest";

describe("OtpInput", () => {
  it("exports OtpInput component", async () => {
    const mod = await import("../src/index");
    expect(typeof mod.OtpInput).toBe("function");
  });
});

describe("PhoneInput", () => {
  it("exports PhoneInput component", async () => {
    const mod = await import("../src/index");
    expect(typeof mod.PhoneInput).toBe("function");
  });
});

describe("PasswordInput", () => {
  it("exports PasswordInput component", async () => {
    const mod = await import("../src/index");
    expect(typeof mod.PasswordInput).toBe("function");
  });
});

describe("LoginScreen", () => {
  it("exports LoginScreen component", async () => {
    const mod = await import("../src/index");
    expect(typeof mod.LoginScreen).toBe("function");
  });
});

describe("useLoginFlow", () => {
  it("exports useLoginFlow hook", async () => {
    const mod = await import("../src/index");
    expect(typeof mod.useLoginFlow).toBe("function");
  });
});

describe("AuthProvider", () => {
  it("exports AuthProvider", async () => {
    const mod = await import("../src/index");
    expect(typeof mod.AuthProvider).toBe("function");
  });
});

describe("tokenStorage", () => {
  it("exports getTokenStorage", async () => {
    const mod = await import("../src/index");
    expect(typeof mod.getTokenStorage).toBe("function");
  });
});
