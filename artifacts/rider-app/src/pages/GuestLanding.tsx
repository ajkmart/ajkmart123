import type { Language } from "@workspace/i18n";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useLanguage } from "../lib/useLanguage";

const LANG_CYCLE: Language[] = ["en", "ur", "roman"];
const LANG_LABELS: Record<string, string> = { en: "EN", ur: "اردو", roman: "RM" };

function cycleLang(current: Language): Language {
  const idx = LANG_CYCLE.indexOf(current);
  return LANG_CYCLE[(idx + 1) % LANG_CYCLE.length];
}

const STATS = {
  en: [
    { v: "₨ 2,400", l: "Avg daily earnings" },
    { v: "12,000+", l: "Active riders" },
    { v: "18", l: "Cities covered" },
  ],
  ur: [
    { v: "₨ 2,400", l: "اوسط یومیہ کمائی" },
    { v: "12,000+", l: "فعال رائیڈرز" },
    { v: "18", l: "شہر" },
  ],
  roman: [
    { v: "₨ 2,400", l: "Roz ki avsatan kamaai" },
    { v: "12,000+", l: "Active riders" },
    { v: "18", l: "Shehar" },
  ],
};

const FEATURES = {
  en: [
    {
      icon: "⚡",
      color: "#f59e0b",
      title: "Instant Payouts",
      desc: "Earnings hit your wallet the moment a delivery is complete — no weekly waits.",
    },
    {
      icon: "🗺️",
      color: "#3b82f6",
      title: "Live Navigation",
      desc: "Built-in GPS routing shows the fastest route in real time, even on slow data.",
    },
    {
      icon: "🕐",
      color: "#10b981",
      title: "Flexible Hours",
      desc: "Go online when it suits you. No fixed shifts, no penalties for logging off.",
    },
    {
      icon: "🎁",
      color: "#a855f7",
      title: "Bonus Rewards",
      desc: "Hit delivery milestones to unlock surge bonuses, weekend boosts, and fuel allowances.",
    },
  ],
  ur: [
    {
      icon: "⚡",
      color: "#f59e0b",
      title: "فوری ادائیگی",
      desc: "ڈیلیوری مکمل ہوتے ہی کمائی آپ کے والیٹ میں پہنچ جاتی ہے۔",
    },
    {
      icon: "🗺️",
      color: "#3b82f6",
      title: "لائیو نیویگیشن",
      desc: "بلٹ ان GPS روٹنگ سست ڈیٹا پر بھی تیز ترین راستہ دکھاتی ہے۔",
    },
    {
      icon: "🕐",
      color: "#10b981",
      title: "لچکدار اوقات",
      desc: "جب چاہیں آن لائن ہوں۔ کوئی مقررہ شفٹ نہیں، کوئی جرمانہ نہیں۔",
    },
    {
      icon: "🎁",
      color: "#a855f7",
      title: "بونس انعامات",
      desc: "ڈیلیوری سنگ میل حاصل کریں اور سرج بونس، ویک اینڈ بوسٹ، فیول الاؤنس انلاک کریں۔",
    },
  ],
  roman: [
    {
      icon: "⚡",
      color: "#f59e0b",
      title: "Fori Payment",
      desc: "Delivery mukammal hote hi kamaai aapke wallet mein pohonch jaati hai.",
    },
    {
      icon: "🗺️",
      color: "#3b82f6",
      title: "Live Navigation",
      desc: "Built-in GPS routing sust data par bhi tez tareen raasta dikhati hai.",
    },
    {
      icon: "🕐",
      color: "#10b981",
      title: "Lachakdar Auqaat",
      desc: "Jab chahein online hon. Koi muqarrar shift nahin, koi jurmana nahin.",
    },
    {
      icon: "🎁",
      color: "#a855f7",
      title: "Bonus Rewards",
      desc: "Delivery milestones par surge bonuses, weekend boosts, aur fuel allowance milta hai.",
    },
  ],
};

