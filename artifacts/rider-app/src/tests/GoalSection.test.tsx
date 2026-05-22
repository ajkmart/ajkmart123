// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api", () => ({
  api: { updateProfile: vi.fn().mockResolvedValue({}) },
}));

vi.mock("../components/dashboard", () => ({
  formatCurrency: (v: number, c: string) => `${c}${v}`,
}));

vi.mock("lucide-react", () => ({
  Target: () => null,
  CheckCircle: () => null,
  Pencil: () => null,
  X: () => null,
}));

import { GoalSection } from "../components/home/GoalSection";

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<GoalSection {...defaultProps} />, { wrapper });
    const btn = screen.getByRole("button");
    expect(btn).toBeDefined();
  });

  it("shows goal progress percentage (40% of 3000)", () => {
    render(<GoalSection {...defaultProps} />, { wrapper });
    expect(screen.getByText("40%")).toBeDefined();
  });

  it("shows 100% when earnings exceed goal", () => {
    render(<GoalSection {...defaultProps} todayEarnings={4000} />, { wrapper });
    expect(screen.getByText("100%")).toBeDefined();
  });

  it("uses adminGoal as fallback when personalGoal is null", () => {
    render(<GoalSection {...defaultProps} />, { wrapper });
    // Should display the daily goal label
    expect(screen.getByText("dailyGoal")).toBeDefined();
  });
});
