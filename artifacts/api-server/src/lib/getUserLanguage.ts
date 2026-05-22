import { db } from "@workspace/db";
import { userSettingsTable } from "@workspace/db/schema";
import type { Language } from "@workspace/i18n";
import { eq } from "drizzle-orm";
import { getPlatformSettings } from "../routes/admin-shared.js";

const VALID_LANGUAGES: Language[] = ["en", "ur", "roman"];

export async function getPlatformDefaultLanguage(): Promise<Language> {
  try {
    const s = await getPlatformSettings();
    const lang = s["default_language"] as Language | undefined;
    if (lang && VALID_LANGUAGES.includes(lang)) return lang;
  } catch (err) {
    /* intentional: non-fatal guard */ void err;
  }
  return "en";
}

export async function getUserLanguage(userId: string): Promise<Language> {
  try {
    const [settings] = await db
      .select({ language: userSettingsTable.language })
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1);

    if (settings?.language && VALID_LANGUAGES.includes(settings.language as Language)) {
      return settings.language as Language;
    }
  } catch (err) {
    /* intentional: non-fatal guard */ void err;
  }

  return getPlatformDefaultLanguage();
}