const STEPS = {
  en: [
    {
      n: "01",
      title: "Register & Verify",
      desc: "Sign up with your phone number and verify your identity with CNIC.",
    },
    {
      n: "02",
      title: "Upload Documents",
      desc: "Upload your vehicle photo, CNIC, and driving license for KYC approval.",
    },
    {
      n: "03",
      title: "Start Earning",
      desc: "Once approved, go online and start accepting deliveries and rides instantly.",
    },
  ],
  ur: [
    {
      n: "01",
      title: "رجسٹر کریں",
      desc: "اپنے فون نمبر سے سائن اپ کریں اور شناختی کارڈ سے تصدیق کریں۔",
    },
    {
      n: "02",
      title: "دستاویزات اپلوڈ کریں",
      desc: "KYC کی منظوری کے لیے گاڑی کی تصویر، شناختی کارڈ اور لائسنس اپلوڈ کریں۔",
    },
    {
      n: "03",
      title: "کمانا شروع کریں",
      desc: "منظوری ملتے ہی آن لائن ہوں اور فوری ڈیلیوری قبول کرنا شروع کریں۔",
    },
  ],
  roman: [
    {
      n: "01",
      title: "Register Karein",
      desc: "Apne phone number se sign up karein aur CNIC se identity verify karein.",
    },
    {
      n: "02",
      title: "Documents Upload Karein",
      desc: "KYC approval ke liye gaadi ki tasveer, CNIC aur driving license upload karein.",
    },
    {
      n: "03",
      title: "Kamaai Shuru Karein",
      desc: "Approval milne ke baad online hon aur fori deliveries accept karna shuru karein.",
    },
  ],
};

const REQUIREMENTS = {
  en: ["Valid CNIC (18+)", "Any vehicle (bike/car/van)", "Smartphone", "Driving license"],
  ur: [
    "درست شناختی کارڈ (18+)",
    "کوئی بھی گاڑی (موٹر سائیکل / کار)",
    "اسمارٹ فون",
    "ڈرائیونگ لائسنس",
  ],
  roman: ["Valid CNIC (18+)", "Koi bhi gaadi (bike/car)", "Smartphone", "Driving license"],
};

const CONTENT = {
  en: {
    appName: "AJKMart Rider",
    tagline: "Earn on your schedule",
    heroTitle: "Your City.\nYour Earnings.",
    heroSub:
      "Join thousands of riders across AJK and earn delivering food, parcels, and rides — whenever you want.",
    ctaLogin: "Login",
    ctaRegister: "Join as Rider",
    featuresTitle: "Everything you need to earn more",
    stepsTitle: "3 simple steps to get started",
    reqTitle: "What you need",
    footerCta: "Ready to start earning?",
    footerBtn: "Create Rider Account",
    footer: "© 2026 AJKMart · Rider Platform",
  },
  ur: {
    appName: "اے جے کے مارٹ رائیڈر",
    tagline: "اپنے وقت پر کمائیں",
    heroTitle: "آپ کا شہر۔\nآپ کی کمائی۔",
    heroSub: "ہزاروں رائیڈرز کے ساتھ شامل ہوں اور جب چاہیں کھانا، پارسل اور سواری پہنچا کر کمائیں۔",
    ctaLogin: "لاگ ان",
    ctaRegister: "رائیڈر بنیں",
    featuresTitle: "زیادہ کمائی کے لیے سب کچھ موجود",
    stepsTitle: "شروع کرنے کے لیے ۳ آسان اقدامات",
    reqTitle: "آپ کو کیا چاہیے",
    footerCta: "کمانا شروع کرنے کے لیے تیار ہیں؟",
    footerBtn: "رائیڈر اکاؤنٹ بنائیں",
    footer: "© 2026 اے جے کے مارٹ · رائیڈر پلیٹ فارم",
  },
  roman: {
    appName: "AJKMart Rider",
    tagline: "Apne waqt par kamayein",
    heroTitle: "Aapka Shehar.\nAapki Kamaai.",
    heroSub:
      "Hazaron riders ke sath shamil hon aur jab chahen khana, parcel aur sawari pohoncha kar kamayein.",
    ctaLogin: "Login Karein",
    ctaRegister: "Rider Banein",
    featuresTitle: "Zyada kamaai ke liye sab kuch maujood",
    stepsTitle: "Shuru karne ke liye 3 aasaan steps",
    reqTitle: "Aapko kya chahiye",
    footerCta: "Kamaai shuru karne ke liye tayyar hain?",
    footerBtn: "Rider Account Banayein",
    footer: "© 2026 AJKMart · Rider Platform",
  },
};

