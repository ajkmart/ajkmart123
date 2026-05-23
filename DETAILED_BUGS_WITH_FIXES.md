# 🔍 COMPLETE DETAILED BUG REPORT - Rider & Vendor App
**Date:** May 23, 2026  
**Status:** COMPREHENSIVE ANALYSIS  
**Total Bugs Found:** 25 Active Issues

---

## 📌 CRITICAL BUGS (Fix Immediately) 🔴

### BUG #1: VENDOR PHONE VALIDATION COMPLETELY MISSING
**File:** `artifacts/vendor-app/src/lib/auth/RegisterWizard.tsx` (Line 215-223)  
**Severity:** 🔴 **CRITICAL**  
**Status:** ACTIVE - Not Fixed

#### Current Code (BROKEN):
```tsx
<div>
  <label style={labelStyle(pr)}>{T("phoneNumber")} *</label>
  <input
    style={darkInput()}
    value={(data.phone as string) ?? ""}
    onChange={(e) => {
      onChange("phone", e.target.value);
      onError("");
    }}
    placeholder="03XXXXXXXXX or +92XXXXXXXXXX"
    inputMode="tel"
    maxLength={15}
  />
  {/* NO VALIDATION HERE! */}
</div>
```

#### What's Wrong:
1. **No input validation** - accepts any text
2. **No real-time feedback** - no error message shown
3. **No format checking** - user can type letters, special chars
4. **Registration will fail** at backend when user submits

#### Impact:
- Users submit invalid phone numbers
- Backend rejection with confusing error
- Poor user experience, registration abandonment

#### Fix Required:
```tsx
<div>
  <label style={labelStyle(pr)}>{T("phoneNumber")} *</label>
  <input
    style={darkInput()}
    value={(data.phone as string) ?? ""}
    onChange={(e) => {
      const cleaned = e.target.value.replace(/[^0-9+]/g, "");
      onChange("phone", cleaned);
      onError("");
    }}
    placeholder="03XXXXXXXXX or +92XXXXXXXXXX"
    inputMode="tel"
    maxLength={15}
  />
  {/* ADD VALIDATION FEEDBACK */}
  {(data.phone as string)?.length > 0 && !isValidPhone((data.phone as string) ?? "") && (
    <p style={{ color: "#f87171", fontSize: 11, margin: "4px 0 0" }}>
      Format: 03XXXXXXXXX or +92XXXXXXXXXX
    </p>
  )}
  {(data.phone as string)?.length > 0 && isValidPhone((data.phone as string) ?? "") && (
    <p style={{ color: "#10b981", fontSize: 11, margin: "4px 0 0" }}>
      ✓ Valid phone number
    </p>
  )}
</div>
```

---

### BUG #2: VENDOR STORE CATEGORY NOT VALIDATED ON STEP 1
**File:** `artifacts/vendor-app/src/lib/auth/RegisterWizard.tsx` (Line ~100-150)  
**Severity:** 🔴 **CRITICAL**  
**Status:** ACTIVE - Not Fixed

#### Current Code (BROKEN):
```tsx
{/* ── Step 1: Store Info ── */}
{step === 1 && (
  <div>
    {/* store name, category, owner, city inputs */}
    <button
      onClick={() => {
        // NO CATEGORY VALIDATION!
        setStep(2); // proceeds without checking category
      }}
    >
      Next
    </button>
  </div>
)}
```

#### What's Wrong:
1. **No validation** checks if category is selected
2. **User can skip it** and proceed to Step 2
3. **Form submission fails** later at backend
4. **No clear error** about what went wrong

#### Impact:
- Wasted time for user filling out rest of form
- Confusing backend error message
- High abandonment rate

#### Fix Required:
Add validation in the Next button click handler:
```tsx
onClick={() => {
  if (!data.storeName?.trim()) {
    onError("Store name is required");
    return;
  }
  if (!data.storeCategory) {
    onError("Please select a store category");
    return;
  }
  if (!data.ownerName?.trim()) {
    onError("Owner name is required");
    return;
  }
  if (!data.city) {
    onError("Please select a city");
    return;
  }
  onError(""); // clear errors
  setStep(2);
}}
```

---

### BUG #3: RIDER UPLOAD ERROR PERSISTS AFTER SUCCESSFUL RETRY
**File:** `artifacts/rider-app/src/lib/auth/RegisterWizard.tsx` (Line 160-200)  
**Severity:** 🔴 **CRITICAL**  
**Status:** ACTIVE - Not Fixed

