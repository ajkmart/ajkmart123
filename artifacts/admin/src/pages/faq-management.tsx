import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader, StatCard } from "@/components/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { adminAbsoluteFetch } from "@/lib/adminFetcher";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  HelpCircle,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from "lucide-react";
import { useState } from "react";

async function apiFetch(path: string, opts: RequestInit = {}) {
  return adminAbsoluteFetch(`/api${path}`, opts);
}

type FAQ = {
  id: string;
  category: string;
  question: string;
  answer: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
};

const CATEGORIES = [
  "Orders",
  "Payment",
  "Delivery",
  "Account",
  "Offers",
  "Pharmacy",
  "Rides",
  "Parcel",
  "Van",
  "General",
];

const CATEGORY_COLORS: Record<string, string> = {
  Orders: "bg-blue-100 text-blue-700",
  Payment: "bg-green-100 text-green-700",
  Delivery: "bg-purple-100 text-purple-700",
  Account: "bg-amber-100 text-amber-700",
  Offers: "bg-pink-100 text-pink-700",
  Pharmacy: "bg-teal-100 text-teal-700",
  Rides: "bg-orange-100 text-orange-700",
  Parcel: "bg-indigo-100 text-indigo-700",
  Van: "bg-cyan-100 text-cyan-700",
  General: "bg-gray-100 text-gray-700",
};

const EMPTY_FORM = { category: "General", question: "", answer: "", sortOrder: 0, isActive: true };

