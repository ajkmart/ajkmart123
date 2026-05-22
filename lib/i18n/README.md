# @workspace/i18n

Shared internationalisation (i18n) library for AJKMart. Provides typed translation keys, RTL detection, and dual-language rendering across all client apps.

## Supported Languages

| Mode | Code | Description |
|---|---|---|
| English | `en` | Standard English (default) |
| Urdu | `ur` | Full Urdu in Nastaliq script (RTL) |
| Roman Urdu | `ur-roman` | Urdu written in Latin script (LTR) |
| English + Roman Urdu | `en-ur-roman` | Dual-line: English on top, Roman Urdu below |
| English + Urdu | `en-ur` | Dual-line: English on top, Urdu Nastaliq below |

## Usage

```ts
import { t, tDual, isRTL } from "@workspace/i18n";

// Single-language translation
const label = t("navHome", "en");         // "Home"
const label = t("navHome", "ur");         // "ہوم"
const label = t("navHome", "ur-roman");   // "Hom"

// Dual-line translation (returns { primary, secondary })
const dual = tDual("navHome", "en-ur");
// { primary: "Home", secondary: "ہوم" }

// RTL detection (use to flip layout direction)
isRTL("ur");         // true
isRTL("en");         // false
isRTL("en-ur");      // false  (primary language is English)
isRTL("ur-roman");   // false  (Latin script, LTR)
```

The Urdu Nastaliq font (`Noto Nastaliq Urdu`) is loaded via Google Fonts CDN on web and `@expo-google-fonts/noto-nastaliq-urdu` on mobile.

## Adding New Translation Keys

1. Open `lib/i18n/src/index.ts`
2. Add the key to **all three** translation sections: `en`, `ur`, and `ur-roman`
3. TypeScript will error on any missing key across sections

```ts
// lib/i18n/src/index.ts

const en = {
  // ... existing keys
  myNewKey: "My New Label",       // ← add here
};

const ur = {
  // ... existing keys
  myNewKey: "میرا نیا لیبل",      // ← and here
};

const urRoman = {
  // ... existing keys
  myNewKey: "Mera Naya Label",    // ← and here
};
```

## Translation Key Naming Convention

- Use **camelCase** for all keys: `navHome`, `btnSubmit`, `errorInvalidPhone`
- Prefix by domain: `nav*` for navigation, `btn*` for buttons, `error*` for errors, `label*` for form labels
- Keep keys descriptive but concise — they are used as identifiers across all apps
