import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

export interface PlatformConfig {
  currencySymbol?: string;
  currencyCode?: string;
  vendor: {
    commissionPct: number;
    settleDays: number;
    minPayout: number;
    maxPayout: number;
    minOrder: number;
    maxItems: number;
    autoApprove: boolean;
    promoEnabled: boolean;
    withdrawalEnabled: boolean;
    lowStockThreshold: number;
    requireDocuments?: boolean;
  };
  platform: {
    appName: string;
    appTagline: string;
    appVersion: string;
    appStatus: "active" | "maintenance" | "limited";
    supportPhone: string;
    supportEmail: string;
    supportHours: string;
    businessAddress: string;
    socialFacebook: string;
    socialInstagram: string;
    commissionPct: number;
    vendorCommissionPct: number;
    minOrderAmount: number;
    currencySymbol?: string;
    currencyCode?: string;
  };
  features: {
    mart: boolean;
    food: boolean;
    rides: boolean;
    pharmacy: boolean;
    parcel: boolean;
    wallet: boolean;
    referral: boolean;
    newUsers: boolean;
    chat: boolean;
    liveTracking: boolean;
    reviews: boolean;
  };
  content: {
    trackerBannerEnabled: boolean;
    trackerBannerPosition: "top" | "bottom";
    showBanner: boolean;
    banner: string;
    announcement: string;
    maintenanceMsg: string;
    supportMsg: string;
    vendorNotice: string;
    riderNotice: string;
    tncUrl: string;
    privacyUrl: string;
    refundPolicyUrl: string;
    faqUrl: string;
    aboutUrl: string;
  };
  orderRules: {
    minOrderAmount: number;
    maxCodAmount: number;
    maxCartValue: number;
    cancelWindowMin: number;
    autoCancelMin: number;
    refundDays: number;
    preptimeMin: number;
    ratingWindowHours: number;
    scheduleEnabled: boolean;
  };
  deliveryFee: {
    mart: number;
    food: number;
    pharmacy: number;
    parcel: number;
    parcelPerKg: number;
    freeEnabled: boolean;
    freeDeliveryAbove: number;
  };
  finance: {
    gstEnabled: boolean;
    gstPct: number;
    cashbackEnabled: boolean;
    cashbackPct: number;
    cashbackMaxRs: number;
    invoiceEnabled: boolean;
    platformCommissionPct: number;
    vendorCommissionPct: number;
    riderEarningPct: number;
    minVendorPayout: number;
    minRiderPayout: number;
    vendorSettleDays: number;
    referralBonus: number;
  };
  uploads?: {
    maxImageMb?: number;
    maxVideoMb?: number;
    maxVideoDurationSec?: number;
    allowedImageFormats?: string[];
    allowedVideoFormats?: string[];
  };
  cities?: string[];
  auth?: {
    phoneOtpEnabled?: boolean | { customer?: boolean; rider?: boolean; vendor?: boolean };
    emailOtpEnabled?: boolean | { customer?: boolean; rider?: boolean; vendor?: boolean };
    usernamePasswordEnabled?: boolean | { customer?: boolean; rider?: boolean; vendor?: boolean };
    googleEnabled?: boolean | { customer?: boolean; rider?: boolean; vendor?: boolean };
    facebookEnabled?: boolean | { customer?: boolean; rider?: boolean; vendor?: boolean };
    magicLinkEnabled?: boolean | { customer?: boolean; rider?: boolean; vendor?: boolean };
    captchaEnabled?: boolean;
    captchaSiteKey?: string;
    googleClientId?: string;
    facebookAppId?: string;
    lockoutEnabled?: boolean;
    lockoutMaxAttempts?: number;
    lockoutDurationSec?: number;
  };
  wallet?: {
    withdrawalProcessingDays?: number | null;
  };
  integrations?: {
    pushNotif: boolean;
    analytics: boolean;
    analyticsPlatform: string;
    analyticsTrackingId: string;
    analyticsDebug: boolean;
    sentry: boolean;
    sentryDsn: string;
    sentryEnvironment: string;
    sentrySampleRate: number;
    sentryTracesSampleRate: number;
    maps: boolean;
    mapsAutocomplete: boolean;
    mapsGeocoding: boolean;
    mapsDistanceMatrix: boolean;
    whatsapp: boolean;
    sms: boolean;
    email: boolean;
    jazzcash?: { enabled?: boolean };
    easypaisa?: { enabled?: boolean };
  };
  network?: {
    apiTimeoutMs: number;
    maxRetryAttempts: number;
    retryBackoffBaseMs: number;
    riderGpsQueueMax: number;
    riderDismissedRequestTtlSec: number;
  };
  regional?: {
    phoneFormat?: string;
    phoneHint?: string;
    timezone?: string;
    currencySymbol?: string;
    countryCode?: string;
  };
  branding?: {
    colorMart?: string;
    colorFood?: string;
    colorRides?: string;
    colorPharmacy?: string;
    colorParcel?: string;
    colorVan?: string;
    mapCenterLat?: number;
    mapCenterLng?: number;
    mapCenterLabel?: string;
  };
  compliance?: {
    termsVersion?: string;
    privacyVersion?: string;
    minAppVersion?: string;
  };
}