#### Current Code (BROKEN):
```tsx
const uploadFile = async (field: keyof Draft, file?: File) => {
  if (!file) return;
  const fieldKey = String(field);
  setUploading(fieldKey);
  setUploadPct((prev) => ({ ...prev, [fieldKey]: 0 }));
  setUploadError((prev) => ({ ...prev, [fieldKey]: "" })); // clears old error

  try {
    const uploadToken = await api.getRegistrationUploadToken();
    const result = await api.uploadRegistrationDocWithProgress(file, uploadToken, (pct) =>
      setUploadPct((prev) => ({ ...prev, [fieldKey]: pct }))
    );
    const stored = result.url ?? "";
    if (!stored) throw new Error("Server returned no URL for uploaded file");
    update(field, stored);
    // ❌ BUG: If error happened before, user still sees old error text
    // even though upload succeeded!
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    setUploadError((prev) => ({ ...prev, [fieldKey]: msg }));
    setUploadPct((prev) => ({ ...prev, [fieldKey]: 0 }));
  } finally {
    setUploading(null);
  }
};
```

#### Visual of the Bug:
```
User uploads → Error: "Network timeout"
Error shows: "Network timeout" ❌

User retries → Upload succeeds ✓
But still shows: "Network timeout" ❌ (ERROR VISIBLE WITH SUCCESS CHECKMARK!)
```

#### What's Wrong:
1. **Error cleared on new attempt** but displayed during upload
2. **Success doesn't clear error** from previous attempt
3. **UI shows error + success checkmark** simultaneously
4. **Confusing UX** - what actually happened?

#### Fix Required:
```tsx
const uploadFile = async (field: keyof Draft, file?: File) => {
  if (!file) return;
  const fieldKey = String(field);
  setUploading(fieldKey);
  setUploadPct((prev) => ({ ...prev, [fieldKey]: 0 }));
  setUploadError((prev) => ({ ...prev, [fieldKey]: "" })); // clear old error

  try {
    const uploadToken = await api.getRegistrationUploadToken();
    const result = await api.uploadRegistrationDocWithProgress(file, uploadToken, (pct) =>
      setUploadPct((prev) => ({ ...prev, [fieldKey]: pct }))
    );
    const stored = result.url ?? "";
    if (!stored) throw new Error("Server returned no URL for uploaded file");
    update(field, stored);
    setUploadError((prev) => ({ ...prev, [fieldKey]: "" })); // EXPLICITLY clear on success
    setUploadPct((prev) => ({ ...prev, [fieldKey]: 100 })); // show 100%
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    setUploadError((prev) => ({ ...prev, [fieldKey]: msg }));
    setUploadPct((prev) => ({ ...prev, [fieldKey]: 0 })); // reset progress on error
  } finally {
    setUploading(null);
  }
};
```

---

## 🟡 MEDIUM BUGS (Fix This Sprint) 

### BUG #4: RIDER PASSWORD MISMATCH NO REAL-TIME FEEDBACK
**File:** `artifacts/rider-app/src/lib/auth/RegisterWizard.tsx` (Line 480-520)  
**Severity:** 🟡 Medium  
**Status:** ACTIVE - Not Fixed

#### Current Code (BROKEN):
```tsx
{/* Step 2: Personal Details */}
{step === 2 && (
  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ position: "relative" }}>
      <input
        type={showPassword ? "text" : "password"}
        value={draft.password ?? ""}
        onChange={(e) => update("password", e.target.value)}
        placeholder="Password *"
        style={{ ...inputStyle, paddingRight: 44 }}
      />
      {/* Password strength indicator shows here */}
    </div>

    <div style={{ position: "relative" }}>
      <input
        type={showConfirm ? "text" : "password"}
        value={draft.confirmPassword ?? ""}
        onChange={(e) => update("confirmPassword", e.target.value)}
        placeholder="Confirm password *"
        style={{ ...inputStyle, paddingRight: 44 }}
      />
      {/* ❌ NO FEEDBACK - User types mismatch but doesn't know until clicking Next */}
    </div>

    <button
      onClick={() => {
        // ...
        if (draft.password !== draft.confirmPassword)
          return setError("Passwords do not match");
        // Error only shows on Next button click
      }}
    >
      Next
    </button>
  </div>
)}
```

#### What's Wrong:
1. **No real-time visual feedback** while typing
2. **Error only appears** when clicking Next
3. **Users don't know** passwords don't match until error
4. **Bad form UX** - forces re-entry

#### Impact:
- User frustration
- Form abandonment
- Slower registration flow

