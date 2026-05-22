import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { adminFetch } from "@/lib/adminFetcher";
import { getAdminTiming } from "@/lib/adminTiming";
import { useLanguage } from "@/lib/useLanguage";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  FolderTree,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";

interface Category {
  id: string;
  name: string;
  icon: string;
  type: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  children?: Category[];
}

const ICON_OPTIONS = [
  "grid-outline",
  "leaf-outline",
  "fish-outline",
  "egg-outline",
  "cafe-outline",
  "home-outline",
  "wine-outline",
  "pizza-outline",
  "heart-outline",
  "restaurant-outline",
  "fast-food-outline",
  "flame-outline",
  "nutrition-outline",
  "ice-cream-outline",
  "basket-outline",
  "cart-outline",
  "medical-outline",
  "fitness-outline",
  "paw-outline",
  "shirt-outline",
  "car-outline",
  "book-outline",
  "laptop-outline",
  "phone-portrait-outline",
  "gift-outline",
  "flower-outline",
  "color-palette-outline",
  "construct-outline",
  "diamond-outline",
];

const TYPE_OPTIONS = [
  { value: "mart", label: "Mart" },
  { value: "food", label: "Food" },
  { value: "pharmacy", label: "Pharmacy" },
];

const EMPTY_FORM = {
  name: "",
  icon: "grid-outline",
  type: "mart",
  parentId: "",
  sortOrder: 0,
  isActive: true,
};