const DEFAULT_CONFIG: PlatformConfig = {
  vendor: {
    commissionPct: 15,
    settleDays: 7,
    minPayout: 500,
    maxPayout: 50000,
    minOrder: 100,
    maxItems: 100,
    autoApprove: false,
    promoEnabled: true,
    withdrawalEnabled: true,
    lowStockThreshold: 10,
  },
  platform: {
    appName: "AJKMart",
    appTagline: "Your super app for everything",
    appVersion: "1.0.0",
    appStatus: "active",
    supportPhone: "03001234567",
    supportEmail: "",
    supportHours: "Mon–Sat, 8AM–10PM",
    businessAddress: "Muzaffarabad, AJK, Pakistan",
    socialFacebook: "",
    socialInstagram: "",
    commissionPct: 10,
    vendorCommissionPct: 15,
    minOrderAmount: 100,
  },
  features: {
    mart: true,
    food: true,
    rides: true,
    pharmacy: true,
    parcel: true,
    wallet: true,
    referral: true,
    newUsers: true,
    chat: false,
    liveTracking: true,
    reviews: true,
  },
  content: {
    trackerBannerEnabled: true,
    trackerBannerPosition: "top",
    showBanner: true,
    banner: "Free delivery on your first order! 🎉",
    announcement: "",
    maintenanceMsg: "We're performing scheduled maintenance. Back soon!",
    supportMsg: "Need help? Chat with us!",
    vendorNotice: "",
    riderNotice: "",
    tncUrl: "",
    privacyUrl: "",
    refundPolicyUrl: "",
    faqUrl: "",
    aboutUrl: "",
  },
  orderRules: {
    minOrderAmount: 100,
    maxCodAmount: 5000,
    maxCartValue: 50000,
    cancelWindowMin: 5,
    autoCancelMin: 15,
    refundDays: 3,
    preptimeMin: 15,
    ratingWindowHours: 48,
    scheduleEnabled: false,
  },
  deliveryFee: {
    mart: 80,
    food: 60,
    pharmacy: 50,
    parcel: 100,
    parcelPerKg: 40,
    freeEnabled: true,
    freeDeliveryAbove: 1000,
  },
  finance: {
    gstEnabled: false,
    gstPct: 17,
    cashbackEnabled: false,
    cashbackPct: 2,
    cashbackMaxRs: 100,
    invoiceEnabled: false,
    platformCommissionPct: 10,
    vendorCommissionPct: 15,
    riderEarningPct: 80,
    minVendorPayout: 500,
    minRiderPayout: 500,
    vendorSettleDays: 7,
    referralBonus: 100,
  },
};

