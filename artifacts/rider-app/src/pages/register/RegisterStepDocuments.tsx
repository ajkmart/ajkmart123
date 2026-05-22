import { tDual, type TranslationKey } from "@workspace/i18n";
import { CheckCircle2, FileText, Image, Loader2 } from "lucide-react";
import { useRef } from "react";
import { SafeImage } from "../../components/ui/SafeImage";
import { useLanguage } from "../../lib/useLanguage";

export interface UploadedDoc {
  label: string;
  url: string;
  preview: string;
}

function FileUploadBox({
  label,
  icon,
  value,
  onChange,
  required,
  optimising,
  uploading,
  progress,
  error,
  onRetry,
}: {
  label: string;
  icon: React.ReactNode;
  value: UploadedDoc | null;
  onChange: (file: File) => void;
  required?: boolean;
  optimising?: boolean;
  uploading?: boolean;
  progress?: number;
  error?: string;
  onRetry?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const busy = optimising || uploading;
  const pct = uploading && progress != null ? Math.max(0, Math.min(100, progress)) : 0;

  return (
    <div>
      <div
        className={`overflow-hidden rounded-xl border-2 border-dashed transition-all ${
          error
            ? "border-red-400 bg-red-50/50"
            : value && !busy
              ? "border-green-300 bg-green-50/50"
              : uploading
                ? "border-blue-300 bg-blue-50/30"
                : "border-gray-200 bg-gray-50/50 hover:border-gray-400"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) onChange(e.target.files[0]);
          }}
        />

        <div className="p-3">
          {value && !busy ? (
            <div className="flex items-center gap-3">
              <SafeImage
                src={value.preview}
                alt={label}
                className="h-14 w-14 rounded-lg border border-green-200 object-cover"
                loading="eager"
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-xs font-bold text-green-700">
                  <CheckCircle2 size={12} /> {label}
                </p>
                <p className="truncate text-[10px] text-green-600">
                  {value.url ? T("photoUploaded") : T("photoReady2")}
                </p>
              </div>
              <button
                onClick={() => inputRef.current?.click()}
                className="rounded-lg px-2 py-1 text-[10px] font-bold text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              >
                {T("changePhoto")}
              </button>
            </div>
          ) : uploading ? (
            <div className="flex flex-col items-center gap-1.5 py-1.5">
              <Loader2 size={18} className="animate-spin text-blue-500" />
              <span className="text-xs font-semibold text-blue-600">{label}</span>
              <span className="text-[10px] font-bold text-blue-500">
                {pct > 0 ? `${pct}%` : "Preparing…"}
              </span>
            </div>
          ) : (
            <button
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="flex w-full flex-col items-center gap-1.5 py-2 disabled:opacity-50"
            >
              {optimising ? <Loader2 size={20} className="animate-spin text-amber-500" /> : icon}
              <span className={`text-xs font-semibold ${error ? "text-red-600" : "text-gray-600"}`}>
                {label} {required && <span className="text-red-500">*</span>}
              </span>
              {optimising && (
                <span className="text-[10px] font-semibold text-amber-600">Optimising…</span>
              )}
              {!busy && <span className="text-[10px] text-gray-400">{T("tapCaptureUpload")}</span>}
            </button>
          )}
        </div>

        {/* Upload progress bar — shown at bottom of card when uploading */}
        {uploading && (
          <div className="h-1 w-full bg-blue-100">
            <div
              className="h-full bg-blue-500 transition-all duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
      {error && (
        <div className="mt-1 flex items-center gap-2">
          <p className="flex-1 text-[10px] font-medium text-red-500">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="rounded-lg border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600 hover:bg-red-100 hover:text-red-800"
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export interface RegisterStepDocumentsProps {
  vehiclePhoto: UploadedDoc | null;
  setVehiclePhoto: (d: UploadedDoc) => void;
  cnicPhoto: UploadedDoc | null;
  setCnicPhoto: (d: UploadedDoc) => void;
  cnicBackPhoto: UploadedDoc | null;
  setCnicBackPhoto: (d: UploadedDoc) => void;
  licensePhoto: UploadedDoc | null;
  setLicensePhoto: (d: UploadedDoc) => void;
  handleFileUpload: (file: File, field: string, setter: (d: UploadedDoc) => void) => Promise<void>;
  uploadErrors: Record<string, string>;
  lastFiles: Record<string, File>;
  optimisingField: string;
  uploadingField: string;
  uploadProgress?: Record<string, number>;
}

export function RegisterStepDocuments({
  vehiclePhoto,
  setVehiclePhoto,
  cnicPhoto,
  setCnicPhoto,
  cnicBackPhoto,
  setCnicBackPhoto,
  licensePhoto,
  setLicensePhoto,
  handleFileUpload,
  uploadErrors,
  lastFiles,
  optimisingField,
  uploadingField,
  uploadProgress = {},
}: RegisterStepDocumentsProps) {
  return (
    <div className="space-y-2">
      <FileUploadBox
        label="Vehicle Photo"
        icon={<Image size={20} className="text-gray-500" />}
        value={vehiclePhoto}
        onChange={(f) => handleFileUpload(f, "vehicle", setVehiclePhoto)}
        required
        optimising={optimisingField === "vehicle"}
        uploading={uploadingField === "vehicle"}
        progress={uploadProgress["vehicle"]}
        error={uploadErrors["vehicle"]}
        onRetry={
          uploadErrors["vehicle"] && lastFiles["vehicle"]
            ? () => handleFileUpload(lastFiles["vehicle"], "vehicle", setVehiclePhoto)
            : undefined
        }
      />
      <FileUploadBox
        label="CNIC Front"
        icon={<FileText size={20} className="text-blue-500" />}
        value={cnicPhoto}
        onChange={(f) => handleFileUpload(f, "cnic", setCnicPhoto)}
        required
        optimising={optimisingField === "cnic"}
        uploading={uploadingField === "cnic"}
        progress={uploadProgress["cnic"]}
        error={uploadErrors["cnic"]}
        onRetry={
          uploadErrors["cnic"] && lastFiles["cnic"]
            ? () => handleFileUpload(lastFiles["cnic"], "cnic", setCnicPhoto)
            : undefined
        }
      />
      <FileUploadBox
        label="CNIC Back"
        icon={<FileText size={20} className="text-blue-400" />}
        value={cnicBackPhoto}
        onChange={(f) => handleFileUpload(f, "cnicBack", setCnicBackPhoto)}
        required
        optimising={optimisingField === "cnicBack"}
        uploading={uploadingField === "cnicBack"}
        progress={uploadProgress["cnicBack"]}
        error={uploadErrors["cnicBack"]}
        onRetry={
          uploadErrors["cnicBack"] && lastFiles["cnicBack"]
            ? () => handleFileUpload(lastFiles["cnicBack"], "cnicBack", setCnicBackPhoto)
            : undefined
        }
      />
      <FileUploadBox
        label="Driving License Photo"
        icon={<FileText size={20} className="text-purple-500" />}
        value={licensePhoto}
        onChange={(f) => handleFileUpload(f, "license", setLicensePhoto)}
        required
        optimising={optimisingField === "license"}
        uploading={uploadingField === "license"}
        progress={uploadProgress["license"]}
        error={uploadErrors["license"]}
        onRetry={
          uploadErrors["license"] && lastFiles["license"]
            ? () => handleFileUpload(lastFiles["license"], "license", setLicensePhoto)
            : undefined
        }
      />
    </div>
  );
}
