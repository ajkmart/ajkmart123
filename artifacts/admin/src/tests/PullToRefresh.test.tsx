import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PullToRefresh } from "../components/PullToRefresh";

vi.mock("@/lib/adminTiming", () => ({
  getAdminTiming: () => ({
    pullToRefreshThresholdPx: 80,
    pullToRefreshIntervalMs: 15_000,
    refetchIntervalCategoriesMs: 30_000,
  }),
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("@workspace/logger", () => ({
  createLogger: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  registerErrorHandler: vi.fn(),
}));

/**
 * Simulate a full pull gesture, flushing React state between move and end
 * so the `onTouchEnd` closure captures the updated `pullY`.
 */
async function simulatePull(element: Element, deltaY: number) {
  act(() => {
    fireEvent.touchStart(element, { touches: [{ clientX: 150, clientY: 0 }] });
    fireEvent.touchMove(element, { touches: [{ clientX: 150, clientY: deltaY }] });
  });
  act(() => {
    fireEvent.touchEnd(element);
  });
}

describe("Admin PullToRefresh", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollY", { writable: true, value: 0 });
    Object.defineProperty(document.documentElement, "scrollTop", { writable: true, value: 0 });
  });

  it("renders children correctly", () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <div data-testid="child-content">Hello World</div>
      </PullToRefresh>
    );
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("shows spinner on pull gesture (simulate touchstart/touchmove/touchend)", () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <div>content</div>
      </PullToRefresh>
    );
    const wrapper = container.firstChild as Element;

    act(() => {
      fireEvent.touchStart(wrapper, { touches: [{ clientX: 150, clientY: 0 }] });
      fireEvent.touchMove(wrapper, { touches: [{ clientX: 150, clientY: 100 }] });
    });

    expect(
      screen.queryByText("Pull to refresh") ??
        screen.queryByText("Release to refresh") ??
        screen.queryByText("Updating...")
    ).toBeTruthy();
  });

  it("calls onRefresh when pulled far enough (>80px threshold)", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <div>content</div>
      </PullToRefresh>
    );
    const wrapper = container.firstChild as Element;

    await simulatePull(wrapper, 200);

    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("does not call onRefresh when pulled less than threshold", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <div>content</div>
      </PullToRefresh>
    );
    const wrapper = container.firstChild as Element;

    await simulatePull(wrapper, 20);

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("'Last updated' timestamp is visible after refresh", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <div>content</div>
      </PullToRefresh>
    );
    const wrapper = container.firstChild as Element;

    await simulatePull(wrapper, 200);

    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.queryByText(/Updated/i) ?? screen.queryByText(/Just now/i)).toBeInTheDocument();
    });
  });

  it("uses the admin blue (#1A56DB) as default accent color on the icon", () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <div>content</div>
      </PullToRefresh>
    );
    const wrapper = container.firstChild as Element;

    act(() => {
      fireEvent.touchStart(wrapper, { touches: [{ clientX: 150, clientY: 0 }] });
      fireEvent.touchMove(wrapper, { touches: [{ clientX: 150, clientY: 100 }] });
    });

    const icon = container.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveStyle({ color: "#1A56DB" });
  });
});
