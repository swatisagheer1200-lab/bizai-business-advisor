
const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "12mb" }));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function callGemini(url, body) {
  let lastError;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(55000)
      });

      const data = await response.json();

      if (response.ok) return data;

      const retryable = [408, 429, 500, 502, 503, 504].includes(response.status);

      if (!retryable || attempt === 2) {
        const error = new Error(
          data.error?.message || `Gemini API error ${response.status}`
        );
        error.status = response.status;
        throw error;
      }

      lastError = new Error(data.error?.message || "Temporary Gemini API error");
    } catch (error) {
      lastError = error;

      if (error.status || attempt === 2) throw error;
    }

    await wait(1000 * (2 ** attempt));
  }

  throw lastError || new Error("Gemini request failed");
}

app.post("/api/chat", async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing from Vercel environment variables."
      });
    }

    const {
      message,
      image,
      mimeType,
      history,
      topic
    } = req.body || {};

    if (!message?.trim() && !image) {
      return res.status(400).json({
        error: "Please enter a message or upload an image."
      });
    }

    const parts = [];

    if (image) {
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      const type = mimeType || "image/jpeg";

      if (!allowedTypes.includes(type)) {
        return res.status(400).json({
          error: "Please upload a JPG, PNG, or WEBP image."
        });
      }

      parts.push({
        inline_data: {
          mime_type: type,
          data: image
        }
      });
    }

    const question = message?.trim() ||
      "Please describe the attached image and read any visible text.";

    const instructions = [
      "You are Visionta AI, a helpful AI assistant.",
      "Answer in the same language and writing style as the user.",
      "If the user writes Roman Urdu using English letters, reply in Roman Urdu using English letters.",
      "If the user writes English, reply in English.",
      "Use the conversation history to understand follow-up questions.",
      "If an image is attached, inspect it carefully and answer questions about it.",
      "Do not invent details that are not visible or known.",
      `Current topic: ${String(topic || "Everyday Help").slice(0, 100)}`,
      "User's latest message: " + question
    ].join("\n");

    const contents = [];

    if (Array.isArray(history)) {
      for (const item of history.slice(-12)) {
        if (!item || !["user", "assistant", "model"].includes(item.role)) continue;

        const text = String(item.text || item.content || "").slice(0, 5000);
        if (!text) continue;

        contents.push({
          role: item.role === "assistant" ? "model" : item.role,
          parts: [{ text }]
        });
      }
    }

    const latestParts = [...parts, { text: instructions }];

    contents.push({
      role: "user",
      parts: latestParts
    });

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

    const data = await callGemini(url, {
      contents,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 2048
      }
    });

    const reply = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("\n")
      .trim();

    if (!reply) {
      return res.status(502).json({
        error: "AI returned no text. Please try again."
      });
    }

    return res.json({ reply });
  } catch (error) {
    console.error("Visionta AI error:", error.message);

    const status = error.status === 429 || error.status === 503
      ? 503
      : error.status === 400 || error.status === 403
      ? 502
      : 500;

    return res.status(status).json({
      error: error.status === 503
        ? "Gemini is busy right now. Please try again shortly."
        : error.message || "The server could not complete the request."
    });
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found." });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Visionta AI running on port ${PORT}`);
  });
}

module.exports = app;
