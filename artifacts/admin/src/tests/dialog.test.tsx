import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";

vi.mock("@workspace/logger", () => ({
  createLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
  registerErrorHandler: vi.fn(),
}));

function TestDialog({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <Dialog defaultOpen={defaultOpen}>
      <DialogTrigger asChild>
        <button>Open Dialog</button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Test Dialog</DialogTitle>
        </DialogHeader>
        <p>Dialog body content</p>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog component", () => {
  it("dialog opens when trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);

    expect(screen.queryByText("Dialog body content")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open Dialog" }));

    await waitFor(() => {
      expect(screen.getByText("Dialog body content")).toBeInTheDocument();
    });
  });

  it("dialog closes when X (Close dialog) button is clicked", async () => {
    const user = userEvent.setup();
    render(<TestDialog defaultOpen />);

    await waitFor(() => {
      expect(screen.getByText("Dialog body content")).toBeInTheDocument();
    });

    const closeButton = screen.getByRole("button", { name: "Close dialog" });
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText("Dialog body content")).not.toBeInTheDocument();
    });
  });

  it('close button has aria-label="Close dialog"', async () => {
    render(<TestDialog defaultOpen />);

    await waitFor(() => {
      const closeButton = screen.getByRole("button", { name: "Close dialog" });
      expect(closeButton).toHaveAttribute("aria-label", "Close dialog");
    });
  });

  it("DialogContent renders with aria-describedby={undefined} — no Radix warning", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<TestDialog defaultOpen />);

    await waitFor(() => {
      expect(screen.getByText("Dialog body content")).toBeInTheDocument();
    });

    const content = document.querySelector('[role="dialog"]');
    expect(content).toBeInTheDocument();
    expect(content?.getAttribute("aria-describedby")).toBeNull();

    const warnMessages = consoleSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((msg) => msg.includes("DialogDescription") || msg.includes("aria-describedby"));
    expect(warnMessages).toHaveLength(0);

    consoleSpy.mockRestore();
  });

  it("dialog title is rendered correctly", async () => {
    render(<TestDialog defaultOpen />);

    await waitFor(() => {
      expect(screen.getByText("Test Dialog")).toBeInTheDocument();
    });
  });
});
