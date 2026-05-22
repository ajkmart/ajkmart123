import { useToast } from "@/hooks/use-toast";
import { useErrorHandler } from "@/hooks/useErrorHandler";
import { adminAbsoluteFetch, adminFetch, fetchAdminAbsoluteResponse } from "@/lib/adminFetcher";
import { parseApiError } from "@/lib/errorParser";
import { createLogger } from "@/lib/logger";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
const log = createLogger("[admin]");

const REFETCH_INTERVAL = 30_000;
const RIDES_REFETCH_INTERVAL = 5_000;

// Auth
export const useAdminLogin = () => {
  return useMutation({
    mutationFn: (creds: { username: string; password: string }) =>
      adminFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: creds.username,
          password: creds.password,
        }),
      }),
  });
};

// Dashboard Stats
export const useStats = () => {
  const { toast } = useToast();
  const query = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => adminFetch("/stats"),
    refetchInterval: REFETCH_INTERVAL,
    staleTime: 30_000,
  });
  useEffect(() => {
    if (query.isError) {
      toast({
        title: "Failed to load stats",
        description: (query.error as any)?.message || "Unable to fetch admin statistics",
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isError]);
  return query;
};

// Users
export const useUsers = (params?: {
  conditionTier?: string;
  status?: string;
  search?: string;
  role?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  sortKey?: string;
  sortDir?: string;
}) => {
  const {
    conditionTier,
    status,
    search,
    role,
    dateFrom,
    dateTo,
    page = 1,
    limit = 50,
    sortKey,
    sortDir,
  } = params ?? {};
  const { toast } = useToast();
  const qs = new URLSearchParams();
  if (conditionTier) qs.set("conditionTier", conditionTier);
  if (status && status !== "all") qs.set("status", status);
  if (search) qs.set("search", search);
  if (role && role !== "all") qs.set("role", role);
  if (dateFrom) qs.set("dateFrom", dateFrom);
  if (dateTo) qs.set("dateTo", dateTo);
  qs.set("page", String(page));
  qs.set("limit", String(limit));
  if (sortKey) qs.set("sortKey", sortKey);
  if (sortDir) qs.set("sortDir", sortDir);
  const qsStr = qs.toString();
  const query = useQuery({
    queryKey: [
      "admin-users",
      conditionTier || "",
      status || "",
      search || "",
      role || "",
      dateFrom || "",
      dateTo || "",
      page,
      limit,
      sortKey || "",
      sortDir || "",
    ],
    queryFn: () => adminFetch(`/users${qsStr ? `?${qsStr}` : ""}`),
    refetchInterval: REFETCH_INTERVAL,
  });
  useEffect(() => {
    if (query.isError) {
      toast({
        title: "Failed to load users",
        description: (query.error as any)?.message || "Unable to fetch user list",
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isError]);
  return query;
};

export const useSearchRiders = (q: string, onlineOnly = true) => {
  const { toast } = useToast();
  const query = useQuery({
    queryKey: ["admin-search-riders", q, onlineOnly],
    queryFn: () =>
      adminFetch(
        `/users/search-riders?q=${encodeURIComponent(q)}&limit=20&onlineOnly=${onlineOnly}`
      ),
    enabled: true,
    staleTime: 10_000,
  });
  useEffect(() => {
    if (query.isError) {
      toast({
        title: "Failed to search riders",
        description: (query.error as any)?.message || "Unable to search for riders",
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isError]);
  return query;
};

export const usePendingUsers = () => {
  const { toast } = useToast();
  const query = useQuery({
    queryKey: ["admin-users-pending"],
    queryFn: () => adminFetch("/users/pending"),
    refetchInterval: 15_000,
  });
  useEffect(() => {
    if (query.isError) {
      toast({
        title: "Failed to load pending users",
        description: (query.error as any)?.message || "Unable to fetch pending user approvals",
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isError]);
  return query;
};

/** Snapshot all matching cache entries for a query key prefix, for rollback. */
function snapshotQueries(queryClient: ReturnType<typeof useQueryClient>, queryKey: unknown[]) {
  const snapshots: { queryKey: unknown[]; data: unknown }[] = [];
  queryClient.getQueriesData({ queryKey, exact: false }).forEach(([key, data]) => {
    snapshots.push({ queryKey: key as unknown[], data });
  });
  return snapshots;
}

/** Restore snapshots captured by snapshotQueries. */
function restoreSnapshots(
  queryClient: ReturnType<typeof useQueryClient>,
  snapshots: { queryKey: unknown[]; data: unknown }[]
) {
  for (const { queryKey, data } of snapshots) {
    queryClient.setQueryData(queryKey, data);
  }
}

/** Remove a user by id from a cache entry that may be an array or { users: [...] }. */
function removeUserFromCache(old: unknown, id: string): unknown {
  if (Array.isArray(old)) return old.filter((u: any) => u.id !== id);
  const cache = old as Record<string, unknown> | undefined;
  if (cache && Array.isArray(cache["users"])) {
    return { ...cache, users: (cache["users"] as any[]).filter((u: any) => u.id !== id) };
  }
  return old;
}

export const useApproveUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      adminFetch(`/users/${id}/approve`, { method: "POST", body: JSON.stringify({ note }) }),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["admin-users-pending"] });
      await queryClient.cancelQueries({ queryKey: ["admin-users"] });
      const prevPending = snapshotQueries(queryClient, ["admin-users-pending"]);
      const prevUsers = snapshotQueries(queryClient, ["admin-users"]);
      queryClient.setQueriesData({ queryKey: ["admin-users-pending"], exact: false }, (old) =>
        removeUserFromCache(old, id)
      );
      queryClient.setQueriesData({ queryKey: ["admin-users"], exact: false }, (old) => {
        if (Array.isArray(old))
          return old.map((u: any) =>
            u.id === id ? { ...u, status: "active", isVerified: true, isApproved: true } : u
          );
        const cache = old as Record<string, unknown> | undefined;
        if (cache && Array.isArray(cache["users"])) {
          return {
            ...cache,
            users: (cache["users"] as any[]).map((u: any) =>
              u.id === id ? { ...u, status: "active", isVerified: true, isApproved: true } : u
            ),
          };
        }
        return old;
      });
      return { prevPending, prevUsers };
    },
    onError: (_err, _vars, context) => {
      if (context?.prevPending) restoreSnapshots(queryClient, context.prevPending);
      if (context?.prevUsers) restoreSnapshots(queryClient, context.prevUsers);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-users-pending"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-riders"] });
    },
  });
};

export const useRejectUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      adminFetch(`/users/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) }),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["admin-users-pending"] });
      await queryClient.cancelQueries({ queryKey: ["admin-users"] });
      const prevPending = snapshotQueries(queryClient, ["admin-users-pending"]);
      const prevUsers = snapshotQueries(queryClient, ["admin-users"]);
      queryClient.setQueriesData({ queryKey: ["admin-users-pending"], exact: false }, (old) =>
        removeUserFromCache(old, id)
      );
      queryClient.setQueriesData({ queryKey: ["admin-users"], exact: false }, (old) => {
        if (Array.isArray(old))
          return old.map((u: any) => (u.id === id ? { ...u, status: "rejected" } : u));
        const cache = old as Record<string, unknown> | undefined;
        if (cache && Array.isArray(cache["users"])) {
          return {
            ...cache,
            users: (cache["users"] as any[]).map((u: any) =>
              u.id === id ? { ...u, status: "rejected" } : u
            ),
          };
        }
        return old;
      });
      return { prevPending, prevUsers };
    },
    onError: (_err, _vars, context) => {
      if (context?.prevPending) restoreSnapshots(queryClient, context.prevPending);
      if (context?.prevUsers) restoreSnapshots(queryClient, context.prevUsers);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-users-pending"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-riders"] });
    },
  });
};

export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      role?: string;
      isActive?: boolean;
      walletBalance?: string | number;
    }) =>
      adminFetch(`/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"], exact: false });
      void queryClient.invalidateQueries({ queryKey: ["admin-transactions"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update user",
        description: error?.message || "Unable to update user information",
        variant: "destructive",
      });
    },
  });
};

