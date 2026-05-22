const MAX_DIMENSION = 1280;
const TARGET_SIZE_BYTES = 200 * 1024;
const QUALITY_STEPS = [0.82, 0.72, 0.6, 0.48];

async function blobToFile(blob: Blob, name: string, type: string): Promise<File> {
  return new File([blob], name, { type });
}

function drawToCanvas(img: HTMLImageElement): {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
} {
  let { width, height } = img;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(img, 0, 0, width, height);
  return { canvas, width, height };
}

async function tryEncode(
  canvas: HTMLCanvasElement,
  mime: "image/webp" | "image/jpeg",
  quality: number
): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), mime, quality);
  });
}

export async function compressImage(file: File, _targetKB?: number): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const targetBytes = _targetKB ? _targetKB * 1024 : TARGET_SIZE_BYTES;

  return new Promise<File>((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);

      const { canvas } = drawToCanvas(img);
      const supportsWebP = canvas.toDataURL("image/webp").startsWith("data:image/webp");

      let bestFile: File | null = null;

      for (const quality of QUALITY_STEPS) {
        if (supportsWebP) {
          const blob = await tryEncode(canvas, "image/webp", quality);
          if (blob && blob.size < file.size) {
            const candidate = await blobToFile(
              blob,
              file.name.replace(/\.[^.]+$/, ".webp"),
              "image/webp"
            );
            if (import.meta.env.DEV && !bestFile) {
              // eslint-disable-next-line no-console
              console.debug(
                `[imageUtils] ${file.name}: ${(file.size / 1024).toFixed(1)}KB → ${(blob.size / 1024).toFixed(1)}KB (webp q${quality})`
              );
            }
            if (blob.size <= targetBytes) {
              resolve(candidate);
              return;
            }
            if (!bestFile || blob.size < bestFile.size) bestFile = candidate;
          }
        }

        const jblob = await tryEncode(canvas, "image/jpeg", quality);
        if (jblob && jblob.size < file.size) {
          const candidate = await blobToFile(
            jblob,
            file.name.replace(/\.[^.]+$/, ".jpg"),
            "image/jpeg"
          );
          if (import.meta.env.DEV && !bestFile) {
            // eslint-disable-next-line no-console
            console.debug(
              `[imageUtils] ${file.name}: ${(file.size / 1024).toFixed(1)}KB → ${(jblob.size / 1024).toFixed(1)}KB (jpeg q${quality})`
            );
          }
          if (jblob.size <= targetBytes) {
            resolve(candidate);
            return;
          }
          if (!bestFile || jblob.size < bestFile.size) bestFile = candidate;
        }
      }

      if (bestFile) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.debug(
            `[imageUtils] ${file.name}: best effort ${(bestFile.size / 1024).toFixed(1)}KB (target was ${(targetBytes / 1024).toFixed(0)}KB)`
          );
        }
        resolve(bestFile);
      } else {
        resolve(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}
