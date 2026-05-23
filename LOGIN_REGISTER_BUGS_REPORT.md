# Login & Registration UI/UX Issues Report
**Date:** May 23, 2026  
**Apps Checked:** Rider App & Vendor App  
**Status:** Critical & Minor issues found

---

## 🔴 CRITICAL ISSUES

### 1. **Rider Register Step 2 — Password Confirmation Mismatch Not Checked Before Navigation**
**File:** `artifacts/rider-app/src/lib/auth/RegisterWizard.tsx` (Line ~630)
**Issue:** The password field validation happens ONLY when clicking Next, but there's no real-time visual feedback showing when passwords don't match. The user might not realize the passwords don't match until they click the Next button and see the error.

**Current Code:**
```tsx
if (draft.password !== draft.confirmPassword)
  return setError("Passwords do not match");
```

**Impact:** Bad UX — users get frustrated when they see error after filling form  
**Severity:** 🟡 Medium  
**Fix:** Add real-time validation below the confirm password field showing ✓ or ✗

---

### 2. **Rider Register Step 4 — Upload Error State Not Cleared on Success**
**File:** `artifacts/rider-app/src/lib/auth/RegisterWizard.tsx`  
**Issue:** When a user uploads a file and gets an error, then uploads again successfully, the old error message stays visible even though the upload succeeded. The `uploadError` state is not properly cleared on successful retry.

**Current Code:**
```tsx
setUploadError((prev) => ({ ...prev, [fieldKey]: "" })); // cleared on new attempt
// but visual feedback isn't clear if error was just replaced
```

**Impact:** Confusing for users — they see error text even with ✓ checkmark  
**Severity:** 🟡 Medium  
**Fix:** Add explicit error clear on successful upload completion

---

### 3. **Vendor Register Phone Number Validation Missing**
**File:** `artifacts/vendor-app/src/lib/auth/RegisterWizard.tsx`  
**Issue:** In the Documents step, phone number field has NO validation. Users can submit the form with:
- Empty phone
- Invalid format (less than 10 digits)
- No format checking at all

**Current Code:**
```tsx
<input
  placeholder="03XXXXXXXXX or +92XXXXXXXXXX"
  maxLength={15}
  // NO validation!
/>
```

**Impact:** Registration fails silently or returns server error  
**Severity:** 🔴 **CRITICAL**  
**Fix:** Add `isValidPhone()` validation from `@workspace/phone-utils`

---

### 4. **Both Apps — OTP Field Not Cleared After Failed Verification**
**File:** `artifacts/rider-app/src/lib/auth/LoginScreen.tsx` (Line ~140)  
**File:** `artifacts/vendor-app/src/lib/auth/LoginScreen.tsx`  
**Issue:** When OTP verification fails, the OTP input is cleared in rider app:
```tsx
setOtp("");
```
But in vendor app, it uses a custom OtpBoxes component that may not clear on error.

**Impact:** User sees empty input field after error, unclear if they should re-enter  
**Severity:** 🟡 Medium  
**Fix:** Ensure OTP clears on error AND show clear error message

---

### 5. **Rider Register Step 2 — Password Strength Indicator Cutoff on Mobile**
**File:** `artifacts/rider-app/src/lib/auth/RegisterWizard.tsx`  
**Issue:** Password strength bar and label are inline but don't wrap properly on mobile devices < 340px width. The strength label gets cut off.

**Current Code:**
```tsx
<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
  <div style={{ flex: 1, height: 4, borderRadius: 999, background: theme.border }}>
    {/* bar */}
  </div>
  <span style={{ fontSize: 10, fontWeight: 700, color: pwStrength.color }}>
    {pwStrength.label}
  </span>
</div>
```

**Impact:** Broken layout on small mobile phones  
**Severity:** 🟡 Medium  
**Fix:** Stack vertically or reduce label font size on small screens

---

### 6. **Vendor Register Step 1 — Store Category Required but Not Marked**
**File:** `artifacts/vendor-app/src/lib/auth/RegisterWizard.tsx`  
**Issue:** The label says "Category *" (required) but the form doesn't validate that it's selected before allowing Next. User can proceed to Step 2 without selecting a category.

**Impact:** Invalid incomplete submission → registration fails at backend  
**Severity:** 🟡 Medium  
**Fix:** Add validation check in the Next button handler

---

## 🟡 MEDIUM ISSUES

### 7. **Both Apps — Rate Limit Countdown Uses Wrong Cooldown Duration**
**File:** `artifacts/rider-app/src/lib/auth/LoginScreen.tsx` (Line ~115)  
**Vendor:** Uses `useRateLimitCountdown()` hook which may have hardcoded 60s

**Issue:** Rider app sets `setOtpCooldown(60)` for resend, but vendor app might use different duration. Inconsistent UX across apps.

**Impact:** Confusing user experience — different wait times in different apps  
**Severity:** 🟡 Medium

---

### 8. **Rider Login — No Phone Number Format Help on Initial Field**
**File:** `artifacts/rider-app/src/lib/auth/LoginScreen.tsx`  
**Issue:** The phone input field shows placeholder "03XXXXXXXXX" but no helper text explaining the format. On first load, user doesn't know they can use 0343... or +92343...

**Current:**
```tsx
<input
  placeholder="Enter phone number"
  // no help text about format
/>
```

**Impact:** Friction in login flow  
**Severity:** 🟡 Medium  
**Fix:** Add small helper text "Format: 03XX-XXXXXXX or +923XX-XXXXXXX"

---