export const useUpdateUserSecurity = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      isActive?: boolean;
      isBanned?: boolean;
      banReason?: string | null;
      roles?: string;
      blockedServices?: string;
      securityNote?: string | null;
      notify?: boolean;
    }) =>
      adminFetch(`/users/${id}/security`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"], exact: false });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update user security",
        description: error?.message || "Unable to update user security settings",
        variant: "destructive",
      });
    },
  });
};

export const useWalletTopup = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({
      id,
      amount,
      description,
    }: {
      id: string;
      amount: number;
      description?: string;
    }) =>
      adminFetch(`/users/${id}/wallet-topup`, {
        method: "POST",
        body: JSON.stringify({ amount, description }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (error: unknown) => {
      toast({
        title: "Failed to topup wallet",
        description: parseApiError(error),
        variant: "destructive",
      });
    },
  });
};

// Orders
export const useOrders = () => {
  const { toast } = useToast();
  const query = useQuery({
    queryKey: ["admin-orders"],
    queryFn: () => adminFetch("/orders"),
    refetchInterval: REFETCH_INTERVAL,
  });
  useEffect(() => {
    if (query.isError) {
      toast({
        title: "Failed to load orders",
        description: (query.error as any)?.message || "Unable to fetch orders",
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isError]);
  return query;
};

export const useUpdateOrder = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminFetch(`/orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["admin-orders-enriched"] });
      const previousQueries: { queryKey: unknown[]; data: unknown }[] = [];
      queryClient.getQueriesData({ queryKey: ["admin-orders-enriched"] }).forEach(([key, data]) => {
        previousQueries.push({ queryKey: key as unknown[], data });
      });
      type OrdersCacheEntry = { orders: Array<Record<string, unknown>> } & Record<string, unknown>;
      queryClient.setQueriesData(
        { queryKey: ["admin-orders-enriched"], exact: false },
        (old: unknown) => {
          const cache = old as OrdersCacheEntry | undefined;
          if (!cache?.orders) return old;
          return {
            ...cache,
            orders: cache.orders.map((o) =>
              o["id"] === variables.id
                ? { ...o, status: variables.status, updatedAt: new Date().toISOString() }
                : o
            ),
          };
        }
      );
      return { previousQueries };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousQueries) {
        for (const { queryKey, data } of context.previousQueries) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      toast({
        title: "Failed to update order",
        description: (_err as any)?.message || "Unable to update order status",
        variant: "destructive",
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-orders-enriched"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-orders-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });
};

// Rides
export const useRides = () => {
  const { toast } = useToast();
  const query = useQuery({
    queryKey: ["admin-rides"],
    queryFn: () => adminFetch("/rides"),
    refetchInterval: RIDES_REFETCH_INTERVAL,
  });
  useEffect(() => {
    if (query.isError) {
      toast({
        title: "Failed to load rides",
        description: (query.error as any)?.message || "Unable to fetch rides",
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isError]);
  return query;
};

export const useUpdateRide = () => {
  const queryClient = useQueryClient();
  const { onError: handleUpdateRideError } = useErrorHandler({ title: "Failed to update ride" });
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({
      id,
      status,
      riderName,
      riderPhone,
    }: {
      id: string;
      status: string;
      riderName?: string;
      riderPhone?: string;
    }) =>
      adminFetch(`/rides/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, riderName, riderPhone }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-rides"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-rides-enriched"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (error: any) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-rides-enriched"] });
      handleUpdateRideError(error);
      toast({ title: "Failed to update ride", description: error.message, variant: "destructive" });
      log.error("update ride status failed:", error.message || error);
    },
  });
};

// Pharmacy Orders
export const usePharmacyOrders = () => {
  const { toast } = useToast();
  const query = useQuery({
    queryKey: ["admin-pharmacy"],
    queryFn: () => adminFetch("/pharmacy-enriched"),
    refetchInterval: REFETCH_INTERVAL,
  });
  useEffect(() => {
    if (query.isError) {
      toast({
        title: "Failed to load pharmacy orders",
        description: (query.error as any)?.message || "Unable to fetch pharmacy orders",
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isError]);
  return query;
};

export const useUpdatePharmacyOrder = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminFetch(`/pharmacy-orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-pharmacy"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update pharmacy order",
        description: error?.message || "Unable to update pharmacy order status",
        variant: "destructive",
      });
    },
  });
};

// Parcel Bookings
export const useParcelBookings = () => {
  const { toast } = useToast();
  const query = useQuery({
    queryKey: ["admin-parcel"],
    queryFn: () => adminFetch("/parcel-enriched"),
    refetchInterval: REFETCH_INTERVAL,
  });
  useEffect(() => {
    if (query.isError) {
      toast({
        title: "Failed to load parcel bookings",
        description: (query.error as any)?.message || "Unable to fetch parcel bookings",
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isError]);
  return query;
};

export const useUpdateParcelBooking = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminFetch(`/parcel-bookings/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-parcel"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update parcel booking",
        description: error?.message || "Unable to update parcel booking status",
        variant: "destructive",
      });
    },
  });
};

export interface AdminUser {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  username: string | null;
  roles: string[];
  walletBalance: number;
  isActive: boolean;
  isBanned: boolean;
  banReason: string | null;
  approvalStatus: string | null;
  cnic: string | null;
  city: string | null;
  area: string | null;
  address: string | null;
  hasMpin: boolean;
  isMpinLocked: boolean;
  riderProfile: {
    vehicleType: string | null;
    vehiclePlate: string | null;
    drivingLicense: string | null;
    vehicleRegNo: string | null;
    documents: unknown;
  } | null;
  vendorProfile: {
    storeName: string | null;
    businessType: string | null;
    businessName: string | null;
    ntn: string | null;
    storeCategory: string | null;
    storeIsOpen: boolean | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  name?: string;
  phone?: string;
  email?: string;
  username?: string;
  tempPassword?: string;
  role?: "customer" | "rider" | "vendor";
  city?: string;
  area?: string;
}

// Create User
export const useCreateUser = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (data: CreateUserInput) =>
      adminFetch("/users", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create user",
        description: error?.message || "Unable to create new user",
        variant: "destructive",
      });
    },
  });
};

export const useUpdateUserIdentity = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      phone?: string;
      email?: string;
      username?: string;
    }) =>
      adminFetch(`/users/${id}/identity`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"], exact: false });
      toast({ title: "Identity updated", description: "User identity fields saved successfully." });
    },
    onError: (error: any) => {
      toast({
        title: "Identity update failed",
        description: error?.message || "Unable to update user identity",
        variant: "destructive",
      });
    },
  });
};

export const useDisable2FA = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (userId: string) =>
      adminFetch(`/users/${userId}/2fa/disable`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"], exact: false });
      toast({
        title: "2FA disabled",
        description: "Two-factor authentication has been turned off for this user.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to disable 2FA",
        description: error?.message || "Unable to disable two-factor authentication",
        variant: "destructive",
      });
    },
  });
};

