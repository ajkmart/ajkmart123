import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PullToRefresh } from "@/components/PullToRefresh";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  useConditionRules,
  useConditionSettings,
  useCreateConditionRule,
  useDeleteConditionRule,
  useSeedDefaultRules,
  useUpdateConditionRule,
  useUpdateConditionSettings,
} from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import { CONDITION_TYPES, SEVERITY_OPTIONS as SEVERITIES, SEVERITY_COLORS } from "@/lib/conditions";
import { useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  CheckCircle2,
  Edit2,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  Shield,
  Sliders,
  Trash2,
  Zap,
} from "lucide-react";
import { useCallback, useState } from "react";

const OPERATORS = [">", "<", ">=", "<=", "==", "!="];

const METRICS = [
  { value: "cancellation_rate", label: "Cancellation Rate (%)" },
  { value: "fraud_incidents", label: "Fraud/Chargeback Incidents" },
  { value: "abuse_reports", label: "Abuse Reports Count" },
  { value: "failed_payments_7d", label: "Failed Payments (7 days)" },
  { value: "miss_ignore_rate", label: "Miss/Ignore Rate (%)" },
  { value: "avg_rating_30d", label: "Avg Rating (30 days)" },
  { value: "cancellation_debt", label: "Cancellation Debt (Rs.)" },
  { value: "gps_spoofing", label: "GPS Spoofing Detections" },
  { value: "complaint_reports", label: "Complaint Reports" },
  { value: "order_completion_rate", label: "Order Completion Rate (%)" },
  { value: "fake_item_complaints", label: "Fake/Wrong Item Complaints" },
  { value: "hygiene_complaints", label: "Hygiene/Quality Complaints" },
  { value: "late_pattern_violations", label: "Late Open/Close Violations" },
  { value: "van_cancellation_count_30d", label: "Van Cancellations (30 days)" },
  { value: "van_noshow_count", label: "Van No-Shows (boarded=false)" },
  { value: "van_driver_missed_start", label: "Van Driver Missed Start Trip" },
];

const MODE_CONFIG = [
  {
    key: "default",
    label: "Default",
    desc: "Industry-standard thresholds applied uniformly to all accounts",
    icon: Shield,
    activeBtn: "border-indigo-400 bg-indigo-50 shadow-md ring-indigo-400 ring-2",
    activeIcon: "bg-gradient-to-br from-indigo-500 to-indigo-600 text-white",
  },
  {
    key: "ai_recommended",
    label: "AI-Recommended",
    desc: "Dynamic thresholds that adjust based on trajectory, demand, and peer comparison",
    icon: Brain,
    activeBtn: "border-purple-400 bg-purple-50 shadow-md ring-purple-400 ring-2",
    activeIcon: "bg-gradient-to-br from-purple-500 to-purple-600 text-white",
  },
  {
    key: "custom",
    label: "Custom",
    desc: "Full admin control over all thresholds with editable UI",
    icon: Sliders,
    activeBtn: "border-amber-400 bg-amber-50 shadow-md ring-amber-400 ring-2",
    activeIcon: "bg-gradient-to-br from-amber-500 to-amber-600 text-white",
  },
];

