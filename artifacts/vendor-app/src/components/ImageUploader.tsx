import { tDual, type TranslationKey } from "@workspace/i18n";
import { useRef, useState } from "react";
import { api } from "../lib/api";
import { INPUT, LABEL } from "../lib/ui";
import { usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
import { SafeImage } from "./ui/SafeImage";

const DEFAULT_MAX_IMAGE_MB = 5;
const DEFAULT_ALLOWED_IMAGE_FORMATS = ["image/jpeg", "image/png", "image/webp"];

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  placeholder?: string;
  previewHeight?: string;
}

export function ImageUploader({
  value,
  onChange,
  label,
  placeholder = "https://...",
  previewHeight = "h-40",
}: ImageUploaderProps) {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { config } = usePlatformConfig();

  const maxImageMb = config.uploads?.maxImageMb ?? DEFAULT_MAX_IMAGE_MB;
  const allowedFormats =
    (config.uploads?.allowedImageFormats ?? []).length > 0
      ? config.uploads!.allowedImageFormats!.map((f) => `image/${f}`)
      : DEFAULT_ALLOWED_IMAGE_FORMATS;
  const allowedFormatLabels = (config.uploads?.allowedImageFormats ?? ["jpeg", "png", "webp"])
    .map((f) => f.toUpperCase())
    .join(", ");

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"upload" | "url">(
    value && value.startsWith("http") ? "url" : "upload"
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (uploading) return;
    if (!allowedFormats.some((fmt) => file.type === fmt || file.type.startsWith(fmt))) {
      setError(T("invalidFileType"));
      return;
    }
    if (file.size > maxImageMb * 1024 * 1024) {
      setError(T("fileTooLarge"));
      return;
    }
    setError("");
    setUploading(true);
    try {
      const result = await api.uploadImage(file);
      onChange(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : T("somethingWentWrong"));
    }
    setUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (uploading) return;
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className={`${LABEL} mb-0`}>{label || T("imageUrlLabel")}</label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMode("upload")}
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors ${
              mode === "upload"
                ? "bg-blue-100 text-blue-600"
                : "bg-gray-100 text-gray-400 hover:text-gray-600"
            }`}
          >
            📷 {T("send")}
          </button>
          <button
            type="button"
            onClick={() => setMode("url")}
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors ${
              mode === "url"
                ? "bg-blue-100 text-blue-600"
                : "bg-gray-100 text-gray-400 hover:text-gray-600"
            }`}
          >
            🔗 URL
          </button>
        </div>
      </div>

      {mode === "upload" ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`w-full cursor-pointer rounded-xl border-2 border-dashed transition-colors ${
            uploading
              ? "border-blue-300 bg-blue-50"
              : value
                ? "border-green-300 bg-green-50"
                : "border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50"
          } flex flex-col items-center justify-center px-4 py-6`}
        >
          <input
            ref={fileRef}
            type="file"
            accept={allowedFormats.join(",")}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          {uploading ? (
            <>
              <div className="mb-2 h-8 w-8 animate-spin rounded-full border-3 border-blue-400 border-t-transparent" />
              <p className="text-xs font-bold text-blue-600">{T("loading")}</p>
            </>
          ) : value ? (
            <>
              <p className="mb-1 text-xs font-bold text-green-600">✓ {T("success")}</p>
              <p className="text-[10px] text-gray-400">{T("edit")}</p>
            </>
          ) : (
            <>
              <span className="mb-1 text-2xl">📷</span>
              <p className="text-xs font-bold text-gray-500">{T("imageUrlLabel")}</p>
              <p className="mt-0.5 text-[10px] text-gray-400">
                {allowedFormatLabels} · Max {maxImageMb}MB
              </p>
            </>
          )}
        </div>
      ) : (
        <input
          type="url"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setError("");
          }}
          placeholder={placeholder}
          className={INPUT}
        />
      )}

      {error && <p className="mt-1 text-xs font-medium text-red-500">⚠️ {error}</p>}

      {value && (
        <div
          className={`overflow-hidden rounded-xl ${previewHeight} group relative mt-3 bg-gray-100`}
        >
          <SafeImage
            key={value}
            src={value}
            alt="preview"
            className="h-full w-full object-cover"
            fallbackClassName="w-full h-full"
            loading="eager"
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-xs font-bold text-white opacity-0 transition-opacity group-hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
