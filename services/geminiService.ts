
import { GoogleGenAI } from "@google/genai";

// Custom error to be thrown when API key is invalid
export class ApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiKeyError';
  }
}

const MAX_RETRIES = 2; 
const INITIAL_BACKOFF_MS = 1500;

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function generateBookmarkDetails(url: string): Promise<{ 
    title: string; 
    summary: string; 
    keywords: string[]; 
    publicationDate: string | null; 
    sources: { uri: string; title: string }[] 
}> {
    if (!process.env.API_KEY) {
        throw new ApiKeyError("API_KEY environment variable is not set. Please select a key.");
    }
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Use gemini-3-flash-preview as per guidelines for basic text and search tasks
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const prompt = `
            Analyze the content of the webpage at: ${url}
            
            Task:
            1. Use the search tool to extract the site's main content, title, and publication date.
            2. Provide a concise 2-sentence summary and 3-5 relevant keywords.
            
            Response Format (Return ONLY this JSON object):
            {
              "title": "Page title here",
              "summary": "1-2 sentence summary of content",
              "keywords": ["kw1", "kw2", "kw3"],
              "publicationDate": "ISO 8601 date string or null"
            }
            `;
            
            const response = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: prompt,
                config: {
                    tools: [{ googleSearch: {} }],
                    temperature: 0.1,
                }
            });

            // CRITICAL FIX: Safely extract text output from response to avoid TypeError on .trim()
            const responseText = response.text || "";
            if (!responseText) {
                const candidate = response.candidates?.[0];
                if (candidate?.finishReason === 'SAFETY') {
                    throw new Error("Content blocked by safety filters.");
                }
                throw new Error("Empty response received from AI. The site might be blocking bots.");
            }

            // Extract grounding chunks for citations/sources
            const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
            const sources = groundingChunks?.map((chunk: any) => {
                if (chunk.web && chunk.web.uri) {
                    return {
                        uri: chunk.web.uri,
                        title: chunk.web.title || chunk.web.uri,
                    };
                }
                return null;
            }).filter((source: any): source is { uri: string; title: string; } => source !== null) || [];

            // Robust JSON extraction to handle search citations or markdown wrapping
            const rawText = responseText.trim();
            const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) || 
                            rawText.match(/{[\s\S]*}/);
            
            const jsonToParse = jsonMatch ? jsonMatch[1] || jsonMatch[0] : rawText;

            try {
                const parsed = JSON.parse(jsonToParse);
                
                return {
                    title: parsed.title || "Untitled Bookmark",
                    summary: parsed.summary || "No summary available.",
                    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
                    publicationDate: parsed.publicationDate || null,
                    sources,
                };
            } catch (parseError) {
                console.warn("Could not parse JSON from AI response, attempting fallback extraction.", rawText);
                return {
                    title: url.replace(/^https?:\/\//, '').split('/')[0] || "Webpage",
                    summary: responseText.length > 15 ? responseText.substring(0, 150) + "..." : "Summary generation failed.",
                    keywords: [],
                    publicationDate: null,
                    sources,
                };
            }

        } catch (error: any) {
            console.error(`Gemini API Error (Attempt ${attempt + 1}):`, error);
            const errorMessage = error?.message || '';

            // Bubble up specific key errors to trigger UI reset
            if (errorMessage.includes('API key not valid') || errorMessage.includes('Requested entity was not found')) {
                throw error;
            }

            // Exponential backoff for rate limiting
            if (errorMessage.includes('RESOURCE_EXHAUSTED') && attempt < MAX_RETRIES) {
                const waitTime = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
                await delay(waitTime);
                continue;
            }

            if (attempt === MAX_RETRIES) {
                throw new Error(errorMessage || "API request failed after retries.");
            }
            
            await delay(1000);
        }
    }
    throw new Error("Bookmark details generation failed unexpectedly.");
}