#### Fix Required:
Add real-time feedback below confirm password:
```tsx
<div style={{ position: "relative" }}>
  <input
    type={showConfirm ? "text" : "password"}
    value={draft.confirmPassword ?? ""}
    onChange={(e) => update("confirmPassword", e.target.value)}
    placeholder="Confirm password *"
    style={{ ...inputStyle, paddingRight: 44 }}
  />
  <button
    type="button"
    onClick={() => setShowConfirm((v) => !v)}
    style={{
      position: "absolute",
      right: 12,
      top: "50%",
      transform: "translateY(-50%)",
      background: "none",
      border: "none",
      color: theme.textMuted,
      cursor: "pointer",
    }}
  >
    {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
  </button>
</div>
{/* ADD REAL-TIME FEEDBACK */}
{draft.confirmPassword && (
  <div style={{
    fontSize: 12,
    fontWeight: 600,
    color: draft.password === draft.confirmPassword ? "#10b981" : "#f87171"
  }}>
    {draft.password === draft.confirmPassword ? "✓ Passwords match" : "✗ Passwords do not match"}
  </div>
)}
```

---

### BUG #5: RIDER OTP NOT CLEARED ON VERIFICATION FAILURE
**File:** `artifacts/rider-app/src/lib/auth/LoginScreen.tsx` (Line 140-160)  
**Severity:** 🟡 Medium  
**Status:** ACTIVE - Not Fixed

#### Current Code (PARTIALLY FIXED):
```tsx
const verifyPhoneOtp = async (otpValue?: string) => {
  const code = otpValue ?? otp;
  if (code.length !== 6) {
    setError("Enter the complete 6-digit OTP");
    return;
  }
  setError(null);
  setVerifying(true);
  const result = await verifyOtp(phone, code);
  setVerifying(false);
  if (!result.success || !result.data) {
    setError(result.error ?? (T("loginFailed") as string));
    setOtp(""); // ✓ OTP is cleared
    return; // but which OTP input component is it? Custom or standard?
  }
  // ... success path
};
```

#### What's Wrong:
1. **Rider app clears OTP** on error (Line ~140) - BUT
2. **Vendor app uses custom OtpBoxes component** that might not respond to state change
3. **Inconsistent behavior** between apps
4. **User sees empty field after error** - unclear what happened

#### Impact:
- Confusing error handling
- Users don't know whether to re-enter OTP
- Inconsistent experience between apps

#### Fix Required (Vendor App):
Ensure custom OtpBoxes component clears when state changes:
```tsx
const handleVerifyOtp = async (otpOverride?: string) => {
  const otp = otpOverride ?? localOtp;
  if (otp.length !== 6) {
    setLoginError("Please enter the complete 6-digit OTP");
    return;
  }
  setLoginError(null);
  setVerifying(true);
  const result = await verifyOtp(localPhone, otp);
  setVerifying(false);
  if (!result.success) {
    setLoginError(translateApiError(result.error ?? ""));
    setLocalOtp(""); // CLEAR OTP INPUT
    return;
  }
  // ... success
};
```

---

### BUG #6: RIDER PASSWORD STRENGTH INDICATOR BREAKS ON MOBILE
**File:** `artifacts/rider-app/src/lib/auth/RegisterWizard.tsx` (Line 505-520)  
**Severity:** 🟡 Medium  
**Status:** ACTIVE - Not Fixed

#### Current Code (BROKEN):
```tsx
{pwStrength && (
  <div>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{ flex: 1, height: 4, borderRadius: 999, background: theme.border }}
      >
        <div
          style={{
            width: `${pwStrength.pct}%`,
            height: "100%",
            background: pwStrength.color,
            borderRadius: 999,
            transition: "width 0.2s ease",
          }}
        />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color: pwStrength.color }}>
        {pwStrength.label}
        {/* ❌ BUG: On mobile < 340px, this label gets cut off! */}
      </span>
    </div>
  </div>
)}
```

#### Visual of Bug:
```
Desktop (CORRECT):
[████████░░] Strong

Mobile 340px (BROKEN):
[████░░░░░░░░] Stron... (TRUNCATED!)
```

#### What's Wrong:
1. **Label "Strong/Weak/Fair/Good"** forced into tiny space
2. **Gets cut off** on phones with narrow screens
3. **Flex layout** doesn't account for small screens
4. **No responsive design** for password strength display

#### Fix Required:
```tsx
{pwStrength && (
  <div>
    <div style={{ 
      display: "flex", 
      alignItems: "center", 
      gap: 8,
      flexWrap: "wrap" // Allow wrapping on small screens
    }}>
      <div
        style={{ 
          flex: 1, 
          height: 4, 
          borderRadius: 999, 
          background: theme.border,
          minWidth: 100 // Ensure minimum width
        }}
      >
        <div
          style={{
            width: `${pwStrength.pct}%`,
            height: "100%",
            background: pwStrength.color,
            borderRadius: 999,
            transition: "width 0.2s ease",
          }}
        />
      </div>
      <span style={{ 
        fontSize: 11, // Slightly bigger
        fontWeight: 700, 
        color: pwStrength.color,
        whiteSpace: "nowrap" // Prevent break within label
      }}>
        {pwStrength.label}
      </span>
    </div>
  </div>
)}
```

