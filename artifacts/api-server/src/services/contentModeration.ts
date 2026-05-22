import { logger } from "../lib/logger.js";
interface ModerationResult {
  masked: string;
  original: string;
  detections: { type: string; value: string; masked: string }[];
}

const PHONE_PATTERNS = [
  /(?:\+92|0092)\s*[\-.]?\s*\d{3}\s*[\-.]?\s*\d{7}/g,
  /0[3][0-9]{2}[\s\-.]?\d{7}/g,
  /0[2-9][1-9][\s\-.]?\d{7,8}/g,
  /\+?\d{1,4}[\s\-.]?\(?\d{1,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/g,
  /\b\d{4}[\s\-.]?\d{7}\b/g,
];

const EMAIL_PATTERN = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const CNIC_PATTERN = /\b\d{5}[\s\-]?\d{7}[\s\-]?\d{1}\b/g;

const IBAN_PATTERN = /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/g;
const _BANK_ACCOUNT_PATTERN = /\b\d{10,16}\b/g;

const ADDRESS_PATTERNS = [
  /\b(?:house|flat|apartment|plot|street|road|sector|block|phase|gulberg|dha|bahria|model\s*town|garden\s*town|cantt|saddar|blue\s*area|f-\d+|g-\d+|i-\d+|h-\d+)\b[^.!?\n]{0,60}/gi,
];

let _currentModerationConfig: ModerationConfig | undefined;

function maskValue(value: string, type: string): string {
  const config = _currentModerationConfig;
  if (type === "phone") {
    if (config?.maskFormatPhone) return config.maskFormatPhone;
    if (value.length <= 4) return "***";
    return value.slice(0, 3) + "*".repeat(value.length - 5) + value.slice(-2);
  }
  if (type === "email") {
    if (config?.maskFormatEmail) return config.maskFormatEmail;
    const [local, domain] = value.split("@");
    if (!local || !domain) return "***@***";
    return local.slice(0, 2) + "***@" + domain.slice(0, 2) + "***";
  }
  if (type === "cnic") {
    if (config?.maskFormatCnic) return config.maskFormatCnic;
    return value.slice(0, 2) + "***-*******-*";
  }
  if (type === "bank") {
    return value.slice(0, 2) + "*".repeat(value.length - 4) + value.slice(-2);
  }
  if (type === "address") {
    return "[address hidden]";
  }
  return "***";
}

export interface CustomPattern {
  pattern: string;
  severity: "low" | "medium" | "high";
  label?: string;
}

export interface ModerationConfig {
  hidePhone?: boolean;
  hideEmail?: boolean;
  hideCnic?: boolean;
  hideBank?: boolean;
  hideAddress?: boolean;
  flagKeywords?: string[];
  customPatterns?: CustomPattern[];
  maskFormatPhone?: string;
  maskFormatEmail?: string;
  maskFormatCnic?: string;
}

export function moderateContent(
  text: string,
  config: ModerationConfig = {}
): ModerationResult & { customHits?: { pattern: string; severity: string; matches: string[] }[] } {
  const {
    hidePhone = true,
    hideEmail = true,
    hideCnic = true,
    hideBank = true,
    hideAddress = true,
    customPatterns = [],
  } = config;

  _currentModerationConfig = config;

  let masked = text;
  const detections: { type: string; value: string; masked: string }[] = [];
  const processedRanges: [number, number][] = [];

  function isOverlapping(start: number, end: number): boolean {
    return processedRanges.some(([s, e]) => start < e && end > s);
  }

  if (hideCnic) {
    const matches = [...text.matchAll(CNIC_PATTERN)];
    for (const m of matches) {
      if (m.index !== undefined && !isOverlapping(m.index, m.index + m[0].length)) {
        const mv = maskValue(m[0], "cnic");
        detections.push({ type: "cnic", value: m[0], masked: mv });
        processedRanges.push([m.index, m.index + m[0].length]);
      }
    }
  }

  if (hideEmail) {
    const matches = [...text.matchAll(EMAIL_PATTERN)];
    for (const m of matches) {
      if (m.index !== undefined && !isOverlapping(m.index, m.index + m[0].length)) {
        const mv = maskValue(m[0], "email");
        detections.push({ type: "email", value: m[0], masked: mv });
        processedRanges.push([m.index, m.index + m[0].length]);
      }
    }
  }

  if (hidePhone) {
    for (const pattern of PHONE_PATTERNS) {
      const matches = [...text.matchAll(pattern)];
      for (const m of matches) {
        if (m.index !== undefined && !isOverlapping(m.index, m.index + m[0].length)) {
          const val = m[0].trim();
          if (val.length >= 7) {
            const mv = maskValue(val, "phone");
            detections.push({ type: "phone", value: val, masked: mv });
            processedRanges.push([m.index, m.index + m[0].length]);
          }
        }
      }
    }
  }

  if (hideBank) {
    const ibanMatches = [...text.matchAll(IBAN_PATTERN)];
    for (const m of ibanMatches) {
      if (m.index !== undefined && !isOverlapping(m.index, m.index + m[0].length)) {
        const mv = maskValue(m[0], "bank");
        detections.push({ type: "bank", value: m[0], masked: mv });
        processedRanges.push([m.index, m.index + m[0].length]);
      }
    }
  }

  if (hideAddress) {
    for (const pattern of ADDRESS_PATTERNS) {
      const matches = [...text.matchAll(pattern)];
      for (const m of matches) {
        if (m.index !== undefined && !isOverlapping(m.index, m.index + m[0].length)) {
          const mv = maskValue(m[0], "address");
          detections.push({ type: "address", value: m[0], masked: mv });
          processedRanges.push([m.index, m.index + m[0].length]);
        }
      }
    }
  }

  processedRanges.sort((a, b) => b[0] - a[0]);
  for (const detection of detections.slice().reverse()) {
    const idx = masked.indexOf(detection.value);
    if (idx >= 0) {
      masked = masked.slice(0, idx) + detection.masked + masked.slice(idx + detection.value.length);
    }
  }

  _currentModerationConfig = undefined;

  const customHits: { pattern: string; severity: string; matches: string[] }[] = [];
  if (customPatterns.length > 0) {
    for (const cp of customPatterns) {
      try {
        if (cp.pattern.length > 200) continue;
        const re = new RegExp(cp.pattern, "gi");
        const testStr = text.slice(0, 10000);
        const found = [...testStr.matchAll(re)].map((m) => m[0]);
        if (found.length > 0) {
          customHits.push({
            pattern: cp.pattern,
            severity: cp.severity,
            matches: found.slice(0, 50),
          });
        }
      } catch (err) {
        /* intentional: non-fatal guard */ void err;
      }
    }
  }

  return {
    masked,
    original: text,
    detections,
    customHits: customHits.length ? customHits : undefined,
  };
}

export function checkFlagKeywords(text: string, keywords: string[]): string | null {
  if (!keywords.length) return null;
  const lower = text.toLowerCase();
  for (const keyword of keywords) {
    if (lower.includes(keyword.toLowerCase())) {
      return keyword;
    }
  }
  return null;
}

export function getModerationConfigFromSettings(
  settings: Record<string, string>
): ModerationConfig {
  let customPatterns: CustomPattern[] = [];
  const rawPatterns = settings["moderation_custom_patterns"];
  if (rawPatterns) {
    try {
      const parsed = JSON.parse(rawPatterns);
      if (Array.isArray(parsed)) {
        customPatterns = parsed.filter((p: any) => p.pattern && typeof p.pattern === "string");
      }
    } catch (err) {
      logger.warn(
        "[content-moderation] Failed to parse custom patterns from settings — all custom rules disabled:",
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return {
    hidePhone: settings["comm_hide_phone"] !== "off",
    hideEmail: settings["comm_hide_email"] !== "off",
    hideCnic: settings["comm_hide_cnic"] !== "off",
    hideBank: settings["comm_hide_bank"] !== "off",
    hideAddress: settings["comm_hide_address"] !== "off",
    flagKeywords: settings["comm_flag_keywords"]
      ? settings["comm_flag_keywords"]
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean)
      : [],
    customPatterns,
    maskFormatPhone: settings["comm_mask_format_phone"] || undefined,
    maskFormatEmail: settings["comm_mask_format_email"] || undefined,
    maskFormatCnic: settings["comm_mask_format_cnic"] || undefined,
  };
}
