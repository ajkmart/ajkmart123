import { db } from "@workspace/db";
import { abAssignmentsTable, abExperimentsTable, faqsTable } from "@workspace/db/schema";
import crypto from "crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { normalizePhoneFormatPattern } from "../lib/phone-format.js";
import { sendError, sendNotFound, sendSuccess, sendValidationError } from "../lib/response.js";
import { customerAuth, getClientIp } from "../middleware/security.js";
import { getCachedSettings } from "./admin.js";

const router: IRouter = Router();

// Public endpoint — all client apps fetch this for config + feature flags
router.get("/", async (req, res) => {
  res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
  const s: Record<string, string> = await getCachedSettings();
  const isDemoMode = s["platform_mode"] !== "live";
  let demoData: {
    vendors: unknown[];
    orders: unknown[];
    riders: unknown[];
    products: unknown[];
    source: string;
  } | null = null;
  if (isDemoMode) {
    const { getDemoSnapshot } = await import("../lib/demo-snapshot.js");
    const snap = await getDemoSnapshot();
    demoData = {
      vendors: snap.vendors,
      orders: snap.orders,
      riders: snap.riders,
      products: snap.products,
      source: snap.source ?? "demo",
    };
  }

  const jazzcashEnabled = (s["jazzcash_enabled"] ?? "off") === "on";
  const easypaisaEnabled = (s["easypaisa_enabled"] ?? "off") === "on";
  const walletEnabled = (s["feature_wallet"] ?? "on") === "on";

  // Build available payment methods list for client apps
  const paymentMethods: Array<{
    id: string;
    label: string;
    logo: string;
    available: boolean;
    mode: string;
    description: string;
  }> = [
    {
      id: "cash",
      label: "Cash on Delivery",
      logo: "💵",
      available: true,
      mode: "live",
      description: "Delivery par payment karein",
    },
    {
      id: "wallet",
      label: `${s["app_name"] ?? "AJKMart"} Wallet`,
      logo: "💰",
      available: walletEnabled,
      mode: "live",
      description: "Apni wallet se instant pay karein",
    },
    {
      id: "jazzcash",
      label: "JazzCash",
      logo: "🔴",
      available: jazzcashEnabled,
      mode: s["jazzcash_mode"] ?? "sandbox",
      description: "JazzCash mobile wallet",
    },
    {
      id: "easypaisa",
      label: "EasyPaisa",
      logo: "🟢",
      available: easypaisaEnabled,
      mode: s["easypaisa_mode"] ?? "sandbox",
      description: "EasyPaisa mobile wallet",
    },
  ];

  sendSuccess(res, {
    deliveryFee: {
      mart: parseFloat(s["delivery_fee_mart"] ?? "80"),
      food: parseFloat(s["delivery_fee_food"] ?? "60"),
      pharmacy: parseFloat(s["delivery_fee_pharmacy"] ?? "50"),
      parcel: parseFloat(s["delivery_fee_parcel"] ?? "100"),
      parcelPerKg: parseFloat(s["delivery_parcel_per_kg"] ?? "40"),
      freeEnabled: (s["delivery_free_enabled"] ?? "on") === "on",
      freeDeliveryAbove: parseFloat(s["free_delivery_above"] ?? "1000"),
    },
    rides: {
      bikeBaseFare: parseFloat(s["ride_bike_base_fare"] ?? "15"),
      bikePerKm: parseFloat(s["ride_bike_per_km"] ?? "8"),
      bikeMinFare: parseFloat(s["ride_bike_min_fare"] ?? "50"),
      carBaseFare: parseFloat(s["ride_car_base_fare"] ?? "25"),
      carPerKm: parseFloat(s["ride_car_per_km"] ?? "12"),
      carMinFare: parseFloat(s["ride_car_min_fare"] ?? "80"),
      surgeEnabled: (s["ride_surge_enabled"] ?? "off") === "on",
      surgeMultiplier: parseFloat(s["ride_surge_multiplier"] ?? "1.5"),
      cancellationFee: parseFloat(s["ride_cancellation_fee"] ?? "30"),
      cancelGraceSec: parseInt(s["ride_cancel_grace_sec"] ?? "180", 10),
      riderEarningPct: Number(s["rider_keep_pct"]) || 80,
      bargainingEnabled: (s["ride_bargaining_enabled"] ?? "on") === "on",
      bargainingMinPct: parseFloat(s["ride_bargaining_min_pct"] ?? "70"),
      bargainingMaxRounds: parseInt(s["ride_bargaining_max_rounds"] ?? "3", 10),
    },
    language: (() => {
      const defaultLang = s["default_language"] ?? "en";
      let enabledLangs: string[];
      try {
        enabledLangs = JSON.parse(s["enabled_languages"] ?? "[]") as string[];
      } catch (err) {
        logger.debug(
          { error: err instanceof Error ? err.message : String(err) },
          "[fn] parse fallback"
        );
        enabledLangs = ["en"];
      }
      if (!enabledLangs.length) enabledLangs = ["en"];
      return { defaultLanguage: defaultLang, enabledLanguages: enabledLangs };
    })(),
    platform: {
      commissionPct: parseFloat(s["platform_commission_pct"] ?? "10"),
      vendorCommissionPct: parseFloat(s["vendor_commission_pct"] ?? "15"),
      minOrderAmount: parseFloat(s["min_order_amount"] ?? "100"),
      maxCodAmount: parseFloat(s["cod_max_amount"] ?? "5000"),
      freeDeliveryAbove: parseFloat(s["free_delivery_above"] ?? "1000"),
      appName: s["app_name"] ?? "AJKMart",
      appTagline: s["app_tagline"] ?? "Your super app for everything",
      appVersion: s["app_version"] ?? "1.0.0",
      appStatus: (() => {
        const base = s["app_status"] ?? "active";
        if (base !== "maintenance") return base;
        const key = (s["security_maintenance_key"] ?? "").trim();
        const bypass = ((req.headers["x-maintenance-key"] as string) ?? "").trim();
        return key && bypass === key ? "active" : "maintenance";
      })(),
      supportPhone: s["support_phone"] ?? "03005000000",
      supportEmail: s["support_email"] ?? "",
      supportHours: s["support_hours"] ?? "Mon–Sat, 8AM–10PM",
      businessAddress: s["business_address"] ?? "Muzaffarabad, AJK, Pakistan",
      socialFacebook: s["social_facebook"] ?? "",
      socialInstagram: s["social_instagram"] ?? "",
      currencySymbol: s["currency_symbol"] ?? s["regional_currency_symbol"] ?? "Rs.",
      currencyCode: s["currency_code"] ?? "PKR",
    },
    orderRules: {
      minOrderAmount: parseFloat(s["min_order_amount"] ?? "100"),
      maxCodAmount: parseFloat(s["cod_max_amount"] ?? "5000"),
      maxCartValue: parseFloat(s["order_max_cart_value"] ?? "50000"),
      cancelWindowMin: parseInt(s["order_cancel_window_min"] ?? "5"),
      autoCancelMin: parseInt(s["order_auto_cancel_min"] ?? "15"),
      refundDays: parseInt(s["order_refund_days"] ?? "3"),
      preptimeMin: parseInt(s["order_preptime_min"] ?? "15"),
      ratingWindowHours: parseInt(s["order_rating_window_hours"] ?? "48"),
      scheduleEnabled: (s["order_schedule_enabled"] ?? "off") === "on",
      maxItemQuantity: parseInt(s["order_max_item_quantity"] ?? "99"),
    },
    deliveryAccessMode: s["delivery_access_mode"] ?? "all",
    features: {
      mart: (s["feature_mart"] ?? "on") === "on",
      food: (s["feature_food"] ?? "on") === "on",
      rides: (s["feature_rides"] ?? "on") === "on",
      pharmacy: (s["feature_pharmacy"] ?? "on") === "on",
      parcel: (s["feature_parcel"] ?? "on") === "on",
      van: (s["feature_van"] ?? "on") === "on",
      wallet: walletEnabled,
      referral: (s["feature_referral"] ?? "on") === "on",
      newUsers: (s["feature_new_users"] ?? "on") === "on",
      chat: (s["feature_chat"] ?? "off") === "on",
      liveTracking: (s["feature_live_tracking"] ?? "on") === "on",
      reviews: (s["feature_reviews"] ?? "on") === "on",
      sos: (s["feature_sos"] ?? "on") === "on",
      weather: (s["feature_weather"] ?? "on") === "on",
    },
    content: {
      trackerBannerEnabled: (s["content_tracker_banner_enabled"] ?? "on") === "on",
      trackerBannerPosition: (s["content_tracker_banner_position"] === "bottom"
        ? "bottom"
        : "top") as "top" | "bottom",
      showBanner: (s["content_show_banner"] ?? "on") === "on",
      banner: s["content_banner"] ?? "Free delivery on your first order! 🎉",
      announcement: s["content_announcement"] ?? "",
      maintenanceMsg:
        s["content_maintenance_msg"] ?? "We're performing scheduled maintenance. Back soon!",
      supportMsg: s["content_support_msg"] ?? "Need help? Chat with us!",
      vendorNotice: s["content_vendor_notice"] ?? "",
      riderNotice: s["content_rider_notice"] ?? "",
      tncUrl: s["content_tnc_url"] ?? "",
      privacyUrl: s["content_privacy_url"] ?? "",
      refundPolicyUrl: s["content_refund_policy_url"] ?? "",
      faqUrl: s["content_faq_url"] ?? "",
      aboutUrl: s["content_about_url"] ?? "",
    },
    finance: {
      gstEnabled: (s["finance_gst_enabled"] ?? "on") === "on",
      gstPct: parseFloat(s["finance_gst_pct"] ?? "17"),
      cashbackEnabled: (s["finance_cashback_enabled"] ?? "off") === "on",
      cashbackPct: parseFloat(s["finance_cashback_pct"] ?? "2"),
      cashbackMaxRs: parseFloat(s["finance_cashback_max_rs"] ?? "100"),
      invoiceEnabled: (s["finance_invoice_enabled"] ?? "off") === "on",
      platformCommissionPct: parseFloat(s["platform_commission_pct"] ?? "10"),
      vendorCommissionPct: parseFloat(s["vendor_commission_pct"] ?? "15"),
      riderEarningPct: Number(s["rider_keep_pct"]) || 80,
      minVendorPayout: parseFloat(s["vendor_min_payout"] ?? "500"),
      minRiderPayout: parseFloat(s["rider_min_payout"] ?? "500"),
      vendorSettleDays: parseInt(s["vendor_settlement_days"] ?? "7"),
      referralBonus: parseFloat(s["customer_referral_bonus"] ?? "100"),
    },
    customer: {
      walletMax: parseFloat(s["wallet_max_balance"] ?? "50000"),
      minTopup: parseFloat(s["wallet_min_topup"] ?? "100"),
      maxTopup: parseFloat(s["wallet_max_topup"] ?? "25000"),
      minWithdrawal: parseFloat(s["wallet_min_withdrawal"] ?? "200"),
      maxWithdrawal: parseFloat(s["wallet_max_withdrawal"] ?? "10000"),
      minTransfer: parseFloat(s["wallet_min_withdrawal"] ?? "200"),
      maxTransfer: parseFloat(s["wallet_max_withdrawal"] ?? "10000"),
      dailyLimit: parseFloat(s["wallet_daily_limit"] ?? "20000"),
      p2pDailyLimit: parseFloat(s["wallet_p2p_daily_limit"] ?? "10000"),
      withdrawalProcessingHours: parseInt(s["wallet_withdrawal_processing"] ?? "24"),
      withdrawalProcessingDays: Math.ceil(parseInt(s["wallet_withdrawal_processing"] ?? "24") / 24),
      kycRequired: (s["wallet_kyc_required"] ?? "off") === "on",
      topupMethods: s["wallet_topup_methods"] ?? "jazzcash,easypaisa,bank",
      referralEnabled: (s["customer_referral_enabled"] ?? "on") === "on",
      referralBonus: parseFloat(s["customer_referral_bonus"] ?? "100"),
      loyaltyEnabled: (s["customer_loyalty_enabled"] ?? "on") === "on",
      loyaltyPtsPerRs100: parseFloat(s["customer_loyalty_pts"] ?? "5"),
      maxOrdersDay: parseInt(s["customer_max_orders_day"] ?? "10"),
      signupBonus: parseFloat(s["customer_signup_bonus"] ?? "0"),
      p2pEnabled: (s["wallet_p2p_enabled"] ?? "on") === "on",
      p2pFeePct: parseFloat(s["wallet_p2p_fee_pct"] ?? "0"),
      depositAutoApprove: parseFloat(s["wallet_deposit_auto_approve"] ?? "0"),
      mpinEnabled: (s["wallet_mpin_enabled"] ?? "on") === "on",
    },
    rider: {
      keepPct: Number(s["rider_keep_pct"]) || 80,
      bonusPerTrip: parseFloat(s["rider_bonus_per_trip"] ?? "0"),
      minPayout: parseFloat(s["rider_min_payout"] ?? "500"),
      maxPayout: parseFloat(s["rider_max_payout"] ?? "50000"),
      maxDeliveries: parseInt(s["rider_max_deliveries"] ?? "3"),
      cashAllowed: (s["rider_cash_allowed"] ?? "on") === "on",
      withdrawalEnabled: (s["rider_withdrawal_enabled"] ?? "on") === "on",
      autoApprove: (s["rider_auto_approve"] ?? "off") === "on",
      minBalance: parseFloat(s["rider_min_balance"] ?? "500"),
      depositEnabled: (s["rider_deposit_enabled"] ?? "on") === "on",
      dailyGoal: parseFloat(s["rider_daily_goal"] ?? "5000"),
      modules: {
        wallet: (s["rider_module_wallet"] ?? "on") === "on",
        earnings: (s["rider_module_earnings"] ?? "on") === "on",
        history: (s["rider_module_history"] ?? "on") === "on",
        twoFaRequired: (s["rider_module_2fa_required"] ?? "off") === "on",
        gpsTracking: (s["rider_module_gps_tracking"] ?? "on") === "on",
        profileEdit: (s["rider_module_profile_edit"] ?? "on") === "on",
        supportChat: (s["rider_module_support_chat"] ?? "on") === "on",
      },
    },
    vendor: {
      commissionPct: parseFloat(s["vendor_commission_pct"] ?? "15"),
      settleDays: parseInt(s["vendor_settlement_days"] ?? "7"),
      minPayout: parseFloat(s["vendor_min_payout"] ?? "500"),
      maxPayout: parseFloat(s["vendor_max_payout"] ?? "50000"),
      minOrder: parseFloat(s["vendor_min_order"] ?? "100"),
      maxItems: parseInt(s["vendor_max_items"] ?? "100"),
      autoApprove: (s["vendor_auto_approve"] ?? "off") === "on",
      promoEnabled: (s["vendor_promo_enabled"] ?? "on") === "on",
      withdrawalEnabled: (s["vendor_withdrawal_enabled"] ?? "on") === "on",
      lowStockThreshold: parseInt(s["low_stock_threshold"] ?? "10"),
      requireDocuments: (s["vendor_require_documents"] ?? "off") === "on",
    },
    security: {
      gpsTracking: (s["security_gps_tracking"] ?? "on") === "on",
      gpsInterval: parseInt(s["security_gps_interval"] ?? "10"),
      gpsAccuracy: parseInt(s["security_gps_accuracy"] ?? "50"),
      geoFence: (s["security_geo_fence"] ?? "off") === "on",
      spoofDetection: (s["security_spoof_detection"] ?? "on") === "on",
      maxSpeedKmh: parseInt(s["security_max_speed_kmh"] ?? "150"),
      sessionDays: parseInt(s["security_session_days"] ?? "30"),
      riderTokenDays: parseInt(s["security_rider_token_days"] ?? "30"),
      rateLimit: parseInt(s["security_rate_limit"] ?? "100"),
      smsGateway: s["sms_provider"] ?? "console",
      mapKeySet: (s["maps_api_key"] ?? "") !== "",
      firebaseSet: (s["fcm_server_key"] ?? "") !== "",
      orderGpsCaptureEnabled: (s["order_gps_capture_enabled"] ?? "off") === "on",
      gpsMismatchThresholdM: parseInt(s["gps_mismatch_threshold_m"] ?? "500"),
    },
    profile: {
      showSavedAddresses: (s["profile_show_saved_addresses"] ?? "on") === "on",
    },
    wallet: {
      withdrawalProcessingDays: s["wallet_withdrawal_processing"]
        ? Math.ceil(parseInt(s["wallet_withdrawal_processing"]) / 24)
        : null,
      kycRequired: (s["wallet_kyc_required"] ?? "off") === "on",
    },
    integrations: {
      jazzcash: { enabled: jazzcashEnabled },
      easypaisa: { enabled: easypaisaEnabled },
      pushNotif: (s["integration_push_notif"] ?? "off") === "on",
      analytics: (s["integration_analytics"] ?? "off") === "on",
      email: (s["integration_email"] ?? "off") === "on",
      sentry: (s["integration_sentry"] ?? "off") === "on",
      whatsapp: (s["integration_whatsapp"] ?? "off") === "on",
      sms: (s["integration_sms"] ?? "off") === "on",
      maps: (s["integration_maps"] ?? "off") === "on",
      analyticsPlatform: s["analytics_platform"] ?? "ga4",
      analyticsTrackingId: s["analytics_tracking_id"] ?? "",
      analyticsDebug: (s["analytics_debug_mode"] ?? "off") === "on",
      sentryDsn: s["sentry_dsn"] ?? "",
      sentryEnvironment: s["sentry_environment"] ?? "production",
      sentrySampleRate: parseFloat(s["sentry_sample_rate"] ?? "100") / 100,
      sentryTracesSampleRate: parseFloat(s["sentry_traces_sample_rate"] ?? "10") / 100,
      mapsAutocomplete: (s["maps_places_autocomplete"] ?? "on") === "on",
      mapsGeocoding: (s["maps_geocoding"] ?? "on") === "on",
      mapsDistanceMatrix: (s["maps_distance_matrix"] ?? "on") === "on",
    },
    auth: (() => {
      function parseAuthToggle(
        val: string | undefined,
        fallback: string
      ): Record<string, boolean> | boolean {
        // Setting missing from DB → return the default (so a fresh install
        // doesn't lock everyone out with "No login methods available").
        if (val === undefined || val == null || val === "") {
          const on = fallback === "on";
          return { customer: on, rider: on, vendor: on };
        }
        // Plain "on"/"off" string — not a JSON object, treat uniformly
        if (val === "on" || val === "off") {
          const on = val === "on";
          return { customer: on, rider: on, vendor: on };
        }
        try {
          const parsed = JSON.parse(val) as Record<string, string>;
          return {
            customer: parsed.customer === "on",
            rider: parsed.rider === "on",
            vendor: parsed.vendor === "on",
          };
        } catch (err) {
          logger.debug(
            { error: err instanceof Error ? err.message : String(err) },
            "[platform-config] parseAuthToggle fallback"
          );
          return val === "on";
        }
      }
      return {
        phoneOtpEnabled: parseAuthToggle(s["auth_phone_otp_enabled"], "on"),
        emailOtpEnabled: parseAuthToggle(s["auth_email_otp_enabled"], "on"),
        usernamePasswordEnabled: parseAuthToggle(s["auth_username_password_enabled"], "on"),
        googleEnabled: parseAuthToggle(s["auth_google_enabled"], "off"),
        facebookEnabled: parseAuthToggle(s["auth_facebook_enabled"], "off"),
        emailRegisterEnabled: parseAuthToggle(s["auth_email_register_enabled"], "on"),
        biometricEnabled: parseAuthToggle(s["auth_biometric_enabled"], "off"),
        captchaEnabled: (s["auth_captcha_enabled"] ?? "off") === "on",
        twoFactorEnabled: parseAuthToggle(s["auth_2fa_enabled"], "off"),
        magicLinkEnabled: parseAuthToggle(s["auth_magic_link_enabled"], "off"),
        captchaSiteKey: s["recaptcha_site_key"] ?? "",
        lockoutEnabled: (s["security_lockout_enabled"] ?? "on") === "on",
        lockoutMaxAttempts: parseInt(s["security_login_max_attempts"] ?? "5", 10),
        lockoutDurationSec: parseInt(s["security_lockout_minutes"] ?? "30", 10) * 60,
        googleClientId: s["google_client_id"] ?? "",
        facebookAppId: s["facebook_app_id"] ?? "",
        authMode: (s["auth_mode"] as "OTP" | "EMAIL" | "FIREBASE" | "HYBRID") ?? "OTP",
        firebaseEnabled: (s["firebase_enabled"] ?? "off") === "on",
      };
    })(),
    cities: (() => {
      const raw = s["service_cities"] ?? "";
      if (raw.trim()) {
        const parsed = raw
          .split(",")
          .map((c: string) => c.trim())
          .filter(Boolean);
        if (parsed.length > 0) return parsed;
      }
      return [
        "Muzaffarabad",
        "Mirpur",
        "Rawalakot",
        "Bagh",
        "Kotli",
        "Bhimber",
        "Poonch",
        "Neelum Valley",
        "Rawalpindi",
        "Islamabad",
        "Other",
      ];
    })(),
    van: {
      minAdvanceHours: parseInt(s["van_min_advance_hours"] ?? "2"),
      maxSeatsPerBooking: parseInt(s["van_max_seats_per_booking"] ?? "4"),
      cancellationWindowH: parseInt(s["van_cancellation_window_hours"] ?? "1"),
      refundType: s["van_refund_type"] ?? "full",
      refundPartialPct: parseInt(s["van_refund_partial_pct"] ?? "50"),
      seatHoldMinutes: parseInt(s["van_seat_hold_minutes"] ?? "10"),
      minPassengers: parseInt(s["van_min_passengers"] ?? "3"),
      minCheckHoursBefore: parseInt(s["van_min_check_hours_before"] ?? "4"),
      autoNotifyCancel: (s["van_auto_notify_cancel"] ?? "on") === "on",
      maxDriverTripsDay: parseInt(s["van_max_driver_trips_day"] ?? "5"),
      driverRestHours: parseInt(s["van_driver_rest_hours"] ?? "2"),
      requireStartTrip: (s["van_require_start_trip"] ?? "off") === "on",
      peakSurchargePct: parseFloat(s["van_peak_surcharge_pct"] ?? "0"),
      peakHours: s["van_peak_hours"] ?? "07:00-09:00,17:00-19:00",
      weekendSurchargePct: parseFloat(s["van_weekend_surcharge_pct"] ?? "0"),
      holidaySurchargePct: parseFloat(s["van_holiday_surcharge_pct"] ?? "0"),
      holidayDates: (() => {
        try {
          return JSON.parse(s["van_holiday_dates"] ?? "[]");
        } catch (err) {
          logger.debug(
            { error: err instanceof Error ? err.message : String(err) },
            "[fn] error with fallback return"
          );
          return [];
        }
      })(),
    },
    dispatch: {
      broadcastTimeoutSec: parseInt(s["dispatch_broadcast_timeout_sec"] ?? "90", 10),
      minRadiusKm: parseFloat(s["dispatch_min_radius_km"] ?? "5"),
      avgSpeedKmh: parseFloat(s["dispatch_avg_speed_kmh"] ?? "25"),
      maxFare: parseFloat(s["ride_max_fare"] ?? "100000"),
      counterOfferMaxMultiplier: parseFloat(s["ride_counter_offer_max_multiplier"] ?? "3"),
    },
    branding: {
      colorMart: s["brand_color_mart"] ?? "#00C48C",
      colorFood: s["brand_color_food"] ?? "#FF9500",
      colorRides: s["brand_color_rides"] ?? "#00C48C",
      colorPharmacy: s["brand_color_pharmacy"] ?? "#4A90D9",
      colorParcel: s["brand_color_parcel"] ?? "#8B5CF6",
      colorVan: s["brand_color_van"] ?? "#0066FF",
      mapCenterLat: parseFloat(s["brand_map_center_lat"] ?? "34.37"),
      mapCenterLng: parseFloat(s["brand_map_center_lng"] ?? "73.47"),
      mapCenterLabel: s["brand_map_center_label"] ?? "Muzaffarabad",
    },
    uploads: {
      maxImageMb: parseInt(s["upload_max_image_mb"] ?? "5"),
      maxVideoMb: parseInt(s["upload_max_video_mb"] ?? "50"),
      maxVideoDurationSec: parseInt(s["upload_max_video_duration_sec"] ?? "60"),
      allowedImageFormats: (s["upload_allowed_image_formats"] ?? "jpeg,png,webp")
        .split(",")
        .map((f: string) => f.trim())
        .filter(Boolean),
      allowedVideoFormats: (s["upload_allowed_video_formats"] ?? "mp4,quicktime,webm")
        .split(",")
        .map((f: string) => f.trim())
        .filter(Boolean),
    },
    pagination: {
      productsDefault: parseInt(s["pagination_products_default"] ?? "20"),
      productsMax: parseInt(s["pagination_products_max"] ?? "50"),
      trendingLimit: parseInt(s["pagination_trending_limit"] ?? "12"),
      flashDealsLimit: parseInt(s["pagination_flash_deals"] ?? "20"),
    },
    onboarding: (() => {
      try {
        const slides = JSON.parse(s["onboarding_slides"] ?? "[]");
        return { slides: Array.isArray(slides) ? slides : [] };
      } catch (err) {
        logger.error(
          {
            error: err instanceof Error ? err.message : String(err),
            timestamp: new Date().toISOString(),
          },
          "[route] unhandled error"
        );
        return { slides: [] };
      }
    })(),
    supportHoursSchedule: (() => {
      try {
        const raw = s["support_hours_schedule"] ?? "";
        if (raw) return JSON.parse(raw);
        return null;
      } catch (err) {
        logger.error(
          {
            error: err instanceof Error ? err.message : String(err),
            timestamp: new Date().toISOString(),
          },
          "[route] unhandled error"
        );
        return null;
      }
    })(),
    system: {
      logRetentionDays: parseInt(s["system_log_retention_days"] ?? "30", 10),
      cacheTtlSec: parseInt(s["system_cache_ttl_sec"] ?? "300", 10),
      jsonBodyLimit: s["system_json_body_limit"] ?? "256kb",
      uploadSizeLimit: s["system_upload_size_limit"] ?? "10mb",
      platformMode: (s["platform_mode"] === "live" ? "live" : "demo") as "demo" | "live",
    },
    network: {
      apiTimeoutMs: parseInt(s["api_timeout_ms"] ?? "30000", 10),
      maxRetryAttempts: parseInt(s["max_retry_attempts"] ?? "3", 10),
      retryBackoffBaseMs: parseInt(s["retry_backoff_base_ms"] ?? "1000", 10),
      riderGpsQueueMax: parseInt(s["rider_gps_queue_max"] ?? "500", 10),
      riderDismissedRequestTtlSec: parseInt(s["rider_dismissed_request_ttl_sec"] ?? "90", 10),
    },
    maintenance: (() => {
      const start = s["maintenance_scheduled_start"] ?? "";
      const end = s["maintenance_scheduled_end"] ?? "";
      const msg =
        s["maintenance_scheduled_msg"] ??
        "We're performing scheduled maintenance. We'll be back shortly!";
      if (!start || !end)
        return { active: false, scheduledStart: null, scheduledEnd: null, message: msg };
      const now = Date.now();
      const startMs = new Date(start).getTime();
      const endMs = new Date(end).getTime();
      return {
        active: now >= startMs && now <= endMs,
        upcoming: now < startMs,
        scheduledStart: start,
        scheduledEnd: end,
        message: msg,
      };
    })(),
    regional: {
      phoneFormat: normalizePhoneFormatPattern(s["regional_phone_format"]),
      phoneHint: s["regional_phone_hint"] ?? "03XXXXXXXXX",
      timezone: s["regional_timezone"] ?? "Asia/Karachi",
      currencySymbol: s["currency_symbol"] ?? s["regional_currency_symbol"] ?? "Rs.",
      countryCode: s["regional_country_code"] ?? "+92",
    },
    currencySymbol: s["currency_symbol"] ?? s["regional_currency_symbol"] ?? "Rs.",
    currencyCode: s["currency_code"] ?? "PKR",
    payment: {
      methods: paymentMethods,
      currency: s["currency_code"] ?? "PKR",
      timeoutMins: parseInt(s["payment_timeout_mins"] ?? "15"),
      minOnline: parseFloat(s["payment_min_online"] ?? "50"),
      maxOnline: parseFloat(s["payment_max_online"] ?? "100000"),
      autoCancelOn: (s["payment_auto_cancel"] ?? "on") === "on",
      walletCashbackPct: parseFloat(s["wallet_cashback_pct"] ?? "0"),
      walletCashbackOrders: (s["wallet_cashback_on_orders"] ?? "on") === "on",
      walletCashbackRides: (s["wallet_cashback_on_rides"] ?? "off") === "on",
      walletCashbackPharm: (s["wallet_cashback_on_pharmacy"] ?? "off") === "on",
      jazzcashProofRequired: (s["jazzcash_proof_required"] ?? "off") === "on",
      paymentReceiptRequired: (s["payment_receipt_required"] ?? "off") === "on",
    },
    compliance: {
      minAppVersion: s["min_app_version"] ?? "1.0.0",
      termsVersion: s["terms_version"] ?? "1.0",
      appStoreUrl: s["app_store_url"] ?? "",
      playStoreUrl: s["play_store_url"] ?? "",
    },
    releaseNotes: await (async () => {
      try {
        const rows = await db.execute(sql`
          SELECT id, version, release_date, notes, sort_order, created_at
          FROM release_notes
          ORDER BY sort_order DESC, created_at DESC
          LIMIT 20
        `);
        return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
          id: r.id,
          version: r.version,
          releaseDate: r.release_date,
          notes: (() => {
            try {
              return JSON.parse(r.notes as string);
            } catch (err) {
              logger.debug(
                { error: err instanceof Error ? err.message : String(err) },
                "[fn] error with fallback"
              );
              return [r.notes];
            }
          })(),
          sortOrder: r.sort_order,
        }));
      } catch (err) {
        logger.debug(
          { error: err instanceof Error ? err.message : String(err) },
          "[fn] error with fallback return"
        );
        return [];
      }
    })(),
    experiments: await (async () => {
      const userId = (req.query["userId"] as string) || "";
      if (!userId) return [];
      try {
        const activeExperiments = await db
          .select()
          .from(abExperimentsTable)
          .where(eq(abExperimentsTable.status, "active"));
        const assignments: { experimentId: string; experimentName: string; variant: string }[] = [];
        for (const exp of activeExperiments) {
          const variants = (exp.variants as { weight?: number; name?: string }[] | null) || [];
          if (variants.length < 2) continue;
          const trafficHash = crypto
            .createHash("md5")
            .update(`${userId}:${exp.id}:traffic`)
            .digest("hex");
          const trafficBucket = parseInt(trafficHash.slice(0, 8), 16) % 100;
          if (trafficBucket >= exp.trafficPct) continue;
          const variant = assignVariant(userId, exp.id, variants);
          const [existing] = await db
            .select()
            .from(abAssignmentsTable)
            .where(
              and(
                eq(abAssignmentsTable.experimentId, exp.id),
                eq(abAssignmentsTable.userId, userId)
              )
            )
            .limit(1);
          if (!existing) {
            const id = crypto.randomBytes(10).toString("hex");
            try {
              await db
                .insert(abAssignmentsTable)
                .values({ id, experimentId: exp.id, userId, variant });
            } catch (err) {
              logger.warn(
                {
                  experimentId: exp.id,
                  userId,
                  variant,
                  err: err instanceof Error ? err.message : String(err),
                },
                "[platform-config] A/B assignment insert failed — non-fatal (possible race condition)"
              );
            }
          }
          assignments.push({
            experimentId: exp.id,
            experimentName: exp.name,
            variant: existing?.variant ?? variant,
          });
        }
        return assignments;
      } catch (err) {
        logger.debug(
          { error: err instanceof Error ? err.message : String(err) },
          "[fn] error with fallback return"
        );
        return [];
      }
    })(),
    demoData,
  });
});