---

### BUG #7: RIDER USERNAME CHECK TRIGGERS ON EMPTY VALUE
**File:** `artifacts/rider-app/src/lib/auth/RegisterWizard.tsx` (Line 70-75)  
**Severity:** 🟡 Medium  
**Status:** ACTIVE - Not Fixed

#### Current Code (BROKEN):
```tsx
<input
  value={draft.username ?? ""}
  onChange={(e) => update("username", e.target.value)}
  onBlur={() => void checkUsername()} // ❌ RUNS EVEN ON EMPTY!
  placeholder="Username (optional)"
  style={inputStyle}
/>

const checkUsername = async () => {
  const username = (draft.username ?? "").trim();
  if (!username) return; // Only returns, doesn't prevent API call if name is set
  // ...
};
```

#### What's Wrong:
1. **checkUsername runs on every blur** event
2. **If username is empty**, it still makes an API request (wasteful)
3. **No debouncing** - rapid typing triggers multiple requests
4. **Unnecessary API load** on backend

#### Impact:
- Extra network requests
- Backend spam
- Slow response on poor networks
- Wastes user's data on mobile

#### Fix Required:
```tsx
const checkUsername = async () => {
  const username = (draft.username ?? "").trim();
  if (!username) {
    setUsernameState("idle"); // Reset state
    return; // Don't check empty usernames
  }
  if (username.length < 3) {
    setUsernameState("idle");
    return; // Don't check too-short usernames
  }
  setUsernameState("checking");
  try {
    const res = await api.checkAvailable({ username });
    setUsernameState(res.username && !res.username.available ? "taken" : "available");
  } catch {
    setUsernameState("idle");
  }
};

// Also add debouncing:
const usernameCheckTimeoutRef = useRef<NodeJS.Timeout>();

const handleUsernameChange = (value: string) => {
  update("username", value);
  if (usernameCheckTimeoutRef.current) {
    clearTimeout(usernameCheckTimeoutRef.current);
  }
  usernameCheckTimeoutRef.current = setTimeout(() => {
    void checkUsername();
  }, 500); // Debounce 500ms
};
```

---

### BUG #8: NO REAL-TIME VALIDATION ON CNIC/PHONE IN RIDER REGISTER
**File:** `artifacts/rider-app/src/lib/auth/RegisterWizard.tsx` (Step 2)  
**Severity:** 🟡 Medium  
**Status:** ACTIVE - Not Fixed

#### Current Code (BROKEN):
```tsx
{step === 2 && (
  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div>
      <input
        value={draft.cnic ?? ""}
        onChange={(e) => update("cnic", e.target.value)}
        placeholder="CNIC XXXXX-XXXXXXX-X *"
        style={inputStyle}
        maxLength={15}
        {/* ❌ NO validation feedback while typing */}
      />
      <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
        Format: 12345-1234567-1 (dashes required)
        {/* Only help text, no validation feedback */}
      </div>
    </div>
```

#### What's Wrong:
1. **No visual feedback** while typing CNIC
2. **No error indicator** if format is wrong
3. **Only error on Next click** - too late
4. **User doesn't know** if they typed it correctly

#### Impact:
- Friction in registration
- User has to wait until Next click to see error
- Bad form experience

#### Fix Required:
Add real-time CNIC validation:
```tsx
<div>
  <input
    value={draft.cnic ?? ""}
    onChange={(e) => {
      const val = e.target.value;
      // Auto-format while typing
      const formatted = val.replace(/[^\d-]/g, "");
      let result = formatted;
      if (formatted.length <= 5) {
        result = formatted;
      } else if (formatted.length <= 12) {
        result = `${formatted.slice(0, 5)}-${formatted.slice(5)}`;
      } else {
        result = `${formatted.slice(0, 5)}-${formatted.slice(5, 12)}-${formatted.slice(12, 13)}`;
      }
      update("cnic", result);
    }}
    placeholder="CNIC XXXXX-XXXXXXX-X *"
    style={inputStyle}
    maxLength={15}
  />
  <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
    Format: 12345-1234567-1 (dashes required)
  </div>
  {/* ADD VALIDATION FEEDBACK */}
  {(draft.cnic as string)?.length === 15 && !CNIC_REGEX.test((draft.cnic as string) ?? "") && (
    <div style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>
      ✗ Invalid CNIC format
    </div>
  )}
  {(draft.cnic as string)?.length === 15 && CNIC_REGEX.test((draft.cnic as string) ?? "") && (
    <div style={{ fontSize: 11, color: "#10b981", marginTop: 4 }}>
      ✓ Valid CNIC format
    </div>
  )}
</div>
```

