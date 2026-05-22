import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PullToRefresh } from "../components/PullToRefresh";

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
 * Split act calls so React flushes state from touchMove before touchEnd
 * fires — otherwise the `onTouchEnd` closure captures stale pullY=0.
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

describe("Vendor PullToRefresh", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollY", { writable: true, value: 0 });
    Object.defineProperty(document.documentElement, "scrollTop", { writable: true, value: 0 });
  });

  it("renders children correctly", () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <div data-testid="vendor-child">Vendor Content</div>
      </PullToRefresh>
    );
    expect(screen.getByTestId("vendor-child")).toBeInTheDocument();
    expect(screen.getByText("Vendor Content")).toBeInTheDocument();
  });

  it("applies orange accent color (#F59E0B) as vendor theme default", () => {
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
    expect(icon).toHaveStyle({ color: "#F59E0B" });
  });

  it("allows overriding the accent color", () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <PullToRefresh onRefresh={onRefresh} accentColor="#FF0000">
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
    expect(icon).toHaveStyle({ color: "#FF0000" });
  });

  it("calls onRefresh when pulled beyond threshold (>80px dampened = >160px raw)", async () => {
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

  it("does not call onRefresh when pull is below threshold", async () => {
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

  it("shows pull indicator text during pull gesture", () => {
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

  it("calls onRefreshError callback when refresh fails", async () => {
    const error = new Error("fetch failed");
    const onRefresh = vi.fn().mockRejectedValue(error);
    const onRefreshError = vi.fn();
    const { container } = render(
      <PullToRefresh onRefresh={onRefresh} onRefreshError={onRefreshError}>
        <div>content</div>
      </PullToRefresh>
    );
    const wrapper = container.firstChild as Element;

    await simulatePull(wrapper, 200);

    await waitFor(() => {
      expect(onRefreshError).toHaveBeenCalledWith(error);
    });
  });
});
