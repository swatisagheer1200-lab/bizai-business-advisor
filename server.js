
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

app.use(cors());
app.use(express.json({ limit: "20kb" }));

app.use(express.static(__dirname, { index: false }));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

function getGreeting(message) {
  const text = message.trim().toLowerCase();

  if (/^(hi|hello|hey|salam|assalamualaikum|asalam o alaikum)[!. ]*$/.test(text)) {
    return "Hi! 👋 Main BizAI hoon, tumhara business advisor. Batao, main tumhari kis tarah help kar sakta hoon?";
  }

  if (/^(how are you|how r u)[?!. ]*$/.test(text)) {
    return "Main bilkul ready hoon tumhari help ke liye! 😊 Batao, business ke liye kya plan hai?";
  }

  return null;
}

app.post("/api/chat", async (req, res) => {
  try {
    const message = req.body?.message;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Yaar, pehle apna message likho." });
    }

    if (message.length > 4000) {
      return res.status(400).json({ error: "Message 4000 characters se chhota rakho." });
    }

    const greeting = getGreeting(message);
    if (greeting) {
      return res.json({ reply: greeting });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing.");
      return res.status(500).json({
        error: "AI setup complete nahi hai. Vercel environment variables check karo."
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
You are BizAI, a friendly and practical AI business advisor.

Rules:
- Reply in the same language and script the user uses.
- If the user writes Roman Urdu or Roman English, reply in Roman Urdu/Roman English using Latin letters.
- If the user writes in English, reply in English.
- Keep answers clear, friendly, and useful.
- Give practical business ideas, marketing tips, and step-by-step guidance.
- Never guarantee profits or invent facts.

User message:
${message.trim()}
`;

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt
    });

    const reply = response?.text?.trim();

    if (!reply) {
      return res.status(502).json({
        error: "AI ka response khaali aaya. Dobara try karo."
      });
    }

    return res.json({ reply });

  } catch (error) {
    console.error("BizAI error:", {
      status: error?.status,
      message: error?.message
    });

    const status = Number(error?.status || error?.code);

    if (status === 429) {
      return res.status(429).json({
        error: "AI usage limit poori ho gayi. Thori dair baad try karo."
      });
    }

    if (status === 401 || status === 403) {
      return res.status(502).json({
        error: "AI API key ya access mein masla hai. Vercel settings check karo."
      });
    }

    if (status === 503 || status === 500) {
      return res.status(503).json({
        error: "Yaar, AI service filhal busy hai. Thori dair baad dobara try karo."
      });
    }

    return res.status(500).json({
      error: "BizAI abhi jawab nahi de saka. Vercel logs check karne honge."
    });
  }
});

app.listen(PORT, () => {
  console.log(`BizAI running on port ${PORT}`);
});
