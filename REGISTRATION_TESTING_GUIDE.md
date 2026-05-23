# 📱 Testing Registration Without Real OTP API - Complete Guide

Hindi/Urdu میں تمام تفصیلات

---

## 🎯 Testing Ke Liye 4 Methods

### Method 1: ✅ **BEST - Development OTP Codes (Automatic)**

**یہ سب سے آسان ہے**

جب آپ registration کریں اور OTP request کریں:

```
Backend automatically returns: { 
  devCode: "XXXXXX"  ← یہ کوڈ استعمال کریں
  otpRequired: true
}
```

**کیسے کریں:**

```
1. App میں phone نمبر ڈالیں:
   ✅ اپنا نمبر
   ✅ یا test نمبر (e.g., 03001234567)

2. "Send OTP" دبائیں

3. Backend سے response میں یہ ملے گی:
   {
     "success": true,
     "otpRequired": true,
     "devCode": "654321"     ← یہ code استعمال کریں!
   }

4. App میں OTP field میں ڈالیں: 654321

5. ✅ Registration complete!
```

**کہاں سے devCode آتا ہے؟** 

```typescript
// File: artifacts/api-server/src/modules/otp/otp.verify.ts:169

return {
  success: true,
  otpRequired: true,
  channel: delivery.usedChannel,
  expiresAt,
  resendAfter: OTP_CONFIG.RESEND_COOLDOWN_MS,
  // devCode صرف development mode میں return ہوتا ہے
  ...(isDevMode() && { devCode: code }),  // ← یہاں سے!
};
```

**کب کام کرتا ہے؟**
- ✅ Local development (NODE_ENV = development)
- ✅ Staging environment 
- ❌ Production (نہیں)

---

### Method 2: ✅ **Whitelist Bypass (Test Account)**

**اگر devCode دیکھنا نہیں چاہتے تو یہ استعمال کریں**

#### Step 1: Admin Panel میں Whitelist Entry بنائیں

جاو یہاں: `/admin/otp-control`

"Whitelist Bypass" section میں:

```
Phone Number: 03001234567
Bypass Code: 123456  ← یہ code استعمال ہوگا
Label: Test Customer
Active: ✅ YES
Expires At: (optional - 1 month سے آگے set کریں)
```

"Add to Whitelist" دبائیں ✅

#### Step 2: Registration Flow

```
1. App میں یہی phone ڈالیں: 03001234567
2. "Send OTP" دبائیں
3. SMS نہیں ملے گا ✅ (کیونکہ whitelist bypass active ہے)
4. Backend response:
   {
     "success": true,
     "otpRequired": false    ← مہم بات!
   }
5. APP: براہ راست OTP screen skip ہوگی
6. اگلے step پر جائیں (Full Name)
```

**یہ Method کب استعمال کریں:**
- ✅ Multiple test accounts کے لیے
- ✅ QA team کو manual testing کے لیے
- ✅ اگر devCode response دیکھنا نہیں چاہتے

---

### Method 3: ✅ **Per-User OTP Bypass (Support Tool)**

**اگر registration کے دوران پھنس جائیں**

#### Step 1: Admin Panel میں Bypass دیں

جاو: `/admin/otp-control` → "Per-User OTP Bypass" section

```
1. Search کریں: اپنا phone نمبر
2. "Grant Bypass" دبائیں → "1 hour"
3. ✅ Now user can login without OTP
```

#### Step 2: App میں

```
1. OTP enter کیے بغیر
2. Login screen automatically proceed ہوگی
3. Registration complete!
```

---

### Method 4: ⚠️ **Global OTP Suspension (Emergency)**

**اگر سب کے لیے OTP disable کرنا ہو**

```
Admin Panel → Global OTP Suspension
↓
"Suspend OTP" → 1 hour
↓
Reason: "Testing registration flow"
↓
✅ ALL users اب OTP کے بغیر login کر سکتے ہیں
```

---

## 📊 Methods Comparison

