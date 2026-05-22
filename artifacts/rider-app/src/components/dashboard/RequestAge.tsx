import { Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { timeAgo } from "./helpers";

export function RequestAge({ createdAt }: { createdAt: string }) {
  const [label, setLabel] = useState(timeAgo(createdAt));
  useEffect(() => {
    const timerRef: { id: ReturnType<typeof setInterval> | null } = { id: null };

    const tick = () => {
      setLabel(timeAgo(createdAt));
      const diffNow = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
      if (diffNow >= 60 && timerRef.id != null) {
        clearInterval(timerRef.id);
        timerRef.id = setInterval(() => setLabel(timeAgo(createdAt)), 10000);
      }
    };

    const initialDiff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
    timerRef.id = setInterval(tick, initialDiff >= 60 ? 10000 : 1000);
    return () => {
      if (timerRef.id) clearInterval(timerRef.id);
    };
  }, [createdAt]);
  const diffSec = (Date.now() - new Date(createdAt).getTime()) / 1000;
  const urgent = diffSec > 90;
  return (
    <span
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${urgent ? "animate-pulse bg-red-100 text-red-600" : "bg-gray-100 text-gray-500"}`}
    >
      <Timer size={9} /> {label}
    </span>
  );
}