function assignVariant(
  userId: string,
  experimentId: string,
  variants: { weight?: number; name?: string }[]
): string {
  const hash = crypto.createHash("md5").update(`${userId}:${experimentId}`).digest("hex");
  const bucket = parseInt(hash.slice(0, 8), 16) % 100;
  let cumulative = 0;
  for (const v of variants) {
    cumulative += v.weight ?? Math.floor(100 / variants.length);
    if (bucket < cumulative) return v.name ?? "control";
  }
  return variants[variants.length - 1]?.name ?? "control";
}

router.get("/experiments", async (req, res) => {
  const userId = (req.query["userId"] as string) || "";
  if (!userId) {
    sendSuccess(res, { experiments: [] });
    return;
  }

  try {
    const activeExperiments = await db
      .select()
      .from(abExperimentsTable)
      .where(eq(abExperimentsTable.status, "active"));

    const assignments: { experimentId: string; experimentName: string; variant: string }[] = [];

    for (const exp of activeExperiments) {
      const variants = (exp.variants as { weight?: number; name?: string }[] | null) || [];
      if (variants.length < 2) continue;

      const trafficHash = crypto
        .createHash("md5")
        .update(`${userId}:${exp.id}:traffic`)
        .digest("hex");
      const trafficBucket = parseInt(trafficHash.slice(0, 8), 16) % 100;
      if (trafficBucket >= exp.trafficPct) continue;

      const variant = assignVariant(userId, exp.id, variants);

      const [existing] = await db
        .select()
        .from(abAssignmentsTable)
        .where(
          and(eq(abAssignmentsTable.experimentId, exp.id), eq(abAssignmentsTable.userId, userId))
        )
        .limit(1);

      if (!existing) {
        const id = crypto.randomBytes(10).toString("hex");
        try {
          await db.insert(abAssignmentsTable).values({
            id,
            experimentId: exp.id,
            userId,
            variant,
          });
        } catch (err) {
          logger.warn(
            {
              experimentId: exp.id,
              userId,
              variant,
              err: err instanceof Error ? err.message : String(err),
            },
            "[platform-config] A/B assignment insert (alt path) failed — non-fatal (possible race condition)"
          );
        }
      }

      assignments.push({
        experimentId: exp.id,
        experimentName: exp.name,
        variant: existing?.variant ?? variant,
      });
    }

    sendSuccess(res, { experiments: assignments });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendSuccess(res, { experiments: [] });
  }
});

