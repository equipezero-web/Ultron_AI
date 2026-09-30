import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);

if (!process.env.GEMINI_API_KEY) {
  console.error("ERRO: GEMINI_API_KEY não foi configurada no arquivo .env");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const SYSTEM_INSTRUCTION = `
Você é o núcleo conversacional do sistema ULTRON AI.
Responda em português do Brasil, de forma objetiva, técnica e clara.
Você é um assistente de software: não alegue controlar dispositivos ou executar ações
que não tenham sido realmente conectadas ao backend.
Quando o usuário pedir uma automação ainda não implementada, explique que a ferramenta
precisa ser conectada antes de afirmar que foi executada.
`;

app.post("/api/ai", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();

    if (!message) {
      return res.status(400).json({ error: "Mensagem vazia." });
    }

    if (message.length > 8000) {
      return res.status(413).json({ error: "Mensagem muito longa." });
    }

    const interaction = await ai.interactions.create({
      model: "gemini-3.8-flash",
      input: [
        {
          type: "text",
          text: `${SYSTEM_INSTRUCTION}\n\nMensagem do operador:\n${message}`
        }
      ]
    });

    return res.json({
      text: interaction.output_text || "O Gemini não retornou texto.",
      interactionId: interaction.id || null
    });
  } catch (error) {
    console.error("Gemini error:", error);
    return res.status(500).json({
      error: "Falha ao consultar o Gemini.",
      detail: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status:"online", service:"ultron-ai-backend" });
});

// O backend também entrega o frontend.
// A pasta pública é a raiz do projeto ULTRON.
const publicRoot = path.resolve(__dirname, "..");
app.use(express.static(publicRoot));

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicRoot, "index.html"));
});

app.listen(PORT, () => {
  console.log(`ULTRON AI online: http://localhost:${PORT}`);
});
