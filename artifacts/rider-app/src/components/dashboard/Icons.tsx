import { Banana, Bike, Bus, Car, Package, Pill, ShoppingBag, ShoppingCart } from "lucide-react";

export function OrderTypeIcon({ type }: { type: string }) {
  if (type === "food") return <ShoppingBag size={20} className="text-orange-500" />;
  if (type === "mart") return <ShoppingCart size={20} className="text-blue-500" />;
  if (type === "pharmacy") return <Pill size={20} className="text-purple-600" />;
  if (type === "grocery") return <Banana size={20} className="text-yellow-500" />;
  return <Package size={20} className="text-indigo-500" />;
}

export function RideTypeIcon({ type }: { type: string }) {
  if (type === "car") return <Car size={20} className="text-blue-600" />;
  if (type === "rickshaw") return <Bike size={20} className="text-yellow-600" />;
  if (type === "daba") return <Bus size={20} className="text-gray-600" />;
  if (type === "school_shift") return <Bus size={20} className="text-green-600" />;
  return <Bike size={20} className="text-green-600" />;
}
