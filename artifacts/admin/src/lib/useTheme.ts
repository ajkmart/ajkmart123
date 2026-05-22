import { safeLocalGet, safeLocalSet } from "@/lib/safeStorage";
import { useCallback, useEffect, useState } from "react";

const THEME_KEY = "ajkmart_dark_mode";

export function useTheme() {
  const [isDark, setIsDark] = useState(() => safeLocalGet(THEME_KEY) === "true");

  useEffect(() => {
    const html = document.documentElement;
    if (isDark) {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
  }, [isDark]);

  const toggleDark = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      safeLocalSet(THEME_KEY, next ? "true" : "false");
      return next;
    });
  }, []);

  return { isDark, toggleDark };
}
