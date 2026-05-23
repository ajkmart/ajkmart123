# 📚 Registration Testing - Complete Guide Index

**Urdu/Hindi میں تمام تفصیلات**

---

## 🎯 فوری جواب

### سوال: "OTP real API سے connected نہیں — کیسے registration کریں؟"

### جواب: 4 طریقے ہیں

| طریقہ | سیٹ اپ | استعمال | بہترین |
|------|--------|--------|--------|
| **devCode** | 0 منٹ | Auto میں code ملتا ہے | ⚡ تیز |
| **Whitelist** | 2 منٹ | Phone add کریں admin میں | 🏢 ٹیم |
| **Per-User** | 1 منٹ | Admin سے bypass دیں | 🆘 مدد |
| **Global** | 30 سیکنڈ | تمام کے لیے OTP بند | 🔴 SMS down |

---

## 📖 دستاویزات

### 1. ⚡ [QUICK_REGISTRATION_GUIDE.md](QUICK_REGISTRATION_GUIDE.md)
**پڑھیں**: 2 منٹ
**کیا ہے**: 
- 3 سیکنڈ میں سمجھیں
- ہر method کے pros/cons
- Test accounts ready-made

### 2. 📱 [REGISTRATION_TESTING_GUIDE.md](REGISTRATION_TESTING_GUIDE.md)
**پڑھیں**: 10 منٹ
**کیا ہے**:
- مکمل step-by-step flows
- 3 apps کے لیے (vendor, rider, customer)
- Admin panel کیسے استعمال کریں
- Common issues اور fixes

### 3. 💻 [REGISTRATION_TECHNICAL_GUIDE.md](REGISTRATION_TECHNICAL_GUIDE.md)
**پڑھیں**: 20 منٹ
**کیا ہے**:
- Backend code snippets
- Database queries
- API endpoints
- Command-line testing
- Troubleshooting technical

---

## 🚀 شروع کریں (5 منٹ میں)

### Step 1: Backend چلائیں

```bash
cd artifacts/api-server
npm run dev
```

### Step 2: App کھولیں

```bash
# Option A: Vendor Registration
cd artifacts/vendor-app
npm run dev
# URL: http://localhost:3000/vendor

# Option B: Rider Registration  
cd artifacts/rider-app
npm run dev
# URL: http://localhost:3000/rider

# Option C: Customer Registration
cd artifacts/ajkmart
npm run dev
# URL: http://localhost:3000
```

### Step 3: Registration کریں

```
Phone: 03001234567
OTP: [devCode from response]
Name: Test User
City: Karachi
Password: Test@123456
✅ Done!
```

---

## 🎯 اپنے Task کے لیے صحیح Guide

### آپ کو یہ چاہیے:

**"بس تیز registration کرنی ہے"**
```
→ QUICK_REGISTRATION_GUIDE.md پڑھیں
→ devCode method استعمال کریں
→ کریں اور آگے بڑھیں
```

**"پوری ٹیم کو test accounts دینے ہیں"**
```
→ REGISTRATION_TESTING_GUIDE.md پڑھیں
→ Whitelist method استعمال کریں
→ Admin panel میں accounts add کریں
→ ٹیم کو phones دے دیں
```

**"Technical details چاہیں"**
```
→ REGISTRATION_TECHNICAL_GUIDE.md پڑھیں
→ Code snippets دیکھیں
→ API curl commands چلائیں
```

**"SQL سے whitelist manage کریں"**
```
→ REGISTRATION_TECHNICAL_GUIDE.md کا SQL section
→ Insert/Update/Delete queries استعمال کریں
```

---

## 📊 Methods کا Comparison

### devCode (Development OTP)

```
کیا ہے: Backend automatically 6-digit code return کرتا ہے
کہاں: Response میں: { "devCode": "654321" }
کب کام کرتا ہے: Development mode میں
کتنی بار: ہر OTP request پر نیا
```

### Whitelist (Test Accounts)

```
کیا ہے: Phone numbers کی list جنہیں OTP نہیں چاہیے
کہاں: Admin Panel → OTP Control
کب کام کرتا ہے: ہمیشہ
کتنی بار: جب تک expires نہ ہو
```

### Per-User Bypass (Support)

```
کیا ہے: Specific user کو temporary OTP bypass
کہاں: Admin Panel → Per-User Bypass
کب کام کرتا ہے: ہمیشہ
کتنی بار: جب تک minutes گزر نہ جائیں
```

### Global OTP Suspend (Emergency)

```
کیا ہے: تمام users کے لیے OTP بند
کہاں: Admin Panel → Global OTP Suspension
کب کام کرتا ہے: ہمیشہ
کتنی بار: جب تک timer expire نہ ہو
```

---

## ✅ Checklists

### Development Setup

- [ ] NODE_ENV = development
- [ ] Backend running
- [ ] Admin panel accessible
- [ ] App running (vendor/rider/customer)

### Registration Testing

- [ ] Method چنا (devCode/Whitelist/etc)
- [ ] Phone number تیار ہے
- [ ] Test account details save ہیں
- [ ] Registration successful ✅

### Post Registration