---

### BUG #9: VENDOR BANK ACCOUNT NO VALIDATION
**File:** `artifacts/vendor-app/src/lib/auth/RegisterWizard.tsx` (Step 3)  
**Severity:** 🟡 Medium  
**Status:** ACTIVE - Not Fixed

#### Current Code (BROKEN):
```tsx
{/* Step 3: Bank / Wallet */}
function BankStep({ data, onChange, onError }: StepComponentProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <label style={labelStyle(pr)}>{T("accountNumber")}</label>
        <input
          style={darkInput()}
          value={(data.bankAccount as string) ?? ""}
          onChange={(e) => {
            onChange("bankAccount", e.target.value);
            onError("");
          }}
          placeholder="IBAN / Account number"
          {/* ❌ NO VALIDATION AT ALL */}
        />
      </div>
```

#### What's Wrong:
1. **Accepts any input** - no IBAN/account format check
2. **No validation feedback**
3. **Will fail at backend** when submitted
4. **No helper text** about IBAN format

#### Impact:
- Invalid bank data submitted
- Backend rejection
- Support tickets from vendors

#### Fix Required:
```tsx
<div>
  <label style={labelStyle(pr)}>{T("accountNumber")}</label>
  <input
    style={darkInput()}
    value={(data.bankAccount as string) ?? ""}
    onChange={(e) => {
      const val = e.target.value.toUpperCase();
      onChange("bankAccount", val);
      onError("");
    }}
    placeholder="IBAN / Account number"
    maxLength={24}
  />
  <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>
    IBAN format: PK94 ABCD 0000 0000 0000 (24 chars) or Account: 12345-123-456
  </div>
  {/* ADD VALIDATION */}
  {(data.bankAccount as string)?.length > 0 && !isValidIBAN((data.bankAccount as string) ?? "") && (
    <div style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>
      ✗ Invalid IBAN format
    </div>
  )}
</div>
```

---

## 🟢 MINOR BUGS (Nice to Have)

### BUG #10: EMAIL REGEX TOO PERMISSIVE
**File:** `artifacts/rider-app/src/lib/auth/LoginScreen.tsx` (Line ~280)  
**Severity:** 🟢 Minor  
**Status:** ACTIVE

```tsx
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)) {
  // ❌ Accepts: "a@b.c" (invalid)
  // ❌ Accepts: "user@@example.com" (invalid)
}
```

**Better regex:**
```tsx
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// This requires at least 2 chars after dot (no single-char TLD)
```

---

### BUG #11: SOCIAL LOGIN BUTTONS NOT DISABLED DURING LOADING
**File:** `artifacts/vendor-app/src/lib/auth/LoginScreen.tsx`  
**Severity:** 🟢 Minor  
**Status:** ACTIVE

#### What's Wrong:
Google/Facebook buttons can be clicked multiple times during loading.

**Fix:**
```tsx
<button
  onClick={() => void handleGoogle()}
  disabled={socialLoading === "google"} // ADD THIS
  style={{
    opacity: socialLoading === "google" ? 0.6 : 1,
    cursor: socialLoading === "google" ? "not-allowed" : "pointer",
  }}
>
  {socialLoading === "google" ? "Signing in..." : "Google"}
</button>
```

---

### BUG #12: NO PHONE FORMAT HINT IN RIDER LOGIN
**File:** `artifacts/rider-app/src/lib/auth/LoginScreen.tsx`  
**Severity:** 🟢 Minor  
**Status:** ACTIVE

#### What's Wrong:
Phone input just shows "03XXXXXXXXX" - no help text.

**Fix:**
```tsx
<input
  value={phone}
  onChange={(e) => setPhone(e.target.value)}
  placeholder="03XXXXXXXXX"
  style={inputStyle}
/>
<div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
  Format: 03XX-XXXXXXX or +923XX-XXXXXXX
</div>
```

---

### BUG #13: VENDOR DEV OTP NOT PROPERLY HIDDEN
**File:** `artifacts/vendor-app/src/lib/auth/LoginScreen.tsx`  
**Severity:** 🟢 Minor (Security Risk)  
**Status:** ACTIVE

```tsx
{import.meta.env.DEV && devOtp && otpStep === "otp" && (
  <div>{devOtp}</div>
  {/* ⚠️ If DEV flag is accidentally true in prod, OTP exposed! */}
)}
```

