# ⚡ Registration Testing - Quick Reference

## 3 سیکنڈ میں سمجھیں

```
OTP API real سے connected نہیں ہے؟
↓
Koi problem نہیں! Testing کے لیے 4 methods ہیں:
```

---

## **Method 1: devCode (FASTEST)** ⚡

```
1. App میں Phone ڈالیں
2. "Send OTP" دبائیں
3. Backend سے ملے گی:
   {
     "devCode": "123456"  ← یہ use کریں!
   }
4. App میں ڈالیں
5. Done ✅
```

**Pros:** 
- ✅ 1 click
- ✅ Automatic
- ✅ ہر بار نیا code

**Cons:**
- ❌ Dev mode only

---

## **Method 2: Whitelist (TEAM)** 🏢

```
1. ONCE: Admin Panel میں add کریں:
   Phone: 03001234567
   Code: 123456
   
2. REPEAT: Registration کریں:
   Phone: 03001234567
   OTP: Skip ✅
   Done!
```

**Pros:**
- ✅ پوری team استعمال کر سکتی ہے
- ✅ Permanent
- ✅ SMS نہیں بھیجے

**Cons:**
- ⚠️ Setup time لگتا ہے

---

## **Method 3: Per-User Bypass (SUPPORT)** 🆘

```
1. Admin Panel میں user تلاش کریں
2. "Grant Bypass" → "1 hour"
3. User: براہ راست login (OTP نہیں)
```

**Pros:**
- ✅ Stuck users کو help کر سکتے ہو

**Cons:**
- ⚠️ صرف 1 گھنٹے کے لیے

---

## **Method 4: Global Suspend (SMS OUTAGE)** 🔴

```
1. Admin Panel → "Suspend OTP"
2. Duration: 1 hour
3. Reason: "Testing"
4. ✅ سب کے لیے OTP bypass ہو گیا
```

---

## 🎯 کون سا method استعمال کریں؟

| Scenario | Use This |
|----------|----------|
| Quick test | devCode |
| QA team | Whitelist |
| Customer help | Per-user |
| SMS down sim | Global |

---

## 📋 Test Accounts (Copy-Paste)

```
VENDOR:
Phone: 03001234567
Name: Test Vendor 1
Pass: TestVendor@123

RIDER:
Phone: 03001234568
Name: Test Rider 1
Pass: TestRider@123

CUSTOMER:
Phone: 03001234569
Name: Test Customer 1
Pass: TestCustomer@123
```

---

## 🔍 Admin Panel URL

```
http://localhost:admin/otp-control
```

---

## ✅ Registration Flow (devCode)

```
Vendor App
↓
Phone: 03001234567
↓
Send OTP → devCode: 654321
↓
Enter OTP: 654321
↓
Name: My Shop
↓
City: Karachi
↓
Password: VendorPass@123
↓
✅ REGISTERED!
```

---

## 🚀 Start Now

```bash
# Terminal 1: Backend چلائیں
cd artifacts/api-server
npm run dev

# Terminal 2: Admin Panel چلائیں
cd artifacts/admin
npm run dev

# Terminal 3: App چلائیں
cd artifacts/ajkmart (یا rider-app/vendor-app)
npm run dev
```

---

**Done! اب registration کر سکتے ہو!** 🎉