export const useResetWalletPin = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (userId: string) =>
      adminFetch(`/users/${userId}/reset-wallet-pin`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"], exact: false });
      toast({
        title: "MPIN reset",
        description: "User's wallet MPIN has been cleared. They will need to create a new one.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to reset MPIN",
        description: error?.message || "Unable to reset wallet PIN",
        variant: "destructive",
      });
    },
  });
};

export interface ExportUsersInput {
  ids?: string[];
  role?: string;
  status?: string;
  search?: string;
  conditionTier?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const useExportUsers = () => {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (params: ExportUsersInput) => {
      const res = await fetchAdminAbsoluteResponse("/api/admin/users/export", {
        method: "POST",
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "Export failed");
        throw new Error(text || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("content-disposition") || "";
      const match = cd.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] ?? `users-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    onError: (error: any) => {
      toast({
        title: "Export failed",
        description: error?.message || "Unable to export users",
        variant: "destructive",
      });
    },
  });
};

// Waive Debt
export const useWaiveDebt = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (userId: string) => adminFetch(`/users/${userId}/waive-debt`, { method: "PATCH" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"], exact: false });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to waive debt",
        description: error?.message || "Unable to waive user debt",
        variant: "destructive",
      });
    },
  });
};

// Delete User
export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => adminFetch(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"], exact: false });
      void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete user",
        description: error?.message || "Unable to delete user",
        variant: "destructive",
      });
    },
  });
};

// User Activity
export const useUserActivity = (userId: string | null) => {
  const { toast } = useToast();
  const query = useQuery({
    queryKey: ["admin-user-activity", userId],
    queryFn: () => adminFetch(`/users/${userId}/activity`),
    enabled: !!userId,
  });
  useEffect(() => {
    if (query.isError) {
      toast({
        title: "Failed to load user activity",
        description: (query.error as any)?.message || "Unable to fetch user activity",
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isError]);
  return query;
};

// Products
export const useCategories = () => {
  const { toast } = useToast();
  const query = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const json = await adminAbsoluteFetch("/api/categories");
      const payload = json.data ?? json;
      const list = (Array.isArray(payload) ? payload : (payload.categories ?? [])) as Array<
        Record<string, unknown>
      >;
      return list.map((c) => ({
        id: String(c["id"] ?? c.id),
        name: String(c["name"] ?? c.name),
        icon: (c["icon"] ?? c.icon) != null ? String(c["icon"] ?? c.icon) : undefined,
      })) as { id: string; name: string; icon?: string }[];
    },
    staleTime: 5 * 60 * 1000,
  });
  useEffect(() => {
    if (query.isError) {
      toast({
        title: "Failed to load categories",
        description: (query.error as any)?.message || "Unable to fetch categories",
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isError]);
  return query;
};

export const useProducts = () => {
  const { toast } = useToast();
  const query = useQuery({
    queryKey: ["admin-products"],
    queryFn: () => adminFetch("/products"),
    refetchInterval: REFETCH_INTERVAL,
  });
  useEffect(() => {
    if (query.isError) {
      toast({
        title: "Failed to load products",
        description: (query.error as any)?.message || "Unable to fetch products",
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isError]);
  return query;
};

export const useCreateProduct = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      adminFetch("/products", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create product",
        description: error?.message || "Unable to create product",
        variant: "destructive",
      });
    },
  });
};

export const useUpdateProduct = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      adminFetch(`/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-products"] }),
    onError: (error: any) => {
      toast({
        title: "Failed to update product",
        description: error?.message || "Unable to update product",
        variant: "destructive",
      });
    },
  });
};

export const useDeleteProduct = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/products/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete product",
        description: error?.message || "Unable to delete product",
        variant: "destructive",
      });
    },
  });
};

export const usePendingProducts = () => {
  const { toast } = useToast();
  const query = useQuery({
    queryKey: ["admin-products-pending"],
    queryFn: () => adminFetch("/products/pending"),
    refetchInterval: 30_000,
  });
  useEffect(() => {
    if (query.isError) {
      toast({
        title: "Failed to load pending products",
        description: (query.error as any)?.message || "Unable to fetch pending products",
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isError]);
  return query;
};

export const useApproveProduct = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      adminFetch(`/products/${id}/approve`, { method: "PATCH", body: JSON.stringify({ note }) }),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: ["admin-products-pending"] });
      await qc.cancelQueries({ queryKey: ["admin-products"] });
      const prevPending = snapshotQueries(qc, ["admin-products-pending"]);
      const prevProducts = snapshotQueries(qc, ["admin-products"]);
      const removeProd = (old: unknown) => {
        if (Array.isArray(old)) return old.filter((p: any) => p.id !== id);
        const cache = old as Record<string, unknown> | undefined;
        if (cache && Array.isArray(cache["products"])) {
          return {
            ...cache,
            products: (cache["products"] as any[]).filter((p: any) => p.id !== id),
          };
        }
        return old;
      };
      qc.setQueriesData({ queryKey: ["admin-products-pending"], exact: false }, removeProd);
      qc.setQueriesData({ queryKey: ["admin-products"], exact: false }, (old) => {
        if (Array.isArray(old))
          return old.map((p: any) =>
            p.id === id ? { ...p, status: "approved", isApproved: true } : p
          );
        const cache = old as Record<string, unknown> | undefined;
        if (cache && Array.isArray(cache["products"])) {
          return {
            ...cache,
            products: (cache["products"] as any[]).map((p: any) =>
              p.id === id ? { ...p, status: "approved", isApproved: true } : p
            ),
          };
        }
        return old;
      });
      return { prevPending, prevProducts };
    },
    onError: (_err, _vars, context) => {
      if (context?.prevPending) restoreSnapshots(qc, context.prevPending);
      if (context?.prevProducts) restoreSnapshots(qc, context.prevProducts);
      toast({
        title: "Failed to approve product",
        description: (_err as any)?.message || "Unable to approve product",
        variant: "destructive",
      });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["admin-products-pending"] });
      void qc.invalidateQueries({ queryKey: ["admin-products"] });
    },
  });
};

export const useRejectProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminFetch(`/products/${id}/reject`, { method: "PATCH", body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-products-pending"] });
      void qc.invalidateQueries({ queryKey: ["admin-products"] });
    },
  });
};

export const useProductStockHistory = (
  productId: string | null,
  filters?: { vendorId?: string; from?: string; to?: string }
) => {
  const params = new URLSearchParams();
  if (filters?.vendorId) params.set("vendorId", filters.vendorId);
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  const qs = params.toString();
  return useQuery({
    queryKey: ["admin-stock-history", productId, filters],
    queryFn: () => adminFetch(`/products/${productId}/stock-history${qs ? `?${qs}` : ""}`),
    enabled: !!productId,
    staleTime: 30_000,
  });
};

export const useOrderRefund = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount, reason }: { id: string; amount?: number; reason?: string }) =>
      adminFetch(`/orders/${id}/refund`, {
        method: "POST",
        body: JSON.stringify({ amount, reason }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-orders-enriched"] });
      void qc.invalidateQueries({ queryKey: ["admin-transactions"] });
      void qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });
};

type BroadcastInput = {
  title: string;
  body: string;
  targetRole?: string | string[];
  userId?: string | null;
};

