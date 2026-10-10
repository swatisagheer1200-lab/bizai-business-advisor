
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

app.get("/", (req, res) => {
  res.send("BizAI Server is running!");
});

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({
      error: "Please enter a message.",
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: `You are BizAI, a helpful business advisor. Answer the user's question clearly and practically in the same language they use. Do not repeat the question as your answer.

User question: ${message}`,
    });

    res.json({
      reply: response.text || "Please try asking another question.",
    });
  } catch (error) {
    console.error("Gemini error:", error.message);
    res.status(500).json({
      error: "BizAI could not respond. Check the terminal for details.",
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`BizAI server running on http://localhost:${PORT}`);
});
