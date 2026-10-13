
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

app.post("/api/chat", async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing in Vercel environment variables."
      });
    }

    const { message, image, mimeType, history, topic } = req.body || {};

    if (!message?.trim() && !image) {
      return res.status(400).json({
        error: "Please enter a message or upload an image."
      });
    }

    const contents = [];

    if (Array.isArray(history)) {
      for (const item of history.slice(-8)) {
        if (!item || !["user", "assistant", "model"].includes(item.role)) continue;

        const text = String(item.text || item.content || "").slice(0, 2500);
        if (!text) continue;

        contents.push({
          role: item.role === "assistant" ? "model" : item.role,
          parts: [{ text }]
        });
      }
    }

    const parts = [];

    if (image) {
      const type = mimeType || "image/jpeg";

      if (!["image/jpeg", "image/png", "image/webp"].includes(type)) {
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

    parts.push({
      text: [
        "You are Visionta AI, a helpful, friendly assistant.",
        "Reply naturally, directly, and without unnecessary introductions.",
        "Match the user's language and writing style.",
        "If the user writes Roman Urdu, reply in Roman Urdu using English letters.",
        "If the user writes English, reply in English.",
        "Use natural emojis when they improve the conversation. Do not overuse them.",
        "Format answers using Markdown when useful: **bold**, headings, numbered steps, bullet lists and short paragraphs.",
        "Keep simple answers short. Give more detail when the user asks for it.",
        "For follow-up questions, use the conversation history.",
        "Inspect uploaded images carefully. Never guess unreadable text or uncertain medicine names.",
        "For medical topics, explain uncertainty and recommend checking with a qualified professional.",
        "Current topic: " + String(topic || "Everyday Help").slice(0, 80),
        "User's latest message: " + String(message || "Please describe this image.").slice(0, 4000)
      ].join("\n")
    });

    contents.push({ role: "user", parts });

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 1024
        }
      }),
      signal: AbortSignal.timeout(55000)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", response.status, data.error?.message);

      return res.status(response.status === 429 || response.status === 503 ? 503 : 502).json({
        error: response.status === 503 || response.status === 429
          ? "AI service is busy right now. Please try again shortly."
          : data.error?.message || "AI request failed."
      });
    }

    const reply = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("\n")
      .trim();

    if (!reply) {
      return res.status(502).json({
        error: "AI returned an empty response. Please try again."
      });
    }

    res.json({ reply });
  } catch (error) {
    console.error("Visionta chat error:", error.message);

    res.status(500).json({
      error: error.name === "TimeoutError"
        ? "The AI took too long to respond. Please try again."
        : "The server could not complete the request."
    });
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found." });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Visionta AI running on port ${PORT}`));
}

module.exports = app;