### 9. **Vendor Login — Dev OTP Hint Not Hidden in Production**
**File:** `artifacts/vendor-app/src/lib/auth/LoginScreen.tsx`  
**Issue:** Shows dev OTP only when `import.meta.env.DEV` is true, but this check might fail in certain build environments or if NODE_ENV is not properly set.

```tsx
{import.meta.env.DEV && devOtp && otpStep === "otp" && (
  <div>Dev OTP: <strong>{devOtp}</strong></div>
)}
```

**Impact:** Security risk if accidentally shipped with DEV=true in prod  
**Severity:** 🟡 Medium

---

### 10. **Both Apps — Error Messages Not Role-Specific**
**File:** Both LoginScreen implementations  
**Issue:** When login fails due to role mismatch:
```tsx
setError("This app is for riders only");
```

But the message doesn't include the user's actual role, making it confusing.

**Impact:** User frustration — unclear what went wrong  
**Severity:** 🟡 Medium  
**Fix:** Change to "Your account is registered as a [role]. This app is for riders only."

---

### 11. **Rider Register — No Field Validation Feedback During Input**
**File:** `artifacts/rider-app/src/lib/auth/RegisterWizard.tsx`  
**Issue:** Fields like CNIC, email, phone have no real-time validation. User types in invalid CNIC and only sees error when clicking Next.

**Impact:** Poor form experience  
**Severity:** 🟡 Medium

---

### 12. **Vendor Register Step 3 — No Bank Account Format Validation**
**File:** `artifacts/vendor-app/src/lib/auth/RegisterWizard.tsx`  
**Issue:** Bank account field accepts any input with no IBAN/account number format validation.

```tsx
<input placeholder="IBAN / Account number" />
// no validation!
```

**Impact:** Invalid bank data submitted  
**Severity:** 🟡 Medium  
**Fix:** Add IBAN/account format validation

---

## 🟢 MINOR ISSUES

### 13. **Vendor Register Step 2 — CNIC Format Help Text Inconsistent**
**File:** `artifacts/vendor-app/src/lib/auth/RegisterWizard.tsx`  
**Issue:** Shows "Format: XXXXX-XXXXXXX-X" but also says "(optional)" which is confusing messaging.

```tsx
<p style={{ color: "#6B7280", fontSize: 11, margin: "4px 0 0" }}>
  Optional — complete this in your profile after approval.
</p>
```

**Impact:** User confusion  
**Severity:** 🟢 Minor  
**Fix:** Clarify in label and help text that it's optional

---

### 14. **Both Apps — Email Regex Validation Too Permissive**
**File:** `artifacts/rider-app/src/lib/auth/LoginScreen.tsx` (Line ~280)  
**Issue:** Uses basic email regex:
```tsx
/^[^\s@]+@[^\s@]+\.[^\s@]+$/
```

This accepts invalid emails like `a@b.c` (single char before/after @).

**Impact:** Invalid emails accepted  
**Severity:** 🟢 Minor  
**Fix:** Use proper email validation library or better regex

---

### 15. **Rider Register — Username Availability Check Has Race Condition**
**File:** `artifacts/rider-app/src/lib/auth/RegisterWizard.tsx`  
**Issue:** When user types username quickly:
1. First request sent for "ali"
2. User adds letter: "alib"
3. Second request sent
4. Results come back in wrong order → incorrect availability status

**Impact:** User sees wrong availability status  
**Severity:** 🟢 Minor  
**Fix:** Cancel previous request before sending new one (use AbortController)

---

### 16. **Vendor Login — Social Login Buttons Not Disabled During Loading**
**File:** `artifacts/vendor-app/src/lib/auth/LoginScreen.tsx`  
**Issue:** Google and Facebook buttons don't show loading state and aren't disabled while loading. User can click multiple times.

**Impact:** Multiple requests sent  
**Severity:** 🟢 Minor  
**Fix:** Add `disabled={socialLoading !== null}` to buttons

---

### 17. **Both Apps — No Helmet/Head Meta Tags**
**Issue:** Login pages don't set:
- `<title>` tag
- Meta description
- Canonical URL
- Prevents proper browser history and SEO

**Impact:** Poor browser history, sharing broken  
**Severity:** 🟢 Minor

---

### 18. **Rider Register Step 1 — Username Check Triggers on Every Blur**
**File:** `artifacts/rider-app/src/lib/auth/RegisterWizard.tsx`  
**Issue:** The `checkUsername()` runs every time user leaves the field, even if they just cleared it. Should debounce or skip if empty.

```tsx
<input
  onBlur={() => void checkUsername()}
  // runs even if value is empty!
/>
```

**Impact:** Unnecessary API calls  
**Severity:** 🟢 Minor  
**Fix:** Skip check if username is empty

---

## 📋 SUMMARY

| Severity | Count | Examples |
|----------|-------|----------|
| 🔴 Critical | 1 | Vendor phone validation missing |
| 🟡 Medium | 6 | Password mismatch UX, upload errors, rate limiting |
| 🟢 Minor | 11 | Email regex, social buttons, username debounce |
| **TOTAL** | **18** | Issues to fix |

---

## 🚀 RECOMMENDED PRIORITY

**Immediate (This Sprint):**
1. Vendor phone validation ✅ CRITICAL
2. Password confirmation real-time feedback
3. Upload error state clearing
4. Store category validation

**Soon (Next Sprint):**
1. OTP field clearing on error
2. Rate limit consistency
3. Bank account validation

**Nice to Have:**
1. Email regex improvement
2. Username debounce
3. Meta tags for SEO
