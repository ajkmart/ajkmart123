/**
 * Auth ThemeContext — ajkmart (Expo / React Native)
 *
 * Thin re-export from the shared auth library.  Placing this file in every
 * app's lib/auth/ means each app imports its theme context from a local
 * path, making it trivial to swap the implementation later.
 *
 * Usage:
 *   import { ThemeProvider } from "@/lib/auth/ThemeContext";
 *   <ThemeProvider role="customer"><App /></ThemeProvider>
 *
 *   import { useTheme } from "@/lib/auth/ThemeContext";
 *   const theme = useTheme();  // { primary, background, text, … }
 */
export {
  ThemeProvider,
  useAuthTheme as useTheme,
  ThemeContext,
  DEFAULT_THEMES,
} from "@workspace/auth-react";
export type { AuthTheme, ThemeProviderProps } from "@workspace/auth-react";
