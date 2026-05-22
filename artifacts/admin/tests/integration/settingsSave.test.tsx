import { setupAdminFetcherHandlers } from "@/lib/adminFetcher";
import { SystemSection } from "@/pages/settings-system";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { server } from "./utils/server";

/**
 * Wires the admin fetcher with a static access token so SystemSection's
 * underlying `apiAbsoluteFetchRaw` calls succeed without booting the full
 * AdminAuthProvider. Refresh is a no-op — these tests cover the save flow,
 * not the auth bootstrap (that lives in adminAuth.test.tsx).
 */
function wireFetcher(token = "test-access-token") {
  setupAdminFetcherHandlers(
    () => token,
    async () => token
  );
}

function setCsrfCookie(value: string) {
  document.cookie = `csrf_token=${value}; path=/`;
}

function installDefaultGetHandlers(opts: { backups?: unknown[] } = {}) {
  const backups = opts.backups ?? [];
  server.use(
    http.get("/api/admin/system/stats", () =>
      HttpResponse.json({ data: { stats: { users: 1, products: 2 } } })
    ),
    http.get("/api/admin/system/snapshots", () => HttpResponse.json({ data: { snapshots: [] } })),
    http.get("/api/admin/system/demo-backups", () => HttpResponse.json({ data: backups })),
    // Mount-time fetches from the maintenance + retention sections of the
    // page. SystemSection renders these collapsibles even when collapsed.
    http.get("/api/admin/system/maintenance-schedule", () =>
      HttpResponse.json({
        data: { scheduledStart: null, scheduledEnd: null, scheduledMsg: "" },
      })
    ),
    http.get("/api/admin/system/retention-policies", () =>
      HttpResponse.json({ data: { policies: {} } })
    )
  );
}

describe("Settings save flow (settings-system.tsx)", () => {
  beforeEach(() => {
    setCsrfCookie("csrf-from-test");
  });

  it("POSTs the demo-backup label with bearer + csrf headers and refreshes the list", async () => {
    wireFetcher("save-token");
    installDefaultGetHandlers({ backups: [] });

    let savedRequest: { auth: string | null; csrf: string | null; body: any } = {
      auth: null,
      csrf: null,
      body: null,
    };
    let getCalls = 0;

    server.use(
      http.post("/api/admin/system/demo-backups", async ({ request }) => {
        savedRequest = {
          auth: request.headers.get("authorization"),
          csrf: request.headers.get("x-csrf-token"),
          body: await request.json(),
        };
        return HttpResponse.json({ data: { id: "snap-1" } });
      }),
      // Override the GET to return the new snapshot on the second call
      // (after the save completes and `loadDemoBackups` re-fires).
      http.get("/api/admin/system/demo-backups", () => {
        getCalls += 1;
        if (getCalls === 1) {
          return HttpResponse.json({ data: [] });
        }
        return HttpResponse.json({
          data: [
            {
              id: "snap-1",
              label: "Clean Demo State",
              rowsTotal: 42,
              sizeKb: 7,
              createdAt: new Date().toISOString(),
            },
          ],
        });
      })
    );

    render(<SystemSection />);

    // Wait for the empty-state message to render so we know mount-time
    // GETs settled before we interact.
    await waitFor(() =>
      expect(screen.getByText(/No demo snapshots saved yet/i)).toBeInTheDocument()
    );

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/Snapshot name/i);
    await user.type(input, "Clean Demo State");

    const saveBtn = screen.getByRole("button", { name: /Save Snapshot/i });
    await user.click(saveBtn);

    await waitFor(() => expect(savedRequest.body).not.toBeNull());
    expect(savedRequest.body).toEqual({ label: "Clean Demo State" });
    expect(savedRequest.auth).toBe("Bearer save-token");
    expect(savedRequest.csrf).toBe("csrf-from-test");

    // The list refresh should pull in the new snapshot.
    await waitFor(() => expect(screen.getByText("Clean Demo State")).toBeInTheDocument());

    // Input is reset after a successful save.
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("falls back to a date-stamped label when the input is empty", async () => {
    wireFetcher("save-token");
    installDefaultGetHandlers({ backups: [] });

    let receivedLabel: string | null = null;
    server.use(
      http.post("/api/admin/system/demo-backups", async ({ request }) => {
        const body = (await request.json()) as { label: string };
        receivedLabel = body.label;
        return HttpResponse.json({ data: { id: "snap-2" } });
      })
    );

    render(<SystemSection />);
    await waitFor(() =>
      expect(screen.getByText(/No demo snapshots saved yet/i)).toBeInTheDocument()
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Save Snapshot/i }));

    await waitFor(() => expect(receivedLabel).not.toBeNull());
    expect(receivedLabel).toMatch(/^Demo Backup /);
  });

  it("surfaces a server error toast when the save fails and keeps the label intact", async () => {
    wireFetcher("save-token");
    installDefaultGetHandlers({ backups: [] });

    server.use(
      http.post("/api/admin/system/demo-backups", () =>
        HttpResponse.json({ error: "Disk full" }, { status: 500 })
      )
    );

    render(<SystemSection />);
    await waitFor(() =>
      expect(screen.getByText(/No demo snapshots saved yet/i)).toBeInTheDocument()
    );

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/Snapshot name/i);
    await user.type(input, "My Snapshot");
    await user.click(screen.getByRole("button", { name: /Save Snapshot/i }));

    // After a failed save the input is preserved (so the user can retry)
    // and the save button is no longer in its loading state.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Save Snapshot/i })).toBeEnabled()
    );
    expect((input as HTMLInputElement).value).toBe("My Snapshot");
  });
});