export default function CategoriesPage() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { onError: onCategoryError } = useErrorHandler({ title: "Error" });

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editing, setEditing] = useState<Category | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<string>("");
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    name: string;
    msg: string;
  } | null>(null);
  const [showAllCats, setShowAllCats] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-categories-tree", filterType],
    queryFn: () => adminFetch(`/categories/tree${filterType ? `?type=${filterType}` : ""}`),
    refetchInterval: getAdminTiming().refetchIntervalCategoriesMs,
  });

  const categories: Category[] = data?.categories || [];

  /* ── Filtered view (search-aware) ── */
  const q = search.trim().toLowerCase();
  const filteredCategories = q
    ? categories
        .filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.children || []).some((ch) => ch.name.toLowerCase().includes(q))
        )
        .map((c) => ({
          ...c,
          children: (c.children || []).filter(
            (ch) => c.name.toLowerCase().includes(q) || ch.name.toLowerCase().includes(q)
          ),
        }))
    : categories;

  const flatCategories = categories.flatMap((c) => [c, ...(c.children || [])]);

  const showLoadMore = !showAllCats && filteredCategories.length > 200;

  /* ── Mutations ── */
  type SaveCategoryBody = {
    name: string;
    icon: string;
    type: string;
    parentId: string | null;
    sortOrder: number;
    isActive: boolean;
  };
  const errMsg = (e: unknown): string =>
    e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";
  const saveMutation = useMutation({
    mutationFn: async (body: SaveCategoryBody) => {
      if (editing)
        return adminFetch(`/categories/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      return adminFetch("/categories", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-categories-tree"] });
      setDialogOpen(false);
      setEditing(null);
      setForm({ ...EMPTY_FORM });
      toast({ title: editing ? "Category updated" : "Category created" });
    },
    onError: (e: unknown) => {
      onCategoryError(e);
      toast({ title: "Error", description: errMsg(e), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-categories-tree"] });
      toast({ title: "Category deleted" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminFetch(`/categories/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-categories-tree"] }),
  });

  const reorderMutation = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) =>
      adminFetch("/categories/reorder", { method: "POST", body: JSON.stringify({ items }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-categories-tree"] }),
  });

  /* ── Drag-to-reorder handler (top-level) ── */
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination, type } = result;
    if (source.index === destination.index && source.droppableId === destination.droppableId)
      return;

    if (type === "TOP_LEVEL") {
      const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
      const reordered = [...sorted];
      const moved = reordered.splice(source.index, 1)[0]!;
      reordered.splice(destination.index, 0, moved);
      const items = reordered.map((cat, i) => ({ id: cat.id, sortOrder: i }));
      reorderMutation.mutate(items);
    } else {
      /* Sub-category reorder: droppableId = parent category id */
      const parentId = source.droppableId;
      const parent = categories.find((c) => c.id === parentId);
      if (!parent?.children) return;
      const sorted = [...parent.children].sort((a, b) => a.sortOrder - b.sortOrder);
      const moved = sorted.splice(source.index, 1)[0]!;
      sorted.splice(destination.index, 0, moved);
      const items = sorted.map((ch, i) => ({ id: ch.id, sortOrder: i }));
      reorderMutation.mutate(items);
    }
  };

  /* ── Arrow-based move (fallback for sub-cats when search active) ── */
  const moveCategory = (catId: string, direction: "up" | "down", parentId?: string | null) => {
    const siblings = parentId
      ? (categories.find((c) => c.id === parentId)?.children ?? [])
      : categories;
    const sorted = [...siblings].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((c) => c.id === catId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapIdx];
    if (!a || !b) return;
    const items = [
      { id: a.id, sortOrder: b.sortOrder },
      { id: b.id, sortOrder: a.sortOrder },
    ];
    reorderMutation.mutate(items);
  };

  const openNew = (parentId?: string) => {
    setEditing(null);
    const nextSort = parentId
      ? (categories.find((c) => c.id === parentId)?.children?.length ?? 0)
      : categories.length;
    setForm({ ...EMPTY_FORM, parentId: parentId || "", sortOrder: nextSort });
    setDialogOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setForm({
      name: cat.name,
      icon: cat.icon,
      type: cat.type,
      parentId: cat.parentId || "",
      sortOrder: cat.sortOrder,
      isActive: cat.isActive,
    });
    setDialogOpen(true);
  };

  const submit = () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    saveMutation.mutate({
      name: form.name.trim(),
      icon: form.icon,
      type: form.type,
      parentId: form.parentId || null,
      sortOrder: form.sortOrder,
      isActive: form.isActive,
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalActive = flatCategories.filter((c) => c.isActive).length;
  const totalInactive = flatCategories.filter((c) => !c.isActive).length;
  const isSearching = q.length > 0;

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Categories page crashed. Please reload.
        </div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          icon={FolderTree}
          title={T("navCategories")}
          subtitle={`${totalActive} active · ${totalInactive} inactive${!isSearching ? " · Drag rows to reorder" : ""}`}
          iconBgClass="bg-indigo-100"
          iconColorClass="text-indigo-600"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="border-input bg-background h-10 rounded-xl border px-3 text-sm"
              >
                <option value="">All Types</option>
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <Button onClick={() => openNew()} className="h-10 gap-2 rounded-xl shadow-md">
                <Plus className="h-4 w-4" />
                Add Category
              </Button>
            </div>
          }
        />

        {/* ── Search bar ── */}
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search categories by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-xl pr-9 pl-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* ── Category list ── */}
        <div className="space-y-2">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-muted h-16 animate-pulse rounded-2xl" />
              ))}
            </div>
          ) : filteredCategories.length === 0 ? (
            <Card className="border-border/50 rounded-2xl">
              <CardContent className="p-16 text-center">
                <FolderTree className="text-muted-foreground/30 mx-auto mb-3 h-12 w-12" />
                <p className="text-muted-foreground font-medium">
                  {isSearching ? `No categories matching "${search}"` : "No categories yet"}
                </p>
                {!isSearching && (
                  <>
                    <p className="text-muted-foreground/60 mt-1 text-sm">
                      Create your first category to get started
                    </p>
                    <Button onClick={() => openNew()} className="mt-4 gap-2 rounded-xl">
                      <Plus className="h-4 w-4" /> Add Category
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          ) : isSearching ? (
            /* Search results: flat list without drag-and-drop */
            <div className="space-y-2">
              {filteredCategories.map((cat) => (
                <div key={cat.id}>
                  <CategoryCard
                    cat={cat}
                    onEdit={openEdit}
                    onDelete={(id: string) => {
                      setDeleteConfirm({ id, name: cat.name, msg: `Delete "${cat.name}"?` });
                    }}
                    onToggle={(id: string) =>
                      toggleMutation.mutate({ id, isActive: !cat.isActive })
                    }
                    onAddChild={() => openNew(cat.id)}
                    onToggleExpand={toggleExpand}
                    expanded={expandedIds.has(cat.id)}
                    categories={categories}
                    toggleMutation={toggleMutation}
                    deleteMutation={deleteMutation}
                    openEdit={openEdit}
                    moveCategory={moveCategory}
                    isDragging={false}
                    isSearching={true}
                  />
                </div>
              ))}
            </div>
          ) : (
            /* Normal view: drag-and-drop enabled */
            <>
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="top-level" type="TOP_LEVEL">
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`space-y-2 rounded-2xl transition-colors ${snapshot.isDraggingOver ? "bg-indigo-50/50 p-2" : ""}`}
                    >
                      {[...filteredCategories]
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .slice(0, showAllCats ? undefined : 200)
                        .map((cat, index) => {
                          const hasChildren = (cat.children?.length ?? 0) > 0;
                          const isExpanded = expandedIds.has(cat.id);
                          return (
                            <Draggable key={cat.id} draggableId={cat.id} index={index}>
                              {(drag, dragSnapshot) => (
                                <div ref={drag.innerRef} {...drag.draggableProps}>
                                  <Card
                                    className={`border-border/50 rounded-2xl shadow-sm transition-all ${
                                      dragSnapshot.isDragging
                                        ? "scale-[1.02] rotate-1 shadow-xl ring-2 ring-indigo-300"
                                        : "hover:shadow-md"
                                    } ${!cat.isActive ? "opacity-60" : ""}`}
                                  >
                                    <CardContent className="p-4">
                                      <div className="flex items-center gap-3">
                                        {/* Drag handle */}
                                        <div
                                          {...drag.dragHandleProps}
                                          className="hover:bg-muted text-muted-foreground/50 hover:text-muted-foreground flex-shrink-0 cursor-grab rounded-md p-1 transition-colors active:cursor-grabbing"
                                        >
                                          <GripVertical className="h-4 w-4" />
                                        </div>

                                        <div className="flex flex-shrink-0 items-center gap-1">
                                          {hasChildren ? (
                                            <button
                                              onClick={() => toggleExpand(cat.id)}
                                              className="hover:bg-muted rounded-md p-1"
                                            >
                                              {isExpanded ? (
                                                <ChevronDown className="text-muted-foreground h-4 w-4" />
                                              ) : (
                                                <ChevronRight className="text-muted-foreground h-4 w-4" />
                                              )}
                                            </button>
                                          ) : (
                                            <div className="w-6" />
                                          )}
                                        </div>

                                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50">
                                          <span className="text-lg">📂</span>
                                        </div>

                                        <div className="min-w-0 flex-1">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-foreground truncate font-bold">
                                              {cat.name}
                                            </p>
                                            <span
                                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                                cat.type === "mart"
                                                  ? "bg-violet-100 text-violet-700"
                                                  : cat.type === "food"
                                                    ? "bg-amber-100 text-amber-700"
                                                    : "bg-green-100 text-green-700"
                                              }`}
                                            >
                                              {cat.type.toUpperCase()}
                                            </span>
                                            {!cat.isActive && (
                                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                                                INACTIVE
                                              </span>
                                            )}
                                          </div>
                                          <p className="text-muted-foreground mt-0.5 text-xs">
                                            {cat.icon.replace("-outline", "")} · #{index + 1}
                                            {hasChildren &&
                                              ` · ${(cat.children ?? []).length} sub-categories`}
                                          </p>
                                        </div>

                                        <div className="flex flex-shrink-0 items-center gap-1">
                                          <button
                                            onClick={() => openNew(cat.id)}
                                            className="hover:bg-muted rounded-lg p-2 transition-colors"
                                            title="Add sub-category"
                                          >
                                            <Plus className="h-4 w-4 text-indigo-600" />
                                          </button>
                                          <button
                                            onClick={() =>
                                              toggleMutation.mutate({
                                                id: cat.id,
                                                isActive: !cat.isActive,
                                              })
                                            }
                                            disabled={toggleMutation.isPending}
                                            className="hover:bg-muted rounded-lg p-2 transition-colors disabled:opacity-50"
                                          >
                                            {toggleMutation.isPending ? (
                                              <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
                                            ) : cat.isActive ? (
                                              <ToggleRight className="h-5 w-5 text-green-600" />
                                            ) : (
                                              <ToggleLeft className="text-muted-foreground h-5 w-5" />
                                            )}
                                          </button>
                                          <button
                                            onClick={() => openEdit(cat)}
                                            className="hover:bg-muted rounded-lg p-2 transition-colors"
                                          >
                                            <Pencil className="h-4 w-4 text-blue-600" />
                                          </button>
                                          <button
                                            onClick={() => {
                                              setDeleteConfirm({
                                                id: cat.id,
                                                name: cat.name,
                                                msg: `Delete "${cat.name}"? This will also unparent any sub-categories.`,
                                              });
                                            }}
                                            className="rounded-lg p-2 transition-colors hover:bg-red-50"
                                          >
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                          </button>
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>

                                  {/* ── Sub-categories (nested droppable) ── */}
                                  {hasChildren && isExpanded && (
                                    <Droppable droppableId={cat.id} type="SUB_LEVEL">
                                      {(subProvided, subSnapshot) => (
                                        <div
                                          ref={subProvided.innerRef}
                                          {...subProvided.droppableProps}
                                          className={`mt-1 ml-10 space-y-1 rounded-xl transition-colors ${subSnapshot.isDraggingOver ? "bg-indigo-50/40 p-1.5" : ""}`}
                                        >
                                          {[...cat.children!]
                                            .sort((a, b) => a.sortOrder - b.sortOrder)
                                            .map((child, ci) => (
                                              <Draggable
                                                key={child.id}
                                                draggableId={child.id}
                                                index={ci}
                                              >
                                                {(childDrag, childSnap) => (
                                                  <div
                                                    ref={childDrag.innerRef}
                                                    {...childDrag.draggableProps}
                                                  >
                                                    <Card
                                                      className={`border-border/40 rounded-xl shadow-sm transition-all ${
                                                        childSnap.isDragging
                                                          ? "rotate-1 shadow-lg ring-2 ring-indigo-200"
                                                          : ""
                                                      } ${!child.isActive ? "opacity-60" : ""}`}
                                                    >
                                                      <CardContent className="p-3">
                                                        <div className="flex items-center gap-3">
                                                          <div
                                                            {...childDrag.dragHandleProps}
                                                            className="hover:bg-muted text-muted-foreground/40 hover:text-muted-foreground cursor-grab rounded-md p-1 active:cursor-grabbing"
                                                          >
                                                            <GripVertical className="h-3.5 w-3.5" />
                                                          </div>
                                                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-50/60">
                                                            <span className="text-sm">📄</span>
                                                          </div>
                                                          <div className="min-w-0 flex-1">
                                                            <p className="text-foreground truncate text-sm font-semibold">
                                                              {child.name}
                                                            </p>
                                                            <p className="text-muted-foreground text-[11px]">
                                                              {child.icon.replace("-outline", "")} ·
                                                              #{ci + 1}
                                                            </p>
                                                          </div>
                                                          <div className="flex flex-shrink-0 items-center gap-1">
                                                            <button
                                                              onClick={() =>
                                                                toggleMutation.mutate({
                                                                  id: child.id,
                                                                  isActive: !child.isActive,
                                                                })
                                                              }
                                                              disabled={toggleMutation.isPending}
                                                              className="hover:bg-muted rounded-lg p-1.5 transition-colors disabled:opacity-50"
                                                            >
                                                              {child.isActive ? (
                                                                <ToggleRight className="h-4 w-4 text-green-600" />
                                                              ) : (
                                                                <ToggleLeft className="text-muted-foreground h-4 w-4" />
                                                              )}
                                                            </button>
                                                            <button
                                                              onClick={() => openEdit(child)}
                                                              className="hover:bg-muted rounded-lg p-1.5 transition-colors"
                                                            >
                                                              <Pencil className="h-3.5 w-3.5 text-blue-600" />
                                                            </button>
                                                            <button
                                                              onClick={() => {
                                                                setDeleteConfirm({
                                                                  id: child.id,
                                                                  name: child.name,
                                                                  msg: `Delete "${child.name}"?`,
                                                                });
                                                              }}
                                                              className="rounded-lg p-1.5 transition-colors hover:bg-red-50"
                                                            >
                                                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                                            </button>
                                                          </div>
                                                        </div>
                                                      </CardContent>
                                                    </Card>
                                                  </div>
                                                )}
                                              </Draggable>
                                            ))}
                                          {subProvided.placeholder}
                                        </div>
                                      )}
                                    </Droppable>
                                  )}
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
              {showLoadMore && (
                <div className="flex flex-col items-center gap-1 pt-2">
                  <p className="text-muted-foreground text-xs">
                    {filteredCategories.length - 200} more categories not shown.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => setShowAllCats(true)}
                  >
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Add/Edit dialog ── */}
        <Dialog
          open={dialogOpen}
          onOpenChange={(v) => {
            setDialogOpen(v);
            if (!v) {
              setEditing(null);
              setForm({ ...EMPTY_FORM });
            }
          }}
        >
          <DialogContent className="max-h-[90dvh] w-[95vw] max-w-lg overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderTree className="h-5 w-5 text-indigo-500" />
                {editing ? "Edit Category" : "Add Category"}
              </DialogTitle>
            </DialogHeader>
            <div className="mt-2 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">
                  Name <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="e.g. Dairy & Eggs"
                  value={form.name}
                  /* maxLength matches the backend categories.name VARCHAR(80)
                   limit so the user sees the cutoff in the input rather
                   than a 400 from the API on submit. */
                  maxLength={80}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="h-11 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="border-input bg-background h-11 w-full rounded-xl border px-3 text-sm"
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold">
                  Parent Category{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <select
                  value={form.parentId}
                  onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
                  className="border-input bg-background h-11 w-full rounded-xl border px-3 text-sm"
                >
                  <option value="">— None (top level) —</option>
                  {categories
                    .filter((c) => c.id !== editing?.id)
                    .flatMap((c) => [
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.type})
                      </option>,
                      ...(c.children || [])
                        .filter((ch) => ch.id !== editing?.id)
                        .map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            &nbsp;&nbsp;↳ {ch.name}
                          </option>
                        )),
                    ])}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Icon</label>
                <div className="flex flex-wrap gap-2">
                  {ICON_OPTIONS.map((icon) => (
                    <button
                      key={icon}
                      onClick={() => setForm((f) => ({ ...f, icon }))}
                      className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-all ${
                        form.icon === icon
                          ? "border-indigo-500 bg-indigo-500 text-white"
                          : "bg-muted border-border text-muted-foreground hover:border-indigo-300"
                      }`}
                    >
                      {icon.replace("-outline", "")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Sort Order</label>
                <Input
                  type="number"
                  min={0}
                  /* Cap sortOrder at a sensible 9999; categories with a
                   higher order make no UX sense and keep the value
                   inside a smallint on the backend. */
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
                className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all ${
                  form.isActive ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50"
                }`}
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
                  onClick={submit}
                  disabled={saveMutation.isPending}
                  className="flex-1 gap-2 rounded-xl"
                >
                  <Save className="h-4 w-4" />
                  {saveMutation.isPending ? "Saving..." : editing ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Delete confirmation dialog ── */}
        <Dialog
          open={!!deleteConfirm}
          onOpenChange={(v) => {
            if (!v) setDeleteConfirm(null);
          }}
        >
          <DialogContent className="max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle>Confirm Delete</DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground py-2 text-sm">{deleteConfirm?.msg}</p>
            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1 rounded-xl"
                onClick={() => {
                  if (deleteConfirm) deleteMutation.mutate(deleteConfirm.id);
                  setDeleteConfirm(null);
                }}
              >
                Delete
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ErrorBoundary>
  );
}

/* ── Inline card for search-result view ── */
interface CategoryCardProps {
  cat: Category;
  onEdit: (c: Category) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onAddChild: (parentId: string) => void;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  categories?: Category[];
  toggleMutation: { mutate: (vars: { id: string; isActive: boolean }) => void };
  deleteMutation: { mutate: (id: string) => void };
  openEdit: (c: Category) => void;
  moveCategory: (id: string, dir: "up" | "down", parentId?: string | null) => void;
  isDragging?: boolean;
  isSearching?: boolean;
}
function CategoryCard({
  cat,
  onEdit,
  onDelete,
  onToggle,
  onAddChild,
  expanded,
  onToggleExpand,
  toggleMutation,
  deleteMutation,
  openEdit,
  moveCategory,
}: CategoryCardProps) {
  const hasChildren = (cat.children?.length ?? 0) > 0;
  return (
    <Card
      className={`border-border/50 rounded-2xl shadow-sm transition-shadow hover:shadow-md ${!cat.isActive ? "opacity-60" : ""}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex flex-shrink-0 items-center gap-1">
            {hasChildren ? (
              <button
                onClick={() => onToggleExpand(cat.id)}
                className="hover:bg-muted rounded-md p-1"
              >
                {expanded ? (
                  <ChevronDown className="text-muted-foreground h-4 w-4" />
                ) : (
                  <ChevronRight className="text-muted-foreground h-4 w-4" />
                )}
              </button>
            ) : (
              <div className="w-6" />
            )}
          </div>
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50">
            <span className="text-lg">📂</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-foreground truncate font-bold">{cat.name}</p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  cat.type === "mart"
                    ? "bg-violet-100 text-violet-700"
                    : cat.type === "food"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-green-100 text-green-700"
                }`}
              >
                {cat.type.toUpperCase()}
              </span>
              {!cat.isActive && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                  INACTIVE
                </span>
              )}
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {cat.icon.replace("-outline", "")} ·{" "}
              {hasChildren && `${cat.children!.length} sub-categories`}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            <button
              onClick={() => onAddChild(cat.id)}
              className="hover:bg-muted rounded-lg p-2"
              title="Add sub-category"
            >
              <Plus className="h-4 w-4 text-indigo-600" />
            </button>
            <button onClick={() => onToggle(cat.id)} className="hover:bg-muted rounded-lg p-2">
              {cat.isActive ? (
                <ToggleRight className="h-5 w-5 text-green-600" />
              ) : (
                <ToggleLeft className="text-muted-foreground h-5 w-5" />
              )}
            </button>
            <button onClick={() => onEdit(cat)} className="hover:bg-muted rounded-lg p-2">
              <Pencil className="h-4 w-4 text-blue-600" />
            </button>
            <button onClick={() => onDelete(cat.id)} className="rounded-lg p-2 hover:bg-red-50">
              <Trash2 className="h-4 w-4 text-red-500" />
            </button>
          </div>
        </div>
      </CardContent>
      {hasChildren && expanded && (
        <div className="ml-10 space-y-1 px-3 pb-3">
          {cat.children!.map((child: Category, _ci: number) => (
            <Card
              key={child.id}
              className={`border-border/40 rounded-xl shadow-sm ${!child.isActive ? "opacity-60" : ""}`}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50/60">
                    <span className="text-sm">📄</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{child.name}</p>
                    <p className="text-muted-foreground text-[11px]">
                      {child.icon.replace("-outline", "")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        toggleMutation.mutate({ id: child.id, isActive: !child.isActive })
                      }
                      className="hover:bg-muted rounded-lg p-1.5"
                    >
                      {child.isActive ? (
                        <ToggleRight className="h-4 w-4 text-green-600" />
                      ) : (
                        <ToggleLeft className="text-muted-foreground h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => moveCategory(child.id, "up", cat.id)}
                      className="hover:bg-muted rounded-lg p-1.5"
                    >
                      <ArrowUp className="text-muted-foreground h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => moveCategory(child.id, "down", cat.id)}
                      className="hover:bg-muted rounded-lg p-1.5"
                    >
                      <ArrowDown className="text-muted-foreground h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => openEdit(child)}
                      className="hover:bg-muted rounded-lg p-1.5"
                    >
                      <Pencil className="h-3.5 w-3.5 text-blue-600" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${child.name}"?`)) deleteMutation.mutate(child.id);
                      }}
                      className="rounded-lg p-1.5 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
}
