import { SocialButtons } from "./SocialButtons";

export interface SocialLoginButtonsProps {
  onGooglePress?: () => void;
  onFacebookPress?: () => void;
  loadingProvider?: "google" | "facebook" | null;
  disabled?: boolean;
  className?: string;
  label?: string;
}

export function SocialLoginButtons({
  onGooglePress,
  onFacebookPress,
  loadingProvider = null,
  disabled = false,
  className,
  label,
}: SocialLoginButtonsProps) {
  return (
    <SocialButtons
      className={className}
      label={label}
      disabled={disabled}
      onGoogle={onGooglePress}
      onFacebook={onFacebookPress}
      googleLoading={loadingProvider === "google"}
      facebookLoading={loadingProvider === "facebook"}
    />
  );
}