| Method | Setup Time | Persistence | Best For | Production Safe |
|--------|-----------|------------|----------|-----------------|
| **devCode** | 0 sec | Auto per request | Quick testing | ❌ (dev only) |
| **Whitelist** | 2 min | Permanent | QA team, test accounts | ✅ |
| **Per-User Bypass** | 1 min | 1 hour | Support, stuck users | ✅ |
| **Global Suspend** | 30 sec | Up to 24h | SMS outage testing | ✅ |

---

## 🎬 Step-by-Step Registration Testing

### Scenario: Vendor Registration

```
Platform: 3 فروخت (Vendor App, Rider App, Customer App)
Environment: Development (NODE_ENV=development)
Task: Register 1 vendor account
```

#### Option A: Using devCode (EASIEST) ✅

```
1. Open Vendor App
   URL: http://localhost:3000/vendor

2. Click "Register"
   
3. Phone Step:
   Enter: 03001234567
   Click: "Next"
   
4. OTP Step:
   Click: "Send OTP"
   
   Backend returns:
   {
     "success": true,
     "otpRequired": true,
     "channel": "sms",
     "devCode": "654321"  ← COPY THIS!
   }
   
5. Enter OTP: 654321
   Click: "Verify"
   
6. Full Name Step:
   Enter: "Test Vendor"
   Click: "Next"
   
7. City Step:
   Select: Karachi
   Click: "Next"
   
8. Password Step:
   Enter: Test@123456
   Click: "Register"
   
9. ✅ SUCCESS! 
   Vendor registered
```

#### Option B: Using Whitelist (RECOMMENDED FOR TEAM) ✅

```
SETUP (Admin Panel - Once):
1. Go to /admin
2. OTP Control → Whitelist Bypass
3. Add Entry:
   Phone: 03001234567
   Code: 123456
   Label: Test Vendor Account
   Active: ✅
4. Save ✅

TESTING (Repeat Anytime):
1. Open Vendor App
2. Click "Register"
3. Phone: 03001234567
4. Click "Send OTP"
5. SMS bypass triggered automatically ✅
6. Continue with Full Name, City, Password
7. ✅ Vendor registered!

Benefit: Whole team can use same test account
```

---

## 💾 Database: Whitelist کیسے Manage کریں

### Add Test Account (Whitelist)

```sql
INSERT INTO whitelist_users (
  id,
  identifier,
  identifier_type,
  bypass_code,
  is_active,
  created_at,
  expires_at
) VALUES (
  'wl_' || gen_random_uuid()::text,
  '03001234567',
  'phone',
  '123456',
  true,
  NOW(),
  NOW() + interval '1 month'
);
```

### View All Test Accounts

```sql
SELECT 
  id,
  identifier,
  bypass_code,
  is_active,
  created_at,
  expires_at
FROM whitelist_users
WHERE identifier_type = 'phone'
ORDER BY created_at DESC;
```

### Remove Test Account

```sql
DELETE FROM whitelist_users 
WHERE identifier = '03001234567';
```

---

## 🔍 Admin Panel Workflow

### اگر Registration سے پہلے Setup کرنا ہو

#### 1. Whitelist Add کریں (2 منٹ)

```
URL: http://localhost:admin.local/otp-control

Section: Per-User OTP Bypass
↓
Search Box: 03001234567 (add if not exists)
↓
Button: "+ Add Whitelist"
↓
Form:
  Identifier: 03001234567
  Bypass Code: 123456
  Expires: <pick date>
  Active: ✅
↓
Save ✅
```

#### 2. Registration شروع کریں

```
URL: http://localhost:3000/vendor

Flow:
  Phone → OTP (auto-bypassed) → Name → City → Password → Done ✅
```

---

## 🚀 Configuration Check

یہ چیک کریں کہ سب کچھ dev mode میں ہے:

```bash
# Terminal میں چیک کریں:
echo $NODE_ENV
# Expected: development

# یا .env file میں:
NODE_ENV=development

# Backend logs میں دیکھیں:
"[DEV MODE] AJKMart API — running without vault"
```

---

