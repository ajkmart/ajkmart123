import { type TranslationKey } from "@workspace/i18n";
import { BTN_PRIMARY, BTN_SECONDARY } from "../../lib/ui";
import { ImageUploader } from "../ImageUploader";
import { ProductFormFields } from "./ProductFormFields";
import { ProductImageUploader } from "./ProductImageUploader";

interface FormState {
  name: string;
  description: string;
  price: string;
  originalPrice: string;
  category: string;
  unit: string;
  stock: string;
  image: string;
  type: string;
  videoUrl: string;
  tags: string;
  isHidden: boolean;
}

interface ProductFormViewProps {
  editProd: Record<string, unknown> | null;
  form: FormState;
  f: (k: string, v: unknown) => void;
  formErrors: { name?: string; price?: string; category?: string };
  validateForm: () => boolean;
  catList: string[];
  config: {
    uploads?: { allowedVideoFormats?: string[]; maxVideoMb?: number; maxVideoDurationSec?: number };
  };
  videoUploading: boolean;
  handleVideoUpload: (file: File) => void;
  allowedVideoFormats: string[];
  maxVideoMb: number;
  maxVideoDurationSec: number;
  editThreshold: string;
  setEditThreshold: (v: string) => void;
  lowStockThreshold: number;
  createMut: { mutate: () => void; isPending: boolean };
  updateMut: { mutate: () => void; isPending: boolean };
  closeForm: () => void;
  Toast: React.ReactNode;
  T: (key: TranslationKey) => string;
  PageHeader: React.ComponentType<{ title: string; subtitle?: string; actions?: React.ReactNode }>;
  TYPES: string[];
}

export function ProductFormView({
  editProd,
  form,
  f,
  formErrors,
  validateForm,
  catList,
  config,
  videoUploading,
  handleVideoUpload,
  allowedVideoFormats,
  maxVideoMb,
  maxVideoDurationSec,
  editThreshold,
  setEditThreshold,
  lowStockThreshold,
  createMut,
  updateMut,
  closeForm,
  Toast,
  T,
  PageHeader,
  TYPES,
}: ProductFormViewProps) {
  const uploadFormatLabels = config.uploads?.allowedVideoFormats ?? ["mp4", "mov", "webm"];

  return (
    <div className="bg-gray-50 md:bg-transparent">
      <PageHeader
        title={editProd ? T("editProduct") : T("addProduct")}
        subtitle={T("fillProductDetails")}
        actions={
          <button
            onClick={closeForm}
            className="android-press h-10 min-h-0 rounded-xl bg-white/20 px-4 text-sm font-bold text-white md:bg-gray-100 md:text-gray-700"
          >
            ✕ {T("cancel")}
          </button>
        }
      />

      <div className="px-4 py-4 md:px-0 md:py-4">
        <div className="space-y-4 md:grid md:grid-cols-2 md:gap-6 md:space-y-0">
          {/* ── Left column: form fields ── */}
          <ProductFormFields
            form={form}
            f={f}
            formErrors={formErrors}
            catList={catList}
            editProd={editProd}
            editThreshold={editThreshold}
            setEditThreshold={setEditThreshold}
            lowStockThreshold={lowStockThreshold}
            TYPES={TYPES}
            T={T}
          />

          {/* ── Right column: image + video ── */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <ImageUploader
                value={form.image}
                onChange={(url) => f("image", url)}
                label={T("imageUrlLabel")}
                placeholder="https://..."
              />
            </div>

            <ProductImageUploader
              videoUrl={form.videoUrl}
              onVideoChange={(url) => f("videoUrl", url)}
              videoUploading={videoUploading}
              onVideoUpload={handleVideoUpload}
              allowedVideoFormats={allowedVideoFormats}
              maxVideoMb={maxVideoMb}
              maxVideoDurationSec={maxVideoDurationSec}
              uploadFormatLabels={uploadFormatLabels}
            />

            <div className="flex gap-3">
              <button onClick={closeForm} className={BTN_SECONDARY}>
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!validateForm()) return;
                  editProd ? updateMut.mutate() : createMut.mutate();
                }}
                disabled={createMut.isPending || updateMut.isPending}
                className={BTN_PRIMARY}
              >
                {createMut.isPending || updateMut.isPending
                  ? "Saving..."
                  : editProd
                    ? "✓ Update Product"
                    : "+ Add Product"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {Toast}
    </div>
  );
}
