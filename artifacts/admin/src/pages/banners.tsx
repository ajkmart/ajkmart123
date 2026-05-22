import { StatusBadge } from "@/components/AdminShared";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SafeImage } from "@/components/ui/SafeImage";
import { useToast } from "@/hooks/use-toast";
import { adminFetch, fetchAdminAbsoluteResponse } from "@/lib/adminFetcher";
import { useLanguage } from "@/lib/useLanguage";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import {
  Calendar,
  Eye,
  GripVertical,
  Image,
  Layers,
  Link as LinkIcon,
  Loader2,
  Pencil,
  Plus,
  Save,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  linkType: string;
  linkValue: string | null;
  targetService: string | null;
  placement: string;
  colorFrom: string;
  colorTo: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  status: "active" | "scheduled" | "expired" | "inactive";
}

const EMPTY_BANNER = {
  title: "",
  subtitle: "",
  imageUrl: "",
  linkType: "none",
  linkValue: "",
  targetService: "all",
  placement: "home",
  colorFrom: "#7C3AED",
  colorTo: "#4F46E5",
  icon: "",
  sortOrder: 0,
  isActive: true,
  startDate: "",
  endDate: "",
};

const LINK_TYPES = [
  { value: "none", label: "No Link" },
  { value: "service", label: "Service (Mart/Food/Ride…)" },
  { value: "route", label: "In-App Route" },
  { value: "category", label: "Category" },
  { value: "product", label: "Product" },
  { value: "url", label: "External URL" },
];

const TARGET_SERVICES = [
  { value: "all", label: "All Services" },
  { value: "mart", label: "Mart" },
  { value: "food", label: "Food" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "rides", label: "Rides" },
  { value: "parcel", label: "Parcel" },
];

const PLACEMENTS = [
  { value: "home", label: "Home Screen" },
  { value: "mart", label: "Mart Page" },
  { value: "food", label: "Food Page" },
  { value: "pharmacy", label: "Pharmacy Page" },
];