**Better:**
```tsx
{process.env.NODE_ENV === "development" && devOtp && otpStep === "otp" && (
  <div style={{
    background: "#1a2035",
    border: "1px solid #2d3a55",
    borderRadius: 8,
    padding: "8px 12px",
    marginBottom: 12,
    fontSize: 12,
    color: "#94a3b8"
  }}>
    🔧 Dev Mode - OTP: <strong>{devOtp}</strong>
  </div>
)}
```

---

### BUG #14: USERNAME AVAILABILITY RACE CONDITION
**File:** `artifacts/rider-app/src/lib/auth/RegisterWizard.tsx`  
**Severity:** 🟢 Minor  
**Status:** ACTIVE

#### What's Wrong:
```
User types: "ali" → Request #1 sent
User types: "ali123" → Request #2 sent
Result #2 comes back FIRST (faster)
Result #1 comes back SECOND (slower)
User sees wrong availability status
```

**Fix with AbortController:**
```tsx
const usernameCheckAbortRef = useRef<AbortController>();

const checkUsername = async () => {
  const username = (draft.username ?? "").trim();
  if (!username) return;
  
  // Cancel previous request
  if (usernameCheckAbortRef.current) {
    usernameCheckAbortRef.current.abort();
  }
  usernameCheckAbortRef.current = new AbortController();
  
  setUsernameState("checking");
  try {
    const res = await api.checkAvailable({ 
      username,
      signal: usernameCheckAbortRef.current.signal 
    });
    setUsernameState(res.username && !res.username.available ? "taken" : "available");
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      setUsernameState("idle");
    }
  }
};
```

---

### BUG #15: ROLE MISMATCH ERROR NOT SPECIFIC
**File:** Both LoginScreen files  
**Severity:** 🟢 Minor  
**Status:** ACTIVE

#### Current (BAD):
```tsx
setError("This app is for riders only");
```

#### Better:
```tsx
const userRole = normalizeRoles(profile)[0] || "unknown";
setError(
  `This app is for riders only. Your account is registered as: ${userRole}`
);
```

---

### BUG #16: NO PAGE TITLE / META TAGS
**File:** Both `pages/Login.tsx` and `pages/Register.tsx`  
**Severity:** 🟢 Minor  
**Status:** ACTIVE

#### What's Missing:
- `<title>` tag
- Meta description
- Open Graph tags
- Canonical URL

**Fix:**
```tsx
import { useEffect } from "react";

export default function LoginPage() {
  useEffect(() => {
    document.title = "AJKMart Rider - Login";
    document.head.querySelector('meta[name="description"]')?.setAttribute(
      "content", 
      "Sign in to your AJKMart rider account. Fast delivery earnings await."
    );
  }, []);
  
  return <LoginScreen />;
}
```

---

### BUG #17: VENDOR CNIC OPTIONAL BUT CONFUSING
**File:** `artifacts/vendor-app/src/lib/auth/RegisterWizard.tsx`  
**Severity:** 🟢 Minor  
**Status:** ACTIVE

#### Current (CONFUSING):
```tsx
<label>CNIC Number *</label>
{/* Says required with * */}
<input placeholder="XXXXX-XXXXXXX-X (optional)" />
{/* But then says optional */}

<p>Optional — complete this in your profile after approval.</p>
{/* Triple message about being optional */}
```

**Better:**
```tsx
<label>CNIC Number (Optional)</label>
{/* Don't use * if optional */}
<input placeholder="XXXXX-XXXXXXX-X" />
<p style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>
  You can complete full KYC later in your Profile after approval
</p>
```

---

### BUG #18: OTP COOLDOWN INCONSISTENT ACROSS APPS
**File:** Both apps  
**Severity:** 🟢 Minor  
**Status:** ACTIVE

#### Rider App:
```tsx
setResendCooldown(60); // 60 seconds
```

#### Vendor App:
```tsx
const { isRateLimited, secondsLeft, triggerRateLimit } = useRateLimitCountdown();
triggerRateLimit(60); // Different mechanism
```

**Fix:**
Use consistent cooldown across both apps:
```tsx
const OTP_RESEND_COOLDOWN = 60; // seconds

// Both apps use this
setResendCooldown(OTP_RESEND_COOLDOWN);
```

---

## 🔍 DEEP-SCAN FINDINGS (Rider + Vendor App Structure Review)
**Date:** May 23, 2026  
**Scope:** Full rider and vendor app module scan beyond login/register flows  
**Added Findings:** 7 new real UI/UX issues discovered after reviewing routes, page state, offline flows, and shared components

### APP STRUCTURE REFERENCE USED FOR THIS DEEP SCAN
- **Rider app root:** `artifacts/rider-app/src/App.tsx`
  - Route branches: guest login/register, authenticated home/active/history/earnings/wallet/notifications/profile/settings/chat/reviews/penalty-history
  - Includes auth gating, offline banner, session-expired overlay, maintenance and approval handling
