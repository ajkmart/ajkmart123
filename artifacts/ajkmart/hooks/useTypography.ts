import { useLanguage } from "@/context/LanguageContext";
import { getTypography, getFontFamily } from "@/constants/colors";

export function useTypography() {
  const { language } = useLanguage();
  return getTypography(language);
}

export function useFontFamily() {
  const { language } = useLanguage();
  return getFontFamily(language);
}
