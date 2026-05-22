import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MobileDrawer } from "@/components/MobileDrawer";
import { PullToRefresh } from "@/components/PullToRefresh";
import { SensitiveActionDialog } from "@/components/SensitiveActionDialog";
import { WalletAdjustModal } from "@/components/WalletAdjustModal";
import { ActionBar, FilterBar, PageHeader, StatCard, StatCardSkeleton } from "@/components/shared";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { SafeImage } from "@/components/ui/SafeImage";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAdminForcePasswordReset,
  useAdminKycApprove,
  useAdminKycByUserId,
  useAdminKycReject,
  useAdminResetOtp,
  useAdminUserSessions,
  useAdminVerifyContact,
  useAdminViewOtp,
  useApproveUser,
  useBulkBanUsers,
  useCreateUser,
  useDeleteUser,
  useDisable2FA,
  useExportUsers,
  usePendingUsers,
  useRejectUser,
  useRequestUserCorrection,
  useResetWalletPin,
  useRevokeAllUserSessions,
  useRevokeUserSession,
  useUpdateUser,
  useUpdateUserIdentity,
  useUpdateUserSecurity,
  useUserActivity,
  useUsers,
  useWaiveDebt,
  type CreateUserInput,
} from "@/hooks/use-admin";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/lib/adminAuthContext";
import { adminFetch } from "@/lib/adminFetcher";
import { formatCurrency, formatDate, getStatusColor } from "@/lib/format";
import { useLanguage } from "@/lib/useLanguage";
import { createUserSchema, type CreateUserFormErrors } from "@/lib/validation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tDual, type TranslationKey } from "@workspace/i18n";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  AtSign,
  Ban,
  Building2,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  Download,
  Eye,
  FileText,
  Gavel,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Monitor,
  Package,
  Phone,
  Pill,
  RefreshCw,
  Save,
  Shield,
  ShoppingBag,
  Trash2,
  Truck,
  UserCog,
  User as UserIcon,
  UserPlus,
  Users as UsersIcon,
  Wallet,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";

function normalizeRoles(roles: string | string[] | undefined, fallback = "customer"): string[] {
  if (Array.isArray(roles)) return roles.filter(Boolean);
  return (roles || fallback)
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
}

const ROLE_COLORS: Record<string, string> = {
  customer: "bg-blue-100 text-blue-700 border-blue-200",
  rider: "bg-emerald-100 text-emerald-700 border-emerald-200",
  vendor: "bg-orange-100 text-orange-700 border-orange-200",
  admin: "bg-purple-100 text-purple-700 border-purple-200",
};

type UserSortKey = "name" | "wallet" | "status" | "joined";
type UserSortDir = "asc" | "desc";