export const useBroadcast = () => {
  return useMutation({
    mutationFn: (data: BroadcastInput) =>
      adminFetch("/broadcast", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  });
};

/**
 * Estimated recipient count for a broadcast.
 * Pass `targetRole = "all"` (or empty string) to count every active user.
 * Pass an array of roles to count the union of users who hold any of them.
 */
export const useBroadcastRecipientCount = (targetRole: string | string[] | undefined) => {
  const roles = Array.isArray(targetRole)
    ? targetRole.filter(Boolean)
    : targetRole && targetRole !== "all"
      ? [targetRole]
      : [];
  const queryParam = roles.length > 0 ? `?targetRole=${encodeURIComponent(roles.join(","))}` : "";
  return useQuery({
    queryKey: ["admin-broadcast-recipient-count", roles.join(",") || "all"],
    queryFn: () =>
      adminFetch(`/broadcast/recipients/count${queryParam}`) as Promise<{
        count: number;
        targetRoles: string[];
      }>,
    refetchInterval: REFETCH_INTERVAL,
    staleTime: 10_000,
  });
};

// Transactions (enriched with user names)
export const useTransactions = () => {
  return useQuery({
    queryKey: ["admin-transactions"],
    queryFn: () => adminFetch("/transactions-enriched"),
    refetchInterval: REFETCH_INTERVAL,
  });
};

// Enriched endpoints (orders + user info)
export interface OrdersEnrichedFilters {
  status?: string;
  type?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: string;
}

function buildOrderParams(filters?: OrdersEnrichedFilters): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.type && filters.type !== "all") params.set("type", filters.type);
  if (filters.search) params.set("search", filters.search);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortDir) params.set("sortDir", filters.sortDir);
  return params.toString();
}

export const useOrdersEnriched = (filters?: OrdersEnrichedFilters) => {
  const qs = buildOrderParams(filters);
  const url = qs ? `/orders-enriched?${qs}` : "/orders-enriched";

  return useQuery({
    queryKey: [
      "admin-orders-enriched",
      filters?.status,
      filters?.type,
      filters?.search,
      filters?.dateFrom,
      filters?.dateTo,
      filters?.page,
      filters?.limit,
      filters?.sortBy,
      filters?.sortDir,
    ],
    queryFn: () => adminFetch(url),
    refetchInterval: REFETCH_INTERVAL,
  });
};

export const useOrdersStats = () => {
  return useQuery({
    queryKey: ["admin-orders-stats"],
    queryFn: () => adminFetch("/orders-stats"),
    refetchInterval: REFETCH_INTERVAL,
  });
};

export const fetchOrdersExport = async (filters?: OrdersEnrichedFilters): Promise<any> => {
  const qs = buildOrderParams(filters);
  const url = qs ? `/orders-export?${qs}` : "/orders-export";
  return adminFetch(url);
};

export const useRidesEnriched = (params?: {
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
  search?: string;
  customer?: string;
  rider?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: string;
}) => {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.type && params.type !== "all") qs.set("type", params.type);
  if (params?.search) qs.set("search", params.search);
  if (params?.customer) qs.set("customer", params.customer);
  if (params?.rider) qs.set("rider", params.rider);
  if (params?.dateFrom) qs.set("dateFrom", params.dateFrom);
  if (params?.dateTo) qs.set("dateTo", params.dateTo);
  if (params?.sortBy) qs.set("sortBy", params.sortBy);
  if (params?.sortDir) qs.set("sortDir", params.sortDir);
  const query = qs.toString();
  return useQuery({
    queryKey: [
      "admin-rides-enriched",
      params?.page ?? 1,
      params?.limit ?? 50,
      params?.status ?? "all",
      params?.type ?? "all",
      params?.search ?? "",
      params?.customer ?? "",
      params?.rider ?? "",
      params?.dateFrom ?? "",
      params?.dateTo ?? "",
      params?.sortBy ?? "date",
      params?.sortDir ?? "desc",
    ],
    queryFn: () => adminFetch(query ? `/rides-enriched?${query}` : "/rides-enriched"),
    refetchInterval: RIDES_REFETCH_INTERVAL,
  });
};

// Health Dashboard
export const useHealthDashboard = () => {
  return useQuery({
    queryKey: ["admin-health-dashboard"],
    queryFn: () => adminFetch("/system/health-dashboard"),
    refetchInterval: 10_000,
    staleTime: 8_000,
  });
};

// Lightweight public /api/health poller — no auth required
export interface ApiHealthData {
  status: "ok" | "degraded" | "down";
  db: "ok" | "error";
  redis: "ok" | "error" | "disabled";
  dbQueryMs: number | null;
  p95Ms: number | null;
  memoryPct: number | null;
  uptime: number;
  timestamp: string;
}
export const useApiHealth = () => {
  return useQuery<ApiHealthData>({
    queryKey: ["api-health"],
    queryFn: async () => {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<ApiHealthData>;
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: 1,
  });
};

export const useDiagnostics = () => {
  return useQuery({
    queryKey: ["admin-diagnostics"],
    queryFn: () => adminFetch("/system/diagnostics"),
    refetchInterval: 15_000,
    staleTime: 12_000,
  });
};

export const useUnlockAdminIpLockout = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      adminFetch(`/system/admin-ip-lockouts/${encodeURIComponent(key)}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-health-dashboard"] });
    },
  });
};

// Platform Settings
export const usePlatformSettings = () => {
  return useQuery({
    queryKey: ["admin-platform-settings"],
    queryFn: () => adminFetch("/platform-settings"),
  });
};

export const useUpdatePlatformSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: Array<{ key: string; value: string }>) =>
      adminFetch("/platform-settings", {
        method: "PUT",
        body: JSON.stringify({ settings }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-platform-settings"] }),
  });
};

/* ── Vendors ── */
export const useVendors = () => {
  const { toast } = useToast();
  const q = useQuery({
    queryKey: ["admin-vendors"],
    queryFn: () => adminFetch("/vendors"),
    refetchInterval: REFETCH_INTERVAL,
  });
  useEffect(() => {
    if (q.isError) {
      toast({
        title: "Failed to load vendors",
        description: (q.error as Error)?.message ?? "Please try again.",
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.isError]);
  return q;
};

export const useFleetVendors = () =>
  useQuery({
    queryKey: ["admin-fleet-vendors"],
    queryFn: () => adminFetch("/fleet/vendors"),
    refetchInterval: 60_000,
  });

export const useUpdateVendorStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      adminFetch(`/vendors/${id}/status`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: (_, variables: any) => {
      qc.setQueryData(["admin-vendors"], (old: any) => {
        if (!old?.vendors) return old;
        return {
          ...old,
          vendors: old.vendors.map((v: any) => {
            if (v.id !== variables.id) return v;
            const updated = { ...v, ...variables };
            if (variables.isActive === true && !variables.isBanned)
              updated.approvalStatus = "approved";
            return updated;
          }),
        };
      });
      void qc.invalidateQueries({ queryKey: ["admin-vendors"] });
    },
  });
};

export const useVendorPayout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      amount,
      description,
    }: {
      id: string;
      amount: number;
      description?: string;
    }) =>
      adminFetch(`/vendors/${id}/payout`, {
        method: "POST",
        body: JSON.stringify({ amount, description }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-vendors"] });
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      void qc.invalidateQueries({ queryKey: ["admin-transactions"] });
      void qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });
};

export const useVendorCredit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      amount,
      description,
    }: {
      id: string;
      amount: number;
      description?: string;
    }) =>
      adminFetch(`/vendors/${id}/credit`, {
        method: "POST",
        body: JSON.stringify({ amount, description }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-vendors"] });
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      void qc.invalidateQueries({ queryKey: ["admin-transactions"] });
      void qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });
};

/* ── Riders ── */
export const useRiders = () =>
  /* staleTime: 0 ensures the wallet balance and rider state shown in modals
     are always fresh immediately after any mutation invalidates this query. */
  useQuery({
    queryKey: ["admin-riders"],
    queryFn: () => adminFetch("/riders"),
    refetchInterval: REFETCH_INTERVAL,
    staleTime: 0,
  });

export const useUpdateRiderStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      adminFetch(`/riders/${id}/status`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-riders"] }),
  });
};

export const useRiderPayout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      amount,
      description,
    }: {
      id: string;
      amount: number;
      description?: string;
    }) =>
      adminFetch(`/riders/${id}/payout`, {
        method: "POST",
        body: JSON.stringify({ amount, description }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-riders"] });
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      void qc.invalidateQueries({ queryKey: ["admin-transactions"] });
      void qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });
};

export const useRiderBonus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      amount,
      description,
    }: {
      id: string;
      amount: number;
      description?: string;
    }) =>
      adminFetch(`/riders/${id}/bonus`, {
        method: "POST",
        body: JSON.stringify({ amount, description }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-riders"] });
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      void qc.invalidateQueries({ queryKey: ["admin-transactions"] });
      void qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });
};

export const useRiderPenalties = (riderId: string | null) =>
  useQuery({
    queryKey: ["admin-rider-penalties", riderId],
    queryFn: () => adminFetch(`/riders/${riderId}/penalties`),
    enabled: !!riderId,
  });

export const useRiderRatings = (riderId: string | null) =>
  useQuery({
    queryKey: ["admin-rider-ratings", riderId],
    queryFn: () => adminFetch(`/riders/${riderId}/ratings`),
    enabled: !!riderId,
  });

export const useRestrictRider = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/riders/${id}/restrict`, { method: "POST", body: "{}" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-riders"] }),
  });
};

