import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useCallback, useState, useRef } from "react";
import { I18nManager } from "react-native";
import type { Language } from "@workspace/i18n";
import { LANGUAGE_OPTIONS } from "@workspace/i18n";

const LANG_STORAGE_KEY = "@ajkmart_language";
const VALID_LANGS = new Set<string>(LANGUAGE_OPTIONS.map(o => o.value));
const DEFAULT_LANGUAGE: Language = "en";
const API_DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  loading: boolean;
  syncToServer: (token: string) => Promise<void>;
  setAuthToken: (token: string | null) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: DEFAULT_LANGUAGE,
  setLanguage: async () => {},
  loading: false,
  syncToServer: async () => {},
  setAuthToken: () => {},
});

async function fetchPlatformDefaultLanguage(): Promise<Language | null> {
  try {
    const res = await fetch(`https://${API_DOMAIN}/api/platform-config`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const lang = data?.language?.defaultLanguage;
    if (lang && VALID_LANGS.has(lang)) return lang as Language;
  } catch (err) { console.warn("[Language] Platform default language fetch failed:", err instanceof Error ? err.message : String(err)); }
  return null;
}

async function fetchUserLanguage(token: string): Promise<Language | null> {
  try {
    const res = await fetch(`https://${API_DOMAIN}/api/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const lang = data?.language;
    if (lang && VALID_LANGS.has(lang)) return lang as Language;
  } catch (err) { console.warn("[Language] User language fetch failed:", err instanceof Error ? err.message : String(err)); }
  return null;
}

async function putUserLanguage(token: string, lang: string): Promise<void> {
  await fetch(`https://${API_DOMAIN}/api/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ language: lang }),
  });
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LANG_STORAGE_KEY);
        if (stored && VALID_LANGS.has(stored)) {
          setLanguageState(stored as Language);
          applyRTL(stored as Language);
        } else {
          const platformLang = await fetchPlatformDefaultLanguage();
          if (platformLang) {
            setLanguageState(platformLang);
            applyRTL(platformLang);
          }
        }
      } catch (err) { console.warn("[Language] Bootstrap language load failed:", err instanceof Error ? err.message : String(err)); }
      setLoading(false);
    })();
  }, []);

  function applyRTL(lang: Language) {
    const isRtl = lang === "ur";
    if (I18nManager.isRTL !== isRtl) {
      I18nManager.forceRTL(isRtl);
    }
  }

  const setAuthToken = useCallback((token: string | null) => {
    tokenRef.current = token;
  }, []);

  const setLanguage = useCallback(async (lang: Language) => {
    setLanguageState(lang);
    applyRTL(lang);
    try {
      await AsyncStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch (err) { console.warn("[Language] Failed to persist language preference:", err instanceof Error ? err.message : String(err)); }
    const token = tokenRef.current;
    if (token) {
      try {
        await putUserLanguage(token, lang);
      } catch (err) { console.warn("[Language] Failed to sync language to server:", err instanceof Error ? err.message : String(err)); }
    }
  }, []);

  const syncToServer = useCallback(async (token: string) => {
    if (!token) return;
    tokenRef.current = token;
    try {
      const serverLang = await fetchUserLanguage(token);
      if (serverLang) {
        setLanguageState(serverLang);
        applyRTL(serverLang);
        await AsyncStorage.setItem(LANG_STORAGE_KEY, serverLang);
      } else {
        const currentLang = await AsyncStorage.getItem(LANG_STORAGE_KEY);
        const langToSave = (currentLang && VALID_LANGS.has(currentLang)) ? currentLang : language;
        await putUserLanguage(token, langToSave as string);
      }
    } catch (err) { console.warn("[Language] syncToServer failed:", err instanceof Error ? err.message : String(err)); }
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, loading, syncToServer, setAuthToken }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
