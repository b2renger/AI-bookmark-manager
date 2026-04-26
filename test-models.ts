import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  const modelsToTest = [
    "gemini-3.1-flash",
    "gemini-3.1-pro",
    "gemini-3.1-flash-preview",
    "gemini-3.1-pro-preview",
    "gemini-3.0-flash",
    "gemini-3.0-pro",
    "gemini-3.0-flash-preview",
    "gemini-3-flash-preview",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-1.5-flash-8b",
    "gemini-1.5-flash",
    "gemini-1.5-pro"
  ];
  for (const model of modelsToTest) {
    try {
      await ai.models.generateContent({
        model: model,
        contents: "hello"
      });
      console.log(`${model} works`);
    } catch (e: any) {
      console.log(`${model} failed: ${e.message}`);
    }
  }
}
run();
