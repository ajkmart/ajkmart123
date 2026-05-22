import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/shared";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "@/lib/adminFetcher";
import { safeCopyToClipboard } from "@/lib/safeClipboard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Bot,
  Bug,
  Calendar,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code,
  Copy,
  Eye,
  FileText,
  Filter,
  Flame,
  Globe,
  Inbox,
  Layers,
  Lightbulb,
  Mail,
  MessageSquare,
  Monitor,
  Pause,
  Phone,
  Play,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Server,
  ShieldAlert,
  Smartphone,
  StickyNote,
  Undo2,
  Users,
  Wrench,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ErrorReport = {
  id: string;
  timestamp: string;
  sourceApp: string;
  errorType: string;
  severity: string;
  status: string;
  functionName: string | null;
  moduleName: string | null;
  componentName: string | null;
  errorMessage: string;
  shortImpact: string | null;
  stackTrace: string | null;
  metadata: Record<string, unknown> | null;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  resolutionMethod: string | null;
  resolutionNotes: string | null;
  rootCause: string | null;
  updatedAt: string | null;
  hasBackup: boolean;
};

type AutoResolveSettings = {
  enabled: boolean;
  severities: string[];
  errorTypes: string[];
  duplicateDetection: boolean;
  ageThresholdMinutes: number;
  intervalMs: number;
};

type AutoResolveLogEntry = {
  id: string;
  errorReportId: string;
  reason: string;
  ruleMatched: string;
  createdAt: string;
};

type CustomerReport = {
  id: string;
  timestamp: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  userId: string | null;
  appVersion: string | null;
  deviceInfo: string | null;
  platform: string | null;
  screen: string | null;
  description: string;
  reproSteps: string | null;
  status: string;
  adminNote: string | null;
  reviewedAt: string | null;
};

type ScanFinding = {
  type: string;
  severity: string;
  message: string;
  detail: string;
};

type ScanResult = {
  scannedAt: string;
  durationMs: number;
  overallSeverity: string;
  totalUnresolved: number;
  criticalLastHour: number;
  unresolvedCritical: number;
  customerReportsPending: number;
  findings: ScanFinding[];
};

type ScanMode = "manual" | "auto" | "daily" | "specific";
type Pagination = { page: number; limit: number; total: number; totalPages: number };
type Tab = "new" | "unresolved" | "completed" | "customers" | "filescan";

type FileScanFinding = {
  filePath: string;
  lineNumber: number;
  ruleName: string;
  severity: "critical" | "medium" | "minor";
  message: string;
  snippet: string;
};

type FileScanHistoryEntry = {
  id: string;
  scannedAt: string;
  durationMs: number;
  totalFindings: number;
  triggeredBy: string;
};

type FileScanLatest = FileScanHistoryEntry & { findings: FileScanFinding[] };

const SOURCE_APPS = [
  { value: "", label: "All Sources" },
  { value: "customer", label: "Customer" },
  { value: "rider", label: "Rider" },
  { value: "vendor", label: "Vendor" },
  { value: "admin", label: "Admin" },
  { value: "api", label: "API Server" },
];
const SEVERITIES = [
  { value: "", label: "All Severities" },
  { value: "critical", label: "Critical" },
  { value: "medium", label: "Medium" },
  { value: "minor", label: "Minor" },
];
const RESOLUTION_METHODS = [
  { value: "", label: "All Methods" },
  { value: "manual", label: "Manually Resolved" },
  { value: "auto_resolved", label: "Auto-Resolved" },
  { value: "task_created", label: "Task Created" },
];
const ERROR_TYPES = [
  { value: "", label: "All Types" },
  { value: "frontend_crash", label: "Frontend Crash" },
  { value: "api_error", label: "API Error" },
  { value: "db_error", label: "Database Error" },
  { value: "route_error", label: "Route Error" },
  { value: "ui_error", label: "UI Error" },
  { value: "unhandled_exception", label: "Unhandled Exception" },
];

const SOURCE_ICONS: Record<string, typeof Monitor> = {
  customer: Monitor,
  rider: Zap,
  vendor: Code,
  admin: Bug,
  api: Server,
};

const TAB_STATUS_FILTERS: Record<Exclude<Tab, "customers" | "filescan">, string[]> = {
  new: ["new"],
  unresolved: ["acknowledged", "in_progress"],
  completed: ["resolved"],
};

const STATUS_NEXT: Record<string, { status: string; label: string } | null> = {
  new: { status: "acknowledged", label: "Acknowledge" },
  acknowledged: { status: "in_progress", label: "Mark In Progress" },
  in_progress: { status: "resolved", label: "Resolve" },
  resolved: null,
};

const CATEGORY_LABELS: Record<string, string> = {
  frontend_crash: "Frontend Crash",
  api_error: "API Error",
  db_error: "DB Error",
  route_error: "Route Error",
  ui_error: "UI Error",
  unhandled_exception: "Unhandled Exception",
};

const SEVERITY_BADGE: Record<string, { bg: string; color: string; border: string }> = {
  critical: { bg: "#FEF2F2", color: "#B91C1C", border: "#FECACA" },
  medium: { bg: "#FFFBEB", color: "#92400E", border: "#FDE68A" },
  minor: { bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" },
};

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  new: { bg: "#FEF2F2", color: "#B91C1C" },
  acknowledged: { bg: "#FFFBEB", color: "#92400E" },
  in_progress: { bg: "#EFF6FF", color: "#1D4ED8" },
  resolved: { bg: "#F0FDF4", color: "#15803D" },
};

const NEXT_BTN_STYLE: Record<string, { bg: string; hover: string; color: string }> = {
  acknowledged: { bg: "#F59E0B", hover: "#D97706", color: "#fff" },
  in_progress: { bg: "#3B82F6", hover: "#2563EB", color: "#fff" },
  resolved: { bg: "#16A34A", hover: "#15803D", color: "#fff" },
};

const LEFT_ACCENT: Record<string, string> = {
  critical: "#EF4444",
  medium: "#F59E0B",
  minor: "#3B82F6",
};

const TABS: {
  id: Tab;
  label: string;
  icon: typeof Flame;
  activeColor: string;
  activeBorder: string;
  activeBg: string;
  badgeBg: string;
  badgeColor: string;
}[] = [
  {
    id: "new",
    label: "New",
    icon: Flame,
    activeColor: "#DC2626",
    activeBorder: "#DC2626",
    activeBg: "#FEF2F2",
    badgeBg: "#FEE2E2",
    badgeColor: "#B91C1C",
  },
  {
    id: "unresolved",
    label: "Unresolved",
    icon: ShieldAlert,
    activeColor: "#D97706",
    activeBorder: "#F59E0B",
    activeBg: "#FFFBEB",
    badgeBg: "#FEF3C7",
    badgeColor: "#92400E",
  },
  {
    id: "completed",
    label: "Completed",
    icon: CheckCircle2,
    activeColor: "#16A34A",
    activeBorder: "#22C55E",
    activeBg: "#F0FDF4",
    badgeBg: "#DCFCE7",
    badgeColor: "#15803D",
  },
  {
    id: "customers",
    label: "Customer Reports",
    icon: Users,
    activeColor: "#7C3AED",
    activeBorder: "#8B5CF6",
    activeBg: "#F5F3FF",
    badgeBg: "#EDE9FE",
    badgeColor: "#6D28D9",
  },
  {
    id: "filescan",
    label: "File Scan",
    icon: ScanLine,
    activeColor: "#7C3AED",
    activeBorder: "#A855F7",
    activeBg: "#FAF5FF",
    badgeBg: "#EDE9FE",
    badgeColor: "#6D28D9",
  },
];

const AUTO_INTERVALS = [
  { value: 30000, label: "Every 30s" },
  { value: 60000, label: "Every 1 min" },
  { value: 300000, label: "Every 5 min" },
  { value: 900000, label: "Every 15 min" },
];

const SCAN_FINDING_COLORS: Record<
  string,
  { bg: string; border: string; color: string; dot: string }
> = {
  critical: { bg: "#FEF2F2", border: "#FECACA", color: "#B91C1C", dot: "#EF4444" },
  medium: { bg: "#FFFBEB", border: "#FDE68A", color: "#92400E", dot: "#F59E0B" },
  minor: { bg: "#EFF6FF", border: "#BFDBFE", color: "#1D4ED8", dot: "#3B82F6" },
  ok: { bg: "#F0FDF4", border: "#BBF7D0", color: "#15803D", dot: "#22C55E" },
};

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function analyzeErrorCause(report: ErrorReport): {
  causes: string[];
  consequences: string[];
  fixes: string[];
} {
  const msg = (report.errorMessage || "").toLowerCase();
  const causes: string[] = [];
  const consequences: string[] = [];
  const fixes: string[] = [];

  switch (report.errorType) {
    case "db_error":
      causes.push("Database connection pool exhausted or timed out");
      causes.push("Invalid SQL query or schema mismatch after migration");
      causes.push("Database server unreachable or down");
      consequences.push("Users cannot place orders, make payments, or read data");
      consequences.push("Background jobs that write to DB will fail silently");
      consequences.push("Potential data inconsistency if mid-transaction");
      fixes.push("Check database server health and connection pool settings");
      fixes.push("Review recent schema migrations for conflicts");
      fixes.push("Monitor DB CPU/RAM — scale up if at capacity");
      break;
    case "frontend_crash":
      causes.push("Unhandled null/undefined reference inside a React component");
      causes.push("Incompatible or unexpected shape of API response data");
      causes.push("Missing error boundary — one component crashing takes the whole page");
      consequences.push("User sees a blank white screen and cannot continue");
      consequences.push("App becomes unresponsive until the user force-refreshes");
      consequences.push("Potential loss of unsaved user input or cart items");
      fixes.push("Wrap risky components in React Error Boundaries");
      fixes.push("Add optional chaining (?.) and null checks before rendering");
      fixes.push("Validate API response schema before passing to UI state");
      break;
    case "api_error":
      causes.push("Third-party service or microservice is unavailable");
      causes.push("Unhandled exception in server-side route handler");
      causes.push("Rate limit exceeded or request payload too large");
      consequences.push("Feature or page the user was using becomes unavailable");
      consequences.push("Failed API calls may leave the UI in a broken loading state");
      consequences.push("Potential duplicate actions if user retries without guidance");
      fixes.push("Add proper try/catch in all route handlers");
      fixes.push("Return user-friendly error messages instead of raw stack traces");
      fixes.push("Implement retry logic with exponential backoff on the client");
      break;
    case "route_error":
      causes.push("Route handler threw an unhandled exception");
      causes.push("Middleware blocking request before it reaches handler");
      causes.push("Incorrect URL pattern or missing route registration");
      consequences.push("Endpoint is completely down — all users hitting this route are affected");
      consequences.push("Could cause cascading failures in features that depend on this endpoint");
      fixes.push("Check the route registration and middleware order");
      fixes.push("Add global error handler middleware to catch unhandled route errors");
      fixes.push("Review recent code changes that touched the routing configuration");
      break;
    case "ui_error":
      causes.push("CSS/style conflict causing layout to break");
      causes.push("Component receiving wrong prop types or missing required props");
      causes.push("Browser compatibility issue with a specific CSS or JS feature");
      consequences.push("UI elements overlap, disappear, or display incorrectly");
      consequences.push("Users may not be able to find or click interactive elements");
      fixes.push("Test on multiple browsers and screen sizes");
      fixes.push("Add PropTypes or TypeScript strict checks on component props");
      fixes.push("Use browser dev tools to identify the conflicting styles");
      break;
    case "unhandled_exception":
      causes.push("Missing try/catch around async operations (await without catch)");
      causes.push("Promise rejection that was never handled");
      causes.push("Unexpected runtime error from a library or third-party code");
      consequences.push("Server/worker process may crash and restart — brief downtime");
      consequences.push("In-progress operations are abandoned — potential data inconsistency");
      consequences.push("Memory leaks if cleanup code inside catch/finally was skipped");
      fixes.push("Add process-level error handlers: process.on('uncaughtException')");
      fixes.push("Wrap all async functions in try/catch");
      fixes.push("Use a global error monitoring tool to catch these automatically");
      break;
  }

  if (
    msg.includes("auth") ||
    msg.includes("token") ||
    msg.includes("unauthorized") ||
    msg.includes("401")
  ) {
    causes.push("Authentication token expired, revoked, or tampered with");
    consequences.push("Users are suddenly logged out during active sessions");
    consequences.push("API calls silently fail — user sees stale data");
    fixes.push("Implement automatic silent token refresh before expiry");
    fixes.push("Handle 401 globally and redirect to login with a clear message");
  }
  if (msg.includes("payment") || msg.includes("stripe") || msg.includes("checkout")) {
    causes.push("Payment gateway API credentials invalid or expired");
    causes.push("Payment gateway is experiencing downtime");
    consequences.push("Users cannot complete purchases — direct revenue loss");
    consequences.push("Failed payment may still charge the card — serious risk");
    fixes.push("Check payment gateway dashboard for alerts");
    fixes.push("Implement idempotency keys to prevent double-charging");
    fixes.push("Notify finance team immediately if transactions are affected");
  }
  if (msg.includes("timeout") || msg.includes("econnrefused") || msg.includes("econnreset")) {
    causes.push("External service not responding within timeout window");
    causes.push("Network connectivity issue between services");
    consequences.push("Feature temporarily unavailable — users get loading spinners");
    fixes.push("Implement circuit breaker pattern to fail fast");
    fixes.push("Set sensible timeouts and surface them clearly to users");
  }
  if (msg.includes("not found") || msg.includes("404")) {
    causes.push("Resource was deleted, moved, or never existed");
    causes.push("Stale URL or cached link pointing to a removed resource");
    consequences.push("Users following shared or bookmarked links see a broken page");
    fixes.push("Implement proper 404 pages with navigation back to safety");
    fixes.push("Check if a resource was recently deleted without redirects");
  }
  if (msg.includes("permission") || msg.includes("forbidden") || msg.includes("403")) {
    causes.push("Access control policy change that was not communicated");
    causes.push("User role changed but session cache was not invalidated");
    consequences.push("Legitimate users blocked from features they previously had access to");
    fixes.push("Audit recent RBAC/permission changes");
    fixes.push("Ensure session invalidation on role changes");
  }
  if (msg.includes("memory") || msg.includes("heap") || msg.includes("oom")) {
    causes.push("Memory leak — objects not being garbage collected");
    causes.push("Very large dataset loaded into memory at once");
    consequences.push("Server performance degrades over time and eventually crashes");
    consequences.push("All users on the server are affected simultaneously");
    fixes.push("Profile memory usage with Node.js inspector or heapdump");
    fixes.push("Implement pagination for large data queries");
    fixes.push("Consider increasing server memory or switching to streaming");
  }

  if (causes.length === 0) {
    causes.push("Unexpected runtime condition not covered by existing error handling");
    causes.push("Edge case in business logic triggered by unusual input");
  }
  if (consequences.length === 0) {
    consequences.push("Feature or workflow affected — users may need to retry");
    consequences.push("Error may go unnoticed if not visible in user interface");
  }
  if (fixes.length === 0) {
    fixes.push("Review the error message and stack trace for specific clues");
    fixes.push("Reproduce the error in a controlled environment");
    fixes.push("Add more specific logging around this area of code");
  }

  return { causes, consequences, fixes };
}

