import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeRequestList } from "../src/components/home/HomeRequestList";

vi.mock("../src/components/dashboard", () => ({
  OrderRequestCard: ({ order }: any) => <div data-testid="order-card">{order?.id ?? "order"}</div>,
  RideRequestCard: ({ ride }: any) => <div data-testid="ride-card">{ride?.id ?? "ride"}</div>,
}));

const noop = vi.fn();

const baseProps = {
  requestsLoading: false,
  requestsError: false,
  totalRequests: 0,
  dismissed: new Set<string>(),
  onClearDismissed: noop,
  orders: [],
  rides: [],
  currency: "Rs.",
  config: { deliveryFee: 100, finance: { riderEarningPct: 80 } },
  onAcceptOrder: noop,
  onRejectOrder: noop,
  onAcceptRide: noop,
  onCounterRide: noop,
  onRejectOffer: noop,
  onIgnoreRide: noop,
  onDismiss: noop,
  acceptOrderPending: false,
  rejectOrderPending: false,
  acceptRidePending: false,
  counterRidePending: false,
  rejectOfferPending: false,
  ignoreRidePending: false,
  requestsServerTime: null,
  userId: "user-1",
  isRestricted: false,
  onRetry: noop,
  T: (key: string) => key,
};

describe("HomeRequestList", () => {
  it("renders without crashing with empty lists", () => {
    const { container } = render(<HomeRequestList {...baseProps} />);
    expect(container).toBeTruthy();
  });

  it("shows loading spinner when requestsLoading is true", () => {
    render(<HomeRequestList {...baseProps} requestsLoading={true} />);
    expect(screen.getByText(/loading requests/i)).toBeTruthy();
  });

  it("shows order cards for each order", () => {
    const orders = [
      { id: "ord-1", status: "pending" },
      { id: "ord-2", status: "pending" },
    ] as any[];
    render(<HomeRequestList {...baseProps} orders={orders} totalRequests={2} />);
    const cards = screen.getAllByTestId("order-card");
    expect(cards.length).toBe(2);
  });

  it("shows ride cards for each ride", () => {
    const rides = [{ id: "ride-1", status: "pending" }] as any[];
    render(<HomeRequestList {...baseProps} rides={rides} totalRequests={1} />);
    expect(screen.getByTestId("ride-card")).toBeTruthy();
  });
});
