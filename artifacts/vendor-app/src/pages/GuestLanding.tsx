import { createLogger } from "@/lib/logger";
import type { Language } from "@workspace/i18n";
import { isRTL } from "@workspace/i18n";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
const log = createLogger("[guest]");

const LS_KEY = "ajkmart_vendor_lang";
const LANG_CYCLE: Language[] = ["en", "ur", "roman"];
const LANG_LABELS: Record<string, string> = { en: "EN", ur: "اردو", roman: "RM" };

function readLang(): Language {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === "en" || v === "ur" || v === "roman") return v;
  } catch (e) {
    log.debug("[guest] localStorage unavailable:", e);
  }
  return "en";
}
function saveLang(lang: Language) {
  try {
    localStorage.setItem(LS_KEY, lang);
    document.documentElement.setAttribute("dir", isRTL(lang) ? "rtl" : "ltr");
  } catch (e) {
    log.debug("[guest] localStorage unavailable:", e);
  }
}
function cycleLang(current: Language): Language {
  const idx = LANG_CYCLE.indexOf(current);
  return LANG_CYCLE[(idx + 1) % LANG_CYCLE.length];
}

const TRUST = {
  en: [
    { v: "4,200+", l: "Active vendors" },
    { v: "18", l: "Cities" },
    { v: "2.1M+", l: "Orders processed" },
  ],
  ur: [
    { v: "4,200+", l: "فعال وینڈرز" },
    { v: "18", l: "شہر" },
    { v: "2.1M+", l: "آرڈر مکمل" },
  ],
  roman: [
    { v: "4,200+", l: "Active vendors" },
    { v: "18", l: "Shehar" },
    { v: "2.1M+", l: "Orders mukammal" },
  ],
};

const FEATURES = {
  en: [
    {
      icon: "📋",
      title: "Order Dashboard",
      desc: "Accept, manage, and track every order in real time — with push alerts for new arrivals.",
    },
    {
      icon: "📊",
      title: "Sales Analytics",
      desc: "Revenue charts, top-selling products, and daily summaries help you make smarter decisions.",
    },
    {
      icon: "📦",
      title: "Product Management",
      desc: "Upload items, set prices, manage stock levels, and run promotions — all from one screen.",
    },
    {
      icon: "💰",
      title: "Instant Payouts",
      desc: "Earnings land in your digital wallet automatically. Withdraw anytime to EasyPaisa or JazzCash.",
    },
    {
      icon: "💬",
      title: "Customer Chat",
      desc: "Respond to customers in real time, resolve issues fast, and build lasting loyalty.",
    },
    {
      icon: "🎯",
      title: "Campaigns & Promos",
      desc: "Join platform-wide campaigns or create your own discount codes to drive more sales.",
    },
  ],
  ur: [
    {
      icon: "📋",
      title: "آرڈر ڈیش بورڈ",
      desc: "ہر آرڈر کو حقیقی وقت میں قبول کریں اور ٹریک کریں — نئے آرڈرز کے فوری الرٹ کے ساتھ۔",
    },
    {
      icon: "📊",
      title: "سیلز اینالیٹکس",
      desc: "آمدنی چارٹس، بہترین فروخت مصنوعات اور یومیہ خلاصہ بہتر فیصلے کرنے میں مدد دیتے ہیں۔",
    },
    {
      icon: "📦",
      title: "پروڈکٹ مینجمنٹ",
      desc: "اشیاء اپلوڈ کریں، قیمتیں اور اسٹاک سیٹ کریں۔ منٹوں میں لائیو ہوں۔",
    },
    {
      icon: "💰",
      title: "فوری ادائیگی",
      desc: "آمدنی آپ کے ڈیجیٹل والیٹ میں خودبخود آتی ہے۔ کسی بھی وقت نکالیں۔",
    },
    {
      icon: "💬",
      title: "گاہک چیٹ",
      desc: "گاہکوں سے حقیقی وقت میں بات کریں اور مسائل فوری حل کریں۔",
    },
    {
      icon: "🎯",
      title: "کمپین اور پروموز",
      desc: "پلیٹ فارم کمپین میں شامل ہوں یا اپنے ڈسکاؤنٹ کوڈ بنائیں۔",
    },
  ],
  roman: [
    {
      icon: "📋",
      title: "Order Dashboard",
      desc: "Har order ko haqiqi waqt mein qabool karein — nayi orders ke fori alerts ke sath.",
    },
    {
      icon: "📊",
      title: "Sales Analytics",
      desc: "Amdani charts, behtareen farokht products aur yaumia khulasa — behtar faisale karein.",
    },
    {
      icon: "📦",
      title: "Product Management",
      desc: "Ashiya upload karein, qeematein set karein, stock manage karein — ek hi screen se.",
    },
    {
      icon: "💰",
      title: "Fori Payment",
      desc: "Amdani wallet mein khud-ba-khud aati hai. Kabhi bhi EasyPaisa ya JazzCash se nikaalein.",
    },
    {
      icon: "💬",
      title: "Customer Chat",
      desc: "Grahkon se haqiqi waqt mein baat karein aur masail fori hal karein.",
    },
    {
      icon: "🎯",
      title: "Campaigns & Promos",
      desc: "Platform campaign mein shamil hon ya apne discount codes banaein.",
    },
  ],
};

