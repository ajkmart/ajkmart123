import { AdminAuthProvider, useAdminAuth } from "@/lib/adminAuthContext";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./utils/server";

function setCsrfCookie(value: string | null) {
  if (value === null) {
    document.cookie = "csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    return;
  }
  document.cookie = `csrf_token=${value}; path=/`;
}

function AuthHarness() {
  const { state, login, logout, refreshAccessToken, clearError } = useAdminAuth();
  return (
    <div>
      <p data-testid="loading">{state.isLoading ? "loading" : "ready"}</p>
      <p data-testid="token">{state.accessToken ?? "no-token"}</p>
      <p data-testid="user">{state.user?.email ?? "no-user"}</p>
      <p data-testid="error">{state.error ?? "no-error"}</p>
      <button
        type="button"
        data-testid="login-btn"
        onClick={async () => {
          await login("admin", "secret123");
        }}
      >
        login
      </button>
      <button
        type="button"
        data-testid="refresh-btn"
        onClick={async () => {
          await refreshAccessToken();
        }}
      >
        refresh
      </button>
      <button
        type="button"
        data-testid="logout-btn"
        onClick={() => {
          void logout();
        }}
      >
        logout
      </button>
      <button type="button" data-testid="clear-error-btn" onClick={() => clearError()}>
        clear-error
      </button>
    </div>
  );
}

async function renderProvider() {
  const utils = render(
    <AdminAuthProvider>
      <AuthHarness />
    </AdminAuthProvider>
  );
  // Provider runs `restoreSession` on mount; wait for it to settle.
  await waitFor(() => expect(utils.getByTestId("loading")).toHaveTextContent("ready"));
  return utils;
}

