# 🎯 Registration Testing - Visual Summary

**بصری خلاصہ - سب کچھ ایک نگاہ میں**

---

## سوال: "OTP API نہیں ہے — کیسے registration کریں؟"

## جواب: یہ 4 طریقے استعمال کریں

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Method 1: devCode                                             │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Backend automatically returns: { devCode: "123456" }    │ │
│  │ Setup: 0 minutes                                        │ │
│  │ Speed: ⚡⚡⚡ Instant                                    │ │
│  │ Best for: Quick personal testing                       │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Method 2: Whitelist                                           │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Add phone to admin panel → Permanent bypass             │ │
│  │ Setup: 2 minutes                                        │ │
│  │ Speed: ⚡⚡ Fast                                         │ │
│  │ Best for: Team, multiple accounts                      │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Method 3: Per-User Bypass                                     │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Admin grants OTP bypass → Temporary (1 hour)            │ │
│  │ Setup: 1 minute                                         │ │
│  │ Speed: ⚡⚡ Fast                                         │ │
│  │ Best for: Helping stuck users                          │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Method 4: Global Suspend                                      │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Suspend OTP for ALL users → Testing SMS outages         │ │
│  │ Setup: 30 seconds                                       │ │
│  │ Speed: ⚡ Very Fast                                     │ │
│  │ Best for: Emergency scenarios                          │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Registration Flow (devCode سے)

```
┌─────────────────────────────────────────────────────────────────┐
│                    REGISTRATION FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Step 1: Open App                                              │
│  ┌───────────────────────────────────────────┐                │
│  │ http://localhost:3000/vendor             │                │
│  └───────────────────────────────────────────┘                │
│                          ↓                                     │
│  Step 2: Enter Phone Number                                   │
│  ┌───────────────────────────────────────────┐                │
│  │ Phone: 03001234567                        │                │
│  │ [Next Button]                             │                │
│  └───────────────────────────────────────────┘                │
│                          ↓                                     │
│  Step 3: Send OTP                                             │
│  ┌───────────────────────────────────────────┐                │
│  │ [Send OTP Button]                         │                │
│  │                                           │                │
│  │ Backend Returns:                          │                │
│  │ {                                         │                │
│  │   "otpRequired": true,                    │                │
│  │   "devCode": "654321"  ← Copy THIS!      │                │
│  │ }                                         │                │
│  └───────────────────────────────────────────┘                │
│                          ↓                                     │
│  Step 4: Enter OTP Code                                       │
│  ┌───────────────────────────────────────────┐                │
│  │ OTP Code: 654321 ← Paste Here             │                │
│  │ [Verify Button]                           │                │
│  └───────────────────────────────────────────┘                │
│                          ↓                                     │
│  Step 5: Full Name                                            │
│  ┌───────────────────────────────────────────┐                │
│  │ Full Name: Test Vendor                    │                │
│  │ [Next Button]                             │                │
│  └───────────────────────────────────────────┘                │
│                          ↓                                     │
│  Step 6: Select City                                          │
│  ┌───────────────────────────────────────────┐                │
│  │ City: [Karachi ▼]                         │                │
│  │ [Next Button]                             │                │
│  └───────────────────────────────────────────┘                │
│                          ↓                                     │
│  Step 7: Password                                             │
│  ┌───────────────────────────────────────────┐                │
│  │ Password: TestVendor@123                  │                │
│  │ (min 8 chars, caps, special chars needed) │                │
│  │ [Register Button]                         │                │
│  └───────────────────────────────────────────┘                │
│                          ↓                                     │
│  ✅ SUCCESS!                                                  │
│  ┌───────────────────────────────────────────┐                │
│  │ Vendor Account Created!                   │                │
│  │ ID: user_xxx                              │                │
│  │ Role: vendor                              │                │
│  │ Status: is_verified = false               │                │
│  └───────────────────────────────────────────┘                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Whitelist Method (ٹیم کے لیے)

```
┌─────────────────────────────────────────────────────────────────┐
│                   WHITELIST METHOD                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SETUP (Admin Panel - ایک بار)                                │
│  ┌────────────────────────────────────────┐                   │
│  │ 1. Go to: http://localhost:admin       │                   │
│  │    → OTP Control                        │                   │
│  │    → Per-User OTP Bypass section       │                   │
│  │                                        │                   │
│  │ 2. Click: "+ Add Whitelist"            │                   │
│  │                                        │                   │
│  │ 3. Fill Form:                          │                   │
│  │    Identifier: 03001234567             │                   │
│  │    Bypass Code: 123456                 │                   │
│  │    Expires: 1 month ahead              │                   │
│  │    Active: ✅                           │                   │
│  │                                        │                   │
│  │ 4. Click: Save ✅                       │                   │
│  └────────────────────────────────────────┘                   │
│                          ↓                                     │
│  TESTING (بار بار)                                            │
│  ┌────────────────────────────────────────┐                   │
│  │ 1. Open App                            │                   │
│  │ 2. Phone: 03001234567 (same as added)  │                   │
│  │ 3. Send OTP → SMS bypass automatic ✅  │                   │
│  │ 4. Continue → Full Name → City → Pass  │                   │
│  │ 5. Done! Account created ✅             │                   │
│  └────────────────────────────────────────┘                   │
│                                                                 │
│  Benefit: Entire team can register instantly                   │
│           No manual OTP entry needed                           │
│           Can do it 100 times                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Test Accounts (Ready-Made)