const STEPS = {
  en: [
    {
      n: "01",
      title: "Register Your Store",
      desc: "Sign up with your phone or email and provide your store name and category.",
    },
    {
      n: "02",
      title: "Add Your Products",
      desc: "Upload product photos, set prices and stock levels. Go live in minutes.",
    },
    {
      n: "03",
      title: "Receive & Get Paid",
      desc: "Accept orders from the dashboard, track delivery, and get paid to your wallet.",
    },
  ],
  ur: [
    {
      n: "01",
      title: "اپنی دکان رجسٹر کریں",
      desc: "فون یا ای میل سے سائن اپ کریں اور دکان کا نام اور کیٹگری دیں۔",
    },
    {
      n: "02",
      title: "مصنوعات شامل کریں",
      desc: "پروڈکٹ تصاویر اپلوڈ کریں، قیمتیں اور اسٹاک سیٹ کریں۔ منٹوں میں لائیو ہوں۔",
    },
    {
      n: "03",
      title: "آرڈر وصول کریں",
      desc: "ڈیش بورڈ سے آرڈر قبول کریں، ڈیلیوری ٹریک کریں اور والیٹ میں ادائیگی پائیں۔",
    },
  ],
  roman: [
    {
      n: "01",
      title: "Store Register Karein",
      desc: "Phone ya email se sign up karein aur apni dukaan ka naam aur category dein.",
    },
    {
      n: "02",
      title: "Products Add Karein",
      desc: "Product tasveerein upload karein, qeematein set karein — minutes mein live hon.",
    },
    {
      n: "03",
      title: "Orders Lo, Payment Pao",
      desc: "Dashboard se order qabool karein, delivery track karein, wallet mein payment payein.",
    },
  ],
};

const BENEFITS = {
  en: [
    "Instant order notifications",
    "Real-time inventory control",
    "Weekly payout to wallet",
    "Dedicated vendor support",
    "Sales reports & analytics",
    "Promotional tools",
    "Multi-language dashboard",
    "24/7 platform uptime",
  ],
  ur: [
    "فوری آرڈر اطلاعات",
    "حقیقی وقت انوینٹری",
    "ہفتہ وار والیٹ ادائیگی",
    "وقف وینڈر سپورٹ",
    "سیلز رپورٹس",
    "پروموشنل ٹولز",
    "کثیر لسانی ڈیش بورڈ",
    "چوبیس گھنٹے سروس",
  ],
  roman: [
    "Fori order alerts",
    "Real-time inventory",
    "Weekly wallet payment",
    "Vendor support",
    "Sales reports",
    "Promotional tools",
    "Multi-language",
    "24/7 service",
  ],
};

