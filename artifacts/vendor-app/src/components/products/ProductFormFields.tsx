import { type TranslationKey } from "@workspace/i18n";
import { CARD, INPUT, LABEL, SELECT, TEXTAREA } from "../../lib/ui";

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

interface ProductFormFieldsProps {
  form: FormState;
  f: (k: string, v: unknown) => void;
  formErrors: { name?: string; price?: string; category?: string };
  catList: string[];
  editProd: Record<string, unknown> | null;
  editThreshold: string;
  setEditThreshold: (v: string) => void;
  lowStockThreshold: number;
  TYPES: string[];
  T: (key: TranslationKey) => string;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      {children}
    </div>
  );
}

export function ProductFormFields({
  form,
  f,
  formErrors,
  catList,
  editProd,
  editThreshold,
  setEditThreshold,
  lowStockThreshold,
  TYPES,
  T,
}: ProductFormFieldsProps) {
  return (
    <div className={`${CARD} space-y-3 p-4`}>
      <Field label={T("productNameRequired")}>
        <input
          value={form.name}
          onChange={(e) => f("name", e.target.value)}
          placeholder="e.g. Chicken Biryani"
          className={`${INPUT}${formErrors.name ? "!border-red-400 focus:!border-red-500" : ""}`}
        />
        {formErrors.name && (
          <p className="mt-1 text-xs font-medium text-red-500">{formErrors.name}</p>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={T("priceRequired")}>
          <input
            type="number"
            inputMode="numeric"
            value={form.price}
            onChange={(e) => f("price", e.target.value)}
            placeholder="0"
            className={`${INPUT}${formErrors.price ? "!border-red-400 focus:!border-red-500" : ""}`}
          />
          {formErrors.price && (
            <p className="mt-1 text-xs font-medium text-red-500">{formErrors.price}</p>
          )}
        </Field>

        <Field label="Original Price (shown crossed-out as 'was' price)">
          <input
            type="number"
            inputMode="numeric"
            value={form.originalPrice}
            onChange={(e) => f("originalPrice", e.target.value)}
            placeholder="e.g. 500 (leave blank if no discount)"
            className={INPUT}
          />
        </Field>

        <Field label={T("categoryLabel")}>
          <select
            value={form.category}
            onChange={(e) => f("category", e.target.value)}
            className={`${SELECT}${formErrors.category ? "!border-red-400 focus:!border-red-500" : ""}`}
          >
            <option value="">Select...</option>
            {catList.map((c) => (
              <option key={c} value={c} className="capitalize">
                {c}
              </option>
            ))}
          </select>
          {formErrors.category && (
            <p className="mt-1 text-xs font-medium text-red-500">{formErrors.category}</p>
          )}
        </Field>

        <Field label={T("typeLabel")}>
          <select value={form.type} onChange={(e) => f("type", e.target.value)} className={SELECT}>
            {TYPES.map((t) => (
              <option key={t} value={t} className="capitalize">
                {t}
              </option>
            ))}
          </select>
        </Field>

        <Field label={T("unitLabel")}>
          <input
            value={form.unit}
            onChange={(e) => f("unit", e.target.value)}
            placeholder="kg / pcs / ltr"
            className={INPUT}
          />
        </Field>

        <Field label={T("stockQtyLabel")}>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={form.stock}
            onChange={(e) => {
              const v = e.target.value;
              if (v !== "" && Number(v) < 0) return;
              f("stock", v);
            }}
            placeholder="Blank = unlimited"
            className={INPUT}
          />
        </Field>

        {editProd && (
          <Field label="Low-Stock Alert Threshold">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={editThreshold}
              onChange={(e) => setEditThreshold(e.target.value)}
              placeholder={`Default: ${lowStockThreshold}`}
              className={INPUT}
            />
            <p className="mt-1 text-[10px] text-gray-400">
              Show warning badge when stock ≤ this number
            </p>
          </Field>
        )}
      </div>

      <Field label={T("descriptionLabel")}>
        <textarea
          value={form.description}
          onChange={(e) => f("description", e.target.value)}
          placeholder="Short description..."
          rows={2}
          className={TEXTAREA}
        />
      </Field>

      <Field label="Tags (comma-separated)">
        <input
          value={form.tags}
          onChange={(e) => f("tags", e.target.value)}
          placeholder="e.g. spicy, bestseller, new"
          className={INPUT}
        />
        <p className="mt-1 text-[10px] text-gray-400">Tags help customers discover your product</p>
      </Field>

      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-sm font-bold text-gray-700">Hide from customers</p>
          <p className="text-[11px] text-gray-400">Product won't appear in listings</p>
        </div>
        <button
          type="button"
          onClick={() => f("isHidden", !form.isHidden)}
          className={`relative h-6 w-12 rounded-full transition-colors ${form.isHidden ? "bg-gray-400" : "bg-green-400"}`}
        >
          <div
            className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${form.isHidden ? "left-1" : "left-7"}`}
          />
        </button>
      </div>
    </div>
  );
}
