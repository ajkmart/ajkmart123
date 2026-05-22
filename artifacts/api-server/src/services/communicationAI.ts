import { logger } from "../lib/logger.js";

let geminiApiKey: string | null = null;

function getGeminiApiKey(): string | null {
  if (geminiApiKey) return geminiApiKey;
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "dummy_key_123") {
    logger.warn(
      "[communicationAI] GEMINI_API_KEY not set or invalid. AI features using local templates."
    );
    return null;
  }
  geminiApiKey = key;
  logger.info("[communicationAI] Gemini API key loaded.");
  return geminiApiKey;
}

function generateLocalResponse(prompt: string, context?: unknown): string {
  const lower = prompt.toLowerCase();

  if (lower.includes("order") || lower.includes("delivery")) {
    if (lower.includes("delay") || lower.includes("late")) {
      return "We sincerely apologize for the delay. Your order will be delivered within the next hour. Track live in the app.";
    }
    if (lower.includes("cancel")) {
      return "Order cancellation is possible within 5 minutes. For later cancellations, contact support with your order ID.";
    }
    return "Your order is being processed. You'll receive real-time updates via SMS and app notifications.";
  }

  if (lower.includes("refund") || lower.includes("payment")) {
    return "Refunds are processed within 3-5 business days after verification. Contact support if not received after 7 days.";
  }

  if (lower.includes("rider") || lower.includes("driver") || lower.includes("track")) {
    return "Your rider is on the way! Live location available in the app. ETA: 15-20 minutes.";
  }

  if (lower.includes("complaint") || lower.includes("issue")) {
    return "We're sorry. Please share your order ID. Our team will respond within 2 hours.";
  }

  if (lower.includes("promo") || lower.includes("discount")) {
    return "Active offers: Use WELCOME20 for 20% off first order. Refer a friend get Rs.100 wallet cash.";
  }

  if (lower.includes("wallet") || lower.includes("balance")) {
    return "Wallet balance is visible in the app. Top up via card, bank, or cash at partner stores.";
  }

  void context;
  return "Thank you for reaching out. Our team will get back to you shortly. Helpline: 111-111-AJK.";
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("No Gemini API key");
  }

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("No response text from Gemini");
  }
  return text.trim();
}

export async function generateAIContent(prompt: string, context?: unknown) {
  try {
    const geminiResponse = await callGemini(prompt);
    return {
      success: true,
      content: geminiResponse,
      source: "gemini",
      meta: { model: "gemini-2.0-flash-lite" },
    };
  } catch (error: unknown) {
    logger.warn(
      { err: (error as Error).message },
      "[communicationAI] Gemini API error — falling back to template"
    );
    const content = generateLocalResponse(prompt, context);
    return {
      success: true,
      content,
      source: "template_fallback",
      meta: { error: (error as Error).message },
    };
  }
}

export async function analyzeSentiment(text: string): Promise<"positive" | "negative" | "neutral"> {
  try {
    const prompt = `Classify the sentiment of this text as only one word: positive, negative, or neutral.\n\nText: "${text}"\n\nSentiment:`;
    const result = await callGemini(prompt);
    const sentiment = result.toLowerCase().trim();
    if (sentiment === "positive" || sentiment === "negative" || sentiment === "neutral") {
      return sentiment;
    }
    return "neutral";
  } catch (err) {
    logger.debug(
      { error: err instanceof Error ? err.message : String(err) },
      "[communicationAI] AI sentiment analysis failed — using keyword fallback"
    );
    const lower = text.toLowerCase();
    if (lower.includes("bad") || lower.includes("terrible") || lower.includes("poor"))
      return "negative";
    if (lower.includes("good") || lower.includes("great") || lower.includes("excellent"))
      return "positive";
    return "neutral";
  }
}

export const communicationAI = {
  generateResponse: generateAIContent,
  analyzeSentiment,
};

export async function generateRoleTemplate(role: string, prompt: string): Promise<string> {
  logger.info({ role }, "[communicationAI] generateRoleTemplate called");
  return `Template for ${role}: ${prompt.substring(0, 50)}...`;
}

export async function translateMessage(
  text: string,
  targetLang: string,
  _userId?: string
): Promise<string> {
  logger.info({ targetLang }, "[communicationAI] translateMessage called");
  return `${text} [translated to ${targetLang} - mock]`;
}

export async function composeMessage(
  context: unknown,
  type: string,
  _userId?: string
): Promise<string> {
  logger.info({ type }, "[communicationAI] composeMessage called");
  return `Composed message for ${type}: ${JSON.stringify(context).substring(0, 100)}`;
}

export async function transcribeAudio(_audioBuffer: Buffer, _ext?: string): Promise<string> {
  logger.info("[communicationAI] transcribeAudio called");
  return "Transcription not available (stub)";
}