export const useUnrestrictRider = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/riders/${id}/unrestrict`, { method: "POST", body: "{}" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-riders"] }),
  });
};

/* ── Promo Codes ── */
export const usePromoCodes = () =>
  useQuery({
    queryKey: ["admin-promo-codes"],
    queryFn: () => adminFetch("/promo-codes"),
    refetchInterval: REFETCH_INTERVAL,
  });

export const useCreatePromoCode = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      adminFetch("/promo-codes", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-promo-codes"] }),
  });
};

export const useUpdatePromoCode = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      adminFetch(`/promo-codes/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-promo-codes"] }),
  });
};

export const useDeletePromoCode = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminFetch(`/promo-codes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-promo-codes"] }),
  });
};

// Deposit Requests
export const useDepositRequests = (status?: string) => {
  return useQuery({
    queryKey: ["admin-deposits", status],
    queryFn: () => adminFetch(`/deposit-requests${status ? `?status=${status}` : ""}`),
    refetchInterval: REFETCH_INTERVAL,
  });
};

export const useApproveDeposit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, refNo, note }: { id: string; refNo?: string; note?: string }) =>
      adminFetch(`/deposit-requests/${id}/approve`, {
        method: "PATCH",
        body: JSON.stringify({ refNo, note }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-deposits"] });
      void qc.invalidateQueries({ queryKey: ["admin-transactions"] });
      void qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });
};

export const useRejectDeposit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminFetch(`/deposit-requests/${id}/reject`, {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-deposits"] });
    },
  });
};

export const useBulkApproveDeposits = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, refNo }: { ids: string[]; refNo?: string }) =>
      adminFetch("/deposit-requests/bulk-approve", {
        method: "POST",
        body: JSON.stringify({ ids, refNo }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-deposits"] });
      void qc.invalidateQueries({ queryKey: ["admin-transactions"] });
      void qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });
};

export const useBulkRejectDeposits = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, reason }: { ids: string[]; reason: string }) =>
      adminFetch("/deposit-requests/bulk-reject", {
        method: "POST",
        body: JSON.stringify({ ids, reason }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-deposits"] });
      void qc.invalidateQueries({ queryKey: ["admin-transactions"] });
      void qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });
};

// Withdrawal Requests
export const useWithdrawalRequests = (status?: string) => {
  return useQuery({
    queryKey: ["admin-withdrawals", status],
    queryFn: () => adminFetch(`/withdrawal-requests${status ? `?status=${status}` : ""}`),
    refetchInterval: REFETCH_INTERVAL,
  });
};

export const useApproveWithdrawal = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, refNo, note }: { id: string; refNo: string; note?: string }) =>
      adminFetch(`/withdrawal-requests/${id}/approve`, {
        method: "PATCH",
        body: JSON.stringify({ refNo, note }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-withdrawals"] }),
  });
};

export const useRejectWithdrawal = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminFetch(`/withdrawal-requests/${id}/reject`, {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-withdrawals"] }),
  });
};

export const useBatchApproveWithdrawals = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      adminFetch("/withdrawal-requests/batch-approve", {
        method: "PATCH",
        body: JSON.stringify({ ids }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-withdrawals"] }),
  });
};

export const useBatchRejectWithdrawals = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, reason }: { ids: string[]; reason: string }) =>
      adminFetch("/withdrawal-requests/batch-reject", {
        method: "PATCH",
        body: JSON.stringify({ ids, reason }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-withdrawals"] }),
  });
};

export const useCreditRiderWallet = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      amount,
      description,
      type,
    }: {
      id: string;
      amount: number;
      description?: string;
      type?: string;
    }) =>
      adminFetch(`/riders/${id}/credit`, {
        method: "POST",
        body: JSON.stringify({ amount, description, type }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-riders"] });
      void qc.invalidateQueries({ queryKey: ["admin-transactions"] });
    },
  });
};

// ── Ride Service Types ──
export const useRideServices = () =>
  useQuery({
    queryKey: ["admin-ride-services"],
    queryFn: () => adminFetch("/ride-services"),
    staleTime: 0,
  });

export const useCreateRideService = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      adminFetch("/ride-services", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-ride-services"] }),
  });
};

export const useUpdateRideService = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [k: string]: unknown }) =>
      adminFetch(`/ride-services/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-ride-services"] }),
  });
};

export const useDeleteRideService = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminFetch(`/ride-services/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-ride-services"] }),
  });
};

// All Notifications
export const useAllNotifications = (role?: string) => {
  return useQuery({
    queryKey: ["admin-all-notifications", role],
    queryFn: () => adminFetch(`/all-notifications${role ? `?role=${role}` : ""}`),
    refetchInterval: REFETCH_INTERVAL,
  });
};

// WhatsApp delivery log
export const useWhatsAppDeliveryLog = (params?: {
  status?: string;
  phone?: string;
  limit?: number;
  offset?: number;
}) => {
  const { status, phone, limit = 100, offset = 0 } = params ?? {};
  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  if (phone) qs.set("phone", phone);
  qs.set("limit", String(limit));
  qs.set("offset", String(offset));
  return useQuery({
    queryKey: ["admin-wa-delivery-log", status ?? "", phone ?? "", limit, offset],
    queryFn: () => adminAbsoluteFetch(`/api/webhooks/whatsapp/delivery-log?${qs.toString()}`),
    refetchInterval: REFETCH_INTERVAL,
  });
};

// ══════════════════════════════════════════════════════
// POPULAR LOCATIONS
// ══════════════════════════════════════════════════════

export const usePopularLocations = () => {
  return useQuery({
    queryKey: ["admin-popular-locations"],
    queryFn: () => adminFetch("/locations"),
    refetchInterval: REFETCH_INTERVAL,
  });
};

export const useCreateLocation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      adminFetch("/locations", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-popular-locations"] }),
  });
};

export const useUpdateLocation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [k: string]: unknown }) =>
      adminFetch(`/locations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-popular-locations"] }),
  });
};

