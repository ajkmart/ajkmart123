import { createLogger } from "@/lib/logger";
import { Capacitor } from "@capacitor/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCurrency as _sharedFcP } from "@workspace/api-zod";
import { tDual, type TranslationKey } from "@workspace/i18n";
import {
  AlertTriangle,
  BarChart2,
  Bell,
  Bike,
  Camera,
  CheckCircle,
  ChevronDown,
  Circle,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
  Home,
  Info,
  Landmark,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Phone,
  RefreshCcw,
  Shield,
  Star,
  Truck,
  User,
  Wallet,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ProfileFooter } from "../components/profile/ProfileFooter";
import { InfoRow, SavedCheckmark, SkeletonProfile } from "../components/profile/ProfileHelpers";
import { ProfilePenaltyHistory } from "../components/profile/ProfilePenaltyHistory";
import { ProfileReviews } from "../components/profile/ProfileReviews";
import { ProfileSettings } from "../components/profile/ProfileSettings";
import { SafeImage } from "../components/ui/SafeImage";
import { api } from "../lib/api";
import { useAuth } from "../lib/rider-auth";
import { usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
import { useTheme } from "../lib/useTheme";
const log = createLogger("[Profile]");

const fc = (n: string | number | null | undefined, currencySymbol = "Rs.") =>
  _sharedFcP(n != null ? String(n) : (n as null | undefined), currencySymbol);

const CITIES_FALLBACK = [
  "Muzaffarabad",
  "Mirpur",
  "Rawalakot",
  "Bagh",
  "Kotli",
  "Bhimber",
  "Jhelum",
  "Rawalpindi",
  "Islamabad",
  "Other",
];
const BANKS = [
  "EasyPaisa",
  "JazzCash",
  "MCB",
  "HBL",
  "UBL",
  "Meezan Bank",
  "Bank Alfalah",
  "NBP",
  "Allied Bank",
  "Other",
];
const VEHICLES = ["bike", "car", "van", "rickshaw", "bicycle", "on_foot"];
const VEHICLE_LABELS: Record<string, string> = {
  bike: "Bike / Motorcycle",
  car: "Car",
  rickshaw: "Rickshaw / QingQi",
  bicycle: "Bicycle",
  on_foot: "On Foot",
  van: "Van",
};

const INPUT =
  "w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200 focus:bg-white transition-all";
const SELECT =
  "w-full h-12 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200 appearance-none transition-all";
const LABEL = "text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block";

type EditSection = "personal" | "vehicle" | "bank" | null;

type ProfilePayload = {
  name?: string;
  email?: string;
  cnic?: string;
  city?: string;
  address?: string;
  emergencyContact?: string;
  vehicleType?: string;
  vehiclePlate?: string;
  vehicleRegNo?: string;
  drivingLicense?: string;
  bankName?: string;
  bankAccount?: string;
  bankAccountTitle?: string;
};

export default function Profile() {
  const { user, logout, refreshUser, loading: authLoading } = useAuth();
  const { config } = usePlatformConfig();
  const currency = config.platform.currencySymbol ?? "Rs.";
  const riderKeepPct = config.rider?.keepPct ?? config.finance.riderEarningPct ?? 80;

  const { data: notifData } = useQuery({
    queryKey: ["rider-notifs-count"],
    queryFn: () => api.getNotifications(),
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const unread: number = notifData?.unread || 0;

  const queryClient = useQueryClient();
  const kycMut = useMutation({
    mutationFn: () => api.requestKycReview(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["rider-me"] });
    },
  });

  const { data: citiesData } = useQuery({
    queryKey: ["popular-cities"],
    queryFn: () => api.getPopularCities(),
    staleTime: 5 * 60 * 1000,
  });
  const CITIES: string[] = citiesData?.cities?.length ? citiesData.cities : CITIES_FALLBACK;

  const [editing, setEditing] = useState<EditSection>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [toastIsError, setToastIsError] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<"personal" | "vehicle" | "bank">("personal");
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [savedSection, setSavedSection] = useState<EditSection>(null);
  const [fadeIn, setFadeIn] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [docUploading, setDocUploading] = useState<
    "cnic" | "license" | "regDoc" | "vehiclePhoto" | null
  >(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const cnicDocInputRef = useRef<HTMLInputElement | null>(null);
  const licenseDocInputRef = useRef<HTMLInputElement | null>(null);
  const regDocInputRef = useRef<HTMLInputElement | null>(null);
  const vehiclePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { language, setLanguage } = useLanguage();
  const { isDark, toggleDark } = useTheme();
  const T = (key: TranslationKey) => tDual(key, language);

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [cnic, setCnic] = useState(user?.cnic || "");
  const [city, setCity] = useState(user?.city || "");
  const [address, setAddress] = useState(user?.address || "");
  const [emergency, setEmergency] = useState(user?.emergencyContact || "");

  const [vehicleType, setVehicleType] = useState(user?.vehicleType || "");
  const [vehiclePlate, setVehiclePlate] = useState(user?.vehiclePlate || "");
  const [vehicleRegNo, setVehicleRegNo] = useState(user?.vehicleRegNo || "");
  const [drivingLicense, setDrivingLicense] = useState(user?.drivingLicense || "");

  const [bankName, setBankName] = useState(user?.bankName || "");
  const [bankAccount, setBankAccount] = useState(user?.bankAccount || "");
  const [bankAccountTitle, setBankAccountTitle] = useState(user?.bankAccountTitle || "");

  useEffect(() => {
    requestAnimationFrame(() => setFadeIn(true));
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  /* Sync form fields from the latest user object whenever the user state
     updates (e.g. after refreshUser() following a save), but only when the
     form is not currently open for editing — so we never overwrite what the
     rider is actively typing. */
  useEffect(() => {
    if (editing != null || !user) return;
    setName(user.name || "");
    setEmail(user.email || "");
    setCnic(user.cnic || "");
    setCity(user.city || "");
    setAddress(user.address || "");
    setEmergency(user.emergencyContact || "");
    setVehicleType(user.vehicleType || "");
    setVehiclePlate(user.vehiclePlate || "");
    setVehicleRegNo(user.vehicleRegNo || "");
    setDrivingLicense(user.drivingLicense || "");
    setBankName(user.bankName || "");
    setBankAccount(user.bankAccount || "");
    setBankAccountTitle(user.bankAccountTitle || "");
  }, [user, editing]);

  const showToast = (m: string, isError = false) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(m);
    setToastIsError(isError);
    toastTimerRef.current = setTimeout(() => setToast(""), 3500);
  };

  const maxImageMb = config.uploads?.maxImageMb ?? 5;
  const allowedImageFormats =
    (config.uploads?.allowedImageFormats ?? []).length > 0
      ? config.uploads!.allowedImageFormats!.flatMap(
          (f) => [`image/${f}`, f === "jpeg" ? "image/jpg" : null].filter(Boolean) as string[]
        )
      : ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];
  const ALLOWED_IMAGE_MIME = allowedImageFormats;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_MIME.includes(file.type.toLowerCase())) {
      showToast("Invalid file type. Please upload a JPEG, PNG, or WebP image.");
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      return;
    }
    if (file.size > maxImageMb * 1024 * 1024) {
      showToast(`Image too large (max ${maxImageMb}MB)`);
      return;
    }
    setAvatarUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const uploadRes = await api.uploadFile({
        file: base64,
        filename: file.name,
        mimeType: file.type,
      });
      if (!uploadRes?.url) {
        showToast("Upload failed — no URL returned");
        setAvatarUploading(false);
        return;
      }
      await api.updateProfile({ avatar: uploadRes.url });
      await refreshUser();
      showToast("Profile photo updated");
    } catch {
      showToast("Failed to upload photo");
    }
    setAvatarUploading(false);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  };

  const handleDocUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: "cnic" | "license" | "regDoc" | "vehiclePhoto"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_MIME.includes(file.type.toLowerCase())) {
      showToast("Invalid file type. Please upload a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > maxImageMb * 1024 * 1024) {
      showToast(`Document image too large (max ${maxImageMb}MB)`);
      return;
    }
    setDocUploading(kind);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const uploadRes = await api.uploadFile({
        file: base64,
        filename: file.name,
        mimeType: file.type,
      });
      if (!uploadRes?.url) {
        showToast("Upload failed — no URL returned");
        return;
      }
      /* Map each document kind to the appropriate profile field */
      const patch =
        kind === "cnic"
          ? { cnicDocUrl: uploadRes.url }
          : kind === "license"
            ? { licenseDocUrl: uploadRes.url }
            : kind === "regDoc"
              ? { regDocUrl: uploadRes.url }
              : { vehiclePhoto: uploadRes.url };
      await api.updateProfile(patch);
      await refreshUser();
      const labels: Record<typeof kind, string> = {
        cnic: "CNIC photo uploaded",
        license: "Driving license photo uploaded",
        regDoc: "Registration document uploaded",
        vehiclePhoto: "Vehicle photo uploaded",
      };
      showToast(labels[kind]);
    } catch {
      showToast(`Failed to upload ${kind} photo`);
    } finally {
      setDocUploading(null);
      const refs = {
        cnic: cnicDocInputRef,
        license: licenseDocInputRef,
        regDoc: regDocInputRef,
        vehiclePhoto: vehiclePhotoInputRef,
      };
      const ref = refs[kind];
      if (ref.current) ref.current.value = "";
    }
  };

  const startEdit = (section: EditSection) => {
    if (section === "personal") {
      setName(user?.name || "");
      setEmail(user?.email || "");
      setCnic(user?.cnic || "");
      setCity(user?.city || "");
      setAddress(user?.address || "");
      setEmergency(user?.emergencyContact || "");
    } else if (section === "vehicle") {
      setVehicleType(user?.vehicleType || "");
      setVehiclePlate(user?.vehiclePlate || "");
      setVehicleRegNo(user?.vehicleRegNo || "");
      setDrivingLicense(user?.drivingLicense || "");
    } else if (section === "bank") {
      setBankName(user?.bankName || "");
      setBankAccount(user?.bankAccount || "");
      setBankAccountTitle(user?.bankAccountTitle || "");
    }
    if (section) setActiveTab(section);
    setEditing(section);
  };

  /* Explicitly reset fields to current saved values when the user cancels editing.
     Previously only setEditing(null) was called, which relied on the user-change useEffect
     to sync fields — but that effect only runs when the user object itself changes. */
  const cancelEdit = (section: EditSection) => {
    if (section === "personal") {
      setName(user?.name || "");
      setEmail(user?.email || "");
      setCnic(user?.cnic || "");
      setCity(user?.city || "");
      setAddress(user?.address || "");
      setEmergency(user?.emergencyContact || "");
    } else if (section === "vehicle") {
      setVehicleType(user?.vehicleType || "");
      setVehiclePlate(user?.vehiclePlate || "");
      setVehicleRegNo(user?.vehicleRegNo || "");
      setDrivingLicense(user?.drivingLicense || "");
    } else if (section === "bank") {
      setBankName(user?.bankName || "");
      setBankAccount(user?.bankAccount || "");
      setBankAccountTitle(user?.bankAccountTitle || "");
    }
    setEditing(null);
  };

  /* P1: Re-sync form fields when user data updates from server (e.g. after refreshUser).
     The `editing` flag must be in the deps because flipping it from a section
     name back to `null` (e.g. cancelling an edit) needs to reset the form to
     the server values, even if the `user` reference hasn't changed since open.
     Without this, typed-but-cancelled text leaks into the next edit session. */
  useEffect(() => {
    if (!editing) {
      setName(user?.name || "");
      setEmail(user?.email || "");
      setCnic(user?.cnic || "");
      setCity(user?.city || "");
      setAddress(user?.address || "");
      setEmergency(user?.emergencyContact || "");
      setVehicleType(user?.vehicleType || "");
      setVehiclePlate(user?.vehiclePlate || "");
      setVehicleRegNo(user?.vehicleRegNo || "");
      setDrivingLicense(user?.drivingLicense || "");
      setBankName(user?.bankName || "");
      setBankAccount(user?.bankAccount || "");
      setBankAccountTitle(user?.bankAccountTitle || "");
    }
  }, [user, editing]);

  const saveSection = async (section: EditSection) => {
    setSaving(true);
    try {
      const payload: ProfilePayload = {};
      if (section === "personal") {
        if (!name.trim()) {
          showToast(T("nameRequired"));
          setSaving(false);
          return;
        }
        if (email && email.trim()) {
          const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailPattern.test(email.trim())) {
            showToast(T("enterValidEmail"), true);
            setSaving(false);
            return;
          }
        }
        if (cnic && cnic.trim()) {
          const cnicPattern = /^\d{5}-\d{7}-\d{1}$/;
          if (!cnicPattern.test(cnic.trim())) {
            showToast(T("cnicFormatError"), true);
            setSaving(false);
            return;
          }
        }
        /* P2: Only send keys whose trimmed value is non-empty. Backend
           validators commonly accept `null`/missing for optional fields but
           reject `""` (CNIC and email are both like that). Cleared fields
           used to bounce the entire save with a confusing validation error. */
        const trimmedName = name.trim();
        const trimmedEmail = email.trim();
        const trimmedCnic = cnic.trim();
        const trimmedAddress = (address ?? "").trim();
        const trimmedEmergency = (emergency ?? "").trim();
        Object.assign(payload, {
          ...(trimmedName ? { name: trimmedName } : {}),
          ...(trimmedEmail ? { email: trimmedEmail } : {}),
          ...(trimmedCnic ? { cnic: trimmedCnic } : {}),
          ...(city ? { city } : {}),
          ...(trimmedAddress ? { address: trimmedAddress } : {}),
          ...(trimmedEmergency ? { emergencyContact: trimmedEmergency } : {}),
        });
      }
      if (section === "vehicle")
        Object.assign(payload, { vehicleType, vehiclePlate, vehicleRegNo, drivingLicense });
      if (section === "bank") {
        if (!bankAccount || bankAccount.trim().length < 8) {
          showToast(T("bankAccountRequired"));
          setSaving(false);
          return;
        }
        if (!bankAccountTitle || !bankAccountTitle.trim()) {
          showToast(T("bankAccountTitleRequired"));
          setSaving(false);
          return;
        }
        if (!bankName) {
          showToast(T("bankNameRequired"));
          setSaving(false);
          return;
        }
        Object.assign(payload, {
          bankName,
          bankAccount: bankAccount.trim(),
          bankAccountTitle: bankAccountTitle.trim(),
        });
      }
      const result = await api.updateProfile(payload);
      await refreshUser();
      setEditing(null);
      setSavedSection(section);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSavedSection(null), 3000);
      if (result?.pendingVerification) {
        setPendingVerification(true);
      }
      showToast(T("changesSaved"));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : T("saveFailedMsg");
      showToast(msg, true);
    }
    setSaving(false);
  };

  const completionFieldMap: { key: string; label: string; val: unknown }[] = [
    { key: "name", label: T("fullName"), val: editing === "personal" ? name : user?.name },
    { key: "cnic", label: T("cnicNationalId"), val: editing === "personal" ? cnic : user?.cnic },
    { key: "city", label: T("cityLabel"), val: editing === "personal" ? city : user?.city },
    {
      key: "vehicleType",
      label: T("vehicleType"),
      val: editing === "vehicle" ? vehicleType : user?.vehicleType,
    },
    {
      key: "vehiclePlate",
      label: T("vehiclePlate"),
      val: editing === "vehicle" ? vehiclePlate : user?.vehiclePlate,
    },
    {
      key: "bankName",
      label: T("bankDetails"),
      val: editing === "bank" ? bankName : user?.bankName,
    },
  ];
  /* Explicitly check for non-null AND non-empty-string to avoid false positives from empty string fields */
  const completionFilled = completionFieldMap.filter(
    (f) => f.val != null && f.val !== undefined && f.val !== ""
  );
  const completionPct = Math.round((completionFilled.length / completionFieldMap.length) * 100);
  const missingCount = completionFieldMap.length - completionFilled.length;

  const totalDeliveries = user?.stats?.totalDeliveries || 0;
  const totalEarnings = user?.stats?.totalEarnings || 0;
  const rating = user?.stats?.rating ?? 5.0;

  const quickActions = [
    {
      href: "/wallet",
      icon: <Wallet size={20} />,
      label: T("wallet"),
      bg: "bg-emerald-50 text-emerald-600",
    },
    {
      href: "/earnings",
      icon: <BarChart2 size={20} />,
      label: T("yourEarnings"),
      bg: "bg-amber-50 text-amber-600",
    },
    {
      href: "/history",
      icon: <ClipboardList size={20} />,
      label: T("myOrders"),
      bg: "bg-purple-50 text-purple-600",
    },
    {
      href: "/reviews",
      icon: <Star size={20} />,
      label: "My Reviews",
      bg: "bg-yellow-50 text-yellow-600",
    },
    {
      href: "/notifications",
      icon: <Bell size={20} />,
      label: T("notifications"),
      bg: "bg-indigo-50 text-indigo-600",
      badge: unread,
    },
    {
      href: "/settings/security",
      icon: <Shield size={20} />,
      label: T("securitySettingsLink"),
      bg: "bg-red-50 text-red-600",
    },
  ];

  const handleLogout = () => {
    if (!logoutConfirm) {
      setLogoutConfirm(true);
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = setTimeout(() => setLogoutConfirm(false), 4000);
      return;
    }
    // Explicitly clear all client storage layers before the auth-context logout
    // so no stale credentials or session data survive on the device.
    try {
      sessionStorage.clear();
    } catch (err) {
      log.warn("[Profile] sessionStorage.clear failed:", err);
    }
    try {
      localStorage.clear();
    } catch (err) {
      log.warn("[Profile] localStorage.clear failed:", err);
    }
    if (Capacitor.isNativePlatform()) {
      import("@capacitor/preferences")
        .then(({ Preferences }) => {
          Preferences.clear().catch((err: unknown) => {
            log.warn("[Profile] Preferences.clear failed:", err);
          });
        })
        .catch((err: unknown) => {
          log.warn("[Profile] @capacitor/preferences import failed:", err);
        });
    }
    logout();
  };

  const maskAccount = useCallback((acc: string) => {
    if (!acc || acc.length <= 4) return acc || "****";
    return "•••• " + acc.slice(-4);
  }, []);

  if (authLoading) return <SkeletonProfile />;

  return (
    <div
      className={`min-h-screen bg-[#F5F6F8] transition-opacity duration-500 ${fadeIn ? "opacity-100" : "opacity-0"}`}
    >
      {toast && (
        <div
          className={`fixed top-4 left-1/2 z-50 flex max-w-[90vw] -translate-x-1/2 animate-[slideDown_0.3s_ease-out] items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold shadow-2xl ${toastIsError ? "bg-red-600 text-white" : "bg-gray-900 text-white"}`}
        >
          {toastIsError ? (
            <AlertTriangle size={15} className="flex-shrink-0 text-red-200" />
          ) : (
            <CheckCircle size={15} className="flex-shrink-0 text-green-400" />
          )}
          {toast}
        </div>
      )}

      {pendingVerification && (
        <div className="fixed top-4 right-4 left-4 z-40 flex animate-[slideDown_0.3s_ease-out] items-start gap-3 rounded-2xl bg-amber-500 px-5 py-4 text-sm font-semibold text-white shadow-2xl">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0 text-amber-100" />
          <div className="flex-1">
            <p className="font-extrabold">Pending Re-Verification</p>
            <p className="mt-0.5 text-xs leading-relaxed font-medium text-amber-100">
              Your profile changes require admin approval. You cannot go online until your account
              is re-verified.
            </p>
          </div>
          <button
            onClick={() => setPendingVerification(false)}
            className="flex-shrink-0 text-amber-200 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div
        className="relative overflow-hidden rounded-b-[2rem] bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-5 pb-24"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}
      >
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-green-500/[0.04]" />
        <div className="absolute bottom-10 -left-16 h-56 w-56 rounded-full bg-white/[0.02]" />
        <div className="relative mb-2 flex items-center justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold tracking-widest text-white/40 uppercase">
              {T("riderProfileSettings")}
            </p>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">
              {T("myAccountTitle")}
            </h1>
          </div>
          <Link
            href="/notifications"
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.06] text-white backdrop-blur-sm"
          >
            <Bell size={18} />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-red-500 text-[9px] font-extrabold text-white shadow-sm">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
        </div>
      </div>

      <div className="-mt-20 space-y-4 px-4">
        <div className="relative animate-[slideUp_0.4s_ease-out] overflow-hidden rounded-3xl border border-gray-100 bg-white p-5 shadow-lg">
          <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-gray-50 opacity-50" />
          <div className="relative flex items-start gap-4">
            <input
              type="file"
              accept="image/*"
              capture="user"
              ref={avatarInputRef}
              onChange={handleAvatarUpload}
              className="hidden"
            />
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="group relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl shadow-lg ring-4 ring-gray-200"
            >
              {user?.avatar ? (
                <SafeImage
                  src={user.avatar}
                  alt="Profile"
                  className="h-full w-full object-cover"
                  loading="eager"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gray-900 text-2xl font-extrabold text-white">
                  {(user?.name || user?.phone || "R")[0].toUpperCase()}
                </div>
              )}
              {avatarUploading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                </div>
              ) : (
                <div className="absolute right-0 bottom-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-gray-900 shadow-sm">
                  <Camera size={10} className="text-white" />
                </div>
              )}
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg leading-tight font-extrabold text-gray-900">
                {user?.name || "Rider"}
              </h2>
              <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-500">
                <Phone size={12} /> {user?.phone}
              </p>
              {user?.city && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                  <MapPin size={11} /> {user.city}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    user?.isOnline ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  <Circle
                    size={7}
                    className={
                      user?.isOnline
                        ? "fill-green-500 text-green-500"
                        : "fill-gray-400 text-gray-400"
                    }
                  />
                  {user?.isOnline ? T("onlineLabel") : T("offlineLabel")}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-gray-900 px-2.5 py-1 text-[11px] font-bold text-white">
                  <Bike size={11} /> {T("riderBadge")}
                </span>
                {user?.vehicleType && (
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-700">
                    {VEHICLE_LABELS[user.vehicleType] ?? user.vehicleType}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    size={13}
                    className={
                      s <= Math.round(rating)
                        ? "fill-yellow-400 text-yellow-400"
                        : "fill-gray-200 text-gray-200"
                    }
                  />
                ))}
              </div>
              <span className="text-xs font-semibold text-gray-500">
                {rating.toFixed(1)} {T("ratingLabel")}
              </span>
            </div>
            {user?.createdAt && (
              <p className="flex items-center gap-1 text-[10px] text-gray-400">
                <Clock size={10} /> {T("memberSince")}{" "}
                {new Date(user.createdAt).toLocaleDateString("en-PK", {
                  month: "short",
                  year: "numeric",
                })}
              </p>
            )}
          </div>
        </div>

        <div className="flex animate-[slideUp_0.5s_ease-out] gap-2">
          {[
            {
              label: T("deliveriesLabel"),
              value: String(totalDeliveries),
              icon: <ClipboardList size={15} className="text-blue-500" />,
              bg: "bg-blue-50",
              border: "border-blue-100",
            },
            {
              label: T("earnedStat"),
              value: fc(totalEarnings, currency),
              icon: <BarChart2 size={15} className="text-green-500" />,
              bg: "bg-green-50",
              border: "border-green-100",
            },
            {
              label: T("walletStat"),
              value: fc(user?.walletBalance ?? "0", currency),
              icon: <Wallet size={15} className="text-amber-500" />,
              bg: "bg-amber-50",
              border: "border-amber-100",
            },
            {
              label: T("ratingStat"),
              value: rating.toFixed(1),
              icon: <Star size={15} className="text-yellow-500" />,
              bg: "bg-yellow-50",
              border: "border-yellow-100",
            },
          ].map((s) => (
            <div
              key={s.label}
              className={`flex-1 ${s.bg} rounded-2xl border p-3 ${s.border} text-center`}
            >
              <div className="mb-1 flex justify-center">{s.icon}</div>
              <p className="text-[15px] leading-tight font-extrabold text-gray-800">{s.value}</p>
              <p className="mt-0.5 truncate text-[9px] font-semibold text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="flex animate-[slideUp_0.55s_ease-out] items-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-2.5">
          <Truck size={14} className="flex-shrink-0 text-indigo-500" />
          <p className="text-xs font-semibold text-indigo-700">
            Max simultaneous deliveries:{" "}
            <span className="font-extrabold">{config.rider?.maxDeliveries ?? 3}</span>
          </p>
        </div>

        {completionPct < 100 && (
          <div className="animate-[slideUp_0.55s_ease-out] rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold text-amber-800">{T("completeProfileLabel")}</p>
              <span className="text-[11px] font-semibold text-amber-600">
                {missingCount} {T("itemsRemaining")}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-amber-200">
              <div
                className="h-2 rounded-full bg-amber-500 transition-all duration-700"
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </div>
        )}

        <div className="animate-[slideUp_0.6s_ease-out]">
          <p className="mb-2 px-1 text-[13px] font-bold text-gray-700">{T("quickActionsLabel")}</p>
          <div className="grid grid-cols-3 gap-2">
            {quickActions.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex flex-col items-center gap-2 rounded-3xl border border-gray-100 bg-white p-3.5 shadow-sm transition-all active:bg-gray-50"
              >
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${item.bg}`}>
                  {item.icon}
                </div>
                <span className="text-center text-[11px] leading-tight font-semibold text-gray-700">
                  {item.label}
                </span>
                {(item.badge ?? 0) > 0 && (
                  <span className="absolute top-2 right-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-extrabold text-white">
                    {item.badge! > 9 ? "9+" : item.badge}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>

        <div className="animate-[slideUp_0.65s_ease-out] overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <div className="flex border-b border-gray-100">
            {(["personal", "vehicle", "bank"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  if (editing && editing !== tab) setEditing(null);
                }}
                className={`relative flex-1 py-3.5 text-sm font-bold transition-all ${
                  activeTab === tab ? "text-gray-900" : "text-gray-400"
                }`}
              >
                {tab === "personal"
                  ? T("personalTab")
                  : tab === "vehicle"
                    ? T("vehicleTab")
                    : T("bankTab")}
                {activeTab === tab && (
                  <div className="absolute right-1/4 bottom-0 left-1/4 h-[3px] rounded-t-full bg-gray-900" />
                )}
                {savedSection === tab && (
                  <span className="absolute top-1 right-2">
                    <CheckCircle
                      size={12}
                      className="animate-[fadeIn_0.3s_ease-out] text-green-500"
                    />
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="transition-all duration-300">
            {activeTab === "personal" && (
              <div className="animate-[fadeIn_0.25s_ease-out]">
                <div className="flex items-center justify-between border-b border-gray-50 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <User size={15} className="text-gray-900" />
                    <div>
                      <p className="text-[14px] font-bold text-gray-900">
                        {T("personalInformation")}
                      </p>
                      <p className="text-[10px] text-gray-400">{T("identityContact")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <SavedCheckmark show={savedSection === "personal"} label={T("savedFeedback")} />
                    <button
                      onClick={() =>
                        editing === "personal" ? cancelEdit("personal") : startEdit("personal")
                      }
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold transition-all ${
                        editing === "personal"
                          ? "bg-gray-100 text-gray-600"
                          : "bg-gray-100 text-gray-900 active:bg-gray-200"
                      }`}
                    >
                      {editing === "personal" ? (
                        <>
                          <span className="text-xs">✕</span> {T("cancel")}
                        </>
                      ) : (
                        <>
                          <Pencil size={12} /> {T("edit")}
                        </>
                      )}
                    </button>
                  </div>
                </div>
                {editing === "personal" ? (
                  <div className="animate-[slideDown_0.3s_ease-out] space-y-3.5 p-5">
                    <div>
                      <label className={LABEL}>{T("phoneNumber")}</label>
                      <div
                        className={`${INPUT} flex cursor-not-allowed items-center bg-gray-100 text-gray-400 select-none`}
                      >
                        {user?.phone || "—"}
                      </div>
                      <p className="mt-1 text-[10px] text-gray-400">
                        Phone number cannot be changed here. Contact support to update it.
                      </p>
                    </div>
                    <div>
                      <label className={LABEL}>{T("fullNameRequired")}</label>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={T("enterFullName")}
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <label className={LABEL}>{T("emailAddress")}</label>
                      <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        type="email"
                        inputMode="email"
                        placeholder="email@example.com"
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <label className={LABEL}>{T("cnicNationalId")}</label>
                      <input
                        value={cnic}
                        onChange={(e) => setCnic(e.target.value)}
                        inputMode="numeric"
                        placeholder="XXXXX-XXXXXXX-X"
                        className={INPUT}
                      />
                      <p className="mt-1 text-[10px] text-gray-400">{T("cnicFormatHint")}</p>
                    </div>
                    <div>
                      <label className={LABEL}>{T("cityLabel")}</label>
                      <select
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className={SELECT}
                      >
                        <option value="">{T("selectCity")}</option>
                        {CITIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL}>{T("homeAddress")}</label>
                      <input
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder={T("addressPlaceholder")}
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <label className={LABEL}>{T("emergencyContactLabel")}</label>
                      <input
                        value={emergency}
                        onChange={(e) => setEmergency(e.target.value)}
                        inputMode="tel"
                        placeholder={T("emergencyPlaceholder")}
                        className={INPUT}
                      />
                    </div>
                    <button
                      onClick={() => saveSection("personal")}
                      disabled={saving}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gray-900 font-bold text-white shadow-sm transition-colors active:bg-gray-800 disabled:opacity-60"
                    >
                      {saving ? (
                        <>
                          <RefreshCcw size={15} className="animate-spin" /> {T("saving")}
                        </>
                      ) : (
                        <>
                          <CheckCircle size={15} /> {T("saveChangesBtn")}
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="py-1">
                    <InfoRow
                      label={T("fullName")}
                      value={user?.name}
                      empty={T("notSet")}
                      icon={<User size={12} className="text-gray-500" />}
                    />
                    <InfoRow
                      label={T("phoneNumber")}
                      value={user?.phone}
                      empty={T("notSet")}
                      icon={<Phone size={12} className="text-blue-500" />}
                    />
                    <InfoRow
                      label={T("emailAddress")}
                      value={user?.email}
                      empty={T("notSet")}
                      icon={<Mail size={12} className="text-purple-500" />}
                    />
                    <InfoRow
                      label={T("cnicNationalId")}
                      value={user?.cnic}
                      empty={T("notSet")}
                      icon={<FileText size={12} className="text-amber-500" />}
                    />
                    <InfoRow
                      label={T("cityLabel")}
                      value={user?.city}
                      empty={T("notSet")}
                      icon={<MapPin size={12} className="text-red-500" />}
                    />
                    <InfoRow
                      label={T("homeAddress")}
                      value={user?.address}
                      empty={T("notSet")}
                      icon={<Home size={12} className="text-teal-500" />}
                    />
                    <InfoRow
                      label={T("emergencyContactLabel")}
                      value={user?.emergencyContact}
                      empty={T("notSet")}
                      icon={<Phone size={12} className="text-orange-500" />}
                    />

                    {/* KYC Verification Status card */}
                    {(() => {
                      const kycStatus =
                        (user as { kycStatus?: string } | null)?.kycStatus ?? "none";
                      const cnicDocUrl = (user as { cnicDocUrl?: string } | null)?.cnicDocUrl;
                      const cnicBackDocUrl = (user as { cnicBackDocUrl?: string } | null)
                        ?.cnicBackDocUrl;
                      const licenseDocUrl = (user as { licenseDocUrl?: string } | null)
                        ?.licenseDocUrl;
                      const vehiclePhotoUrl = user?.vehiclePhoto;
                      const statusConfig = {
                        verified: {
                          bg: "bg-green-50 border-green-200",
                          badge: "bg-green-100 text-green-700",
                          icon: "✓",
                          label: "Verified",
                        },
                        pending: {
                          bg: "bg-amber-50 border-amber-200",
                          badge: "bg-amber-100 text-amber-700",
                          icon: "⏳",
                          label: "Under Review",
                        },
                        rejected: {
                          bg: "bg-red-50 border-red-200",
                          badge: "bg-red-100 text-red-600",
                          icon: "✗",
                          label: "Rejected",
                        },
                        none: {
                          bg: "bg-gray-50 border-gray-200",
                          badge: "bg-gray-100 text-gray-600",
                          icon: "?",
                          label: "Not Submitted",
                        },
                      }[kycStatus] ?? {
                        bg: "bg-gray-50 border-gray-200",
                        badge: "bg-gray-100 text-gray-600",
                        icon: "?",
                        label: kycStatus,
                      };

                      const docs = [
                        { label: "CNIC Front", done: !!cnicDocUrl },
                        { label: "CNIC Back", done: !!cnicBackDocUrl },
                        { label: "License", done: !!licenseDocUrl },
                        { label: "Vehicle", done: !!vehiclePhotoUrl },
                      ];

                      const canRequest = kycStatus === "none" || kycStatus === "rejected";
                      const hasDocs = !!(cnicDocUrl || licenseDocUrl || vehiclePhotoUrl);

                      return (
                        <div className={`mx-4 my-3 rounded-2xl border p-3.5 ${statusConfig.bg}`}>
                          <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Shield size={14} className="text-gray-600" />
                              <p className="text-xs font-bold text-gray-700">Verification Status</p>
                            </div>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${statusConfig.badge}`}
                            >
                              {statusConfig.icon} {statusConfig.label}
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-1.5">
                            {docs.map((d) => (
                              <div
                                key={d.label}
                                className={`rounded-xl py-1.5 text-center text-[9px] font-semibold ${
                                  d.done
                                    ? "bg-green-100 text-green-700"
                                    : "bg-gray-100 text-gray-400"
                                }`}
                              >
                                <div className="mb-0.5 text-sm">{d.done ? "✓" : "—"}</div>
                                {d.label}
                              </div>
                            ))}
                          </div>
                          {kycStatus === "rejected" && (
                            <p className="mt-2 text-[10px] font-medium text-red-600">
                              {(user as { rejectionReason?: string } | null)?.rejectionReason
                                ? `Rejected: ${(user as { rejectionReason?: string }).rejectionReason}`
                                : "Your documents were rejected. Please re-upload in the Vehicle tab."}
                            </p>
                          )}
                          {kycStatus === "none" && (
                            <p className="mt-2 text-[10px] text-gray-500">
                              Upload your CNIC, driving licence, and vehicle photo to start KYC.
                            </p>
                          )}
                          {canRequest && hasDocs && (
                            <button
                              onClick={() => kycMut.mutate()}
                              disabled={kycMut.isPending}
                              className="mt-2.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-xs font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                            >
                              {kycMut.isPending ? (
                                <>
                                  <Clock size={12} className="animate-spin" /> Submitting…
                                </>
                              ) : (
                                <>
                                  <Shield size={12} /> Request KYC Review
                                </>
                              )}
                            </button>
                          )}
                          {kycMut.isError && (
                            <p className="mt-1.5 text-center text-[10px] text-red-500">
                              {(kycMut.error as Error)?.message ?? "Failed to submit KYC request"}
                            </p>
                          )}
                          {kycMut.isSuccess && (
                            <p className="mt-1.5 text-center text-[10px] font-semibold text-blue-600">
                              Request submitted — your documents are under review.
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {activeTab === "vehicle" && (
              <div className="animate-[fadeIn_0.25s_ease-out]">
                <div className="flex items-center justify-between border-b border-gray-50 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Bike size={15} className="text-gray-900" />
                    <div>
                      <p className="text-[14px] font-bold text-gray-900">{T("vehicleDetails")}</p>
                      <p className="text-[10px] text-gray-400">{T("yourDeliveryVehicle")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <SavedCheckmark show={savedSection === "vehicle"} label={T("savedFeedback")} />
                    <button
                      onClick={() =>
                        editing === "vehicle" ? cancelEdit("vehicle") : startEdit("vehicle")
                      }
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold transition-all ${
                        editing === "vehicle"
                          ? "bg-gray-100 text-gray-600"
                          : "bg-gray-100 text-gray-900 active:bg-gray-200"
                      }`}
                    >
                      {editing === "vehicle" ? (
                        <>
                          <span className="text-xs">✕</span> {T("cancel")}
                        </>
                      ) : (
                        <>
                          <Pencil size={12} /> {T("edit")}
                        </>
                      )}
                    </button>
                  </div>
                </div>
                {editing === "vehicle" ? (
                  <div className="animate-[slideDown_0.3s_ease-out] space-y-3.5 p-5">
                    <div>
                      <label className={LABEL}>{T("vehicleTypeRequired")}</label>
                      <select
                        value={vehicleType}
                        onChange={(e) => setVehicleType(e.target.value)}
                        className={SELECT}
                      >
                        <option value="">{T("selectVehicle")}</option>
                        {VEHICLES.map((v) => (
                          <option key={v} value={v}>
                            {VEHICLE_LABELS[v] ?? v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL}>{T("vehiclePlateRequired")}</label>
                      <input
                        value={vehiclePlate}
                        onChange={(e) => setVehiclePlate(e.target.value)}
                        placeholder="ABC-1234"
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Vehicle Registration No.</label>
                      <input
                        value={vehicleRegNo}
                        onChange={(e) => setVehicleRegNo(e.target.value)}
                        placeholder="REG-12345"
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Driving License No.</label>
                      <input
                        value={drivingLicense}
                        onChange={(e) => setDrivingLicense(e.target.value)}
                        placeholder="DL-12345678"
                        className={INPUT}
                      />
                    </div>
                    {/* Document photo uploads — CNIC, License, Registration, and Vehicle photos */}
                    <div className="space-y-2 pt-1">
                      <p className="text-[11px] font-bold tracking-wider text-gray-500 uppercase">
                        Document Photos (for verification)
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {/* CNIC photo upload */}
                        <div className="relative">
                          <input
                            ref={cnicDocInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => handleDocUpload(e, "cnic")}
                          />
                          <button
                            type="button"
                            onClick={() => cnicDocInputRef.current?.click()}
                            disabled={docUploading === "cnic"}
                            className="flex h-16 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-200 transition-all active:bg-gray-50 disabled:opacity-60"
                          >
                            {docUploading === "cnic" ? (
                              <>
                                <RefreshCcw size={14} className="animate-spin text-gray-400" />
                                <span className="text-[10px] text-gray-400">Uploading...</span>
                              </>
                            ) : (
                              <>
                                <Camera size={14} className="text-gray-400" />
                                <span className="text-[10px] font-semibold text-gray-500">
                                  CNIC Photo
                                </span>
                              </>
                            )}
                          </button>
                          {user?.cnicDocUrl && (
                            <CheckCircle
                              size={12}
                              className="absolute top-1 right-1 text-green-500"
                            />
                          )}
                        </div>
                        {/* Driving license photo upload */}
                        <div className="relative">
                          <input
                            ref={licenseDocInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => handleDocUpload(e, "license")}
                          />
                          <button
                            type="button"
                            onClick={() => licenseDocInputRef.current?.click()}
                            disabled={docUploading === "license"}
                            className="flex h-16 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-200 transition-all active:bg-gray-50 disabled:opacity-60"
                          >
                            {docUploading === "license" ? (
                              <>
                                <RefreshCcw size={14} className="animate-spin text-gray-400" />
                                <span className="text-[10px] text-gray-400">Uploading...</span>
                              </>
                            ) : (
                              <>
                                <Camera size={14} className="text-gray-400" />
                                <span className="text-[10px] font-semibold text-gray-500">
                                  License Photo
                                </span>
                              </>
                            )}
                          </button>
                          {user?.licenseDocUrl && (
                            <CheckCircle
                              size={12}
                              className="absolute top-1 right-1 text-green-500"
                            />
                          )}
                        </div>
                        {/* Vehicle registration document photo upload */}
                        <div className="relative">
                          <input
                            ref={regDocInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => handleDocUpload(e, "regDoc")}
                          />
                          <button
                            type="button"
                            onClick={() => regDocInputRef.current?.click()}
                            disabled={docUploading === "regDoc"}
                            className="flex h-16 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-200 transition-all active:bg-gray-50 disabled:opacity-60"
                          >
                            {docUploading === "regDoc" ? (
                              <>
                                <RefreshCcw size={14} className="animate-spin text-gray-400" />
                                <span className="text-[10px] text-gray-400">Uploading...</span>
                              </>
                            ) : (
                              <>
                                <Camera size={14} className="text-gray-400" />
                                <span className="text-[10px] font-semibold text-gray-500">
                                  Reg. Document
                                </span>
                              </>
                            )}
                          </button>
                          {user?.regDocUrl && (
                            <CheckCircle
                              size={12}
                              className="absolute top-1 right-1 text-green-500"
                            />
                          )}
                        </div>
                        {/* Vehicle photo upload */}
                        <div className="relative">
                          <input
                            ref={vehiclePhotoInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => handleDocUpload(e, "vehiclePhoto")}
                          />
                          <button
                            type="button"
                            onClick={() => vehiclePhotoInputRef.current?.click()}
                            disabled={docUploading === "vehiclePhoto"}
                            className="flex h-16 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-200 transition-all active:bg-gray-50 disabled:opacity-60"
                          >
                            {docUploading === "vehiclePhoto" ? (
                              <>
                                <RefreshCcw size={14} className="animate-spin text-gray-400" />
                                <span className="text-[10px] text-gray-400">Uploading...</span>
                              </>
                            ) : (
                              <>
                                <Camera size={14} className="text-gray-400" />
                                <span className="text-[10px] font-semibold text-gray-500">
                                  Vehicle Photo
                                </span>
                              </>
                            )}
                          </button>
                          {user?.vehiclePhoto && (
                            <CheckCircle
                              size={12}
                              className="absolute top-1 right-1 text-green-500"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => saveSection("vehicle")}
                      disabled={saving}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gray-900 font-bold text-white shadow-sm transition-colors active:bg-gray-800 disabled:opacity-60"
                    >
                      {saving ? (
                        <>
                          <RefreshCcw size={15} className="animate-spin" /> {T("saving")}
                        </>
                      ) : (
                        <>
                          <CheckCircle size={15} /> {T("saveChangesBtn")}
                        </>
                      )}
                    </button>
                  </div>
                ) : user?.vehicleType ? (
                  <div className="p-4">
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-gray-800 to-gray-900 p-4 text-white">
                      <div className="absolute top-0 right-0 h-20 w-20 translate-x-1/2 -translate-y-1/2 rounded-full bg-white/5" />
                      <div className="mb-4 flex items-center justify-between">
                        <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                          {T("registeredVehicle")}
                        </span>
                        <Bike size={18} className="text-green-400" />
                      </div>
                      <p className="mb-1 text-xl font-extrabold tracking-wide">
                        {user.vehiclePlate || "---"}
                      </p>
                      <p className="text-sm font-medium text-gray-300">{user.vehicleType}</p>
                      <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-gray-400">{T("plateNumber")}</span>
                          <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-bold text-green-400">
                            <CheckCircle size={9} /> {T("activeVerified")}
                          </span>
                        </div>
                        {user.vehicleRegNo && (
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-gray-400">Reg. No.</span>
                            <span className="text-[10px] font-medium text-gray-300">
                              {user.vehicleRegNo}
                            </span>
                          </div>
                        )}
                        {user.drivingLicense && (
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-gray-400">License</span>
                            <span className="text-[10px] font-medium text-gray-300">
                              {user.drivingLicense}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50">
                      <Bike size={28} className="text-gray-200" />
                    </div>
                    <p className="text-sm font-bold text-gray-600">{T("noVehicle")}</p>
                    <p className="mt-1 text-xs text-gray-400">{T("addVehicleInfo")}</p>
                    <button
                      onClick={() => startEdit("vehicle")}
                      className="mt-3 rounded-xl bg-gray-100 px-5 py-2 text-sm font-bold text-gray-900 transition-colors active:bg-gray-200"
                    >
                      + {T("addVehicle")}
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === "bank" && (
              <div className="animate-[fadeIn_0.25s_ease-out]">
                <div className="flex items-center justify-between border-b border-gray-50 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Landmark size={15} className="text-gray-900" />
                    <div>
                      <p className="text-[14px] font-bold text-gray-900">{T("bankDetails")}</p>
                      <p className="text-[10px] text-gray-400">{T("withdrawalAccount")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <SavedCheckmark show={savedSection === "bank"} label={T("savedFeedback")} />
                    <button
                      onClick={() => (editing === "bank" ? cancelEdit("bank") : startEdit("bank"))}
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold transition-all ${
                        editing === "bank"
                          ? "bg-gray-100 text-gray-600"
                          : "bg-gray-100 text-gray-900 active:bg-gray-200"
                      }`}
                    >
                      {editing === "bank" ? (
                        <>
                          <span className="text-xs">✕</span> {T("cancel")}
                        </>
                      ) : (
                        <>
                          <Pencil size={12} /> {T("edit")}
                        </>
                      )}
                    </button>
                  </div>
                </div>
                {editing === "bank" ? (
                  <div className="animate-[slideDown_0.3s_ease-out] space-y-3.5 p-5">
                    <div>
                      <label className={LABEL}>{T("selectBank")}</label>
                      <select
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        className={SELECT}
                      >
                        <option value="">{T("selectBank")}</option>
                        {BANKS.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL}>{T("accountNoRequired")}</label>
                      <input
                        value={bankAccount}
                        onChange={(e) => setBankAccount(e.target.value)}
                        inputMode="numeric"
                        placeholder={T("bankAccPlaceholder")}
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <label className={LABEL}>{T("accountTitle")} *</label>
                      <input
                        value={bankAccountTitle}
                        onChange={(e) => setBankAccountTitle(e.target.value)}
                        placeholder={T("enterFullName")}
                        className={INPUT}
                      />
                    </div>
                    <div className="flex gap-2 rounded-xl border border-amber-100 bg-amber-50 p-3">
                      <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-500" />
                      <p className="text-xs font-medium text-amber-700">{T("bankMobileWallet")}</p>
                    </div>
                    <button
                      onClick={() => saveSection("bank")}
                      disabled={saving}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gray-900 font-bold text-white shadow-sm transition-colors active:bg-gray-800 disabled:opacity-60"
                    >
                      {saving ? (
                        <>
                          <RefreshCcw size={15} className="animate-spin" /> {T("saving")}
                        </>
                      ) : (
                        <>
                          <CheckCircle size={15} /> {T("saveChangesBtn")}
                        </>
                      )}
                    </button>
                  </div>
                ) : user?.bankName ? (
                  <div className="p-4">
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 p-4 text-white">
                      <div className="absolute top-0 right-0 h-24 w-24 translate-x-1/2 -translate-y-1/2 rounded-full bg-white/5" />
                      <div className="absolute bottom-0 left-0 h-16 w-16 -translate-x-1/2 translate-y-1/2 rounded-full bg-white/5" />
                      <div className="mb-4 flex items-center justify-between">
                        <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase">
                          {T("paymentAccount")}
                        </span>
                        <CreditCard size={18} className="text-green-300" />
                      </div>
                      <p className="mb-1 font-mono text-lg font-bold tracking-wider">
                        {maskAccount(user.bankAccount || "")}
                      </p>
                      <p className="text-sm font-medium text-gray-300">{user.bankName}</p>
                      {user.bankAccountTitle && (
                        <p className="mt-1 text-xs text-gray-400">{user.bankAccountTitle}</p>
                      )}
                      <div className="mt-3 flex items-center justify-between border-t border-white/15 pt-3">
                        <span className="text-[10px] text-gray-400">{T("accountTitle")}</span>
                        <span className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold text-white">
                          <CheckCircle size={9} /> {T("activeVerified")}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50">
                      <Landmark size={28} className="text-gray-200" />
                    </div>
                    <p className="text-sm font-bold text-gray-600">{T("noWithdrawalAccount")}</p>
                    <p className="mt-1 text-xs text-gray-400">{T("addVehicleInfo")}</p>
                    <button
                      onClick={() => startEdit("bank")}
                      className="mt-3 rounded-xl bg-gray-100 px-5 py-2 text-sm font-bold text-gray-900 transition-colors active:bg-gray-200"
                    >
                      + {T("addAccount")}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <ProfileSettings
          language={language}
          setLanguage={setLanguage}
          isDark={isDark}
          toggleDark={toggleDark}
          unread={unread}
        />

        <div className="animate-[slideUp_0.75s_ease-out] overflow-hidden rounded-3xl bg-gray-900">
          <button
            onClick={() => setPayoutOpen(!payoutOpen)}
            className="flex w-full items-center justify-between px-5 py-4 transition-colors active:bg-gray-800"
          >
            <p className="flex items-center gap-2 text-[15px] font-bold text-white">
              <Info size={15} className="text-white/50" /> {T("payoutPolicyLabel")}
            </p>
            <ChevronDown
              size={18}
              className={`text-white/50 transition-transform duration-300 ${payoutOpen ? "rotate-180" : ""}`}
            />
          </button>
          <div
            className={`overflow-hidden transition-all duration-300 ${payoutOpen ? "max-h-60 opacity-100" : "max-h-0 opacity-0"}`}
          >
            <div className="space-y-2.5 px-5 pb-4">
              {[
                {
                  icon: <CheckCircle size={13} />,
                  text: T("payoutEarningsPct")
                    .replace("{keepPct}", String(riderKeepPct))
                    .replace("{feePct}", String(100 - riderKeepPct)),
                },
                {
                  icon: <CreditCard size={13} />,
                  text: T("payoutMinWithdrawal").replace(
                    "{amount}",
                    String(config.rider?.minPayout ?? 500)
                  ),
                },
                { icon: <Clock size={13} />, text: T("payoutProcessingTime") },
                { icon: <Lock size={13} />, text: T("payoutVerificationReq") },
              ].map((p, i) => (
                <div key={i} className="flex items-start gap-2.5 text-xs text-white/60">
                  <span className="mt-0.5 text-green-400">{p.icon}</span>
                  <span className="font-medium">{p.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <ProfilePenaltyHistory currency={currency} />

        <ProfileReviews language={language} currency={currency} />

        <button
          onClick={handleLogout}
          className={`flex h-12 w-full items-center justify-center gap-2 rounded-3xl text-sm font-bold transition-all duration-300 ${
            logoutConfirm
              ? "bg-red-600 text-white shadow-md active:bg-red-700"
              : "border-2 border-red-200 text-red-500 active:bg-red-50"
          }`}
        >
          <LogOut size={16} />
          {logoutConfirm ? T("tapAgainLogout") : T("logoutFromDevice")}
        </button>

        <ProfileFooter config={config} language={language} />
      </div>
    </div>
  );
}