router.post("/experiments/convert", async (req, res) => {
  const { experimentId, userId } = req.body as { experimentId?: string; userId?: string };
  if (!experimentId || !userId) {
    sendValidationError(res, "experimentId and userId are required");
    return;
  }

  try {
    const [assignment] = await db
      .select()
      .from(abAssignmentsTable)
      .where(
        and(
          eq(abAssignmentsTable.experimentId, experimentId),
          eq(abAssignmentsTable.userId, userId)
        )
      )
      .limit(1);

    if (!assignment) {
      sendNotFound(res, "No assignment found");
      return;
    }
    if (assignment.converted) {
      sendSuccess(res, { alreadyConverted: true });
      return;
    }

    await db
      .update(abAssignmentsTable)
      .set({ converted: true })
      .where(eq(abAssignmentsTable.id, assignment.id));

    sendSuccess(res, { converted: true, variant: assignment.variant });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendSuccess(res, { converted: false });
  }
});

const FALLBACK_FAQS = [
  {
    id: "1",
    category: "Orders",
    question: "How do I track my order?",
    answer:
      "Go to the Orders tab in the app. You can see real-time status updates for all your orders. For delivery orders, you can also track the rider's live location.",
    isActive: true,
    sortOrder: 0,
  },
  {
    id: "2",
    category: "Orders",
    question: "Can I cancel my order?",
    answer:
      "You can cancel your order within a few minutes of placing it. Go to Orders, select the order, and tap Cancel. After that window, please contact our support team.",
    isActive: true,
    sortOrder: 1,
  },
  {
    id: "3",
    category: "Payment",
    question: "What payment methods are accepted?",
    answer:
      "We accept Cash on Delivery (COD), AJKMart Wallet, JazzCash, and EasyPaisa. Wallet payments get instant confirmation.",
    isActive: true,
    sortOrder: 0,
  },
  {
    id: "4",
    category: "Payment",
    question: "How do I add money to my wallet?",
    answer:
      "Go to the Wallet tab, tap Top Up, and choose your preferred payment method (JazzCash, EasyPaisa, or bank transfer). Top-ups are usually processed within minutes.",
    isActive: true,
    sortOrder: 1,
  },
  {
    id: "5",
    category: "Delivery",
    question: "What are the delivery charges?",
    answer:
      "Delivery charges vary by service type and your location. Free delivery is available on orders above the minimum threshold. Check the cart screen for exact delivery fees.",
    isActive: true,
    sortOrder: 0,
  },
  {
    id: "6",
    category: "Delivery",
    question: "How long does delivery take?",
    answer:
      "Food orders are typically delivered in 25–45 minutes. Grocery/Mart orders take 30–60 minutes. Pharmacy orders are delivered in 20–40 minutes. Actual times may vary.",
    isActive: true,
    sortOrder: 1,
  },
  {
    id: "7",
    category: "Account",
    question: "How do I reset my password?",
    answer:
      "On the login screen, tap 'Forgot Password'. Enter your registered phone number or email, and you'll receive an OTP to reset your password.",
    isActive: true,
    sortOrder: 0,
  },
  {
    id: "8",
    category: "Account",
    question: "How do I update my profile information?",
    answer:
      "Go to the Profile tab, then tap the pencil/edit icon at the top. You can update your name, email, address, and other personal details.",
    isActive: true,
    sortOrder: 1,
  },
  {
    id: "9",
    category: "Offers",
    question: "How do I use a promo code?",
    answer:
      "During checkout, you'll find a promo code field. Enter your code and tap Apply. The discount will be automatically applied to your order total.",
    isActive: true,
    sortOrder: 0,
  },
  {
    id: "10",
    category: "Offers",
    question: "Why is my promo code not working?",
    answer:
      "Promo codes may have expired, reached their usage limit, or have minimum order requirements. Check the offer details in the Offers section for full terms.",
    isActive: true,
    sortOrder: 1,
  },
  {
    id: "11",
    category: "Pharmacy",
    question: "Do I need a prescription for medicine orders?",
    answer:
      "Some medicines require a prescription. You can upload a photo of your prescription during checkout. Our pharmacist will verify it before processing your order.",
    isActive: true,
    sortOrder: 0,
  },
  {
    id: "12",
    category: "Rides",
    question: "How do I book a ride?",
    answer:
      "Tap the Rides service on the home screen. Enter your pickup and drop-off location, select your vehicle type, and confirm the fare estimate.",
    isActive: true,
    sortOrder: 0,
  },
];