export const useDeleteLocation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminFetch(`/locations/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-popular-locations"] }),
  });
};

// ══════════════════════════════════════════════════════
// SCHOOL ROUTES
// ══════════════════════════════════════════════════════

export const useSchoolRoutes = () => {
  return useQuery({
    queryKey: ["admin-school-routes"],
    queryFn: () => adminFetch("/school-routes"),
    refetchInterval: REFETCH_INTERVAL,
  });
};

export const useCreateSchoolRoute = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      adminFetch("/school-routes", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-school-routes"] }),
  });
};

export const useUpdateSchoolRoute = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [k: string]: unknown }) =>
      adminFetch(`/school-routes/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-school-routes"] }),
  });
};

export const useDeleteSchoolRoute = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminFetch(`/school-routes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-school-routes"] }),
  });
};

export const useSchoolSubscriptions = (routeId?: string) => {
  return useQuery({
    queryKey: ["admin-school-subscriptions", routeId],
    queryFn: () => adminFetch(`/school-subscriptions${routeId ? `?routeId=${routeId}` : ""}`),
    refetchInterval: REFETCH_INTERVAL,
  });
};

type LiveRidersResponse = {
  riders: Array<{
    userId: string;
    name: string;
    phone: string | null;
    isOnline: boolean;
    vehicleType: string | null;
    lat: number;
    lng: number;
    updatedAt: string;
    ageSeconds: number;
    isFresh: boolean;
    action?: string | null;
  }>;
  total: number;
  freshCount: number;
  staleTimeoutSec: number;
};

export const useLiveRiders = () => {
  return useQuery<LiveRidersResponse>({
    queryKey: ["admin-live-riders"],
    queryFn: () => adminFetch("/live-riders"),
    refetchInterval: 10_000,
  });
};

export const useCustomerLocations = () => {
  return useQuery({
    queryKey: ["admin-customer-locations"],
    queryFn: () => adminFetch("/customer-locations"),
    refetchInterval: 30_000,
  });
};

/* ── Task 4 additions ── */

export const useRequestUserCorrection = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, field, note }: { id: string; field?: string; note?: string }) =>
      adminFetch(`/users/${id}/request-correction`, {
        method: "PATCH",
        body: JSON.stringify({ field, note }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      void qc.invalidateQueries({ queryKey: ["admin-users-pending"] });
    },
  });
};

export const useBulkBanUsers = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      ids,
      action,
      reason,
    }: {
      ids: string[];
      action: "ban" | "unban";
      reason?: string;
    }) =>
      adminFetch("/users/bulk-ban", {
        method: "PATCH",
        body: JSON.stringify({ ids, action, reason }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });
};

export const useAssignRider = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      riderId,
      riderName,
      riderPhone,
    }: {
      orderId: string;
      riderId?: string;
      riderName?: string;
      riderPhone?: string;
    }) =>
      adminFetch(`/orders/${orderId}/assign-rider`, {
        method: "PATCH",
        body: JSON.stringify({ riderId, riderName, riderPhone }),
      }),
    onMutate: async ({ orderId, riderId, riderName, riderPhone }) => {
      await qc.cancelQueries({ queryKey: ["admin-orders-enriched"] });
      const prev = snapshotQueries(qc, ["admin-orders-enriched"]);
      type OrdersCache = { orders: Array<Record<string, unknown>> } & Record<string, unknown>;
      qc.setQueriesData({ queryKey: ["admin-orders-enriched"], exact: false }, (old: unknown) => {
        const cache = old as OrdersCache | undefined;
        if (!cache?.orders) return old;
        return {
          ...cache,
          orders: cache.orders.map((o) =>
            o["id"] === orderId
              ? {
                  ...o,
                  riderId: riderId ?? o["riderId"],
                  riderName: riderName ?? o["riderName"],
                  riderPhone: riderPhone ?? o["riderPhone"],
                  updatedAt: new Date().toISOString(),
                }
              : o
          ),
        };
      });
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) restoreSnapshots(qc, context.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["admin-orders-enriched"] });
    },
  });
};

export const useVendorCommissionOverride = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, commissionPct }: { id: string; commissionPct: number }) =>
      adminFetch(`/vendors/${id}/commission`, {
        method: "PATCH",
        body: JSON.stringify({ commissionPct }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-vendors"] }),
  });
};

export const useToggleRiderOnline = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isOnline }: { id: string; isOnline: boolean }) =>
      adminFetch(`/riders/${id}/online`, { method: "PATCH", body: JSON.stringify({ isOnline }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-riders"] }),
  });
};

export const useRevenueTrend = () =>
  useQuery({
    queryKey: ["admin-revenue-trend"],
    queryFn: () => adminFetch("/revenue-trend"),
    refetchInterval: 60_000,
  });

export const useLeaderboard = () =>
  useQuery({
    queryKey: ["admin-leaderboard"],
    queryFn: () => adminFetch("/leaderboard"),
    refetchInterval: 60_000,
  });

export const useRevenueAnalytics = () =>
  useQuery({
    queryKey: ["admin-revenue-analytics"],
    queryFn: () => adminFetch("/revenue-analytics"),
    refetchInterval: 5 * 60_000,
  });

export const useAdminCancelRide = () => {
  const qc = useQueryClient();
  const { onError: handleCancelRideError } = useErrorHandler({ title: "Failed to cancel ride" });
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      adminFetch(`/rides/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-rides-enriched"] });
      void qc.invalidateQueries({ queryKey: ["admin-rides"] });
      void qc.invalidateQueries({ queryKey: ["admin-stats"] });
      void qc.invalidateQueries({ queryKey: ["admin-dispatch-monitor"] });
      void qc.invalidateQueries({ queryKey: ["admin-ride-detail"] });
      void qc.invalidateQueries({ queryKey: ["admin-ride-audit"] });
    },
    onError: (error: unknown) => {
      void qc.invalidateQueries({ queryKey: ["admin-rides-enriched"] });
      handleCancelRideError(error);
      log.error("cancel ride failed:", error);
    },
  });
};

