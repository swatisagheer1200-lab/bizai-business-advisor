
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
    const {
      message = "",
      image = null,
      mimeType = "image/jpeg",
      history = [],
      topic = "Everyday Help"
    } = req.body || {};

    if (!API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing from environment variables."
      });
    }

    if (!String(message).trim() && !image) {
      return res.status(400).json({
        error: "Please enter a question or upload an image."
      });
    }

    const allowed = ["image/jpeg", "image/png", "image/webp"];

    function imagePart(data, type) {
      if (!data) return null;
      if (!allowed.includes(type)) {
        throw new Error("Use a JPG, PNG or WEBP image.");
      }
      return {
        inline_data: {
          mime_type: type,
          data
        }
      };
    }

    function getParts(item) {
      const parts = [];
      if (String(item.text || "").trim()) {
        parts.push({ text: String(item.text).trim() });
      }
      if (item.imageBase64) {
        const part = imagePart(
          item.imageBase64,
          item.mimeType || "image/jpeg"
        );
        if (part) parts.push(part);
      }
      return parts;
    }

    const contents = [];

    for (const item of (Array.isArray(history) ? history.slice(-10) : [])) {
      if (!item || !["user", "assistant"].includes(item.role)) continue;

      const parts = getParts(item);
      if (!parts.length) continue;

      contents.push({
        role: item.role === "assistant" ? "model" : "user",
        parts
      });
    }

    const currentParts = [];

    if (String(message).trim()) {
      currentParts.push({ text: String(message).trim() });
    }

    if (image) {
      const part = imagePart(image, mimeType);
      if (part) currentParts.push(part);
    }

    contents.push({
      role: "user",
      parts: currentParts
    });

    const systemPrompt = `
You are Visionta AI, a friendly conversational AI assistant.

Answer naturally, clearly and helpfully.
Understand the conversation history and answer follow-up questions using context.
Do not ask users to repeat information already provided.
When an image is supplied, inspect it carefully and explain visible details.
If asked what an object or image is for, explain its likely purpose.
Use the image and conversation history for follow-up questions.
Never invent details that are not visible or reliable.
Match the user's language and writing style.
If the user writes Roman Urdu, reply in Roman Urdu using English letters, not Urdu script.
If the user writes English, reply in English.
For other languages, use the user's language when possible.
Use readable paragraphs, headings, lists and code blocks when helpful.
Be conversational and avoid repetitive greetings.
Current topic: ${String(topic).slice(0, 100)}
`;

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);
      return res.status(502).json({
        error: data.error?.message || "Gemini API request failed."
      });
    }

    const reply = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("\n")
      .trim();

    if (!reply) {
      return res.status(502).json({
        error: "AI did not return a response. Please try again."
      });
    }

    return res.json({ reply });

  } catch (error) {
    console.error("Visionta AI error:", error);
    return res.status(500).json({
      error: error.message || "The server could not complete the request."
    });
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({
    error: "API route not found."
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Visionta AI running on port ${PORT}`);
  });
}

module.exports = app;