router.get("/faqs", async (_req, res) => {
  try {
    const dbFaqs = await db
      .select()
      .from(faqsTable)
      .where(eq(faqsTable.isActive, true))
      .orderBy(asc(faqsTable.sortOrder), asc(faqsTable.createdAt));

    const faqs =
      dbFaqs.length > 0
        ? dbFaqs.map((f) => ({
            id: f.id,
            category: f.category,
            question: f.question,
            answer: f.answer,
          }))
        : FALLBACK_FAQS.map((f) => ({
            id: f.id,
            category: f.category,
            question: f.question,
            answer: f.answer,
          }));

    sendSuccess(res, { faqs });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendSuccess(res, {
      faqs: FALLBACK_FAQS.map((f) => ({
        id: f.id,
        category: f.category,
        question: f.question,
        answer: f.answer,
      })),
    });
  }
});

/* ── POST /platform-config/consent-log — Log a consent event ── */
router.post("/consent-log", customerAuth, async (req, res) => {
  const userId = req.customerId!;
  const {
    consentType,
    consentVersion,
    source: bodySource,
  } = req.body as { consentType?: string; consentVersion?: string; source?: string };
  if (!consentType || !consentVersion) {
    sendValidationError(res, "consentType and consentVersion are required");
    return;
  }
  const ip = getClientIp(req);
  /* `user_agent` and `source` are persisted alongside ip+timestamp so the
     admin Consent Log page can show the full audit trail per row. We
     truncate UA to 1024 chars to keep one runaway header from blowing
     up the row size. `source` defaults to "mobile" since the customer
     auth context only fires from the consumer app today. */
  const userAgent = (req.headers["user-agent"] ?? "").toString().slice(0, 1024) || null;
  const source = (bodySource ?? "mobile").slice(0, 32);
  try {
    await db.execute(sql`
      INSERT INTO consent_log (id, user_id, consent_type, consent_version, ip_address, user_agent, source, created_at)
      VALUES (${generateId()}, ${userId}, ${consentType}, ${consentVersion}, ${ip}, ${userAgent}, ${source}, NOW())
    `);
    sendSuccess(res, { logged: true });
  } catch (_e) {
    sendError(res, "Failed to log consent");
  }
});