export const useAdminRefundRide = () => {
  const qc = useQueryClient();
  const { onError: handleRefundRideError } = useErrorHandler({ title: "Failed to process refund" });
  return useMutation({
    mutationFn: ({ id, amount, reason }: { id: string; amount?: number; reason?: string }) =>
      adminFetch(`/rides/${id}/refund`, {
        method: "POST",
        body: JSON.stringify({ amount, reason }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-rides-enriched"] });
      void qc.invalidateQueries({ queryKey: ["admin-transactions"] });
      void qc.invalidateQueries({ queryKey: ["admin-stats"] });
      void qc.invalidateQueries({ queryKey: ["admin-ride-detail"] });
      void qc.invalidateQueries({ queryKey: ["admin-ride-audit"] });
    },
    onError: (error: unknown) => {
      void qc.invalidateQueries({ queryKey: ["admin-rides-enriched"] });
      handleRefundRideError(error);
      log.error("refund ride failed:", error);
    },
  });
};

export const useAdminReassignRide = () => {
  const qc = useQueryClient();
  const { onError: handleReassignRideError } = useErrorHandler({
    title: "Failed to reassign rider",
  });
  return useMutation({
    mutationFn: ({
      id,
      riderId,
      riderName,
      riderPhone,
    }: {
      id: string;
      riderId?: string;
      riderName?: string;
      riderPhone?: string;
    }) =>
      adminFetch(`/rides/${id}/reassign`, {
        method: "POST",
        body: JSON.stringify({ riderId, riderName, riderPhone }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-rides-enriched"] });
      void qc.invalidateQueries({ queryKey: ["admin-rides"] });
      void qc.invalidateQueries({ queryKey: ["admin-stats"] });
      void qc.invalidateQueries({ queryKey: ["admin-ride-detail"] });
      void qc.invalidateQueries({ queryKey: ["admin-ride-audit"] });
    },
    onError: (error: unknown) => {
      void qc.invalidateQueries({ queryKey: ["admin-rides-enriched"] });
      handleReassignRideError(error);
      log.error("reassign ride failed:", error);
    },
  });
};

export const useRideDetail = (rideId: string | null) =>
  useQuery({
    queryKey: ["admin-ride-detail", rideId],
    queryFn: () => adminFetch(`/rides/${rideId}/detail`),
    enabled: !!rideId,
  });

export const useRideAuditTrail = (rideId: string | null) =>
  useQuery({
    queryKey: ["admin-ride-audit", rideId],
    queryFn: () => adminFetch(`/rides/${rideId}/audit-trail`),
    enabled: !!rideId,
    refetchInterval: 15_000,
  });

export const useDispatchMonitor = () =>
  useQuery({
    queryKey: ["admin-dispatch-monitor"],
    queryFn: () => adminFetch("/dispatch-monitor"),
    refetchInterval: 10_000,
  });

export const useAuditLog = (params?: {
  page?: number;
  action?: string;
  from?: string;
  to?: string;
  result?: string;
  search?: string;
}) => {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.action) qs.set("action", params.action);
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.result) qs.set("result", params.result);
  if (params?.search) qs.set("search", params.search);
  const q = qs.toString();
  return useQuery({
    queryKey: ["admin-audit-log", params],
    queryFn: () => adminFetch(`/audit-log${q ? `?${q}` : ""}`),
    refetchInterval: 30_000,
  });
};

export const useRiderRoute = (userId: string | null, date?: string) => {
  const qs = date ? `?date=${date}` : "?sinceOnline=true";
  return useQuery({
    queryKey: ["admin-rider-route", userId, date ?? "session"],
    queryFn: () => adminFetch(`/riders/${userId}/route${qs}`),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

export const useRiderTrailsBatch = (riderIds: string[]) => {
  const results = useQueries({
    queries: riderIds.map((id) => ({
      queryKey: ["admin-rider-route", id, "session"],
      queryFn: () => adminFetch(`/riders/${id}/route?sinceOnline=true`),
      enabled: riderIds.length > 0,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
    })),
  });
  return results
    .map((r, i) => ({
      riderId: riderIds[i],
      points: (
        (r.data as { route?: Array<{ latitude: number; longitude: number }> } | undefined)?.route ??
        []
      ).map((p): [number, number] => [p.latitude, p.longitude]),
    }))
    .filter((t) => t.points.length >= 2);
};

/* ── Reviews ── */
export const useAdminReviews = (params?: { status?: string; type?: string; q?: string }) =>
  useQuery({
    queryKey: ["admin-reviews", params],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (params?.status && params.status !== "all") qs.set("status", params.status);
      if (params?.type && params.type !== "all") qs.set("type", params.type);
      if (params?.q) qs.set("q", params.q);
      const query = qs.toString();
      return adminFetch(`/reviews${query ? `?${query}` : ""}`);
    },
    refetchInterval: 30_000,
  });

export const useModerationQueue = () =>
  useQuery({
    queryKey: ["admin-moderation-queue"],
    queryFn: () => adminFetch("/reviews/moderation-queue"),
    refetchInterval: 15_000,
  });

export const useApproveReview = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminFetch(`/reviews/${id}/approve`, { method: "PATCH" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-moderation-queue"] });
      void qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    },
  });
};

export const useRejectReview = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminFetch(`/reviews/${id}/reject`, { method: "PATCH" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-moderation-queue"] });
      void qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    },
  });
};

export const useRunRatingSuspension = () =>
  useMutation({ mutationFn: () => adminFetch("/jobs/rating-suspension", { method: "POST" }) });

export const useOverrideSuspension = (role: "riders" | "vendors") => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/${role}/${id}/override-suspension`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-riders"] });
      void qc.invalidateQueries({ queryKey: ["admin-vendors"] });
    },
  });
};

/* ── Service Zones ── */
export type ServiceZone = {
  id: number;
  name: string;
  city: string;
  lat: string;
  lng: string;
  radiusKm: string;
  isActive: boolean;
  appliesToRides: boolean;
  appliesToOrders: boolean;
  appliesToParcel: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export const useServiceZones = () =>
  useQuery<ServiceZone[]>({
    queryKey: ["admin-service-zones"],
    queryFn: () => adminFetch("/service-zones"),
    staleTime: 30_000,
  });

export const useCreateServiceZone = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ServiceZone>) =>
      adminFetch("/service-zones", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-service-zones"] }),
  });
};

export const useUpdateServiceZone = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<ServiceZone> & { id: number }) =>
      adminFetch(`/service-zones/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-service-zones"] }),
  });
};

export const useDeleteServiceZone = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => adminFetch(`/service-zones/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-service-zones"] }),
  });
};

export const useDeliveryAccess = () => {
  return useQuery({
    queryKey: ["admin-delivery-access"],
    queryFn: () => adminFetch("/delivery-access"),
    refetchInterval: REFETCH_INTERVAL,
  });
};

export const useUpdateDeliveryMode = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode: string) =>
      adminFetch("/delivery-access/mode", { method: "PUT", body: JSON.stringify({ mode }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-delivery-access"] });
    },
  });
};

export const useAddWhitelistEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      type: string;
      targetId: string;
      serviceType?: string;
      validUntil?: string;
      deliveryLabel?: string;
      notes?: string;
    }) => adminFetch("/delivery-access/whitelist", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-delivery-access"] }),
  });
};

export const useBulkAddWhitelist = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entries: any[]) =>
      adminFetch("/delivery-access/whitelist/bulk", {
        method: "POST",
        body: JSON.stringify({ entries }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-delivery-access"] }),
  });
};

export const useUpdateWhitelistEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      deliveryLabel?: string;
      notes?: string;
      validUntil?: string;
      status?: string;
    }) =>
      adminFetch(`/delivery-access/whitelist/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-delivery-access"] }),
  });
};

export const useDeleteWhitelistEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/delivery-access/whitelist/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-delivery-access"] }),
  });
};

export const useDeliveryAccessRequests = () => {
  return useQuery({
    queryKey: ["admin-delivery-requests"],
    queryFn: () => adminFetch("/delivery-access/requests"),
    refetchInterval: REFETCH_INTERVAL,
  });
};

export const useResolveDeliveryRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      notes,
    }: {
      id: string;
      status: "approved" | "rejected";
      notes?: string;
    }) =>
      adminFetch(`/delivery-access/requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, notes }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-delivery-requests"] });
      void qc.invalidateQueries({ queryKey: ["admin-delivery-access"] });
    },
  });
};

export const useDeliveryAccessAudit = () => {
  return useQuery({
    queryKey: ["admin-delivery-audit"],
    queryFn: () => adminFetch("/delivery-access/audit"),
  });
};

export const useConditions = (filters?: Record<string, string>) => {
  const params = new URLSearchParams(filters || {}).toString();
  return useQuery({
    queryKey: ["admin-conditions", filters],
    queryFn: () => adminFetch(`/conditions${params ? `?${params}` : ""}`),
    refetchInterval: REFETCH_INTERVAL,
  });
};

export const useUserConditions = (userId: string) => {
  return useQuery({
    queryKey: ["admin-conditions-user", userId],
    queryFn: () => adminFetch(`/conditions/user/${userId}`),
    enabled: !!userId,
  });
};

export const useApplyCondition = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      adminFetch("/conditions", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-conditions"] });
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      void qc.invalidateQueries({ queryKey: ["admin-vendors"] });
      void qc.invalidateQueries({ queryKey: ["admin-riders"] });
    },
  });
};

export const useUpdateCondition = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: any }) =>
      adminFetch(`/conditions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-conditions"] });
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
};