```
┌─────────────────────────────────────────────────────────────────┐
│                    TEST ACCOUNTS                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🟦 VENDOR ACCOUNT                                             │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Phone:    03001234567                                     │ │
│  │ Name:     Test Vendor 1                                  │ │
│  │ Password: TestVendor@123                                 │ │
│  │ Role:     vendor                                         │ │
│  │ Status:   Ready to use ✅                                │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  🟩 RIDER ACCOUNT                                              │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Phone:    03001234568                                     │ │
│  │ Name:     Test Rider 1                                   │ │
│  │ Password: TestRider@123                                  │ │
│  │ Role:     rider                                          │ │
│  │ Status:   Ready to use ✅                                │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  🟧 CUSTOMER ACCOUNT                                           │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Phone:    03001234569                                     │ │
│  │ Name:     Test Customer 1                                │ │
│  │ Password: TestCustomer@123                               │ │
│  │ Role:     customer                                       │ │
│  │ Status:   Ready to use ✅                                │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## OTP Backend Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                  OTP BACKEND CHECK FLOW                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User sends: POST /auth/send-otp { phone: "03001234567" }      │
│                          ↓                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Step 1: Check if user.otpBypassUntil > NOW()              │ │
│  │  ✅ If true → Return { otpRequired: false }                │ │
│  │  ❌ If false → Continue                                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                          ↓                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Step 2: Check platform_settings[otp_global_disabled]      │ │
│  │  ✅ If true → Return { otpRequired: false }                │ │
│  │  ❌ If false → Continue                                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                          ↓                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Step 3: Check whitelist_users[phone]                       │ │
│  │  ✅ If found & active → Return { otpRequired: false }      │ │
│  │  ❌ If not found → Continue                               │ │
│  └────────────────────────────────────────────────────────────┘ │
│                          ↓                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Step 4: Generate OTP Code (Normal)                         │ │
│  │  • Generate: 6-digit random                               │ │
│  │  • Hash: bcrypt (rounds=10)                                │ │
│  │  • Store: otp_tokens table                                │ │
│  │  • Deliver: SMS/WhatsApp                                  │ │
│  │  • Dev mode: Return { devCode: "123456" }                │ │
│  │  • Prod mode: No devCode                                 │ │
│  └────────────────────────────────────────────────────────────┘ │
│                          ↓                                      │
│  Return Response: { success, otpRequired, devCode?, channel }   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Quick Decision Tree

```
                    "کیسے registration کریں?"
                              ↓
                  ┌───────────────────────┐
                  │ Is backend running?   │
                  └───────────────────────┘
                      ↙                ↘
                   NO ❌              YES ✅
                    ↙                   ↘
            Start backend         NODE_ENV?
                ↓                    ↙   ↘
           Try again           dev ✅  prod ❌
                              ↙         ↘
                     devCode        Switch to
                   Response?        dev mode
                      ↙  ↘
                   Yes ✅ No ❌
                    ↙      ↘
                Use it    Use Whitelist
                  ↓         ↓
           Registration  Add in Admin
             Complete        ↓
                ✅      Registration
                        Complete ✅
```

---

## Timeline Comparison

```
METHOD             SETUP TIME    FIRST TEST    REPEAT TEST    BEST FOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
devCode            0 min         2 min         2 min          ⚡ Quick
Whitelist          2 min         3 min         3 min          🏢 Team
Per-User Bypass    1 min         1 min         1 min          🆘 Help
Global Suspend     30 sec        3 min         3 min          🔴 SMS down
```

---

## Success Indicators

```
✅ Registration Complete When:

└─ User table میں entry ہے
   └─ roles = ["vendor"|"rider"|"customer"]
   └─ is_verified = false (pending approval)
   └─ Can login with phone + password
   └─ Profile visible in dashboard
```

---

## Documents to Read

```
START HERE:
│
├─ ⚡ 2 min  → QUICK_REGISTRATION_GUIDE.md
│  (Overview, 3 methods, pros/cons)
│
├─ 📱 10 min → REGISTRATION_TESTING_GUIDE.md
│  (Complete flows, admin panel, issues)
│
├─ 💻 20 min → REGISTRATION_TECHNICAL_GUIDE.md
│  (Code, API, database, curl commands)
│
└─ 📚 5 min  → REGISTRATION_GUIDE_INDEX.md
   (This index - pick your path)
```

---

**Choose your method → Follow the guide → Registration done!** ✅

**کوئی سوال؟ Guides میں سب کچھ ہے!**