/* ── GET /platform-config/compliance-status — Get user's accepted terms version ── */
router.get("/compliance-status", customerAuth, async (req, res) => {
  const userId = req.customerId!;
  try {
    const rows = await db.execute(
      sql`SELECT accepted_terms_version FROM users WHERE id = ${userId}`
    );
    const user =
      (rows.rows as Array<Record<string, unknown>>)?.[0] ??
      (Array.isArray(rows) ? (rows as Array<Record<string, unknown>>)[0] : null);
    sendSuccess(res, { acceptedTermsVersion: user?.accepted_terms_version ?? null });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    sendSuccess(res, { acceptedTermsVersion: null });
  }
});

/* ── POST /platform-config/accept-terms — Update user's accepted terms version ── */
router.post("/accept-terms", customerAuth, async (req, res) => {
  const userId = req.customerId!;
  const { termsVersion } = req.body as { termsVersion?: string };
  if (!termsVersion) {
    sendValidationError(res, "termsVersion is required");
    return;
  }
  const ip = getClientIp(req);
  const userAgent = (req.headers["user-agent"] ?? "").toString().slice(0, 1024) || null;
  try {
    await db.execute(sql`
      UPDATE users SET accepted_terms_version = ${termsVersion} WHERE id = ${userId}
    `);
    /* Use the canonical 'terms' policy slug (matching the new
       /legal/terms-versions contract) instead of the legacy
       'terms_acceptance' string. The /legal/consent-log GET handler
       maps ?policy=terms to match both values for backwards-compatible
       reads of pre-existing rows. */
    await db.execute(sql`
      INSERT INTO consent_log (id, user_id, consent_type, consent_version, ip_address, user_agent, source, created_at)
      VALUES (${generateId()}, ${userId}, 'terms', ${termsVersion}, ${ip}, ${userAgent}, 'mobile', NOW())
    `);
    sendSuccess(res, { accepted: true });
  } catch (_e) {
    sendError(res, "Failed to record terms acceptance");
  }
});

export default router;