export default function BannersPage() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState({ ...EMPTY_BANNER });
  const [editing, setEditing] = useState<Banner | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewBanner, setPreviewBanner] = useState<Banner | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteBannerId, setDeleteBannerId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Only JPEG, PNG, and WebP images are allowed", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large. Maximum 5MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const uploadRes = await fetchAdminAbsoluteResponse("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: base64, filename: file.name, mimeType: file.type }),
      });
      const uj = await uploadRes.json();
      const res = uj?.success === true && "data" in uj ? uj.data : uj;
      if (!uploadRes.ok) throw new Error(res.error || uj.error || "Upload failed");
      if (res?.url) {
        setForm((f) => ({ ...f, imageUrl: res.url }));
        toast({ title: "Image uploaded successfully" });
      }
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["admin-banners"],
    queryFn: () => adminFetch("/banners"),
    refetchInterval: 30000,
  });

  const banners: Banner[] = data?.banners || [];

  const saveBanner = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (editing)
        return adminFetch(`/banners/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      return adminFetch("/banners", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-banners"] });
      setDialogOpen(false);
      setEditing(null);
      setForm({ ...EMPTY_BANNER });
      toast({ title: editing ? "Banner updated" : "Banner created" });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteBanner = useMutation({
    mutationFn: (id: string) => adminFetch(`/banners/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-banners"] });
      toast({ title: "Banner deleted" });
    },
  });

  const toggleBanner = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminFetch(`/banners/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-banners"] }),
  });

  const reorderBanners = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) =>
      adminFetch("/banners/reorder", { method: "PATCH", body: JSON.stringify({ items }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-banners"] }),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_BANNER, sortOrder: banners.length });
    setDialogOpen(true);
  };

  const openEdit = (b: Banner) => {
    setEditing(b);
    setForm({
      title: b.title,
      subtitle: b.subtitle || "",
      imageUrl: b.imageUrl || "",
      linkType: b.linkType,
      linkValue: b.linkValue || "",
      targetService: b.targetService || "all",
      placement: b.placement,
      colorFrom: b.colorFrom,
      colorTo: b.colorTo,
      icon: b.icon || "",
      sortOrder: b.sortOrder,
      isActive: b.isActive,
      startDate: b.startDate ? b.startDate.slice(0, 16) : "",
      endDate: b.endDate ? b.endDate.slice(0, 16) : "",
    });
    setDialogOpen(true);
  };

  const submitBanner = () => {
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    saveBanner.mutate({
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      linkType: form.linkType,
      linkValue: form.linkValue.trim() || null,
      targetService: form.targetService || null,
      placement: form.placement,
      colorFrom: form.colorFrom,
      colorTo: form.colorTo,
      icon: form.icon.trim() || null,
      sortOrder: form.sortOrder,
      isActive: form.isActive,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
    });
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    const reordered = Array.from(banners);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved!);
    reorderBanners.mutate(reordered.map((b, i) => ({ id: b.id, sortOrder: i })));
  };

  const activeBanners = banners.filter((b) => b.status === "active").length;
  const scheduledBanners = banners.filter((b) => b.status === "scheduled").length;

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Banners page crashed. Please reload.
        </div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          icon={Layers}
          title={T("navBanners")}
          subtitle={`${activeBanners} active${scheduledBanners > 0 ? ` · ${scheduledBanners} scheduled` : ""} · ${banners.length} total`}
          iconBgClass="bg-purple-100"
          iconColorClass="text-purple-600"
          actions={
            <Button onClick={openNew} className="h-10 gap-2 rounded-xl shadow-md">
              <Plus className="h-4 w-4" />
              New Banner
            </Button>
          }
        />

        <div className="space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-muted h-28 animate-pulse rounded-2xl" />
              ))}
            </div>
          ) : banners.length === 0 ? (
            <Card className="border-border/50 rounded-2xl">
              <CardContent className="p-16 text-center">
                <Layers className="text-muted-foreground/30 mx-auto mb-3 h-12 w-12" />
                <p className="text-muted-foreground font-medium">No banners yet</p>
                <p className="text-muted-foreground/60 mt-1 text-sm">
                  Create your first promotional banner
                </p>
                <Button onClick={openNew} className="mt-4 gap-2 rounded-xl">
                  <Plus className="h-4 w-4" />
                  Create Banner
                </Button>
              </CardContent>
            </Card>
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="banners-list">
                {(provided) => (
                  <div className="grid gap-3" ref={provided.innerRef} {...provided.droppableProps}>
                    {banners.length > 100 && (
                      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-600">
                        Showing first 100 of {banners.length} banners. Delete old banners to manage
                        more.
                      </p>
                    )}
                    {banners.slice(0, 100).map((banner, idx) => (
                      <Draggable key={banner.id} draggableId={banner.id} index={idx}>
                        {(dragProvided, snapshot) => (
                          <Card
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={`border-border/50 rounded-2xl shadow-sm transition-shadow ${snapshot.isDragging ? "shadow-lg ring-2 ring-purple-300" : "hover:shadow-md"}`}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start gap-4">
                                <div
                                  {...dragProvided.dragHandleProps}
                                  className="flex flex-shrink-0 cursor-grab flex-col items-center gap-0.5 pt-1 active:cursor-grabbing"
                                  title="Drag to reorder"
                                >
                                  <GripVertical className="text-muted-foreground/50 h-5 w-5" />
                                  <span className="text-muted-foreground text-[10px] font-bold">
                                    #{idx + 1}
                                  </span>
                                </div>

                                <div
                                  className="flex h-14 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl"
                                  style={{
                                    background: banner.imageUrl
                                      ? `url(${banner.imageUrl}) center/cover`
                                      : `linear-gradient(135deg, ${banner.colorFrom}, ${banner.colorTo})`,
                                  }}
                                >
                                  {!banner.imageUrl && <Image className="h-5 w-5 text-white/60" />}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-foreground truncate font-bold">
                                      {banner.title}
                                    </p>
                                    <StatusBadge status={banner.status} />
                                  </div>
                                  {banner.subtitle && (
                                    <p className="text-muted-foreground mt-0.5 truncate text-xs">
                                      {banner.subtitle}
                                    </p>
                                  )}
                                  <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-3 text-xs">
                                    <span className="flex items-center gap-1">
                                      <Layers className="h-3 w-3" />
                                      {banner.placement}
                                    </span>
                                    {banner.linkType !== "none" && (
                                      <span className="flex items-center gap-1">
                                        <LinkIcon className="h-3 w-3" />
                                        {banner.linkType}: {banner.linkValue}
                                      </span>
                                    )}
                                    {banner.startDate && (
                                      <span className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        {new Date(banner.startDate).toLocaleDateString("en-PK", {
                                          month: "short",
                                          day: "numeric",
                                        })}
                                        {banner.endDate &&
                                          ` → ${new Date(banner.endDate).toLocaleDateString("en-PK", { month: "short", day: "numeric" })}`}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex flex-shrink-0 items-center gap-1">
                                  <button
                                    onClick={() =>
                                      setPreviewBanner(
                                        previewBanner?.id === banner.id ? null : banner
                                      )
                                    }
                                    className="hover:bg-muted rounded-lg p-2 transition-colors"
                                    title="Preview"
                                  >
                                    <Eye className="text-muted-foreground h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      toggleBanner.mutate({
                                        id: banner.id,
                                        isActive: !banner.isActive,
                                      })
                                    }
                                    disabled={toggleBanner.isPending}
                                    className="hover:bg-muted rounded-lg p-2 transition-colors disabled:opacity-60"
                                    title={banner.isActive ? "Deactivate" : "Activate"}
                                  >
                                    {banner.isActive ? (
                                      <ToggleRight className="h-5 w-5 text-green-600" />
                                    ) : (
                                      <ToggleLeft className="text-muted-foreground h-5 w-5" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => openEdit(banner)}
                                    className="hover:bg-muted rounded-lg p-2 transition-colors"
                                  >
                                    <Pencil className="h-4 w-4 text-blue-600" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteBannerId(banner.id)}
                                    disabled={deleteBanner.isPending}
                                    className="rounded-lg p-2 transition-colors hover:bg-red-50 disabled:opacity-60"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </button>
                                </div>
                              </div>

                              {previewBanner?.id === banner.id && (
                                <div className="border-border/50 mt-4 border-t pt-4">
                                  <p className="text-muted-foreground mb-2 text-xs font-semibold">
                                    Preview
                                  </p>
                                  <div
                                    className="relative flex min-h-[100px] items-center gap-4 overflow-hidden rounded-xl p-5"
                                    style={{
                                      background: banner.imageUrl
                                        ? `linear-gradient(135deg, ${banner.colorFrom}cc, ${banner.colorTo}cc), url(${banner.imageUrl}) center/cover`
                                        : `linear-gradient(135deg, ${banner.colorFrom}, ${banner.colorTo})`,
                                    }}
                                  >
                                    <div className="z-10 flex-1">
                                      <p className="text-lg font-bold text-white">{banner.title}</p>
                                      {banner.subtitle && (
                                        <p className="mt-1 text-sm text-white/85">
                                          {banner.subtitle}
                                        </p>
                                      )}
                                      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5">
                                        <span className="text-xs font-semibold text-white">
                                          Shop Now
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>

        <Dialog
          open={dialogOpen}
          onOpenChange={(v) => {
            setDialogOpen(v);
            if (!v) {
              setEditing(null);
              setForm({ ...EMPTY_BANNER });
            }
          }}
        >
          <DialogContent className="max-h-[90dvh] w-[95vw] max-w-lg overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-purple-500" />
                {editing ? "Edit Banner" : "Create Banner"}
              </DialogTitle>
            </DialogHeader>
            <div className="mt-2 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">
                  Title <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="e.g. Summer Sale - Up to 50% OFF"
                  value={form.title}
                  /* Title is shown in the customer banner carousel; cap at
                   120 chars to keep it on one line on small screens. */
                  maxLength={120}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="h-11 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold">
                  Subtitle <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Input
                  placeholder="e.g. Shop groceries at unbeatable prices"
                  value={form.subtitle}
                  maxLength={200}
                  onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                  className="h-11 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold">
                  Banner Image <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://example.com/banner.jpg"
                    value={form.imageUrl}
                    /* URLs hold object-storage paths; 2000 is the SQL Server
                     URL limit and a safe ceiling for browsers too. */
                    maxLength={2000}
                    onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                    className="h-11 flex-1 rounded-xl"
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl px-3"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {form.imageUrl && (
                  <div className="border-border mt-2 h-24 overflow-hidden rounded-lg border">
                    <SafeImage
                      src={form.imageUrl}
                      alt="Preview"
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Link Type</label>
                  <select
                    value={form.linkType}
                    onChange={(e) => setForm((f) => ({ ...f, linkType: e.target.value }))}
                    className="border-input bg-background h-11 w-full rounded-xl border px-3 text-sm"
                  >
                    {LINK_TYPES.map((lt) => (
                      <option key={lt.value} value={lt.value}>
                        {lt.label}
                      </option>
                    ))}
                  </select>
                </div>
                {form.linkType !== "none" && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Link Value</label>
                    <Input
                      placeholder={
                        form.linkType === "url"
                          ? "https://..."
                          : form.linkType === "category"
                            ? "e.g. fruits"
                            : form.linkType === "service"
                              ? "mart | food | rides | pharmacy | parcel"
                              : form.linkType === "route"
                                ? "/mart  or  /food  or  /ride"
                                : "Product ID"
                      }
                      value={form.linkValue}
                      onChange={(e) => setForm((f) => ({ ...f, linkValue: e.target.value }))}
                      className="h-11 rounded-xl"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Placement</label>
                  <select
                    value={form.placement}
                    onChange={(e) => setForm((f) => ({ ...f, placement: e.target.value }))}
                    className="border-input bg-background h-11 w-full rounded-xl border px-3 text-sm"
                  >
                    {PLACEMENTS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Target Service</label>
                  <select
                    value={form.targetService}
                    onChange={(e) => setForm((f) => ({ ...f, targetService: e.target.value }))}
                    className="border-input bg-background h-11 w-full rounded-xl border px-3 text-sm"
                  >
                    {TARGET_SERVICES.map((ts) => (
                      <option key={ts.value} value={ts.value}>
                        {ts.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Gradient Colors</label>
                <div className="flex items-center gap-3">
                  <div className="flex flex-1 items-center gap-2">
                    <input
                      type="color"
                      value={form.colorFrom}
                      onChange={(e) => setForm((f) => ({ ...f, colorFrom: e.target.value }))}
                      className="border-input h-10 w-10 cursor-pointer rounded-lg border"
                    />
                    <Input
                      value={form.colorFrom}
                      onChange={(e) => setForm((f) => ({ ...f, colorFrom: e.target.value }))}
                      className="h-10 rounded-xl font-mono text-xs"
                      placeholder="#7C3AED"
                    />
                  </div>
                  <span className="text-muted-foreground text-sm">→</span>
                  <div className="flex flex-1 items-center gap-2">
                    <input
                      type="color"
                      value={form.colorTo}
                      onChange={(e) => setForm((f) => ({ ...f, colorTo: e.target.value }))}
                      className="border-input h-10 w-10 cursor-pointer rounded-lg border"
                    />
                    <Input
                      value={form.colorTo}
                      onChange={(e) => setForm((f) => ({ ...f, colorTo: e.target.value }))}
                      className="h-10 rounded-xl font-mono text-xs"
                      placeholder="#4F46E5"
                    />
                  </div>
                </div>
                <div
                  className="mt-1 h-6 rounded-lg"
                  style={{
                    background: `linear-gradient(to right, ${form.colorFrom}, ${form.colorTo})`,
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold">
                  Icon{" "}
                  <span className="text-muted-foreground font-normal">
                    (Ionicons name, optional)
                  </span>
                </label>
                <Input
                  placeholder="e.g. pricetag, cart, gift"
                  value={form.icon}
                  /* Ionicons names are kebab-case identifiers — restrict to
                   the printable subset to avoid round-tripping unicode
                   that the mobile app cannot render. */
                  maxLength={64}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, icon: e.target.value.replace(/[^a-zA-Z0-9-]/g, "") }))
                  }
                  className="h-11 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">
                    Start Date <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <Input
                    type="datetime-local"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">
                    End Date <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <Input
                    type="datetime-local"
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="h-11 rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Sort Order</label>
                <Input
                  type="number"
                  min={0}
                  max={9999}
                  value={form.sortOrder}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    const clamped = Number.isFinite(v) ? Math.max(0, Math.min(9999, v)) : 0;
                    setForm((f) => ({ ...f, sortOrder: clamped }));
                  }}
                  className="h-11 rounded-xl"
                />
              </div>

              <div
                onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
                className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all ${form.isActive ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50"}`}
              >
                <span className="text-sm font-semibold">Active (visible to users)</span>
                <div
                  className={`relative h-5 w-10 rounded-full transition-colors ${form.isActive ? "bg-green-500" : "bg-gray-300"}`}
                >
                  <div
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.isActive ? "translate-x-5" : "translate-x-0.5"}`}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={submitBanner}
                  disabled={saveBanner.isPending}
                  className="flex-1 gap-2 rounded-xl"
                >
                  <Save className="h-4 w-4" />
                  {saveBanner.isPending ? "Saving..." : editing ? "Update Banner" : "Create Banner"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={!!deleteBannerId}
          onClose={() => setDeleteBannerId(null)}
          onConfirm={() => {
            if (!deleteBannerId) return;
            deleteBanner.mutate(deleteBannerId, { onSettled: () => setDeleteBannerId(null) });
          }}
          title={tDual("deleteBannerTitle", language)}
          description={tDual("actionCannotBeUndone", language)}
          confirmLabel="Delete"
          variant="destructive"
          busy={deleteBanner.isPending}
        />
      </div>
    </ErrorBoundary>
  );
}