function FAQFormDialog({
  open,
  onClose,
  initial,
  onSave,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  initial: typeof EMPTY_FORM & { id?: string };
  onSave: (data: typeof EMPTY_FORM & { id?: string }) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof typeof form, v: string | number | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial.id ? "Edit FAQ" : "Add New FAQ"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 text-xs">Category</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger className="h-9 rounded-xl text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 text-xs">Sort Order</Label>
              <Input
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={(e) => set("sortOrder", parseInt(e.target.value) || 0)}
                className="h-9 rounded-xl text-sm"
              />
            </div>
          </div>
          <div>
            <Label className="mb-1 text-xs">
              Question <span className="text-red-500">*</span>
            </Label>
            <Input
              value={form.question}
              onChange={(e) => set("question", e.target.value)}
              placeholder="Enter the question..."
              className="h-9 rounded-xl text-sm"
            />
          </div>
          <div>
            <Label className="mb-1 text-xs">
              Answer <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={form.answer}
              onChange={(e) => set("answer", e.target.value)}
              placeholder="Enter the detailed answer..."
              className="min-h-[120px] resize-none rounded-xl text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => set("isActive", !form.isActive)}
              className="flex items-center gap-2 text-sm"
            >
              {form.isActive ? (
                <ToggleRight className="h-5 w-5 text-green-600" />
              ) : (
                <ToggleLeft className="h-5 w-5 text-gray-400" />
              )}
              <span className={form.isActive ? "font-medium text-green-700" : "text-gray-500"}>
                {form.isActive ? "Active (visible to customers)" : "Inactive (hidden)"}
              </span>
            </button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-xl">
            Cancel
          </Button>
          <Button
            onClick={() => onSave({ ...form, id: initial.id })}
            disabled={!form.question.trim() || !form.answer.trim() || loading}
            className="rounded-xl"
          >
            {loading ? "Saving…" : initial.id ? "Update FAQ" : "Add FAQ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FAQManagementPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editFaq, setEditFaq] = useState<(typeof EMPTY_FORM & { id?: string }) | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<{ faqs: FAQ[]; total: number }>({
    queryKey: ["admin-faqs"],
    queryFn: () => apiFetch("/faqs"),
  });

  const { toast } = useToast();

  const createMut = useMutation({
    mutationFn: (body: typeof EMPTY_FORM) =>
      apiFetch("/faqs", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-faqs"] });
      setEditFaq(null);
    },
    onError: (e: Error) =>
      toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: typeof EMPTY_FORM & { id: string }) =>
      apiFetch(`/faqs/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-faqs"] });
      setEditFaq(null);
    },
    onError: (e: Error) =>
      toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/faqs/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-faqs"] });
      setDeleteId(null);
    },
    onError: (e: Error) =>
      toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch(`/faqs/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-faqs"] }),
    onError: (e: Error) =>
      toast({ title: "Toggle failed", description: e.message, variant: "destructive" }),
  });

  const faqs: FAQ[] = data?.faqs ?? [];
  const categories = Array.from(new Set(faqs.map((f) => f.category)));

  const filtered = faqs.filter((f) => {
    const matchCat = filterCat === "all" || f.category === filterCat;
    const matchSearch =
      !search ||
      f.question.toLowerCase().includes(search.toLowerCase()) ||
      f.answer.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const grouped = categories.reduce<Record<string, FAQ[]>>((acc, cat) => {
    if (filterCat !== "all" && filterCat !== cat) return acc;
    const items = filtered.filter((f) => f.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  const handleSave = (form: typeof EMPTY_FORM & { id?: string }) => {
    const { id, ...body } = form;
    if (id) updateMut.mutate({ id, ...body });
    else createMut.mutate(body);
  };

  const activeCount = faqs.filter((f) => f.isActive).length;
  const inactiveCount = faqs.length - activeCount;

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          FAQ Management page crashed. Please reload.
        </div>
      }
    >
      <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
        <PageHeader
          icon={HelpCircle}
          title="FAQ Management"
          subtitle="Manage frequently asked questions shown in the customer app"
          iconBgClass="bg-primary/10"
          iconColorClass="text-primary"
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="h-8 gap-1 rounded-xl"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                onClick={() => setEditFaq(EMPTY_FORM)}
                className="h-8 gap-1.5 rounded-xl"
              >
                <Plus className="h-3.5 w-3.5" /> Add FAQ
              </Button>
            </div>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            icon={HelpCircle}
            label="Total FAQs"
            value={faqs.length}
            iconBgClass="bg-gray-100"
            iconColorClass="text-gray-700"
          />
          <StatCard
            icon={HelpCircle}
            label="Active"
            value={activeCount}
            iconBgClass="bg-green-50"
            iconColorClass="text-green-700"
          />
          <StatCard
            icon={HelpCircle}
            label="Inactive"
            value={inactiveCount}
            iconBgClass="bg-amber-50"
            iconColorClass="text-amber-700"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute top-2.5 left-2.5 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Search FAQs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 rounded-xl pl-8 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["all", ...categories].map((c) => (
              <button
                key={c}
                onClick={() => setFilterCat(c)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  filterCat === c
                    ? "bg-primary border-primary text-white"
                    : "hover:border-primary/50 border-gray-200 bg-white text-gray-600"
                )}
              >
                {c === "all" ? "All" : c}
              </button>
            ))}
          </div>
        </div>

        {/* FAQ List */}
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-gray-400">
            Loading FAQs…
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 text-gray-400">
            <HelpCircle className="h-10 w-10 opacity-20" />
            <p className="text-sm">No FAQs found</p>
            <Button size="sm" onClick={() => setEditFaq(EMPTY_FORM)} className="gap-1 rounded-xl">
              <Plus className="h-3.5 w-3.5" /> Add First FAQ
            </Button>
          </div>
        ) : (
          Object.entries(grouped).map(([cat, items]) => (
            <div
              key={cat}
              className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
            >
              <div
                className={cn(
                  "flex items-center justify-between border-b px-4 py-2.5",
                  CATEGORY_COLORS[cat] || "bg-gray-50"
                )}
              >
                <span className="text-sm font-semibold">{cat}</span>
                <Badge variant="secondary" className="text-xs">
                  {items.length}
                </Badge>
              </div>
              <div className="divide-y divide-gray-50">
                {items.map((faq) => (
                  <div key={faq.id} className={cn("group", !faq.isActive && "opacity-60")}>
                    <div
                      className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
                      onClick={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
                    >
                      <GripVertical className="h-4 w-4 shrink-0 text-gray-300" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-800">{faq.question}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!faq.isActive && (
                          <Badge
                            variant="outline"
                            className="border-amber-300 text-[10px] text-amber-600"
                          >
                            Hidden
                          </Badge>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMut.mutate({ id: faq.id, isActive: !faq.isActive });
                          }}
                          className="opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-30"
                          title={faq.isActive ? "Deactivate" : "Activate"}
                          disabled={toggleMut.isPending}
                        >
                          {toggleMut.isPending ? (
                            <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                          ) : faq.isActive ? (
                            <ToggleRight className="h-4 w-4 text-green-500" />
                          ) : (
                            <ToggleLeft className="h-4 w-4 text-gray-400" />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditFaq({ ...faq });
                          }}
                          className="hover:bg-primary/10 rounded-lg p-1 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <Pencil className="text-primary h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteId(faq.id);
                          }}
                          className="rounded-lg p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </button>
                        {expandedId === faq.id ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                    {expandedId === faq.id && (
                      <div className="ml-7 px-4 pt-1 pb-4">
                        <p className="rounded-xl bg-gray-50 p-3 text-sm leading-relaxed text-gray-600">
                          {faq.answer}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {/* Form Dialog */}
        {editFaq && (
          <FAQFormDialog
            open
            onClose={() => setEditFaq(null)}
            initial={editFaq}
            onSave={handleSave}
            loading={createMut.isPending || updateMut.isPending}
          />
        )}

        {/* Delete Confirm */}
        <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete FAQ?</AlertDialogTitle>
              <AlertDialogDescription>
                This FAQ will be permanently removed and will no longer be shown to customers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="rounded-xl bg-red-600 hover:bg-red-700"
                onClick={() => deleteId && deleteMut.mutate(deleteId)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ErrorBoundary>
  );
}
