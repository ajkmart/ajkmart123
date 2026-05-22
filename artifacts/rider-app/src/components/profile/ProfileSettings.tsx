import { tDual, type TranslationKey } from "@workspace/i18n";
import { Bell, ChevronRight, Languages, Moon, Shield, Sun } from "lucide-react";
import { Link } from "wouter";

interface ProfileSettingsProps {
  language: string;
  setLanguage: (lang: "en" | "ur" | "roman") => void;
  isDark: boolean;
  toggleDark: () => void;
  unread: number;
}

export function ProfileSettings({
  language,
  setLanguage,
  isDark,
  toggleDark,
  unread,
}: ProfileSettingsProps) {
  const T = (key: TranslationKey) => tDual(key, language as never);

  return (
    <div className="animate-[slideUp_0.7s_ease-out] overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
      <div className="px-5 py-3.5">
        <p className="flex items-center gap-2 text-[15px] font-bold text-gray-900">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-gray-500"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          {T("settingsLabel")}
        </p>
      </div>
      <div className="border-t border-gray-100">
        <div className="flex items-center justify-between border-b border-gray-50 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50">
              <Languages size={17} className="text-indigo-500" />
            </div>
            <span className="text-sm font-semibold text-gray-800">{T("languageLabel")}</span>
          </div>
          <div className="flex flex-wrap gap-0.5 rounded-xl bg-gray-100 p-0.5">
            {(["en", "ur", "roman"] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all ${language === lang ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
              >
                {lang === "en" ? "EN" : lang === "ur" ? "اردو" : "Roman"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-gray-50 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl ${isDark ? "bg-indigo-100" : "bg-gray-100"}`}
            >
              {isDark ? (
                <Moon size={17} className="text-indigo-500" />
              ) : (
                <Sun size={17} className="text-gray-500" />
              )}
            </div>
            <div>
              <span className="block text-sm font-semibold text-gray-800">Dark Mode</span>
              <span className="text-[10px] text-gray-400">
                {isDark ? "Dark theme active" : "Light theme active"}
              </span>
            </div>
          </div>
          <button
            onClick={toggleDark}
            className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${isDark ? "bg-indigo-500" : "bg-gray-300"}`}
            aria-label="Toggle dark mode"
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${isDark ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </button>
        </div>

        <Link
          href="/settings/security"
          className="flex items-center justify-between border-b border-gray-50 px-5 py-3.5 transition-colors active:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50">
              <Shield size={17} className="text-red-500" />
            </div>
            <div>
              <span className="block text-sm font-semibold text-gray-800">
                {T("securitySettingsLink")}
              </span>
              <span className="text-[10px] text-gray-400">{T("manageSecuritySettings")}</span>
            </div>
          </div>
          <ChevronRight size={16} className="text-gray-300" />
        </Link>

        <Link
          href="/notifications"
          className="flex items-center justify-between px-5 py-3.5 transition-colors active:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
              <Bell size={17} className="text-blue-500" />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-extrabold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </div>
            <div>
              <span className="block text-sm font-semibold text-gray-800">
                {T("notificationsLink")}
              </span>
              <span className="text-[10px] text-gray-400">{T("viewNotifications")}</span>
            </div>
          </div>
          <ChevronRight size={16} className="text-gray-300" />
        </Link>
      </div>
    </div>
  );
}
