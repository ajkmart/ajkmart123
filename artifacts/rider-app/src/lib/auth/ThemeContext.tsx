/**
 * Auth ThemeContext — rider-app
 *
 * Thin re-export from the shared auth library.  Placing this file in every
 * app's src/lib/auth/ means each app imports its theme context from a local
 * path, making it trivial to swap the implementation later without touching
 * import paths across the codebase.
 *
 * Usage:
 *   import { ThemeProvider } from "./lib/auth/ThemeContext";
 *   <ThemeProvider role="rider"><App /></ThemeProvider>
 *
 *   import { useTheme } from "./lib/auth/ThemeContext";
 *   const theme = useTheme();  // { primary, background, text, … }
 */
export {
  DEFAULT_THEMES,
  ThemeContext,
  ThemeProvider,
  useAuthTheme as useTheme,
} from "@workspace/auth-react";
export type { AuthTheme, ThemeProviderProps } from "@workspace/auth-react";