const CONTENT = {
  en: {
    appName: "AJKMart Vendor",
    tagline: "Sell Smart. Grow Fast.",
    heroTitle: "Your Shop,\nDigitally\nSupercharged.",
    heroSub:
      "List products, manage orders, run promotions, and grow your business — all from one powerful vendor dashboard.",
    ctaLogin: "Login",
    ctaRegister: "Open Your Shop",
    trustTitle: "Trusted by thousands of vendors",
    featuresTitle: "Everything your business needs",
    stepsTitle: "Start selling in 3 easy steps",
    benefitsTitle: "Why vendors choose AJKMart",
    footerCta: "Ready to grow your business?",
    footerBtn: "Open Your Store Today",
    footer: "© 2026 AJKMart · Vendor Platform",
  },
  ur: {
    appName: "اے جے کے مارٹ وینڈر",
    tagline: "سمارٹ بیچیں۔ تیزی سے بڑھیں۔",
    heroTitle: "آپ کی دکان،\nڈیجیٹل طاقت\nکے ساتھ۔",
    heroSub:
      "مصنوعات فہرست کریں، آرڈر منیج کریں، پروموشن چلائیں اور ایک طاقتور ڈیش بورڈ سے اپنا کاروبار بڑھائیں۔",
    ctaLogin: "لاگ ان",
    ctaRegister: "دکان کھولیں",
    trustTitle: "ہزاروں وینڈرز کا اعتماد",
    featuresTitle: "آپ کے کاروبار کے لیے سب کچھ",
    stepsTitle: "۳ آسان مراحل میں فروخت شروع کریں",
    benefitsTitle: "وینڈرز اے جے کے مارٹ کو کیوں پسند کرتے ہیں",
    footerCta: "اپنا کاروبار بڑھانے کے لیے تیار ہیں؟",
    footerBtn: "آج اپنی دکان کھولیں",
    footer: "© 2026 اے جے کے مارٹ · وینڈر پلیٹ فارم",
  },
  roman: {
    appName: "AJKMart Vendor",
    tagline: "Smart Bechayn. Tezi Se Barhayn.",
    heroTitle: "Aapki Dukaan,\nDigital Taaqat\nKe Sath.",
    heroSub:
      "Products list karein, orders manage karein, promotions chalayein — ek powerful dashboard se karobar barhaayein.",
    ctaLogin: "Login Karein",
    ctaRegister: "Dukaan Kholyein",
    trustTitle: "Hazaron vendors ka aitmaad",
    featuresTitle: "Aapke karobar ke liye sab kuch",
    stepsTitle: "3 aasaan steps mein bechna shuru karein",
    benefitsTitle: "Vendors AJKMart ko kyun chunte hain",
    footerCta: "Apna karobar barhaane ke liye tayyar hain?",
    footerBtn: "Aaj Apni Dukaan Kholyein",
    footer: "© 2026 AJKMart · Vendor Platform",
  },
};

/* ── Brand tokens ── */
const BLUE = "#1A56DB";
const BLUE_DARK = "#1348B5";
const BLUE_LIGHT = "#60A5FA";
const AMBER = "#F59E0B";
const AMBER_DARK = "#D97706";
const DARK_BG = "#060A14";
const DARK_SURF = "#0D1117";
const _DARK_CARD = "#111827";
const DARK_CARD2 = "#141E2E";