export function GuestLanding() {
  const [, navigate] = useLocation();
  const { language, setLanguage } = useLanguage();
  const [scrolled, setScrolled] = useState(false);
  const isRTL = language === "ur";

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const C = CONTENT[language as keyof typeof CONTENT] ?? CONTENT.en;
  const stats = STATS[language as keyof typeof STATS] ?? STATS.en;
  const features = FEATURES[language as keyof typeof FEATURES] ?? FEATURES.en;
  const steps = STEPS[language as keyof typeof STEPS] ?? STEPS.en;
  const reqs = REQUIREMENTS[language as keyof typeof REQUIREMENTS] ?? REQUIREMENTS.en;

  return (
    <div
      className="dark"
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--login-hero-from)",
        color: "var(--color-foreground)",
        overflowX: "hidden",
      }}
      dir={isRTL ? "rtl" : "ltr"}
    >
      {/* ── Sticky Header ── */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backgroundColor: "rgba(11,14,17,0.95)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--color-border)",
          height: scrolled ? 52 : 64,
          transition: "height 0.2s ease",
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: `0 ${scrolled ? "0.75rem" : "1rem"}`,
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            transition: "padding 0.2s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div
              style={{
                width: scrolled ? 28 : 36,
                height: scrolled ? 28 : 36,
                borderRadius: 10,
                background: "linear-gradient(135deg, var(--login-brand) 0%, #00c6ff 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "all 0.2s ease",
              }}
            >
              <svg
                width={scrolled ? 15 : 20}
                height={scrolled ? 15 : 20}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: "#0b0e11" }}
              >
                <circle cx="5.5" cy="17.5" r="2.5" />
                <circle cx="18.5" cy="17.5" r="2.5" />
                <path d="M8 17.5h7M3 9l1.5-5h7L14 9M14 9h4l2 5M8 9H3" />
              </svg>
            </div>
            {!scrolled && (
              <span
                style={{
                  fontWeight: 800,
                  color: "var(--login-brand)",
                  fontSize: 15,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {C.appName}
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => setLanguage(cycleLang(language))}
              style={{
                height: scrolled ? 28 : 34,
                padding: "0 12px",
                borderRadius: 99,
                backgroundColor: "var(--login-otp-filled-bg)",
                border: "1px solid var(--login-brand-border)",
                color: "var(--login-brand)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                transition: "height 0.2s ease",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <svg
                width="12"
                height="12"
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
              style={{
                height: scrolled ? 28 : 34,
                padding: "0 14px",
                borderRadius: 10,
                border: "1px solid var(--login-brand-border)",
                backgroundColor: "transparent",
                color: "var(--login-brand)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                transition: "height 0.2s ease",
              }}
            >
              {C.ctaLogin}
            </button>
            <button
              onClick={() => navigate("/register")}
              style={{
                height: scrolled ? 28 : 34,
                padding: "0 14px",
                borderRadius: 10,
                backgroundColor: "var(--login-brand)",
                border: "none",
                color: "var(--login-hero-from)",
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 0 12px var(--login-brand-glow-sm)",
                transition: "height 0.2s ease",
              }}
            >
              {C.ctaRegister}
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, var(--login-otp-filled-bg) 0%, transparent 70%), var(--login-hero-from)",
          padding: "72px 24px 60px",
          textAlign: "center",
        }}
      >
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div
            style={{
              position: "absolute",
              top: -80,
              left: "50%",
              transform: "translateX(-50%)",
              width: 600,
              height: 300,
              borderRadius: "50%",
              background: "var(--login-brand-glow-blob)",
              filter: "blur(60px)",
            }}
          />
        </div>

        <div style={{ maxWidth: 640, margin: "0 auto", position: "relative" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              borderRadius: 99,
              padding: "5px 14px",
              backgroundColor: "var(--login-otp-filled-bg)",
              border: "1px solid var(--login-brand-border)",
              color: "var(--login-brand)",
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 24,
              letterSpacing: "0.04em",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            {C.tagline}
          </div>

          <h1
            style={{
              fontSize: "clamp(2rem, 6vw, 3.5rem)",
              fontWeight: 900,
              color: "var(--color-foreground)",
              lineHeight: 1.1,
              marginBottom: 20,
              whiteSpace: "pre-line",
            }}
          >
            {C.heroTitle}
          </h1>
          <p
            style={{
              fontSize: 17,
              color: "var(--color-muted-foreground)",
              lineHeight: 1.7,
              maxWidth: 500,
              margin: "0 auto 36px",
            }}
          >
            {C.heroSub}
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => navigate("/register")}
              style={{
                height: 52,
                padding: "0 32px",
                borderRadius: 12,
                backgroundColor: "var(--login-brand)",
                border: "none",
                color: "var(--login-hero-from)",
                fontSize: 15,
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 4px 24px var(--login-brand-glow-md)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {C.ctaRegister}
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
            <button
              onClick={() => navigate("/login")}
              style={{
                height: 52,
                padding: "0 32px",
                borderRadius: 12,
                backgroundColor: "var(--color-card)",
                border: "1px solid var(--color-border)",
                color: "var(--color-foreground)",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {C.ctaLogin}
            </button>
          </div>
        </div>
      </section>

      {/* ── Stats Strip ── */}
      <section
        style={{
          backgroundColor: "var(--color-card)",
          borderTop: "1px solid var(--color-border)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "0 24px",
            display: "flex",
            alignItems: "stretch",
          }}
        >
          {stats.map((s, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                padding: "24px 16px",
                textAlign: "center",
                borderRight: i < stats.length - 1 ? "1px solid var(--color-border)" : "none",
              }}
            >
              <div
                style={{
                  fontSize: "clamp(1.4rem, 3.5vw, 1.9rem)",
                  fontWeight: 900,
                  color: "var(--login-brand)",
                  marginBottom: 4,
                }}
              >
                {s.v}
              </div>
              <div
                style={{ fontSize: 12, color: "var(--color-muted-foreground)", fontWeight: 500 }}
              >
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature Cards ── */}
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "64px 24px 48px" }}>
        <h2
          style={{
            textAlign: "center",
            fontSize: "clamp(1.25rem, 3vw, 1.75rem)",
            fontWeight: 800,
            color: "var(--color-foreground)",
            marginBottom: 40,
          }}
        >
          {C.featuresTitle}
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          {features.map((f) => (
            <div
              key={f.title}
              style={{
                backgroundColor: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: 18,
                padding: "24px 20px",
                transition: "border-color 0.2s, transform 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "var(--login-brand-border)";
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "var(--color-border)";
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: `${f.color}18`,
                  border: `1px solid ${f.color}35`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  marginBottom: 14,
                }}
              >
                {f.icon}
              </div>
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: "var(--color-foreground)",
                  marginBottom: 6,
                }}
              >
                {f.title}
              </h3>
              <p style={{ fontSize: 13, color: "var(--color-muted-foreground)", lineHeight: 1.65 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How to Start — 3 Steps ── */}
      <section
        style={{
          backgroundColor: "var(--color-card)",
          borderTop: "1px solid var(--color-border)",
          borderBottom: "1px solid var(--color-border)",
          padding: "60px 24px",
        }}
      >
        <div style={{ maxWidth: 840, margin: "0 auto" }}>
          <h2
            style={{
              textAlign: "center",
              fontSize: "clamp(1.25rem, 3vw, 1.75rem)",
              fontWeight: 800,
              color: "var(--color-foreground)",
              marginBottom: 48,
            }}
          >
            {C.stepsTitle}
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 20,
              position: "relative",
            }}
          >
            {steps.map((s, i) => (
              <div
                key={i}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    marginBottom: 16,
                    backgroundColor: "var(--login-otp-filled-bg)",
                    border: "2px solid var(--login-brand-border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--login-brand)",
                    fontSize: 16,
                    fontWeight: 900,
                    letterSpacing: "-0.03em",
                  }}
                >
                  {s.n}
                </div>
                <h3
                  style={{
                    fontSize: 15,
                    fontWeight: 800,
                    color: "var(--color-foreground)",
                    marginBottom: 8,
                  }}
                >
                  {s.title}
                </h3>
                <p
                  style={{ fontSize: 13, color: "var(--color-muted-foreground)", lineHeight: 1.65 }}
                >
                  {s.desc}
                </p>
                {i < steps.length - 1 && (
                  <div
                    style={{
                      position: "absolute",
                      top: 28,
                      [isRTL ? "left" : "right"]: "-10%",
                      width: "20%",
                      height: 2,
                      background: "var(--login-brand-border)",
                      display: "none",
                    }}
                    className="md:block"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Requirements Strip ── */}
      <section style={{ maxWidth: 840, margin: "0 auto", padding: "40px 24px" }}>
        <p
          style={{
            textAlign: "center",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--color-muted-foreground)",
            marginBottom: 18,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {C.reqTitle}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          {reqs.map((r) => (
            <div
              key={r}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                borderRadius: 99,
                padding: "7px 16px",
                backgroundColor: "var(--color-card)",
                border: "1px solid var(--color-border)",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--color-foreground)",
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--login-brand)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {r}
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer CTA ── */}
      <section
        style={{
          background: "linear-gradient(135deg, var(--login-hero-via) 0%, var(--color-card) 100%)",
          border: "1px solid var(--color-border)",
          margin: "0 24px 48px",
          borderRadius: 24,
          padding: "56px 24px",
          textAlign: "center",
          maxWidth: 720,
          marginLeft: "auto",
          marginRight: "auto",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -60,
            left: "50%",
            transform: "translateX(-50%)",
            width: 400,
            height: 200,
            background: "var(--login-brand-glow-blob)",
            borderRadius: "50%",
            filter: "blur(40px)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative" }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              margin: "0 auto 20px",
              background: "var(--login-brand)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 32px var(--login-brand-glow-md)",
            }}
          >
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#0b0e11"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <h2
            style={{
              fontSize: "clamp(1.25rem, 3vw, 1.75rem)",
              fontWeight: 900,
              color: "var(--color-foreground)",
              marginBottom: 24,
            }}
          >
            {C.footerCta}
          </h2>
          <button
            onClick={() => navigate("/register")}
            style={{
              height: 54,
              padding: "0 40px",
              borderRadius: 14,
              backgroundColor: "var(--login-brand)",
              border: "none",
              color: "var(--login-hero-from)",
              fontSize: 15,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 4px 24px var(--login-brand-glow-md)",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
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

      <footer
        style={{
          textAlign: "center",
          fontSize: 12,
          color: "var(--color-muted-foreground)",
          padding: "24px 16px 40px",
          borderTop: "1px solid var(--color-border)",
        }}
      >
        {C.footer}
      </footer>
    </div>
  );
}

export default GuestLanding;
