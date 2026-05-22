import { GoogleGenAI, Modality } from "@google/genai";

export { ai } from "../client";

const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

let _ai: GoogleGenAI | null = null;

if (baseUrl && apiKey) {
  _ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: "",
      baseUrl,
    },
  });
}

function getAI(): GoogleGenAI {
  if (!_ai) {
    throw new Error(
      `Gemini AI is not configured. Provision the Gemini integration in the Replit Integrations panel.`
    );
  }
  return _ai;
}

export async function generateImage(
  prompt: string
): Promise<{ b64_json: string; mimeType: string }> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data in response");
  }

  return {
    b64_json: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}
