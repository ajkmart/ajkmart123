# @workspace/auth-react

Shared authentication UI and logic for AJKMart web apps (vendor portal, rider PWA).

## Installation

This package is available as a workspace dependency — no extra install needed:

```json
"@workspace/auth-react": "workspace:*"
```

## Basic usage

Wrap your app with `AuthProvider`, then use the pre-built `LoginScreen` component:

```tsx
import { AuthProvider, LoginScreen } from "@workspace/auth-react";

function App() {
  return (
    <AuthProvider baseURL="/api" tokenStorage="web">
      <LoginScreen onSuccess={() => navigate("/dashboard")} />
    </AuthProvider>
  );
}
```

## Key hooks

| Hook | Purpose |
|---|---|
| `useAuth()` | Access `user`, `token`, `logout()`, and auth state |
| `useLoginFlow()` | Drive the OTP / password / 2FA login state machine |

## Token storage modes

| Mode | Used for | Backing store |
|---|---|---|
| `"web"` | Browser apps | `localStorage` |
| `"native"` | Expo / React Native | `expo-secure-store` |

## Components

- `LoginScreen` — full phone/OTP and username/password login UI (web only)
- `OtpInput` — 6-digit OTP input with auto-advance and paste support
- `PhoneInput` — international phone number input with country picker
- `PasswordInput` — password field with show/hide toggle
- `SocialButtons` — Google and Facebook sign-in buttons
- `BiometricPrompt` — biometric authentication prompt overlay

## Provider

`SharedAuthProvider` wraps the app with both React Query (`QueryClientProvider`) and the shared `AuthContext`. Mount it once at the root of each web app:

```tsx
import { SharedAuthProvider } from "@workspace/auth-react";

// In your app root (e.g. main.tsx or App.tsx)
<SharedAuthProvider apiBase="/api">
  <App />
</SharedAuthProvider>
```

## Usage Across Apps

| App | Uses `SharedAuthProvider` | Notes |
|---|---|---|
| **Admin Panel** (`artifacts/admin`) | Yes | Admin-scoped JWT, separate login page |
| **Vendor App** (`artifacts/vendor-app`) | Yes | Vendor-scoped JWT |
| **Rider App** (`artifacts/rider-app`) | Yes | Rider-scoped JWT |
| **Customer App** (`artifacts/ajkmart`) | No | Uses native `AuthContext` + `expo-secure-store` |
