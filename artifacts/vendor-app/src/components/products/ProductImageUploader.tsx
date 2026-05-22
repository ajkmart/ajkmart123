import { CARD, LABEL } from "../../lib/ui";

interface ProductImageUploaderProps {
  videoUrl: string;
  onVideoChange: (url: string) => void;
  videoUploading: boolean;
  onVideoUpload: (file: File) => void;
  allowedVideoFormats: string[];
  maxVideoMb: number;
  maxVideoDurationSec: number;
  uploadFormatLabels: string[];
}

export function ProductImageUploader({
  videoUrl,
  onVideoChange,
  videoUploading,
  onVideoUpload,
  allowedVideoFormats,
  maxVideoMb,
  maxVideoDurationSec,
  uploadFormatLabels,
}: ProductImageUploaderProps) {
  return (
    <div className={`${CARD} space-y-3 p-4`}>
      <label className={LABEL}>Upload Video (optional, ≤{maxVideoDurationSec}s)</label>

      {videoUrl ? (
        <div className="space-y-2">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
            <video
              src={videoUrl}
              className="h-full w-full object-contain"
              controls
              muted
              playsInline
            />
          </div>
          <div className="flex gap-2">
            <label className="android-press flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-blue-50 text-sm font-bold text-blue-600">
              <span>🔄 Replace</span>
              <input
                type="file"
                accept={allowedVideoFormats.join(",")}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onVideoUpload(file);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              onClick={() => onVideoChange("")}
              className="android-press h-9 flex-1 rounded-xl bg-red-50 text-sm font-bold text-red-500"
            >
              🗑️ Remove
            </button>
          </div>
        </div>
      ) : (
        <label
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 transition-colors ${
            videoUploading
              ? "border-blue-300 bg-blue-50"
              : "border-gray-200 hover:border-blue-300 hover:bg-blue-50/50"
          }`}
        >
          {videoUploading ? (
            <>
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-400 border-t-transparent" />
              <span className="text-sm font-semibold text-blue-600">Uploading video...</span>
            </>
          ) : (
            <>
              <span className="text-2xl">🎬</span>
              <span className="text-sm font-semibold text-gray-600">
                Tap to upload a product video
              </span>
              <span className="text-xs text-gray-400">
                {uploadFormatLabels.map((fmt) => fmt.toUpperCase()).join(", ")} · Max {maxVideoMb}MB
                · ≤{maxVideoDurationSec}s
              </span>
            </>
          )}
          <input
            type="file"
            accept={allowedVideoFormats.join(",")}
            className="hidden"
            disabled={videoUploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onVideoUpload(file);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}