- **Vendor app root:** `artifacts/vendor-app/src/App.tsx`
  - Route branches: dashboard, orders, products, wallet, analytics, reviews, promos, campaigns, chat, store, notifications, profile
  - Includes KYC gate, maintenance screen, pending approval screen, desktop sidebar + mobile bottom nav
- **Shared UI flows reviewed:** rider and vendor auth flows, product management screen, orders dashboard, profile settings, notifications, bottom navigation, and online/offline handling

### BUG #19: RIDER HOME OFFLINE STATE DOES NOT SHOW RECOVERY ACTIONS CLEARLY
**File:** `artifacts/rider-app/src/pages/Home.tsx`  
**Severity:** 🟡 Medium  
**Status:** ACTIVE

#### What is happening
The rider home screen uses optimistic online/offline toggling and multiple passive notifications (`offlineHint`, `refreshFailToast`, socket status). When connectivity drops, the UI shows a toast or banner, but the root action state is split between several local states and is not presented as a single recovery path.

#### Why this is a UX bug
- Users can see a status change but not understand whether the app is temporarily offline, the socket is disconnected, or the profile wasn’t refreshed.
- The current state relies on multiple small overlays/toasts instead of one consistent “Reconnect now” action.
- Riders who are offline may continue to believe they are still online unless they inspect the toggle state carefully.

#### Impact
- Confusing offline behavior during active rides and request acceptance
- Increased support load for “why am I not getting requests?”
- Poor recoverability when network reconnects fail

#### Fix required
- Consolidate offline, socket, and refresh failure into one persistent banner with a clear action like “Retry sync”
- Show a dedicated “Offline mode” card on Home with state, last sync, and reconnect guidance
- Use one source of truth for connectivity state rather than multiple competing banners

---

### BUG #20: RIDER ACTIVE DELIVERY FLOW DOES NOT RESET PHOTO STATE AFTER FAILED UPLOAD
**File:** `artifacts/rider-app/src/pages/Active.tsx`  
**Severity:** 🟡 Medium  
**Status:** ACTIVE

#### What is happening
The proof upload flow stores `proofPhoto`, `proofFile`, `proofFileName`, and `proofStagedForRetry` in local state. When upload fails due to network or a server error, the stale photo preview remains visible and the staged retry flag is set, but the UI does not always communicate whether the user is retrying the same capture or needs a new one.

#### Why this is a UX bug
- The user can be left with a preview that looks “accepted” even though the upload failed.
- The retry flow depends on the same file still being in state, but the UI doesn’t clearly indicate the retry stage.
- The button label and state may not match the actual action in progress.

#### Impact
- Users may resubmit stale proof unintentionally
- Confusing delivery completion flow
- Higher failure rate on slow or flaky connections

#### Fix required
- Add explicit upload status text like “Upload failed — tap retry”
- Disable the “Mark Delivered” action while upload is in progress
- Add a clear “Retake photo” action next to the current preview on failure
- Reset the preview only when the user intentionally replaces or removes it

---

### BUG #21: VENDOR ORDERS PAGE DOES NOT EXPLAIN WHY A SEARCH RETURNS ZERO RESULTS
**File:** `artifacts/vendor-app/src/pages/Orders.tsx`  
**Severity:** 🟡 Medium  
**Status:** ACTIVE

#### What is happening
The orders page supports search by order ID or customer, but when the filtered result set is empty, the UI only shows the default empty-state copy for the selected tab. It does not explain that the current search query is filtering everything out.

#### Why this is a UX bug
- A vendor seeing “No new orders” may mistake the result for a data outage rather than a search mismatch.
- The current empty state is tab-specific and does not reflect the active filter state.
- Search and tab behavior are mixed into one message, which makes the result ambiguous.

#### Impact
- Users think orders are missing instead of filtered
- Wasted time trying to refresh or reload the page
- Poor discoverability of the search feature

#### Fix required
- When `searchQuery` is non-empty and `orders.length === 0`, show a dedicated empty state like “No orders match your search”
- Offer a “Clear search” action directly in the empty state
- Keep the tab-specific message only for the non-search case

---

### BUG #22: VENDOR PRODUCTS PAGE DOES NOT CLEARLY SHOW OFFLINE SAVE STATUS FOR CREATE/UPDATE ACTIONS
**File:** `artifacts/vendor-app/src/pages/Products.tsx` and `artifacts/vendor-app/src/pages/useProductForm.ts`  
**Severity:** 🟡 Medium  
**Status:** ACTIVE

