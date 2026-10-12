
const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

// Static files: index.html, CSS, JavaScript
app.use(express.static(__dirname));

// Allow image uploads in JSON requests
app.use(express.json({ limit: "12mb" }));

app.post("/api/chat", async (req, res) => {
  try {
    const { message, image, mimeType } = req.body || {};

    if (!API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY .env file mein nahi mili."
      });
    }

    if (!message?.trim() && !image) {
      return res.status(400).json({
        error: "Sawal likho ya tasveer upload karo."
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
          error: "JPG, PNG ya WEBP tasveer upload karo."
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
      "Tasveer mein kya likha hai? Text parh kar samjhao.";

    parts.push({
      text: [
        "You are Bizvanta AI, a helpful assistant.",
        "Answer in the same language as the user's question.",
        "If an image is attached, inspect it carefully.",
        "Read visible text and explain it when requested.",
        "Do not invent text that is blurry or unreadable.",
        "For unclear medicine names or dosages, ask the user to consult a pharmacist or doctor.",
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
        error: data.error?.message ||
          "Gemini API request fail hui."
      });
    }

    const reply = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("\n")
      .trim();

    if (!reply) {
      return res.status(502).json({
        error: "AI ka jawab nahi mila. Dobara koshish karo."
      });
    }

    return res.json({ reply });
  } catch (error) {
    console.error("Chat error:", error);

    return res.status(500).json({
      error: "Server request complete nahi kar saka."
    });
  }
});

// Unknown API routes return JSON errors
app.use("/api", (req, res) => {
  res.status(404).json({
    error: "API route nahi mila."
  });
});

app.listen(PORT, () => {
  console.log(`Bizvanta AI running at http://localhost:${PORT}`);
  console.log(`Gemini API key found: ${Boolean(API_KEY)}`);
  console.log(`Chat model: ${MODEL}`);
});
