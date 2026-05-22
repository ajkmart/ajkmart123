export const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  picked_up: "Picked Up",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "out_for_delivery", "picked_up", "cancelled"],
  ready: ["picked_up", "out_for_delivery", "delivered", "cancelled"],
  picked_up: ["out_for_delivery", "delivered", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export type SortKey = "id" | "customer" | "type" | "total" | "status" | "date";
export type SortDir = "asc" | "desc";

export const PAGE_SIZES = [10, 25, 50];

export const isTerminal = (s: string) => s === "delivered" || s === "cancelled";
export const canCancel = (o: any) => !isTerminal(o.status);
export const allowedNext = (o: any) => ALLOWED_TRANSITIONS[o.status] ?? [];

export function escapeCSV(val: string): string {
  let safe = val;
  if (/^[=+\-@\t\r]/.test(safe)) {
    safe = "'" + safe;
  }
  if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function exportOrdersCSV(orders: any[]) {
  const header =
    "orderId,date,customerId,customerName,vendorName,items,total,status,paymentMethod,type,riderName,deliveredAt";
  const rows = orders.map((o: any) => {
    const items = Array.isArray(o.items)
      ? o.items.map((i: any) => `${i.name ?? i.productName ?? ""}×${i.quantity ?? 1}`).join("; ")
      : "";
    return [
      escapeCSV(o.id ?? ""),
      escapeCSV(o.createdAt?.slice(0, 10) ?? ""),
      escapeCSV(o.userId ?? o.customerId ?? ""),
      escapeCSV(o.userName ?? o.customerName ?? ""),
      escapeCSV(o.vendorName ?? ""),
      escapeCSV(items),
      String(o.total ?? ""),
      escapeCSV(o.status ?? ""),
      escapeCSV(o.paymentMethod ?? ""),
      escapeCSV(o.type ?? ""),
      escapeCSV(o.riderName ?? ""),
      escapeCSV(o.deliveredAt?.slice(0, 10) ?? ""),
    ].join(",");
  });
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
