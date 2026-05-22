import { setupAdminFetcherHandlers } from "@/lib/adminFetcher";
import Transactions from "@/pages/transactions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "./utils/server";

function wireFetcher(token = "csv-test-token") {
  setupAdminFetcherHandlers(
    () => token,
    async () => token
  );
}

function setCsrfCookie(value: string) {
  document.cookie = `csrf_token=${value}; path=/`;
}

/**
 * `useLanguage` (consumed by Transactions) calls `/api/admin/me/language`
 * and falls back to `/api/admin/platform-settings`. Stub both so MSW does
 * not log unhandled-request errors during the CSV flow.
 */
function installLanguageHandlers() {
  server.use(
    http.get("/api/admin/me/language", () => HttpResponse.json({ data: { language: "en" } })),
    http.get("/api/admin/platform-settings", () => HttpResponse.json({ data: { settings: [] } }))
  );
}

function renderTransactions() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchInterval: false,
        gcTime: 0,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Transactions />
    </QueryClientProvider>
  );
}

describe("Transactions CSV export integration", () => {
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;
  let anchorClickSpy: ReturnType<typeof vi.spyOn>;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    setCsrfCookie("csrf-csv");
    wireFetcher();
    installLanguageHandlers();

    createObjectURLSpy = vi.fn(() => "blob:mock-url");
    revokeObjectURLSpy = vi.fn();
    // jsdom does not implement createObjectURL — install spies first.
    URL.createObjectURL = createObjectURLSpy as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURLSpy as unknown as typeof URL.revokeObjectURL;

    // Prevent jsdom from navigating when the hidden anchor is clicked.
    anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    anchorClickSpy.mockRestore();
    vi.useRealTimers();
  });

  it("downloads a CSV blob and revokes the object URL after clicking Export", async () => {
    const transactions = [
      {
        id: "txn_aaaaaaaa1",
        userId: "user_aaaaaaaa1",
        userName: "Alice Khan",
        userPhone: "03001234567",
        type: "credit",
        amount: 1500,
        description: "Top-up via card",
        createdAt: "2026-04-01T12:00:00.000Z",
      },
      {
        id: "txn_bbbbbbbb2",
        userId: "user_bbbbbbbb2",
        userName: "Bilal Ahmed",
        userPhone: "03007654321",
        type: "debit",
        amount: 250,
        description: "Order #1234, paid",
        createdAt: "2026-04-02T10:00:00.000Z",
      },
    ];

    server.use(
      http.get("/api/admin/transactions-enriched", () =>
        HttpResponse.json({
          data: { transactions, totalCredit: 1500, totalDebit: 250 },
        })
      )
    );

    renderTransactions();

    // Wait for the rows to land in the table.
    await waitFor(() => expect(screen.getByText("Alice Khan")).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^CSV$/i }));

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURLSpy.mock.calls[0][0] as Blob;
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toBe("text/csv");
    const csvText = await blobArg.text();
    expect(csvText.split("\n")[0]).toBe("ID,User,Phone,Type,Amount,Description,Date");
    expect(csvText).toContain("Alice Khan");
    expect(csvText).toContain("Bilal Ahmed");
    // Commas in descriptions are sanitized to ';' so columns stay aligned.
    expect(csvText).toContain("Order #1234; paid");
    // Date column truncates to YYYY-MM-DD.
    expect(csvText).toContain("2026-04-01");

    // The anchor was clicked exactly once with the blob URL set.
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);

    // The export schedules a microtask via setTimeout(0) to revoke the URL.
    await waitFor(() => expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1));
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-url");
  });

  it("only exports rows that match the active filters", async () => {
    const transactions = [
      {
        id: "txn_credit_1",
        userId: "user_credit_1",
        userName: "Credit Carol",
        userPhone: "0301",
        type: "credit",
        amount: 100,
        description: "credit row",
        createdAt: "2026-04-01T00:00:00.000Z",
      },
      {
        id: "txn_debit_1",
        userId: "user_debit_1",
        userName: "Debit Dan",
        userPhone: "0302",
        type: "debit",
        amount: 50,
        description: "debit row",
        createdAt: "2026-04-02T00:00:00.000Z",
      },
    ];

    server.use(
      http.get("/api/admin/transactions-enriched", () =>
        HttpResponse.json({
          data: { transactions, totalCredit: 100, totalDebit: 50 },
        })
      )
    );

    renderTransactions();
    await waitFor(() => expect(screen.getByText("Credit Carol")).toBeInTheDocument());

    const user = userEvent.setup();
    // Restrict to credits only.
    await user.click(screen.getByRole("button", { name: /▲/ }));

    await user.click(screen.getByRole("button", { name: /^CSV$/i }));

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURLSpy.mock.calls[0][0] as Blob;
    const csvText = await blobArg.text();
    expect(csvText).toContain("Credit Carol");
    expect(csvText).not.toContain("Debit Dan");

    await waitFor(() => expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1));
  });
});