function useTabCount(
  tab: Exclude<Tab, "customers" | "filescan">,
  sourceApp: string,
  severity: string,
  errorType: string
) {
  const statuses = TAB_STATUS_FILTERS[tab];
  const p = new URLSearchParams({ page: "1", limit: "1" });
  statuses.forEach((s) => p.append("status", s));
  if (sourceApp) p.set("sourceApp", sourceApp);
  if (severity) p.set("severity", severity);
  if (errorType) p.set("errorType", errorType);
  const { data } = useQuery({
    queryKey: ["error-count", tab, sourceApp, severity, errorType],
    queryFn: () => adminFetch(`/error-reports?${p}`),
    refetchInterval: 15000,
  });
  return (data?.pagination?.total ?? 0) as number;
}

export default function ErrorMonitor() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("new");
  const [page, setPage] = useState(1);
  const [sourceApp, setSourceApp] = useState("");
  const [severity, setSeverity] = useState("");
  const [errorType, setErrorType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [fixingAll, setFixingAll] = useState(false);
  const [groupByCategory, setGroupByCategory] = useState(false);

  const [showScanPanel, setShowScanPanel] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>("manual");
  const [autoInterval, setAutoInterval] = useState(60000);
  const [dailyTime, setDailyTime] = useState("08:00");
  const [specificDateTime, setSpecificDateTime] = useState("");
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const autoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const specificTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [resolutionMethod, setResolutionMethod] = useState("");
  const [showManualResolveDialog, setShowManualResolveDialog] = useState<string | null>(null);
  const [manualNotes, setManualNotes] = useState("");
  const [manualRootCause, setManualRootCause] = useState("");
  const [showTaskPlanDialog, setShowTaskPlanDialog] = useState<string | null>(null);
  const [taskPlanContent, setTaskPlanContent] = useState("");
  const [taskPlanLoading, setTaskPlanLoading] = useState(false);
  const [showAutoResolvePanel, setShowAutoResolvePanel] = useState(false);
  const [viewedErrorTimestamps, setViewedErrorTimestamps] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem("ajkmart_viewed_errors_ts");
      return stored ? JSON.parse(stored) : {};
    } catch (_e) {
      return {};
    }
  });

  const [customerPage, setCustomerPage] = useState(1);
  const [customerStatusFilter, setCustomerStatusFilter] = useState("");
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkTaskModal, setShowBulkTaskModal] = useState(false);
  const [bulkTaskContent, setBulkTaskContent] = useState("");
  const [bulkTaskLoading, setBulkTaskLoading] = useState(false);

  const [fileScanRunning, setFileScanRunning] = useState(false);
  const [fileScanError, setFileScanError] = useState<string | null>(null);
  const [fileScanExpandedFinding, setFileScanExpandedFinding] = useState<number | null>(null);

  const tabStatuses =
    activeTab !== "customers" && activeTab !== "filescan" ? TAB_STATUS_FILTERS[activeTab] : [];
  const params = new URLSearchParams({ page: String(page), limit: "30" });
  if (activeTab !== "customers" && activeTab !== "filescan") {
    tabStatuses.forEach((s) => params.append("status", s));
  }
  if (sourceApp) params.set("sourceApp", sourceApp);
  if (severity) params.set("severity", severity);
  if (errorType) params.set("errorType", errorType);
  if (resolutionMethod) params.set("resolutionMethod", resolutionMethod);
  if (dateFrom) params.set("dateFrom", new Date(dateFrom).toISOString());
  if (dateTo) params.set("dateTo", new Date(dateTo + "T23:59:59").toISOString());

  const { data, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: [
      "error-reports",
      activeTab,
      page,
      sourceApp,
      severity,
      errorType,
      resolutionMethod,
      dateFrom,
      dateTo,
    ],
    queryFn: () => adminFetch(`/error-reports?${params}`),
    refetchInterval: 30000,
    enabled: activeTab !== "customers" && activeTab !== "filescan",
  });

  const customerParams = new URLSearchParams({ page: String(customerPage), limit: "20" });
  if (customerStatusFilter) customerParams.set("status", customerStatusFilter);

  const {
    data: customerData,
    isLoading: customerLoading,
    refetch: refetchCustomers,
  } = useQuery({
    queryKey: ["customer-reports", customerPage, customerStatusFilter],
    queryFn: () => adminFetch(`/error-reports/customer-reports?${customerParams}`),
    refetchInterval: 30000,
    enabled: activeTab === "customers",
  });

  const reports = useMemo<ErrorReport[]>(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data as ErrorReport[];
    return (
      (data as { reports?: ErrorReport[]; items?: ErrorReport[] })?.reports ??
      (data as { items?: ErrorReport[] })?.items ??
      []
    );
  }, [data]);
  const pagination: Pagination = (data as { pagination?: Pagination } | null)?.pagination || {
    page: 1,
    limit: 30,
    total: 0,
    totalPages: 0,
  };
  const customerReports: CustomerReport[] = customerData?.reports || [];
  const customerPagination: Pagination = customerData?.pagination || {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  };

  const { data: fileScanLatest, refetch: refetchFileScanLatest } = useQuery<FileScanLatest | null>({
    queryKey: ["file-scan-latest"],
    queryFn: () => adminFetch("/error-reports/file-scan/latest"),
    enabled: activeTab === "filescan",
    staleTime: 0,
  });

  const { data: fileScanHistory, refetch: refetchFileScanHistory } = useQuery<
    FileScanHistoryEntry[]
  >({
    queryKey: ["file-scan-history"],
    queryFn: () => adminFetch("/error-reports/file-scan/history"),
    enabled: activeTab === "filescan",
  });

  const fileScanFindings: FileScanFinding[] = (fileScanLatest?.findings ?? []) as FileScanFinding[];

  const newCount = useTabCount("new", sourceApp, severity, errorType);
  const unresolvedCount = useTabCount("unresolved", sourceApp, severity, errorType);
  const completedCount = useTabCount("completed", sourceApp, severity, errorType);

  const { data: customerCountData } = useQuery({
    queryKey: ["customer-reports-count"],
    queryFn: () => adminFetch("/error-reports/customer-reports?status=new&limit=1"),
    refetchInterval: 30000,
  });
  const customerNewCount = customerCountData?.pagination?.total ?? 0;

  const tabCounts: Record<Tab, number> = {
    new: newCount,
    unresolved: unresolvedCount,
    completed: completedCount,
    customers: customerNewCount,
    filescan: fileScanLatest?.totalFindings ?? 0,
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, newStatus }: { id: string; newStatus: string }) =>
      adminFetch(`/error-reports/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["error-reports"] });
      void queryClient.invalidateQueries({ queryKey: ["error-count"] });
    },
    onError: (err: unknown) => {
      console.error(
        "[error-monitor] updateMutation failed:",
        err instanceof Error ? err.message : err
      );
      toast({
        title: "Failed to update report status",
        description: err instanceof Error ? err.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    },
  });

  const updateCustomerReportMutation = useMutation({
    mutationFn: ({ id, status, adminNote }: { id: string; status?: string; adminNote?: string }) =>
      adminFetch(`/error-reports/customer-reports/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, adminNote }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customer-reports"] });
      void queryClient.invalidateQueries({ queryKey: ["customer-reports-count"] });
    },
    onError: (err: unknown) => {
      console.error(
        "[error-monitor] updateCustomerReportMutation failed:",
        err instanceof Error ? err.message : err
      );
      toast({
        title: "Failed to update customer report",
        description: err instanceof Error ? err.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({
      id,
      method,
      resolutionNotes,
      rootCause,
    }: {
      id: string;
      method: string;
      resolutionNotes?: string;
      rootCause?: string;
    }) =>
      adminFetch(`/error-reports/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ method, resolutionNotes, rootCause }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["error-reports"] });
      void queryClient.invalidateQueries({ queryKey: ["error-count"] });
    },
    onError: (err: unknown) => {
      console.error(
        "[error-monitor] resolveMutation failed:",
        err instanceof Error ? err.message : err
      );
      toast({
        title: "Failed to resolve report",
        description: err instanceof Error ? err.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    },
  });

  const undoMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/error-reports/${id}/undo`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["error-reports"] });
      void queryClient.invalidateQueries({ queryKey: ["error-count"] });
    },
    onError: (err: unknown) => {
      console.error(
        "[error-monitor] undoMutation failed:",
        err instanceof Error ? err.message : err
      );
      toast({
        title: "Failed to undo report change",
        description: err instanceof Error ? err.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    },
  });

  const { data: autoResolveSettings, refetch: refetchAutoSettings } = useQuery<AutoResolveSettings>(
    {
      queryKey: ["auto-resolve-settings"],
      queryFn: () => adminFetch("/error-reports/auto-resolve-settings"),
      refetchInterval: 60000,
    }
  );

  const updateAutoSettingsMutation = useMutation({
    mutationFn: (settings: Partial<AutoResolveSettings>) =>
      adminFetch("/error-reports/auto-resolve-settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      }),
    onSuccess: () => {
      void refetchAutoSettings();
    },
    onError: (err: unknown) => {
      console.error(
        "[error-monitor] updateAutoSettingsMutation failed:",
        err instanceof Error ? err.message : err
      );
      toast({
        title: "Failed to save auto-resolve settings",
        description: err instanceof Error ? err.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    },
  });

  const { data: autoResolveLog, refetch: refetchAutoLog } = useQuery<AutoResolveLogEntry[]>({
    queryKey: ["auto-resolve-log"],
    queryFn: () => adminFetch("/error-reports/auto-resolve-log?limit=50"),
    refetchInterval: 30000,
    enabled: showAutoResolvePanel,
  });

  const runAutoResolveMutation = useMutation({
    mutationFn: () => adminFetch("/error-reports/auto-resolve-run", { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["error-reports"] });
      void queryClient.invalidateQueries({ queryKey: ["error-count"] });
      void refetchAutoLog();
    },
    onError: (err: unknown) => {
      console.error(
        "[error-monitor] runAutoResolveMutation failed:",
        err instanceof Error ? err.message : err
      );
      toast({
        title: "Auto-resolve run failed",
        description: err instanceof Error ? err.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    },
  });

  const handleGenerateTask = async (id: string) => {
    setTaskPlanLoading(true);
    setShowTaskPlanDialog(id);
    try {
      const result = await adminFetch(`/error-reports/${id}/generate-task`, { method: "POST" });
      setTaskPlanContent(result.taskPlan);
      void queryClient.invalidateQueries({ queryKey: ["error-reports"] });
    } catch (_err) {
      setTaskPlanContent("Failed to generate task plan.");
    } finally {
      setTaskPlanLoading(false);
    }
  };

  const handleManualResolve = () => {
    if (!showManualResolveDialog) return;
    resolveMutation.mutate({
      id: showManualResolveDialog,
      method: "manual",
      resolutionNotes: manualNotes,
      rootCause: manualRootCause,
    });
    setShowManualResolveDialog(null);
    setManualNotes("");
    setManualRootCause("");
  };

  const handleBulkGenerateTask = async () => {
    setBulkTaskLoading(true);
    setShowBulkTaskModal(true);
    setBulkTaskContent("");
    try {
      const ids = Array.from(selectedIds);
      const result = await adminFetch("/error-reports/bulk-generate-task", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      setBulkTaskContent(result.taskPlan);
    } catch (_err) {
      setBulkTaskContent("Failed to generate bulk task plan.");
    } finally {
      setBulkTaskLoading(false);
    }
  };

  const handleRunFileScan = useCallback(async () => {
    if (fileScanRunning) return;
    setFileScanRunning(true);
    setFileScanError(null);
    try {
      await adminFetch("/error-reports/file-scan/run", { method: "POST" });
      await refetchFileScanLatest();
      await refetchFileScanHistory();
    } catch (_err) {
      setFileScanError("File scan failed. Check the API server connection.");
    } finally {
      setFileScanRunning(false);
    }
  }, [fileScanRunning, refetchFileScanLatest, refetchFileScanHistory]);

  const handleFileScanGenerateTask = async (finding: FileScanFinding) => {
    setTaskPlanLoading(true);
    setShowTaskPlanDialog("filescan-finding");
    setTaskPlanContent("");
    try {
      const result = await adminFetch("/error-reports/file-scan/generate-task", {
        method: "POST",
        body: JSON.stringify({ finding }),
      });
      setTaskPlanContent(result.taskPlan);
    } catch (_err) {
      setTaskPlanContent("Failed to generate task plan.");
    } finally {
      setTaskPlanLoading(false);
    }
  };

  const markErrorViewed = useCallback((id: string) => {
    const now = new Date().toISOString();
    setViewedErrorTimestamps((prev) => {
      const next = { ...prev, [id]: now };

      try {
        localStorage.setItem("ajkmart_viewed_errors_ts", JSON.stringify(next));
      } catch (_e) {
        /* storage unavailable */
      }
      return next;
    });
  }, []);

  const runScan = useCallback(async () => {
    if (isScanning) return;
    setIsScanning(true);
    setScanError(null);
    try {
      const result = await adminFetch("/error-reports/scan", { method: "POST" });
      setScanResult(result);
      setLastScanAt(new Date().toISOString());
      void queryClient.invalidateQueries({ queryKey: ["error-reports"] });
      void queryClient.invalidateQueries({ queryKey: ["error-count"] });
      void queryClient.invalidateQueries({ queryKey: ["customer-reports-count"] });
    } catch (_err) {
      setScanError("Scan failed. Check the API server connection.");
    } finally {
      setIsScanning(false);
    }
  }, [isScanning, queryClient]);

  const startAutoScan = useCallback(() => {
    if (autoIntervalRef.current) clearInterval(autoIntervalRef.current);
    void runScan();
    autoIntervalRef.current = setInterval(runScan, autoInterval);
    setIsAutoRunning(true);
  }, [runScan, autoInterval]);

  const stopAutoScan = useCallback(() => {
    if (autoIntervalRef.current) {
      clearInterval(autoIntervalRef.current);
      autoIntervalRef.current = null;
    }
    setIsAutoRunning(false);
  }, []);

  const scheduleSpecificScan = useCallback(() => {
    if (!specificDateTime) return;
    const target = new Date(specificDateTime).getTime();
    const now = Date.now();
    if (target <= now) {
      setScanError("Scheduled time must be in the future.");
      return;
    }
    if (specificTimeoutRef.current) clearTimeout(specificTimeoutRef.current);
    const delay = target - now;
    specificTimeoutRef.current = setTimeout(() => {
      void runScan();
    }, delay);
    setScanError(null);
  }, [specificDateTime, runScan]);

  const scheduleDailyScan = useCallback(() => {
    const [h, m] = dailyTime.split(":").map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(h!, m!, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    const delay = target.getTime() - now.getTime();
    if (specificTimeoutRef.current) clearTimeout(specificTimeoutRef.current);
    specificTimeoutRef.current = setTimeout(() => {
      void runScan();
      scheduleDailyScan();
    }, delay);
    setScanError(null);
  }, [dailyTime, runScan]);

  useEffect(() => {
    return () => {
      if (autoIntervalRef.current) clearInterval(autoIntervalRef.current);
      if (specificTimeoutRef.current) clearTimeout(specificTimeoutRef.current);
    };
  }, []);

  const handleFixAll = async () => {
    if (fixingAll) return;
    setFixingAll(true);
    try {
      await adminFetch("/error-reports/bulk-resolve", {
        method: "POST",
        body: JSON.stringify({
          sourceApp: sourceApp || undefined,
          severity: severity || undefined,
          errorType: errorType || undefined,
          statusFilter:
            activeTab !== "customers" && activeTab !== "filescan"
              ? TAB_STATUS_FILTERS[activeTab]
              : [],
        }),
      });
      void queryClient.invalidateQueries({ queryKey: ["error-reports"] });
      void queryClient.invalidateQueries({ queryKey: ["error-count"] });
      setActiveTab("completed");
      setPage(1);
    } catch (err) {
      console.error(
        "[error-monitor] handleFixAll failed:",
        err instanceof Error ? err.message : err
      );
      toast({
        title: "Bulk resolve failed",
        description: err instanceof Error ? err.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setFixingAll(false);
    }
  };

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    setPage(1);
    setExpandedId(null);
    setSelectedIds(new Set());
  };
  const hasFilters = !!(
    sourceApp ||
    severity ||
    errorType ||
    resolutionMethod ||
    dateFrom ||
    dateTo
  );
  const clearFilters = () => {
    setSourceApp("");
    setSeverity("");
    setErrorType("");
    setResolutionMethod("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };
  const canFixAll =
    activeTab !== "completed" &&
    activeTab !== "customers" &&
    activeTab !== "filescan" &&
    pagination.total > 0;

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === reports.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(reports.map((r) => r.id)));
    }
  };

  const groupedReports = useMemo(() => {
    if (!groupByCategory) return null;
    const groups: Record<string, ErrorReport[]> = {};
    for (const r of reports) {
      if (!groups[r.errorType]) groups[r.errorType] = [];
      groups[r.errorType]!.push(r);
    }
    return groups;
  }, [reports, groupByCategory]);

  const renderCauseAnalysis = (report: ErrorReport) => {
    const { causes, consequences, fixes } = analyzeErrorCause(report);
    return (
      <div style={{ marginTop: 16, borderTop: "1px dashed #E5E7EB", paddingTop: 16 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#7C3AED",
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Lightbulb style={{ width: 13, height: 13 }} /> Root Cause Analysis
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <div
            style={{
              backgroundColor: "#FEF3C7",
              border: "1px solid #FDE68A",
              borderRadius: 8,
              padding: 12,
            }}
          >
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                color: "#92400E",
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <AlertCircle style={{ width: 11, height: 11 }} /> Likely Causes
            </p>
            <ul style={{ margin: 0, padding: "0 0 0 14px" }}>
              {causes.slice(0, 3).map((c, i) => (
                <li
                  key={i}
                  style={{ fontSize: 11, color: "#78350F", marginBottom: 4, lineHeight: "1.4" }}
                >
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <div
            style={{
              backgroundColor: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: 8,
              padding: 12,
            }}
          >
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                color: "#B91C1C",
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <AlertTriangle style={{ width: 11, height: 11 }} /> What This Can Cause
            </p>
            <ul style={{ margin: 0, padding: "0 0 0 14px" }}>
              {consequences.slice(0, 3).map((c, i) => (
                <li
                  key={i}
                  style={{ fontSize: 11, color: "#7F1D1D", marginBottom: 4, lineHeight: "1.4" }}
                >
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <div
            style={{
              backgroundColor: "#F0FDF4",
              border: "1px solid #BBF7D0",
              borderRadius: 8,
              padding: 12,
            }}
          >
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                color: "#15803D",
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Wrench style={{ width: 11, height: 11 }} /> Recommended Fixes
            </p>
            <ul style={{ margin: 0, padding: "0 0 0 14px" }}>
              {fixes.slice(0, 3).map((f, i) => (
                <li
                  key={i}
                  style={{ fontSize: 11, color: "#14532D", marginBottom: 4, lineHeight: "1.4" }}
                >
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  };

  const renderReportRow = (report: ErrorReport) => {
    const isExpanded = expandedId === report.id;
    const Icon = SOURCE_ICONS[report.sourceApp] || Server;
    const sevBadge = SEVERITY_BADGE[report.severity] || SEVERITY_BADGE.medium!;
    const statusBadge = STATUS_BADGE[report.status] || STATUS_BADGE.new!;
    const accentColor = LEFT_ACCENT[report.severity] || "#6366F1";
    const nextStep = STATUS_NEXT[report.status];
    const nextBtnStyle = nextStep ? NEXT_BTN_STYLE[nextStep.status] : null;

    const isSelected = selectedIds.has(report.id);
    return (
      <div
        key={report.id}
        style={{
          backgroundColor: isSelected ? "#F5F3FF" : "#ffffff",
          borderLeft: `4px solid ${isSelected ? "#7C3AED" : accentColor}`,
          borderBottom: "1px solid #F1F5F9",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            padding: "12px 16px",
            cursor: "pointer",
          }}
          onClick={() => {
            setExpandedId(isExpanded ? null : report.id);
            if (!isExpanded) markErrorViewed(report.id);
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLDivElement).style.backgroundColor = isSelected
              ? "#EDE9FE"
              : "#F8FAFC")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLDivElement).style.backgroundColor = isSelected
              ? "#F5F3FF"
              : "transparent")
          }
        >
          <div
            style={{ marginTop: 2, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}
            onClick={(e) => {
              e.stopPropagation();
              toggleSelectId(report.id);
            }}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelectId(report.id)}
              onClick={(e) => e.stopPropagation()}
              style={{ width: 14, height: 14, cursor: "pointer", accentColor: "#7C3AED" }}
            />
          </div>
          <div style={{ marginTop: 2, color: "#9CA3AF", flexShrink: 0 }}>
            {isExpanded ? (
              <ChevronDown style={{ width: 16, height: 16 }} />
            ) : (
              <ChevronRight style={{ width: 16, height: 16 }} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 6,
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "2px 8px",
                  borderRadius: 9999,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  backgroundColor: sevBadge.bg,
                  color: sevBadge.color,
                  border: `1px solid ${sevBadge.border}`,
                }}
              >
                {report.severity}
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 8px",
                  borderRadius: 9999,
                  fontSize: 11,
                  fontWeight: 600,
                  backgroundColor: "#F1F5F9",
                  color: "#374151",
                  border: "1px solid #E2E8F0",
                  textTransform: "capitalize",
                }}
              >
                <Icon style={{ width: 12, height: 12 }} />
                {report.sourceApp === "api" ? "API Server" : report.sourceApp}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "#6B7280",
                  backgroundColor: "#F9FAFB",
                  padding: "2px 8px",
                  borderRadius: 9999,
                  border: "1px solid #E5E7EB",
                }}
              >
                {report.errorType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "2px 8px",
                  borderRadius: 9999,
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "capitalize",
                  backgroundColor: statusBadge.bg,
                  color: statusBadge.color,
                }}
              >
                {report.status.replace(/_/g, " ")}
              </span>
            </div>
            <p
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "#111827",
                lineHeight: "1.4",
                marginBottom: 4,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {report.errorMessage}
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 10,
                fontSize: 11,
                color: "#9CA3AF",
              }}
            >
              <span>{formatTimestamp(report.timestamp)}</span>
              {report.functionName && (
                <span
                  style={{
                    fontFamily: "monospace",
                    backgroundColor: "#F3F4F6",
                    color: "#6B7280",
                    padding: "1px 6px",
                    borderRadius: 4,
                  }}
                >
                  {report.functionName}
                </span>
              )}
              {report.componentName && (
                <span
                  style={{
                    fontFamily: "monospace",
                    backgroundColor: "#F3F4F6",
                    color: "#6B7280",
                    padding: "1px 6px",
                    borderRadius: 4,
                  }}
                >
                  {report.componentName}
                </span>
              )}
              {report.shortImpact && (
                <span style={{ fontStyle: "italic", color: "#9CA3AF" }}>{report.shortImpact}</span>
              )}
            </div>
          </div>
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              gap: 4,
              alignItems: "center",
              flexWrap: "wrap",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {report.updatedAt &&
              (!viewedErrorTimestamps[report.id] ||
                report.updatedAt > viewedErrorTimestamps[report.id]!) && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: "#3B82F6",
                    flexShrink: 0,
                  }}
                  title="Updated"
                />
              )}
            {report.status !== "resolved" && (
              <>
                <button
                  onClick={() => resolveMutation.mutate({ id: report.id, method: "auto_resolved" })}
                  disabled={resolveMutation.isPending}
                  title="Auto Resolve"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "4px 8px",
                    borderRadius: 6,
                    backgroundColor: "#DCFCE7",
                    color: "#15803D",
                    border: "1px solid #BBF7D0",
                    cursor: "pointer",
                  }}
                >
                  <Bot style={{ width: 11, height: 11, display: "inline", marginRight: 2 }} />
                  AR
                </button>
                <button
                  onClick={() => handleGenerateTask(report.id)}
                  title="Create Task Plan"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "4px 8px",
                    borderRadius: 6,
                    backgroundColor: "#EEF2FF",
                    color: "#4F46E5",
                    border: "1px solid #C7D2FE",
                    cursor: "pointer",
                  }}
                >
                  <FileText style={{ width: 11, height: 11, display: "inline", marginRight: 2 }} />
                  Task
                </button>
                <button
                  onClick={() => {
                    setShowManualResolveDialog(report.id);
                    setManualNotes("");
                    setManualRootCause("");
                  }}
                  title="Manual Resolve"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "4px 8px",
                    borderRadius: 6,
                    backgroundColor: "#FEF3C7",
                    color: "#92400E",
                    border: "1px solid #FDE68A",
                    cursor: "pointer",
                  }}
                >
                  <Wrench style={{ width: 11, height: 11, display: "inline", marginRight: 2 }} />
                  Manual
                </button>
              </>
            )}
            {nextStep && nextBtnStyle ? (
              <button
                onClick={() => updateMutation.mutate({ id: report.id, newStatus: nextStep.status })}
                disabled={updateMutation.isPending}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "5px 10px",
                  borderRadius: 8,
                  backgroundColor: nextBtnStyle.bg,
                  color: nextBtnStyle.color,
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                  opacity: updateMutation.isPending ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    nextBtnStyle!.hover;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = nextBtnStyle!.bg;
                }}
              >
                {nextStep.label}
              </button>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#16A34A",
                    padding: "5px 10px",
                    backgroundColor: "#F0FDF4",
                    borderRadius: 8,
                    border: "1px solid #BBF7D0",
                  }}
                >
                  <CheckCircle2 style={{ width: 12, height: 12 }} /> Resolved
                </span>
                {report.hasBackup && (
                  <button
                    onClick={() => undoMutation.mutate(report.id)}
                    disabled={undoMutation.isPending}
                    title="Undo Resolution"
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "4px 8px",
                      borderRadius: 6,
                      backgroundColor: "#FEF2F2",
                      color: "#B91C1C",
                      border: "1px solid #FECACA",
                      cursor: "pointer",
                    }}
                  >
                    <Undo2 style={{ width: 11, height: 11, display: "inline", marginRight: 2 }} />
                    Undo
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {isExpanded && (
          <div
            style={{
              padding: "16px 16px 20px 44px",
              backgroundColor: "#F8FAFC",
              borderTop: "1px solid #F1F5F9",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 16,
                marginBottom: 16,
              }}
            >
              {[
                {
                  label: "Timestamp",
                  value: new Date(report.timestamp).toLocaleString(),
                  mono: false,
                },
                { label: "Module", value: report.moduleName || "—", mono: true },
                { label: "Function", value: report.functionName || "—", mono: true },
                { label: "Component", value: report.componentName || "—", mono: true },
              ].map((f) => (
                <div key={f.label}>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "#9CA3AF",
                      marginBottom: 4,
                    }}
                  >
                    {f.label}
                  </p>
                  <p
                    style={{
                      fontSize: 12,
                      color: "#374151",
                      fontFamily: f.mono ? "monospace" : "inherit",
                    }}
                  >
                    {f.value}
                  </p>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 12 }}>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#9CA3AF",
                  marginBottom: 4,
                }}
              >
                Error Message
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: "#374151",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  backgroundColor: "#ffffff",
                  border: "1px solid #E5E7EB",
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                {report.errorMessage}
              </p>
            </div>

            {report.shortImpact && (
              <div style={{ marginBottom: 12 }}>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#9CA3AF",
                    marginBottom: 4,
                  }}
                >
                  Impact
                </p>
                <p style={{ fontSize: 12, color: "#374151" }}>{report.shortImpact}</p>
              </div>
            )}

            {report.stackTrace && (
              <div style={{ marginBottom: 12 }}>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#9CA3AF",
                    marginBottom: 4,
                  }}
                >
                  Stack Trace
                </p>
                <pre
                  style={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    backgroundColor: "#111827",
                    color: "#86EFAC",
                    border: "1px solid #374151",
                    borderRadius: 8,
                    padding: 12,
                    overflowX: "auto",
                    maxHeight: 256,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {report.stackTrace}
                </pre>
              </div>
            )}

            {report.metadata && Object.keys(report.metadata).length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#9CA3AF",
                    marginBottom: 4,
                  }}
                >
                  Metadata
                </p>
                <pre
                  style={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#374151",
                    backgroundColor: "#ffffff",
                    border: "1px solid #E5E7EB",
                    borderRadius: 8,
                    padding: 12,
                    overflowX: "auto",
                    maxHeight: 160,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {JSON.stringify(report.metadata, null, 2)}
                </pre>
              </div>
            )}

            {(report.acknowledgedAt || report.resolvedAt || report.resolutionMethod) && (
              <div style={{ display: "flex", gap: 24, marginBottom: 12, flexWrap: "wrap" }}>
                {report.acknowledgedAt && (
                  <div>
                    <p
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "#9CA3AF",
                        marginBottom: 4,
                      }}
                    >
                      Acknowledged At
                    </p>
                    <p style={{ fontSize: 12, color: "#374151" }}>
                      {new Date(report.acknowledgedAt).toLocaleString()}
                    </p>
                  </div>
                )}
                {report.resolvedAt && (
                  <div>
                    <p
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "#9CA3AF",
                        marginBottom: 4,
                      }}
                    >
                      Resolved At
                    </p>
                    <p style={{ fontSize: 12, color: "#16A34A", fontWeight: 600 }}>
                      {new Date(report.resolvedAt).toLocaleString()}
                    </p>
                  </div>
                )}
                {report.resolutionMethod && (
                  <div>
                    <p
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "#9CA3AF",
                        marginBottom: 4,
                      }}
                    >
                      Resolution Method
                    </p>
                    <p style={{ fontSize: 12, color: "#4F46E5", fontWeight: 600 }}>
                      {report.resolutionMethod
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (c) => c.toUpperCase())}
                    </p>
                  </div>
                )}
              </div>
            )}

            {report.rootCause && (
              <div style={{ marginBottom: 12 }}>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#9CA3AF",
                    marginBottom: 4,
                  }}
                >
                  Root Cause
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: "#374151",
                    backgroundColor: "#FEF3C7",
                    border: "1px solid #FDE68A",
                    borderRadius: 8,
                    padding: 12,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {report.rootCause}
                </p>
              </div>
            )}

            {report.resolutionNotes && (
              <div style={{ marginBottom: 12 }}>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#9CA3AF",
                    marginBottom: 4,
                  }}
                >
                  Resolution Notes
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: "#374151",
                    backgroundColor: "#ffffff",
                    border: "1px solid #E5E7EB",
                    borderRadius: 8,
                    padding: 12,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {report.resolutionNotes}
                </p>
              </div>
            )}

            {renderCauseAnalysis(report)}
          </div>
        )}
      </div>
    );
  };

  const renderCustomerReportRow = (report: CustomerReport) => {
    const isExpanded = expandedCustomerId === report.id;
    const statusColors: Record<string, { bg: string; color: string }> = {
      new: { bg: "#FEF2F2", color: "#B91C1C" },
      reviewed: { bg: "#FFFBEB", color: "#92400E" },
      closed: { bg: "#F0FDF4", color: "#15803D" },
    };
    const sc = statusColors[report.status] || statusColors.new!;
    const platformIcon =
      report.platform === "ios" || report.platform === "android" ? Smartphone : Globe;
    const PIcon = platformIcon;

    return (
      <div
        key={report.id}
        style={{
          backgroundColor: "#ffffff",
          borderLeft: "4px solid #8B5CF6",
          borderBottom: "1px solid #F1F5F9",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            padding: "12px 16px",
            cursor: "pointer",
          }}
          onClick={() => setExpandedCustomerId(isExpanded ? null : report.id)}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLDivElement).style.backgroundColor = "#F8FAFC")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent")
          }
        >
          <div style={{ marginTop: 2, color: "#9CA3AF", flexShrink: 0 }}>
            {isExpanded ? (
              <ChevronDown style={{ width: 16, height: 16 }} />
            ) : (
              <ChevronRight style={{ width: 16, height: 16 }} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 6,
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#1F2937",
                }}
              >
                <Users style={{ width: 13, height: 13, color: "#7C3AED" }} />
                {report.customerName}
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "2px 8px",
                  borderRadius: 9999,
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "capitalize",
                  backgroundColor: sc.bg,
                  color: sc.color,
                }}
              >
                {report.status}
              </span>
              {report.platform && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    color: "#6B7280",
                    backgroundColor: "#F9FAFB",
                    padding: "2px 8px",
                    borderRadius: 9999,
                    border: "1px solid #E5E7EB",
                    textTransform: "capitalize",
                  }}
                >
                  <PIcon style={{ width: 11, height: 11 }} /> {report.platform}
                </span>
              )}
              {report.screen && (
                <span
                  style={{
                    fontSize: 11,
                    color: "#6B7280",
                    backgroundColor: "#F3F4F6",
                    padding: "2px 8px",
                    borderRadius: 9999,
                  }}
                >
                  📍 {report.screen}
                </span>
              )}
            </div>
            <p
              style={{
                fontSize: 13,
                color: "#374151",
                lineHeight: "1.4",
                marginBottom: 4,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {report.description}
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 10,
                fontSize: 11,
                color: "#9CA3AF",
              }}
            >
              <span>{formatTimestamp(report.timestamp)}</span>
              {report.customerEmail && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <Mail style={{ width: 11, height: 11 }} />
                  {report.customerEmail}
                </span>
              )}
              {report.customerPhone && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <Phone style={{ width: 11, height: 11 }} />
                  {report.customerPhone}
                </span>
              )}
              {report.appVersion && (
                <span
                  style={{
                    fontFamily: "monospace",
                    backgroundColor: "#F3F4F6",
                    color: "#6B7280",
                    padding: "1px 6px",
                    borderRadius: 4,
                  }}
                >
                  v{report.appVersion}
                </span>
              )}
            </div>
          </div>
          <div
            style={{ flexShrink: 0, display: "flex", gap: 6 }}
            onClick={(e) => e.stopPropagation()}
          >
            {report.status === "new" && (
              <button
                onClick={() =>
                  updateCustomerReportMutation.mutate({ id: report.id, status: "reviewed" })
                }
                disabled={updateCustomerReportMutation.isPending}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "5px 10px",
                  borderRadius: 8,
                  backgroundColor: "#F59E0B",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <Eye style={{ width: 12, height: 12, display: "inline", marginRight: 4 }} />
                Mark Reviewed
              </button>
            )}
            {report.status === "reviewed" && (
              <button
                onClick={() =>
                  updateCustomerReportMutation.mutate({ id: report.id, status: "closed" })
                }
                disabled={updateCustomerReportMutation.isPending}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "5px 10px",
                  borderRadius: 8,
                  backgroundColor: "#16A34A",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <XCircle style={{ width: 12, height: 12, display: "inline", marginRight: 4 }} />
                Close
              </button>
            )}
          </div>
        </div>

        {isExpanded && (
          <div
            style={{
              padding: "16px 16px 20px 44px",
              backgroundColor: "#F8FAFC",
              borderTop: "1px solid #F1F5F9",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 16,
                marginBottom: 16,
              }}
            >
              {[
                { label: "Customer Name", value: report.customerName },
                { label: "Email", value: report.customerEmail || "—" },
                { label: "Phone", value: report.customerPhone || "—" },
                { label: "User ID", value: report.userId || "—" },
                { label: "Platform", value: report.platform || "—" },
                { label: "App Version", value: report.appVersion ? `v${report.appVersion}` : "—" },
                { label: "Device Info", value: report.deviceInfo || "—" },
                { label: "Screen / Page", value: report.screen || "—" },
                { label: "Submitted", value: new Date(report.timestamp).toLocaleString() },
              ].map((f) => (
                <div key={f.label}>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "#9CA3AF",
                      marginBottom: 4,
                    }}
                  >
                    {f.label}
                  </p>
                  <p style={{ fontSize: 12, color: "#374151" }}>{f.value}</p>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 12 }}>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#9CA3AF",
                  marginBottom: 4,
                }}
              >
                Issue Description
              </p>
              <p
                style={{
                  fontSize: 13,
                  color: "#374151",
                  backgroundColor: "#ffffff",
                  border: "1px solid #E5E7EB",
                  borderRadius: 8,
                  padding: 12,
                  whiteSpace: "pre-wrap",
                }}
              >
                {report.description}
              </p>
            </div>

            {report.reproSteps && (
              <div style={{ marginBottom: 12 }}>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#9CA3AF",
                    marginBottom: 4,
                  }}
                >
                  Steps to Reproduce
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: "#374151",
                    backgroundColor: "#ffffff",
                    border: "1px solid #E5E7EB",
                    borderRadius: 8,
                    padding: 12,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {report.reproSteps}
                </p>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#9CA3AF",
                  marginBottom: 4,
                }}
              >
                <StickyNote style={{ width: 11, height: 11, display: "inline", marginRight: 4 }} />
                Admin Note
              </p>
              <textarea
                value={
                  noteInputs[report.id] !== undefined
                    ? noteInputs[report.id]
                    : report.adminNote || ""
                }
                onChange={(e) => setNoteInputs((n) => ({ ...n, [report.id]: e.target.value }))}
                placeholder="Add an internal note about this report..."
                rows={3}
                style={{
                  width: "100%",
                  fontSize: 12,
                  color: "#374151",
                  backgroundColor: "#ffffff",
                  border: "1px solid #D1D5DB",
                  borderRadius: 8,
                  padding: "8px 12px",
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
              <button
                onClick={() => {
                  const note = noteInputs[report.id] ?? report.adminNote ?? "";
                  updateCustomerReportMutation.mutate({ id: report.id, adminNote: note });
                  setNoteInputs((n) => {
                    const x = { ...n };
                    delete x[report.id];
                    return x;
                  });
                }}
                disabled={updateCustomerReportMutation.isPending}
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "5px 12px",
                  borderRadius: 8,
                  backgroundColor: "#6366F1",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Save Note
              </button>
            </div>

            {report.reviewedAt && (
              <div>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#9CA3AF",
                    marginBottom: 4,
                  }}
                >
                  Reviewed At
                </p>
                <p style={{ fontSize: 12, color: "#15803D", fontWeight: 600 }}>
                  {new Date(report.reviewedAt).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Error Monitor page crashed. Please reload.
        </div>
      }
    >
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "#F8FAFC",
          padding: "24px",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <PageHeader
          icon={Bug}
          title="Error Monitor"
          subtitle={`Real-time error tracking across all apps${lastScanAt ? ` · Last scan: ${formatTimestamp(lastScanAt)}` : ""}${isAutoRunning ? " · Auto-scan ON" : ""}`}
          iconBgClass="bg-red-100"
          iconColorClass="text-red-600"
          actions={
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {activeTab !== "customers" && activeTab !== "filescan" && dataUpdatedAt > 0 && (
                <LastUpdated
                  dataUpdatedAt={dataUpdatedAt}
                  onRefresh={refetch}
                  isRefreshing={isLoading}
                />
              )}
              {activeTab !== "filescan" && (
                <>
                  <button
                    onClick={() => setShowAutoResolvePanel(!showAutoResolvePanel)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 14px",
                      borderRadius: 8,
                      border: `1px solid ${autoResolveSettings?.enabled ? "#22C55E" : "#D1D5DB"}`,
                      backgroundColor: autoResolveSettings?.enabled ? "#F0FDF4" : "#ffffff",
                      color: autoResolveSettings?.enabled ? "#16A34A" : "#374151",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <Bot style={{ width: 15, height: 15 }} />
                    AI Auto-Resolve {autoResolveSettings?.enabled ? "ON" : "OFF"}
                  </button>
                  {canFixAll && (
                    <button
                      onClick={handleFixAll}
                      disabled={fixingAll}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "7px 14px",
                        borderRadius: 8,
                        border: "none",
                        backgroundColor: "#16A34A",
                        color: "#ffffff",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        opacity: fixingAll ? 0.7 : 1,
                      }}
                    >
                      <CheckCheck style={{ width: 15, height: 15 }} />
                      {fixingAll ? "Fixing…" : `Fix All (${pagination.total})`}
                    </button>
                  )}
                </>
              )}

              {activeTab !== "filescan" && (
                <>
                  <button
                    onClick={() => setShowScanPanel((p) => !p)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 14px",
                      borderRadius: 8,
                      border: `1px solid ${showScanPanel ? "#6366F1" : "#D1D5DB"}`,
                      backgroundColor: showScanPanel ? "#EEF2FF" : "#ffffff",
                      color: showScanPanel ? "#4F46E5" : "#374151",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    <ScanLine style={{ width: 14, height: 14 }} />
                    Scan System
                    {isAutoRunning && (
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          backgroundColor: "#16A34A",
                          display: "inline-block",
                        }}
                      />
                    )}
                  </button>

                  <button
                    onClick={() => setGroupByCategory((g) => !g)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 14px",
                      borderRadius: 8,
                      border: `1px solid ${groupByCategory ? "#A78BFA" : "#D1D5DB"}`,
                      backgroundColor: groupByCategory ? "#EDE9FE" : "#ffffff",
                      color: groupByCategory ? "#7C3AED" : "#374151",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    <Layers style={{ width: 14, height: 14 }} />
                    Group by Type
                  </button>

                  <button
                    onClick={() => setShowFilters((f) => !f)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 14px",
                      borderRadius: 8,
                      border: `1px solid ${hasFilters ? "#818CF8" : "#D1D5DB"}`,
                      backgroundColor: hasFilters ? "#EEF2FF" : "#ffffff",
                      color: hasFilters ? "#4F46E5" : "#374151",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    <Filter style={{ width: 14, height: 14 }} />
                    Filters
                    {hasFilters && (
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          backgroundColor: "#6366F1",
                          display: "inline-block",
                        }}
                      />
                    )}
                  </button>
                </>
              )}

              <button
                onClick={() =>
                  activeTab === "customers"
                    ? refetchCustomers()
                    : activeTab === "filescan"
                      ? (refetchFileScanLatest(), refetchFileScanHistory())
                      : refetch()
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 14px",
                  borderRadius: 8,
                  border: "1px solid #D1D5DB",
                  backgroundColor: "#ffffff",
                  color: "#374151",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <RefreshCw
                  style={{
                    width: 14,
                    height: 14,
                    animation: isLoading || customerLoading ? "spin 1s linear infinite" : "none",
                  }}
                />
                Refresh
              </button>
            </div>
          }
        />

        {/* ── Scan Panel ── */}
        {showScanPanel && activeTab !== "filescan" && (
          <div
            style={{
              backgroundColor: "#EEF2FF",
              border: "1px solid #C7D2FE",
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#1F2937",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <ScanLine style={{ width: 16, height: 16, color: "#4F46E5" }} />
                System Scan
              </span>
              <button
                onClick={() => setShowScanPanel(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}
              >
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {(
                [
                  { id: "manual", label: "On Demand", icon: Play },
                  { id: "auto", label: "Auto Refresh", icon: RotateCcw },
                  { id: "daily", label: "Daily", icon: Calendar },
                  { id: "specific", label: "Specific Time", icon: Clock },
                ] as { id: ScanMode; label: string; icon: typeof Play }[]
              ).map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setScanMode(m.id);
                    stopAutoScan();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 14px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    border: `1px solid ${scanMode === m.id ? "#4F46E5" : "#C7D2FE"}`,
                    backgroundColor: scanMode === m.id ? "#4F46E5" : "#ffffff",
                    color: scanMode === m.id ? "#ffffff" : "#374151",
                    cursor: "pointer",
                  }}
                >
                  <m.icon style={{ width: 13, height: 13 }} />
                  {m.label}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
              {scanMode === "manual" && (
                <button
                  onClick={runScan}
                  disabled={isScanning}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 18px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    backgroundColor: "#4F46E5",
                    color: "#fff",
                    border: "none",
                    cursor: isScanning ? "not-allowed" : "pointer",
                    opacity: isScanning ? 0.7 : 1,
                  }}
                >
                  <Play
                    style={{
                      width: 13,
                      height: 13,
                      animation: isScanning ? "spin 1s linear infinite" : "none",
                    }}
                  />
                  {isScanning ? "Scanning…" : "Run Scan Now"}
                </button>
              )}

              {scanMode === "auto" && (
                <>
                  <div>
                    <p style={{ fontSize: 11, color: "#4B5563", fontWeight: 600, marginBottom: 4 }}>
                      Scan Interval
                    </p>
                    <select
                      value={autoInterval}
                      onChange={(e) => {
                        setAutoInterval(Number(e.target.value));
                        stopAutoScan();
                      }}
                      style={{
                        backgroundColor: "#fff",
                        border: "1px solid #C7D2FE",
                        borderRadius: 8,
                        padding: "7px 12px",
                        fontSize: 13,
                        color: "#374151",
                      }}
                    >
                      {AUTO_INTERVALS.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={isAutoRunning ? stopAutoScan : startAutoScan}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 18px",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      backgroundColor: isAutoRunning ? "#EF4444" : "#16A34A",
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {isAutoRunning ? (
                      <>
                        <Pause style={{ width: 13, height: 13 }} /> Stop Auto-Scan
                      </>
                    ) : (
                      <>
                        <Play style={{ width: 13, height: 13 }} /> Start Auto-Scan
                      </>
                    )}
                  </button>
                </>
              )}

              {scanMode === "daily" && (
                <>
                  <div>
                    <p style={{ fontSize: 11, color: "#4B5563", fontWeight: 600, marginBottom: 4 }}>
                      Daily Scan Time
                    </p>
                    <input
                      type="time"
                      value={dailyTime}
                      onChange={(e) => setDailyTime(e.target.value)}
                      style={{
                        backgroundColor: "#fff",
                        border: "1px solid #C7D2FE",
                        borderRadius: 8,
                        padding: "7px 12px",
                        fontSize: 13,
                        color: "#374151",
                        outline: "none",
                      }}
                    />
                  </div>
                  <button
                    onClick={scheduleDailyScan}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 18px",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      backgroundColor: "#4F46E5",
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <Calendar style={{ width: 13, height: 13 }} /> Schedule Daily Scan
                  </button>
                  <button
                    onClick={runScan}
                    disabled={isScanning}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 14px",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 500,
                      backgroundColor: "#fff",
                      color: "#374151",
                      border: "1px solid #C7D2FE",
                      cursor: "pointer",
                    }}
                  >
                    <Play style={{ width: 13, height: 13 }} /> Run Now
                  </button>
                </>
              )}

              {scanMode === "specific" && (
                <>
                  <div>
                    <p style={{ fontSize: 11, color: "#4B5563", fontWeight: 600, marginBottom: 4 }}>
                      Schedule at
                    </p>
                    <input
                      type="datetime-local"
                      value={specificDateTime}
                      onChange={(e) => setSpecificDateTime(e.target.value)}
                      style={{
                        backgroundColor: "#fff",
                        border: "1px solid #C7D2FE",
                        borderRadius: 8,
                        padding: "7px 12px",
                        fontSize: 13,
                        color: "#374151",
                        outline: "none",
                      }}
                    />
                  </div>
                  <button
                    onClick={scheduleSpecificScan}
                    disabled={!specificDateTime}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 18px",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      backgroundColor: "#4F46E5",
                      color: "#fff",
                      border: "none",
                      cursor: !specificDateTime ? "not-allowed" : "pointer",
                      opacity: !specificDateTime ? 0.6 : 1,
                    }}
                  >
                    <Clock style={{ width: 13, height: 13 }} /> Schedule Scan
                  </button>
                </>
              )}
            </div>

            {scanError && (
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: "#B91C1C",
                  fontSize: 12,
                  backgroundColor: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: 8,
                  padding: "8px 12px",
                }}
              >
                <AlertCircle style={{ width: 13, height: 13, flexShrink: 0 }} /> {scanError}
              </div>
            )}

            {scanResult && (
              <div style={{ marginTop: 14, borderTop: "1px solid #C7D2FE", paddingTop: 14 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>
                    Scan completed in {scanResult.durationMs}ms ·
                  </span>
                  {[
                    { label: "Unresolved", value: scanResult.totalUnresolved, color: "#374151" },
                    {
                      label: "Critical (1h)",
                      value: scanResult.criticalLastHour,
                      color: scanResult.criticalLastHour > 0 ? "#B91C1C" : "#15803D",
                    },
                    {
                      label: "Customer Reports",
                      value: scanResult.customerReportsPending,
                      color: scanResult.customerReportsPending > 0 ? "#92400E" : "#15803D",
                    },
                  ].map((s) => (
                    <span
                      key={s.label}
                      style={{
                        fontSize: 12,
                        color: s.color,
                        fontWeight: 600,
                        backgroundColor: "#ffffff",
                        padding: "2px 10px",
                        borderRadius: 9999,
                        border: "1px solid #E5E7EB",
                      }}
                    >
                      {s.label}: {s.value}
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {scanResult.findings.map((f, i) => {
                    const fc = SCAN_FINDING_COLORS[f.severity] || SCAN_FINDING_COLORS.ok!;
                    return (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          backgroundColor: fc.bg,
                          border: `1px solid ${fc.border}`,
                          borderRadius: 8,
                          padding: "8px 12px",
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            backgroundColor: fc.dot,
                            flexShrink: 0,
                            marginTop: 4,
                          }}
                        />
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 600, color: fc.color, margin: 0 }}>
                            {f.message}
                          </p>
                          <p
                            style={{
                              fontSize: 11,
                              color: fc.color,
                              opacity: 0.8,
                              margin: "2px 0 0 0",
                            }}
                          >
                            {f.detail}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Auto-Resolve Settings Panel ── */}
        {showAutoResolvePanel && (
          <div
            style={{
              backgroundColor: "#F0FDF4",
              border: "1px solid #BBF7D0",
              borderRadius: 12,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Bot style={{ width: 18, height: 18, color: "#16A34A" }} />
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>
                  AI Auto-Resolve Settings
                </h3>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={() => runAutoResolveMutation.mutate()}
                  disabled={runAutoResolveMutation.isPending}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "6px 12px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    backgroundColor: "#4F46E5",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    opacity: runAutoResolveMutation.isPending ? 0.6 : 1,
                  }}
                >
                  <Play style={{ width: 12, height: 12 }} />{" "}
                  {runAutoResolveMutation.isPending ? "Running…" : "Run Now"}
                </button>
                <button
                  onClick={() => setShowAutoResolvePanel(false)}
                  style={{
                    padding: "4px",
                    borderRadius: 6,
                    border: "none",
                    backgroundColor: "transparent",
                    cursor: "pointer",
                    color: "#9CA3AF",
                  }}
                >
                  <X style={{ width: 16, height: 16 }} />
                </button>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                    Master Toggle
                  </span>
                  <button
                    onClick={() =>
                      updateAutoSettingsMutation.mutate({ enabled: !autoResolveSettings?.enabled })
                    }
                    style={{
                      padding: "4px 12px",
                      borderRadius: 9999,
                      fontSize: 11,
                      fontWeight: 700,
                      border: "none",
                      cursor: "pointer",
                      backgroundColor: autoResolveSettings?.enabled ? "#16A34A" : "#D1D5DB",
                      color: "#fff",
                    }}
                  >
                    {autoResolveSettings?.enabled ? "ON" : "OFF"}
                  </button>
                </div>
              </div>
              <div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#374151",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Severities to Auto-Resolve
                </span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["minor", "medium", "critical"].map((s) => (
                    <label
                      key={s}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 11,
                        color: "#374151",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={autoResolveSettings?.severities?.includes(s) || false}
                        onChange={(e) => {
                          const curr = autoResolveSettings?.severities || [];
                          const next = e.target.checked
                            ? [...curr, s]
                            : curr.filter((v: string) => v !== s);
                          updateAutoSettingsMutation.mutate({ severities: next });
                        }}
                      />
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#374151",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Error Types to Auto-Resolve
                </span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[
                    "ui_error",
                    "api_error",
                    "frontend_crash",
                    "db_error",
                    "route_error",
                    "unhandled_exception",
                  ].map((t) => (
                    <label
                      key={t}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 11,
                        color: "#374151",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={autoResolveSettings?.errorTypes?.includes(t) || false}
                        onChange={(e) => {
                          const curr = autoResolveSettings?.errorTypes || [];
                          const next = e.target.checked
                            ? [...curr, t]
                            : curr.filter((v: string) => v !== t);
                          updateAutoSettingsMutation.mutate({ errorTypes: next });
                        }}
                      />
                      {t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                    Duplicate Detection
                  </span>
                  <button
                    onClick={() =>
                      updateAutoSettingsMutation.mutate({
                        duplicateDetection: !autoResolveSettings?.duplicateDetection,
                      })
                    }
                    style={{
                      padding: "4px 12px",
                      borderRadius: 9999,
                      fontSize: 11,
                      fontWeight: 700,
                      border: "none",
                      cursor: "pointer",
                      backgroundColor: autoResolveSettings?.duplicateDetection
                        ? "#16A34A"
                        : "#D1D5DB",
                      color: "#fff",
                    }}
                  >
                    {autoResolveSettings?.duplicateDetection ? "ON" : "OFF"}
                  </button>
                </div>
              </div>
              <div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#374151",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Age Threshold (minutes)
                </span>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={autoResolveSettings?.ageThresholdMinutes || 30}
                  onChange={(e) =>
                    updateAutoSettingsMutation.mutate({
                      ageThresholdMinutes: parseInt(e.target.value) || 30,
                    })
                  }
                  style={{
                    width: 80,
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid #D1D5DB",
                    fontSize: 13,
                    color: "#374151",
                  }}
                />
              </div>
              <div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#374151",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Run Interval
                </span>
                <select
                  value={autoResolveSettings?.intervalMs || 300000}
                  onChange={(e) =>
                    updateAutoSettingsMutation.mutate({ intervalMs: parseInt(e.target.value) })
                  }
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid #D1D5DB",
                    fontSize: 13,
                    color: "#374151",
                    backgroundColor: "#fff",
                  }}
                >
                  <option value={30000}>30 seconds</option>
                  <option value={60000}>1 minute</option>
                  <option value={300000}>5 minutes</option>
                  <option value={600000}>10 minutes</option>
                  <option value={900000}>15 minutes</option>
                  <option value={1800000}>30 minutes</option>
                  <option value={3600000}>1 hour</option>
                </select>
              </div>
            </div>

            {autoResolveLog && autoResolveLog.length > 0 && (
              <div style={{ borderTop: "1px solid #BBF7D0", paddingTop: 12 }}>
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#374151",
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Activity style={{ width: 13, height: 13 }} /> Activity Log
                </p>
                <div
                  style={{
                    maxHeight: 200,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {autoResolveLog.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 11,
                        color: "#374151",
                        backgroundColor: "#ffffff",
                        border: "1px solid #E5E7EB",
                        borderRadius: 6,
                        padding: "6px 10px",
                      }}
                    >
                      <span style={{ color: "#9CA3AF", flexShrink: 0 }}>
                        {formatTimestamp(log.createdAt)}
                      </span>
                      <span
                        style={{
                          fontFamily: "monospace",
                          color: "#6B7280",
                          fontSize: 10,
                          backgroundColor: "#F3F4F6",
                          padding: "1px 4px",
                          borderRadius: 4,
                        }}
                      >
                        {log.errorReportId.slice(0, 8)}
                      </span>
                      <span style={{ flex: 1 }}>{log.reason}</span>
                      <span
                        style={{
                          color: "#4F46E5",
                          fontSize: 10,
                          backgroundColor: "#EEF2FF",
                          padding: "1px 6px",
                          borderRadius: 4,
                        }}
                      >
                        {log.ruleMatched.replace(/_/g, " ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Filter Bar ── */}
        {showFilters && activeTab !== "customers" && activeTab !== "filescan" && (
          <div
            style={{
              backgroundColor: "#EEF2FF",
              border: "1px solid #C7D2FE",
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Filters</span>
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    color: "#DC2626",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <X style={{ width: 12, height: 12 }} /> Clear all
                </button>
              )}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: 10,
              }}
            >
              {[
                {
                  value: sourceApp,
                  onChange: (v: string) => {
                    setSourceApp(v);
                    setPage(1);
                  },
                  options: SOURCE_APPS,
                },
                {
                  value: severity,
                  onChange: (v: string) => {
                    setSeverity(v);
                    setPage(1);
                  },
                  options: SEVERITIES,
                },
                {
                  value: errorType,
                  onChange: (v: string) => {
                    setErrorType(v);
                    setPage(1);
                  },
                  options: ERROR_TYPES,
                },
                {
                  value: resolutionMethod,
                  onChange: (v: string) => {
                    setResolutionMethod(v);
                    setPage(1);
                  },
                  options: RESOLUTION_METHODS,
                },
              ].map((sel, i) => (
                <select
                  key={i}
                  value={sel.value}
                  onChange={(e) => sel.onChange(e.target.value)}
                  style={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #D1D5DB",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 13,
                    color: "#374151",
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  {sel.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ))}
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #D1D5DB",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 13,
                  color: "#374151",
                  outline: "none",
                }}
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #D1D5DB",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 13,
                  color: "#374151",
                  outline: "none",
                }}
              />
            </div>
          </div>
        )}

        {/* ── Customer Report Filter ── */}
        {activeTab === "customers" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>
              Filter by status:
            </span>
            {["", "new", "reviewed", "closed"].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setCustomerStatusFilter(s);
                  setCustomerPage(1);
                }}
                style={{
                  padding: "5px 14px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  border: `1px solid ${customerStatusFilter === s ? "#6366F1" : "#D1D5DB"}`,
                  backgroundColor: customerStatusFilter === s ? "#EEF2FF" : "#ffffff",
                  color: customerStatusFilter === s ? "#4F46E5" : "#374151",
                }}
              >
                {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        )}

        {/* ── Tabs ── */}
        <div
          style={{
            display: "flex",
            borderBottom: "2px solid #E5E7EB",
            marginBottom: 16,
            overflowX: "auto",
          }}
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const cnt = tabCounts[tab.id];
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  whiteSpace: "nowrap",
                  padding: "10px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "none",
                  borderBottom: isActive
                    ? `2px solid ${tab.activeBorder}`
                    : "2px solid transparent",
                  marginBottom: -2,
                  cursor: "pointer",
                  backgroundColor: isActive ? tab.activeBg : "transparent",
                  color: isActive ? tab.activeColor : "#6B7280",
                  borderRadius: "8px 8px 0 0",
                  transition: "all 0.15s",
                }}
              >
                <Icon style={{ width: 15, height: 15 }} />
                {tab.label}
                {cnt > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "1px 7px",
                      borderRadius: 9999,
                      backgroundColor: isActive ? tab.badgeBg : "#F3F4F6",
                      color: isActive ? tab.badgeColor : "#6B7280",
                      minWidth: 20,
                      textAlign: "center",
                    }}
                  >
                    {cnt > 999 ? "999+" : cnt}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Floating selection action bar ── */}
        {selectedIds.size > 0 && activeTab !== "customers" && activeTab !== "filescan" && (
          <div
            style={{
              position: "fixed",
              bottom: 24,
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: "#1F2937",
              color: "#fff",
              borderRadius: 12,
              padding: "12px 20px",
              display: "flex",
              alignItems: "center",
              gap: 14,
              zIndex: 9000,
              boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
              border: "1px solid #374151",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              {selectedIds.size} error{selectedIds.size > 1 ? "s" : ""} selected
            </span>
            <button
              onClick={handleBulkGenerateTask}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 16px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                backgroundColor: "#7C3AED",
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              <FileText style={{ width: 13, height: 13 }} />
              Bulk Task Plan
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "7px 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 500,
                backgroundColor: "#374151",
                color: "#D1D5DB",
                border: "none",
                cursor: "pointer",
              }}
            >
              <X style={{ width: 12, height: 12 }} />
              Clear
            </button>
          </div>
        )}

        {/* ── Error / Customer List ── */}
        <div
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #E5E7EB",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}
        >
          {activeTab === "filescan" ? (
            /* ── File Scan Tab ───────────────────────────────────────────── */
            <div style={{ padding: 20 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 20,
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <ScanLine style={{ width: 20, height: 20, color: "#7C3AED" }} />
                  <div>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: 0 }}>
                      Source File Scanner
                    </h2>
                    <p style={{ fontSize: 12, color: "#6B7280", margin: 0, marginTop: 2 }}>
                      {fileScanLatest
                        ? `Last scan: ${formatTimestamp(fileScanLatest.scannedAt)} · ${fileScanLatest.totalFindings} findings`
                        : "No scans run yet"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleRunFileScan}
                  disabled={fileScanRunning}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "9px 20px",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    backgroundColor: fileScanRunning ? "#E5E7EB" : "#7C3AED",
                    color: fileScanRunning ? "#9CA3AF" : "#fff",
                    border: "none",
                    cursor: fileScanRunning ? "not-allowed" : "pointer",
                  }}
                >
                  <Play
                    style={{
                      width: 14,
                      height: 14,
                      animation: fileScanRunning ? "spin 1s linear infinite" : "none",
                    }}
                  />
                  {fileScanRunning ? "Scanning…" : "Run Scan Now"}
                </button>
              </div>

              {fileScanError && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: "#B91C1C",
                    fontSize: 12,
                    backgroundColor: "#FEF2F2",
                    border: "1px solid #FECACA",
                    borderRadius: 8,
                    padding: "10px 14px",
                    marginBottom: 16,
                  }}
                >
                  <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} /> {fileScanError}
                </div>
              )}

              {fileScanHistory && fileScanHistory.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#374151",
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                    }}
                  >
                    Scan History
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {fileScanHistory.map((h) => (
                      <div
                        key={h.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "6px 12px",
                          borderRadius: 8,
                          backgroundColor: "#F8FAFC",
                          border: "1px solid #E5E7EB",
                          fontSize: 11,
                          color: "#374151",
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{formatTimestamp(h.scannedAt)}</span>
                        <span
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: "50%",
                            backgroundColor: "#9CA3AF",
                          }}
                        />
                        <span
                          style={{
                            color: h.totalFindings > 0 ? "#7C3AED" : "#15803D",
                            fontWeight: 700,
                          }}
                        >
                          {h.totalFindings} finding{h.totalFindings !== 1 ? "s" : ""}
                        </span>
                        <span style={{ color: "#9CA3AF" }}>{h.triggeredBy}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {fileScanFindings.length === 0 ? (
                fileScanLatest ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "60px 0",
                      color: "#9CA3AF",
                    }}
                  >
                    <CheckCircle2
                      style={{ width: 48, height: 48, color: "#4ADE80", marginBottom: 12 }}
                    />
                    <p style={{ fontSize: 18, fontWeight: 600, color: "#374151", margin: 0 }}>
                      No issues found
                    </p>
                    <p style={{ fontSize: 13, marginTop: 4 }}>
                      All scanned files passed the code quality checks.
                    </p>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "60px 0",
                      color: "#9CA3AF",
                    }}
                  >
                    <ScanLine
                      style={{ width: 48, height: 48, color: "#A78BFA", marginBottom: 12 }}
                    />
                    <p style={{ fontSize: 18, fontWeight: 600, color: "#374151", margin: 0 }}>
                      Run a scan to get started
                    </p>
                    <p style={{ fontSize: 13, marginTop: 4 }}>
                      Click "Run Scan Now" to analyze your source files for code quality issues.
                    </p>
                  </div>
                )
              ) : (
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 14,
                      flexWrap: "wrap",
                    }}
                  >
                    {(["critical", "medium", "minor"] as const).map((sev) => {
                      const count = fileScanFindings.filter((f) => f.severity === sev).length;
                      if (!count) return null;
                      const sc = SCAN_FINDING_COLORS[sev]!;
                      return (
                        <span
                          key={sev}
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            padding: "3px 12px",
                            borderRadius: 9999,
                            backgroundColor: sc.bg,
                            color: sc.color,
                            border: `1px solid ${sc.border}`,
                          }}
                        >
                          {sev.charAt(0).toUpperCase() + sev.slice(1)}: {count}
                        </span>
                      );
                    })}
                    <span style={{ fontSize: 12, color: "#6B7280", marginLeft: "auto" }}>
                      {fileScanFindings.length} total finding
                      {fileScanFindings.length !== 1 ? "s" : ""} in {fileScanLatest?.durationMs}ms
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {fileScanFindings.map((finding, i) => {
                      const fc = SCAN_FINDING_COLORS[finding.severity]!;
                      const isExp = fileScanExpandedFinding === i;
                      return (
                        <div
                          key={i}
                          style={{
                            backgroundColor: "#ffffff",
                            border: `1px solid ${fc.border}`,
                            borderLeft: `4px solid ${fc.dot}`,
                            borderRadius: 8,
                            marginBottom: 6,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 12,
                              padding: "10px 14px",
                              cursor: "pointer",
                            }}
                            onClick={() => setFileScanExpandedFinding(isExp ? null : i)}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                backgroundColor: fc.dot,
                                flexShrink: 0,
                                marginTop: 5,
                              }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  marginBottom: 3,
                                  flexWrap: "wrap",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: fc.color,
                                    backgroundColor: fc.bg,
                                    padding: "1px 8px",
                                    borderRadius: 9999,
                                    border: `1px solid ${fc.border}`,
                                  }}
                                >
                                  {finding.severity.toUpperCase()}
                                </span>
                                <code
                                  style={{
                                    fontSize: 11,
                                    color: "#6B7280",
                                    backgroundColor: "#F3F4F6",
                                    padding: "1px 6px",
                                    borderRadius: 4,
                                  }}
                                >
                                  {finding.ruleName}
                                </code>
                                <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                                  {isExp ? (
                                    <ChevronDown
                                      style={{ width: 12, height: 12, display: "inline" }}
                                    />
                                  ) : (
                                    <ChevronRight
                                      style={{ width: 12, height: 12, display: "inline" }}
                                    />
                                  )}
                                </span>
                              </div>
                              <p
                                style={{
                                  fontSize: 13,
                                  fontWeight: 500,
                                  color: "#111827",
                                  margin: "0 0 3px 0",
                                }}
                              >
                                {finding.message}
                              </p>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 10,
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                }}
                              >
                                <code
                                  style={{
                                    fontSize: 11,
                                    color: "#4F46E5",
                                    backgroundColor: "#EEF2FF",
                                    padding: "1px 8px",
                                    borderRadius: 4,
                                  }}
                                >
                                  {finding.filePath}:{finding.lineNumber}
                                </code>
                              </div>
                            </div>
                            <div style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => handleFileScanGenerateTask(finding)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                  padding: "5px 10px",
                                  borderRadius: 7,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  backgroundColor: "#EDE9FE",
                                  color: "#7C3AED",
                                  border: "1px solid #DDD6FE",
                                  cursor: "pointer",
                                }}
                              >
                                <FileText style={{ width: 11, height: 11 }} />
                                Task Plan
                              </button>
                            </div>
                          </div>
                          {isExp && (
                            <div
                              style={{
                                padding: "0 14px 14px 34px",
                                borderTop: "1px solid #F1F5F9",
                              }}
                            >
                              <p
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: "#6B7280",
                                  marginBottom: 4,
                                  marginTop: 10,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.07em",
                                }}
                              >
                                Code Snippet
                              </p>
                              <pre
                                style={{
                                  fontSize: 11,
                                  fontFamily: "monospace",
                                  backgroundColor: "#F8FAFC",
                                  border: "1px solid #E5E7EB",
                                  borderRadius: 6,
                                  padding: "8px 12px",
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-all",
                                  color: "#374151",
                                  margin: 0,
                                }}
                              >
                                {finding.snippet}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === "customers" ? (
            <>
              {customerLoading && customerReports.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "80px 0",
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      border: "4px solid #7C3AED",
                      borderTopColor: "transparent",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                </div>
              ) : customerReports.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "80px 0",
                    color: "#9CA3AF",
                  }}
                >
                  <MessageSquare
                    style={{ width: 48, height: 48, color: "#A78BFA", marginBottom: 12 }}
                  />
                  <p style={{ fontSize: 18, fontWeight: 600, color: "#374151", margin: 0 }}>
                    No customer reports
                  </p>
                  <p style={{ fontSize: 13, marginTop: 4 }}>
                    Customer-submitted bug reports will appear here
                  </p>
                </div>
              ) : (
                <div>{customerReports.map((r) => renderCustomerReportRow(r))}</div>
              )}
              {customerPagination.totalPages > 1 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    borderTop: "1px solid #F1F5F9",
                    backgroundColor: "#F8FAFC",
                  }}
                >
                  <span style={{ fontSize: 12, color: "#6B7280" }}>
                    Page {customerPagination.page} of {customerPagination.totalPages} ·{" "}
                    {customerPagination.total} total
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setCustomerPage((p) => Math.max(1, p - 1))}
                      disabled={customerPage <= 1}
                      style={{
                        padding: "5px 14px",
                        borderRadius: 8,
                        fontSize: 12,
                        border: "1px solid #D1D5DB",
                        backgroundColor: "#ffffff",
                        color: "#374151",
                        cursor: customerPage <= 1 ? "not-allowed" : "pointer",
                        opacity: customerPage <= 1 ? 0.5 : 1,
                      }}
                    >
                      Previous
                    </button>
                    <button
                      onClick={() =>
                        setCustomerPage((p) => Math.min(customerPagination.totalPages, p + 1))
                      }
                      disabled={customerPage >= customerPagination.totalPages}
                      style={{
                        padding: "5px 14px",
                        borderRadius: 8,
                        fontSize: 12,
                        border: "1px solid #D1D5DB",
                        backgroundColor: "#ffffff",
                        color: "#374151",
                        cursor:
                          customerPage >= customerPagination.totalPages ? "not-allowed" : "pointer",
                        opacity: customerPage >= customerPagination.totalPages ? 0.5 : 1,
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {isLoading && reports.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "80px 0",
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      border: "4px solid #6366F1",
                      borderTopColor: "transparent",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                </div>
              ) : reports.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "80px 0",
                    color: "#9CA3AF",
                  }}
                >
                  {activeTab === "completed" ? (
                    <>
                      <CheckCircle2
                        style={{ width: 48, height: 48, color: "#4ADE80", marginBottom: 12 }}
                      />
                      <p style={{ fontSize: 18, fontWeight: 600, color: "#374151", margin: 0 }}>
                        No completed errors
                      </p>
                      <p style={{ fontSize: 13, marginTop: 4 }}>Resolved errors will appear here</p>
                    </>
                  ) : activeTab === "unresolved" ? (
                    <>
                      <ShieldAlert
                        style={{ width: 48, height: 48, color: "#FCD34D", marginBottom: 12 }}
                      />
                      <p style={{ fontSize: 18, fontWeight: 600, color: "#374151", margin: 0 }}>
                        No unresolved errors
                      </p>
                      <p style={{ fontSize: 13, marginTop: 4 }}>
                        Acknowledged / in-progress errors appear here
                      </p>
                    </>
                  ) : (
                    <>
                      <Inbox
                        style={{ width: 48, height: 48, color: "#4ADE80", marginBottom: 12 }}
                      />
                      <p style={{ fontSize: 18, fontWeight: 600, color: "#374151", margin: 0 }}>
                        No new errors
                      </p>
                      <p style={{ fontSize: 13, marginTop: 4 }}>All systems are running smoothly</p>
                    </>
                  )}
                </div>
              ) : groupedReports ? (
                <div>
                  {reports.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 16px",
                        backgroundColor: "#F8FAFC",
                        borderBottom: "1px solid #E5E7EB",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.size === reports.length && reports.length > 0}
                        onChange={toggleSelectAll}
                        style={{ width: 14, height: 14, cursor: "pointer", accentColor: "#7C3AED" }}
                      />
                      <span style={{ fontSize: 12, color: "#6B7280" }}>
                        {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all"}
                      </span>
                    </div>
                  )}
                  {Object.entries(groupedReports).map(([cat, catReports]) => (
                    <div key={cat}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "10px 16px",
                          backgroundColor: "#F8FAFC",
                          borderBottom: "1px solid #E5E7EB",
                          position: "sticky",
                          top: 0,
                          zIndex: 10,
                        }}
                      >
                        <AlertTriangle style={{ width: 13, height: 13, color: "#9CA3AF" }} />
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: "#4B5563",
                          }}
                        >
                          {CATEGORY_LABELS[cat] || cat}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "1px 7px",
                            borderRadius: 9999,
                            backgroundColor: "#E5E7EB",
                            color: "#4B5563",
                          }}
                        >
                          {catReports.length}
                        </span>
                      </div>
                      <div>{catReports.map((r) => renderReportRow(r))}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  {reports.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 16px",
                        backgroundColor: "#F8FAFC",
                        borderBottom: "1px solid #E5E7EB",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.size === reports.length && reports.length > 0}
                        onChange={toggleSelectAll}
                        style={{ width: 14, height: 14, cursor: "pointer", accentColor: "#7C3AED" }}
                      />
                      <span style={{ fontSize: 12, color: "#6B7280" }}>
                        {selectedIds.size > 0
                          ? `${selectedIds.size} of ${reports.length} selected`
                          : `Select all ${reports.length}`}
                      </span>
                    </div>
                  )}
                  {reports.map((r) => renderReportRow(r))}
                </div>
              )}

              {pagination.totalPages > 1 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    borderTop: "1px solid #F1F5F9",
                    backgroundColor: "#F8FAFC",
                  }}
                >
                  <span style={{ fontSize: 12, color: "#6B7280" }}>
                    Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      style={{
                        padding: "5px 14px",
                        borderRadius: 8,
                        fontSize: 12,
                        border: "1px solid #D1D5DB",
                        backgroundColor: "#ffffff",
                        color: "#374151",
                        cursor: page <= 1 ? "not-allowed" : "pointer",
                        opacity: page <= 1 ? 0.5 : 1,
                      }}
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                      disabled={page >= pagination.totalPages}
                      style={{
                        padding: "5px 14px",
                        borderRadius: 8,
                        fontSize: 12,
                        border: "1px solid #D1D5DB",
                        backgroundColor: "#ffffff",
                        color: "#374151",
                        cursor: page >= pagination.totalPages ? "not-allowed" : "pointer",
                        opacity: page >= pagination.totalPages ? 0.5 : 1,
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Manual Resolve Dialog ── */}
        {showManualResolveDialog && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
            onClick={() => setShowManualResolveDialog(null)}
          >
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: 16,
                padding: 24,
                maxWidth: 520,
                width: "100%",
                boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#111827",
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  margin: "0 0 16px 0",
                }}
              >
                <Wrench style={{ width: 18, height: 18, color: "#F59E0B" }} /> Manual Resolution
              </h3>
              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#374151",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Root Cause
                </label>
                <textarea
                  value={manualRootCause}
                  onChange={(e) => setManualRootCause(e.target.value)}
                  placeholder="Describe the root cause of this error..."
                  rows={3}
                  style={{
                    width: "100%",
                    fontSize: 13,
                    color: "#374151",
                    border: "1px solid #D1D5DB",
                    borderRadius: 8,
                    padding: "8px 12px",
                    outline: "none",
                    resize: "vertical",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#374151",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Resolution Notes
                </label>
                <textarea
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="How was this resolved? What was done to fix it?"
                  rows={4}
                  style={{
                    width: "100%",
                    fontSize: 13,
                    color: "#374151",
                    border: "1px solid #D1D5DB",
                    borderRadius: 8,
                    padding: "8px 12px",
                    outline: "none",
                    resize: "vertical",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  onClick={() => setShowManualResolveDialog(null)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "1px solid #D1D5DB",
                    backgroundColor: "#ffffff",
                    color: "#374151",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleManualResolve}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: "#16A34A",
                    color: "#ffffff",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Resolve
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Task Plan Dialog ── */}
        {showTaskPlanDialog && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
            onClick={() => setShowTaskPlanDialog(null)}
          >
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: 16,
                padding: 24,
                maxWidth: 640,
                width: "100%",
                maxHeight: "80vh",
                overflow: "auto",
                boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#111827",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    margin: 0,
                  }}
                >
                  <FileText style={{ width: 18, height: 18, color: "#4F46E5" }} /> Generated Task
                  Plan
                </h3>
                <button
                  onClick={async () => {
                    // Routed through the shared safeCopyToClipboard helper so
                    // clipboard denials surface in the [safeClipboard] log
                    // channel; on failure we fall back to a hidden textarea +
                    // execCommand("copy") so we never trigger a native prompt.
                    const result = await safeCopyToClipboard(taskPlanContent);
                    if (!result.ok) {
                      try {
                        const ta = document.createElement("textarea");
                        ta.value = taskPlanContent;
                        ta.setAttribute("readonly", "");
                        ta.style.position = "fixed";
                        ta.style.opacity = "0";
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand("copy");
                        document.body.removeChild(ta);
                      } catch (clipErr) {
                        // eslint-disable-next-line no-console
                        console.debug("[error-monitor] clipboard fallback failed:", clipErr);
                      }
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "6px 12px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    backgroundColor: "#EEF2FF",
                    color: "#4F46E5",
                    border: "1px solid #C7D2FE",
                    cursor: "pointer",
                  }}
                >
                  <Copy style={{ width: 12, height: 12 }} /> Copy
                </button>
              </div>
              {taskPlanLoading ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 40,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      border: "4px solid #4F46E5",
                      borderTopColor: "transparent",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                </div>
              ) : (
                <pre
                  style={{
                    fontSize: 12,
                    fontFamily: "monospace",
                    color: "#374151",
                    backgroundColor: "#F8FAFC",
                    border: "1px solid #E5E7EB",
                    borderRadius: 8,
                    padding: 16,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxHeight: 500,
                    overflow: "auto",
                  }}
                >
                  {taskPlanContent}
                </pre>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                <button
                  onClick={() => setShowTaskPlanDialog(null)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "1px solid #D1D5DB",
                    backgroundColor: "#ffffff",
                    color: "#374151",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Bulk Task Plan Modal ── */}
        {showBulkTaskModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
            onClick={() => setShowBulkTaskModal(false)}
          >
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: 16,
                padding: 24,
                maxWidth: 700,
                width: "100%",
                maxHeight: "85vh",
                overflow: "auto",
                boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#111827",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    margin: 0,
                  }}
                >
                  <FileText style={{ width: 18, height: 18, color: "#7C3AED" }} /> Bulk Task Plan —{" "}
                  {selectedIds.size} Error{selectedIds.size > 1 ? "s" : ""}
                </h3>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={async () => {
                      const result = await safeCopyToClipboard(bulkTaskContent);
                      if (!result.ok) {
                        try {
                          const ta = document.createElement("textarea");
                          ta.value = bulkTaskContent;
                          ta.setAttribute("readonly", "");
                          ta.style.position = "fixed";
                          ta.style.opacity = "0";
                          document.body.appendChild(ta);
                          ta.select();
                          document.execCommand("copy");
                          document.body.removeChild(ta);
                        } catch (clipErr) {
                          // eslint-disable-next-line no-console
                          console.debug("[error-monitor] clipboard fallback failed:", clipErr);
                        }
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "6px 12px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      backgroundColor: "#EDE9FE",
                      color: "#7C3AED",
                      border: "1px solid #DDD6FE",
                      cursor: "pointer",
                    }}
                  >
                    <Copy style={{ width: 12, height: 12 }} /> Copy
                  </button>
                  <button
                    onClick={() => setShowBulkTaskModal(false)}
                    style={{
                      padding: "6px",
                      borderRadius: 6,
                      border: "none",
                      backgroundColor: "transparent",
                      cursor: "pointer",
                      color: "#9CA3AF",
                    }}
                  >
                    <X style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              </div>
              {bulkTaskLoading ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 40,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      border: "4px solid #7C3AED",
                      borderTopColor: "transparent",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                </div>
              ) : (
                <pre
                  style={{
                    fontSize: 12,
                    fontFamily: "monospace",
                    color: "#374151",
                    backgroundColor: "#F8FAFC",
                    border: "1px solid #E5E7EB",
                    borderRadius: 8,
                    padding: 16,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxHeight: 560,
                    overflow: "auto",
                  }}
                >
                  {bulkTaskContent}
                </pre>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                <button
                  onClick={() => setShowBulkTaskModal(false)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "1px solid #D1D5DB",
                    backgroundColor: "#ffffff",
                    color: "#374151",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </ErrorBoundary>
  );
}
