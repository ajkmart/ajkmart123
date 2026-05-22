import { GoogleGenAI } from "@google/genai";
import { createLogger } from "@workspace/logger";
const log = createLogger("[gemini-ai]");

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
} else {
  const missing = [
    !baseUrl && "AI_INTEGRATIONS_GEMINI_BASE_URL",
    !apiKey && "AI_INTEGRATIONS_GEMINI_API_KEY",
  ].filter(Boolean);
  log.info(
    `Gemini integration not active (missing: ${missing.join(", ")}). ` +
      `AI features will be unavailable until configured in the Replit Integrations panel.`
  );
}

export function getAI(): GoogleGenAI {
  if (!_ai) {
    const missing = [
      !baseUrl && "AI_INTEGRATIONS_GEMINI_BASE_URL",
      !apiKey && "AI_INTEGRATIONS_GEMINI_API_KEY",
    ].filter(Boolean);
    throw new Error(
      `Gemini AI is not configured. Missing: ${missing.join(", ")}. ` +
        `Provision the Gemini integration in the Replit Integrations panel.`
    );
  }
  return _ai;
}

export const ai: GoogleGenAI = new Proxy({} as GoogleGenAI, {
  get(_target, prop) {
    return getAI()[prop as keyof GoogleGenAI];
  },
});