function resolveVendorFlag(
  perRole: boolean | { customer?: boolean; rider?: boolean; vendor?: boolean } | undefined
): boolean {
  if (typeof perRole === "boolean") return perRole;
  if (perRole && typeof perRole === "object" && "vendor" in perRole) {
    return typeof perRole.vendor === "boolean" ? perRole.vendor : false;
  }
  return false;
}

export interface VendorAuthConfig {
  phoneOtp: boolean;
  emailOtp: boolean;
  usernamePassword: boolean;
  google: boolean;
  facebook: boolean;
  magicLink: boolean;
  captchaEnabled: boolean;
  captchaSiteKey: string;
  lockoutEnabled: boolean;
  lockoutMaxAttempts: number;
  lockoutDurationSec: number;
  googleClientId?: string;
  facebookAppId?: string;
}

export function getVendorAuthConfig(config: PlatformConfig): VendorAuthConfig {
  const a = config.auth;
  if (!a)
    return {
      phoneOtp: false,
      emailOtp: false,
      usernamePassword: false,
      google: false,
      facebook: false,
      magicLink: false,
      captchaEnabled: false,
      captchaSiteKey: "",
      lockoutEnabled: false,
      lockoutMaxAttempts: 5,
      lockoutDurationSec: 300,
    };
  return {
    phoneOtp: resolveVendorFlag(a.phoneOtpEnabled),
    emailOtp: resolveVendorFlag(a.emailOtpEnabled),
    usernamePassword: resolveVendorFlag(a.usernamePasswordEnabled),
    google: resolveVendorFlag(a.googleEnabled),
    facebook: resolveVendorFlag(a.facebookEnabled),
    magicLink: resolveVendorFlag(a.magicLinkEnabled),
    captchaEnabled: a.captchaEnabled ?? false,
    captchaSiteKey: a.captchaSiteKey ?? "",
    lockoutEnabled: a.lockoutEnabled ?? false,
    lockoutMaxAttempts: a.lockoutMaxAttempts ?? 5,
    lockoutDurationSec: a.lockoutDurationSec ?? 300,
    googleClientId: a.googleClientId,
    facebookAppId: a.facebookAppId,
  };
}

export function usePlatformConfig() {
  const { data, isLoading } = useQuery<PlatformConfig>({
    queryKey: ["platform-config"],
    queryFn: () => apiFetch("/platform-config"),
    staleTime: 25_000,
    refetchInterval: 30_000,
    retry: 2,
  });
  return { config: data ?? DEFAULT_CONFIG, isLoading };
}

export function useCurrency() {
  const { config } = usePlatformConfig();
  return {
    symbol:
      config.platform.currencySymbol ??
      config.currencySymbol ??
      config.regional?.currencySymbol ??
      "Rs.",
    code: config.platform.currencyCode ?? config.currencyCode ?? "PKR",
  };
}

export function buildPhoneValidator(config: PlatformConfig): (phone: string) => boolean {
  const pattern = config.regional?.phoneFormat;
  if (!pattern) return () => true;
  try {
    const re = new RegExp(pattern);
    return (phone: string) => re.test(phone.trim());
  } catch {
    return () => true;
  }
}

export function usePhoneValidator(): (phone: string) => boolean {
  const { config } = usePlatformConfig();
  return buildPhoneValidator(config);
}

export function useDateFormatter(): (
  date: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
) => string {
  const { config } = usePlatformConfig();
  const tz = config.regional?.timezone;
  return (date, options) => formatDateTz(date, options, tz);
}

export function formatDateTz(
  date: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
  timezone?: string
): string {
  if (!date) return "";
  try {
    const tz = timezone || "Asia/Karachi";
    return new Intl.DateTimeFormat("en-PK", { timeZone: tz, ...options }).format(
      typeof date === "string" ? new Date(date) : date
    );
  } catch {
    return new Date(date as string).toLocaleString();
  }
}