export const useDeleteCondition = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminFetch(`/conditions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-conditions"] });
    },
  });
};

export const useBulkConditionAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { ids: string[]; action: string; reason?: string }) =>
      adminFetch("/conditions/bulk", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-conditions"] });
    },
  });
};

export const useConditionRules = () => {
  return useQuery({
    queryKey: ["admin-condition-rules"],
    queryFn: () => adminFetch("/condition-rules"),
  });
};

export const useCreateConditionRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      adminFetch("/condition-rules", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-condition-rules"] });
    },
  });
};

export const useUpdateConditionRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: any }) =>
      adminFetch(`/condition-rules/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-condition-rules"] });
    },
  });
};

export const useDeleteConditionRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminFetch(`/condition-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-condition-rules"] });
    },
  });
};

export const useSeedDefaultRules = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => adminFetch("/condition-rules/seed-defaults", { method: "POST", body: "{}" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-condition-rules"] });
    },
  });
};

export const useConditionSettings = () => {
  return useQuery({
    queryKey: ["admin-condition-settings"],
    queryFn: () => adminFetch("/condition-settings"),
  });
};

export const useUpdateConditionSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      adminFetch("/condition-settings", { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-condition-settings"] });
    },
  });
};

export const useEvaluateRules = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      adminFetch(`/condition-rules/evaluate/${userId}`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-conditions"] });
    },
  });
};

// ══════════════════════════════════════════════════════
// SMS GATEWAYS (Hybrid Firebase / Dynamic Failover)
// ══════════════════════════════════════════════════════

export const useSmsGateways = () =>
  useQuery({
    queryKey: ["admin-sms-gateways"],
    queryFn: () => adminFetch("/sms-gateways"),
    refetchInterval: 60_000,
  });

export const useCreateSmsGateway = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      adminFetch("/sms-gateways", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-sms-gateways"] }),
  });
};

export const useUpdateSmsGateway = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      adminFetch(`/sms-gateways/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-sms-gateways"] }),
  });
};

export const useDeleteSmsGateway = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminFetch(`/sms-gateways/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-sms-gateways"] }),
  });
};

export const useToggleSmsGateway = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminFetch(`/sms-gateways/${id}/toggle`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-sms-gateways"] }),
  });
};

// ══════════════════════════════════════════════════════
// OTP WHITELIST (Per-identity bypass for testers)
// ══════════════════════════════════════════════════════

/* Mirrors the row shape returned from `GET /admin/whitelist`. Keeping it
   here means consumers (the OTP Control page, future hooks, tests) all
   share one definition instead of redeclaring `any` shapes. */
export interface OtpWhitelistEntry {
  id: string;
  identifier: string;
  label?: string;
  bypassCode: string;
  isActive: boolean;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OtpWhitelistResponse {
  entries: OtpWhitelistEntry[];
  total?: number;
}

export interface AddOtpWhitelistInput {
  identifier: string;
  label?: string;
  bypassCode?: string;
  expiresAt?: string;
}

export interface UpdateOtpWhitelistInput {
  id: string;
  label?: string;
  bypassCode?: string;
  isActive?: boolean;
  expiresAt?: string | null;
}

export const useOtpWhitelist = () =>
  /* The generic on `useQuery` removes the `any` that previously leaked
     into every consumer of `entries`. */
  useQuery<OtpWhitelistResponse>({
    queryKey: ["admin-otp-whitelist"],
    queryFn: () => adminFetch("/whitelist"),
    refetchInterval: 30_000,
  });

export const useAddOtpWhitelist = () => {
  const qc = useQueryClient();
  return useMutation({
    /* Was POSTing to `/whitelist`, which doesn't exist on the admin
       router — every "Add" call would 404. Aligned with the route in
       `artifacts/api-server/src/routes/admin/otp.ts`. */
    mutationFn: (data: AddOtpWhitelistInput) =>
      adminFetch("/whitelist", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-otp-whitelist"] }),
  });
};

export const useUpdateOtpWhitelist = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateOtpWhitelistInput) =>
      adminFetch(`/whitelist/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-otp-whitelist"] }),
  });
};

export const useDeleteOtpWhitelist = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminFetch(`/whitelist/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-otp-whitelist"] }),
  });
};

// ══════════════════════════════════════════════════════
// USER OTP / CONTACT VERIFICATION / PASSWORD RESET (Admin tools)
// ══════════════════════════════════════════════════════

export const useAdminResetOtp = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      adminFetch(`/users/${userId}/reset-otp`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-users"], exact: false });
    },
  });
};

export const useAdminViewOtp = (userId: string | null, options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ["admin-user-otp", userId],
    queryFn: () => adminFetch(`/users/${userId}/otp`),
    enabled: options?.enabled === true && !!userId,
    staleTime: 0,
    gcTime: 0,
  });

export const useAdminVerifyContact = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, type }: { userId: string; type: "phone" | "email" }) =>
      adminFetch(`/users/${userId}/verify-contact`, {
        method: "PATCH",
        body: JSON.stringify({ type }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-users"], exact: false });
    },
  });
};

export const useAdminForcePasswordReset = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      adminFetch(`/users/${userId}/force-password-reset`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-users"], exact: false });
    },
  });
};

export const useAdminKycByUserId = (userId: string | null) =>
  useQuery({
    queryKey: ["admin-kyc-by-user", userId],
    queryFn: () => adminAbsoluteFetch(`/api/kyc/admin/list?userId=${userId}&limit=1`),
    enabled: !!userId,
    staleTime: 30_000,
  });

export const useAdminKycApprove = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kycId, reason }: { kycId: string; reason?: string }) =>
      adminAbsoluteFetch(`/api/kyc/admin/${kycId}/approve`, {
        method: "POST",
        body: JSON.stringify({ reason: reason ?? "" }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-users"], exact: false });
      void qc.invalidateQueries({ queryKey: ["admin-kyc-by-user"], exact: false });
      void qc.invalidateQueries({ queryKey: ["admin-kyc"] });
    },
  });
};

export const useAdminKycReject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kycId, reason }: { kycId: string; reason: string }) =>
      adminAbsoluteFetch(`/api/kyc/admin/${kycId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-users"], exact: false });
      void qc.invalidateQueries({ queryKey: ["admin-kyc-by-user"], exact: false });
      void qc.invalidateQueries({ queryKey: ["admin-kyc"] });
    },
  });
};

// ══════════════════════════════════════════════════════
// USER SESSIONS (Remote logout / session revocation)
// ══════════════════════════════════════════════════════

export const useAdminUserSessions = (userId: string | null) =>
  useQuery({
    queryKey: ["admin-user-sessions", userId],
    queryFn: () => adminFetch(`/users/${userId}/sessions`),
    enabled: !!userId,
  });

export const useRevokeUserSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, sessionId }: { userId: string; sessionId: string }) =>
      adminFetch(`/users/${userId}/sessions/revoke`, {
        method: "POST",
        body: JSON.stringify({ sessionId }),
      }),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ["admin-user-sessions", vars.userId] }),
  });
};

export const useRevokeAllUserSessions = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      adminFetch(`/users/${userId}/sessions/revoke`, { method: "POST", body: "{}" }),
    onSuccess: (_data, userId) =>
      qc.invalidateQueries({ queryKey: ["admin-user-sessions", userId] }),
  });
};
