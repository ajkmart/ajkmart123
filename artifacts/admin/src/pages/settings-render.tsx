import { SLabel, Toggle } from "@/components/AdminShared";
import { ManageInSettingsLink } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Bike,
  Building2,
  Car,
  CheckCircle2,
  ChevronDown,
  FileText,
  Gift,
  Globe,
  Info,
  Link as LinkIcon,
  MessageSquare,
  Package,
  Percent,
  Phone,
  RotateCcw,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Star,
  Store,
  ToggleRight,
  Truck,
  UserPlus,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { Fragment, ReactNode } from "react";

export interface Setting {
  key: string;
  value: string;
  label: string;
  category: string;
}

/** Shared props contract for extracted settings tab sections (General, Notifications, Monitoring). */
export interface SettingsSectionProps {
  settings: Setting[];
  grouped: Record<string, Setting[]>;
  localValues: Record<string, string>;
  dirtyKeys: Set<string>;
  handleChange: (key: string, value: string) => void;
  handleToggle: (key: string, val: boolean) => void;
}

export type CatKey =
  | "general"
  | "features"
  | "rides"
  | "orders"
  | "delivery"
  | "customer"
  | "rider"
  | "vendor"
  | "finance"
  | "payment"
  | "content"
  | "integrations"
  | "security"
  | "system"
  | "weather"
  | "dispatch"
  | "branding"
  | "system_limits"
  | "regional"
  | "notifications"
  | "uploads"
  | "pagination"
  | "van"
  | "onboarding"
  | "moderation"
  | "cache"
  | "jwt"
  | "ratelimit"
  | "geo"
  | "localization"
  | "network"
  | "compliance";

export const TOGGLE_KEYS = new Set([
  "feature_mart",
  "feature_food",
  "feature_rides",
  "feature_pharmacy",
  "feature_parcel",
  "feature_wallet",
  "feature_referral",
  "feature_new_users",
  "user_require_approval",
  "customer_referral_enabled",
  "customer_loyalty_enabled",
  "rider_cash_allowed",
  "rider_auto_approve",
  "rider_withdrawal_enabled",
  "rider_deposit_enabled",
  "rider_module_wallet",
  "rider_module_earnings",
  "rider_module_history",
  "rider_module_2fa_required",
  "rider_module_gps_tracking",
  "rider_module_profile_edit",
  "rider_module_support_chat",
  "vendor_auto_approve",
  "vendor_promo_enabled",
  "vendor_withdrawal_enabled",
  "feature_weather",
  "feature_chat",
  "feature_live_tracking",
  "feature_reviews",
  "feature_sos",
  "security_lockout_enabled",
  "security_otp_bypass",
  "security_mfa_required",
  "security_multi_device",
  "security_gps_tracking",
  "security_geo_fence",
  "security_spoof_detection",
  "security_block_tor",
  "security_block_vpn",
  "security_pwd_strong",
  "security_allow_uploads",
  "security_compress_images",
  "security_scan_uploads",
  "security_fake_order_detect",
  "security_auto_block_ip",
  "security_phone_verify",
  "security_single_phone",
  "security_audit_log",
  "geo_open_world_fallback",
  "order_gps_capture_enabled",
  "profile_show_saved_addresses",
  "upload_payment_proof",
  "upload_kyc_docs",
  "upload_rider_docs",
  "upload_vendor_docs",
  "upload_product_imgs",
  "upload_cod_proof",
  "notif_new_order",
  "notif_order_ready",
  "notif_ride_request",
  "notif_promo",
  "integration_push_notif",
  "integration_sms",
  "integration_analytics",
  "integration_email",
  "integration_sentry",
  "integration_whatsapp",
  "integration_maps",
  "analytics_debug_mode",
  "maps_distance_matrix",
  "maps_places_autocomplete",
  "maps_geocoding",
  "jazzcash_enabled",
  "jazzcash_proof_required",
  "jazzcash_allowed_mart",
  "jazzcash_allowed_food",
  "jazzcash_allowed_pharmacy",
  "jazzcash_allowed_parcel",
  "jazzcash_allowed_rides",
  "easypaisa_enabled",
  "easypaisa_proof_required",
  "easypaisa_allowed_mart",
  "easypaisa_allowed_food",
  "easypaisa_allowed_pharmacy",
  "easypaisa_allowed_parcel",
  "easypaisa_allowed_rides",
  "bank_enabled",
  "bank_proof_required",
  "bank_allowed_mart",
  "bank_allowed_food",
  "bank_allowed_pharmacy",
  "bank_allowed_parcel",
  "bank_allowed_rides",
  "cod_enabled",
  "cod_allowed_mart",
  "cod_allowed_food",
  "cod_allowed_pharmacy",
  "cod_allowed_parcel",
  "cod_allowed_rides",
  "cod_fake_penalty",
  "payment_auto_cancel",
  "payment_receipt_required",
  "wallet_p2p_enabled",
  "wallet_kyc_required",
  "wallet_allowed_mart",
  "wallet_allowed_food",
  "wallet_allowed_pharmacy",
  "wallet_allowed_parcel",
  "wallet_allowed_rides",
  "wallet_mpin_enabled",
  "wallet_cashback_on_orders",
  "wallet_cashback_on_rides",
  "wallet_cashback_on_pharmacy",
  "content_tracker_banner_enabled",
  "content_show_banner",
  "order_schedule_enabled",
  "finance_gst_enabled",
  "finance_cashback_enabled",
  "finance_invoice_enabled",
  "delivery_free_enabled",
  "ride_surge_enabled",
  "ride_bargaining_enabled",
  "ride_payment_cash",
  "ride_payment_wallet",
  "ride_payment_jazzcash",
  "ride_payment_easypaisa",
  "rider_ignore_restrict_enabled",
  "vendor_auto_schedule_enabled",
  "van_auto_notify_cancel",
  "van_require_start_trip",
  "comm_hide_phone",
  "comm_hide_email",
  "comm_hide_cnic",
  "comm_hide_bank",
  "comm_hide_address",
  /* email alert toggles */
  "email_alert_new_vendor",
  "email_alert_high_value_order",
  "email_alert_fraud",
  "email_alert_low_balance",
  "email_alert_daily_summary",
  "email_alert_weekly_report",
  /* whatsapp send flags */
  "wa_send_otp",
  "wa_send_order_update",
  "wa_send_ride_update",
  "wa_send_promo",
  "wa_send_rider_notif",
  "wa_send_vendor_notif",
  /* analytics tracking */
  "track_order_placed",
  "track_ride_booked",
  "track_user_signup",
  "track_wallet_topup",
  "track_screen_views",
  "track_search_queries",
  /* sentry capture */
  "sentry_capture_api",
  "sentry_capture_admin",
  "sentry_capture_vendor",
  "sentry_capture_rider",
  "sentry_capture_unhandled",
  "sentry_capture_perf",
  /* maps usage */
  "maps_use_customer_app",
  "maps_use_rider_app",
  "maps_use_vendor_app",
  "maps_live_tracking",
  /* maps provider toggles */
  "google_maps_enabled",
  "mapbox_enabled",
  "osm_enabled",
  "locationiq_enabled",
  "map_failover_enabled",
  /* communication feature toggles */
  "comm_enabled",
  "comm_chat_enabled",
  "comm_voice_calls_enabled",
  "comm_voice_notes_enabled",
  "comm_translation_enabled",
  "comm_chat_assist_enabled",
  /* auth method toggles */
  "auth_phone_otp_enabled",
  "auth_email_otp_enabled",
  "auth_username_password_enabled",
  "auth_email_register_enabled",
  "auth_magic_link_enabled",
  "auth_2fa_enabled",
  "auth_biometric_enabled",
  "auth_captcha_enabled",
]);

export const TEXT_KEYS = new Set([
  "app_name",
  "app_status",
  "support_phone",
  "app_tagline",
  "app_version",
  "support_email",
  "support_hours",
  "business_address",
  "social_facebook",
  "social_instagram",
  "content_banner",
  "content_announcement",
  "content_maintenance_msg",
  "content_support_msg",
  "content_vendor_notice",
  "content_rider_notice",
  "content_tnc_url",
  "content_privacy_url",
  "content_refund_policy_url",
  "content_faq_url",
  "content_about_url",
  "security_session_days",
  "security_admin_token_hrs",
  "security_rider_token_days",
  "security_login_max_attempts",
  "security_lockout_minutes",
  "security_otp_max_per_phone",
  "security_otp_max_per_ip",
  "security_otp_window_min",
  "security_rate_limit",
  "security_rate_admin",
  "security_rate_rider",
  "security_rate_vendor",
  "security_rate_burst",
  "security_gps_accuracy",
  "security_gps_interval",
  "security_max_speed_kmh",
  "security_pwd_min_length",
  "security_pwd_expiry_days",
  "security_jwt_rotation_days",
  "security_max_file_mb",
  "security_allowed_types",
  "security_img_quality",
  "security_max_daily_orders",
  "security_new_acct_limit",
  "security_same_addr_limit",
  "gps_mismatch_threshold_m",
  "cache_settings_ttl_sec",
  "cache_vpn_ttl_min",
  "cache_tor_ttl_min",
  "cache_zone_ttl_min",
  "jwt_access_ttl_sec",
  "jwt_refresh_ttl_days",
  "jwt_2fa_challenge_sec",
  "rate_bargain_per_min",
  "rate_booking_per_min",
  "rate_cancel_per_min",
  "rate_estimate_per_min",
  "geo_default_zone_radius_km",
  "currency_code",
  "currency_symbol",
  "security_admin_ip_whitelist",
  "security_maintenance_key",
  "fcm_server_key",
  "fcm_project_id",
  "fcm_sender_id",
  "fcm_app_id",
  "fcm_vapid_key",
  "sms_provider",
  "sms_api_key",
  "sms_account_sid",
  "sms_sender_id",
  "sms_msg91_key",
  "sms_template_otp",
  "sms_template_order",
  "smtp_host",
  "smtp_port",
  "smtp_user",
  "smtp_password",
  "smtp_from_email",
  "smtp_from_name",
  "smtp_secure",
  "smtp_admin_alert_email",
  "wa_phone_number_id",
  "wa_access_token",
  "wa_verify_token",
  "wa_business_account_id",
  "wa_order_template",
  "wa_otp_template",
  "analytics_platform",
  "analytics_tracking_id",
  "analytics_api_secret",
  "sentry_dsn",
  "sentry_environment",
  "sentry_sample_rate",
  "sentry_traces_sample_rate",
  "maps_api_key",
  "jazzcash_type",
  "jazzcash_mode",
  "jazzcash_merchant_id",
  "jazzcash_password",
  "jazzcash_salt",
  "jazzcash_currency",
  "jazzcash_return_url",
  "jazzcash_manual_name",
  "jazzcash_manual_number",
  "jazzcash_manual_instructions",
  "easypaisa_type",
  "easypaisa_mode",
  "easypaisa_store_id",
  "easypaisa_merchant_id",
  "easypaisa_hash_key",
  "easypaisa_username",
  "easypaisa_password",
  "easypaisa_manual_name",
  "easypaisa_manual_number",
  "easypaisa_manual_instructions",
  "bank_name",
  "bank_account_title",
  "bank_account_number",
  "bank_iban",
  "bank_branch_code",
  "bank_swift_code",
  "bank_instructions",
  "cod_restricted_areas",
  "cod_notes",
  "wallet_topup_methods",
  "dispatch_broadcast_timeout_sec",
  "ride_max_fare",
  "ride_counter_offer_max_multiplier",
  "brand_color_mart",
  "brand_color_food",
  "brand_color_rides",
  "brand_color_pharmacy",
  "brand_color_parcel",
  "brand_color_van",
  "brand_map_center_lat",
  "brand_map_center_lng",
  "brand_map_center_label",
  "system_log_retention_days",
  "system_cache_ttl_sec",
  "system_json_body_limit",
  "system_upload_size_limit",
  "api_timeout_ms",
  "max_retry_attempts",
  "retry_backoff_base_ms",
  "rider_gps_queue_max",
  "rider_dismissed_request_ttl_sec",
  "regional_phone_format",
  "regional_phone_hint",
  "regional_timezone",
  "regional_currency_symbol",
  "regional_country_code",
  "upload_max_image_mb",
  "upload_max_video_mb",
  "upload_max_video_duration_sec",
  "upload_allowed_image_formats",
  "upload_allowed_video_formats",
  "pagination_products_default",
  "pagination_products_max",
  "pagination_trending_limit",
  "pagination_flash_deals",
  "email_template_verify_html",
  "email_template_reset_html",
  "email_template_magic_html",
  "notif_text_ride_request",
  "notif_text_order_update",
  "alert_high_value_threshold",
  "fraud_same_address_limit",
  "fraud_gps_mismatch_threshold_m",
  "fraud_new_account_order_limit",
  "fraud_daily_order_limit",
  "vendor_auto_schedule_hours",
  "onboarding_slides",
  "moderation_custom_patterns",
  "comm_flag_keywords",
  "comm_mask_format_phone",
  "comm_mask_format_email",
  "comm_mask_format_cnic",
  "van_min_advance_hours",
  "van_max_seats_per_booking",
  "van_cancellation_window_hours",
  "van_refund_type",
  "van_refund_partial_pct",
  "van_seat_hold_minutes",
  "van_min_passengers",
  "van_min_check_hours_before",
  "van_max_driver_trips_day",
  "van_driver_rest_hours",
  "van_peak_surcharge_pct",
  "van_peak_hours",
  "van_weekend_surcharge_pct",
  "van_holiday_surcharge_pct",
  "van_holiday_dates",
]);

const _FEATURE_ICONS: Record<string, string> = {
  feature_mart: "🛒",
  feature_food: "🍔",
  feature_rides: "🚗",
  feature_pharmacy: "💊",
  feature_parcel: "📦",
  feature_wallet: "💰",
  feature_referral: "🎁",
  feature_new_users: "👤",
  feature_weather: "🌤️",
  integration_push_notif: "🔔",
  integration_analytics: "📊",
  integration_email: "📧",
  integration_sentry: "🐛",
  integration_whatsapp: "💬",
};

/**
 * Keys managed exclusively in the OTP Control Center page (/admin/otp-control).
 * Excluded from the generic settings render loop to avoid duplicate controls.
 * The SecuritySection in security.tsx also skips these to prevent duplication.
 */
export const OTP_CC_MANAGED_KEYS = new Set([
  "security_otp_max_per_phone",
  "security_otp_max_per_ip",
  "security_otp_window_min",
]);

const CONTENT_TEXTAREA_KEYS = new Set([
  "content_announcement",
  "content_maintenance_msg",
  "content_support_msg",
  "content_banner",
  "content_vendor_notice",
  "content_rider_notice",
]);
const CONTENT_CHAR_LIMITS: Record<string, number> = {
  content_banner: 80,
  content_announcement: 120,
  content_support_msg: 60,
  content_maintenance_msg: 200,
  content_vendor_notice: 150,
  content_rider_notice: 150,
};
const CONTENT_HINTS: Record<string, { hint: string; apps: string }> = {
  content_banner: {
    hint: "Promo ribbon below service pills on home screen. Leave empty to hide",
    apps: "📱 Customer App",
  },
  content_announcement: {
    hint: "Dismissable top bar. Leave empty to hide it in all apps",
    apps: "📱 Customer  •  🏪 Vendor  •  🏍️ Rider",
  },
  content_maintenance_msg: {
    hint: "Full-screen message shown when app_status = maintenance",
    apps: "📱 Customer  •  🏪 Vendor  •  🏍️ Rider",
  },
  content_support_msg: {
    hint: "Shown as subtitle in Call Support row and WhatsApp greeting",
    apps: "📱 Customer  •  🏪 Vendor  •  🏍️ Rider",
  },
  content_vendor_notice: {
    hint: "Info/warning banner shown at top of vendor dashboard. Leave empty to hide",
    apps: "🏪 Vendor App only",
  },
  content_rider_notice: {
    hint: "Info/warning banner shown at top of rider home screen. Leave empty to hide",
    apps: "🏍️ Rider App only",
  },
  content_tnc_url: {
    hint: "Opens in browser when user taps Terms of Service. Leave empty to hide",
    apps: "📱 Customer  •  🏪 Vendor  •  🏍️ Rider",
  },
  content_privacy_url: {
    hint: "Opens in browser when user taps Privacy Policy. Leave empty to hide",
    apps: "📱 Customer  •  🏪 Vendor  •  🏍️ Rider",
  },
  content_refund_policy_url: {
    hint: "Refund & Returns policy page. Leave empty to hide the row",
    apps: "📱 Customer  •  🏪 Vendor  •  🏍️ Rider",
  },
  content_faq_url: {
    hint: "Help Center or FAQ page. Leave empty to hide the row",
    apps: "📱 Customer  •  🏪 Vendor  •  🏍️ Rider",
  },
  content_about_url: {
    hint: "About Us page. Leave empty to hide the row",
    apps: "📱 Customer  •  🏪 Vendor  •  🏍️ Rider",
  },
};

type CardFrameVariant = "default" | "danger" | "note";
function CardFrame({
  isDirty,
  variant = "default",
  className = "",
  children,
}: {
  isDirty?: boolean;
  variant?: CardFrameVariant;
  className?: string;
  children: ReactNode;
}) {
  const variantClasses = isDirty
    ? "border-amber-300 bg-amber-50/30"
    : variant === "danger"
      ? "border-orange-300 bg-orange-50"
      : variant === "note"
        ? "border-slate-200 bg-white"
        : "border-border bg-white";
  return (
    <div className={`rounded-xl border p-4 transition-all ${variantClasses} ${className}`.trim()}>
      {children}
    </div>
  );
}

/**
 * Keys that are now managed in OTP Control Center and must be excluded from
 * the generic Security / Rate-Limit settings render loop to avoid duplication.
 */
const OTP_RATELIMIT_MANAGED_KEYS = new Set([
  "security_otp_max_per_phone",
  "security_otp_max_per_ip",
  "security_otp_window_min",
]);

