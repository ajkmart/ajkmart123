import { memo, useEffect, useRef, useState } from "react";
import { ACCEPT_TIMEOUT_SEC } from "./helpers";

export const AcceptCountdown = memo(function AcceptCountdown({
  createdAt,
  serverTime,
  onExpired,
  timeoutSec,
}: {
  createdAt: string;
  serverTime?: string | null;
  onExpired?: () => void;
  timeoutSec?: number;
}) {
  const timeout = timeoutSec ?? ACCEPT_TIMEOUT_SEC;

  /* client–server clock offset: positive means client clock is ahead of server */
  const offsetMs = useRef<number>(serverTime ? Date.now() - new Date(serverTime).getTime() : 0);

  /* Recompute offset if serverTime changes (e.g. on refetch) */
  useEffect(() => {
    if (serverTime) {
      offsetMs.current = Date.now() - new Date(serverTime).getTime();
    }
  }, [serverTime]);

  const calcRemaining = () => {
    const adjustedNow = Date.now() - offsetMs.current;
    const elapsed = Math.floor((adjustedNow - new Date(createdAt).getTime()) / 1000);
    return Math.max(0, timeout - elapsed);
  };

  /* Initialize with offset already applied — no transient mismatch on first render */
  const [secs, setSecs] = useState(() => calcRemaining());
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;
    /* Recalculate immediately so the display corrects before the first tick */
    setSecs(calcRemaining());
    const id = setInterval(() => {
      const remaining = calcRemaining();
      setSecs(remaining);
      if (remaining === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpired?.();
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createdAt, onExpired, timeout]);

  const pct = secs / timeout;
  const r = 14,
    stroke = 3;
  const circ = 2 * Math.PI * r;
  const dashOffset = circ * (1 - pct);
  const col = secs > 30 ? "#22c55e" : secs > 10 ? "#f59e0b" : "#ef4444";

  return (
    <div
      className="relative flex flex-shrink-0 items-center justify-center"
      style={{ width: 36, height: 36 }}
      role="timer"
      aria-label={`${secs} seconds remaining`}
    >
      <svg width={36} height={36} className={secs <= 10 ? "animate-pulse" : ""}>
        <circle cx={18} cy={18} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle
          cx={18}
          cy={18}
          r={r}
          fill="none"
          stroke={col}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 18 18)"
          style={{ transition: "stroke-dashoffset 0.9s linear, stroke 0.3s" }}
        />
      </svg>
      <span className="absolute text-[9px] font-extrabold tabular-nums" style={{ color: col }}>
        {secs}
      </span>
    </div>
  );
});