export function GuestLanding() {
  const [, navigate] = useLocation();
  const [language, setLangState] = useState<Language>(readLang);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    saveLang(language);
  }, [language]);
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const C = CONTENT[language as keyof typeof CONTENT] ?? CONTENT.en;
  const trust = TRUST[language as keyof typeof TRUST] ?? TRUST.en;
  const features = FEATURES[language as keyof typeof FEATURES] ?? FEATURES.en;
  const steps = STEPS[language as keyof typeof STEPS] ?? STEPS.en;
  const benefits = BENEFITS[language as keyof typeof BENEFITS] ?? BENEFITS.en;
  const rtl = isRTL(language);

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{ background: DARK_BG, color: "#E2E8F4" }}
      dir={rtl ? "rtl" : "ltr"}
    >
      {/* ════════════ STICKY HEADER ════════════ */}
      <header
        className="sticky top-0 z-50 transition-all duration-300"
        style={{
          background: scrolled ? "rgba(6,10,20,0.96)" : "transparent",
          backdropFilter: scrolled ? "blur(16px)" : "none",
          borderBottom: scrolled ? "1px solid rgba(255,255,255,0.07)" : "none",
          boxShadow: scrolled ? "0 4px 24px rgba(0,0,0,0.40)" : "none",
          height: scrolled ? 56 : 68,
        }}
      >
        <div
          className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4"
          style={{ height: "100%" }}
        >
          {/* Logo */}
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="flex flex-shrink-0 items-center justify-center rounded-xl shadow-lg"
              style={{
                width: scrolled ? 34 : 42,
                height: scrolled ? 34 : 42,
                background: `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})`,
                transition: "all 0.2s ease",
                boxShadow: `0 0 16px rgba(26,86,219,0.35)`,
              }}
            >
              <svg
                width={scrolled ? 17 : 21}
                height={scrolled ? 17 : 21}
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <span className="truncate text-base leading-tight font-extrabold tracking-tight text-white">
              {C.appName}
            </span>
          </div>

          {/* Nav actions */}
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              onClick={() => setLangState(cycleLang(language))}
              className="flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-all"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "#9CA3AF",
              }}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              {LANG_LABELS[language] ?? "EN"}
            </button>
            <button
              onClick={() => navigate("/login")}
              className="h-9 rounded-xl px-4 text-xs font-bold transition-all"
              style={{
                border: `1px solid rgba(26,86,219,0.40)`,
                color: BLUE_LIGHT,
                background: "rgba(26,86,219,0.08)",
              }}
            >
              {C.ctaLogin}
            </button>
            <button
              onClick={() => navigate("/register")}
              className="h-9 rounded-xl px-4 text-xs font-extrabold text-white shadow-lg transition-all"
              style={{
                background: `linear-gradient(135deg, ${AMBER}, ${AMBER_DARK})`,
                border: "none",
                boxShadow: `0 2px 12px rgba(245,158,11,0.35)`,
              }}
            >
              {C.ctaRegister}
            </button>
          </div>
        </div>
      </header>

      {/* ════════════ HERO ════════════ */}
      <section
        className="relative overflow-hidden"
        style={{ minHeight: "88vh", display: "flex", alignItems: "center" }}
      >
        {/* Background layers */}
        <div className="pointer-events-none absolute inset-0">
          {/* Deep space gradient */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 80% 60% at 60% 40%, rgba(26,86,219,0.18) 0%, transparent 70%)`,
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 50% 50% at 20% 80%, rgba(245,158,11,0.08) 0%, transparent 60%)`,
            }}
          />
          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "linear-gradient(rgba(26,86,219,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(26,86,219,0.15) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />
          {/* Floating orbs */}
          <div
            className="absolute top-1/4 right-1/4 h-64 w-64 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(26,86,219,0.20) 0%, transparent 70%)",
              filter: "blur(40px)",
            }}
          />
          <div
            className="absolute bottom-1/3 left-1/3 h-48 w-48 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 70%)",
              filter: "blur(30px)",
            }}
          />
        </div>

        <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-14 px-6 py-20 md:flex-row md:py-28">
          {/* ── Left: text ── */}
          <div className="z-10 flex-1 text-center md:text-start">
            {/* Tagline badge */}
            <div
              className="mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold tracking-wide"
              style={{
                background: `rgba(245,158,11,0.12)`,
                border: `1px solid rgba(245,158,11,0.25)`,
                color: "#FCD34D",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="#F59E0B">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              {C.tagline}
            </div>

            {/* Hero headline */}
            <h1
              className="mb-5 text-4xl leading-[1.05] font-black tracking-tight whitespace-pre-line md:text-6xl"
              style={{
                background: "linear-gradient(135deg, #FFFFFF 30%, #93BBFE 70%, #60A5FA 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {C.heroTitle}
            </h1>

            {/* Subheadline */}
            <p
              className="mb-9 max-w-lg text-base leading-relaxed md:text-lg"
              style={{ color: "#9CA3AF" }}
            >
              {C.heroSub}
            </p>

            {/* CTA buttons */}
            <div className="flex flex-col justify-center gap-3 sm:flex-row md:justify-start">
              <button
                onClick={() => navigate("/register")}
                className="flex h-13 items-center justify-center gap-2.5 rounded-2xl px-8 text-sm font-extrabold shadow-xl transition-all"
                style={{
                  background: `linear-gradient(135deg, ${AMBER}, ${AMBER_DARK})`,
                  color: "#0A0F1A",
                  border: "none",
                  boxShadow: "0 4px 20px rgba(245,158,11,0.40)",
                  minHeight: "52px",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.transform = "translateY(-1px)")
                }
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.transform = "")}
              >
                {C.ctaRegister}
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
              <button
                onClick={() => navigate("/login")}
                className="flex h-13 items-center justify-center gap-2 rounded-2xl px-8 text-sm font-bold transition-all"
                style={{
                  background: "rgba(26,86,219,0.12)",
                  border: "1px solid rgba(26,86,219,0.35)",
                  color: "#93BBFE",
                  minHeight: "52px",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = "rgba(26,86,219,0.20)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = "rgba(26,86,219,0.12)")
                }
              >
                {C.ctaLogin}
              </button>
            </div>
          </div>

          {/* ── Right: Dashboard preview card ── */}
          <div className="z-10 w-72 flex-shrink-0 md:w-96">
            <div
              className="overflow-hidden rounded-3xl"
              style={{
                background: "rgba(20,30,50,0.70)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(26,86,219,0.25)",
                boxShadow: "0 24px 80px rgba(0,0,0,0.60), 0 0 0 1px rgba(255,255,255,0.04) inset",
              }}
            >
              {/* Window chrome */}
              <div
                className="flex items-center gap-2.5 border-b px-4 py-3"
                style={{ background: "rgba(26,86,219,0.12)", borderColor: "rgba(26,86,219,0.20)" }}
              >
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#EF4444" }} />
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#F59E0B" }} />
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#10B981" }} />
                <span className="ms-2 text-xs font-semibold" style={{ color: "#93BBFE" }}>
                  Vendor Dashboard
                </span>
                <div className="ms-auto flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full" style={{ background: "#10B981" }} />
                  <span className="text-[10px] font-bold" style={{ color: "#6EE7B7" }}>
                    Live
                  </span>
                </div>
              </div>

              <div className="space-y-2.5 p-4">
                {/* Revenue card */}
                <div
                  className="flex items-center gap-3 rounded-xl p-3.5"
                  style={{
                    background: "rgba(26,86,219,0.15)",
                    border: "1px solid rgba(26,86,219,0.20)",
                  }}
                >
                  <div
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "rgba(26,86,219,0.30)" }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={BLUE_LIGHT}
                      strokeWidth="2.5"
                    >
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 text-[11px] font-semibold" style={{ color: "#6B7280" }}>
                      Today's Revenue
                    </div>
                    <div className="text-xl font-black text-white">₨ 18,450</div>
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-extrabold"
                    style={{
                      background: "rgba(16,185,129,0.20)",
                      color: "#34D399",
                      border: "1px solid rgba(16,185,129,0.25)",
                    }}
                  >
                    +12%
                  </span>
                </div>

                {/* Order items */}
                {[
                  {
                    status: "New",
                    item: "Chicken Karahi ×2",
                    time: "2m ago",
                    dot: "#10B981",
                    dotBg: "rgba(16,185,129,0.15)",
                  },
                  {
                    status: "Preparing",
                    item: "Beef Pulao ×1",
                    time: "8m ago",
                    dot: "#F59E0B",
                    dotBg: "rgba(245,158,11,0.12)",
                  },
                  {
                    status: "Delivered",
                    item: "Pakora Tray ×3",
                    time: "22m ago",
                    dot: "#60A5FA",
                    dotBg: "rgba(26,86,219,0.12)",
                  },
                ].map((o, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 rounded-xl p-2.5"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <div
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: o.dot, boxShadow: `0 0 6px ${o.dot}` }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-white opacity-90">
                        {o.item}
                      </div>
                      <div className="text-[10px]" style={{ color: "#4B5563" }}>
                        {o.time}
                      </div>
                    </div>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ background: o.dotBg, color: o.dot, border: `1px solid ${o.dot}30` }}
                    >
                      {o.status}
                    </span>
                  </div>
                ))}

                {/* Mini stats */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {[
                    { v: "24", l: "Orders", c: BLUE_LIGHT },
                    { v: "₨2.1K", l: "Avg Order", c: "#FCD34D" },
                    { v: "4.8★", l: "Rating", c: "#34D399" },
                  ].map((s, i) => (
                    <div
                      key={i}
                      className="rounded-xl py-2 text-center"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div className="text-sm font-extrabold" style={{ color: s.c }}>
                        {s.v}
                      </div>
                      <div className="mt-0.5 text-[9px]" style={{ color: "#4B5563" }}>
                        {s.l}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════ TRUST STRIP ════════════ */}
      <section
        style={{
          background: DARK_SURF,
          borderTop: "1px solid rgba(255,255,255,0.05)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div className="mx-auto max-w-4xl px-6 py-8">
          <p
            className="mb-6 text-center text-[11px] font-bold tracking-widest uppercase"
            style={{ color: "#374151" }}
          >
            {C.trustTitle}
          </p>
          <div className="flex divide-x" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            {trust.map((s, i) => (
              <div key={i} className="flex-1 px-4 text-center">
                <div
                  className="mb-1 text-3xl font-black"
                  style={{
                    background: `linear-gradient(135deg, ${BLUE_LIGHT}, ${AMBER})`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  {s.v}
                </div>
                <div className="text-xs font-medium" style={{ color: "#6B7280" }}>
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════ FEATURE CARDS ════════════ */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-12 text-center">
          <h2 className="mb-3 text-3xl font-black tracking-tight text-white md:text-4xl">
            {C.featuresTitle}
          </h2>
          <div
            className="mx-auto h-1 w-16 rounded-full"
            style={{ background: `linear-gradient(90deg, ${BLUE}, ${AMBER})` }}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={i}
              className="group cursor-default rounded-2xl p-6 transition-all duration-200"
              style={{
                background: DARK_CARD2,
                border: "1px solid rgba(255,255,255,0.06)",
                boxShadow: "0 2px 16px rgba(0,0,0,0.30)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.border = `1px solid rgba(26,86,219,0.35)`;
                (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                (e.currentTarget as HTMLElement).style.boxShadow =
                  "0 8px 32px rgba(26,86,219,0.15)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.border = "1px solid rgba(255,255,255,0.06)";
                (e.currentTarget as HTMLElement).style.transform = "";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 16px rgba(0,0,0,0.30)";
              }}
            >
              <div
                className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-2xl"
                style={{
                  background: "rgba(26,86,219,0.15)",
                  border: "1px solid rgba(26,86,219,0.20)",
                }}
              >
                {f.icon}
              </div>
              <h3 className="mb-2 text-base font-extrabold text-white">{f.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "#6B7280" }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════ HOW IT WORKS ════════════ */}
      <section
        className="py-16"
        style={{
          background: DARK_SURF,
          borderTop: "1px solid rgba(255,255,255,0.05)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-3xl font-black tracking-tight text-white md:text-4xl">
              {C.stepsTitle}
            </h2>
            <div
              className="mx-auto h-1 w-16 rounded-full"
              style={{ background: `linear-gradient(90deg, ${AMBER}, ${BLUE})` }}
            />
          </div>
          <div className="relative grid grid-cols-1 gap-8 md:grid-cols-3">
            {steps.map((s, i) => (
              <div key={i} className="relative flex flex-col items-center text-center">
                {/* Step number circle */}
                <div
                  className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl text-lg font-black"
                  style={{
                    background: `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})`,
                    boxShadow: `0 8px 24px rgba(26,86,219,0.40)`,
                    color: "white",
                    letterSpacing: "-0.04em",
                  }}
                >
                  {s.n}
                  <div
                    className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-black"
                    style={{ background: AMBER, color: "#0A0F1A" }}
                  >
                    ✓
                  </div>
                </div>
                {/* Connector line */}
                {i < steps.length - 1 && (
                  <div
                    className="absolute end-0 top-8 hidden h-px w-1/3 md:block"
                    style={{
                      background: `linear-gradient(to right, rgba(26,86,219,0.40), transparent)`,
                    }}
                  />
                )}
                <h3 className="mb-2 text-base font-extrabold text-white">{s.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "#6B7280" }}>
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════ BENEFITS GRID ════════════ */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-12 text-center">
          <h2 className="mb-3 text-3xl font-black tracking-tight text-white md:text-4xl">
            {C.benefitsTitle}
          </h2>
          <div
            className="mx-auto h-1 w-16 rounded-full"
            style={{ background: `linear-gradient(90deg, ${BLUE}, ${AMBER})` }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {benefits.map((b, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-all"
              style={{ background: DARK_CARD2, border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
                style={{
                  background: `linear-gradient(135deg, rgba(26,86,219,0.30), rgba(26,86,219,0.15))`,
                  border: "1px solid rgba(26,86,219,0.30)",
                }}
              >
                <svg
                  width="13"
                  height="13"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke={BLUE_LIGHT}
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-xs leading-snug font-semibold" style={{ color: "#CBD5E1" }}>
                {b}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════ FOOTER CTA ════════════ */}
      <section
        className="relative overflow-hidden py-20"
        style={{ background: DARK_SURF, borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 70% 60% at 50% 50%, rgba(26,86,219,0.15) 0%, transparent 70%)`,
            }}
          />
          <div
            className="absolute top-0 left-0 h-px w-full"
            style={{
              background: `linear-gradient(90deg, transparent, rgba(26,86,219,0.40), transparent)`,
            }}
          />
        </div>
        <div className="relative mx-auto max-w-lg px-6 text-center">
          <div
            className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl shadow-2xl"
            style={{
              background: `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})`,
              boxShadow: "0 0 40px rgba(26,86,219,0.40)",
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <h2 className="mb-3 text-2xl font-black tracking-tight text-white md:text-4xl">
            {C.footerCta}
          </h2>
          <p className="mb-8 text-sm" style={{ color: "#6B7280" }}>
            Join 4,200+ vendors growing with AJKMart
          </p>
          <button
            onClick={() => navigate("/register")}
            className="inline-flex h-14 items-center gap-2.5 rounded-2xl px-10 text-base font-extrabold shadow-2xl transition-all"
            style={{
              background: `linear-gradient(135deg, ${AMBER}, ${AMBER_DARK})`,
              color: "#060A14",
              border: "none",
              boxShadow: "0 8px 32px rgba(245,158,11,0.45)",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.transform = "translateY(-2px)")
            }
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.transform = "")}
          >
            {C.footerBtn}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </section>

      {/* ════════════ FOOTER ════════════ */}
      <footer
        className="flex items-center justify-center gap-2 px-4 py-6 text-center text-xs"
        style={{
          background: "#030609",
          color: "#374151",
          borderTop: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        {C.footer}
      </footer>
    </div>
  );
}

export default GuestLanding;
