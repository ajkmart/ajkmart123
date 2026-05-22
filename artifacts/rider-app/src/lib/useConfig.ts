import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

export interface PlatformConfig {
  currencySymbol?: string;
  currencyCode?: string;
  rider?: {
    keepPct: number;
    bonusPerTrip: number;
    minPayout: number;
    maxPayout: number;
    maxDeliveries: number;
    cashAllowed: boolean;
    withdrawalEnabled: boolean;
    autoApprove: boolean;
    minBalance: number;
    depositEnabled: boolean;
    dailyGoal: number;
    modules?: {
      wallet: boolean;
      earnings: boolean;
      history: boolean;
      twoFaRequired: boolean;
      gpsTracking: boolean;
      profileEdit: boolean;
      supportChat: boolean;
    };
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
    sos: boolean;
    van?: boolean;
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
  rides: {
    bikeBaseFare: number;
    bikePerKm: number;
    bikeMinFare: number;
    carBaseFare: number;
    carPerKm: number;
    carMinFare: number;
    surgeEnabled: boolean;
    surgeMultiplier: number;
    cancellationFee: number;
    riderEarningPct: number;
    counterMaxMultiplier?: number;
    rickshawMinFare?: number;
    dabaMinFare?: number;
    acceptTimeoutSec?: number;
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
  dispatch?: {
    broadcastTimeoutSec?: number;
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
  wallet?: {
    withdrawalProcessingDays?: number;
    maxDailyWithdrawal?: number;
    maxDailyTransactionCount?: number;
    kycRequired?: boolean;
  };
  geofence?: {
    polygon?: Array<[number, number]>;
  };
  payment?: {
    jazzcashNumber?: string;
    easypaisaNumber?: string;
    bankIban?: string;
    bankName?: string;
  };
  security?: {
    gpsTracking: boolean;
    gpsInterval: number;
    sessionDays: number;
    riderTokenDays: number;
    maxSpeedKmh?: number;
  };
  uploads?: {
    maxImageMb?: number;
    maxVideoMb?: number;
    maxVideoDurationSec?: number;
    allowedImageFormats?: string[];
    allowedVideoFormats?: string[];
  };
  auth?: {
    phoneOtp?: boolean;
    emailOtp?: boolean;
    usernamePassword?: boolean;
    google?: boolean;
    facebook?: boolean;
    magicLink?: boolean;
    captchaEnabled?: boolean;
    lockoutEnabled?: boolean;
    lockoutMaxAttempts?: number;
    lockoutDurationSec?: number;
    phoneOtpEnabled?: boolean | { customer?: boolean; rider?: boolean; vendor?: boolean };
    emailOtpEnabled?: boolean | { customer?: boolean; rider?: boolean; vendor?: boolean };
    usernamePasswordEnabled?: boolean | { customer?: boolean; rider?: boolean; vendor?: boolean };
    googleEnabled?: boolean | { customer?: boolean; rider?: boolean; vendor?: boolean };
    facebookEnabled?: boolean | { customer?: boolean; rider?: boolean; vendor?: boolean };
    magicLinkEnabled?: boolean | { customer?: boolean; rider?: boolean; vendor?: boolean };
    captchaSiteKey?: string;
    googleClientId?: string;
    facebookAppId?: string;
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
  };
  network?: {
    apiTimeoutMs: number;
    maxRetryAttempts: number;
    retryBackoffBaseMs: number;
    riderGpsQueueMax: number;
    riderDismissedRequestTtlSec: number;
  };
}

const DEFAULT_CONFIG: PlatformConfig = {
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
    currencySymbol: "Rs.",
    currencyCode: "PKR",
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
    sos: true,
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
  rides: {
    bikeBaseFare: 15,
    bikePerKm: 8,
    bikeMinFare: 50,
    carBaseFare: 25,
    carPerKm: 12,
    carMinFare: 80,
    surgeEnabled: false,
    surgeMultiplier: 1.5,
    cancellationFee: 30,
    riderEarningPct: 80,
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
  auth: {
    phoneOtp: false,
    emailOtp: false,
    usernamePassword: false,
    google: false,
    facebook: false,
    magicLink: false,
    captchaEnabled: false,
    lockoutEnabled: true,
    lockoutMaxAttempts: 5,
    lockoutDurationSec: 300,
  },
  security: { gpsTracking: true, gpsInterval: 30, sessionDays: 30, riderTokenDays: 7 },
  rider: {
    keepPct: 80,
    bonusPerTrip: 0,
    minPayout: 500,
    maxPayout: 50000,
    maxDeliveries: 3,
    cashAllowed: true,
    withdrawalEnabled: true,
    autoApprove: false,
    minBalance: 0,
    depositEnabled: false,
    dailyGoal: 5000,
  },
  uploads: {
    maxImageMb: 5,
    maxVideoMb: 50,
    maxVideoDurationSec: 60,
    allowedImageFormats: [],
    allowedVideoFormats: [],
  },
};

export interface RiderAuthConfig {
  phoneOtp: boolean;
  emailOtp: boolean;
  usernamePassword: boolean;
  google: boolean;
  facebook: boolean;
  magicLink: boolean;
  captchaEnabled: boolean;
  lockoutEnabled: boolean;
  lockoutMaxAttempts: number;
  lockoutDurationSec: number;
}

function resolveRoleFlag(
  simple: boolean | undefined,
  perRole: boolean | { customer?: boolean; rider?: boolean; vendor?: boolean } | undefined,
  fallback: boolean
): boolean {
  if (typeof simple === "boolean") return simple;
  if (typeof perRole === "boolean") return perRole;
  if (perRole && typeof perRole === "object" && "rider" in perRole) {
    return typeof perRole.rider === "boolean" ? perRole.rider : fallback;
  }
  return fallback;
}

export function getRiderAuthConfig(config: PlatformConfig): RiderAuthConfig {
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
      lockoutEnabled: true,
      lockoutMaxAttempts: 5,
      lockoutDurationSec: 300,
    };
  return {
    phoneOtp: resolveRoleFlag(a.phoneOtp, a.phoneOtpEnabled, false),
    emailOtp: resolveRoleFlag(a.emailOtp, a.emailOtpEnabled, false),
    usernamePassword: resolveRoleFlag(a.usernamePassword, a.usernamePasswordEnabled, false),
    google: resolveRoleFlag(a.google, a.googleEnabled, false),
    facebook: resolveRoleFlag(a.facebook, a.facebookEnabled, false),
    magicLink: resolveRoleFlag(a.magicLink, a.magicLinkEnabled, false),
    captchaEnabled: a.captchaEnabled ?? false,
    lockoutEnabled: a.lockoutEnabled ?? true,
    lockoutMaxAttempts: a.lockoutMaxAttempts ?? 5,
    lockoutDurationSec: a.lockoutDurationSec ?? 300,
  };
}

export interface RiderModules {
  wallet: boolean;
  earnings: boolean;
  history: boolean;
  twoFaRequired: boolean;
  gpsTracking: boolean;
  profileEdit: boolean;
  supportChat: boolean;
}

const DEFAULT_MODULES: RiderModules = {
  wallet: true,
  earnings: true,
  history: true,
  twoFaRequired: false,
  gpsTracking: true,
  profileEdit: true,
  supportChat: true,
};

export function getRiderModules(config: PlatformConfig): RiderModules {
  return { ...DEFAULT_MODULES, ...config.rider?.modules };
}

export function usePlatformConfig() {
  const { data, isLoading } = useQuery<PlatformConfig>({
    queryKey: ["platform-config"],
    queryFn: () => apiFetch("/platform-config") as Promise<PlatformConfig>,
    staleTime: 25_000,
    refetchInterval: 30_000,
    retry: 2,
  });
  const config: PlatformConfig = data
    ? { ...DEFAULT_CONFIG, ...data, rider: { ...DEFAULT_CONFIG.rider!, ...data.rider } }
    : DEFAULT_CONFIG;
  return { config, isLoading };
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
