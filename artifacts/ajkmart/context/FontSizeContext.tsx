import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const FONT_SIZE_KEY = "@ajkmart_font_size";

export type FontSizeLevel = "small" | "medium" | "large";

export const FONT_SIZE_MULTIPLIERS: Record<FontSizeLevel, number> = {
  small: 0.875,
  medium: 1,
  large: 1.15,
};

interface FontSizeContextValue {
  fontSizeLevel: FontSizeLevel;
  fontScale: number;
  setFontSizeLevel: (level: FontSizeLevel) => Promise<void>;
}

const FontSizeContext = createContext<FontSizeContextValue>({
  fontSizeLevel: "medium",
  fontScale: 1,
  setFontSizeLevel: async () => {},
});

export function FontSizeProvider({ children }: { children: React.ReactNode }) {
  const [fontSizeLevel, setFontSizeLevelState] = useState<FontSizeLevel>("medium");

  useEffect(() => {
    // eslint-disable-next-line ajk-local/no-silent-catch -- font size preference read failure is non-critical; falls back to default
    AsyncStorage.getItem(FONT_SIZE_KEY)
      .then((stored) => {
        if (stored === "small" || stored === "medium" || stored === "large") {
          setFontSizeLevelState(stored as FontSizeLevel);
        }
      })
      .catch(() => {});
  }, []);

  const setFontSizeLevel = useCallback(async (level: FontSizeLevel) => {
    setFontSizeLevelState(level);
    try {
      await AsyncStorage.setItem(FONT_SIZE_KEY, level);
    // eslint-disable-next-line ajk-local/no-silent-catch -- font size persistence failure is non-critical; in-memory state already updated
    } catch {}
  }, []);

  const fontScale = FONT_SIZE_MULTIPLIERS[fontSizeLevel];

  return (
    <FontSizeContext.Provider
      value={{
        fontSizeLevel,
        fontScale,
        setFontSizeLevel,
      }}
    >
      {children}
    </FontSizeContext.Provider>
  );
}

export function useFontSize() {
  return useContext(FontSizeContext);
}
