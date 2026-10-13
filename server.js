
const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

// Serve website files from the public folder
app.use(express.static(path.join(__dirname, "public")));

// Make sure the homepage opens
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Allow image uploads in chat requests
app.use(express.json({ limit: "12mb" }));

app.post("/api/chat", async (req, res) => {
  try {
    const { message, image, mimeType } = req.body || {};

    if (!API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing from environment variables."
      });
    }

    if (!message?.trim() && !image) {
      return res.status(400).json({
        error: "Please enter a question or upload an image."
      });
    }

    const parts = [];

    if (image) {
      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
      ];

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

    parts.push({
      text: [
        "You are Bizvanta AI, a helpful business and everyday assistant.",
        "Answer in the same language as the user's question.",
        "If an image is attached, inspect it carefully.",
        "Read visible text and explain it when requested.",
        "Do not invent text that is blurry or unreadable.",
        "For medical questions, give general information and recommend professional advice when appropriate.",
        "User's question: " + question
      ].join("\n")
    });

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048
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
    console.error("Chat error:", error);
    return res.status(500).json({
      error: "The server could not complete the request."
    });
  }
});

// Return JSON for unknown API routes
app.use("/api", (req, res) => {
  res.status(404).json({
    error: "API route not found."
  });
});

// Start the server locally
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Bizvanta AI running on port ${PORT}`);
  });
}

// Export the app for hosting platforms
module.exports = app;
