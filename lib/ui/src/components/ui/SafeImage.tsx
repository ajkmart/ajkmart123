import { ImageOff } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";

export interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  fallbackClassName?: string;
}

/**
 * SafeImage — a drop-in <img> replacement for images loaded from external
 * URLs or CDN-backed sources.
 *
 * Behaviours applied automatically:
 * - `crossOrigin="anonymous"` — prevents tainting the canvas and satisfies
 *   CORP requirements on strict CDNs.
 * - `loading="lazy"` (below-fold default) — defer off-screen fetches.
 * - `onError` — swaps the broken image for a neutral `<ImageOff>` icon
 *   so broken avatars / product thumbnails never show empty boxes.
 *
 * Pass `loading="eager"` for above-the-fold hero images.
 */
export function SafeImage({
  src,
  alt,
  className,
  fallbackClassName,
  loading = "lazy",
  ...rest
}: SafeImageProps) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <span
        role="img"
        aria-label={alt || "Image unavailable"}
        className={cn(
          "bg-muted text-muted-foreground inline-flex items-center justify-center",
          fallbackClassName ?? className
        )}
      >
        <ImageOff className="h-1/2 max-h-8 w-1/2 max-w-8 opacity-50" aria-hidden="true" />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      crossOrigin="anonymous"
      className={className}
      onError={() => setErrored(true)}
      {...rest}
    />
  );
}