/* ─── Other section renderers ────────────────────────────────────────────── */
export function renderSection(
  cat: CatKey,
  catSettings: Setting[],
  settings: Setting[],
  localValues: Record<string, string>,
  dirtyKeys: Set<string>,
  handleChange: (k: string, v: string) => void,
  handleToggle: (k: string, v: boolean) => void,
  getInputType: (k: string) => string,
  getInputSuffix: (k: string) => string,
  getPlaceholder: (k: string) => string
) {
  const filteredSettings =
    cat === "security" || cat === "ratelimit"
      ? catSettings.filter((s) => !OTP_RATELIMIT_MANAGED_KEYS.has(s.key))
      : catSettings;
  const toggles = filteredSettings.filter((s) => TOGGLE_KEYS.has(s.key));
  const inputs = filteredSettings.filter((s) => !TOGGLE_KEYS.has(s.key));

  const NumField = ({ s }: { s: Setting }) => {
    const isDirty = dirtyKeys.has(s.key);
    const suffix = getInputSuffix(s.key);
    return (
      <CardFrame isDirty={isDirty} className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-foreground text-sm font-semibold">{s.label}</label>
          {isDirty && (
            <Badge
              variant="outline"
              className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
            >
              CHANGED
            </Badge>
          )}
        </div>
        <div className="relative">
          <Input
            type={getInputType(s.key)}
            value={localValues[s.key] ?? s.value}
            onChange={(e) => handleChange(s.key, e.target.value)}
            placeholder={getPlaceholder(s.key)}
            className={`h-10 rounded-xl ${suffix ? "pr-16" : ""} ${isDirty ? "border-amber-300 bg-amber-50/50 ring-1 ring-amber-200" : ""}`}
            min={0}
          />
          {suffix && (
            <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-xs font-bold">
              {suffix}
            </span>
          )}
        </div>
        <p className="text-muted-foreground font-mono text-[11px]">{s.key}</p>
      </CardFrame>
    );
  };

  if (cat === "features") {
    const fv = (key: string) =>
      (localValues[key] ?? catSettings.find((s) => s.key === key)?.value ?? "on") === "on";
    const FTog = ({
      fkey,
      label,
      icon,
      desc,
      apps,
      enforcement,
      danger,
    }: {
      fkey: string;
      label: string;
      icon: string;
      desc: string;
      apps: string;
      enforcement: "api" | "client" | "both";
      danger?: boolean;
    }) => {
      const on = fv(fkey);
      const dangerOn = danger && on;
      return (
        <div
          className={`rounded-xl border p-4 transition-all ${dangerOn ? "border-red-200 bg-red-50" : on ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50"}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="mt-0.5 shrink-0 text-2xl">{icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-800">{label}</p>
                  {danger && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                      ⚠️ High-Risk
                    </span>
                  )}
                  {enforcement === "api" && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                      <Server size={9} />
                      API
                    </span>
                  )}
                  {enforcement === "client" && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">
                      📱 Client
                    </span>
                  )}
                  {enforcement === "both" && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-700">
                      <Server size={9} />
                      API + Client
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">{desc}</p>
                <p className="mt-1 font-mono text-[10px] text-slate-400">{apps}</p>
              </div>
            </div>
            <div
              className="flex shrink-0 flex-col items-center gap-1"
              onClick={() => handleToggle(fkey, !on)}
            >
              <div
                className={`relative h-6 w-11 cursor-pointer rounded-full transition-colors ${dangerOn ? "bg-red-500" : on ? "bg-green-500" : "bg-gray-300"} ${dirtyKeys.has(fkey) ? "ring-2 ring-amber-400" : ""}`}
              >
                <div
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`}
                />
              </div>
              <span
                className={`text-[10px] font-bold ${dangerOn ? "text-red-600" : on ? "text-green-600" : "text-gray-400"}`}
              >
                {on ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>
          {dangerOn && (
            <div className="mt-3 flex items-center gap-1.5 border-t border-red-200 pt-3 text-red-700">
              <AlertTriangle size={11} />
              <span className="text-[11px] font-medium">
                Caution: all newly registered accounts require manual admin approval before they can
                log in
              </span>
            </div>
          )}
          {!on && !danger && (
            <div className="mt-3 flex items-center gap-1.5 border-t border-red-200 pt-3 text-red-600">
              <AlertTriangle size={11} />
              <span className="text-[11px] font-medium">
                Service disabled — all requests blocked by server
              </span>
            </div>
          )}
        </div>
      );
    };

    const coreServices = [
      {
        fkey: "feature_mart",
        label: "Mart / Grocery",
        icon: "🛒",
        desc: "Allow customers to browse and order groceries and products.",
        apps: "📱 Customer  •  🏪 Vendor  •  🏍️ Rider",
        enforcement: "api" as const,
      },
      {
        fkey: "feature_food",
        label: "Food Delivery",
        icon: "🍔",
        desc: "Let customers order food from restaurants for delivery.",
        apps: "📱 Customer  •  🏪 Vendor  •  🏍️ Rider",
        enforcement: "api" as const,
      },
      {
        fkey: "feature_rides",
        label: "Taxi & Bike Rides",
        icon: "🚗",
        desc: "Enable the taxi and bike ride-hailing service.",
        apps: "📱 Customer  •  🏍️ Rider",
        enforcement: "api" as const,
      },
      {
        fkey: "feature_pharmacy",
        label: "Pharmacy",
        icon: "💊",
        desc: "Allow customers to order medicines and health products online.",
        apps: "📱 Customer  •  🏪 Vendor  •  🏍️ Rider",
        enforcement: "api" as const,
      },
      {
        fkey: "feature_parcel",
        label: "Parcel Delivery",
        icon: "📦",
        desc: "Let customers send and receive parcels through riders.",
        apps: "📱 Customer  •  🏍️ Rider",
        enforcement: "api" as const,
      },
    ];
    const accountFeatures = [
      {
        fkey: "feature_wallet",
        label: "Digital Wallet",
        icon: "💰",
        desc: "Allow customers to top up, send money, and pay using the in-app wallet.",
        apps: "📱 Customer  •  🏪 Vendor  •  🏍️ Rider",
        enforcement: "api" as const,
      },
      {
        fkey: "wallet_mpin_enabled",
        label: "MPIN Protection",
        icon: "🔐",
        desc: "Require a 6-digit PIN before any wallet send or withdraw action.",
        apps: "📱 Customer  •  🏪 Vendor  •  🏍️ Rider",
        enforcement: "api" as const,
      },
      {
        fkey: "feature_referral",
        label: "Referral Program",
        icon: "🎁",
        desc: "Show the Refer & Earn card and track referral bonuses for customers.",
        apps: "📱 Customer only",
        enforcement: "client" as const,
      },
      {
        fkey: "feature_new_users",
        label: "New User Registration",
        icon: "👤",
        desc: "Allow new customers to register. Turn off to freeze sign-ups.",
        apps: "📱 Customer  •  🏪 Vendor  •  🏍️ Rider",
        enforcement: "api" as const,
      },
      {
        fkey: "user_require_approval",
        label: "Require Account Approval",
        icon: "🔒",
        desc: "New accounts wait for an admin to approve them before they can log in.",
        apps: "📱 Customer  •  🏪 Vendor  •  🏍️ Rider",
        enforcement: "api" as const,
        danger: true,
      },
    ];
    const experienceFeatures = [
      {
        fkey: "feature_chat",
        label: "In-App Chat / WhatsApp",
        icon: "💬",
        desc: "Show the chat button in the customer app, which opens a WhatsApp support conversation.",
        apps: "📱 Customer only",
        enforcement: "client" as const,
      },
      {
        fkey: "feature_live_tracking",
        label: "Live GPS Order Tracking",
        icon: "📍",
        desc: "Let customers see their rider's real-time location on a map during delivery.",
        apps: "📱 Customer  •  🏍️ Rider",
        enforcement: "both" as const,
      },
      {
        fkey: "feature_reviews",
        label: "Reviews & Star Ratings",
        icon: "⭐",
        desc: "Let customers leave star ratings and written reviews after orders and rides.",
        apps: "📱 Customer  •  🏪 Vendor  •  🏍️ Rider",
        enforcement: "api" as const,
      },
      {
        fkey: "feature_sos",
        label: "SOS Emergency Alerts",
        icon: "🆘",
        desc: "Show an emergency SOS button for riders and customers during active rides.",
        apps: "📱 Customer  •  🏍️ Rider",
        enforcement: "both" as const,
      },
      {
        fkey: "feature_weather",
        label: "Weather Widget",
        icon: "🌤️",
        desc: "Show a weather card on the customer home screen with temperature and conditions.",
        apps: "📱 Customer only",
        enforcement: "client" as const,
      },
    ];

    const allOn = [...coreServices, ...accountFeatures, ...experienceFeatures].every((f) =>
      fv(f.fkey)
    );
    const anyOff = [...coreServices, ...accountFeatures, ...experienceFeatures].some(
      (f) => !fv(f.fkey)
    );

    const enforcementRows = [
      { label: "Mart orders", key: "feature_mart", enforced: "✅ API" },
      { label: "Food orders", key: "feature_food", enforced: "✅ API" },
      { label: "Ride bookings", key: "feature_rides", enforced: "✅ API" },
      { label: "Pharmacy orders", key: "feature_pharmacy", enforced: "✅ API" },
      { label: "Parcel shipments", key: "feature_parcel", enforced: "✅ API" },
      { label: "Wallet (all ops)", key: "feature_wallet", enforced: "✅ API" },
      { label: "MPIN enforcement", key: "wallet_mpin_enabled", enforced: "✅ API" },
      { label: "Referral card/bonus", key: "feature_referral", enforced: "📱 Client" },
      { label: "New user sign-up", key: "feature_new_users", enforced: "✅ API" },
      {
        label: "Account approval",
        key: "user_require_approval",
        enforced: "✅ API",
        inverted: true,
      },
      { label: "Chat/WhatsApp", key: "feature_chat", enforced: "📱 Client" },
      {
        label: "Live GPS tracking",
        key: "feature_live_tracking",
        enforced: "✅ API + Client",
        inverted: false,
      },
      { label: "Reviews & ratings", key: "feature_reviews", enforced: "✅ API", inverted: false },
      { label: "SOS alerts", key: "feature_sos", enforced: "✅ API + Client", inverted: false },
      { label: "Weather widget", key: "feature_weather", enforced: "📱 Client" },
    ] as { label: string; key: string; enforced: string; inverted?: boolean }[];

    return (
      <div className="space-y-6">
        {anyOff && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertTriangle className="shrink-0 text-red-500" size={18} />
            <div>
              <p className="text-sm font-semibold text-red-700">
                One or more services are currently disabled
              </p>
              <p className="mt-0.5 text-[12px] text-red-500">
                Disabled services return HTTP 503 errors to customers. Save changes to apply.
              </p>
            </div>
          </div>
        )}
        {allOn && (
          <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
            <CheckCircle2 className="shrink-0 text-green-500" size={18} />
            <div>
              <p className="text-sm font-semibold text-green-700">
                All services are active and fully operational
              </p>
              <p className="mt-0.5 text-[12px] text-green-500">
                Customers can access all features. Toggles take effect immediately after saving.
              </p>
            </div>
          </div>
        )}

        <details open className="group/core">
          <summary className="mb-3 flex cursor-pointer list-none items-center gap-2 rounded-lg px-1 py-1 transition-colors select-none hover:bg-slate-50">
            <ShoppingCart size={15} className="shrink-0 text-slate-500" />
            <p className="text-sm font-semibold text-slate-700">Core Services</p>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
              orders / rides / pharmacy / parcel API
            </span>
            <ChevronDown
              size={13}
              className="ml-auto -rotate-90 text-slate-400 transition-transform group-open/core:rotate-0"
            />
          </summary>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {coreServices.map((f) => (
              <Fragment key={f.fkey}>{FTog({ ...f })}</Fragment>
            ))}
          </div>
        </details>

        <details open className="group/account">
          <summary className="mb-3 flex cursor-pointer list-none items-center gap-2 rounded-lg px-1 py-1 transition-colors select-none hover:bg-slate-50">
            <UserPlus size={15} className="shrink-0 text-slate-500" />
            <p className="text-sm font-semibold text-slate-700">Account Features</p>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
              wallet / auth / customer API
            </span>
            <ChevronDown
              size={13}
              className="ml-auto -rotate-90 text-slate-400 transition-transform group-open/account:rotate-0"
            />
          </summary>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {accountFeatures.map((f) => (
              <Fragment key={f.fkey}>{FTog({ ...f })}</Fragment>
            ))}
          </div>
        </details>

        <details open className="group/experience">
          <summary className="mb-3 flex cursor-pointer list-none items-center gap-2 rounded-lg px-1 py-1 transition-colors select-none hover:bg-slate-50">
            <MessageSquare size={15} className="shrink-0 text-slate-500" />
            <p className="text-sm font-semibold text-slate-700">Experience Features</p>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
              chat / tracking / reviews API
            </span>
            <ChevronDown
              size={13}
              className="ml-auto -rotate-90 text-slate-400 transition-transform group-open/experience:rotate-0"
            />
          </summary>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {experienceFeatures.map((f) => (
              <Fragment key={f.fkey}>{FTog({ ...f })}</Fragment>
            ))}
          </div>
        </details>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Server size={14} className="text-slate-500" />
            <p className="text-sm font-semibold text-slate-700">API Enforcement Summary</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2 font-semibold">Feature</th>
                  <th className="pb-2 font-semibold">Seed Key</th>
                  <th className="pb-2 font-semibold">Enforcement</th>
                  <th className="pb-2 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {enforcementRows.map((r) => (
                  <tr key={r.key} className="transition-colors hover:bg-white">
                    <td className="py-2 font-medium text-slate-700">{r.label}</td>
                    <td className="py-2 font-mono text-slate-400">{r.key}</td>
                    <td className="py-2 text-slate-500">{r.enforced}</td>
                    <td className="py-2 text-right">
                      {r.inverted ? (
                        fv(r.key) ? (
                          <span className="font-bold text-amber-600">ACTIVE</span>
                        ) : (
                          <span className="font-bold text-slate-400">OPEN</span>
                        )
                      ) : fv(r.key) ? (
                        <span className="font-bold text-green-600">ON</span>
                      ) : (
                        <span className="font-bold text-red-600">OFF</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[10px] text-slate-400">
            ✅ API Enforced = server returns 503 when disabled, impossible to bypass from client
            apps. &nbsp; 📱 Client-Side = UI hidden/shown based on config, no dedicated API
            endpoint.
          </p>
        </div>
      </div>
    );
  }

  if (cat === "content") {
    const T = (key: string, label: string, sub?: string, danger = false) => (
      <Toggle
        key={key}
        checked={(localValues[key] ?? "on") === "on"}
        onChange={(v) => handleToggle(key, v)}
        label={label}
        sub={sub}
        isDirty={dirtyKeys.has(key)}
        danger={danger}
      />
    );

    const ContentField = ({ s }: { s: Setting }) => {
      const isDirty = dirtyKeys.has(s.key);
      const val = localValues[s.key] ?? s.value;
      const isUrl = s.key.includes("_url");
      const isTA = CONTENT_TEXTAREA_KEYS.has(s.key);
      const limit = CONTENT_CHAR_LIMITS[s.key];
      const meta = CONTENT_HINTS[s.key];
      const overLimit = limit ? val.length > limit : false;
      return (
        <CardFrame isDirty={isDirty} className="space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {isUrl ? (
                <LinkIcon className="text-muted-foreground h-3.5 w-3.5 flex-shrink-0" />
              ) : (
                <MessageSquare className="text-muted-foreground h-3.5 w-3.5 flex-shrink-0" />
              )}
              <label className="text-foreground text-sm leading-snug font-semibold">
                {s.label}
              </label>
              {isDirty && (
                <Badge
                  variant="outline"
                  className="flex-shrink-0 border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
                >
                  CHANGED
                </Badge>
              )}
            </div>
            {limit && (
              <span
                className={`flex-shrink-0 font-mono text-[10px] font-bold ${overLimit ? "text-red-500" : val.length > limit * 0.8 ? "text-amber-500" : "text-muted-foreground"}`}
              >
                {val.length}/{limit}
              </span>
            )}
          </div>
          {isTA ? (
            <textarea
              value={val}
              onChange={(e) => handleChange(s.key, e.target.value)}
              placeholder={getPlaceholder(s.key)}
              rows={s.key === "content_maintenance_msg" ? 3 : 2}
              className={`w-full resize-none rounded-lg border p-3 text-sm transition-colors focus:ring-2 focus:ring-pink-200 focus:outline-none ${isDirty ? "border-amber-300 bg-amber-50/40" : "border-border"} ${overLimit ? "border-red-300 bg-red-50/40" : ""}`}
            />
          ) : (
            <Input
              type="text"
              value={val}
              onChange={(e) => handleChange(s.key, e.target.value)}
              placeholder={getPlaceholder(s.key)}
              className={`h-9 rounded-lg text-sm ${isDirty ? "border-amber-300 bg-amber-50/40" : ""} ${!val ? "border-dashed" : ""}`}
            />
          )}
          {meta && (
            <div className="flex flex-col gap-0.5">
              <p className="text-muted-foreground text-[11px]">{meta.hint}</p>
              <p className="text-[10px] font-semibold text-pink-600">{meta.apps}</p>
            </div>
          )}
          <p className="text-muted-foreground/60 font-mono text-[10px]">{s.key}</p>
        </CardFrame>
      );
    };

    const getField = (key: string) => catSettings.find((s) => s.key === key);
    const msgFields = [
      "content_banner",
      "content_announcement",
      "content_maintenance_msg",
      "content_support_msg",
    ]
      .map((k) => getField(k))
      .filter(Boolean) as Setting[];
    const noticeFields = ["content_vendor_notice", "content_rider_notice"]
      .map((k) => getField(k))
      .filter(Boolean) as Setting[];
    const linkFields = [
      "content_tnc_url",
      "content_privacy_url",
      "content_refund_policy_url",
      "content_faq_url",
      "content_about_url",
    ]
      .map((k) => getField(k))
      .filter(Boolean) as Setting[];

    return (
      <div className="space-y-7">
        {/* ── Feature Switches ── */}
        <div>
          <SLabel icon={ToggleRight}>Feature Switches</SLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {T(
              "content_tracker_banner_enabled",
              "Active Tracker Banner",
              "Shows active ride/order tracker strip in all apps"
            )}
            {T(
              "content_show_banner",
              "Show Promotional Banner Carousel",
              "Slide-show banners on customer home screen"
            )}
          </div>
          <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-[11px]">
            <Zap size={11} className="text-violet-500" />
            Chat, Live Tracking and Reviews toggles have moved to the{" "}
            <strong>Feature Toggles</strong> tab.
          </p>
        </div>

        {/* ── Tracker Banner Position ── */}
        <div className="border-border/40 border-t pt-5">
          <SLabel icon={ToggleRight}>Tracker Banner Position</SLabel>
          <CardFrame variant="note" className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-foreground text-sm font-semibold">Banner Position</p>
                <p className="text-muted-foreground text-xs">
                  Where the active tracker banner appears on screen
                </p>
              </div>
              <select
                value={localValues["content_tracker_banner_position"] ?? "top"}
                onChange={(e) => handleChange("content_tracker_banner_position", e.target.value)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${dirtyKeys.has("content_tracker_banner_position") ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50"}`}
              >
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
              </select>
            </div>
            <p className="text-muted-foreground/60 font-mono text-[10px]">
              content_tracker_banner_position
            </p>
          </CardFrame>
        </div>

        {/* ── App Messaging ── */}
        <div className="border-border/40 border-t pt-5">
          <SLabel icon={MessageSquare}>App Messaging</SLabel>
          <div className="grid grid-cols-1 gap-4">
            {msgFields.map((s) => (
              <Fragment key={s.key}>{ContentField({ s: s })}</Fragment>
            ))}
          </div>
        </div>

        {/* ── Role-Specific Notices ── */}
        <div className="border-border/40 border-t pt-5">
          <SLabel icon={Info}>Role-Specific Notices</SLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {noticeFields.map((s) => (
              <Fragment key={s.key}>{ContentField({ s: s })}</Fragment>
            ))}
          </div>
          <div className="mt-3 flex gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              These notices appear as a dismissable banner at the top of the Vendor Dashboard and
              Rider Home screens. Leave empty to hide them.
            </span>
          </div>
        </div>

        {/* ── Legal & Policy Links ── */}
        <div className="border-border/40 border-t pt-5">
          <SLabel icon={FileText}>Legal & Policy Links</SLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {linkFields.map((s) => (
              <Fragment key={s.key}>{ContentField({ s: s })}</Fragment>
            ))}
          </div>
          <div className="border-border text-muted-foreground mt-3 flex gap-2 rounded-xl border bg-gray-50 p-3 text-xs">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              All URLs open in the device browser. Rows are automatically hidden when the URL is
              empty — no code changes needed.
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (cat === "general") {
    const appStatus = localValues["app_status"] ?? "active";
    const appStatusDirty = dirtyKeys.has("app_status");

    const GENERAL_GROUPS: { label: string; icon: any; keys: string[] }[] = [
      {
        label: "App Identity",
        icon: Globe,
        keys: ["app_name", "app_tagline", "app_version", "app_status"],
      },
      {
        label: "Support Contact",
        icon: Phone,
        keys: ["support_phone", "support_email", "support_hours"],
      },
      { label: "Business Info", icon: Building2, keys: ["business_address"] },
      { label: "Social Media", icon: LinkIcon, keys: ["social_facebook", "social_instagram"] },
    ];
    const GENERAL_LABELS: Record<string, string> = {
      app_name: "App Name",
      app_tagline: "App Tagline",
      app_version: "App Version",
      app_status: "App Status",
      support_phone: "Support Phone",
      support_email: "Support Email",
      support_hours: "Support Hours",
      business_address: "Business Address",
      social_facebook: "Facebook Page URL",
      social_instagram: "Instagram Profile URL",
    };
    const GENERAL_PLACEHOLDERS: Record<string, string> = {
      app_name: "AJKMart",
      app_tagline: "Your super app for everything",
      app_version: "1.0.0",
      support_phone: "03001234567",
      support_email: "support@ajkmart.pk",
      support_hours: "Mon–Sat, 8AM–10PM",
      business_address: "Muzaffarabad, AJK, Pakistan",
      social_facebook: "https://facebook.com/ajkmart",
      social_instagram: "https://instagram.com/ajkmart",
    };
    const GENERAL_HINTS: Record<string, string> = {
      app_name: "Shown in all three apps — customer, vendor and rider",
      app_tagline: "Subtitle on the customer login screen",
      app_version: "Shown in customer profile app info footer",
      support_phone: "Tappable call button in all 3 apps",
      support_email: "Shown in support section (optional — leave blank to hide)",
      support_hours: "Shown under Call Support row in all apps",
      business_address: "Shown on login screen footer (vendor) and profile footer",
      social_facebook: "Leave blank to hide the Follow Us row",
      social_instagram: "Leave blank to hide if Facebook is also blank",
    };

    return (
      <div className="space-y-6">
        {GENERAL_GROUPS.map((grp) => (
          <div key={grp.label} className="space-y-3">
            <SLabel icon={grp.icon}>{grp.label}</SLabel>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {grp.keys.map((key) => {
                if (key === "app_status") {
                  const STATUS_OPTIONS = [
                    {
                      id: "active",
                      label: "🟢 Live",
                      sub: "All users can access normally",
                      bg: "bg-green-500 text-white border-green-600",
                      inactiveBg: "hover:bg-green-50 text-green-700",
                    },
                    {
                      id: "limited",
                      label: "🟡 Limited",
                      sub: "Only existing users can log in",
                      bg: "bg-yellow-400 text-white border-yellow-500",
                      inactiveBg: "hover:bg-yellow-50 text-yellow-700",
                    },
                    {
                      id: "maintenance",
                      label: "🔴 Maintenance",
                      sub: "All apps show maintenance screen",
                      bg: "bg-red-500 text-white border-red-600",
                      inactiveBg: "hover:bg-red-50 text-red-700",
                    },
                  ];
                  return (
                    <div
                      key={key}
                      className={`space-y-3 rounded-xl border p-3.5 transition-all sm:col-span-2 ${appStatusDirty ? "border-amber-300 bg-amber-50/30" : "border-border"}`}
                    >
                      <div className="flex items-center gap-2">
                        <Globe className="text-muted-foreground h-3.5 w-3.5" />
                        <label className="text-foreground flex-1 text-sm font-semibold">
                          App Status
                        </label>
                        {appStatusDirty && (
                          <Badge
                            variant="outline"
                            className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
                          >
                            CHANGED
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {STATUS_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() => handleChange("app_status", opt.id)}
                            className={`rounded-xl border-2 px-2 py-2.5 text-left text-xs font-bold transition-all ${appStatus === opt.id ? opt.bg + " shadow-sm" : "bg-muted/30 border-border text-muted-foreground " + opt.inactiveBg}`}
                          >
                            <p className="font-bold">{opt.label}</p>
                            <p
                              className={`mt-0.5 text-[10px] font-normal ${appStatus === opt.id ? "opacity-80" : "text-muted-foreground"}`}
                            >
                              {opt.sub}
                            </p>
                          </button>
                        ))}
                      </div>
                      <p className="text-muted-foreground/60 font-mono text-[10px]">app_status</p>
                    </div>
                  );
                }
                const isDirty = dirtyKeys.has(key);
                const curVal = localValues[key] ?? "";
                const isUrl = key.startsWith("social_");
                const isNameBlank = key === "app_name" && curVal.trim() === "";
                return (
                  <div
                    key={key}
                    className={`space-y-2 rounded-xl border p-3.5 transition-all ${isNameBlank ? "border-red-400 bg-red-50/30" : isDirty ? "border-amber-300 bg-amber-50/30" : "border-border"}`}
                  >
                    <div className="flex items-center gap-2">
                      {isUrl ? (
                        <LinkIcon className="text-muted-foreground h-3.5 w-3.5" />
                      ) : (
                        <Globe className="text-muted-foreground h-3.5 w-3.5" />
                      )}
                      <label className="text-foreground flex-1 text-sm font-semibold">
                        {GENERAL_LABELS[key] ?? key}
                      </label>
                      {isNameBlank && (
                        <Badge
                          variant="outline"
                          className="border-red-300 bg-red-50 text-[10px] font-bold text-red-600"
                        >
                          REQUIRED
                        </Badge>
                      )}
                      {!isNameBlank && isDirty && (
                        <Badge
                          variant="outline"
                          className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
                        >
                          CHANGED
                        </Badge>
                      )}
                      {curVal && !isDirty && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      )}
                    </div>
                    <Input
                      type={key === "support_email" ? "email" : "text"}
                      value={curVal}
                      onChange={(e) => handleChange(key, e.target.value)}
                      placeholder={GENERAL_PLACEHOLDERS[key] ?? ""}
                      className={`h-9 rounded-lg text-sm ${isNameBlank ? "border-red-400 bg-red-50/40" : isDirty ? "border-amber-300 bg-amber-50/40" : ""} ${!curVal ? "border-dashed" : ""}`}
                    />
                    {isNameBlank && (
                      <p className="flex items-center gap-1 text-[11px] font-medium text-red-600">
                        <AlertTriangle className="h-3 w-3" /> App Name is required — cannot save
                        with a blank name
                      </p>
                    )}
                    {!isNameBlank && GENERAL_HINTS[key] && (
                      <p className="text-muted-foreground text-[11px]">{GENERAL_HINTS[key]}</p>
                    )}
                    <p className="text-muted-foreground/60 font-mono text-[10px]">{key}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  /* ─────────────────────────── FINANCE RENDERER ─────────────────────────── */
  if (cat === "finance") {
    const COMMISSION_KEYS = new Set(["platform_commission_pct"]);
    const TAX_KEYS = new Set(["finance_gst_enabled", "finance_gst_pct"]);
    const PAYOUT_KEYS = new Set(["vendor_min_payout"]);
    const CASHBACK_KEYS = new Set([
      "finance_cashback_enabled",
      "finance_cashback_pct",
      "finance_cashback_max_rs",
    ]);
    const INVOICE_KEYS = new Set(["finance_invoice_enabled"]);

    const commFields = catSettings.filter((s) => COMMISSION_KEYS.has(s.key));
    const taxFields = catSettings.filter((s) => TAX_KEYS.has(s.key));
    const _payoutField = catSettings.filter((s) => PAYOUT_KEYS.has(s.key));
    const cashFields = catSettings.filter((s) => CASHBACK_KEYS.has(s.key));
    const invoiceField = catSettings.filter((s) => INVOICE_KEYS.has(s.key));

    const SUFFIX: Record<string, string> = {
      platform_commission_pct: "%",
      finance_gst_pct: "%",
      finance_cashback_pct: "%",
      finance_cashback_max_rs: "Rs.",
      vendor_min_payout: "Rs.",
    };
    const HINT: Record<string, string> = {
      platform_commission_pct:
        "Global platform cut applied on every order. Overrides vendor-specific commission if set higher",
      finance_gst_enabled:
        "If enabled, GST is shown as a separate line in the customer cart and added to the grand total",
      finance_gst_pct:
        "Current Pakistan standard GST rate. Applied on the order subtotal (excl. delivery fee)",
      finance_cashback_enabled:
        "Customers earn wallet cashback on every completed order — deposited automatically on delivery",
      finance_cashback_pct:
        "Percentage of order subtotal credited as wallet bonus after successful delivery",
      finance_cashback_max_rs:
        "Maximum cashback credited per order — prevents excessive payouts on very large orders",
      finance_invoice_enabled:
        "Automatically generate a PDF invoice for every completed order (vendor + customer copy)",
      vendor_min_payout:
        "Vendor cannot submit a withdrawal request below this amount (shared with Vendor settings)",
    };

    const FinNumField = ({ s }: { s: Setting }) => {
      const isDirty = dirtyKeys.has(s.key);
      const sfx = SUFFIX[s.key] ?? "";
      const isPrefix = sfx === "Rs.";
      return (
        <CardFrame isDirty={isDirty} className="space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <label className="text-foreground flex-1 text-sm leading-snug font-semibold">
              {s.label}
            </label>
            {isDirty && (
              <Badge
                variant="outline"
                className="flex-shrink-0 border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
              >
                CHANGED
              </Badge>
            )}
          </div>
          {HINT[s.key] && <p className="text-muted-foreground text-[11px]">{HINT[s.key]}</p>}
          <div className="relative">
            {isPrefix && (
              <span className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 text-xs font-bold">
                Rs.
              </span>
            )}
            <Input
              type="number"
              min={0}
              value={localValues[s.key] ?? s.value}
              onChange={(e) => handleChange(s.key, e.target.value)}
              className={`h-10 rounded-xl ${isPrefix ? "pl-10" : sfx ? "pr-10" : ""} ${isDirty ? "border-amber-300 bg-amber-50/50 ring-1 ring-amber-200" : ""}`}
            />
            {!isPrefix && sfx && (
              <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-xs font-bold">
                {sfx}
              </span>
            )}
          </div>
          <p className="text-muted-foreground/50 font-mono text-[10px]">{s.key}</p>
        </CardFrame>
      );
    };

    const FinToggle = ({ s }: { s: Setting }) => (
      <Toggle
        checked={(localValues[s.key] ?? s.value) === "on"}
        onChange={(v) => handleToggle(s.key, v)}
        label={s.label}
        isDirty={dirtyKeys.has(s.key)}
      />
    );

    const RefInfoCard = ({
      label,
      value,
      detail,
      linkCat,
    }: {
      label: string;
      value: string;
      detail: string;
      linkCat: string;
    }) => (
      <div className="space-y-1.5 rounded-xl border border-dashed border-purple-200 bg-purple-50/30 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-foreground text-sm font-semibold">{label}</p>
          <span className="flex-shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-600">
            ref: {linkCat}
          </span>
        </div>
        <p className="text-2xl font-extrabold text-purple-700">{value}</p>
        <p className="text-muted-foreground text-[11px]">{detail}</p>
      </div>
    );

    const vendorCommVal = settings.find((s) => s.key === "vendor_commission_pct")?.value ?? "15";
    const riderEarnVal = settings.find((s) => s.key === "rider_keep_pct")?.value ?? "80";
    const settleDaysVal = settings.find((s) => s.key === "vendor_settlement_days")?.value ?? "7";
    const minRiderVal = settings.find((s) => s.key === "rider_min_payout")?.value ?? "500";

    return (
      <div className="space-y-7">
        {/* ── Group 1: Revenue & Commission ── */}
        <div className="space-y-3">
          <SLabel icon={BarChart3}>Revenue &amp; Commission</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            Platform commission is the cut AJKMart takes from every order. Vendor and rider shares
            are configured in their respective sections and shown here for reference.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {commFields.map((s) => (
              <Fragment key={s.key}>{FinNumField({ s: s })}</Fragment>
            ))}
            <RefInfoCard
              label="Vendor Commission %"
              value={`${vendorCommVal}%`}
              detail="Vendor pays this % of order value to platform"
              linkCat="Vendor"
            />
            <RefInfoCard
              label="Rider Earning %"
              value={`${riderEarnVal}%`}
              detail="Rider keeps this % of the delivery fee earned"
              linkCat="Rider"
            />
          </div>
          <div className="flex gap-2.5 rounded-xl border border-purple-100 bg-purple-50 p-3.5">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-500" />
            <p className="text-xs leading-relaxed text-purple-700">
              <strong>Revenue split example:</strong> Order subtotal Rs.1,000 → Platform takes{" "}
              {localValues["platform_commission_pct"] ??
                settings.find((s) => s.key === "platform_commission_pct")?.value ??
                "10"}
              % (Rs.
              {Math.round(
                1000 *
                  (Number(
                    localValues["platform_commission_pct"] ??
                      settings.find((s) => s.key === "platform_commission_pct")?.value ??
                      10
                  ) /
                    100)
              )}
              ) · Vendor keeps remainder after their {vendorCommVal}% commission · Rider keeps{" "}
              {riderEarnVal}% of delivery fee.
            </p>
          </div>
        </div>

        {/* ── Group 2: Tax & Invoicing ── */}
        <div className="border-border/40 space-y-3 border-t pt-6">
          <SLabel icon={FileText}>Tax &amp; Invoicing</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            When GST is enabled, a tax line is automatically added to the customer cart breakdown.
            Invoice generation creates PDFs on order completion.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {taxFields.map((s) =>
              TOGGLE_KEYS.has(s.key) ? (
                <Fragment key={s.key}>{FinToggle({ s: s })}</Fragment>
              ) : (
                <Fragment key={s.key}>{FinNumField({ s: s })}</Fragment>
              )
            )}
          </div>
          {invoiceField.map((s) => (
            <Fragment key={s.key}>{FinToggle({ s: s })}</Fragment>
          ))}
        </div>

        {/* ── Group 3: Payout Rules ── */}
        <div className="border-border/40 space-y-3 border-t pt-6">
          <SLabel icon={Wallet}>Payout Rules</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            Minimum payout thresholds prevent micro-withdrawals. Settlement cycle is configured in
            Vendor settings.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* vendor_min_payout is stored in vendor category — read directly from localValues */}
            <CardFrame isDirty={dirtyKeys.has("vendor_min_payout")} className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <label className="text-foreground flex-1 text-sm leading-snug font-semibold">
                  Vendor Min Payout (Rs.)
                </label>
                {dirtyKeys.has("vendor_min_payout") && (
                  <Badge
                    variant="outline"
                    className="flex-shrink-0 border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
                  >
                    CHANGED
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-[11px]">
                Vendor cannot submit a withdrawal request below this amount (also editable in Vendor
                settings)
              </p>
              <div className="relative">
                <span className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 text-xs font-bold">
                  Rs.
                </span>
                <Input
                  type="number"
                  min={0}
                  value={localValues["vendor_min_payout"] ?? "500"}
                  onChange={(e) => handleChange("vendor_min_payout", e.target.value)}
                  className={`h-10 rounded-xl pl-10 ${dirtyKeys.has("vendor_min_payout") ? "border-amber-300 bg-amber-50/50 ring-1 ring-amber-200" : ""}`}
                />
              </div>
              <p className="text-muted-foreground/50 font-mono text-[10px]">vendor_min_payout</p>
            </CardFrame>
            <RefInfoCard
              label="Rider Min Payout"
              value={`Rs. ${minRiderVal}`}
              detail="Minimum rider withdrawal request threshold"
              linkCat="Rider"
            />
            <RefInfoCard
              label="Vendor Settlement Cycle"
              value={`${settleDaysVal} days`}
              detail="Days after order completion before vendor can settle"
              linkCat="Vendor"
            />
          </div>
        </div>

        {/* ── Group 4: Cashback & Rewards ── */}
        <div className="border-border/40 space-y-3 border-t pt-6">
          <SLabel icon={Banknote}>Cashback &amp; Rewards</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            When cashback is active, customers earn a wallet bonus on every successfully delivered
            order. The preview is shown in the customer cart.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cashFields.map((s) =>
              TOGGLE_KEYS.has(s.key) ? (
                <Fragment key={s.key}>{FinToggle({ s: s })}</Fragment>
              ) : (
                <Fragment key={s.key}>{FinNumField({ s: s })}</Fragment>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────────────────── RIDE PRICING RENDERER ─────────────────────────── */
  if (cat === "delivery") {
    const FEE_KEYS = new Set([
      "delivery_fee_mart",
      "delivery_fee_food",
      "delivery_fee_pharmacy",
      "delivery_fee_parcel",
      "delivery_parcel_per_kg",
    ]);
    const FREE_KEYS = new Set(["delivery_free_enabled", "free_delivery_above"]);

    const feeFields = catSettings.filter((s) => FEE_KEYS.has(s.key));
    const freeFields = catSettings.filter((s) => FREE_KEYS.has(s.key));

    const HINT: Record<string, string> = {
      delivery_fee_mart: "Flat delivery fee charged to customers for Mart / Grocery orders",
      delivery_fee_food: "Flat delivery fee charged to customers for Food & Restaurant orders",
      delivery_fee_pharmacy:
        "Flat delivery fee charged to customers for Pharmacy / Medicine orders",
      delivery_fee_parcel:
        "Base delivery fee for Parcel bookings — additional per-kg surcharge is added above 2 kg",
      delivery_parcel_per_kg:
        "Extra charge per kg above the first 2 kg for parcel bookings (e.g. 3 kg parcel adds 1 × this rate)",
      delivery_free_enabled:
        "When ON, cart subtotals above the threshold qualify for free delivery. When OFF, delivery fee is always charged",
      free_delivery_above:
        "Minimum cart subtotal for free delivery. Applies to Mart, Food, and Pharmacy only — parcel is never free",
    };
    const EMOJI: Record<string, string> = {
      delivery_fee_mart: "🛒",
      delivery_fee_food: "🍔",
      delivery_fee_pharmacy: "💊",
      delivery_fee_parcel: "📦",
      delivery_parcel_per_kg: "⚖️",
    };

    const freeEnabled =
      (localValues["delivery_free_enabled"] ??
        catSettings.find((s) => s.key === "delivery_free_enabled")?.value ??
        "on") === "on";
    const freeAbove = parseFloat(
      localValues["free_delivery_above"] ??
        catSettings.find((s) => s.key === "free_delivery_above")?.value ??
        "1000"
    );
    const martFee = parseFloat(
      localValues["delivery_fee_mart"] ??
        catSettings.find((s) => s.key === "delivery_fee_mart")?.value ??
        "80"
    );
    const foodFee = parseFloat(
      localValues["delivery_fee_food"] ??
        catSettings.find((s) => s.key === "delivery_fee_food")?.value ??
        "60"
    );
    const pharmFee = parseFloat(
      localValues["delivery_fee_pharmacy"] ??
        catSettings.find((s) => s.key === "delivery_fee_pharmacy")?.value ??
        "50"
    );
    const parcelBase = parseFloat(
      localValues["delivery_fee_parcel"] ??
        catSettings.find((s) => s.key === "delivery_fee_parcel")?.value ??
        "100"
    );
    const perKg = parseFloat(
      localValues["delivery_parcel_per_kg"] ??
        catSettings.find((s) => s.key === "delivery_parcel_per_kg")?.value ??
        "40"
    );
    const riderKeep = parseFloat(
      localValues["rider_keep_pct"] ??
        settings.find((s) => s.key === "rider_keep_pct")?.value ??
        "80"
    );

    const showFee = (amt: number, fee: number) =>
      freeEnabled && amt >= freeAbove ? "FREE 🎉" : `Rs. ${fee}`;

    const DeliveryNumField = ({ s }: { s: Setting }) => {
      const isDirty = dirtyKeys.has(s.key);
      return (
        <CardFrame isDirty={isDirty} className="space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <label className="text-foreground flex-1 text-sm leading-snug font-semibold">
              {EMOJI[s.key] && <span className="mr-1">{EMOJI[s.key]}</span>}
              {s.label}
            </label>
            {isDirty && (
              <Badge
                variant="outline"
                className="flex-shrink-0 border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
              >
                CHANGED
              </Badge>
            )}
          </div>
          {HINT[s.key] && <p className="text-muted-foreground text-[11px]">{HINT[s.key]}</p>}
          <div className="relative">
            <span className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 text-xs font-bold">
              Rs.
            </span>
            <Input
              type="number"
              min={0}
              step={1}
              value={localValues[s.key] ?? s.value}
              onChange={(e) => handleChange(s.key, e.target.value)}
              className={`h-10 rounded-xl pl-10 ${isDirty ? "border-amber-300 bg-amber-50/50 ring-1 ring-amber-200" : ""}`}
            />
          </div>
          <p className="text-muted-foreground/50 font-mono text-[10px]">{s.key}</p>
        </CardFrame>
      );
    };
    const DeliveryToggle = ({ s }: { s: Setting }) => (
      <Toggle
        checked={(localValues[s.key] ?? s.value) === "on"}
        onChange={(v) => handleToggle(s.key, v)}
        label={s.label}
        isDirty={dirtyKeys.has(s.key)}
      />
    );

    return (
      <div className="space-y-7">
        {/* ── Group 1: Per-Service Delivery Fees ── */}
        <div className="space-y-3">
          <SLabel icon={Truck}>Per-Service Delivery Fees</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            Flat delivery fee charged to customers per service type. Fees are collected at checkout
            and the rider earns their configured percentage from each delivery fee.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {feeFields.map((s) => (
              <Fragment key={s.key}>{DeliveryNumField({ s: s })}</Fragment>
            ))}
          </div>
          <div className="flex gap-2.5 rounded-xl border border-teal-100 bg-teal-50 p-3.5">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-500" />
            <p className="text-xs leading-relaxed text-teal-700">
              <strong>Rider delivery earnings at {riderKeep}%:</strong> 🛒 Mart → Rs.
              {Math.round((martFee * riderKeep) / 100)} &nbsp;|&nbsp; 🍔 Food → Rs.
              {Math.round((foodFee * riderKeep) / 100)} &nbsp;|&nbsp; 💊 Pharmacy → Rs.
              {Math.round((pharmFee * riderKeep) / 100)}{" "}
              <span className="text-teal-500">(platform keeps remaining {100 - riderKeep}%)</span>
            </p>
          </div>
        </div>

        {/* ── Group 2: Free Delivery Rules ── */}
        <div className="border-border/40 space-y-3 border-t pt-6">
          <SLabel icon={Zap}>Free Delivery Rules</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            Automatically waive the delivery fee when a customer's cart subtotal exceeds the
            threshold. Applies to Mart, Food, and Pharmacy orders. Parcel orders always charge the
            base fare regardless.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {freeFields.map((s) =>
              s.key === "delivery_free_enabled" ? (
                <Fragment key={s.key}>{DeliveryToggle({ s: s })}</Fragment>
              ) : freeEnabled ? (
                <Fragment key={s.key}>{DeliveryNumField({ s: s })}</Fragment>
              ) : null
            )}
          </div>
          {!freeEnabled && (
            <div className="flex gap-2.5 rounded-xl border border-orange-200 bg-orange-50 p-3.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-500" />
              <p className="text-xs leading-relaxed text-orange-700">
                <strong>Free delivery is currently OFF.</strong> Customers will always be charged
                the full delivery fee regardless of cart total. Enable the toggle above to activate
                the free delivery threshold.
              </p>
            </div>
          )}
        </div>

        {/* ── Group 3: Live Fare Preview ── */}
        <div className="border-border/40 space-y-3 border-t pt-6">
          <SLabel icon={BarChart3}>Live Checkout Preview</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            What delivery fee customers see at checkout for different cart subtotals — updates
            instantly as you change values above.
          </p>
          <div className="border-border overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sky-100 bg-sky-50">
                  <th className="px-4 py-2.5 text-left text-xs font-bold text-sky-700">
                    Cart Subtotal
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-bold text-sky-700">
                    🛒 Mart
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-bold text-sky-700">
                    🍔 Food
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-bold text-sky-700">
                    💊 Pharmacy
                  </th>
                </tr>
              </thead>
              <tbody>
                {[300, 500, 1000, 2000].map((amt, i) => {
                  const isFree = freeEnabled && amt >= freeAbove;
                  return (
                    <tr
                      key={i}
                      className={`border-b border-gray-50 ${isFree ? "bg-green-50/40" : ""}`}
                    >
                      <td className="px-4 py-2.5 text-xs font-semibold text-gray-700">
                        Rs. {amt.toLocaleString()}
                        {freeAbove === amt && (
                          <span className="ml-1 font-bold text-green-600">
                            ← free delivery starts
                          </span>
                        )}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-center text-xs font-bold ${isFree ? "text-green-600" : "text-gray-800"}`}
                      >
                        {showFee(amt, martFee)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-center text-xs font-bold ${isFree ? "text-green-600" : "text-gray-800"}`}
                      >
                        {showFee(amt, foodFee)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-center text-xs font-bold ${isFree ? "text-green-600" : "text-gray-800"}`}
                      >
                        {showFee(amt, pharmFee)}
                      </td>
                    </tr>
                  );
                })}
                {freeAbove > 0 && ![300, 500, 1000, 2000].includes(Math.round(freeAbove)) && (
                  <tr className="bg-green-50/40">
                    <td className="px-4 py-2.5 text-xs font-semibold text-gray-700">
                      Rs. {Math.round(freeAbove).toLocaleString()}{" "}
                      <span className="font-bold text-green-600">← free delivery starts</span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs font-bold text-green-600">
                      {showFee(freeAbove, martFee)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs font-bold text-green-600">
                      {showFee(freeAbove, foodFee)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs font-bold text-green-600">
                      {showFee(freeAbove, pharmFee)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2.5 rounded-xl border border-sky-100 bg-sky-50 p-3.5">
            <Package className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-500" />
            <p className="text-xs leading-relaxed text-sky-700">
              <strong>📦 Parcel pricing examples:</strong> 1 kg → Rs.{parcelBase} &nbsp;|&nbsp; 3 kg
              → Rs.{parcelBase} + Rs.{perKg}×1 = Rs.{parcelBase + perKg} &nbsp;|&nbsp; 5 kg → Rs.
              {parcelBase} + Rs.{perKg}×3 = Rs.{parcelBase + perKg * 3}
              &nbsp;·&nbsp; Free delivery threshold never applies to parcel orders.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (cat === "rides") {
    const BIKE_KEYS = new Set(["ride_bike_base_fare", "ride_bike_per_km", "ride_bike_min_fare"]);
    const CAR_KEYS = new Set(["ride_car_base_fare", "ride_car_per_km", "ride_car_min_fare"]);
    const RICKSHAW_KEYS = new Set([
      "ride_rickshaw_base_fare",
      "ride_rickshaw_per_km",
      "ride_rickshaw_min_fare",
    ]);
    const DABA_KEYS = new Set(["ride_daba_base_fare", "ride_daba_per_km", "ride_daba_min_fare"]);
    const RULES_KEYS = new Set([
      "ride_surge_enabled",
      "ride_surge_multiplier",
      "ride_cancellation_fee",
    ]);
    const BARGAIN_KEYS = new Set([
      "ride_bargaining_enabled",
      "ride_bargaining_min_pct",
      "ride_bargaining_max_rounds",
    ]);

    const bikeFields = catSettings.filter((s) => BIKE_KEYS.has(s.key));
    const carFields = catSettings.filter((s) => CAR_KEYS.has(s.key));
    const rickshawFields = catSettings.filter((s) => RICKSHAW_KEYS.has(s.key));
    const dabaFields = catSettings.filter((s) => DABA_KEYS.has(s.key));
    const rulesFields = catSettings.filter((s) => RULES_KEYS.has(s.key));
    const bargainFields = catSettings.filter((s) => BARGAIN_KEYS.has(s.key));

    const SUFFIX: Record<string, string> = {
      ride_bike_base_fare: "Rs.",
      ride_bike_per_km: "Rs./km",
      ride_bike_min_fare: "Rs.",
      ride_car_base_fare: "Rs.",
      ride_car_per_km: "Rs./km",
      ride_car_min_fare: "Rs.",
      ride_rickshaw_base_fare: "Rs.",
      ride_rickshaw_per_km: "Rs./km",
      ride_rickshaw_min_fare: "Rs.",
      ride_daba_base_fare: "Rs.",
      ride_daba_per_km: "Rs./km",
      ride_daba_min_fare: "Rs.",
      ride_surge_multiplier: "×",
      ride_cancellation_fee: "Rs.",
      ride_bargaining_min_pct: "%",
      ride_bargaining_max_rounds: "rounds",
    };
    const HINT: Record<string, string> = {
      ride_bike_base_fare: "Fixed starting fare charged on every bike ride, regardless of distance",
      ride_bike_per_km: "Additional charge per kilometre for bike rides, added on top of base fare",
      ride_bike_min_fare: "Floor fare for bike rides — short trips will never cost less than this",
      ride_car_base_fare: "Fixed starting fare charged on every car ride, regardless of distance",
      ride_car_per_km: "Additional charge per kilometre for car rides, added on top of base fare",
      ride_car_min_fare: "Floor fare for car rides — short trips will never cost less than this",
      ride_rickshaw_base_fare:
        "Fixed starting fare charged on every rickshaw ride, regardless of distance",
      ride_rickshaw_per_km:
        "Additional charge per kilometre for rickshaw rides, added on top of base fare",
      ride_rickshaw_min_fare:
        "Floor fare for rickshaw rides — short trips will never cost less than this",
      ride_daba_base_fare:
        "Fixed starting fare for on-demand point-to-point Daba rides only. Does NOT apply to Van intercity/route bookings.",
      ride_daba_per_km:
        "Per-kilometre charge for on-demand Daba rides, added on top of base fare. Not used for Van route bookings.",
      ride_daba_min_fare:
        "Floor fare for on-demand Daba rides — short trips will never cost less than this. Not used for Van route bookings.",
      ride_surge_enabled:
        "When ON, all ride fares are multiplied by the surge multiplier below. Use during peak hours or high demand",
      ride_surge_multiplier:
        "Multiplier applied to the calculated fare when surge is active. 1.5 = 50% premium",
      ride_cancellation_fee:
        "Fee charged to the customer if they cancel a ride after a driver has already accepted it",
      ride_bargaining_enabled:
        "Allow customers to offer a custom price below the platform fare. Riders can accept, counter, or reject",
      ride_bargaining_min_pct:
        "Minimum offer as % of platform fare. Offers below this threshold are automatically rejected (e.g. 70 = customer can offer as low as Rs.70 for a Rs.100 fare)",
      ride_bargaining_max_rounds:
        "Maximum back-and-forth counter offers allowed per ride before bargaining expires",
    };

    const gv = (key: string, fallback: string) =>
      parseFloat(localValues[key] ?? catSettings.find((s) => s.key === key)?.value ?? fallback);

    const surgeOn =
      (localValues["ride_surge_enabled"] ??
        catSettings.find((s) => s.key === "ride_surge_enabled")?.value ??
        "off") === "on";
    const bargainOn =
      (localValues["ride_bargaining_enabled"] ??
        catSettings.find((s) => s.key === "ride_bargaining_enabled")?.value ??
        "on") === "on";
    const bargainMin = gv("ride_bargaining_min_pct", "70");
    const bikeBase = gv("ride_bike_base_fare", "15");
    const bikeKm = gv("ride_bike_per_km", "8");
    const bikeMin = gv("ride_bike_min_fare", "50");
    const carBase = gv("ride_car_base_fare", "25");
    const carKm = gv("ride_car_per_km", "12");
    const carMin = gv("ride_car_min_fare", "80");
    const rkBase = gv("ride_rickshaw_base_fare", "20");
    const rkKm = gv("ride_rickshaw_per_km", "10");
    const rkMin = gv("ride_rickshaw_min_fare", "60");
    const dbBase = gv("ride_daba_base_fare", "30");
    const dbKm = gv("ride_daba_per_km", "14");
    const dbMin = gv("ride_daba_min_fare", "100");
    const surge = gv("ride_surge_multiplier", "1.5");
    const riderKeep = parseFloat(
      localValues["rider_keep_pct"] ??
        settings.find((s) => s.key === "rider_keep_pct")?.value ??
        "80"
    );

    const exampleFare = (base: number, perKm: number, minF: number, km: number) => {
      const raw = Math.round(base + km * perKm);
      const withMin = Math.max(minF, raw);
      return Math.round(withMin * (surgeOn ? surge : 1));
    };

    const RideNumField = ({ s }: { s: Setting }) => {
      const isDirty = dirtyKeys.has(s.key);
      const sfx = SUFFIX[s.key] ?? "";
      const isPrefix = sfx === "Rs.";
      return (
        <CardFrame isDirty={isDirty} className="space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <label className="text-foreground flex-1 text-sm leading-snug font-semibold">
              {s.label}
            </label>
            {isDirty && (
              <Badge
                variant="outline"
                className="flex-shrink-0 border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
              >
                CHANGED
              </Badge>
            )}
          </div>
          {HINT[s.key] && <p className="text-muted-foreground text-[11px]">{HINT[s.key]}</p>}
          <div className="relative">
            {isPrefix && (
              <span className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 text-xs font-bold">
                Rs.
              </span>
            )}
            <Input
              type="number"
              min={0}
              step={s.key === "ride_surge_multiplier" ? "0.1" : "1"}
              value={localValues[s.key] ?? s.value}
              onChange={(e) => handleChange(s.key, e.target.value)}
              className={`h-10 rounded-xl ${isPrefix ? "pl-10" : sfx ? "pr-16" : ""} ${isDirty ? "border-amber-300 bg-amber-50/50 ring-1 ring-amber-200" : ""}`}
            />
            {!isPrefix && sfx && (
              <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-xs font-bold">
                {sfx}
              </span>
            )}
          </div>
          <p className="text-muted-foreground/50 font-mono text-[10px]">{s.key}</p>
        </CardFrame>
      );
    };

    const RideToggle = ({ s }: { s: Setting }) => (
      <Toggle
        checked={(localValues[s.key] ?? s.value) === "on"}
        onChange={(v) => handleToggle(s.key, v)}
        label={s.label}
        isDirty={dirtyKeys.has(s.key)}
      />
    );

    return (
      <div className="space-y-7">
        {/* ── Group 1: Bike / Motorcycle Pricing ── */}
        <div className="space-y-3">
          <SLabel icon={Bike}>Bike / Motorcycle Pricing</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            Rates applied to all two-wheeler bookings. Minimum fare acts as a floor — short trips
            will be charged at least this amount.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bikeFields.map((s) => (
              <Fragment key={s.key}>{RideNumField({ s: s })}</Fragment>
            ))}
          </div>
          <div className="flex gap-2.5 rounded-xl border border-teal-100 bg-teal-50 p-3.5">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-500" />
            <p className="text-xs leading-relaxed text-teal-700">
              <strong>Bike fare example:</strong> 5 km trip → Rs.
              {exampleFare(bikeBase, bikeKm, bikeMin, 5)} &nbsp;|&nbsp; 10 km → Rs.
              {exampleFare(bikeBase, bikeKm, bikeMin, 10)} &nbsp;|&nbsp; 20 km → Rs.
              {exampleFare(bikeBase, bikeKm, bikeMin, 20)}
              {surgeOn && <strong className="text-orange-600"> (surge ×{surge} active)</strong>}
              &nbsp;· Rider earns {riderKeep}% of each fare
            </p>
          </div>
        </div>

        {/* ── Group 2: Car / Taxi Pricing ── */}
        <div className="border-border/40 space-y-3 border-t pt-6">
          <SLabel icon={Car}>Car / Taxi Pricing</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            Rates applied to all four-wheeler bookings. Car minimum fare is typically higher to
            cover fuel and vehicle costs.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {carFields.map((s) => (
              <Fragment key={s.key}>{RideNumField({ s: s })}</Fragment>
            ))}
          </div>
          <div className="flex gap-2.5 rounded-xl border border-teal-100 bg-teal-50 p-3.5">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-500" />
            <p className="text-xs leading-relaxed text-teal-700">
              <strong>Car fare example:</strong> 5 km trip → Rs.
              {exampleFare(carBase, carKm, carMin, 5)} &nbsp;|&nbsp; 10 km → Rs.
              {exampleFare(carBase, carKm, carMin, 10)} &nbsp;|&nbsp; 20 km → Rs.
              {exampleFare(carBase, carKm, carMin, 20)}
              {surgeOn && <strong className="text-orange-600"> (surge ×{surge} active)</strong>}
              &nbsp;· Rider earns {riderKeep}% of each fare
            </p>
          </div>
        </div>

        {/* ── Group 3: Rickshaw Pricing ── */}
        <div className="border-border/40 space-y-3 border-t pt-6">
          <SLabel>🛺 Rickshaw Pricing</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            3-wheel rickshaw fares — cheaper option for short city trips. Bargaining is allowed by
            default for this vehicle type.
          </p>
          {rickshawFields.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {rickshawFields.map((s) => (
                  <Fragment key={s.key}>{RideNumField({ s: s })}</Fragment>
                ))}
              </div>
              <div className="flex gap-2.5 rounded-xl border border-yellow-100 bg-yellow-50 p-3.5">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-500" />
                <p className="text-xs leading-relaxed text-yellow-700">
                  <strong>Rickshaw fare example:</strong> 3 km trip → Rs.
                  {exampleFare(rkBase, rkKm, rkMin, 3)} &nbsp;|&nbsp; 5 km → Rs.
                  {exampleFare(rkBase, rkKm, rkMin, 5)} &nbsp;|&nbsp; 10 km → Rs.
                  {exampleFare(rkBase, rkKm, rkMin, 10)}
                  {surgeOn && <strong className="text-orange-600"> (surge ×{surge} active)</strong>}
                  &nbsp;· Rider earns {riderKeep}% of each fare
                </p>
              </div>
            </>
          ) : (
            <div className="flex gap-2 rounded-xl border border-yellow-200 bg-yellow-50 p-3.5 text-xs text-yellow-800">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
              Settings database mein sync ho rahi hain — page dobara load karein.
            </div>
          )}
        </div>

        {/* ── Group 4: On-Demand Daba Ride Pricing ── */}
        <div className="border-border/40 space-y-3 border-t pt-6">
          <SLabel>🚐 On-Demand Daba Ride Pricing</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            Fares for <strong>on-demand, point-to-point Daba rides only</strong> — same metered
            model as Bike/Car/Rickshaw. These settings do <strong>not</strong> affect Van intercity
            or route-based bookings.
          </p>
          {dabaFields.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {dabaFields.map((s) => (
                  <Fragment key={s.key}>{RideNumField({ s: s })}</Fragment>
                ))}
              </div>
              <div className="flex gap-2.5 rounded-xl border border-purple-100 bg-purple-50 p-3.5">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-500" />
                <p className="text-xs leading-relaxed text-purple-700">
                  <strong>Daba fare example (on-demand only):</strong> 3 km trip → Rs.
                  {exampleFare(dbBase, dbKm, dbMin, 3)} &nbsp;|&nbsp; 5 km → Rs.
                  {exampleFare(dbBase, dbKm, dbMin, 5)} &nbsp;|&nbsp; 10 km → Rs.
                  {exampleFare(dbBase, dbKm, dbMin, 10)}
                  {surgeOn && <strong className="text-orange-600"> (surge ×{surge} active)</strong>}
                  &nbsp;· Rider earns {riderKeep}% of each fare
                </p>
              </div>
              <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                <p className="text-xs leading-relaxed text-amber-800">
                  <strong>Van / Intercity Pricing is separate.</strong> Van bookings use a fixed
                  per-route fare model, not the metered fares above. Van routes and their fares are
                  managed in the{" "}
                  <a href="/van" className="font-semibold underline hover:text-amber-900">
                    Van Management page
                  </a>
                  .
                </p>
              </div>
            </>
          ) : (
            <div className="flex gap-2 rounded-xl border border-purple-200 bg-purple-50 p-3.5 text-xs text-purple-800">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
              Settings database mein sync ho rahi hain — page dobara load karein.
            </div>
          )}
        </div>

        {/* ── School Shift notice ── */}
        <div className="border-border/40 border-t pt-6">
          <div className="flex gap-3 rounded-xl border border-pink-200 bg-pink-50 p-4">
            <span className="flex-shrink-0 text-2xl">🚌</span>
            <div>
              <p className="text-sm font-bold text-pink-800">School Shift — Monthly Subscription</p>
              <p className="mt-1 text-xs text-pink-700">
                School Shift per-ride nahi, per-route monthly subscription hai. Iske routes aur
                fares Rides → School Shift tab se manage hote hain. Is section mein koi fare setting
                nahi hai.
              </p>
            </div>
          </div>
        </div>

        {/* ── Group 5: Surge & Ride Rules ── */}
        <div className="border-border/40 space-y-3 border-t pt-6">
          <SLabel icon={Zap}>Surge &amp; Ride Rules</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            Surge pricing multiplies all fares during peak demand. Cancellation fee is charged when
            a customer cancels after a driver has accepted.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {rulesFields
              .filter((s) => TOGGLE_KEYS.has(s.key))
              .map((s) => (
                <Fragment key={s.key}>{RideToggle({ s: s })}</Fragment>
              ))}
            {rulesFields
              .filter(
                (s) => !TOGGLE_KEYS.has(s.key) && (s.key !== "ride_surge_multiplier" || surgeOn)
              )
              .map((s) => (
                <Fragment key={s.key}>{RideNumField({ s: s })}</Fragment>
              ))}
          </div>
          {surgeOn && (
            <div className="flex gap-2.5 rounded-xl border border-orange-200 bg-orange-50 p-3.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-500" />
              <p className="text-xs leading-relaxed text-orange-700">
                <strong>Surge pricing is currently ACTIVE.</strong> All ride fares are being
                multiplied by <strong>×{surge}</strong>. Customers see a surge badge on the booking
                screen. Remember to turn this off after peak hours.
              </p>
            </div>
          )}
        </div>

        {/* ── Group 4: Price Bargaining ── */}
        <div className="border-border/40 space-y-3 border-t pt-6">
          <SLabel icon={MessageSquare}>Price Bargaining (Mol-Tol)</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            When enabled, customers can offer a custom price below the platform fare. Riders can
            accept the offer, counter with their own price, or reject it. This is like the
            real-world Muzaffarabad bargaining culture — brought into the app.
          </p>

          {/* Toggle first */}
          {bargainFields
            .filter((s) => TOGGLE_KEYS.has(s.key))
            .map((s) => (
              <Toggle
                key={s.key}
                checked={(localValues[s.key] ?? s.value) === "on"}
                onChange={(v) => handleToggle(s.key, v)}
                label={s.label}
                isDirty={dirtyKeys.has(s.key)}
                icon="💬"
                sub="Customers can offer their own price; riders can accept, counter, or reject"
              />
            ))}

          {/* Numeric fields — only show when bargaining is on */}
          {bargainOn && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {bargainFields
                  .filter((s) => !TOGGLE_KEYS.has(s.key))
                  .map((s) => (
                    <Fragment key={s.key}>{RideNumField({ s: s })}</Fragment>
                  ))}
              </div>
              <div className="flex gap-2.5 rounded-xl border border-purple-200 bg-purple-50 p-3.5">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-500" />
                <p className="text-xs leading-relaxed text-purple-700">
                  <strong>Bargaining example:</strong> Bike platform fare Rs.
                  {exampleFare(bikeBase, bikeKm, bikeMin, 5)} → customer can offer as low as{" "}
                  <strong>
                    Rs.{Math.ceil((exampleFare(bikeBase, bikeKm, bikeMin, 5) * bargainMin) / 100)}
                  </strong>{" "}
                  ({bargainMin}% minimum). If rider counters, customer can accept, counter back, or
                  cancel. The cycle repeats up to the max rounds limit.
                </p>
              </div>
            </>
          )}

          {!bargainOn && (
            <div className="flex gap-2.5 rounded-xl border border-gray-200 bg-gray-50 p-3.5">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
              <p className="text-xs leading-relaxed text-gray-500">
                Bargaining is currently <strong>disabled</strong>. Customers will only see the
                platform fare. Enable to allow price negotiation.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (cat === "orders") {
    const AMOUNT_KEYS = new Set(["min_order_amount", "order_max_cart_value"]);
    const TIMING_KEYS = new Set([
      "order_cancel_window_min",
      "order_auto_cancel_min",
      "order_refund_days",
      "order_preptime_min",
      "order_rating_window_hours",
    ]);
    const SCHED_KEYS = new Set(["order_schedule_enabled"]);
    const ITEM_KEYS = new Set(["order_max_item_quantity"]);

    const amountFields = catSettings.filter((s) => AMOUNT_KEYS.has(s.key));
    const timingFields = catSettings.filter((s) => TIMING_KEYS.has(s.key));
    const schedFields = catSettings.filter((s) => SCHED_KEYS.has(s.key));
    const itemFields = catSettings.filter((s) => ITEM_KEYS.has(s.key));

    const SUFFIX: Record<string, string> = {
      min_order_amount: "Rs.",
      order_max_cart_value: "Rs.",
      order_cancel_window_min: "min",
      order_auto_cancel_min: "min",
      order_refund_days: "days",
      order_preptime_min: "min",
      order_rating_window_hours: "hrs",
      order_max_item_quantity: "qty",
    };
    const HINT: Record<string, string> = {
      min_order_amount: "Customer cannot checkout below this amount",
      order_max_cart_value: "Hard cap — checkout blocked if cart exceeds this",
      order_cancel_window_min: "Customer can cancel a pending order within this window",
      order_auto_cancel_min: "Pending order auto-cancels if vendor does not accept in time",
      order_refund_days: "Shown to customer on cancelled non-COD orders",
      order_preptime_min: "Estimated prep time shown on tracking screen",
      order_rating_window_hours: "Rate button disappears after this many hours post-delivery",
      order_max_item_quantity: "Maximum units of a single product per order line item",
    };

    const OrderNumField = ({ s }: { s: Setting }) => {
      const isDirty = dirtyKeys.has(s.key);
      const sfx = SUFFIX[s.key] ?? "";
      return (
        <CardFrame isDirty={isDirty} className="space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <label className="text-foreground text-sm leading-snug font-semibold">
                {s.label}
              </label>
              {isDirty && (
                <Badge
                  variant="outline"
                  className="flex-shrink-0 border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
                >
                  CHANGED
                </Badge>
              )}
            </div>
          </div>
          {HINT[s.key] && <p className="text-muted-foreground text-[11px]">{HINT[s.key]}</p>}
          <div className="relative">
            <Input
              type="number"
              min={0}
              value={localValues[s.key] ?? s.value}
              onChange={(e) => handleChange(s.key, e.target.value)}
              className={`h-10 rounded-xl ${sfx ? "pr-14" : ""} ${isDirty ? "border-amber-300 bg-amber-50/50 ring-1 ring-amber-200" : ""}`}
            />
            {sfx && (
              <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-xs font-bold">
                {sfx}
              </span>
            )}
          </div>
          <p className="text-muted-foreground font-mono text-[10px]">{s.key}</p>
        </CardFrame>
      );
    };

    return (
      <div className="space-y-6">
        {/* Group 1: Amount Limits */}
        {amountFields.length > 0 && (
          <div className="space-y-3">
            <SLabel icon={Banknote}>Amount Limits</SLabel>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {amountFields.map((s) => (
                <Fragment key={s.key}>{OrderNumField({ s: s })}</Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Group 2: Timing & Cancellation */}
        {timingFields.length > 0 && (
          <div className="border-border/40 space-y-3 border-t pt-5">
            <SLabel icon={RotateCcw}>Timing & Cancellation</SLabel>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {timingFields.map((s) => (
                <Fragment key={s.key}>{OrderNumField({ s: s })}</Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Group 3: Item Quantity Limits */}
        {itemFields.length > 0 && (
          <div className="border-border/40 space-y-3 border-t pt-5">
            <SLabel icon={Package}>Item Quantity Limits</SLabel>
            <p className="text-muted-foreground -mt-1 text-xs">
              Control how many units a customer can order per line item
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {itemFields.map((s) => (
                <Fragment key={s.key}>{OrderNumField({ s: s })}</Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Group 4: Scheduling */}
        {schedFields.length > 0 && (
          <div className="border-border/40 space-y-3 border-t pt-5">
            <SLabel icon={Settings}>Scheduling</SLabel>
            <p className="text-muted-foreground -mt-1 text-xs">
              Allow customers to place orders for a future time slot
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {schedFields.map((s) => (
                <Toggle
                  key={s.key}
                  checked={(localValues[s.key] ?? s.value) === "on"}
                  onChange={(v) => handleToggle(s.key, v)}
                  label={s.label}
                  isDirty={dirtyKeys.has(s.key)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ─────────────────────────── CUSTOMER SETTINGS RENDERER ─────────────────────────── */
  if (cat === "customer") {
    const v = (k: string) => localValues[k] ?? settings.find((s) => s.key === k)?.value ?? "";
    const d = (k: string) => dirtyKeys.has(k);

    const _maxOrdersDay = parseInt(v("customer_max_orders_day") || "10");
    const _signupBonus = parseFloat(v("customer_signup_bonus") || "0");
    const minTopup = parseFloat(v("wallet_min_topup") || "100");
    const walletMax = parseFloat(v("wallet_max_balance") || "50000");
    const minTransfer = parseFloat(v("wallet_min_withdrawal") || "200");
    const p2pEnabled = v("wallet_p2p_enabled") === "on";
    const referralEnabled = v("customer_referral_enabled") === "on";
    const referralBonus = parseFloat(v("customer_referral_bonus") || "100");
    const _loyaltyEnabled = v("customer_loyalty_enabled") === "on";
    const _loyaltyPts = parseFloat(v("customer_loyalty_pts") || "5");
    const cbOrders = v("wallet_cashback_on_orders") === "on";
    const cbRides = v("wallet_cashback_on_rides") === "on";
    const cbPharmacy = v("wallet_cashback_on_pharmacy") === "on";
    const cbPct = parseFloat(v("wallet_cashback_pct") || "0");

    const Group = ({
      icon: Icon,
      iconCls,
      title,
      subtitle,
      children,
    }: {
      icon: React.ElementType;
      iconCls: string;
      title: string;
      subtitle: string;
      children: React.ReactNode;
    }) => (
      <div className="border-border overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-border bg-muted/30 flex items-center gap-3 border-b px-5 py-4">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconCls}`}>
            <Icon size={18} />
          </div>
          <div>
            <p className="text-foreground text-sm font-bold">{title}</p>
            <p className="text-muted-foreground text-xs">{subtitle}</p>
          </div>
        </div>
        <div className="space-y-4 p-5">{children}</div>
      </div>
    );

    const Field = ({
      k,
      label,
      suffix,
      min,
      disabled,
    }: {
      k: string;
      label: string;
      suffix?: string;
      min?: number;
      disabled?: boolean;
    }) => (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <label className="text-foreground text-sm font-semibold">{label}</label>
          {d(k) && (
            <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
              CHANGED
            </span>
          )}
        </div>
        <div className="relative">
          <Input
            type="number"
            min={min ?? 0}
            value={v(k)}
            onChange={(e) => handleChange(k, e.target.value)}
            disabled={disabled}
            className={`h-10 rounded-xl ${suffix ? "pr-16" : ""} ${d(k) ? "border-amber-300 bg-amber-50/50 ring-1 ring-amber-200" : ""} ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
          />
          {suffix && (
            <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-xs font-bold">
              {suffix}
            </span>
          )}
        </div>
        <p className="text-muted-foreground font-mono text-[10px]">{k}</p>
      </div>
    );

    const Tog = ({
      k,
      label,
      sub,
      dangerOff,
    }: {
      k: string;
      label: string;
      sub?: string;
      dangerOff?: boolean;
    }) => {
      const on = v(k) === "on";
      return (
        <div
          className={`flex items-center justify-between rounded-xl border px-4 py-3 ${dangerOff && !on ? "border-red-200 bg-red-50" : "bg-muted/20 border-border"} ${d(k) ? "ring-1 ring-amber-300" : ""}`}
        >
          <div>
            <p className="text-foreground text-sm font-semibold">{label}</p>
            {sub && <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p>}
          </div>
          <button
            onClick={() => handleToggle(k, !on)}
            className={`relative h-6 w-11 rounded-full transition-colors ${on ? (dangerOff ? "bg-emerald-500" : "bg-blue-500") : dangerOff ? "bg-red-400" : "bg-muted-foreground/30"}`}
          >
            <span
              className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`}
            />
          </button>
        </div>
      );
    };

    return (
      <div className="space-y-5">
        {/* ── Group 1: Account Controls ── */}
        <Group
          icon={Users}
          iconCls="bg-blue-100 text-blue-600"
          title="Account Controls"
          subtitle="Per-customer limits and onboarding incentives"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Field({
              k: "customer_max_orders_day",
              label: "Max Orders Per Day",
              suffix: "orders",
              min: 1,
            })}
            {Field({
              k: "customer_signup_bonus",
              label: "New User Signup Bonus",
              suffix: "Rs.",
              min: 0,
            })}
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-blue-500" />
            <div className="space-y-0.5 text-xs text-blue-700">
              <p className="font-semibold">Daily Order Enforcement</p>
              <p>
                Orders are always capped at this limit regardless of security settings. Security's
                own daily limit (
                {parseInt(
                  settings.find((s) => s.key === "security_max_daily_orders")?.value || "20"
                )}{" "}
                orders) also applies — the stricter limit wins.
              </p>
            </div>
          </div>
        </Group>

        {/* ── Group 2: Wallet Limits ── */}
        <Group
          icon={Wallet}
          iconCls="bg-emerald-100 text-emerald-600"
          title="Wallet Limits"
          subtitle="Top-up, balance cap, and P2P transfer rules"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Field({ k: "wallet_min_topup", label: "Min Top-Up (Rs.)", suffix: "Rs.", min: 1 })}
            {Field({
              k: "wallet_max_balance",
              label: "Max Wallet Balance (Rs.)",
              suffix: "Rs.",
              min: 100,
            })}
            {Field({
              k: "wallet_min_withdrawal",
              label: "Min Transfer (Rs.)",
              suffix: "Rs.",
              min: 1,
            })}
          </div>
          {Tog({
            k: "wallet_p2p_enabled",
            label: "P2P Money Transfer",
            sub: "Customers can send wallet balance to each other",
            dangerOff: true,
          })}
          {/* Wallet Limits Overview */}
          <div>
            <p className="text-muted-foreground mb-2 text-xs font-bold tracking-wider uppercase">
              Wallet Limits Overview
            </p>
            <div className="border-border overflow-x-auto rounded-xl border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-muted-foreground px-3 py-2 text-left font-bold">Rule</th>
                    <th className="text-muted-foreground px-3 py-2 text-right font-bold">Limit</th>
                    <th className="text-muted-foreground px-3 py-2 text-left font-bold">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {[
                    {
                      rule: "Min Top-Up",
                      val: `Rs. ${minTopup.toLocaleString()}`,
                      src: "wallet_min_topup",
                    },
                    {
                      rule: "Max Wallet",
                      val: `Rs. ${walletMax.toLocaleString()}`,
                      src: "wallet_max_balance",
                    },
                    {
                      rule: "Min Transfer",
                      val: `Rs. ${minTransfer.toLocaleString()}`,
                      src: "wallet_min_withdrawal",
                    },
                    {
                      rule: "P2P Transfers",
                      val: p2pEnabled ? "Enabled ✓" : "Disabled ✗",
                      src: "wallet_p2p_enabled",
                    },
                  ].map((row) => (
                    <tr key={row.rule} className="hover:bg-muted/20">
                      <td className="text-foreground px-3 py-2 font-medium">{row.rule}</td>
                      <td className="px-3 py-2 text-right font-bold text-blue-700">{row.val}</td>
                      <td className="text-muted-foreground px-3 py-2 font-mono text-[10px]">
                        {row.src}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Group>

        {/* ── Group 3: Referral Program ── */}
        <Group
          icon={Gift}
          iconCls="bg-purple-100 text-purple-600"
          title="Referral Program"
          subtitle="Reward customers for inviting new users"
        >
          {Tog({
            k: "customer_referral_enabled",
            label: "Referral Program",
            sub: "Enable refer-a-friend bonus system",
            dangerOff: true,
          })}
          {Field({
            k: "customer_referral_bonus",
            label: "Referral Bonus (Rs.)",
            suffix: "Rs.",
            min: 0,
            disabled: !referralEnabled,
          })}
          <div
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${referralEnabled ? "border-purple-200 bg-purple-50" : "bg-muted/20 border-border"}`}
          >
            <Gift
              size={14}
              className={`mt-0.5 shrink-0 ${referralEnabled ? "text-purple-500" : "text-muted-foreground"}`}
            />
            <div
              className={`space-y-0.5 text-xs ${referralEnabled ? "text-purple-700" : "text-muted-foreground"}`}
            >
              <p className="font-semibold">
                {referralEnabled ? "How it works" : "Referral program is OFF"}
              </p>
              {referralEnabled ? (
                <p>
                  When a referred user places their first order, both the referrer and the new user
                  receive Rs. {referralBonus.toLocaleString()} in wallet credit.
                </p>
              ) : (
                <p>
                  Turn on referral program to reward customers who invite friends. Bonus is credited
                  on the new user's first order.
                </p>
              )}
            </div>
          </div>
        </Group>

        {/* ── Group 4: Loyalty Program ── */}
        <Group
          icon={Star}
          iconCls="bg-amber-100 text-amber-600"
          title="Loyalty Program"
          subtitle="Points earned per Rs. 100 spent"
        >
          {/* Full loyalty tier rules, redemption config and point history live in the dedicated Loyalty page */}
          <ManageInSettingsLink
            label="Loyalty Engine"
            value="Managed in Loyalty"
            description="Configure point multipliers, tier thresholds, redemption rules, and expiry policy in the dedicated Loyalty page."
            tone="info"
            to="/loyalty"
            linkLabel="Open Loyalty"
          />
        </Group>

        {/* ── Group 5: Cashback Settings ── */}
        <Group
          icon={Percent}
          iconCls="bg-rose-100 text-rose-600"
          title="Cashback Settings"
          subtitle="Cashback applied per order category"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Tog({
              k: "wallet_cashback_on_orders",
              label: "Cashback on Mart/Food",
              sub: "Orders only",
            })}
            {Tog({ k: "wallet_cashback_on_rides", label: "Cashback on Rides", sub: "Bike & car" })}
            {Tog({
              k: "wallet_cashback_on_pharmacy",
              label: "Cashback on Pharmacy",
              sub: "Medicine orders",
            })}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Field({ k: "wallet_cashback_pct", label: "Cashback %", suffix: "%", min: 0 })}
            <div className="space-y-1.5">
              <label className="text-foreground text-sm font-semibold">Max Cashback Cap</label>
              <div className="border-border bg-muted/20 flex h-10 items-center rounded-xl border px-4">
                <span className="text-muted-foreground text-sm">
                  Set in Finance Settings → finance_cashback_max_rs
                </span>
              </div>
            </div>
          </div>
          {(cbOrders || cbRides || cbPharmacy) && cbPct > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
              <Zap size={14} className="mt-0.5 shrink-0 text-rose-500" />
              <p className="text-xs text-rose-700">
                <span className="font-semibold">Active: </span>
                {cbPct}% cashback on{" "}
                {[cbOrders && "Mart/Food", cbRides && "Rides", cbPharmacy && "Pharmacy"]
                  .filter(Boolean)
                  .join(", ")}
                . Capped per Finance settings.
              </p>
            </div>
          )}
        </Group>
      </div>
    );
  }

  /* ─────────────────────────── RIDER SETTINGS RENDERER ─────────────────────────── */
  if (cat === "rider") {
    const v = (k: string) => localValues[k] ?? catSettings.find((s) => s.key === k)?.value ?? "";
    const d = (k: string) => dirtyKeys.has(k);

    const keepPct = parseFloat(v("rider_keep_pct") || "80");
    const bonusPerTrip = parseFloat(v("rider_bonus_per_trip") || "0");
    const minPayout = parseFloat(v("rider_min_payout") || "500");
    const maxPayout = parseFloat(v("rider_max_payout") || "50000");
    const maxDeliveries = parseInt(v("rider_max_deliveries") || "3");
    const autoApprove = v("rider_auto_approve") === "on";
    const cashAllowed = v("rider_cash_allowed") !== "off";
    const withdrawOn = v("rider_withdrawal_enabled") !== "off";

    const platKeep = Math.round(100 - keepPct);
    const sampleFee = 100; // sample delivery fee
    const riderEarns = parseFloat(((sampleFee * keepPct) / 100).toFixed(2));
    const platEarns = parseFloat(((sampleFee * platKeep) / 100).toFixed(2));

    const RField = ({
      k,
      label,
      suffix,
      hint,
    }: {
      k: string;
      label: string;
      suffix?: string;
      hint?: string;
    }) => {
      const isDirty = d(k);
      return (
        <CardFrame isDirty={isDirty} className="space-y-2.5">
          <div className="flex items-center gap-2">
            <label className="text-foreground text-sm font-semibold">{label}</label>
            {isDirty && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
              >
                CHANGED
              </Badge>
            )}
          </div>
          {hint && <p className="text-muted-foreground text-[11px]">{hint}</p>}
          <div className="relative">
            <Input
              type="number"
              min={0}
              value={v(k)}
              onChange={(e) => handleChange(k, e.target.value)}
              className={`h-10 rounded-xl ${suffix ? "pr-16" : ""} ${isDirty ? "border-amber-300 bg-amber-50/50 ring-1 ring-amber-200" : ""}`}
            />
            {suffix && (
              <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-xs font-bold">
                {suffix}
              </span>
            )}
          </div>
          <p className="text-muted-foreground font-mono text-[10px]">{k}</p>
        </CardFrame>
      );
    };

    return (
      <div className="space-y-6">
        {/* ── Group 1: Onboarding & Registration ── */}
        <div className="space-y-3">
          <SLabel icon={Bike}>Onboarding & Registration</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            Control how new rider accounts are activated on the platform
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Toggle
              checked={autoApprove}
              isDirty={d("rider_auto_approve")}
              onChange={(val) => handleToggle("rider_auto_approve", val)}
              label="Auto-Approve New Riders"
              sub={
                autoApprove
                  ? "New riders are immediately active — no review needed"
                  : "New rider accounts need manual admin approval from Users panel"
              }
            />
          </div>
          {!autoApprove && (
            <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3">
              <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
              <p className="text-xs leading-relaxed text-blue-700">
                <strong>Manual Review:</strong> New rider accounts are set to <em>inactive</em> by
                default. Go to the Users panel and activate each rider manually before they can log
                in and accept deliveries.
              </p>
            </div>
          )}
        </div>

        {/* ── Group 2: Earnings & Compensation ── */}
        <div className="border-border/40 space-y-3 border-t pt-5">
          <SLabel icon={Zap}>Earnings & Compensation</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            What riders earn per delivery and any per-trip bonus on top
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {RField({
              k: "rider_keep_pct",
              label: "Rider Earnings % (of fare)",
              suffix: "%",
              hint: "Rider keeps this % of the delivery fee or ride fare earned",
            })}
            {RField({
              k: "rider_bonus_per_trip",
              label: "Bonus Per Trip (Rs.)",
              suffix: "Rs.",
              hint: "Fixed bonus credited for every completed delivery or ride — set 0 to disable",
            })}
          </div>

          {/* Earnings Split Visualizer */}
          <div className="rounded-xl border border-green-100 bg-gradient-to-r from-green-50 to-emerald-50 p-4">
            <p className="mb-3 text-xs font-bold text-green-700">
              💡 Live Earnings Preview — Rs. {sampleFee} delivery fee
            </p>
            <div className="mb-2.5 flex h-8 overflow-hidden rounded-lg shadow-sm">
              <div
                className="flex items-center justify-center text-xs font-extrabold text-white"
                style={{
                  width: `${keepPct}%`,
                  background: "linear-gradient(90deg,#16a34a,#22c55e)",
                }}
              >
                {keepPct}% Rider
              </div>
              <div
                className="flex items-center justify-center text-xs font-extrabold text-white"
                style={{
                  width: `${platKeep}%`,
                  background: "linear-gradient(90deg,#1d4ed8,#3b82f6)",
                }}
              >
                {platKeep}%
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-green-100 bg-white p-3 text-center">
                <p className="text-lg font-extrabold text-green-600">Rs. {riderEarns}</p>
                <p className="text-muted-foreground text-[11px] font-medium">
                  Rider earns ({keepPct}%){bonusPerTrip > 0 ? ` + Rs.${bonusPerTrip} bonus` : ""}
                </p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-white p-3 text-center">
                <p className="text-lg font-extrabold text-blue-600">Rs. {platEarns}</p>
                <p className="text-muted-foreground text-[11px] font-medium">
                  Platform keeps ({platKeep}%)
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Group 3: Payout Rules ── */}
        <div className="border-border/40 space-y-3 border-t pt-5">
          <SLabel icon={Banknote}>Payout Rules</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            Minimum and maximum withdrawal limits per request
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {RField({
              k: "rider_min_payout",
              label: "Minimum Payout Request (Rs.)",
              suffix: "Rs.",
              hint: "Rider cannot submit a withdrawal below this amount",
            })}
            {RField({
              k: "rider_max_payout",
              label: "Maximum Single Payout (Rs.)",
              suffix: "Rs.",
              hint: "Cap per withdrawal request — prevents large one-time draws",
            })}
          </div>
          {minPayout > maxPayout && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-500" />
              <p className="text-xs font-semibold text-red-700">
                ⚠️ Minimum payout (Rs. {minPayout}) is greater than maximum (Rs. {maxPayout}).
                Please fix this — withdrawals will be blocked.
              </p>
            </div>
          )}
        </div>

        {/* ── Group 4: Operational Limits ── */}
        <div className="border-border/40 space-y-3 border-t pt-5">
          <SLabel icon={ShoppingCart}>Operational Limits</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            Platform-wide limits enforced at the API level for all riders
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {RField({
              k: "rider_max_deliveries",
              label: "Max Active Deliveries",
              suffix: "#",
              hint: "Maximum simultaneous deliveries/rides a rider can accept — enforced at accept time",
            })}
            {RField({
              k: "rider_acceptance_km",
              label: "Acceptance Radius",
              suffix: "KM",
              hint: "Max distance (km) from rider's location to accept an order or ride",
            })}
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-gray-50 p-3">
            <Package className="text-muted-foreground mt-0.5 h-4 w-4 flex-shrink-0" />
            <p className="text-muted-foreground text-xs leading-relaxed">
              Max active deliveries is enforced server-side — a rider trying to accept order #
              {maxDeliveries + 1} while already carrying {maxDeliveries} will get a clear error
              message. Applies to both orders and rides combined.
            </p>
          </div>
        </div>

        {/* ── Group 5: Feature Controls ── */}
        <div className="border-border/40 space-y-3 border-t pt-5">
          <SLabel icon={ToggleRight}>Feature Controls</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            Enable or disable specific rider portal features
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Toggle
              checked={cashAllowed}
              isDirty={d("rider_cash_allowed")}
              onChange={(val) => handleToggle("rider_cash_allowed", val)}
              label="Allow Cash-on-Delivery Orders"
              sub={
                cashAllowed
                  ? "Riders see COD orders in their request feed"
                  : "Cash orders hidden — rider app shows a disabled notice"
              }
            />
            <Toggle
              checked={withdrawOn}
              isDirty={d("rider_withdrawal_enabled")}
              onChange={(val) => handleToggle("rider_withdrawal_enabled", val)}
              label="Riders Can Submit Withdrawals"
              sub={
                withdrawOn
                  ? "Withdraw button is active in rider wallet"
                  : "Wallet shows 'Withdrawals Paused' — API also blocks requests"
              }
              danger={!withdrawOn}
            />
          </div>
          {!withdrawOn && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
              <p className="text-xs leading-relaxed text-amber-700">
                <strong>Withdrawals are off.</strong> Riders see a "Paused" notice and a red banner
                in their wallet. The API returns 403 if they attempt a withdrawal anyway. Turn on to
                resume payouts.
              </p>
            </div>
          )}
        </div>

        {/* ── Group 6: Rider App Modules ── */}
        <div className="border-border/40 space-y-3 border-t pt-5">
          <SLabel icon={ToggleRight}>Rider App Modules</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            Toggle individual features visible in the rider app. Disabled modules are hidden from
            all riders.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Toggle
              checked={v("rider_module_wallet") !== "off"}
              isDirty={d("rider_module_wallet")}
              onChange={(val) => handleToggle("rider_module_wallet", val)}
              label="Wallet"
              sub="Wallet page with balance, deposits, withdrawals and transactions"
            />
            <Toggle
              checked={v("rider_module_earnings") !== "off"}
              isDirty={d("rider_module_earnings")}
              onChange={(val) => handleToggle("rider_module_earnings", val)}
              label="Earnings Dashboard"
              sub="Charts and statistics about daily/weekly earnings"
            />
            <Toggle
              checked={v("rider_module_history") !== "off"}
              isDirty={d("rider_module_history")}
              onChange={(val) => handleToggle("rider_module_history", val)}
              label="Delivery History"
              sub="Past orders and rides history list"
            />
            <Toggle
              checked={v("rider_module_2fa_required") === "on"}
              isDirty={d("rider_module_2fa_required")}
              onChange={(val) => handleToggle("rider_module_2fa_required", val)}
              label="Require 2FA for Riders"
              sub="Force all riders to set up two-factor authentication"
            />
            <Toggle
              checked={v("rider_module_gps_tracking") !== "off"}
              isDirty={d("rider_module_gps_tracking")}
              onChange={(val) => handleToggle("rider_module_gps_tracking", val)}
              label="GPS Tracking"
              sub="Live location tracking during active deliveries"
            />
            <Toggle
              checked={v("rider_module_profile_edit") !== "off"}
              isDirty={d("rider_module_profile_edit")}
              onChange={(val) => handleToggle("rider_module_profile_edit", val)}
              label="Profile Editing"
              sub="Allow riders to edit their profile information"
            />
            <Toggle
              checked={v("rider_module_support_chat") !== "off"}
              isDirty={d("rider_module_support_chat")}
              onChange={(val) => handleToggle("rider_module_support_chat", val)}
              label="Support Chat"
              sub="In-app support/help chat feature"
            />
          </div>
        </div>

        {/* ── Earnings Simulation Table ── */}
        <div className="border-border/40 border-t pt-5">
          <SLabel icon={BarChart3}>Rider Earnings Simulation</SLabel>
          <p className="text-muted-foreground -mt-1 mb-3 text-xs">
            Live preview of rider take-home for different delivery fee amounts at current settings
          </p>
          <div className="border-border overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead className="border-border border-b bg-gray-50">
                <tr>
                  <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-bold">
                    Delivery Fee
                  </th>
                  <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-bold">
                    Rider Earns ({keepPct}%)
                  </th>
                  <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-bold">
                    + Bonus
                  </th>
                  <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-bold">
                    Total per Trip
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {[50, 80, 100, 150, 200].map((fee) => {
                  const earn = parseFloat(((fee * keepPct) / 100).toFixed(2));
                  const total = parseFloat((earn + bonusPerTrip).toFixed(2));
                  return (
                    <tr key={fee} className="transition-colors hover:bg-gray-50/50">
                      <td className="text-muted-foreground px-4 py-2.5">Rs. {fee}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-green-600">
                        Rs. {earn}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-blue-600">
                        {bonusPerTrip > 0 ? `+ Rs. ${bonusPerTrip}` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-extrabold text-emerald-700">
                        Rs. {total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-border grid grid-cols-3 gap-3 border-t bg-gray-50 px-4 py-3 text-center">
              <div>
                <p className="text-muted-foreground text-[10px] font-medium">Max Deliveries</p>
                <p className="text-foreground text-sm font-extrabold">{maxDeliveries} at once</p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] font-medium">Min Payout</p>
                <p className="text-foreground text-sm font-extrabold">
                  Rs. {minPayout.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] font-medium">Max Payout</p>
                <p className="text-foreground text-sm font-extrabold">
                  Rs. {maxPayout.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (cat === "vendor") {
    const v = (k: string) => localValues[k] ?? catSettings.find((s) => s.key === k)?.value ?? "";
    const d = (k: string) => dirtyKeys.has(k);

    const commPct = parseFloat(v("vendor_commission_pct") || "15");
    const settleDays = parseInt(v("vendor_settlement_days") || "7");
    const minPayout = parseFloat(v("vendor_min_payout") || "500");
    const maxPayout = parseFloat(v("vendor_max_payout") || "50000");
    const _minOrder = parseFloat(v("vendor_min_order") || "100");
    const maxItems = parseInt(v("vendor_max_items") || "100");
    const autoApprove = v("vendor_auto_approve") === "on";
    const promoOn = v("vendor_promo_enabled") !== "off";
    const withdrawOn = v("vendor_withdrawal_enabled") !== "off";

    const vendorKeep = Math.round(100 - commPct);
    const sampleOrder = 1000;
    const vendorEarns = Math.round(sampleOrder * (vendorKeep / 100));
    const platEarns = sampleOrder - vendorEarns;

    const VField = ({
      k,
      label,
      suffix,
      hint,
    }: {
      k: string;
      label: string;
      suffix?: string;
      hint?: string;
    }) => {
      const isDirty = d(k);
      return (
        <CardFrame isDirty={isDirty} className="space-y-2.5">
          <div className="flex items-center gap-2">
            <label className="text-foreground text-sm font-semibold">{label}</label>
            {isDirty && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
              >
                CHANGED
              </Badge>
            )}
          </div>
          {hint && <p className="text-muted-foreground text-[11px]">{hint}</p>}
          <div className="relative">
            <Input
              type="number"
              min={0}
              value={v(k)}
              onChange={(e) => handleChange(k, e.target.value)}
              className={`h-10 rounded-xl ${suffix ? "pr-16" : ""} ${isDirty ? "border-amber-300 bg-amber-50/50 ring-1 ring-amber-200" : ""}`}
            />
            {suffix && (
              <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-xs font-bold">
                {suffix}
              </span>
            )}
          </div>
          <p className="text-muted-foreground font-mono text-[10px]">{k}</p>
        </CardFrame>
      );
    };

    return (
      <div className="space-y-6">
        {/* ── Group 1: Onboarding & Approval ── */}
        <div className="space-y-3">
          <SLabel icon={Store}>Onboarding & Registration</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            Control how new vendors join the platform
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Toggle
              checked={autoApprove}
              isDirty={d("vendor_auto_approve")}
              onChange={(val) => handleToggle("vendor_auto_approve", val)}
              label="Auto-Approve New Vendors"
              sub={
                autoApprove
                  ? "New vendors are immediately active — no review needed"
                  : "New vendor accounts need manual admin approval"
              }
            />
          </div>
          {!autoApprove && (
            <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3">
              <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
              <p className="text-xs leading-relaxed text-blue-700">
                <strong>Manual Review:</strong> When off, newly approved vendor accounts are set to{" "}
                <em>inactive</em> by default. Admin must activate them from the Users panel before
                they can log in.
              </p>
            </div>
          )}
        </div>

        {/* ── Group 2: Commission & Revenue ── */}
        <div className="border-border/40 space-y-3 border-t pt-5">
          <SLabel icon={Zap}>Commission & Revenue Split</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            How earnings are split between vendors and the platform
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {VField({
              k: "vendor_commission_pct",
              label: "Platform Commission (%)",
              suffix: "%",
              hint: "Platform keeps this % of every vendor order value",
            })}
            {VField({
              k: "vendor_settlement_days",
              label: "Settlement Cycle (Days)",
              suffix: "days",
              hint: "Days after order completion before vendor earnings settle",
            })}
          </div>

          {/* Revenue Split Visualizer */}
          <div className="rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50 p-4">
            <p className="mb-3 text-xs font-bold text-orange-700">
              💡 Live Revenue Preview — Rs. {sampleOrder.toLocaleString()} order
            </p>
            <div className="mb-2.5 flex h-8 overflow-hidden rounded-lg shadow-sm">
              <div
                className="flex items-center justify-center text-xs font-extrabold text-white"
                style={{
                  width: `${vendorKeep}%`,
                  background: "linear-gradient(90deg,#f97316,#fb923c)",
                }}
              >
                {vendorKeep}% Vendor
              </div>
              <div
                className="flex items-center justify-center text-xs font-extrabold text-white"
                style={{
                  width: `${commPct}%`,
                  background: "linear-gradient(90deg,#1d4ed8,#3b82f6)",
                }}
              >
                {commPct}%
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-orange-100 bg-white p-3 text-center">
                <p className="text-lg font-extrabold text-orange-600">
                  Rs. {vendorEarns.toLocaleString()}
                </p>
                <p className="text-muted-foreground text-[11px] font-medium">
                  Vendor earns ({vendorKeep}%)
                </p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-white p-3 text-center">
                <p className="text-lg font-extrabold text-blue-600">
                  Rs. {platEarns.toLocaleString()}
                </p>
                <p className="text-muted-foreground text-[11px] font-medium">
                  Platform keeps ({commPct}%)
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Group 3: Payout Rules ── */}
        <div className="border-border/40 space-y-3 border-t pt-5">
          <SLabel icon={Banknote}>Payout Rules</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            Minimum and maximum withdrawal request amounts
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {VField({
              k: "vendor_min_payout",
              label: "Minimum Payout Request (Rs.)",
              suffix: "Rs.",
              hint: "Vendor cannot submit a withdrawal below this amount",
            })}
            {VField({
              k: "vendor_max_payout",
              label: "Maximum Single Payout (Rs.)",
              suffix: "Rs.",
              hint: "Cap per withdrawal request — prevents large one-time draws",
            })}
          </div>
          {minPayout > maxPayout && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-500" />
              <p className="text-xs font-semibold text-red-700">
                ⚠️ Minimum payout (Rs. {minPayout}) is greater than maximum (Rs. {maxPayout}).
                Please fix this.
              </p>
            </div>
          )}
        </div>

        {/* ── Group 4: Store Rules ── */}
        <div className="border-border/40 space-y-3 border-t pt-5">
          <SLabel icon={ShoppingCart}>Store Rules</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            Platform-wide limits applied to all vendor stores
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {VField({
              k: "vendor_min_order",
              label: "Default Minimum Order (Rs.)",
              suffix: "Rs.",
              hint: "Vendors set their own min order — this is the platform floor",
            })}
            {VField({
              k: "vendor_max_items",
              label: "Max Menu Items Per Vendor",
              suffix: "items",
              hint: "Product/menu listing cap enforced at API level",
            })}
            {VField({
              k: "low_stock_threshold",
              label: "Low Stock Alert Threshold",
              suffix: "units",
              hint: "Vendor dashboard shows a warning when stock falls below this number",
            })}
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-gray-50 p-3">
            <Package className="text-muted-foreground mt-0.5 h-4 w-4 flex-shrink-0" />
            <p className="text-muted-foreground text-xs leading-relaxed">
              Product limit is enforced server-side — vendors cannot add more items once they reach{" "}
              <strong>{maxItems} items</strong>. Current limit applies to single-add and bulk-add
              both.
            </p>
          </div>
        </div>

        {/* ── Group 5: Feature Controls ── */}
        <div className="border-border/40 space-y-3 border-t pt-5">
          <SLabel icon={ToggleRight}>Feature Controls</SLabel>
          <p className="text-muted-foreground -mt-1 text-xs">
            Enable or disable specific vendor portal features
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Toggle
              checked={promoOn}
              isDirty={d("vendor_promo_enabled")}
              onChange={(val) => handleToggle("vendor_promo_enabled", val)}
              label="Vendors Can Create Promo Codes"
              sub={
                promoOn
                  ? "Vendors can create & manage discount codes"
                  : "Promo tab is locked in vendor portal"
              }
            />
            <Toggle
              checked={withdrawOn}
              isDirty={d("vendor_withdrawal_enabled")}
              onChange={(val) => handleToggle("vendor_withdrawal_enabled", val)}
              label="Vendors Can Submit Withdrawals"
              sub={
                withdrawOn
                  ? "Withdraw button is active in vendor wallet"
                  : "Wallet shows 'Withdrawals Paused' — no requests accepted"
              }
              danger={!withdrawOn}
            />
          </div>
          {!withdrawOn && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
              <p className="text-xs leading-relaxed text-amber-700">
                <strong>Withdrawals are off.</strong> Vendors see a "Paused" notice in their wallet.
                API also returns 403 if they attempt a withdrawal. Turn on to resume payouts.
              </p>
            </div>
          )}
        </div>

        {/* ── Simulation Summary Card ── */}
        <div className="border-border/40 border-t pt-5">
          <SLabel icon={BarChart3}>Vendor Earnings Summary</SLabel>
          <p className="text-muted-foreground -mt-1 mb-3 text-xs">
            Live preview of what a typical vendor experiences with current settings
          </p>
          <div className="border-border overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead className="border-border border-b bg-gray-50">
                <tr>
                  <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-bold">
                    Scenario
                  </th>
                  <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-bold">
                    Vendor Earns
                  </th>
                  <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-bold">
                    Platform Takes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {[500, 1000, 2000, 5000].map((amt) => (
                  <tr key={amt} className="transition-colors hover:bg-gray-50/50">
                    <td className="text-muted-foreground px-4 py-2.5">
                      Rs. {amt.toLocaleString()} order
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-orange-600">
                      Rs. {Math.round((amt * vendorKeep) / 100).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-blue-600">
                      Rs. {Math.round((amt * commPct) / 100).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-border grid grid-cols-3 gap-3 border-t bg-gray-50 px-4 py-3 text-center">
              <div>
                <p className="text-muted-foreground text-[10px] font-medium">Settlement</p>
                <p className="text-foreground text-sm font-extrabold">{settleDays} days</p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] font-medium">Min Payout</p>
                <p className="text-foreground text-sm font-extrabold">
                  Rs. {minPayout.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] font-medium">Max Payout</p>
                <p className="text-foreground text-sm font-extrabold">
                  Rs. {maxPayout.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (cat === "notifications") {
    const v = (k: string) => localValues[k] ?? catSettings.find((s) => s.key === k)?.value ?? "";
    const d = (k: string) => dirtyKeys.has(k);
    const NField = ({
      k,
      label,
      hint,
      rows,
    }: {
      k: string;
      label: string;
      hint?: string;
      rows?: number;
    }) => {
      const isDirty = d(k);
      return (
        <div
          className={`space-y-2 rounded-xl border p-4 transition-all ${isDirty ? "border-amber-300 bg-amber-50/30" : "border-border bg-white"}`}
        >
          <div className="flex items-center gap-2">
            <label className="text-foreground text-sm font-semibold">{label}</label>
            {isDirty && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
              >
                CHANGED
              </Badge>
            )}
          </div>
          {hint && <p className="text-muted-foreground text-[11px]">{hint}</p>}
          {rows ? (
            <textarea
              value={v(k)}
              onChange={(e) => handleChange(k, e.target.value)}
              rows={rows}
              className={`w-full rounded-lg border p-2.5 font-mono text-sm ${isDirty ? "border-amber-300 bg-amber-50/50" : "border-gray-200"}`}
            />
          ) : (
            <Input
              value={v(k)}
              onChange={(e) => handleChange(k, e.target.value)}
              className={`h-9 rounded-lg text-sm ${isDirty ? "border-amber-300 bg-amber-50/50" : ""}`}
            />
          )}
          <p className="text-muted-foreground/60 font-mono text-[10px]">{k}</p>
        </div>
      );
    };

    return (
      <div className="space-y-6">
        <div>
          <SLabel icon={MessageSquare}>Email Templates</SLabel>
          <p className="text-muted-foreground mb-3 text-xs">
            HTML templates for transactional emails. Use {"{link}"}, {"{otp}"}, {"{userName}"},{" "}
            {"{appName}"} as placeholders.
          </p>
          <div className="space-y-4">
            {NField({
              k: "email_template_verify_html",
              label: "Verification Email HTML",
              hint: "Sent when a user registers — include {link} placeholder",
              rows: 5,
            })}
            {NField({
              k: "email_template_reset_html",
              label: "Password Reset Email HTML",
              hint: "Sent for password reset — include {otp} placeholder",
              rows: 5,
            })}
            {NField({
              k: "email_template_magic_html",
              label: "Magic Link Email HTML",
              hint: "Passwordless login email — include {link} placeholder",
              rows: 5,
            })}
          </div>
        </div>
        <div className="border-border/40 border-t pt-5">
          <SLabel icon={MessageSquare}>Push Notification Text</SLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {NField({
              k: "notif_text_ride_request",
              label: "Ride Request Notification",
              hint: "Sent to rider when a new ride is available",
            })}
            {NField({
              k: "notif_text_order_update",
              label: "Order Status Update",
              hint: "Sent to customer when order status changes",
            })}
          </div>
        </div>
        <div className="border-border/40 border-t pt-5">
          <SLabel icon={AlertTriangle}>Fraud Alert Thresholds</SLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {NField({
              k: "alert_high_value_threshold",
              label: "High Value Order Threshold (Rs.)",
              hint: "Orders above this trigger admin alert",
            })}
            {NField({
              k: "fraud_same_address_limit",
              label: "Same Address Limit",
              hint: "Max orders from same address before flagging",
            })}
            {NField({
              k: "fraud_gps_mismatch_threshold_m",
              label: "GPS Mismatch Threshold (m)",
              hint: "Distance mismatch that triggers GPS fraud flag",
            })}
            {NField({
              k: "fraud_new_account_order_limit",
              label: "New Account Order Limit",
              hint: "Max orders for accounts under 24h old",
            })}
            {NField({
              k: "fraud_daily_order_limit",
              label: "Daily Order Limit",
              hint: "Max orders per user per day before review",
            })}
          </div>
        </div>
      </div>
    );
  }

  if (cat === "uploads") {
    const v = (k: string) => localValues[k] ?? catSettings.find((s) => s.key === k)?.value ?? "";
    const d = (k: string) => dirtyKeys.has(k);
    const UField = ({
      k,
      label,
      suffix,
      hint,
    }: {
      k: string;
      label: string;
      suffix?: string;
      hint?: string;
    }) => {
      const isDirty = d(k);
      return (
        <div
          className={`space-y-2 rounded-xl border p-4 transition-all ${isDirty ? "border-amber-300 bg-amber-50/30" : "border-border bg-white"}`}
        >
          <div className="flex items-center gap-2">
            <label className="text-foreground text-sm font-semibold">{label}</label>
            {isDirty && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
              >
                CHANGED
              </Badge>
            )}
          </div>
          {hint && <p className="text-muted-foreground text-[11px]">{hint}</p>}
          <div className="relative">
            <Input
              value={v(k)}
              onChange={(e) => handleChange(k, e.target.value)}
              className={`h-9 rounded-lg text-sm ${suffix ? "pr-14" : ""} ${isDirty ? "border-amber-300 bg-amber-50/50" : ""}`}
            />
            {suffix && (
              <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-xs font-bold">
                {suffix}
              </span>
            )}
          </div>
          <p className="text-muted-foreground/60 font-mono text-[10px]">{k}</p>
        </div>
      );
    };

    return (
      <div className="space-y-6">
        <div>
          <SLabel icon={Package}>File Size Limits</SLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {UField({
              k: "upload_max_image_mb",
              label: "Max Image Size",
              suffix: "MB",
              hint: "Maximum file size for image uploads",
            })}
            {UField({
              k: "upload_max_video_mb",
              label: "Max Video Size",
              suffix: "MB",
              hint: "Maximum file size for video uploads",
            })}
            {UField({
              k: "upload_max_video_duration_sec",
              label: "Max Video Duration",
              suffix: "sec",
              hint: "Maximum video length in seconds",
            })}
          </div>
        </div>
        <div className="border-border/40 border-t pt-5">
          <SLabel icon={FileText}>Allowed Formats</SLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {UField({
              k: "upload_allowed_image_formats",
              label: "Image Formats",
              hint: "Comma-separated, e.g. jpg,png,webp",
            })}
            {UField({
              k: "upload_allowed_video_formats",
              label: "Video Formats",
              hint: "Comma-separated, e.g. mp4,mov",
            })}
          </div>
        </div>
      </div>
    );
  }

  if (cat === "pagination") {
    const v = (k: string) => localValues[k] ?? catSettings.find((s) => s.key === k)?.value ?? "";
    const d = (k: string) => dirtyKeys.has(k);
    const PField = ({ k, label, hint }: { k: string; label: string; hint?: string }) => {
      const isDirty = d(k);
      return (
        <div
          className={`space-y-2 rounded-xl border p-4 transition-all ${isDirty ? "border-amber-300 bg-amber-50/30" : "border-border bg-white"}`}
        >
          <div className="flex items-center gap-2">
            <label className="text-foreground text-sm font-semibold">{label}</label>
            {isDirty && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
              >
                CHANGED
              </Badge>
            )}
          </div>
          {hint && <p className="text-muted-foreground text-[11px]">{hint}</p>}
          <Input
            type="number"
            min={1}
            value={v(k)}
            onChange={(e) => handleChange(k, e.target.value)}
            className={`h-9 rounded-lg text-sm ${isDirty ? "border-amber-300 bg-amber-50/50" : ""}`}
          />
          <p className="text-muted-foreground/60 font-mono text-[10px]">{k}</p>
        </div>
      );
    };

    return (
      <div className="space-y-6">
        <div>
          <SLabel icon={BarChart3}>Product Listing Limits</SLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PField({
              k: "pagination_products_default",
              label: "Products Per Page (Default)",
              hint: "Default page size for product listings",
            })}
            {PField({
              k: "pagination_products_max",
              label: "Products Per Page (Max)",
              hint: "Maximum page size a client can request",
            })}
            {PField({
              k: "pagination_trending_limit",
              label: "Trending Searches Shown",
              hint: "Number of trending search terms displayed",
            })}
            {PField({
              k: "pagination_flash_deals",
              label: "Flash Deals Per Page",
              hint: "Number of flash deal items shown per page",
            })}
          </div>
        </div>
      </div>
    );
  }

  if (cat === "van") {
    const v = (k: string) => localValues[k] ?? catSettings.find((s) => s.key === k)?.value ?? "";
    const d = (k: string) => dirtyKeys.has(k);
    const VField = ({
      k,
      label,
      suffix,
      hint,
    }: {
      k: string;
      label: string;
      suffix?: string;
      hint?: string;
    }) => {
      const isDirty = d(k);
      return (
        <div
          className={`space-y-2 rounded-xl border p-4 transition-all ${isDirty ? "border-amber-300 bg-amber-50/30" : "border-border bg-white"}`}
        >
          <div className="flex items-center gap-2">
            <label className="text-foreground text-sm font-semibold">{label}</label>
            {isDirty && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
              >
                CHANGED
              </Badge>
            )}
          </div>
          {hint && <p className="text-muted-foreground text-[11px]">{hint}</p>}
          <div className="relative">
            <Input
              value={v(k)}
              onChange={(e) => handleChange(k, e.target.value)}
              className={`h-9 rounded-lg text-sm ${suffix ? "pr-14" : ""} ${isDirty ? "border-amber-300 bg-amber-50/50" : ""}`}
            />
            {suffix && (
              <span className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-xs font-bold">
                {suffix}
              </span>
            )}
          </div>
          <p className="text-muted-foreground/60 font-mono text-[10px]">{k}</p>
        </div>
      );
    };

    return (
      <div className="space-y-6">
        <div>
          <SLabel icon={Car}>Booking Rules</SLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {VField({
              k: "van_min_advance_hours",
              label: "Min Advance Booking",
              suffix: "hrs",
              hint: "How many hours before departure a booking must be made",
            })}
            {VField({
              k: "van_max_seats_per_booking",
              label: "Max Seats Per Booking",
              suffix: "seats",
              hint: "Maximum seats one customer can book at once",
            })}
            {VField({
              k: "van_cancellation_window_hours",
              label: "Cancellation Window",
              suffix: "hrs",
              hint: "Hours before departure that free cancellation is allowed",
            })}
            {VField({
              k: "van_seat_hold_minutes",
              label: "Seat Hold Duration",
              suffix: "min",
              hint: "Minutes a seat is held during unpaid checkout",
            })}
          </div>
        </div>
        <div className="border-border/40 border-t pt-5">
          <SLabel icon={Shield}>Refund & Passenger Rules</SLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {VField({
              k: "van_refund_type",
              label: "Refund Type",
              hint: "full or partial — type of refund on cancellation",
            })}
            {VField({
              k: "van_refund_partial_pct",
              label: "Partial Refund %",
              suffix: "%",
              hint: "Percentage refunded if refund type is partial",
            })}
            {VField({
              k: "van_min_passengers",
              label: "Min Passengers to Depart",
              suffix: "pax",
              hint: "Minimum passengers required or trip may be cancelled",
            })}
            {VField({
              k: "van_min_check_hours_before",
              label: "Min Passenger Check Before",
              suffix: "hrs",
              hint: "Hours before departure to check minimum passengers",
            })}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Toggle
              checked={(localValues["van_auto_notify_cancel"] ?? "on") === "on"}
              isDirty={d("van_auto_notify_cancel")}
              onChange={(val) => handleToggle("van_auto_notify_cancel", val)}
              label="Auto-Notify on Cancel"
              sub="Notify passengers when trip is cancelled"
            />
            <Toggle
              checked={(localValues["van_require_start_trip"] ?? "on") === "on"}
              isDirty={d("van_require_start_trip")}
              onChange={(val) => handleToggle("van_require_start_trip", val)}
              label="Require Start Trip"
              sub="Driver must tap Start before passengers can board"
            />
          </div>
        </div>
        <div className="border-border/40 border-t pt-5">
          <SLabel icon={Truck}>Driver Limits</SLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {VField({
              k: "van_max_driver_trips_day",
              label: "Max Driver Trips/Day",
              suffix: "trips",
              hint: "Maximum trips a driver can make per day",
            })}
            {VField({
              k: "van_driver_rest_hours",
              label: "Driver Rest Between Trips",
              suffix: "hrs",
              hint: "Mandatory rest period between trips",
            })}
          </div>
        </div>
        <div className="border-border/40 border-t pt-5">
          <SLabel icon={Percent}>Pricing Surcharges</SLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {VField({
              k: "van_peak_surcharge_pct",
              label: "Peak Hours Surcharge",
              suffix: "%",
              hint: "Extra charge during peak hours",
            })}
            {VField({
              k: "van_peak_hours",
              label: "Peak Hours",
              hint: "Comma-separated hours, e.g. 7,8,9,17,18",
            })}
            {VField({
              k: "van_weekend_surcharge_pct",
              label: "Weekend Surcharge",
              suffix: "%",
              hint: "Extra charge on weekends",
            })}
            {VField({
              k: "van_holiday_surcharge_pct",
              label: "Holiday Surcharge",
              suffix: "%",
              hint: "Extra charge on holidays",
            })}
            {VField({
              k: "van_holiday_dates",
              label: "Holiday Dates",
              hint: "Comma-separated YYYY-MM-DD dates",
            })}
          </div>
        </div>
      </div>
    );
  }

  if (cat === "onboarding") {
    const v = (k: string) => localValues[k] ?? catSettings.find((s) => s.key === k)?.value ?? "";
    const d = (k: string) => dirtyKeys.has(k);

    return (
      <div className="space-y-6">
        <div>
          <SLabel icon={ToggleRight}>Vendor Auto-Schedule</SLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Toggle
              checked={(localValues["vendor_auto_schedule_enabled"] ?? "off") === "on"}
              isDirty={d("vendor_auto_schedule_enabled")}
              onChange={(val) => handleToggle("vendor_auto_schedule_enabled", val)}
              label="Enable Auto-Schedule"
              sub="Automatically open/close vendor stores on a weekly schedule"
            />
          </div>
        </div>
        <div className="border-border/40 border-t pt-5">
          <SLabel icon={Settings}>Schedule Hours</SLabel>
          <p className="text-muted-foreground mb-2 text-xs">
            JSON format: {`{"mon":"09:00-21:00","tue":"09:00-21:00",...}`}
          </p>
          <div
            className={`space-y-2 rounded-xl border p-4 transition-all ${d("vendor_auto_schedule_hours") ? "border-amber-300 bg-amber-50/30" : "border-border bg-white"}`}
          >
            <div className="flex items-center gap-2">
              <label className="text-foreground text-sm font-semibold">Weekly Schedule JSON</label>
              {d("vendor_auto_schedule_hours") && (
                <Badge
                  variant="outline"
                  className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
                >
                  CHANGED
                </Badge>
              )}
            </div>
            <textarea
              value={v("vendor_auto_schedule_hours")}
              onChange={(e) => handleChange("vendor_auto_schedule_hours", e.target.value)}
              rows={4}
              className={`w-full rounded-lg border p-2.5 font-mono text-sm ${d("vendor_auto_schedule_hours") ? "border-amber-300 bg-amber-50/50" : "border-gray-200"}`}
            />
            <p className="text-muted-foreground/60 font-mono text-[10px]">
              vendor_auto_schedule_hours
            </p>
          </div>
        </div>
        <div className="border-border/40 border-t pt-5">
          <SLabel icon={Star}>Onboarding Slides</SLabel>
          <p className="text-muted-foreground mb-2 text-xs">
            JSON array of slide objects: {`[{"title":"...","subtitle":"...","image":"..."}]`}
          </p>
          <div
            className={`space-y-2 rounded-xl border p-4 transition-all ${d("onboarding_slides") ? "border-amber-300 bg-amber-50/30" : "border-border bg-white"}`}
          >
            <div className="flex items-center gap-2">
              <label className="text-foreground text-sm font-semibold">
                Onboarding Slides JSON
              </label>
              {d("onboarding_slides") && (
                <Badge
                  variant="outline"
                  className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
                >
                  CHANGED
                </Badge>
              )}
            </div>
            <textarea
              value={v("onboarding_slides")}
              onChange={(e) => handleChange("onboarding_slides", e.target.value)}
              rows={6}
              className={`w-full rounded-lg border p-2.5 font-mono text-sm ${d("onboarding_slides") ? "border-amber-300 bg-amber-50/50" : "border-gray-200"}`}
            />
            <p className="text-muted-foreground/60 font-mono text-[10px]">onboarding_slides</p>
          </div>
        </div>
      </div>
    );
  }

  if (cat === "moderation") {
    const v = (k: string) => localValues[k] ?? catSettings.find((s) => s.key === k)?.value ?? "";
    const d = (k: string) => dirtyKeys.has(k);

    return (
      <div className="space-y-6">
        <div>
          <SLabel icon={ShieldCheck}>Auto-Masking Rules</SLabel>
          <p className="text-muted-foreground mb-3 text-xs">
            Toggle which types of personal data are automatically masked in chat and reviews
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Toggle
              checked={(localValues["comm_hide_phone"] ?? "on") === "on"}
              isDirty={d("comm_hide_phone")}
              onChange={(val) => handleToggle("comm_hide_phone", val)}
              label="Mask Phone Numbers"
              sub="Replace phone numbers with asterisks"
            />
            <Toggle
              checked={(localValues["comm_hide_email"] ?? "on") === "on"}
              isDirty={d("comm_hide_email")}
              onChange={(val) => handleToggle("comm_hide_email", val)}
              label="Mask Email Addresses"
              sub="Replace emails with masked format"
            />
            <Toggle
              checked={(localValues["comm_hide_cnic"] ?? "on") === "on"}
              isDirty={d("comm_hide_cnic")}
              onChange={(val) => handleToggle("comm_hide_cnic", val)}
              label="Mask CNIC Numbers"
              sub="Replace national ID numbers"
            />
            <Toggle
              checked={(localValues["comm_hide_bank"] ?? "on") === "on"}
              isDirty={d("comm_hide_bank")}
              onChange={(val) => handleToggle("comm_hide_bank", val)}
              label="Mask Bank Accounts"
              sub="Replace bank account/IBAN numbers"
            />
            <Toggle
              checked={(localValues["comm_hide_address"] ?? "on") === "on"}
              isDirty={d("comm_hide_address")}
              onChange={(val) => handleToggle("comm_hide_address", val)}
              label="Mask Addresses"
              sub="Replace street addresses"
            />
          </div>
        </div>
        <div className="border-border/40 border-t pt-5">
          <SLabel icon={Settings}>Mask Formats</SLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              {
                k: "comm_mask_format_phone",
                label: "Phone Mask Format",
                hint: "e.g. 03XX-XXXXXXX",
              },
              {
                k: "comm_mask_format_email",
                label: "Email Mask Format",
                hint: "e.g. u***@***.com",
              },
              {
                k: "comm_mask_format_cnic",
                label: "CNIC Mask Format",
                hint: "e.g. XXXXX-XXXXXXX-X",
              },
            ].map(({ k, label, hint }) => (
              <div
                key={k}
                className={`space-y-2 rounded-xl border p-4 transition-all ${d(k) ? "border-amber-300 bg-amber-50/30" : "border-border bg-white"}`}
              >
                <div className="flex items-center gap-2">
                  <label className="text-foreground text-sm font-semibold">{label}</label>
                  {d(k) && (
                    <Badge
                      variant="outline"
                      className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
                    >
                      CHANGED
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground text-[11px]">{hint}</p>
                <Input
                  value={v(k)}
                  onChange={(e) => handleChange(k, e.target.value)}
                  className={`h-9 rounded-lg text-sm ${d(k) ? "border-amber-300 bg-amber-50/50" : ""}`}
                />
                <p className="text-muted-foreground/60 font-mono text-[10px]">{k}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="border-border/40 border-t pt-5">
          <SLabel icon={AlertTriangle}>Flagged Keywords</SLabel>
          <div
            className={`space-y-2 rounded-xl border p-4 transition-all ${d("comm_flag_keywords") ? "border-amber-300 bg-amber-50/30" : "border-border bg-white"}`}
          >
            <div className="flex items-center gap-2">
              <label className="text-foreground text-sm font-semibold">Flag Keywords</label>
              {d("comm_flag_keywords") && (
                <Badge
                  variant="outline"
                  className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
                >
                  CHANGED
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-[11px]">
              Comma-separated words that trigger content flagging for admin review
            </p>
            <textarea
              value={v("comm_flag_keywords")}
              onChange={(e) => handleChange("comm_flag_keywords", e.target.value)}
              rows={3}
              className={`w-full rounded-lg border p-2.5 text-sm ${d("comm_flag_keywords") ? "border-amber-300 bg-amber-50/50" : "border-gray-200"}`}
            />
            <p className="text-muted-foreground/60 font-mono text-[10px]">comm_flag_keywords</p>
          </div>
        </div>
        <div className="border-border/40 border-t pt-5">
          <SLabel icon={Shield}>Custom Regex Patterns</SLabel>
          <p className="text-muted-foreground mb-2 text-xs">
            JSON array: {`[{"pattern":"regex","severity":"low|medium|high","label":"description"}]`}
          </p>
          <div
            className={`space-y-2 rounded-xl border p-4 transition-all ${d("moderation_custom_patterns") ? "border-amber-300 bg-amber-50/30" : "border-border bg-white"}`}
          >
            <div className="flex items-center gap-2">
              <label className="text-foreground text-sm font-semibold">Custom Patterns JSON</label>
              {d("moderation_custom_patterns") && (
                <Badge
                  variant="outline"
                  className="border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700"
                >
                  CHANGED
                </Badge>
              )}
            </div>
            <textarea
              value={v("moderation_custom_patterns")}
              onChange={(e) => handleChange("moderation_custom_patterns", e.target.value)}
              rows={5}
              className={`w-full rounded-lg border p-2.5 font-mono text-sm ${d("moderation_custom_patterns") ? "border-amber-300 bg-amber-50/50" : "border-gray-200"}`}
            />
            <p className="text-muted-foreground/60 font-mono text-[10px]">
              moderation_custom_patterns
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Default
  return (
    <div className="space-y-5">
      {toggles.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {toggles.map((s) => (
            <Toggle
              key={s.key}
              checked={(localValues[s.key] ?? s.value) === "on"}
              onChange={(v) => handleToggle(s.key, v)}
              label={s.label}
              isDirty={dirtyKeys.has(s.key)}
            />
          ))}
        </div>
      )}
      {inputs.length > 0 && (
        <div
          className={`grid grid-cols-1 gap-5 sm:grid-cols-2 ${toggles.length > 0 ? "border-border/40 border-t pt-4" : ""}`}
        >
          {inputs.map((s) => (
            <Fragment key={s.key}>{NumField({ s: s })}</Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
