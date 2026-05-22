import { tDual, type TranslationKey } from "@workspace/i18n";
import { useLanguage } from "../lib/useLanguage";

interface Props {
  message: string;
  appName?: string;
}

export function MaintenanceScreen({ message, appName = "AJKMart" }: Props) {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  return (
    <div className="pointer-events-auto fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-700 p-6">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-2xl">
        <div className="mb-4 text-6xl">🔧</div>
        <h1 className="mb-2 text-2xl font-extrabold text-gray-900">
          {appName} {T("maintenanceTitle")}
        </h1>
        <div className="mx-auto mb-4 h-1 w-16 rounded-full bg-blue-500" />
        <p className="mb-6 text-sm leading-relaxed text-gray-600">
          {message || T("maintenanceDefaultMsg")}
        </p>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-xs font-medium text-blue-700">
          ⏱ {T("maintenanceBack")}
        </div>
        <p className="mt-4 text-xs text-gray-400">
          {T("vendorPortal")} · {appName}
        </p>
      </div>
    </div>
  );
}