## 📋 3 Complete Registration Flows

### 🔵 Flow 1: VENDOR Registration (devCode)

```
Vendor App
↓
Phone: 03001234567
↓
OTP Code: [devCode from response]
↓
Name: "My Shop"
↓
City: Karachi
↓
Password: VendorPass@123
↓
✅ Vendor Account Created!

Roles: ["vendor"]
is_verified: false (until admin approves)
```

### 🟢 Flow 2: RIDER Registration (Whitelist)

```
Rider App
↓
Phone: 03001234568 (whitelist entry)
↓
OTP: [bypassed automatically]
↓
Name: "Delivery Boy"
↓
City: Islamabad
↓
Password: RiderPass@123
↓
✅ Rider Account Created!

Roles: ["rider"]
is_verified: false (until admin approves)
```

### 🟠 Flow 3: CUSTOMER Registration (Global Suspend)

```
[Admin: Global OTP Suspended for 1 hour]

Customer App
↓
Phone: 03001234569
↓
OTP: [not required - globally suspended]
↓
Name: "Customer"
↓
City: Lahore
↓
Password: CustomerPass@123
↓
✅ Customer Account Created!

Roles: ["customer"]
is_verified: false
```

---

## ⚠️ Common Issues & Fixes

### Issue 1: "OTP Code Not Received"

```
Reason: Real SMS API not connected
Fix: 
  ✅ Use devCode from response
  ✅ Use whitelist bypass
  ✅ Use per-user bypass from admin
```

### Issue 2: "Can't See devCode in Response"

```
Reason: Not in development mode
Fix:
  1. Check: NODE_ENV=development
  2. Check: VAULT_UNLOCKED not set
  3. Restart backend
  4. Try again
```

### Issue 3: "Whitelist Not Working"

```
Reason: Phone number مختلف format میں ہے
Fix:
  ✅ Always use E.164 format: +923001234567
  ✅ Or Pakistani format: 03001234567
  ✅ Be consistent!
```

### Issue 4: "Already Registered Error"

```
Reason: یہ phone number پہلے سے registered ہے
Fix:
  1. Use different phone for testing
  2. Or: Admin Panel → Delete user → Re-register
  3. Or: Use email-based registration
```

---

## 📝 Test Accounts Ready-Made

Copy-paste کے لیے:

```
VENDOR TEST ACCOUNTS:
┌──────────────────────────────────────────────────┐
│ Phone: 03001234567                              │
│ Code: 123456                                    │
│ Name: Test Vendor 1                             │
│ Password: TestVendor@123                        │
└──────────────────────────────────────────────────┘

RIDER TEST ACCOUNTS:
┌──────────────────────────────────────────────────┐
│ Phone: 03001234568                              │
│ Code: 654321                                    │
│ Name: Test Rider 1                              │
│ Password: TestRider@123                         │
└──────────────────────────────────────────────────┘

CUSTOMER TEST ACCOUNTS:
┌──────────────────────────────────────────────────┐
│ Phone: 03001234569                              │
│ Code: 987654                                    │
│ Name: Test Customer 1                           │
│ Password: TestCustomer@123                      │
└──────────────────────────────────────────────────┘
```

---

## ✅ Quick Checklist

Registration complete کرنے سے پہلے:

- [ ] NODE_ENV = development confirmed
- [ ] Backend running (http://localhost:3000/api)
- [ ] Admin panel accessible (http://localhost:admin)
- [ ] Option A چنا: devCode یا Whitelist
- [ ] Test phone number تیار ہے
- [ ] Password requirement معلوم ہے (min 8, caps, special char)

---

## 🎓 Summary

**بہترین طریقہ:**
1. Development mode میں → devCode استعمال کریں (instant)
2. Team کے لیے → Whitelist بنائیں (reusable)
3. SMS outage simulation → Global suspend کریں

**کوئی SMS integration نہیں چاہیے** - سب کچھ test کے لیے بنا ہوا ہے! ✅

---

**کسی اور چیز میں مدد چاہیے؟ پوچھیں!**
