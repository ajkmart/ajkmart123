import { useCallback, useEffect, useState } from "react";

const THEME_KEY = "ajkmart_dark_mode";

export function useTheme() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(THEME_KEY) === "true";
    } catch (err) {
      console.warn("[artifacts/rider-app/src/lib/useTheme.ts]", err);
      return false;
    } // eslint-disable-line no-console
  });

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
      try {
        localStorage.setItem(THEME_KEY, next ? "true" : "false");
      } catch (err) {
        console.warn("[artifacts/rider-app/src/lib/useTheme.ts]", err);
      } // eslint-disable-line no-console
      return next;
    });
  }, []);

  return { isDark, toggleDark };
}
