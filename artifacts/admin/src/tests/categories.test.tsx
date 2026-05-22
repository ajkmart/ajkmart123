import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/adminFetcher", () => ({
  adminFetch: vi.fn(),
}));

vi.mock("@/lib/adminTiming", () => ({
  getAdminTiming: () => ({
    pullToRefreshThresholdPx: 80,
    pullToRefreshIntervalMs: 15_000,
    refetchIntervalCategoriesMs: 30_000,
    refetchIntervalLaunchControlMs: 30_000,
    refetchIntervalAppManagementMs: 30_000,
  }),
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("@workspace/logger", () => ({
  createLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  registerErrorHandler: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/hooks/useErrorHandler", () => ({
  useErrorHandler: () => ({ onError: vi.fn() }),
}));

vi.mock("@/lib/useLanguage", () => ({
  useLanguage: () => ({ language: "en" }),
}));

vi.mock("@workspace/i18n", () => ({
  tDual: (key: string) => key,
  t: (key: string) => key,
}));

vi.mock("@/components/shared", () => ({
  PageHeader: ({
    title,
    actions,
    children,
  }: {
    title: string;
    actions?: ReactNode;
    children?: ReactNode;
  }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {actions}
      {children}
    </div>
  ),
}));

vi.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@hello-pangea/dnd", () => ({
  DragDropContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  Droppable: ({ children }: { children: (p: object, s: object) => ReactNode }) =>
    children(
      { innerRef: () => {}, droppableProps: {}, placeholder: null },
      { isDraggingOver: false }
    ),
  Draggable: ({ children }: { children: (p: object, s: object) => ReactNode }) =>
    children(
      { innerRef: () => {}, draggableProps: {}, dragHandleProps: {} },
      { isDragging: false }
    ),
}));

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
const mockUseQueryClient = vi.fn();

vi.mock("@tanstack/react-query", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
    useMutation: (...args: unknown[]) => mockUseMutation(...args),
    useQueryClient: () => mockUseQueryClient(),
  };
});

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

const noopMutation = { mutate: vi.fn(), isPending: false };
const noopClient = { invalidateQueries: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  mockUseMutation.mockReturnValue(noopMutation);
  mockUseQueryClient.mockReturnValue(noopClient);
});

async function getCategoriesPage() {
  const mod = await import("../pages/categories");
  return mod.default;
}

describe("CategoriesPage (shallow)", () => {
  it("renders category tree when API returns data", async () => {
    const mockCategory = {
      id: "cat-1",
      name: "Groceries",
      icon: "basket-outline",
      type: "mart",
      parentId: null,
      sortOrder: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      children: [],
    };
    mockUseQuery.mockReturnValue({ data: { categories: [mockCategory] }, isLoading: false });

    const CategoriesPage = await getCategoriesPage();
    render(<CategoriesPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText("Groceries")).toBeInTheDocument();
    });
  });

  it("shows 'No categories' empty state when list is empty", async () => {
    mockUseQuery.mockReturnValue({ data: { categories: [] }, isLoading: false });

    const CategoriesPage = await getCategoriesPage();
    render(<CategoriesPage />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText(/No categories/i)).toBeInTheDocument();
    });
  });

  it("type filter tabs (mart/food/pharmacy) are rendered and selectable", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue({ data: { categories: [] }, isLoading: false });

    const CategoriesPage = await getCategoriesPage();
    render(<CategoriesPage />, { wrapper: Wrapper });

    const typeSelect = screen.getByRole("combobox");
    expect(typeSelect).toBeInTheDocument();

    expect(screen.getByRole("option", { name: "Mart" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Food" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Pharmacy" })).toBeInTheDocument();

    await user.selectOptions(typeSelect, "food");
    expect((typeSelect as HTMLSelectElement).value).toBe("food");
  });

  it("renders Add Category button", async () => {
    mockUseQuery.mockReturnValue({ data: { categories: [] }, isLoading: false });

    const CategoriesPage = await getCategoriesPage();
    render(<CategoriesPage />, { wrapper: Wrapper });

    const addButtons = screen.getAllByText(/Add Category/i);
    expect(addButtons.length).toBeGreaterThan(0);
  });
});