function UserSortBtn({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  col: UserSortKey;
  sortKey: UserSortKey;
  sortDir: UserSortDir;
  onSort: (k: UserSortKey) => void;
}) {
  const isActive = sortKey === col;
  return (
    <button
      onClick={() => onSort(col)}
      className="hover:text-foreground group flex items-center gap-1 text-left font-semibold whitespace-nowrap transition-colors"
    >
      {label}
      <span className="shrink-0">
        {isActive ? (
          sortDir === "asc" ? (
            <ArrowUp className="text-primary h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="text-primary h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="text-muted-foreground/40 group-hover:text-muted-foreground h-3 w-3 transition-colors" />
        )}
      </span>
    </button>
  );
}

function SkeletonRow() {
  return (
    <TableRow className="animate-pulse">
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="bg-muted h-10 w-10 rounded-full" />
          <div className="space-y-1.5">
            <div className="bg-muted h-4 w-28 rounded" />
            <div className="bg-muted h-3 w-20 rounded" />
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="bg-muted h-4 w-24 rounded" />
      </TableCell>
      <TableCell>
        <div className="bg-muted h-5 w-16 rounded-full" />
      </TableCell>
      <TableCell className="text-right">
        <div className="bg-muted ml-auto h-4 w-16 rounded" />
      </TableCell>
      <TableCell className="text-center">
        <div className="bg-muted mx-auto h-5 w-12 rounded-full" />
      </TableCell>
      <TableCell className="text-right">
        <div className="bg-muted ml-auto h-4 w-20 rounded" />
      </TableCell>
      <TableCell className="text-right">
        <div className="bg-muted ml-auto h-8 w-32 rounded" />
      </TableCell>
    </TableRow>
  );
}

function UserActivityModal({
  userId,
  userName,
  user: userData,
  onClose,
}: {
  userId: string;
  userName: string;
  user: any;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useUserActivity(userId);
  const userRoles = normalizeRoles(userData.roles || userData.role);
  const isRider = userRoles.includes("rider");
  const isVendor = userRoles.includes("vendor");

  return (
    <MobileDrawer
      open
      onClose={onClose}
      title={
        <>
          <Activity className="h-5 w-5 text-indigo-600" /> Activity — {userName}
        </>
      }
      dialogClassName="w-[95vw] max-w-2xl max-h-[85dvh] overflow-y-auto rounded-2xl"
    >
      <div className="space-y-2 rounded-xl border border-blue-100 bg-gradient-to-r from-[#1A56DB]/5 to-blue-50 p-3">
        <p className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
          Profile Details
        </p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {userData.email && (
            <div className="col-span-2 flex items-center gap-2">
              <span className="text-muted-foreground">✉</span>
              <span className="text-foreground">{userData.email}</span>
            </div>
          )}
          {userData.cnic && (
            <div className="flex items-center gap-2">
              <CreditCard className="h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
              <span className="text-muted-foreground text-xs">CNIC:</span>
              <span className="font-mono text-xs font-semibold">{userData.cnic}</span>
            </div>
          )}
          {userData.city && (
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-[#1A56DB]" />
              <span className="text-muted-foreground text-xs">City:</span>
              <span className="text-xs font-semibold">{userData.city}</span>
            </div>
          )}
          {userData.address && (
            <div className="col-span-2 flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
              <span className="text-muted-foreground truncate text-xs">{userData.address}</span>
            </div>
          )}
          {isRider && userData.riderProfile?.vehicleType && (
            <div className="flex items-center gap-2">
              <Truck className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
              <span className="text-muted-foreground text-xs">Vehicle:</span>
              <span className="text-xs font-semibold capitalize">
                {userData.riderProfile?.vehicleType}
              </span>
            </div>
          )}
          {isRider && userData.riderProfile?.vehiclePlate && (
            <div className="flex items-center gap-2">
              <span className="rounded bg-emerald-100 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-800">
                {userData.riderProfile?.vehiclePlate}
              </span>
            </div>
          )}
          {isVendor && userData.vendorProfile?.businessType && (
            <div className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-orange-600" />
              <span className="text-muted-foreground text-xs">Business:</span>
              <span className="text-xs font-semibold capitalize">
                {userData.vendorProfile?.businessType}
              </span>
            </div>
          )}
          <div className="col-span-2 flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
            <span className="text-muted-foreground text-xs">MPIN Status:</span>
            {(() => {
              const hasMpin = !!(userData.hasMpin || userData.walletPinHash);
              const isLocked = !!userData.isMpinLocked;
              if (!hasMpin)
                return (
                  <Badge
                    variant="outline"
                    className="border-gray-300 bg-gray-100 text-[10px] text-gray-600"
                  >
                    Not Set
                  </Badge>
                );
              if (isLocked) {
                return (
                  <Badge
                    variant="outline"
                    className="border-red-300 bg-red-100 text-[10px] text-red-700"
                  >
                    Locked
                  </Badge>
                );
              }
              return (
                <Badge
                  variant="outline"
                  className="border-emerald-300 bg-emerald-100 text-[10px] text-emerald-700"
                >
                  Active
                </Badge>
              );
            })()}
          </div>
        </div>
      </div>

      {(userData.emergencyContact ||
        userData.bankName ||
        userData.bankAccount ||
        userData.bankAccountTitle) && (
        <div className="space-y-2 rounded-xl border border-sky-100 bg-gradient-to-r from-sky-50 to-indigo-50 p-3">
          <p className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
            Financial &amp; Contact
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {userData.emergencyContact && (
              <div className="col-span-2 flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 flex-shrink-0 text-red-500" />
                <span className="text-muted-foreground text-xs">Emergency:</span>
                <span className="text-xs font-semibold">{userData.emergencyContact}</span>
              </div>
            )}
            {userData.bankName && (
              <div className="col-span-2 flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-2 py-1.5">
                <CreditCard className="h-3.5 w-3.5 flex-shrink-0 text-sky-600" />
                <span className="text-xs font-bold text-sky-700">Bank:</span>
                <span className="text-xs text-sky-800">{userData.bankName}</span>
                {userData.bankAccountTitle && (
                  <span className="text-muted-foreground text-xs">
                    · {userData.bankAccountTitle}
                  </span>
                )}
                {userData.bankAccount && (
                  <span className="font-mono text-xs font-bold text-sky-900">
                    {userData.bankAccount}
                  </span>
                )}
              </div>
            )}
            {!userData.bankName && (userData.bankAccount || userData.bankAccountTitle) && (
              <div className="col-span-2 flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-2 py-1.5">
                <CreditCard className="h-3.5 w-3.5 flex-shrink-0 text-sky-600" />
                {userData.bankAccountTitle && (
                  <span className="text-muted-foreground text-xs">{userData.bankAccountTitle}</span>
                )}
                {userData.bankAccount && (
                  <span className="font-mono text-xs font-bold text-sky-900">
                    {userData.bankAccount}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-muted-foreground flex h-40 flex-col items-center justify-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-[#1A56DB]" />
          <span className="text-sm">Loading activity...</span>
        </div>
      ) : isError ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-red-500">
          <AlertTriangle className="h-6 w-6" />
          <span className="text-sm">Failed to load activity data.</span>
        </div>
      ) : (
        <div className="mt-2 space-y-5">
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
              <ShoppingBag className="h-4 w-4 text-indigo-600" /> Recent Orders (
              {data?.orders?.length || 0})
            </h3>
            {data?.orders?.length === 0 ? (
              <p className="text-muted-foreground text-xs italic">No orders yet.</p>
            ) : (
              <div className="space-y-2">
                {data?.orders?.map((o: any) => (
                  <div
                    key={o.id}
                    className="bg-muted/30 hover:bg-muted/50 flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors"
                  >
                    <div>
                      <span className="font-mono text-xs font-bold">
                        {o.id.slice(-6).toUpperCase()}
                      </span>
                      <span className="text-muted-foreground ml-2 capitalize">{o.type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${getStatusColor(o.status)}`}
                      >
                        {o.status.replace("_", " ")}
                      </span>
                      <span className="font-bold">{formatCurrency(o.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
              <Car className="h-4 w-4 text-emerald-600" /> Recent Rides ({data?.rides?.length || 0})
            </h3>
            {data?.rides?.length === 0 ? (
              <p className="text-muted-foreground text-xs italic">No rides yet.</p>
            ) : (
              <div className="space-y-2">
                {data?.rides?.map((r: any) => (
                  <div
                    key={r.id}
                    className="bg-muted/30 hover:bg-muted/50 flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors"
                  >
                    <div>
                      <span className="font-mono text-xs font-bold">
                        {r.id.slice(-6).toUpperCase()}
                      </span>
                      <span className="text-muted-foreground ml-2 capitalize">{r.type}</span>
                      <span className="text-muted-foreground ml-2">{r.distance}km</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${getStatusColor(r.status)}`}
                      >
                        {r.status.replace("_", " ")}
                      </span>
                      <span className="font-bold">{formatCurrency(r.fare)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {(data?.pharmacy?.length || 0) > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                <Pill className="h-4 w-4 text-pink-600" /> Pharmacy Orders ({data?.pharmacy?.length}
                )
              </h3>
              <div className="space-y-2">
                {data?.pharmacy?.map((p: any) => (
                  <div
                    key={p.id}
                    className="bg-muted/30 hover:bg-muted/50 flex justify-between rounded-xl px-3 py-2 text-sm transition-colors"
                  >
                    <span className="font-mono text-xs">{p.id.slice(-6).toUpperCase()}</span>
                    <div className="flex gap-2">
                      <span
                        className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${getStatusColor(p.status)}`}
                      >
                        {p.status}
                      </span>
                      <span className="font-bold">{formatCurrency(p.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(data?.parcels?.length || 0) > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                <Package className="h-4 w-4 text-orange-600" /> Parcel Bookings (
                {data?.parcels?.length})
              </h3>
              <div className="space-y-2">
                {data?.parcels?.map((p: any) => (
                  <div
                    key={p.id}
                    className="bg-muted/30 hover:bg-muted/50 flex justify-between rounded-xl px-3 py-2 text-sm transition-colors"
                  >
                    <span className="font-mono text-xs">{p.id.slice(-6).toUpperCase()}</span>
                    <div className="flex gap-2">
                      <span
                        className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${getStatusColor(p.status)}`}
                      >
                        {p.status}
                      </span>
                      <span className="font-bold">{formatCurrency(p.fare)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
              <Wallet className="h-4 w-4 text-sky-600" /> Wallet History (
              {data?.transactions?.length || 0})
            </h3>
            {data?.transactions?.length === 0 ? (
              <p className="text-muted-foreground text-xs italic">No wallet activity.</p>
            ) : (
              <div className="space-y-1.5">
                {data?.transactions?.map((t: any) => (
                  <div
                    key={t.id}
                    className="bg-muted/30 hover:bg-muted/50 flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors"
                  >
                    <span className="text-muted-foreground max-w-[180px] truncate">
                      {t.description}
                    </span>
                    <span
                      className={`font-bold ${t.type === "credit" ? "text-emerald-600" : "text-red-600"}`}
                    >
                      {t.type === "credit" ? "+" : "-"}
                      {formatCurrency(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </MobileDrawer>
  );
}

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const createUser = useCreateUser();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [role, setRole] = useState<NonNullable<CreateUserInput["role"]>>("customer");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createdTempPassword, setCreatedTempPassword] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setPhone("");
    setEmail("");
    setUsername("");
    setTempPassword("");
    setRole("customer");
    setCity("");
    setArea("");
    setErrors({});
    setCreatedTempPassword(null);
  };

  const handleSubmit = () => {
    const result = createUserSchema.safeParse({
      name,
      phone,
      email,
      username,
      tempPassword,
      role,
      city,
      area,
    });
    if (!result.success) {
      const errs: CreateUserFormErrors = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] ?? "general");
        if (!errs[key]) errs[key] = issue.message;
      }
      setErrors(errs);
      return;
    }
    const payload: CreateUserInput = { role };
    if (name.trim()) payload.name = name.trim();
    if (phone.trim()) payload.phone = phone.trim();
    if (email.trim()) payload.email = email.trim();
    if (username.trim()) payload.username = username.trim();
    if (tempPassword.trim()) payload.tempPassword = tempPassword.trim();
    if (city.trim()) payload.city = city.trim();
    if (area.trim()) payload.area = area.trim();
    createUser.mutate(payload, {
      onSuccess: () => {
        if (tempPassword.trim()) {
          setCreatedTempPassword(tempPassword.trim());
        } else {
          toast({
            title: "User created",
            description: name.trim() || phone.trim() || "New user added successfully.",
          });
          reset();
          onClose();
        }
      },
      onError: (e: Error) => {
        const msg = e.message?.toLowerCase() ?? "";
        if (
          msg.includes("409") ||
          msg.includes("already exists") ||
          msg.includes("duplicate") ||
          msg.includes("already taken")
        ) {
          setErrors({
            general: e.message || "Yeh phone, email, ya username already registered hai",
          });
        } else {
          toast({ title: "Failed to create user", description: e.message, variant: "destructive" });
        }
      },
    });
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  if (createdTempPassword) {
    return (
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) handleClose();
        }}
      >
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" /> User Created Successfully
            </DialogTitle>
          </DialogHeader>
          <div className="mt-1 space-y-4">
            <p className="text-muted-foreground text-sm">
              User account has been created. Share the temporary password below with the user — they
              will be prompted to change it on first login.
            </p>
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold tracking-wider text-amber-700 uppercase">
                Temporary Password
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-amber-100 px-3 py-2 font-mono text-base font-bold text-amber-900 select-all">
                  {createdTempPassword}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => {
                    void navigator.clipboard?.writeText(createdTempPassword);
                    toast({ title: "Copied!" });
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Button
              className="w-full rounded-xl bg-[#1A56DB] text-white hover:bg-[#1A56DB]/90"
              onClick={handleClose}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#1A56DB]">
            <UserPlus className="h-5 w-5" /> Create User
          </DialogTitle>
        </DialogHeader>
        <div className="mt-1 space-y-4">
          {errors.general && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{errors.general}</p>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Full Name{" "}
              <span className="text-muted-foreground font-normal normal-case">
                (required if no phone)
              </span>
            </label>
            <div className="relative">
              <UserIcon className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ali Khan"
                className="h-10 rounded-xl pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Phone{" "}
              <span className="text-muted-foreground font-normal normal-case">(optional)</span>
            </label>
            <div className="relative">
              <Phone className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setErrors((prev) => ({ ...prev, phone: "" }));
                }}
                placeholder="e.g. 03001234567 or +923001234567"
                className={`h-10 rounded-xl pl-9 ${errors.phone ? "border-red-400 focus:ring-red-300" : ""}`}
              />
            </div>
            {errors.phone && <p className="text-xs text-red-600">{errors.phone}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Email{" "}
              <span className="text-muted-foreground font-normal normal-case">(optional)</span>
            </label>
            <div className="relative">
              <Mail className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors((prev) => ({ ...prev, email: "" }));
                }}
                placeholder="e.g. ali@example.com"
                type="email"
                className={`h-10 rounded-xl pl-9 ${errors.email ? "border-red-400 focus:ring-red-300" : ""}`}
              />
            </div>
            {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Username{" "}
              <span className="text-muted-foreground font-normal normal-case">
                (optional, for password login)
              </span>
            </label>
            <div className="relative">
              <AtSign className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setErrors((prev) => ({ ...prev, username: "" }));
                }}
                placeholder="e.g. ali_khan"
                className={`h-10 rounded-xl pl-9 ${errors.username ? "border-red-400 focus:ring-red-300" : ""}`}
              />
            </div>
            {errors.username && <p className="text-xs text-red-600">{errors.username}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Temporary Password{" "}
              <span className="text-muted-foreground font-normal normal-case">(optional)</span>
            </label>
            <div className="relative">
              <KeyRound className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                value={tempPassword}
                onChange={(e) => {
                  setTempPassword(e.target.value);
                  setErrors((prev) => ({ ...prev, tempPassword: "" }));
                }}
                placeholder="Set a temporary password for this user"
                type="text"
                className={`h-10 rounded-xl pl-9 font-mono ${errors.tempPassword ? "border-red-400 focus:ring-red-300" : ""}`}
              />
            </div>
            {errors.tempPassword ? (
              <p className="text-xs text-red-600">{errors.tempPassword}</p>
            ) : (
              <p className="text-muted-foreground text-[11px]">
                Min 8 chars, 1 uppercase letter, 1 number. User must change on first login.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Role
            </label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as NonNullable<CreateUserInput["role"]>)}
            >
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="rider">Rider</SelectItem>
                <SelectItem value="vendor">Vendor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                City{" "}
                <span className="text-muted-foreground font-normal normal-case">(optional)</span>
              </label>
              <div className="relative">
                <MapPin className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Lahore"
                  className="h-10 rounded-xl pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                Area{" "}
                <span className="text-muted-foreground font-normal normal-case">(optional)</span>
              </label>
              <Input
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. Gulberg"
                className="h-10 rounded-xl"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={handleClose}
              disabled={createUser.isPending}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 gap-2 rounded-xl bg-[#1A56DB] text-white hover:bg-[#1A56DB]/90"
              onClick={handleSubmit}
              disabled={createUser.isPending}
            >
              {createUser.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Creating...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" /> Create User
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ALL_SERVICES = [
  { key: "mart", label: "Mart", icon: "🛒" },
  { key: "food", label: "Food", icon: "🍔" },
  { key: "rides", label: "Rides", icon: "🚗" },
  { key: "pharmacy", label: "Pharmacy", icon: "💊" },
  { key: "parcel", label: "Parcel", icon: "📦" },
];
const ALL_ROLES = [
  { key: "customer", label: "Customer", icon: "👤", desc: "Can place orders, book rides" },
  { key: "rider", label: "Rider", icon: "🚴", desc: "Can accept & deliver orders" },
  { key: "vendor", label: "Vendor", icon: "🏪", desc: "Can manage a store/menu" },
];

function SecurityModal({ user, onClose }: { user: any; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const userRoles = normalizeRoles(user.roles || user.role);
  const blockedSvc = (user.blockedServices || "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);

  const [roles, setRoles] = useState<string[]>(userRoles);
  const [isActive, setIsActive] = useState<boolean>(user.isActive);
  const [isBanned, setIsBanned] = useState<boolean>(user.isBanned || false);
  const [banReason, setBanReason] = useState<string>(user.banReason || "");
  const [blockedServices, setBlockedServices] = useState<string[]>(blockedSvc);
  const [securityNote, setSecurityNote] = useState<string>(user.securityNote || "");
  const [totpEnabled, setTotpEnabled] = useState<boolean>(user.totpEnabled || false);

  const [editUsername, setEditUsername] = useState<string>(user.username || "");
  const [editEmail, setEditEmail] = useState<string>(user.email || "");
  const [editName, setEditName] = useState<string>(user.name || "");
  const [showMpinResetConfirm, setShowMpinResetConfirm] = useState(false);

  /* ── OTP Tools state ── */
  const [showOtpData, setShowOtpData] = useState(false);
  const [viewOtpEnabled, setViewOtpEnabled] = useState(false);
  const otpQuery = useAdminViewOtp(user.id, { enabled: viewOtpEnabled });

  const verifyContact = useAdminVerifyContact();
  const forcePasswordReset = useAdminForcePasswordReset();
  const [requirePasswordChange, setRequirePasswordChange] = useState<boolean>(
    user.requirePasswordChange || false
  );

  const handleViewOtp = () => {
    setShowOtpData(true);
    setViewOtpEnabled(true);
  };

  const handleVerifyContact = (type: "phone" | "email") => {
    verifyContact.mutate(
      { userId: user.id, type },
      {
        onSuccess: () => toast({ title: `${type === "phone" ? "Phone" : "Email"} verified` }),
        onError: (e: unknown) =>
          toast({
            title: "Verify failed",
            description: e instanceof Error ? e.message : "Unknown error",
            variant: "destructive",
          }),
      }
    );
  };

  const handleForcePasswordReset = () => {
    forcePasswordReset.mutate(user.id, {
      onSuccess: (data: any) => {
        setRequirePasswordChange(true);
        toast({
          title: "Password reset required",
          description: data?.message ?? "User will be prompted to change password on next login.",
        });
      },
      onError: (e: any) =>
        toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  const [bypassMinutes, setBypassMinutes] = useState<15 | 30 | 60>(15);
  const [bypassActive, setBypassActive] = useState<boolean>(
    !!(user.otpBypassUntil && new Date(user.otpBypassUntil) > new Date())
  );
  const [bypassUntil, setBypassUntil] = useState<string | null>(
    user.otpBypassUntil && new Date(user.otpBypassUntil) > new Date() ? user.otpBypassUntil : null
  );

  const securityMutation = useUpdateUserSecurity();

  const resetOtpMutation = useAdminResetOtp();

  const setBypassMutation = useMutation({
    mutationFn: (minutes: number) =>
      adminFetch(`/users/${user.id}/otp/bypass`, {
        method: "POST",
        body: JSON.stringify({ minutes }),
      }),
    onSuccess: (d: any) => {
      setBypassActive(true);
      setBypassUntil(d.bypassUntil);
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({
        title: "OTP bypass enabled",
        description: `User can log in without OTP until ${new Date(d.bypassUntil).toLocaleTimeString()}`,
      });
    },
    onError: (e: any) =>
      toast({ title: "Failed to set bypass", description: e.message, variant: "destructive" }),
  });

  const cancelBypassMutation = useMutation({
    mutationFn: () => adminFetch(`/users/${user.id}/otp/bypass`, { method: "DELETE", body: "{}" }),
    onSuccess: () => {
      setBypassActive(false);
      setBypassUntil(null);
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "OTP bypass cancelled" });
    },
    onError: (e: any) =>
      toast({ title: "Failed to cancel bypass", description: e.message, variant: "destructive" }),
  });

  const _disable2fa = useDisable2FA();
  const disable2faMutation = {
    ..._disable2fa,
    mutate: () => _disable2fa.mutate(user.id, { onSuccess: () => setTotpEnabled(false) }),
    isPending: _disable2fa.isPending,
  };

  const _resetWalletPin = useResetWalletPin();
  const resetWalletPinMutation = {
    ..._resetWalletPin,
    mutate: () => _resetWalletPin.mutate(user.id),
    isPending: _resetWalletPin.isPending,
  };

  /* ── Sessions ── */
  const [showSessions, setShowSessions] = useState(false);
  const { data: sessionsData, isLoading: sessionsLoading } = useAdminUserSessions(
    showSessions ? user.id : null
  );
  const revokeSession = useRevokeUserSession();
  const revokeAll = useRevokeAllUserSessions();

  const identityMutation = useUpdateUserIdentity();

  const handleIdentitySave = () => {
    const body: Record<string, string> = {};
    if (editName.trim() !== (user.name || "")) body.name = editName.trim();
    if (editUsername.trim().toLowerCase() !== (user.username || ""))
      body.username = editUsername.trim();
    if (editEmail.trim().toLowerCase() !== (user.email || "")) body.email = editEmail.trim();
    if (Object.keys(body).length === 0) {
      toast({ title: "No changes", description: "No identity fields were modified." });
      return;
    }
    identityMutation.mutate({ id: user.id, ...body });
  };

  const toggleRole = (r: string) => {
    setRoles((prev) => {
      if (prev.includes(r)) {
        if (prev.length <= 1) {
          toast({
            title: "At least one role required",
            description: "A user must have at least one role assigned.",
            variant: "destructive",
          });
          return prev;
        }
        return prev.filter((x) => x !== r);
      }
      return [...prev, r];
    });
  };
  const toggleService = (s: string) => {
    setBlockedServices((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const [pendingRoleChange, setPendingRoleChange] = useState(false);

  const rolesChanged = useMemo(() => {
    const origRoles = normalizeRoles(user.roles || user.role).sort();
    return roles.slice().sort().join(",") !== origRoles.join(",");
  }, [roles, user]);

  const handleSave = () => {
    if (rolesChanged) {
      setPendingRoleChange(true);
    } else {
      performSaveUser();
    }
  };

  const performSaveUser = () => {
    const newRoles = roles.length > 0 ? roles : ["customer"];
    const origRoles = normalizeRoles(user.roles || user.role).sort();
    securityMutation.mutate(
      {
        id: user.id,
        isActive,
        isBanned,
        banReason: isBanned ? banReason : null,
        roles: newRoles.join(","),
        blockedServices: blockedServices.join(","),
        securityNote,
        notify: isBanned && !user.isBanned,
      },
      {
        onSuccess: (_data, vars) => {
          const changedParts: string[] = [];
          const newRolesArr = (vars.roles || "customer")
            .split(",")
            .map((r: string) => r.trim())
            .filter(Boolean);
          if (newRolesArr.slice().sort().join(",") !== origRoles.join(",")) {
            changedParts.push(
              `Roles: ${newRolesArr.map((r: string) => r.charAt(0).toUpperCase() + r.slice(1)).join(" + ")}`
            );
          }
          if (vars.isActive !== user.isActive || vars.isBanned !== (user.isBanned || false)) {
            changedParts.push(
              `Status: ${vars.isBanned ? "Banned" : vars.isActive ? "Active" : "Blocked"}`
            );
          }
          if (vars.securityNote !== (user.securityNote || ""))
            changedParts.push("Security note updated");
          if (vars.blockedServices !== (user.blockedServices || ""))
            changedParts.push("Service restrictions updated");
          toast({
            title: "Security settings saved",
            description: changedParts.length ? changedParts.join(" · ") : undefined,
          });
          onClose();
        },
        onError: (e: any) =>
          toast({ title: "Save failed", description: e.message, variant: "destructive" }),
      }
    );
    setPendingRoleChange(false);
  };

  return (
    <>
      <MobileDrawer
        open
        onClose={onClose}
        title={
          <>
            <Shield className="h-5 w-5 text-indigo-600" /> Security — {user.name || user.phone}
          </>
        }
        dialogClassName="w-[95vw] max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl"
      >
        <div className="mt-2 space-y-5">
          <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-gradient-to-r from-[#1A56DB]/5 to-blue-50 px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1A56DB]/10 font-bold text-[#1A56DB]">
              {(user.name || user.phone || "U")[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold">{user.name || user.phone}</p>
              <p className="text-muted-foreground text-xs">
                {user.phone} · Wallet: <strong>{formatCurrency(user.walletBalance)}</strong>
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-foreground flex items-center gap-2 text-sm font-bold">
              <AtSign className="h-4 w-4 text-[#1A56DB]" /> Identity Fields
            </h3>
            <div className="space-y-2">
              <div className="relative">
                <UserIcon className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  placeholder="Full name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-10 rounded-xl pl-9"
                />
              </div>
              <div className="relative">
                <AtSign className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  placeholder="Username (min 3 chars, lowercase)"
                  value={editUsername}
                  onChange={(e) =>
                    setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                  }
                  className="h-10 rounded-xl pl-9 font-mono"
                />
              </div>
              <div className="relative">
                <Mail className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  placeholder="Email address"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="h-10 rounded-xl pl-9"
                />
              </div>
              <div className="relative">
                <Phone className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  value={user.phone || ""}
                  disabled
                  className="bg-muted/50 text-muted-foreground h-10 cursor-not-allowed rounded-xl pl-9"
                />
                <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-[10px]">
                  Primary (read-only)
                </span>
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleIdentitySave}
              disabled={identityMutation.isPending}
              className="h-9 w-full gap-2 rounded-xl bg-[#1A56DB] text-white hover:bg-[#1A56DB]/90"
            >
              {identityMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Identity
            </Button>
          </div>

          <div className="space-y-2">
            <h3 className="text-foreground flex items-center gap-2 text-sm font-bold">
              <UserCog className="h-4 w-4 text-[#1A56DB]" /> Account Status
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div
                onClick={() => {
                  setIsActive(true);
                  setIsBanned(false);
                }}
                className={`cursor-pointer rounded-xl border p-3 transition-all ${isActive && !isBanned ? "border-emerald-400 bg-emerald-50 shadow-sm" : "bg-muted/30 border-border hover:border-emerald-300"}`}
              >
                <CheckCircle2
                  className={`mb-1 h-5 w-5 ${isActive && !isBanned ? "text-emerald-600" : "text-muted-foreground"}`}
                />
                <p className="text-sm font-bold">Active</p>
                <p className="text-muted-foreground text-xs">Full access</p>
              </div>
              <div
                onClick={() => {
                  setIsActive(false);
                  setIsBanned(false);
                }}
                className={`cursor-pointer rounded-xl border p-3 transition-all ${!isActive && !isBanned ? "border-amber-400 bg-amber-50 shadow-sm" : "bg-muted/30 border-border hover:border-amber-300"}`}
              >
                <XCircle
                  className={`mb-1 h-5 w-5 ${!isActive && !isBanned ? "text-amber-600" : "text-muted-foreground"}`}
                />
                <p className="text-sm font-bold">Blocked</p>
                <p className="text-muted-foreground text-xs">Temp suspend</p>
              </div>
              <div
                onClick={() => {
                  setIsBanned(true);
                  setIsActive(false);
                }}
                className={`col-span-2 cursor-pointer rounded-xl border p-3 transition-all ${isBanned ? "border-red-400 bg-red-50 shadow-sm" : "bg-muted/30 border-border hover:border-red-300"}`}
              >
                <div className="flex items-center gap-2">
                  <Ban
                    className={`h-5 w-5 ${isBanned ? "text-red-600" : "text-muted-foreground"}`}
                  />
                  <div>
                    <p className="text-sm font-bold">Permanently Banned</p>
                    <p className="text-muted-foreground text-xs">
                      Cannot log in at all — requires ban reason
                    </p>
                  </div>
                </div>
              </div>
            </div>
            {isBanned && (
              <Input
                placeholder="Ban reason (required — shown to user)"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                className="h-11 rounded-xl border-red-200 focus:ring-red-300"
              />
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-foreground text-sm font-bold">
              Roles{" "}
              <span className="text-muted-foreground ml-1 text-xs font-normal">
                Multiple roles allowed
              </span>
            </h3>
            <div className="space-y-2">
              {ALL_ROLES.map((r) => (
                <div
                  key={r.key}
                  onClick={() => toggleRole(r.key)}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all ${roles.includes(r.key) ? "border-[#1A56DB]/30 bg-[#1A56DB]/5 shadow-sm" : "bg-muted/30 border-border hover:border-[#1A56DB]/20"}`}
                >
                  <div
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 ${roles.includes(r.key) ? "border-[#1A56DB] bg-[#1A56DB]" : "border-gray-300"}`}
                  >
                    {roles.includes(r.key) && (
                      <span className="text-xs font-bold text-white">✓</span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      {r.icon} {r.label}
                    </p>
                    <p className="text-muted-foreground text-xs">{r.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-foreground flex items-center gap-2 text-sm font-bold">
              <Wallet className="h-4 w-4 text-amber-600" /> Freeze Wallet
            </h3>
            <div
              onClick={() => toggleService("wallet")}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all ${blockedServices.includes("wallet") ? "border-amber-400 bg-amber-50 shadow-sm" : "bg-muted/30 border-border hover:border-amber-300"}`}
            >
              <div
                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 ${blockedServices.includes("wallet") ? "border-amber-500 bg-amber-500" : "border-gray-300"}`}
              >
                {blockedServices.includes("wallet") && (
                  <span className="text-xs font-bold text-white">✕</span>
                )}
              </div>
              <div className="flex-1">
                <span className="text-sm font-semibold">🔒 Freeze Wallet</span>
                <p className="text-muted-foreground text-xs">
                  Blocks all wallet operations (send, receive, topup, pay)
                </p>
              </div>
              {blockedServices.includes("wallet") && (
                <Badge
                  variant="outline"
                  className="ml-auto border-amber-200 bg-amber-50 text-[10px] text-amber-600"
                >
                  FROZEN
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-foreground flex items-center gap-2 text-sm font-bold">
              Service Restrictions
              <span className="text-muted-foreground text-xs font-normal">
                Checked = blocked for this user
              </span>
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {ALL_SERVICES.map((s) => {
                const isBlocked = blockedServices.includes(s.key);
                return (
                  <div
                    key={s.key}
                    onClick={() => toggleService(s.key)}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all ${isBlocked ? "border-red-300 bg-red-50 shadow-sm" : "bg-muted/30 border-border hover:border-red-200"}`}
                  >
                    <div
                      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 ${isBlocked ? "border-red-500 bg-red-500" : "border-gray-300"}`}
                    >
                      {isBlocked && <span className="text-xs font-bold text-white">✕</span>}
                    </div>
                    <span className="text-sm font-semibold">
                      {s.icon} {s.label}
                    </span>
                    {isBlocked && (
                      <Badge
                        variant="outline"
                        className="ml-auto border-red-200 bg-red-50 text-[10px] text-red-600"
                      >
                        BLOCKED
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-foreground text-sm font-bold">
              Admin Security Note{" "}
              <span className="text-muted-foreground text-xs font-normal">(internal)</span>
            </h3>
            <textarea
              rows={3}
              placeholder="e.g. Suspected fraud — monitor activity. Or: VIP user — do not block."
              value={securityNote}
              onChange={(e) => setSecurityNote(e.target.value)}
              className="border-input bg-background w-full resize-none rounded-xl border px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#1A56DB]/30 focus:outline-none"
            />
          </div>

          {/* ── OTP Tools ── */}
          <div className="overflow-hidden rounded-xl border border-violet-200">
            <div className="flex items-center gap-2 border-b border-violet-200 bg-violet-50 px-4 py-2.5">
              <KeyRound className="h-4 w-4 flex-shrink-0 text-violet-600" />
              <span className="text-sm font-bold text-violet-800">OTP Status</span>
              <span className="ml-4 text-sm font-bold text-violet-800">OTP Tools</span>
              <span className="ml-1 text-xs text-violet-500">
                Admin support — manage bypasses in OTP Control Center
              </span>
            </div>
            <div className="space-y-3 p-3">
              {/* View Current OTP */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-foreground text-sm font-semibold">View Current OTP</p>
                    <p className="text-muted-foreground text-xs">
                      Show live OTP code for troubleshooting
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 rounded-lg border-violet-400 text-xs text-violet-700 hover:bg-violet-50"
                    onClick={handleViewOtp}
                    disabled={otpQuery.isFetching}
                  >
                    {otpQuery.isFetching ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <Eye className="mr-1 h-3 w-3" />
                        View OTP
                      </>
                    )}
                  </Button>
                </div>
                {showOtpData && otpQuery.data && (
                  <div className="space-y-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-violet-700">Phone:</span>
                      {otpQuery.data.phone?.active ? (
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-violet-100 px-2 py-0.5 font-mono text-sm font-bold tracking-widest text-violet-900">
                            {otpQuery.data.phone?.code}
                          </code>
                          <span className="text-[10px] text-violet-500">
                            exp {new Date(otpQuery.data.phone.expiry).toLocaleTimeString()}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">No active OTP</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-violet-700">Email:</span>
                      {otpQuery.data.email?.active ? (
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-violet-100 px-2 py-0.5 font-mono text-sm font-bold tracking-widest text-violet-900">
                            {otpQuery.data.email.code}
                          </code>
                          <span className="text-[10px] text-violet-500">
                            exp {new Date(otpQuery.data.email.expiry).toLocaleTimeString()}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">No active OTP</span>
                      )}
                    </div>
                    <button
                      onClick={() => setShowOtpData(false)}
                      className="text-[10px] text-violet-500 hover:underline"
                    >
                      Hide
                    </button>
                  </div>
                )}
              </div>

              {/* Bypass Status Badge */}
              <div className="border-border/50 flex items-center gap-3 border-t pt-2">
                <div className="flex-1">
                  <p className="text-foreground text-sm font-semibold">OTP Bypass Status</p>
                  {user.otpBypassUntil && new Date(user.otpBypassUntil) > new Date() ? (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-700">
                      <AlertTriangle className="h-3 w-3" />
                      Active — expires {new Date(user.otpBypassUntil).toLocaleTimeString()}
                    </p>
                  ) : (
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      No active bypass — user must verify OTP on login
                    </p>
                  )}
                </div>
                {user.otpBypassUntil && new Date(user.otpBypassUntil) > new Date() ? (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-amber-300 bg-amber-100 text-[10px] font-bold text-amber-700"
                  >
                    BYPASS ACTIVE
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-muted text-muted-foreground border-border shrink-0 text-[10px]"
                  >
                    Normal OTP
                  </Badge>
                )}
              </div>
              <Link
                to="/otp-control"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 transition-colors hover:text-indigo-700 hover:underline"
              >
                <Shield className="h-3.5 w-3.5" />
                Manage in OTP Control Center →
              </Link>

              <div className="border-border/50 space-y-2 border-t pt-2">
                <p className="text-foreground text-sm font-semibold">Manual Verification</p>
                <p className="text-muted-foreground text-xs">
                  Force-mark phone or email as verified
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1 rounded-lg border-emerald-400 text-xs text-emerald-700 hover:bg-emerald-50"
                    onClick={() => handleVerifyContact("phone")}
                    disabled={verifyContact.isPending || !!user.phoneVerified}
                  >
                    {verifyContact.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Phone className="h-3 w-3" />
                    )}
                    {user.phoneVerified ? "Phone ✓" : "Verify Phone"}
                  </Button>
                  {user.email && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1 rounded-lg border-emerald-400 text-xs text-emerald-700 hover:bg-emerald-50"
                      onClick={() => handleVerifyContact("email")}
                      disabled={verifyContact.isPending || !!user.emailVerified}
                    >
                      {verifyContact.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Mail className="h-3 w-3" />
                      )}
                      {user.emailVerified ? "Email ✓" : "Verify Email"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Bypass OTP Controls */}
              <div className="border-border/50 space-y-2 border-t pt-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-foreground text-sm font-semibold">Bypass OTP (Quick-Set)</p>
                    <p className="text-muted-foreground text-xs">
                      Allow login without OTP for a limited window
                    </p>
                  </div>
                  <Select
                    value={String(bypassMinutes)}
                    onValueChange={(v) => setBypassMinutes(Number(v) as 15 | 30 | 60)}
                  >
                    <SelectTrigger className="h-8 w-24 rounded-lg text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 min</SelectItem>
                      <SelectItem value="30">30 min</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                    </SelectContent>
                  </Select>
                  {!bypassActive ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 rounded-lg border-amber-400 text-xs text-amber-700 hover:bg-amber-50"
                      onClick={() => setBypassMutation.mutate(bypassMinutes)}
                      disabled={setBypassMutation.isPending}
                    >
                      {setBypassMutation.isPending ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Enabling...
                        </>
                      ) : (
                        "Enable"
                      )}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 rounded-lg border-red-300 text-xs text-red-700 hover:bg-red-50"
                      onClick={() => cancelBypassMutation.mutate()}
                      disabled={cancelBypassMutation.isPending}
                    >
                      {cancelBypassMutation.isPending ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Cancelling...
                        </>
                      ) : (
                        "Cancel"
                      )}
                    </Button>
                  )}
                </div>
                {bypassActive && bypassUntil && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    <p className="text-xs font-semibold text-amber-800">
                      Bypass active — expires {new Date(bypassUntil).toLocaleTimeString()}
                    </p>
                  </div>
                )}
                {!bypassActive && (
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    No bypass active — user must verify OTP
                  </p>
                )}
                {bypassActive ? (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-amber-300 bg-amber-100 text-[10px] text-amber-700"
                  >
                    ACTIVE
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-green-200 bg-green-50 text-[10px] text-green-700"
                  >
                    NORMAL
                  </Badge>
                )}
                <a
                  href="/admin/otp-control"
                  className="shrink-0 text-xs font-semibold text-indigo-600 underline underline-offset-2 transition-colors hover:text-indigo-800"
                >
                  Manage →
                </a>
              </div>
            </div>
          </div>

          {/* ── Force Password Reset ── */}
          <div
            className={`flex items-center gap-3 rounded-xl border p-3 ${requirePasswordChange ? "border-orange-300 bg-orange-50" : "bg-muted/20 border-border"}`}
          >
            <KeyRound
              className={`h-5 w-5 flex-shrink-0 ${requirePasswordChange ? "text-orange-600" : "text-muted-foreground"}`}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p
                  className={`text-sm font-semibold ${requirePasswordChange ? "text-orange-800" : "text-foreground"}`}
                >
                  Force Password Reset
                </p>
                {requirePasswordChange && (
                  <Badge
                    variant="outline"
                    className="border-orange-300 bg-orange-100 text-[10px] text-orange-700"
                  >
                    RESET REQUIRED
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                User must change password on next login
              </p>
            </div>
            {!requirePasswordChange && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 rounded-lg border-orange-300 text-xs text-orange-700 hover:bg-orange-50"
                onClick={handleForcePasswordReset}
                disabled={forcePasswordReset.isPending}
              >
                {forcePasswordReset.isPending ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    Setting...
                  </>
                ) : (
                  "Force Reset"
                )}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <KeyRound className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">Force Re-Authentication</p>
              <p className="text-xs text-amber-700">
                Clears saved OTP — user must verify phone again
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg border-amber-300 text-xs text-amber-700 hover:bg-amber-100"
              onClick={() =>
                resetOtpMutation.mutate(user.id, {
                  onSuccess: () =>
                    toast({
                      title: "OTP cleared",
                      description: "User must re-authenticate on next login.",
                    }),
                  onError: (e: any) =>
                    toast({ title: "Failed", description: e.message, variant: "destructive" }),
                })
              }
              disabled={resetOtpMutation.isPending}
            >
              {resetOtpMutation.isPending ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Clearing...
                </>
              ) : (
                "Reset OTP"
              )}
            </Button>
          </div>

          {totpEnabled && (
            <div className="flex items-center gap-3 rounded-xl border border-purple-200 bg-purple-50 p-3">
              <Shield className="h-5 w-5 flex-shrink-0 text-purple-600" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-purple-800">Two-Factor Authentication</p>
                <p className="text-xs text-purple-700">
                  User has 2FA enabled — disable only if they lost access
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg border-purple-300 text-xs text-purple-700 hover:bg-purple-100"
                onClick={() => disable2faMutation.mutate()}
                disabled={disable2faMutation.isPending}
              >
                {disable2faMutation.isPending ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    Disabling...
                  </>
                ) : (
                  "Disable 2FA"
                )}
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-foreground flex items-center gap-2 text-sm font-bold">
              <Lock className="h-4 w-4 text-emerald-600" /> MPIN Status
            </h3>
            {(() => {
              const hasMpin = !!(user.hasMpin || user.walletPinHash);
              const isLocked = !!user.isMpinLocked;

              const statusLabel = !hasMpin ? "Not Set" : isLocked ? "Locked" : "Active";
              const statusColor = !hasMpin
                ? "bg-gray-50 border-gray-200"
                : isLocked
                  ? "bg-red-50 border-red-200"
                  : "bg-emerald-50 border-emerald-200";
              const statusTextColor = !hasMpin
                ? "text-gray-600"
                : isLocked
                  ? "text-red-700"
                  : "text-emerald-700";
              const badgeClass = !hasMpin
                ? "bg-gray-100 text-gray-600 border-gray-300"
                : isLocked
                  ? "bg-red-100 text-red-700 border-red-300"
                  : "bg-emerald-100 text-emerald-700 border-emerald-300";

              return (
                <div className={`rounded-xl border p-3 ${statusColor}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Shield className={`h-5 w-5 flex-shrink-0 ${statusTextColor}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-semibold ${statusTextColor}`}>Wallet MPIN</p>
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-bold ${badgeClass}`}
                          >
                            {statusLabel}
                          </Badge>
                        </div>
                        {!hasMpin && (
                          <p className="mt-0.5 text-xs text-gray-500">
                            User has not configured a wallet MPIN yet
                          </p>
                        )}
                        {hasMpin && !isLocked && (
                          <p className="mt-0.5 text-xs text-emerald-600">
                            MPIN is active — reset only if user cannot recover it
                          </p>
                        )}
                        {isLocked && (
                          <p className="mt-0.5 text-xs text-red-600">
                            MPIN is currently locked due to too many failed attempts
                          </p>
                        )}
                      </div>
                    </div>
                    {hasMpin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className={`rounded-lg text-xs ${isLocked ? "border-red-300 text-red-700 hover:bg-red-100" : "border-emerald-300 text-emerald-700 hover:bg-emerald-100"}`}
                        onClick={() => setShowMpinResetConfirm(true)}
                        disabled={resetWalletPinMutation.isPending}
                      >
                        {resetWalletPinMutation.isPending ? (
                          <>
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            Resetting...
                          </>
                        ) : (
                          "Reset MPIN"
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {showMpinResetConfirm && (
            <div className="space-y-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                <div>
                  <p className="text-sm font-bold text-amber-800">Confirm MPIN Reset</p>
                  <p className="mt-1 text-xs text-amber-700">
                    This will clear the user's wallet MPIN. They will need to create a new one
                    before making any wallet transactions that require MPIN verification.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg text-xs"
                  onClick={() => setShowMpinResetConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="rounded-lg bg-red-600 text-xs text-white hover:bg-red-700"
                  onClick={() => {
                    resetWalletPinMutation.mutate();
                    setShowMpinResetConfirm(false);
                  }}
                  disabled={resetWalletPinMutation.isPending}
                >
                  {resetWalletPinMutation.isPending ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    "Yes, Reset MPIN"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ── Active Sessions ── */}
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setShowSessions((v) => !v)}
              className="flex w-full items-center justify-between bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              <span className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-slate-500" /> Active Sessions
              </span>
              <ChevronDown
                className={`h-4 w-4 text-slate-400 transition-transform ${showSessions ? "rotate-180" : ""}`}
              />
            </button>
            {showSessions && (
              <div className="space-y-2 p-3">
                {sessionsLoading && (
                  <p className="text-muted-foreground py-2 text-center text-xs">
                    Loading sessions…
                  </p>
                )}
                {!sessionsLoading &&
                  (!sessionsData?.sessions || sessionsData.sessions.length === 0) && (
                    <p className="text-muted-foreground py-2 text-center text-xs">
                      No active sessions
                    </p>
                  )}
                {!sessionsLoading &&
                  sessionsData?.sessions?.map((s: any) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-700">
                          {s.deviceName ?? s.browser ?? "Unknown device"}
                          {s.os ? ` · ${s.os}` : ""}
                        </p>
                        <p className="text-muted-foreground text-[10px]">
                          {s.ip ?? s.location ?? "—"} ·{" "}
                          {s.lastActiveAt
                            ? new Date(s.lastActiveAt).toLocaleString()
                            : s.createdAt
                              ? new Date(s.createdAt).toLocaleString()
                              : "—"}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 shrink-0 px-2 text-xs text-red-500 hover:bg-red-50 hover:text-red-600"
                        disabled={revokeSession.isPending}
                        onClick={() =>
                          revokeSession.mutate(
                            { userId: user.id, sessionId: s.id },
                            {
                              onSuccess: () => toast({ title: "Session revoked" }),
                              onError: (e: any) =>
                                toast({
                                  title: "Failed",
                                  description: e.message,
                                  variant: "destructive",
                                }),
                            }
                          )
                        }
                      >
                        Revoke
                      </Button>
                    </div>
                  ))}
                {sessionsData?.sessions?.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full rounded-lg border-red-200 text-xs text-red-600 hover:bg-red-50"
                    disabled={revokeAll.isPending}
                    onClick={() =>
                      revokeAll.mutate(user.id, {
                        onSuccess: () =>
                          toast({
                            title: "All sessions revoked",
                            description: "User will be logged out on all devices.",
                          }),
                        onError: (e: any) =>
                          toast({
                            title: "Failed",
                            description: e.message,
                            variant: "destructive",
                          }),
                      })
                    }
                  >
                    {revokeAll.isPending ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Revoking…
                      </>
                    ) : (
                      "Revoke All Sessions"
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>

          {isBanned && !user.isBanned && (
            <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
              <p className="text-xs text-red-700">
                User will be permanently banned and notified via push notification.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={securityMutation.isPending || (isBanned && !banReason)}
              className="flex-1 gap-2 rounded-xl bg-[#1A56DB] hover:bg-[#1A56DB]/90"
            >
              {securityMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {securityMutation.isPending ? "Saving..." : "Save Security"}
            </Button>
          </div>
        </div>
      </MobileDrawer>

      <SensitiveActionDialog
        open={pendingRoleChange}
        onClose={() => setPendingRoleChange(false)}
        onConfirm={performSaveUser}
        title="Confirm Role Change"
        description={`You are changing roles for "${user.name || user.phone}". Role changes affect access permissions. Please verify your identity to proceed.`}
        confirmLabel="Confirm Role Change"
        actionType="change_user_role"
        targetId={user.id}
      />
    </>
  );
}

/* ── KYC Doc Viewer ── */
function parseUserDocuments(user: any): {
  files: { type: string; url: string; label: string }[];
  note?: string;
} {
  const result: { files: { type: string; url: string; label: string }[]; note?: string } = {
    files: [],
  };
  const seenUrls = new Set<string>();
  if (user.vehiclePhoto) {
    result.files.push({ type: "vehicle_photo", url: user.vehiclePhoto, label: "Vehicle Photo" });
    seenUrls.add(user.vehiclePhoto);
  }
  if (user.documents) {
    try {
      const parsed = JSON.parse(user.documents);
      if (parsed.files && Array.isArray(parsed.files)) {
        for (const f of parsed.files) {
          if (f.url && !seenUrls.has(f.url)) {
            const label = DOC_TYPE_LABELS[f.type] || f.label || f.type;
            result.files.push({ type: f.type, url: f.url, label });
            seenUrls.add(f.url);
          }
        }
        if (parsed.note) result.note = parsed.note;
      } else if (Array.isArray(parsed)) {
        for (const f of parsed) {
          if (f.url && !seenUrls.has(f.url)) {
            const label = DOC_TYPE_LABELS[f.type] || f.label || f.type;
            result.files.push({ type: f.type, url: f.url, label });
            seenUrls.add(f.url);
          }
        }
      }
    } catch (err) {
      console.warn("[parseUserDocuments] JSON parse failed:", err);
    }
  }
  return result;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  cnic_front: "CNIC Front",
  cnic_back: "CNIC Back",
  cnic: "CNIC Front",
  driving_license: "Driving License",
  vehicle_photo: "Vehicle Photo",
};

function KycDocModal({ user, onClose }: { user: any; onClose: () => void }) {
  const correctionMutation = useRequestUserCorrection();
  const kycApprove = useAdminKycApprove();
  const kycReject = useAdminKycReject();
  const { toast } = useToast();
  const [corrField, setCorrField] = useState("");
  const [corrNote, setCorrNote] = useState("");
  const [showCorrForm, setShowCorrForm] = useState(false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const { data: kycData, isLoading: kycLoading } = useAdminKycByUserId(user.id);
  const kycRecord = kycData?.records?.[0] ?? null;
  const kycId = kycRecord?.id ?? null;

  const kycPhotos: { label: string; url: string }[] = [];
  if (kycRecord?.frontIdPhoto) kycPhotos.push({ label: "CNIC Front", url: kycRecord.frontIdPhoto });
  if (kycRecord?.backIdPhoto) kycPhotos.push({ label: "CNIC Back", url: kycRecord.backIdPhoto });
  if (kycRecord?.selfiePhoto) kycPhotos.push({ label: "Selfie", url: kycRecord.selfiePhoto });

  // Fall back to legacy documents embedded on the user object when no KYC API record exists
  const legacyDocs = parseUserDocuments(user);
  const docs: { label: string; url: string }[] =
    kycPhotos.length > 0
      ? kycPhotos
      : legacyDocs.files.map((d) => ({ label: d.label, url: d.url }));

  const allChecked = ["cnic_legible", "photo_match", "details_correct", "not_expired"].every(
    (k) => checklist[k]
  );

  const KYC_STATUS_COLORS: Record<string, string> = {
    verified: "bg-emerald-100 text-emerald-700 border-emerald-200",
    approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    rejected: "bg-red-100 text-red-700 border-red-200",
    resubmit: "bg-orange-100 text-orange-700 border-orange-200",
    none: "bg-gray-100 text-gray-600 border-gray-200",
  };

  const handleRequestCorrection = () => {
    if (!user.id) return;
    correctionMutation.mutate(
      { id: user.id, field: corrField || "document", note: corrNote || undefined },
      {
        onSuccess: () => {
          toast({
            title: "Correction requested",
            description: "User will be notified to re-upload.",
          });
          setShowCorrForm(false);
          onClose();
        },
        onError: (e: any) =>
          toast({ title: "Failed", description: e.message, variant: "destructive" }),
      }
    );
  };

  const handleApproveKyc = () => {
    if (!kycId) return;
    kycApprove.mutate(
      { kycId },
      {
        onSuccess: () => {
          toast({
            title: "KYC Approved",
            description: "User's KYC has been verified and account activated.",
          });
          onClose();
        },
        onError: (e: any) =>
          toast({ title: "Approval failed", description: e.message, variant: "destructive" }),
      }
    );
  };

  const handleRejectKyc = () => {
    if (!kycId || !rejectReason.trim()) return;
    kycReject.mutate(
      { kycId, reason: rejectReason.trim() },
      {
        onSuccess: () => {
          toast({ title: "KYC Rejected", description: "User has been notified." });
          setShowRejectInput(false);
          onClose();
        },
        onError: (e: any) =>
          toast({ title: "Rejection failed", description: e.message, variant: "destructive" }),
      }
    );
  };

  const toggleCheck = (key: string) => setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <MobileDrawer
      open
      onClose={onClose}
      title={
        <>
          <FileText className="h-5 w-5 text-indigo-600" /> KYC Documents — {user.name || user.phone}
        </>
      }
      dialogClassName="w-[95vw] max-w-2xl max-h-[85dvh] overflow-y-auto rounded-2xl"
    >
      {/* KYC Record Info */}
      {kycLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-[#1A56DB]" />
          <span className="text-muted-foreground ml-2 text-sm">Loading KYC record…</span>
        </div>
      ) : kycRecord ? (
        <div className="mt-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={`text-xs font-semibold capitalize ${KYC_STATUS_COLORS[kycRecord.status] || KYC_STATUS_COLORS.none}`}
            >
              KYC: {kycRecord.status}
            </Badge>
            {kycRecord.cnic && (
              <div className="flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs">
                <span className="text-muted-foreground font-semibold">CNIC:</span>
                <span className="font-mono">{kycRecord.cnic}</span>
              </div>
            )}
            {kycRecord.fullName && (
              <div className="flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs">
                <span className="text-muted-foreground font-semibold">Name:</span>
                <span>{kycRecord.fullName}</span>
              </div>
            )}
            {kycRecord.dateOfBirth && (
              <div className="flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs">
                <span className="text-muted-foreground font-semibold">DOB:</span>
                <span>{kycRecord.dateOfBirth}</span>
              </div>
            )}
            {kycRecord.city && (
              <div className="flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs">
                <span className="text-muted-foreground font-semibold">City:</span>
                <span>{kycRecord.city}</span>
              </div>
            )}
          </div>
          {kycRecord.rejectionReason && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              <span className="font-bold">Rejected reason:</span> {kycRecord.rejectionReason}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5 text-xs">
            <span className="text-muted-foreground font-semibold">KYC Status:</span>
            <span className="font-semibold text-amber-600">{user.kycStatus || "none"}</span>
          </div>
          {user.cnic && (
            <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5 text-xs">
              <span className="text-muted-foreground font-semibold">CNIC:</span>
              <span className="font-mono">{user.cnic}</span>
            </div>
          )}
        </div>
      )}

      {docs.length === 0 ? (
        <div className="text-muted-foreground mt-3 py-8 text-center text-sm">
          <FileText className="mx-auto mb-2 h-10 w-10 opacity-30" />
          No KYC documents submitted yet.
        </div>
      ) : (
        <>
          <div className="mt-3 mb-1 flex items-center justify-between">
            <p className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
              Documents ({docs.length})
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {docs.map((doc, i) => (
              <div key={`${doc.label}-${i}`} className="group space-y-1">
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  {doc.label}
                </p>
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-border/50 relative block overflow-hidden rounded-xl border"
                >
                  <SafeImage
                    src={doc.url}
                    alt={doc.label}
                    className="h-32 w-full object-cover transition-opacity group-hover:opacity-80"
                  />
                  <span className="absolute right-1.5 bottom-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                    Click to zoom
                  </span>
                </a>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 space-y-2">
        <p className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
          Verification Checklist
        </p>
        {[
          { key: "cnic_legible", label: "CNIC is legible and valid" },
          { key: "photo_match", label: "Photo matches ID / person" },
          { key: "details_correct", label: "Name, DOB, and details are correct" },
          { key: "not_expired", label: "Documents are not expired" },
        ].map((item) => (
          <label key={item.key} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!checklist[item.key]}
              onChange={() => toggleCheck(item.key)}
              className="h-4 w-4 rounded accent-green-600"
            />
            <span className={checklist[item.key] ? "font-medium text-green-700" : ""}>
              {item.label}
            </span>
          </label>
        ))}
        {allChecked && (
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> All checks passed — ready to approve
          </p>
        )}
      </div>

      {/* No KYC record found — always show this notice when the API has no record */}
      {!kycLoading && !kycRecord && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-amber-800">No KYC record on file</p>
            <p className="text-xs text-amber-700">
              {user.kycStatus === "pending" || user.approvalStatus === "pending"
                ? "User's status is pending but no KYC submission was found. They may have submitted via the legacy upload flow. Use the Approve / Reject buttons in the Pending Approvals section to act on this account."
                : "This user has not submitted a KYC application through the system yet. KYC Approve / Reject is unavailable until they submit."}
            </p>
          </div>
        </div>
      )}

      {/* KYC Approve / Reject actions (only when a pending KYC record exists) */}
      {kycId && kycRecord?.status === "pending" && (
        <div className="mt-4 space-y-3">
          <p className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
            KYC Decision
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleApproveKyc}
              disabled={kycApprove.isPending || !allChecked}
              className="h-9 flex-1 gap-1 rounded-xl bg-emerald-600 text-xs text-white hover:bg-emerald-700"
            >
              {kycApprove.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Approve KYC
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowRejectInput((v) => !v)}
              disabled={kycReject.isPending}
              className="h-9 flex-1 gap-1 rounded-xl border-red-200 text-xs text-red-600 hover:bg-red-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject KYC
            </Button>
          </div>
          {!allChecked && (
            <p className="text-xs text-amber-600 italic">
              Complete all checklist items above to enable approval.
            </p>
          )}
          {showRejectInput && (
            <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-bold text-red-800">Rejection Reason (required)</p>
              <Input
                placeholder="e.g. CNIC blurry, photo doesn't match, expired document..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="h-9 rounded-lg border-red-200 text-sm"
              />
              <Button
                size="sm"
                onClick={handleRejectKyc}
                disabled={!rejectReason.trim() || kycReject.isPending}
                className="h-9 w-full rounded-lg bg-red-600 text-xs text-white hover:bg-red-700"
              >
                {kycReject.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Confirm Rejection
              </Button>
            </div>
          )}
        </div>
      )}

      {!showCorrForm ? (
        <button
          onClick={() => setShowCorrForm(true)}
          className="mt-4 flex items-center gap-1 text-xs font-semibold text-amber-600 hover:underline"
        >
          <AlertCircle className="h-3.5 w-3.5" /> Request document correction
        </button>
      ) : (
        <div className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-bold text-amber-800">Request Correction</p>
          <select
            value={corrField}
            onChange={(e) => setCorrField(e.target.value)}
            className="border-input bg-background h-9 w-full rounded-lg border px-3 text-sm"
          >
            <option value="">Select document</option>
            <option value="cnic_front">CNIC Front</option>
            <option value="cnic_back">CNIC Back</option>
            <option value="driving_license">Driving License</option>
            <option value="vehicle_photo">Vehicle Photo</option>
            <option value="all">All Documents</option>
          </select>
          <Input
            placeholder="Note to user (e.g., photo is blurry, CNIC not readable)..."
            value={corrNote}
            onChange={(e) => setCorrNote(e.target.value)}
            className="h-9 rounded-lg text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowCorrForm(false)}
              className="border-border/50 h-9 flex-1 rounded-lg border text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleRequestCorrection}
              disabled={correctionMutation.isPending}
              className="h-9 flex-1 rounded-lg bg-amber-500 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-60"
            >
              {correctionMutation.isPending ? "Sending..." : "Send Request"}
            </button>
          </div>
        </div>
      )}
    </MobileDrawer>
  );
}

function AddressBookModal({ user, onClose }: { user: any; onClose: () => void }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-user-addresses", user.id],
    queryFn: () => adminFetch(`/users/${user.id}/addresses`),
  });
  const addresses = data?.addresses || [];

  return (
    <MobileDrawer
      open
      onClose={onClose}
      title={
        <>
          <MapPin className="h-5 w-5 text-teal-600" /> Addresses — {user.name || user.phone}
        </>
      }
      dialogClassName="w-[95vw] max-w-lg max-h-[85dvh] overflow-y-auto rounded-2xl"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-red-500">
          <AlertTriangle className="h-8 w-8" />
          <p className="text-sm font-medium">Failed to load addresses</p>
          <p className="text-muted-foreground text-center text-xs">
            {(error as Error)?.message || "Something went wrong. Please try again."}
          </p>
        </div>
      ) : addresses.length === 0 ? (
        <div className="text-muted-foreground py-10 text-center">
          <MapPin className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm">No saved addresses</p>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          {addresses.map((addr: any) => (
            <div
              key={addr.id}
              className={`rounded-xl border p-3 ${addr.isDefault ? "border-teal-300 bg-teal-50" : "border-border bg-muted/20"}`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-foreground text-sm font-bold">{addr.label}</span>
                {addr.isDefault && (
                  <Badge
                    variant="outline"
                    className="border-teal-200 bg-teal-50 text-[10px] text-teal-600"
                  >
                    DEFAULT
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-sm">{addr.address}</p>
              <p className="text-muted-foreground mt-1 text-xs">{addr.city}</p>
            </div>
          ))}
        </div>
      )}
    </MobileDrawer>
  );
}

/* ══════════ Main Users Page ══════════ */

export default function Users() {
  const [, navigate] = useLocation();
  const { logout } = useAdminAuth();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const [conditionTier, setConditionTier] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;
  const [sortKey, setSortKey] = useState<UserSortKey>("joined");
  const [sortDir, setSortDir] = useState<UserSortDir>("desc");
  const handleUserSort = (key: UserSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };
  const [lastRefreshed, setLastRefreshed] = useState<number>(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    setCurrentPage(1);
  }, [conditionTier, statusFilter, debouncedSearch, roleFilter, dateFrom, dateTo]);
  const { data, isLoading, refetch, isFetching, isError, error } = useUsers({
    conditionTier: conditionTier !== "all" ? conditionTier : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    search: debouncedSearch || undefined,
    role: roleFilter !== "all" ? roleFilter : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page: currentPage,
    limit: PAGE_SIZE,
    sortKey,
    sortDir,
  });
  useEffect(() => {
    if (!isLoading && data) setLastRefreshed(Date.now());
  }, [data, isLoading]);
  const { data: pendingData, refetch: refetchPending } = usePendingUsers();
  const updateMutation = useUpdateUser();
  const securityUpdateMutation = useUpdateUserSecurity();
  const deleteMutation = useDeleteUser();
  const approveMutation = useApproveUser();
  const rejectMutation = useRejectUser();
  const bulkBanMutation = useBulkBanUsers();
  const { toast } = useToast();
  const qc = useQueryClient();
  const waiveDebtMutation = useWaiveDebt();

  const [waiveDebtTarget, setWaiveDebtTarget] = useState<any>(null);
  const [walletUser, setWalletUser] = useState<any>(null);
  const [deleteUser, setDeleteUser] = useState<any>(null);
  const [pendingBlockToggle, setPendingBlockToggle] = useState<{ id: string; val: boolean } | null>(
    null
  );
  const [activityUser, setActivityUser] = useState<any>(null);
  const [securityUser, setSecurityUser] = useState<any>(null);
  const [rejectUser, setRejectUser] = useState<any>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [kycUser, setKycUser] = useState<any>(null);
  const [addressUser, setAddressUser] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [bulkConfirmAction, setBulkConfirmAction] = useState<"ban" | "unban" | null>(null);
  const [bulkReason, setBulkReason] = useState("");
  const exportUsers = useExportUsers();

  useEffect(() => {
    const handler = () => setCreateUserOpen(true);
    window.addEventListener("admin:new-item", handler);
    return () => window.removeEventListener("admin:new-item", handler);
  }, []);

  const pendingUsers = pendingData?.users || [];

  const handleApprove = (userId: string) => {
    approveMutation.mutate(
      { id: userId },
      {
        onSuccess: () => {
          toast({ title: "User approved!", description: "User can now log in." });
        },
        onError: (err) =>
          toast({ title: "Failed to approve", description: err.message, variant: "destructive" }),
      }
    );
  };

  const handleReject = () => {
    if (!rejectUser) return;
    rejectMutation.mutate(
      { id: rejectUser.id, note: rejectNote || "Rejected by admin" },
      {
        onSuccess: () => {
          toast({ title: "User rejected", description: "Account rejected and user notified." });
          setRejectUser(null);
          setRejectNote("");
        },
        onError: (err) =>
          toast({ title: "Failed to reject", description: err.message, variant: "destructive" }),
      }
    );
  };

  const _handleUpdate = (id: string, updates: any) => {
    updateMutation.mutate(
      { id, ...updates },
      {
        onSuccess: () => {
          if (updates.isActive === true)
            toast({ title: "User unblocked", description: "Account has been re-activated." });
          else if (updates.isActive === false)
            toast({ title: "User blocked", description: "Account has been deactivated." });
          else toast({ title: "User updated" });
        },
        onError: (err) =>
          toast({ title: "Update failed", description: err.message, variant: "destructive" }),
      }
    );
  };

  const handleDelete = () => {
    if (!deleteUser) return;
    deleteMutation.mutate(deleteUser.id, {
      onSuccess: () => {
        toast({ title: "User deleted" });
        setDeleteUser(null);
      },
      onError: (err) =>
        toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
    });
  };

  const users = data?.users || [];

  const bannedCount = data?.bannedCount ?? users.filter((u: any) => u.isBanned).length;
  const blockedCount =
    data?.blockedCount ?? users.filter((u: any) => !u.isActive && !u.isBanned).length;
  const activeCount =
    data?.activeCount ?? users.filter((u: any) => u.isActive && !u.isBanned).length;
  const totalCount = data?.totalCount ?? data?.total ?? users.length;

  const allSelected = users.length > 0 && users.every((u: any) => selectedIds.has(u.id));
  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(users.map((u: any) => u.id)));
    }
  };

  const handleBulkBan = (action: "ban" | "unban") => {
    setBulkReason("");
    setBulkConfirmAction(action);
  };

  const executeBulkBan = () => {
    const ids = Array.from(selectedIds);
    if (!ids.length || !bulkConfirmAction) return;
    bulkBanMutation.mutate(
      { ids, action: bulkConfirmAction, reason: bulkReason || undefined },
      {
        onSuccess: (d: any) => {
          toast({
            title: `${bulkConfirmAction === "ban" ? "Banned" : "Unbanned"} ${d.affected} user(s)`,
          });
          setSelectedIds(new Set());
          setBulkConfirmAction(null);
          setBulkReason("");
        },
        onError: (e) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
      }
    );
  };

  const handleExportSelected = () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    exportUsers.mutate(
      { ids },
      {
        onSuccess: () => toast({ title: `Exported ${ids.length} user(s)` }),
      }
    );
  };

  const handleExportWithFilters = () => {
    exportUsers.mutate(
      {
        role: roleFilter !== "all" ? roleFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        search: debouncedSearch || undefined,
        conditionTier: conditionTier !== "all" ? conditionTier : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      },
      {
        onSuccess: () => toast({ title: "Export downloaded" }),
      }
    );
  };

  const handlePullRefresh = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin-users"] }),
      qc.invalidateQueries({ queryKey: ["admin-users-pending"] }),
    ]);
  }, [qc]);

  return (
    <ErrorBoundary
      fallback={
        <div className="p-8 text-center text-sm text-red-500">
          Users page crashed. Please reload.
        </div>
      }
    >
      <PullToRefresh onRefresh={handlePullRefresh} className="space-y-6">
        <PageHeader
          icon={UsersIcon}
          title="Users"
          subtitle={`${totalCount} total${activeCount > 0 ? ` · ${activeCount} active` : ""}${bannedCount > 0 ? ` · ${bannedCount} banned` : ""}${blockedCount > 0 ? ` · ${blockedCount} blocked` : ""}`}
          iconBgClass="bg-blue-100"
          iconColorClass="text-blue-600"
          actions={
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportWithFilters}
                  disabled={exportUsers.isPending}
                  className="h-9 gap-2 rounded-xl"
                >
                  {exportUsers.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}{" "}
                  Export with Filters
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="h-9 gap-2 rounded-xl"
                >
                  <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
                </Button>
              </div>
              <LastUpdated
                dataUpdatedAt={lastRefreshed}
                onRefresh={refetch}
                isRefreshing={isFetching}
              />
            </div>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {isLoading ? (
            [1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <StatCard
                icon={UsersIcon}
                label="Total Users"
                value={totalCount}
                iconBgClass="bg-blue-100"
                iconColorClass="text-blue-600"
              />
              <StatCard
                icon={CheckCircle2}
                label="Active"
                value={activeCount}
                iconBgClass="bg-green-100"
                iconColorClass="text-green-600"
              />
              <StatCard
                icon={Ban}
                label="Banned"
                value={bannedCount}
                iconBgClass="bg-red-100"
                iconColorClass="text-red-600"
              />
              <StatCard
                icon={AlertTriangle}
                label="Blocked"
                value={blockedCount}
                iconBgClass="bg-amber-100"
                iconColorClass="text-amber-600"
              />
            </>
          )}
        </div>

        {pendingUsers.length > 0 && (
          <Card className="rounded-2xl border-amber-200 bg-amber-50/60 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                <h3 className="text-sm font-semibold text-amber-800">
                  Pending Approval ({pendingUsers.length})
                </h3>
                <span className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs text-amber-600">
                  Action Required
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetchPending()}
                className="h-7 text-xs text-amber-700 hover:bg-amber-100"
              >
                {T("refresh")}
              </Button>
            </div>
            <div className="space-y-2">
              {pendingUsers.map((u: any) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between rounded-xl border border-amber-100 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-700">
                      {(u.name || u.phone || "U")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-foreground truncate text-sm font-semibold">
                        {u.name || "New User"}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-muted-foreground font-mono text-xs">{u.phone}</p>
                        {u.email && <p className="text-muted-foreground text-xs">· {u.email}</p>}
                        <Badge
                          variant="outline"
                          className={`border px-1.5 text-[10px] capitalize ${ROLE_COLORS[u.role] || ROLE_COLORS.customer}`}
                        >
                          {u.role || "customer"}
                        </Badge>
                        {(() => {
                          const d = parseUserDocuments(u);
                          return d.files.length > 0 ? (
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${d.files.length >= 4 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}
                            >
                              {d.files.length} doc{d.files.length !== 1 ? "s" : ""}
                            </span>
                          ) : (
                            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                              No docs
                            </span>
                          );
                        })()}
                        {(() => {
                          const d = parseUserDocuments(u);
                          return d.note ? (
                            <MessageSquare className="h-3 w-3 text-blue-500" />
                          ) : null;
                        })()}
                        <p className="text-xs text-amber-600">{formatDate(u.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="ml-4 flex flex-shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setKycUser(u)}
                      className="h-8 gap-1 rounded-lg border-blue-200 px-3 text-xs text-blue-600 hover:bg-blue-50"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Documents
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleApprove(u.id)}
                      disabled={approveMutation.isPending}
                      className="h-8 gap-1 rounded-lg bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRejectUser(u);
                        setRejectNote("");
                      }}
                      disabled={rejectMutation.isPending}
                      className="h-8 gap-1 rounded-lg border-red-200 px-3 text-xs text-red-600 hover:bg-red-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {rejectUser && (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open) {
                setRejectUser(null);
                setRejectNote("");
              }
            }}
          >
            <DialogContent className="max-w-sm rounded-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600">
                  <XCircle className="h-5 w-5" /> Reject User
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-muted-foreground text-sm">
                  Are you sure you want to reject{" "}
                  <strong>{rejectUser.name || rejectUser.phone}</strong>? They will not be able to
                  log in.
                </p>
                <div>
                  <label className="text-muted-foreground mb-1.5 block text-xs font-semibold tracking-wider uppercase">
                    Rejection Reason (optional)
                  </label>
                  <textarea
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="e.g. Documents incomplete, suspicious activity..."
                    rows={3}
                    className="border-input bg-background focus:ring-ring w-full resize-none rounded-xl border px-3 py-2.5 text-sm focus:ring-2 focus:outline-none"
                  />
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-xl"
                    onClick={() => {
                      setRejectUser(null);
                      setRejectNote("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleReject}
                    disabled={rejectMutation.isPending}
                    className="flex-1 gap-2 rounded-xl bg-red-600 text-white hover:bg-red-700"
                  >
                    {rejectMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    {rejectMutation.isPending ? "Rejecting..." : "Confirm Reject"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        <Card className="border-border/50 space-y-3 rounded-2xl p-4 shadow-sm">
          <div className="flex flex-col gap-2">
            <ActionBar
              primary={
                <Button
                  size="sm"
                  onClick={() => setCreateUserOpen(true)}
                  className="h-10 gap-2 rounded-xl bg-[#1A56DB] px-4 font-semibold text-white hover:bg-[#1A56DB]/90"
                >
                  <UserPlus className="h-4 w-4" /> Create User
                </Button>
              }
            />
            <FilterBar
              search={search}
              onSearch={setSearch}
              placeholder="Search by name, phone, or email..."
              filters={
                <>
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="bg-muted/30 border-border/50 h-10 w-full rounded-xl sm:w-40">
                      <SelectValue placeholder="All Roles" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="rider">Rider</SelectItem>
                      <SelectItem value="vendor">Vendor</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="bg-muted/30 border-border/50 h-10 w-full rounded-xl sm:w-44">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                      <SelectItem value="banned">Banned</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={conditionTier} onValueChange={setConditionTier}>
                    <SelectTrigger className="bg-muted/30 border-border/50 h-10 w-full rounded-xl sm:w-48">
                      <SelectValue placeholder="Condition Tier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Conditions</SelectItem>
                      <SelectItem value="clean">Clean (No Conditions)</SelectItem>
                      <SelectItem value="has_conditions">Has Conditions</SelectItem>
                      <SelectItem value="warnings">Warnings</SelectItem>
                      <SelectItem value="restrictions">Restrictions</SelectItem>
                      <SelectItem value="suspensions">Suspensions</SelectItem>
                      <SelectItem value="bans">Bans</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              }
            />
          </div>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <div className="flex flex-1 items-center gap-2">
              <CalendarDays className="text-muted-foreground h-4 w-4 shrink-0" />
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-muted/30 border-border/50 h-9 rounded-xl text-sm"
              />
              <span className="text-muted-foreground text-xs">to</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-muted/30 border-border/50 h-9 rounded-xl text-sm"
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                  }}
                  className="shrink-0 text-xs text-[#1A56DB] hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
            {/* Bulk actions */}
            {selectedIds.size > 0 && (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#1A56DB]/20 bg-[#1A56DB]/10 px-2.5 py-1 text-xs font-bold text-[#1A56DB]">
                  {selectedIds.size} selected
                </span>
                <button
                  onClick={() => handleBulkBan("ban")}
                  disabled={bulkBanMutation.isPending}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700 transition-colors hover:bg-red-200 disabled:opacity-60"
                >
                  <Ban className="h-3 w-3" /> Ban All
                </button>
                <button
                  onClick={() => handleBulkBan("unban")}
                  disabled={bulkBanMutation.isPending}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-200 disabled:opacity-60"
                >
                  <CheckCircle2 className="h-3 w-3" /> Unban All
                </button>
                <button
                  onClick={handleExportSelected}
                  disabled={exportUsers.isPending}
                  className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-100 px-3 py-1.5 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-200 disabled:opacity-60"
                >
                  {exportUsers.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}{" "}
                  Export Selected
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-muted-foreground hover:text-foreground px-1 text-xs transition-colors"
                >
                  Deselect
                </button>
              </div>
            )}
          </div>
        </Card>

        {isError ? (
          <Card className="rounded-2xl border-red-200 bg-red-50/60 p-8 shadow-sm">
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-red-800">Failed to load users</p>
                <p className="mt-1 text-sm text-red-600">
                  {(error as Error)?.message || "Something went wrong. Please retry or re-login."}
                </p>
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  className="rounded-xl border-red-200 text-red-700 hover:bg-red-100"
                >
                  <RefreshCw className="mr-2 h-4 w-4" /> Retry
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await logout();
                    } finally {
                      window.location.href =
                        (import.meta.env.BASE_URL?.replace(/\/$/, "") || "") + "/login";
                    }
                  }}
                  className="rounded-xl border-red-200 text-red-700 hover:bg-red-100"
                >
                  Re-Login
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="space-y-3 md:hidden">
              {isLoading ? (
                [1, 2, 3].map((i) => (
                  <div key={i} className="bg-muted h-20 animate-pulse rounded-2xl" />
                ))
              ) : users.length === 0 ? (
                <Card className="border-border/50 rounded-2xl p-12 text-center">
                  <UsersIcon className="text-muted-foreground/30 mx-auto mb-2 h-10 w-10" />
                  <p className="text-muted-foreground text-sm">No users found</p>
                </Card>
              ) : (
                users.map((user: any) => {
                  const userRoles = normalizeRoles(user.roles || user.role);
                  const isBanned = user.isBanned;
                  const isBlocked = !user.isActive && !isBanned;
                  return (
                    <Card
                      key={user.id}
                      className={`border-border/50 rounded-2xl p-4 shadow-sm ${isBanned ? "border-red-200/60 bg-red-50/30" : isBlocked ? "border-amber-200/60 bg-amber-50/30" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${isBanned ? "bg-red-100 text-red-600" : isBlocked ? "bg-amber-100 text-amber-600" : "bg-[#1A56DB]/10 text-[#1A56DB]"}`}
                        >
                          {(user.name || user.phone || "U")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-foreground truncate font-semibold">
                              {user.name || user.phone}
                            </p>
                            {isBanned && <StatusBadge status="banned" size="xs" />}
                            {isBlocked && <StatusBadge status="blocked" size="xs" />}
                          </div>
                          <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                            {user.phone}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {userRoles.map((r: string) => (
                              <Badge
                                key={r}
                                variant="outline"
                                className={`border px-1.5 text-[10px] capitalize ${ROLE_COLORS[r] || "border-gray-200 bg-gray-100 text-gray-700"}`}
                              >
                                {r}
                              </Badge>
                            ))}
                            <span className="text-muted-foreground text-xs">
                              {formatCurrency(user.walletBalance)}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setKycUser(user)}
                            className="h-8 rounded-lg border-purple-200 px-2.5 text-xs text-purple-700"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSecurityUser(user)}
                            className="h-8 rounded-lg border-slate-200 px-2.5 text-xs text-slate-600"
                          >
                            <Shield className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/account-conditions?userId=${user.id}`)}
                            className="h-8 gap-1 rounded-lg border-violet-200 px-2.5 text-xs text-violet-600"
                            title="Conditions"
                          >
                            <Gavel className="h-3.5 w-3.5" />
                            {user.conditionCount > 0 && (
                              <span className="min-w-[18px] rounded-full bg-violet-100 px-1.5 text-center text-[10px] font-bold text-violet-700">
                                {user.conditionCount}
                              </span>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setWalletUser(user)}
                            className="h-8 rounded-lg border-emerald-200 px-2.5 text-xs text-emerald-700"
                          >
                            <Wallet className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>

            {/* Desktop table */}
            <Card className="border-border/50 hidden overflow-hidden rounded-2xl shadow-sm md:block">
              <div className="overflow-x-auto">
                <Table className="min-w-[820px]">
                  <TableHeader>
                    <TableRow className="border-b border-blue-100 bg-gradient-to-r from-[#1A56DB]/5 to-blue-50/50">
                      <TableHead className="w-8 px-3">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          className="h-4 w-4 rounded"
                        />
                      </TableHead>
                      <TableHead className="font-semibold text-[#1A56DB]/80">
                        <UserSortBtn
                          label="User"
                          col="name"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={handleUserSort}
                        />
                      </TableHead>
                      <TableHead className="font-semibold text-[#1A56DB]/80">Phone</TableHead>
                      <TableHead className="font-semibold text-[#1A56DB]/80">Roles</TableHead>
                      <TableHead className="text-center font-semibold text-[#1A56DB]/80">
                        KYC
                      </TableHead>
                      <TableHead className="text-right font-semibold text-[#1A56DB]/80">
                        <UserSortBtn
                          label="Wallet"
                          col="wallet"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={handleUserSort}
                        />
                      </TableHead>
                      <TableHead className="text-center font-semibold text-[#1A56DB]/80">
                        <UserSortBtn
                          label="Status"
                          col="status"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={handleUserSort}
                        />
                      </TableHead>
                      <TableHead className="text-right font-semibold text-[#1A56DB]/80">
                        <UserSortBtn
                          label="Joined"
                          col="joined"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={handleUserSort}
                        />
                      </TableHead>
                      <TableHead className="text-right font-semibold text-[#1A56DB]/80">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <>
                        <SkeletonRow />
                        <SkeletonRow />
                        <SkeletonRow />
                        <SkeletonRow />
                        <SkeletonRow />
                      </>
                    ) : users.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="h-40">
                          <div className="flex flex-col items-center justify-center gap-2 text-center">
                            <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
                              <UsersIcon className="text-muted-foreground h-6 w-6" />
                            </div>
                            <p className="text-muted-foreground font-medium">No users found</p>
                            {(search ||
                              roleFilter !== "all" ||
                              statusFilter !== "all" ||
                              conditionTier !== "all" ||
                              dateFrom ||
                              dateTo) && (
                              <p className="text-muted-foreground text-xs">
                                Try adjusting your filters
                              </p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      users.map((user: any) => {
                        const userRoles = normalizeRoles(user.roles || user.role);
                        const isBanned = user.isBanned;
                        const isBlocked = !user.isActive && !isBanned;
                        const isChecked = selectedIds.has(user.id);
                        return (
                          <TableRow
                            key={user.id}
                            className={`hover:bg-muted/40 transition-colors ${isBanned ? "bg-red-50/40" : isBlocked ? "bg-amber-50/40" : ""} ${isChecked ? "bg-blue-50/40" : ""}`}
                          >
                            <TableCell className="px-3">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const s = new Set(selectedIds);
                                  e.target.checked ? s.add(user.id) : s.delete(user.id);
                                  setSelectedIds(s);
                                }}
                                className="h-4 w-4 rounded"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div
                                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${isBanned ? "bg-red-100 text-red-600" : isBlocked ? "bg-amber-100 text-amber-600" : "bg-[#1A56DB]/10 text-[#1A56DB]"}`}
                                >
                                  {(user.name || user.phone || "U")[0].toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-foreground truncate font-semibold">
                                      {user.name || user.phone}
                                    </p>
                                    {isBanned && <StatusBadge status="banned" size="xs" />}
                                    {isBlocked && <StatusBadge status="blocked" size="xs" />}
                                    {(user.blockedServices || "")
                                      .split(",")
                                      .map((s: string) => s.trim())
                                      .includes("wallet") && (
                                      <Badge
                                        variant="outline"
                                        className="border-amber-200 bg-amber-50 px-1 text-[9px] text-amber-600"
                                      >
                                        🔒 Wallet
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-muted-foreground font-mono text-xs">
                                      {user.id.slice(-8).toUpperCase()}
                                    </p>
                                    {user.username && (
                                      <span className="flex items-center gap-0.5 font-mono text-[10px] text-violet-600">
                                        @{user.username}
                                      </span>
                                    )}
                                    {user.email && (
                                      <span className="flex max-w-[140px] items-center gap-0.5 truncate text-[10px] text-blue-600">
                                        <Mail className="h-2.5 w-2.5 flex-shrink-0" />
                                        {user.email}
                                      </span>
                                    )}
                                    {user.city && (
                                      <span className="flex items-center gap-0.5 text-[10px] text-[#1A56DB]">
                                        <MapPin className="h-2.5 w-2.5" />
                                        {user.city}
                                      </span>
                                    )}
                                    {userRoles.includes("rider") &&
                                      user.riderProfile?.vehiclePlate && (
                                        <span className="rounded bg-emerald-100 px-1.5 font-mono text-[10px] font-bold text-emerald-700">
                                          {user.riderProfile?.vehiclePlate}
                                        </span>
                                      )}
                                    {userRoles.includes("vendor") &&
                                      user.vendorProfile?.businessType && (
                                        <span className="text-[10px] text-orange-600 capitalize">
                                          {user.vendorProfile?.businessType}
                                        </span>
                                      )}
                                    {user.cnic && (
                                      <span className="flex items-center gap-0.5 text-[10px] text-amber-700">
                                        <CreditCard className="h-2.5 w-2.5" />
                                        ID✓
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm font-medium">{user.phone}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {userRoles.map((r: string) => (
                                  <Badge
                                    key={r}
                                    variant="outline"
                                    className={`border px-1.5 py-0.5 text-[10px] capitalize ${ROLE_COLORS[r] || "border-gray-200 bg-gray-100 text-gray-700"}`}
                                  >
                                    {r}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              {(() => {
                                const ks = (
                                  user.kycStatus ||
                                  user.approvalStatus ||
                                  "none"
                                ).toLowerCase();
                                const kycBadgeClass: Record<string, string> = {
                                  verified: "bg-emerald-50 text-emerald-700 border-emerald-200",
                                  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
                                  pending: "bg-amber-50 text-amber-700 border-amber-200",
                                  rejected: "bg-red-50 text-red-700 border-red-200",
                                  resubmit: "bg-orange-50 text-orange-700 border-orange-200",
                                  none: "bg-gray-50 text-gray-500 border-gray-200",
                                };
                                return (
                                  <Badge
                                    variant="outline"
                                    className={`px-1.5 py-0 text-[10px] font-semibold capitalize ${kycBadgeClass[ks] || kycBadgeClass.none}`}
                                  >
                                    {ks === "none" ? "—" : ks}
                                  </Badge>
                                );
                              })()}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-foreground font-bold">
                                {formatCurrency(user.walletBalance)}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex flex-col items-center gap-1">
                                {isBanned ? (
                                  <StatusBadge status="banned" size="xs" />
                                ) : (
                                  <div className="flex items-center justify-center gap-2">
                                    <Switch
                                      checked={user.isActive}
                                      onCheckedChange={(val) => {
                                        setPendingBlockToggle({ id: user.id, val });
                                      }}
                                    />
                                    {user.isActive ? (
                                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-red-400" />
                                    )}
                                  </div>
                                )}
                                {user.conditionCount > 0 && (
                                  <Badge
                                    variant="outline"
                                    className={`px-1.5 py-0 text-[10px] ${
                                      user.maxConditionSeverity === "ban"
                                        ? "border-red-200 bg-red-50 text-red-600"
                                        : user.maxConditionSeverity === "suspension"
                                          ? "border-orange-200 bg-orange-50 text-orange-600"
                                          : user.maxConditionSeverity === "restriction_normal" ||
                                              user.maxConditionSeverity === "restriction_strict"
                                            ? "border-amber-200 bg-amber-50 text-amber-600"
                                            : "border-yellow-200 bg-yellow-50 text-yellow-600"
                                    }`}
                                  >
                                    {user.conditionCount}{" "}
                                    {user.maxConditionSeverity === "restriction_normal"
                                      ? "restriction"
                                      : user.maxConditionSeverity === "restriction_strict"
                                        ? "strict restriction"
                                        : user.maxConditionSeverity}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-right text-sm">
                              {formatDate(user.createdAt)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setKycUser(user)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border-purple-200 p-0 text-purple-700 transition-colors hover:border-purple-300 hover:bg-purple-50"
                                  title="KYC Docs"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSecurityUser(user)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border-slate-200 p-0 text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
                                  title="Security Settings"
                                >
                                  <Shield className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => navigate(`/account-conditions?userId=${user.id}`)}
                                  className="flex h-8 items-center justify-center gap-1 rounded-lg border-violet-200 px-2 text-violet-600 transition-colors hover:border-violet-300 hover:bg-violet-50"
                                  title="Conditions"
                                >
                                  <Gavel className="h-3.5 w-3.5" />
                                  {user.conditionCount > 0 && (
                                    <span className="min-w-[18px] rounded-full bg-violet-100 px-1.5 text-center text-[10px] font-bold text-violet-700">
                                      {user.conditionCount}
                                    </span>
                                  )}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setAddressUser(user)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border-teal-200 p-0 text-teal-600 transition-colors hover:border-teal-300 hover:bg-teal-50"
                                  title="Addresses"
                                >
                                  <MapPin className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setActivityUser(user)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border-[#1A56DB]/20 p-0 text-[#1A56DB] transition-colors hover:border-[#1A56DB]/30 hover:bg-[#1A56DB]/5"
                                  title="Activity"
                                >
                                  <Activity className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setWalletUser(user)}
                                  className="h-8 gap-1.5 rounded-lg border-emerald-200 text-xs text-emerald-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50"
                                >
                                  <Wallet className="h-3.5 w-3.5" /> Top Up
                                </Button>
                                {parseFloat(user.cancellationDebt || "0") > 0 && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setWaiveDebtTarget(user)}
                                    disabled={waiveDebtMutation.isPending}
                                    className="h-8 gap-1.5 rounded-lg border-orange-200 text-xs text-orange-700 transition-colors hover:border-orange-300 hover:bg-orange-50"
                                    title={`Waive Rs. ${parseFloat(user.cancellationDebt).toFixed(0)} debt`}
                                  >
                                    <span className="text-xs">⚡</span> Waive Debt
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setDeleteUser(user)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border-red-200 p-0 text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              {!isLoading && (
                <div className="border-border/50 bg-muted/20 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
                  <p className="text-muted-foreground text-xs">
                    {users.length > 0 ? (
                      <>
                        Showing{" "}
                        <span className="text-foreground font-semibold">
                          {(currentPage - 1) * PAGE_SIZE + 1}–
                          {(currentPage - 1) * PAGE_SIZE + users.length}
                        </span>{" "}
                        of{" "}
                        <span className="text-foreground font-semibold">
                          {data?.total ?? users.length}
                        </span>{" "}
                        users
                        {data?.totalCount && data.totalCount !== (data?.total ?? 0)
                          ? ` (${data.totalCount} total)`
                          : ""}
                      </>
                    ) : (
                      "No users found"
                    )}
                  </p>
                  {(data?.total ?? 0) > PAGE_SIZE && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage <= 1 || isFetching}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="h-8 gap-1 rounded-lg px-3 text-xs"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" /> Previous
                      </Button>
                      <span className="text-muted-foreground text-xs">
                        Page <span className="text-foreground font-semibold">{currentPage}</span> of{" "}
                        <span className="text-foreground font-semibold">
                          {Math.ceil((data?.total ?? 0) / PAGE_SIZE)}
                        </span>
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          currentPage >= Math.ceil((data?.total ?? 0) / PAGE_SIZE) || isFetching
                        }
                        onClick={() => setCurrentPage((p) => p + 1)}
                        className="h-8 gap-1 rounded-lg px-3 text-xs"
                      >
                        Next <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </>
        )}

        {walletUser &&
          (() => {
            const walletUserRoles = new Set([
              ...normalizeRoles(walletUser.roles || walletUser.role),
            ]);
            const walletMode = walletUserRoles.has("rider")
              ? "rider"
              : walletUserRoles.has("vendor")
                ? "vendor"
                : "customer";
            return (
              <WalletAdjustModal
                mode={walletMode}
                subject={{
                  id: walletUser.id,
                  name: walletUser.name,
                  phone: walletUser.phone,
                  walletBalance: Number(walletUser.walletBalance) || 0,
                }}
                onClose={() => setWalletUser(null)}
              />
            );
          })()}

        {/* Waive Debt Confirmation Dialog */}
        <Dialog
          open={!!waiveDebtTarget}
          onOpenChange={(open) => {
            if (!open) setWaiveDebtTarget(null);
          }}
        >
          <DialogContent className="max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-orange-600">
                <span>⚡</span> Waive Cancellation Debt
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                This will permanently waive{" "}
                <span className="text-foreground font-semibold">
                  {formatCurrency(parseFloat(waiveDebtTarget?.cancellationDebt || "0"))}
                </span>{" "}
                of cancellation debt for{" "}
                <span className="text-foreground font-semibold">
                  {waiveDebtTarget?.name || waiveDebtTarget?.phone}
                </span>
                . This cannot be undone.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => setWaiveDebtTarget(null)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={waiveDebtMutation.isPending}
                  onClick={() => {
                    const user = waiveDebtTarget;
                    waiveDebtMutation.mutate(user.id, {
                      onSuccess: (data: any) => {
                        toast({
                          title: "Debt Waived",
                          description: `${formatCurrency(Number(data?.waived?.toFixed(0) || parseFloat(user.cancellationDebt || "0")))} cancellation debt cleared.`,
                        });
                        setWaiveDebtTarget(null);
                      },
                      onError: (e: any) =>
                        toast({ title: "Error", description: e.message, variant: "destructive" }),
                    });
                  }}
                  className="flex-1 gap-2 rounded-xl bg-orange-600 text-white hover:bg-orange-700"
                >
                  {waiveDebtMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span>⚡</span>
                  )}
                  {waiveDebtMutation.isPending ? "Waiving..." : "Confirm Waive"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Bulk Ban/Unban Confirmation Dialog */}
        <Dialog
          open={!!bulkConfirmAction}
          onOpenChange={(open) => {
            if (!open) {
              setBulkConfirmAction(null);
              setBulkReason("");
            }
          }}
        >
          <DialogContent className="max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle
                className={`flex items-center gap-2 ${bulkConfirmAction === "ban" ? "text-red-600" : "text-emerald-600"}`}
              >
                {bulkConfirmAction === "ban" ? (
                  <Ban className="h-5 w-5" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
                {bulkConfirmAction === "ban" ? "Ban" : "Unban"} {selectedIds.size} User
                {selectedIds.size !== 1 ? "s" : ""}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                {bulkConfirmAction === "ban"
                  ? `This will permanently ban ${selectedIds.size} selected user${selectedIds.size !== 1 ? "s" : ""}. They will not be able to log in.`
                  : `This will lift bans for ${selectedIds.size} selected user${selectedIds.size !== 1 ? "s" : ""}.`}
              </p>
              <div>
                <label className="text-muted-foreground mb-1.5 block text-xs font-semibold tracking-wider uppercase">
                  Reason{" "}
                  <span className="font-normal normal-case">
                    {bulkConfirmAction === "ban" ? "(recommended)" : "(optional)"}
                  </span>
                </label>
                <Input
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  placeholder={
                    bulkConfirmAction === "ban"
                      ? "e.g. Suspicious activity, fraud..."
                      : "e.g. Appeal approved..."
                  }
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => {
                    setBulkConfirmAction(null);
                    setBulkReason("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={executeBulkBan}
                  disabled={bulkBanMutation.isPending}
                  className={`flex-1 gap-2 rounded-xl text-white ${bulkConfirmAction === "ban" ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
                >
                  {bulkBanMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : bulkConfirmAction === "ban" ? (
                    <Ban className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {bulkBanMutation.isPending
                    ? "Processing..."
                    : bulkConfirmAction === "ban"
                      ? "Confirm Ban"
                      : "Confirm Unban"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <SensitiveActionDialog
          open={!!deleteUser}
          onClose={() => setDeleteUser(null)}
          onConfirm={handleDelete}
          title="Delete User"
          description={`Are you sure you want to permanently delete "${deleteUser?.name || deleteUser?.phone}"? This cannot be undone.`}
          confirmLabel="Delete User"
          actionType="delete_user"
          targetId={deleteUser?.id}
        />

        <SensitiveActionDialog
          open={!!pendingBlockToggle}
          onClose={() => setPendingBlockToggle(null)}
          onConfirm={() => {
            if (!pendingBlockToggle) return;
            const { id, val } = pendingBlockToggle;
            securityUpdateMutation.mutate(
              { id, isActive: val },
              {
                onSuccess: () => {
                  if (val)
                    toast({
                      title: "User unblocked",
                      description: "Account has been re-activated.",
                    });
                  else
                    toast({ title: "User blocked", description: "Account has been deactivated." });
                },
                onError: (err: Error) =>
                  toast({
                    title: "Update failed",
                    description: err.message,
                    variant: "destructive",
                  }),
              }
            );
          }}
          title={pendingBlockToggle?.val ? "Unblock User" : "Block User"}
          description={
            pendingBlockToggle?.val
              ? "This will re-activate the user's account. Confirm your identity to proceed."
              : "This will deactivate the user's account and prevent them from logging in. Confirm your identity to proceed."
          }
          confirmLabel={pendingBlockToggle?.val ? "Unblock User" : "Block User"}
          actionType={pendingBlockToggle?.val ? "unblock_user" : "block_user"}
          targetId={pendingBlockToggle?.id}
        />

        {activityUser && (
          <UserActivityModal
            userId={activityUser.id}
            userName={activityUser.name || activityUser.phone}
            user={activityUser}
            onClose={() => setActivityUser(null)}
          />
        )}

        {securityUser && (
          <SecurityModal user={securityUser} onClose={() => setSecurityUser(null)} />
        )}

        {/* KYC Document Modal */}
        {kycUser && <KycDocModal user={kycUser} onClose={() => setKycUser(null)} />}

        {addressUser && (
          <AddressBookModal user={addressUser} onClose={() => setAddressUser(null)} />
        )}

        <CreateUserDialog open={createUserOpen} onClose={() => setCreateUserOpen(false)} />
      </PullToRefresh>
    </ErrorBoundary>
  );
}