- [ ] User database میں ہے
- [ ] Roles assign ہیں
- [ ] Login ہو سکتے ہو
- [ ] Profile complete کریں

---

## 🔗 Quick Links

| Resource | Link |
|----------|------|
| Quick Start | [QUICK_REGISTRATION_GUIDE.md](QUICK_REGISTRATION_GUIDE.md) |
| Full Guide | [REGISTRATION_TESTING_GUIDE.md](REGISTRATION_TESTING_GUIDE.md) |
| Technical | [REGISTRATION_TECHNICAL_GUIDE.md](REGISTRATION_TECHNICAL_GUIDE.md) |
| OTP System | [OTP_QUICK_REFERENCE.md](OTP_QUICK_REFERENCE.md) |
| Admin Panel | [OTP_SYSTEM_ANALYSIS.md](OTP_SYSTEM_ANALYSIS.md) |

---

## 🎓 Learning Path

### Beginner (15 منٹ)

```
1. QUICK_REGISTRATION_GUIDE.md
   ↓ (Overview سمجھیں)
2. devCode method try کریں
   ↓ (تیز test کریں)
3. Registration complete کریں ✅
   ↓ (Practical)
4. اگلا: Multiple accounts کے لیے Whitelist try کریں
```

### Intermediate (30 منٹ)

```
1. REGISTRATION_TESTING_GUIDE.md (full)
   ↓ (تمام methods سیکھیں)
2. Whitelist add کریں admin میں
   ↓ (Practical)
3. Team کو accounts دیں
   ↓ (Collaboration)
4. Admin panel explore کریں
```

### Advanced (60 منٹ)

```
1. REGISTRATION_TECHNICAL_GUIDE.md
   ↓ (Code level سمجھیں)
2. API curl commands چلائیں
   ↓ (Testing)
3. SQL queries اپنے آپ لکھیں
   ↓ (Database)
4. Code میں checkOTPBypass() function دیکھیں
   ↓ (Architecture)
```

---

## 🆘 Help Section

### "devCode response میں نہیں ہے"

```
→ Check 1: NODE_ENV=development
→ Check 2: Backend restart کریں
→ Check 3: Logs میں "[DEV MODE]" message دیکھیں
→ Read: REGISTRATION_TECHNICAL_GUIDE.md → Troubleshooting
```

### "Whitelist کام نہیں کر رہی"

```
→ Check 1: Phone format صحیح ہے
→ Check 2: is_active = true
→ Check 3: expires_at future میں ہے
→ Read: REGISTRATION_TECHNICAL_GUIDE.md → SQL section
```

### "Registration complete نہیں ہو رہی"

```
→ Check 1: OTP correct ہے
→ Check 2: Password requirements: min 8, caps, special
→ Check 3: Phone already registered نہیں
→ Read: REGISTRATION_TESTING_GUIDE.md → Issues
```

### "Admin panel نہیں مل رہی"

```
→ URL: http://localhost:admin/otp-control
→ Or: http://localhost:3001 (depending on setup)
→ Read: REGISTRATION_TESTING_GUIDE.md → Admin Panel section
```

---

## 📝 Test Accounts (Ready-Made)

```
VENDOR TEST:
├─ Phone: 03001234567
├─ Name: Test Vendor 1
├─ Password: TestVendor@123
├─ Role: vendor
└─ Status: Ready to use ✅

RIDER TEST:
├─ Phone: 03001234568
├─ Name: Test Rider 1
├─ Password: TestRider@123
├─ Role: rider
└─ Status: Ready to use ✅

CUSTOMER TEST:
├─ Phone: 03001234569
├─ Name: Test Customer 1
├─ Password: TestCustomer@123
├─ Role: customer
└─ Status: Ready to use ✅
```

---

## 🏆 Best Practices

### Development میں

✅ **Do:**
- devCode method use کریں (fastest)
- Whitelist بنائیں team کے لیے
- Multiple test accounts رکھیں
- Admin panel explore کریں

❌ **Don't:**
- Real SMS services configure نہ کریں
- Production credentials dev میں نہ رکھیں
- Test codes production میں نہ بھیجیں

### Production میں

✅ **Do:**
- Real SMS API integrate کریں
- Rate limiting enable کریں
- Audit logging check کریں
- devCode field hide کریں

---

## 🎉 Summary

```
OTP API نہیں ہے? Koi problem نہیں!
↓
devCode → Whitelist → Per-User → Global
↓
4 methods سے registration کر سکتے ہو
↓
Guides پڑھیں، guides میں code ہے
↓
Commands چلائیں، registration complete کریں
↓
✅ DONE!
```

---

## 📞 Questions?

| سوال | Guide |
|------|-------|
| "کیسے registration کریں؟" | QUICK_REGISTRATION_GUIDE |
| "Whitelist کیسے add کریں؟" | REGISTRATION_TESTING_GUIDE |
| "API کیسے test کریں؟" | REGISTRATION_TECHNICAL_GUIDE |
| "OTP system کیا ہے؟" | OTP_QUICK_REFERENCE |

---

**Happy Testing! 🚀**

**Created**: May 23, 2026  
**For**: AJKMart Development Team  
**Status**: ✅ Ready to Use