describe("AdminAuthProvider integration", () => {
  it("skips refresh on mount when no csrf cookie is present", async () => {
    setCsrfCookie(null);
    let refreshHits = 0;
    server.use(
      http.post("/api/admin/auth/refresh", () => {
        refreshHits += 1;
        return HttpResponse.json({ accessToken: "should-not-fire" });
      })
    );

    await renderProvider();

    expect(refreshHits).toBe(0);
    expect(screen.getByTestId("token")).toHaveTextContent("no-token");
    expect(screen.getByTestId("user")).toHaveTextContent("no-user");
  });

  it("logs in successfully and stores the access token + user", async () => {
    setCsrfCookie(null);
    server.use(
      http.post("/api/admin/auth/login", async ({ request }) => {
        const body = (await request.json()) as {
          username: string;
          password: string;
        };
        expect(body.username).toBe("admin");
        expect(body.password).toBe("secret123");
        return HttpResponse.json({
          accessToken: "access-token-1",
          user: {
            id: "u1",
            name: "Admin One",
            email: "admin@example.com",
            role: "super_admin",
          },
        });
      })
    );

    await renderProvider();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("login-btn"));

    await waitFor(() => expect(screen.getByTestId("token")).toHaveTextContent("access-token-1"));
    expect(screen.getByTestId("user")).toHaveTextContent("admin@example.com");
    expect(screen.getByTestId("error")).toHaveTextContent("no-error");
  });

  it("surfaces the server error message on a failed login and clears it on demand", async () => {
    setCsrfCookie(null);
    server.use(
      http.post("/api/admin/auth/login", () =>
        HttpResponse.json({ error: "Invalid credentials" }, { status: 401 })
      )
    );

    await renderProvider();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("login-btn"));

    await waitFor(() =>
      expect(screen.getByTestId("error")).toHaveTextContent("Invalid credentials")
    );
    expect(screen.getByTestId("token")).toHaveTextContent("no-token");

    await user.click(screen.getByTestId("clear-error-btn"));
    expect(screen.getByTestId("error")).toHaveTextContent("no-error");
  });

  it("restores the session via /auth/refresh when a csrf cookie is present", async () => {
    setCsrfCookie("csrf-1");
    server.use(
      http.post("/api/admin/auth/refresh", () =>
        HttpResponse.json({
          accessToken: "restored-token",
          user: {
            id: "u1",
            name: "Admin One",
            email: "admin@example.com",
            role: "super_admin",
          },
        })
      )
    );

    await renderProvider();

    expect(screen.getByTestId("token")).toHaveTextContent("restored-token");
    expect(screen.getByTestId("user")).toHaveTextContent("admin@example.com");
  });

  it("rotates the access token when refreshAccessToken is called explicitly", async () => {
    setCsrfCookie(null);

    // First, login to seed state.
    server.use(
      http.post("/api/admin/auth/login", () =>
        HttpResponse.json({
          accessToken: "token-A",
          user: { id: "u1", name: "A", email: "a@x.com", role: "admin" },
        })
      )
    );
    await renderProvider();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("login-btn"));
    await waitFor(() => expect(screen.getByTestId("token")).toHaveTextContent("token-A"));

    // Now wire refresh and trigger it.
    let refreshCalls = 0;
    server.use(
      http.post("/api/admin/auth/refresh", () => {
        refreshCalls += 1;
        return HttpResponse.json({
          accessToken: "token-B",
          user: { id: "u1", name: "A", email: "a@x.com", role: "admin" },
        });
      })
    );

    await user.click(screen.getByTestId("refresh-btn"));
    await waitFor(() => expect(screen.getByTestId("token")).toHaveTextContent("token-B"));
    expect(refreshCalls).toBe(1);
  });

  it("dedupes concurrent refresh calls into a single network request", async () => {
    setCsrfCookie("csrf-1");
    let refreshCalls = 0;
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    server.use(
      http.post("/api/admin/auth/refresh", async () => {
        refreshCalls += 1;
        await gate;
        return HttpResponse.json({
          accessToken: `concurrent-${refreshCalls}`,
          user: { id: "u1", name: "A", email: "a@x.com", role: "admin" },
        });
      })
    );

    // Render kicks off the first refresh as the bootstrap call.
    const { getByTestId } = render(
      <AdminAuthProvider>
        <AuthHarness />
      </AdminAuthProvider>
    );

    // Fire two extra refreshes while the first is still in flight.
    await act(async () => {
      getByTestId("refresh-btn").click();
      getByTestId("refresh-btn").click();
    });

    expect(refreshCalls).toBe(1);
    release?.();

    await waitFor(() => expect(getByTestId("token")).toHaveTextContent("concurrent-1"));
    expect(refreshCalls).toBe(1);
  });

  it("clears auth state and surfaces 'Session expired' when refresh is rejected", async () => {
    // Skip the mount-time restore (which swallows errors) and trigger refresh
    // explicitly so the 401 branch surfaces the expected error message.
    setCsrfCookie(null);
    await renderProvider();

    server.use(
      http.post("/api/admin/auth/refresh", () =>
        HttpResponse.json({ error: "expired" }, { status: 401 })
      )
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId("refresh-btn"));

    await waitFor(() =>
      expect(screen.getByTestId("error")).toHaveTextContent("Session expired. Please log in again.")
    );
    expect(screen.getByTestId("token")).toHaveTextContent("no-token");
    expect(screen.getByTestId("user")).toHaveTextContent("no-user");
  });

  it("logs out, posts to /auth/logout with the bearer token, and clears state", async () => {
    setCsrfCookie("csrf-1");

    server.use(
      http.post("/api/admin/auth/refresh", () =>
        HttpResponse.json({
          accessToken: "logout-token",
          user: { id: "u1", name: "A", email: "a@x.com", role: "admin" },
        })
      )
    );

    await renderProvider();
    expect(screen.getByTestId("token")).toHaveTextContent("logout-token");

    let logoutAuthHeader: string | null = null;
    server.use(
      http.post("/api/admin/auth/logout", ({ request }) => {
        logoutAuthHeader = request.headers.get("authorization");
        return HttpResponse.json({ ok: true });
      })
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId("logout-btn"));

    await waitFor(() => expect(screen.getByTestId("token")).toHaveTextContent("no-token"));
    expect(logoutAuthHeader).toBe("Bearer logout-token");
    expect(screen.getByTestId("user")).toHaveTextContent("no-user");
  });
});
