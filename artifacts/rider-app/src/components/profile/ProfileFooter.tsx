import { tDual, type TranslationKey } from "@workspace/i18n";
import {
  Clock,
  Facebook,
  FileText,
  HelpCircle,
  Info,
  Instagram,
  Lock,
  Mail,
  MessageCircle,
  RefreshCcw,
} from "lucide-react";

interface PlatformConfig {
  platform: {
    appName?: string;
    supportPhone?: string;
    supportHours?: string;
    supportEmail?: string;
    socialFacebook?: string;
    socialInstagram?: string;
  };
  content: {
    tncUrl?: string;
    privacyUrl?: string;
    refundPolicyUrl?: string;
    faqUrl?: string;
    aboutUrl?: string;
  };
  features: {
    chat?: boolean;
  };
}

interface ProfileFooterProps {
  config: PlatformConfig;
  language: string;
}

export function ProfileFooter({ config, language }: ProfileFooterProps) {
  const T = (key: TranslationKey) => tDual(key, language as never);

  return (
    <div className="space-y-3 rounded-3xl border border-gray-100 bg-white p-5">
      <p className="text-center text-xs leading-relaxed font-medium text-gray-500">
        {config.platform.appName} {T("riderPortal")} · {T("contactSupport")}:{" "}
        <a href={`tel:${config.platform.supportPhone}`} className="font-semibold text-gray-900">
          {config.platform.supportPhone}
        </a>
      </p>
      {config.platform.supportHours && (
        <p className="flex items-center justify-center gap-1 text-center text-xs text-gray-400">
          <Clock size={11} /> {config.platform.supportHours}
        </p>
      )}
      {config.platform.supportEmail && (
        <p className="flex items-center justify-center gap-1 text-center text-xs text-gray-500">
          <Mail size={11} />
          <a
            href={`mailto:${config.platform.supportEmail}`}
            className="text-gray-900 hover:text-gray-700"
          >
            {config.platform.supportEmail}
          </a>
        </p>
      )}
      {(config.platform.socialFacebook || config.platform.socialInstagram) && (
        <div className="flex justify-center gap-3 pt-1">
          {config.platform.socialFacebook && (
            <a
              href={config.platform.socialFacebook}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-blue-600"
            >
              <Facebook size={13} /> {T("followUsLabel")}
            </a>
          )}
          {config.platform.socialInstagram && (
            <a
              href={config.platform.socialInstagram}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-pink-600"
            >
              <Instagram size={13} /> {T("followUsLabel")}
            </a>
          )}
        </div>
      )}
      {(config.content.tncUrl ||
        config.content.privacyUrl ||
        config.content.refundPolicyUrl ||
        config.content.faqUrl ||
        config.content.aboutUrl ||
        config.features.chat) && (
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 pt-1">
          {config.content.tncUrl && (
            <a
              href={config.content.tncUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-[11px] text-gray-600 underline underline-offset-2"
            >
              <FileText size={10} /> {T("termsConditions")}
            </a>
          )}
          {config.content.privacyUrl && (
            <a
              href={config.content.privacyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-[11px] text-gray-600 underline underline-offset-2"
            >
              <Lock size={10} /> {T("privacyPolicy")}
            </a>
          )}
          {config.content.refundPolicyUrl && (
            <a
              href={config.content.refundPolicyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-[11px] text-gray-600 underline underline-offset-2"
            >
              <RefreshCcw size={10} /> {T("refundPolicy")}
            </a>
          )}
          {config.content.faqUrl && (
            <a
              href={config.content.faqUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-[11px] text-gray-600 underline underline-offset-2"
            >
              <HelpCircle size={10} /> {T("faqLabel")}
            </a>
          )}
          {config.content.aboutUrl && (
            <a
              href={config.content.aboutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-[11px] text-gray-600 underline underline-offset-2"
            >
              <Info size={10} /> {T("aboutLabel")}
            </a>
          )}
          {config.features.chat && (
            <a
              href={`https://wa.me/${config.platform.supportPhone?.replace(/^0/, "92")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-[11px] text-gray-600 underline underline-offset-2"
            >
              <MessageCircle size={10} /> {T("liveChatLabel")}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