function RuleFormModal({ rule, onClose }: { rule?: any; onClose: () => void }) {
  const { toast } = useToast();
  const createMut = useCreateConditionRule();
  const updateMut = useUpdateConditionRule();

  const [name, setName] = useState(rule?.name || "");
  const [description, setDescription] = useState(rule?.description || "");
  const [targetRole, setTargetRole] = useState(rule?.targetRole || "customer");
  const [metric, setMetric] = useState(rule?.metric || "");
  const [operator, setOperator] = useState(rule?.operator || ">");
  const [threshold, setThreshold] = useState(rule?.threshold || "");
  const [conditionType, setConditionType] = useState(rule?.conditionType || "warning_l1");
  const [severity, setSeverity] = useState(rule?.severity || "warning");
  const [cooldownHours, setCooldownHours] = useState(String(rule?.cooldownHours || 24));

  const handleSave = () => {
    if (!name || !metric || threshold === "" || threshold == null) {
      toast({ title: "Fill all required fields", variant: "destructive" });
      return;
    }
    const parsedCooldown = parseInt(cooldownHours);
    const data = {
      name,
      description,
      targetRole,
      metric,
      operator,
      threshold,
      conditionType,
      severity,
      cooldownHours: Number.isFinite(parsedCooldown) ? parsedCooldown : 0,
    };
    if (rule) {
      updateMut.mutate(
        { id: rule.id, ...data },
        {
          onSuccess: () => {
            toast({ title: "Rule updated" });
            onClose();
          },
          onError: (e: any) =>
            toast({ title: "Failed", description: e.message, variant: "destructive" }),
        }
      );
    } else {
      createMut.mutate(data, {
        onSuccess: () => {
          toast({ title: "Rule created" });
          onClose();
        },
        onError: (e: any) =>
          toast({ title: "Failed", description: e.message, variant: "destructive" }),
      });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] w-[95vw] max-w-lg overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-600" /> {rule ? "Edit Rule" : "Create Rule"}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-2 space-y-3">
          <div>
            <label className="text-muted-foreground mb-1 block text-xs font-bold uppercase">
              Name *
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Customer high cancellation"
              className="h-10 rounded-xl"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs font-bold uppercase">
              Description
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="h-10 rounded-xl"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-bold uppercase">
                Target Role *
              </label>
              <Select value={targetRole} onValueChange={setTargetRole}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="rider">Rider</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="van_driver">Van Driver</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-bold uppercase">
                Metric *
              </label>
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {METRICS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-bold uppercase">
                Operator
              </label>
              <Select value={operator} onValueChange={setOperator}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((op) => (
                    <SelectItem key={op} value={op}>
                      {op}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-bold uppercase">
                Threshold *
              </label>
              <Input
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder="e.g. 25"
                className="h-10 rounded-xl"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-bold uppercase">
                Action Type
              </label>
              <Select value={conditionType} onValueChange={setConditionType}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-bold uppercase">
                Severity
              </label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs font-bold uppercase">
              Cooldown (hours)
            </label>
            <Input
              type="number"
              value={cooldownHours}
              onChange={(e) => setCooldownHours(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMut.isPending || updateMut.isPending}
              className="flex-1 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {createMut.isPending || updateMut.isPending
                ? "Saving..."
                : rule
                  ? "Update Rule"
                  : "Create Rule"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ConditionRules() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: rulesData, isLoading: rulesLoading, refetch } = useConditionRules();
  const { data: settingsData, isLoading: _settingsLoading } = useConditionSettings();
  const updateSettingsMut = useUpdateConditionSettings();
  const updateRuleMut = useUpdateConditionRule();
  const deleteRuleMut = useDeleteConditionRule();
  const seedMut = useSeedDefaultRules();

  const [editRule, setEditRule] = useState<any>(null);
  const [showCreateRule, setShowCreateRule] = useState(false);
  const [roleTab, setRoleTab] = useState("all");

  const rules: any[] = rulesData?.rules || [];
  const settings = settingsData || { mode: "default" };

  const filteredRules = roleTab === "all" ? rules : rules.filter((r) => r.targetRole === roleTab);

  const handleModeSwitch = (mode: string) => {
    updateSettingsMut.mutate(
      { mode },
      {
        onSuccess: () => toast({ title: `Mode switched to ${mode.replace("_", " ")}` }),
        onError: (e: any) =>
          toast({ title: "Failed", description: e.message, variant: "destructive" }),
      }
    );
  };

  const handleToggleRule = (rule: any) => {
    updateRuleMut.mutate(
      { id: rule.id, isActive: !rule.isActive },
      {
        onSuccess: () => toast({ title: rule.isActive ? "Rule disabled" : "Rule enabled" }),
        onError: (e: any) =>
          toast({ title: "Failed", description: e.message, variant: "destructive" }),
      }
    );
  };

  const handleDeleteRule = (id: string) => {
    if (!confirm("Delete this rule permanently?")) return;
    deleteRuleMut.mutate(id, {
      onSuccess: () => toast({ title: "Rule deleted" }),
      onError: (e: any) =>
        toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  const handleSeedDefaults = () => {
    seedMut.mutate(undefined, {
      onSuccess: (d: any) => toast({ title: d.message || "Default rules seeded" }),
      onError: (e: any) =>
        toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  const handlePullRefresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["admin-condition-rules"] });
    await qc.invalidateQueries({ queryKey: ["admin-condition-settings"] });
  }, [qc]);

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Condition Rules page crashed. Please reload.
        </div>
      }
    >
      <PullToRefresh onRefresh={handlePullRefresh} className="space-y-6">
        <PageHeader
          icon={Settings2}
          title="Restriction Rule Config"
          subtitle={`${rules.length} rules · Mode: ${settings.mode?.replace("_", " ")}`}
          iconBgClass="bg-amber-100"
          iconColorClass="text-amber-600"
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="h-9 gap-2 rounded-xl"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          }
        />

        <Card className="border-border/50 overflow-hidden rounded-2xl shadow-sm">
          <div className="border-border/50 border-b p-5">
            <div className="mb-3 flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-600" />
              <h2 className="text-lg font-bold">Moderation Mode</h2>
            </div>
            <p className="text-muted-foreground mb-4 text-sm">
              Select how automatic trigger rules evaluate thresholds. Manual admin actions are
              always available regardless of mode.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {MODE_CONFIG.map((m) => {
                const active = settings.mode === m.key;
                return (
                  <button
                    key={m.key}
                    onClick={() => handleModeSwitch(m.key)}
                    disabled={updateSettingsMut.isPending}
                    className={`rounded-xl border-2 p-4 text-left transition-all ${active ? m.activeBtn : "border-border bg-white hover:border-gray-300"}`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? m.activeIcon : "bg-gray-100 text-gray-400"}`}
                      >
                        <m.icon className="h-4 w-4" />
                      </div>
                      <span
                        className={`text-sm font-bold ${active ? "text-foreground" : "text-muted-foreground"}`}
                      >
                        {m.label}
                      </span>
                      {active && <CheckCircle2 className="ml-auto h-4 w-4 text-green-600" />}
                    </div>
                    <p className="text-muted-foreground text-xs leading-relaxed">{m.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        <Card className="border-border/50 rounded-2xl shadow-sm">
          <div className="border-border/50 border-b p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-indigo-600" />
                <h2 className="text-lg font-bold">Auto-Trigger Rules</h2>
              </div>
              <div className="flex gap-2">
                {rules.length === 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSeedDefaults}
                    disabled={seedMut.isPending}
                    className="h-8 gap-1 rounded-xl text-xs"
                  >
                    {seedMut.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Zap className="h-3 w-3" />
                    )}{" "}
                    Seed Defaults
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => setShowCreateRule(true)}
                  className="h-8 gap-1 rounded-xl bg-indigo-600 text-xs text-white hover:bg-indigo-700"
                >
                  <Plus className="h-3 w-3" /> New Rule
                </Button>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              {["all", "customer", "rider", "van_driver", "vendor"].map((r) => (
                <button
                  key={r}
                  onClick={() => setRoleTab(r)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${roleTab === r ? "bg-indigo-100 text-indigo-700" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}
                >
                  {r === "all"
                    ? "All"
                    : r
                        .split("_")
                        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(" ")}
                </button>
              ))}
            </div>
          </div>

          {rulesLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" />
            </div>
          ) : filteredRules.length === 0 ? (
            <CardContent className="p-8 text-center">
              <Shield className="text-muted-foreground/30 mx-auto mb-2 h-10 w-10" />
              <p className="text-muted-foreground text-sm">No rules configured</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Click "Seed Defaults" to load standard rules or create a custom one
              </p>
            </CardContent>
          ) : (
            <div className="divide-border/50 divide-y">
              {filteredRules.map((rule) => {
                const metricLabel =
                  METRICS.find((m) => m.value === rule.metric)?.label || rule.metric;
                const typeLabel =
                  CONDITION_TYPES.find((t) => t.value === rule.conditionType)?.label ||
                  rule.conditionType;
                return (
                  <div
                    key={rule.id}
                    className={`flex items-center gap-3 p-4 ${!rule.isActive ? "opacity-50" : ""}`}
                  >
                    <Switch
                      checked={rule.isActive}
                      onCheckedChange={() => handleToggleRule(rule)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold">{rule.name}</span>
                        <Badge className="border-blue-100 bg-blue-50 text-[10px] text-blue-600 capitalize">
                          {rule.targetRole}
                        </Badge>
                        <Badge
                          className={`${SEVERITY_COLORS[rule.severity] || "bg-gray-100"} text-[10px]`}
                        >
                          {rule.severity.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        When <span className="font-semibold">{metricLabel}</span> {rule.operator}{" "}
                        <span className="font-semibold">{rule.threshold}</span> →{" "}
                        <span className="font-semibold">{typeLabel}</span>
                        {rule.cooldownHours > 0 && (
                          <span className="ml-2">· {rule.cooldownHours}h cooldown</span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditRule(rule)}
                        className="h-8 w-8 rounded-lg p-0"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteRule(rule.id)}
                        className="h-8 w-8 rounded-lg p-0 text-red-500 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {(showCreateRule || editRule) && (
          <RuleFormModal
            rule={editRule}
            onClose={() => {
              setShowCreateRule(false);
              setEditRule(null);
            }}
          />
        )}
      </PullToRefresh>
    </ErrorBoundary>
  );
}
