import { GoogleGenAI } from "@google/genai";

// Custom error to be thrown when API key is invalid
export class ApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiKeyError';
  }
}

const MAX_RETRIES = 3; // Maximum number of retries for a single API call
const INITIAL_BACKOFF_MS = 1000; // Initial delay for backoff in milliseconds (1 second)

// Helper function to introduce a delay
function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function generateBookmarkDetails(url: string): Promise<{ title: string; summary: string; keywords: string[]; publicationDate: string | null; sources: { uri: string; title: string }[] }> {
    if (!process.env.API_KEY) {
        throw new ApiKeyError("API_KEY environment variable is not set. Please select a key.");
    }
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Create a new instance for each attempt to ensure the latest API key is used.
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const prompt = `
            Analyze the content of the webpage at the following URL using your search tool.
            Your task is to extract specific details for a bookmark.
            URL: ${url}

            Please return your response as a single, valid JSON object with the following structure:
            {
              "title": "A concise and fitting title for the bookmark based on the URL's content.",
              "summary": "A brief, one or two-sentence summary of the webpage's main content.",
              "keywords": ["an", "array", "of", "3-5", "relevant", "keywords"],
              "publicationDate": "The primary publication or last updated date of the article/content in ISO 8601 format (YYYY-MM-DD). Prioritize the most prominent date on the page. If no date can be found, return null."
            }
            Do not include any other text or formatting outside of this JSON object.
        `;
            
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    tools: [{googleSearch: {}}],
                    temperature: 0.2,
                }
            });

            // Extract grounding chunks as per API guidelines.
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

            const text = response.text.trim();
            // The model can sometimes wrap the JSON in ```json ... ``` which we need to strip.
            const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
            const jsonText = jsonMatch ? jsonMatch[1] : text;

            const parsed = JSON.parse(jsonText);
            
            if (!parsed.title || !parsed.summary || !Array.isArray(parsed.keywords)) {
                throw new Error("Invalid JSON structure received from API.");
            }
            
            return {
                title: parsed.title,
                summary: parsed.summary,
                keywords: parsed.keywords,
                publicationDate: parsed.publicationDate || null,
                sources,
            };

        } catch (error: any) {
            console.error(`Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed for URL ${url}:`, error);
            const errorMessage = error?.message || '';

            // Check for invalid API key errors first, and do not retry for these.
            if (errorMessage.includes('API key not valid') || errorMessage.includes('Requested entity was not found')) {
                throw new ApiKeyError('Invalid API Key. Please select a new one.');
            }

            // Check if it's a rate limit error (RESOURCE_EXHAUSTED)
            if (errorMessage.includes('RESOURCE_EXHAUSTED') && attempt < MAX_RETRIES) {
                const delayTime = INITIAL_BACKOFF_MS * Math.pow(2, attempt); // Exponential backoff
                console.warn(`Retrying in ${delayTime}ms due to RESOURCE_EXHAUSTED for URL: ${url}`);
                await delay(delayTime);
                continue; // Try again
            }

            // If it's a grounding error or other non-retryable error, or if max retries reached
            if (error instanceof Error && error.message.includes('grounding')) {
                 throw new Error("Failed to access URL content. The page might be private or inaccessible or the content is unparseable by the AI.");
            }
            throw new Error(`Failed to generate bookmark details after ${attempt + 1} attempts. It might be due to API quota limits or an unknown issue. Please try again later.`);
        }
    }
    // This part should technically be unreachable if the loop condition is correct and an error is always thrown
    throw new Error("Unexpected error: generateBookmarkDetails loop finished without returning or throwing.");
}