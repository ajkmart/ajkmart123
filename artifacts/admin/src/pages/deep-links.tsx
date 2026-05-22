import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PullToRefresh } from "@/components/PullToRefresh";
import { PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "@/lib/adminFetcher";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  MoreHorizontal,
  MousePointerClick,
  Plus,
  QrCode,
  Trash2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";

const TARGET_SCREENS = [
  { value: "product", label: "Product Page", paramHint: "productId" },
  { value: "vendor", label: "Vendor Store", paramHint: "vendorId" },
  { value: "category", label: "Category", paramHint: "categoryId" },
  { value: "promo", label: "Promo / Deal", paramHint: "promoCode" },
  { value: "ride", label: "Ride Booking", paramHint: "pickup" },
  { value: "food", label: "Food Section", paramHint: "" },
  { value: "mart", label: "Mart Section", paramHint: "" },
  { value: "pharmacy", label: "Pharmacy", paramHint: "" },
  { value: "parcel", label: "Parcel", paramHint: "" },
  { value: "van", label: "Van Service", paramHint: "" },
];

type DeepLink = {
  id: string;
  shortCode: string;
  targetScreen: string;
  params: Record<string, string>;
  label: string;
  clickCount: number;
  createdAt: string;
};

function QrPopover({ url }: { url: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Show QR code">
          <QrCode className="h-4 w-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-auto flex-col items-center gap-2 p-4" side="left">
        <QRCodeSVG value={url} size={140} />
        <p className="text-muted-foreground max-w-[140px] text-center text-xs break-all">{url}</p>
      </PopoverContent>
    </Popover>
  );
}

export default function DeepLinksPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [targetScreen, setTargetScreen] = useState("");
  const [label, setLabel] = useState("");
  const [paramKey, setParamKey] = useState("");
  const [paramValue, setParamValue] = useState("");
  const [params, setParams] = useState<Record<string, string>>({});

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-deep-links"],
    queryFn: () => adminFetch("/deep-links"),
    refetchInterval: 30_000,
  });
  const links: DeepLink[] = data?.links || [];

  const createMutation = useMutation({
    mutationFn: (body: any) =>
      adminFetch("/deep-links", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-deep-links"] });
      toast({ title: "Deep link created" });
      resetForm();
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/deep-links/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-deep-links"] });
      toast({ title: "Link deleted" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  function resetForm() {
    setShowCreate(false);
    setTargetScreen("");
    setLabel("");
    setParamKey("");
    setParamValue("");
    setParams({});
  }

  function addParam() {
    if (paramKey.trim() && paramValue.trim()) {
      setParams({ ...params, [paramKey.trim()]: paramValue.trim() });
      setParamKey("");
      setParamValue("");
    }
  }

  function removeParam(key: string) {
    const next = { ...params };
    delete next[key];
    setParams(next);
  }

  function getFullUrl(shortCode: string) {
    return `${window.location.origin}/api/dl/${shortCode}`;
  }

  function copyLink(shortCode: string) {
    navigator.clipboard
      .writeText(getFullUrl(shortCode))
      .then(() => toast({ title: "Link copied to clipboard" }))
      .catch(() =>
        toast({
          title: "Copy failed",
          description: "Allow clipboard access and try again.",
          variant: "destructive",
        })
      );
  }

  function testLink(shortCode: string) {
    window.open(getFullUrl(shortCode), "_blank", "noopener,noreferrer");
  }

  const selectedTarget = TARGET_SCREENS.find((t) => t.value === targetScreen);
  const totalClicks = links.reduce((sum, l) => sum + l.clickCount, 0);

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Deep Links page crashed. Please reload.
        </div>
      }
    >
      <PullToRefresh
        onRefresh={async () => {
          await refetch();
        }}
      >
        <div className="space-y-6">
          <PageHeader
            icon={Link2}
            title="Deep Links"
            subtitle="Create marketing deep links to specific app screens"
            iconBgClass="bg-blue-100"
            iconColorClass="text-blue-600"
            actions={
              <Button className="gap-2 rounded-xl" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" /> Create Deep Link
              </Button>
            }
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="rounded-2xl p-4">
              <div className="text-muted-foreground text-sm">Total Links</div>
              <div className="text-2xl font-bold">{links.length}</div>
            </Card>
            <Card className="rounded-2xl p-4">
              <div className="text-muted-foreground text-sm">Total Clicks</div>
              <div className="text-2xl font-bold text-blue-600">{totalClicks}</div>
            </Card>
            <Card className="rounded-2xl p-4">
              <div className="text-muted-foreground text-sm">Avg Clicks / Link</div>
              <div className="text-2xl font-bold text-purple-600">
                {links.length > 0 ? (totalClicks / links.length).toFixed(1) : "0"}
              </div>
            </Card>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
            </div>
          ) : links.length === 0 ? (
            <Card className="rounded-2xl p-8 text-center">
              <Link2 className="text-muted-foreground/40 mx-auto mb-3 h-12 w-12" />
              <p className="text-muted-foreground">No deep links created yet.</p>
            </Card>
          ) : (
            <>
              {/* Mobile card list */}
              <section className="space-y-3 md:hidden" aria-label="Deep links">
                {links.map((link) => (
                  <Card key={link.id} className="overflow-hidden rounded-2xl">
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {link.label || link.shortCode}
                          </p>
                          <p className="text-muted-foreground truncate font-mono text-xs">
                            {getFullUrl(link.shortCode)}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 shrink-0 p-0"
                              aria-label="Open actions menu"
                            >
                              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => copyLink(link.shortCode)}>
                              <Copy className="mr-2 h-4 w-4" aria-hidden="true" /> Copy Link
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => testLink(link.shortCode)}>
                              <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" /> Test Link
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600"
                              onClick={() => {
                                if (confirm("Delete this deep link?"))
                                  deleteMutation.mutate(link.id);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{link.targetScreen}</Badge>
                        <div className="flex items-center gap-1 text-sm">
                          <MousePointerClick
                            className="text-muted-foreground h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          <span className="font-medium">{link.clickCount}</span>
                        </div>
                        <span className="text-muted-foreground ml-auto text-xs">
                          {new Date(link.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </section>
              {/* Desktop table */}
              <Card className="hidden overflow-hidden rounded-2xl md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label / Code</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Params</TableHead>
                      <TableHead>Clicks</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {links.map((link) => (
                      <TableRow key={link.id}>
                        <TableCell>
                          <div className="font-medium">{link.label || link.shortCode}</div>
                          <div className="text-muted-foreground max-w-[200px] truncate font-mono text-xs">
                            {getFullUrl(link.shortCode)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{link.targetScreen}</Badge>
                        </TableCell>
                        <TableCell>
                          {Object.keys(link.params as Record<string, string>).length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(link.params as Record<string, string>).map(
                                ([k, v]) => (
                                  <Badge key={k} variant="secondary" className="text-xs">
                                    {k}={v}
                                  </Badge>
                                )
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">none</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <MousePointerClick
                              className="text-muted-foreground h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            <span className="font-medium">{link.clickCount}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(link.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyLink(link.shortCode)}
                              aria-label="Copy link"
                            >
                              <Copy className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => testLink(link.shortCode)}
                              aria-label="Test link"
                            >
                              <ExternalLink className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <QrPopover url={getFullUrl(link.shortCode)} />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-700"
                              onClick={() => {
                                if (confirm("Delete this deep link?"))
                                  deleteMutation.mutate(link.id);
                              }}
                              aria-label="Delete link"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}

          <Dialog
            open={showCreate}
            onOpenChange={(v) => {
              if (!v) resetForm();
            }}
          >
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Deep Link</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Label (optional)</label>
                  <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g. Summer Sale Campaign"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Target Screen</label>
                  <Select value={targetScreen} onValueChange={setTargetScreen}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select screen" />
                    </SelectTrigger>
                    <SelectContent>
                      {TARGET_SCREENS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Parameters</label>
                  {selectedTarget?.paramHint && (
                    <p className="text-muted-foreground mb-1 text-xs">
                      Hint: use "{selectedTarget.paramHint}" as key
                    </p>
                  )}
                  {Object.entries(params).map(([k, v]) => (
                    <div key={k} className="mb-1 flex items-center gap-2">
                      <Badge variant="secondary">
                        {k} = {v}
                      </Badge>
                      <Button variant="ghost" size="sm" onClick={() => removeParam(k)}>
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  ))}
                  <div className="mt-1 flex items-center gap-2">
                    <Input
                      value={paramKey}
                      onChange={(e) => setParamKey(e.target.value)}
                      placeholder="Key"
                      className="flex-1"
                    />
                    <Input
                      value={paramValue}
                      onChange={(e) => setParamValue(e.target.value)}
                      placeholder="Value"
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addParam}
                      disabled={!paramKey.trim() || !paramValue.trim()}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={!targetScreen || createMutation.isPending}
                  onClick={() => createMutation.mutate({ targetScreen, params, label })}
                >
                  {createMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Generate Deep Link
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </PullToRefresh>
    </ErrorBoundary>
  );
}