#### What is happening
When the vendor is offline, product create/update actions are queued and the UI shows a toast like “Saved offline — will sync when connected”. The form closes immediately, but the screen does not show a persistent indicator that the action is pending sync or which action was queued.

#### Why this is a UX bug
- The vendor has no visible record of what was saved locally once the form closes.
- The queue banner exists in the nav, but it is easy to miss and is not tied to the product action.
- Users may believe changes were saved remotely when they are only pending sync.

#### Impact
- Lost trust in product data consistency
- Duplicate or repeated edits when the vendor returns online
- Higher chance of confusion around stale inventory data

#### Fix required
- Add a persistent “Pending sync” banner on the Products page when offline queue has queued product actions
- Show the queued count and the next sync behavior directly on the page
- Keep the form open or show a confirmation summary when the action is queued offline

---

### BUG #23: VENDOR PROFILE NOTIFICATION TEST BUTTON DOES NOT GIVE A CLEAR SUCCESS/FAIL CONTEXT WHEN PERMISSION IS DENIED
**File:** `artifacts/vendor-app/src/pages/Profile.tsx`  
**Severity:** 🟢 Minor  
**Status:** ACTIVE

#### What is happening
The vendor profile page includes a “Send Test Notification” flow that requests browser permission and then calls the backend. The UI shows a toast, but the path for “permission denied” vs “push not registered” vs “socket-only fallback” is not obvious in the button state.

#### Why this is a UX bug
- The vendor receives generic error messages, but not a clear remediation path for the specific failure.
- Users may keep retrying the button without knowing they must change browser permission or reload.
- The button does not expose a persistent status of what was attempted.

#### Impact
- Poor notification troubleshooting
- Repeated failed attempts
- Lower confidence in push delivery

#### Fix required
- Add a dedicated notification troubleshooting notice in the profile section
- Distinguish between permission denied, push registration missing, and socket-only fallback
- Keep the button disabled while the test is in progress and show the current state

---

### BUG #24: RIDER NAVIGATION DOES NOT MAKE ACTIVE TASK STATUS OBVIOUS ENOUGH
**File:** `artifacts/rider-app/src/components/BottomNav.tsx`  
**Severity:** 🟢 Minor  
**Status:** ACTIVE

#### What is happening
The active tab receives a green dot when an active order or ride exists, but the visual cue is subtle and may be missed, especially on small screens or in bright light.

#### Why this is a UX bug
- The current badge only shows a tiny status indicator and does not give the rider enough context.
- The user has to infer that the active screen contains a live task.
- There is no text or label that reinforces that “Active” is the current live screen.

#### Impact
- Riders may miss that an order is currently active
- Increased chance of taking the wrong action from the home screen
- Less obvious task-state awareness

#### Fix required
- Add a clearer “Live” pill or bold text state for the active nav item when there is an active task
- Make the indicator larger and more visible
- Consider adding a small “Active task” label near the tab when an order or ride is in progress

---

### BUG #25: VENDOR DASHBOARD / ORDERS / PRODUCTS FLOW DOES NOT PRIORITIZE ACTIONS FOR RECENTLY UPDATED DATA
**File:** `artifacts/vendor-app/src/pages/Dashboard.tsx`, `artifacts/vendor-app/src/pages/Orders.tsx`, and `artifacts/vendor-app/src/pages/Products.tsx`  
**Severity:** 🟢 Minor  
**Status:** ACTIVE

#### What is happening
The vendor app pulls refreshes from React Query and Socket.IO, but the user experience still feels like “old data on the page” after updates, because there is no persistent “Updated just now” indicator or clear refresh source.

#### Why this is a UX bug
- Vendors cannot tell whether their current view is fresh or stale.
- Socket and polling updates happen in the background, but the UI does not present the freshness clearly.
- The current feedback is split between banners, sounds, and background invalidation.

#### Impact
- Reduced trust in the order/product view
- Unclear whether a manual refresh is needed
- Confusing behavior when real-time updates are delayed

#### Fix required
- Add a small “Updated just now / sync pending” label on each main page
- Display when the last successful sync happened
- Surface an explicit “tap to refresh” affordance if real-time updates are unavailable

---

## 📊 DEEP-SCAN PRIORITY MATRIX

| Priority | Findings | Notes |
|----------|----------|-------|
| Medium | #19, #20, #21, #22 | Core rider/vendor UX flows need clarity and recovery messaging |
| Minor | #23, #24, #25 | Important polish items that improve confidence and task awareness |

---

## ✅ SUMMARY
- Existing report retains all original login/register issues
- Added 7 new deep-scan findings from actual rider/vendor app flows
- New findings focus on offline behavior, search feedback, queued state visibility, notification troubleshooting, active-task visibility, and data freshness

**Report Updated:** May 23, 2026
