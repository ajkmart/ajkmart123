import { memo, useEffect, useState } from "react";

export const LiveClock = memo(function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span>{time.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}</span>;
});
