import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GoalSection } from "../src/components/home/GoalSection";

vi.mock("../src/lib/api", () => ({
  api: { updateProfile: vi.fn().mockResolvedValue({}) },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const defaultProps = {
  adminGoal: 3000,
  personalGoal: null,
  todayEarnings: 1200,
  currency: "Rs.",
  T: (key: string) => key,
  showToast: vi.fn(),
  refreshUser: vi.fn().mockResolvedValue(undefined),
};

describe("GoalSection", () => {
  it("renders without crashing", () => {
    render(<GoalSection {...defaultProps} />, { wrapper });
    expect(screen.getByRole("button", { name: /daily goal/i })).toBeTruthy();
  });

  it("shows goal progress percentage", () => {
    render(<GoalSection {...defaultProps} />, { wrapper });
    // 1200 / 3000 = 40%
    expect(screen.getByText("40%")).toBeTruthy();
  });

  it("shows personal goal badge when personalGoal is set", () => {
    render(<GoalSection {...defaultProps} personalGoal={2000} />, { wrapper });
    expect(screen.getByText("myGoalBadge")).toBeTruthy();
  });

  it("shows 100% and reached state when goal is met", () => {
    render(<GoalSection {...defaultProps} todayEarnings={4000} />, { wrapper });
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByText("dailyGoalReached")).toBeTruthy();
  });
});
