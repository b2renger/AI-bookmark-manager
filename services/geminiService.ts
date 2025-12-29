import { GoogleGenAI } from "@google/genai";

// Custom error to be thrown when API key is invalid
export class ApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiKeyError';
  }
}

const MAX_RETRIES = 2; 
const INITIAL_BACKOFF_MS = 2500;

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export interface BookmarkResult {
    url: string;
    title: string; 
    summary: string; 
    keywords: string[]; 
    publicationDate: string | null; 
    sources: { uri: string; title: string }[] 
}

/**
 * Generates details for a batch of URLs in a single API call to optimize quota usage.
 * Processes multiple URLs simultaneously to stay within RPM/RPD limits.
 */
export async function generateBookmarksBatch(urls: string[]): Promise<BookmarkResult[]> {
    if (!process.env.API_KEY) {
        throw new ApiKeyError("API_KEY environment variable is not set.");
    }

    if (urls.length === 0) return [];
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const prompt = `
            Analyze the following list of URLs and provide detailed summaries:
            ${urls.map((url, i) => `${i + 1}. ${url}`).join('\n')}
            
            Instructions for EACH URL:
            1. Use the search tool to find the actual page content and metadata.
            2. Extract a clear title and a 2-sentence informative summary.
            3. Identify 3-5 specific keywords.
            4. SEARCH FOR THE ORIGINAL PUBLICATION DATE. If the page is an article, news piece, or blog post, find when it was originally published.
            5. Return the publication date strictly in ISO 8601 format (YYYY-MM-DD). If no clear publication date is found, return null.
            
            Format your response as a valid JSON array of objects.
            JSON structure:
            [
              {
                "url": "input_url_here",
                "title": "Page Title",
                "summary": "Informative summary...",
                "keywords": ["kw1", "kw2"],
                "publicationDate": "YYYY-MM-DD"
              }
            ]
            `;
            
            const response = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: prompt,
                config: {
                    //tools: [{ googleSearch: {} }],
                    temperature: 0.2,
                    responseMimeType: "application/json"
                }
            });

            const responseText = response.text;
            if (!responseText) {
                const candidate = response.candidates?.[0];
                if (candidate?.finishReason === 'SAFETY') throw new Error("Batch blocked by safety filters.");
                throw new Error("Empty AI response received.");
            }

            // Extract global grounding sources for this batch
            const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
            const groundingChunks = groundingMetadata?.groundingChunks || [];
            const sources = groundingChunks
                .filter((chunk: any) => chunk.web && chunk.web.uri)
                .map((chunk: any) => ({
                    uri: chunk.web.uri,
                    title: chunk.web.title || chunk.web.uri,
                }));

            let results: any[];
            try {
                results = JSON.parse(responseText.trim());
                if (!Array.isArray(results)) throw new Error("Response is not a JSON array.");
            } catch (e) {
                console.error("Failed to parse batch JSON:", responseText);
                throw new Error("Invalid JSON format in AI response.");
            }

            // Map and validate results against requested URLs
            return urls.map(originalUrl => {
                const found = results.find(r => 
                    r.url?.toLowerCase() === originalUrl.toLowerCase() || 
                    originalUrl.toLowerCase().includes(r.url?.toLowerCase() || '---')
                );
                
                // Validate publicationDate format
                let validDate: string | null = null;
                if (found?.publicationDate && typeof found.publicationDate === 'string') {
                    const d = new Date(found.publicationDate);
                    if (!isNaN(d.getTime()) && d.getFullYear() > 1970) {
                        validDate = d.toISOString();
                    }
                }

                return {
                    url: originalUrl,
                    title: found?.title || originalUrl.split('/')[2] || "Untitled",
                    summary: found?.summary || "Summary could not be generated.",
                    keywords: Array.isArray(found?.keywords) ? found.keywords : [],
                    publicationDate: validDate,
                    sources: sources.slice(0, 5), // Provide representative sources for the batch
                };
            });

        } catch (error: any) {
            console.error(`Batch Attempt ${attempt + 1} failed:`, error);
            const status = error?.status;
            const message = error?.message || "";

            if (message.includes('API key not valid') || message.includes('404')) {
                throw new ApiKeyError("API Key invalid or expired.");
            }

            // Handle Rate Limiting (429) specifically with exponential backoff
            if ((status === 429 || message.includes('RESOURCE_EXHAUSTED')) && attempt < MAX_RETRIES) {
                const waitTime = INITIAL_BACKOFF_MS * Math.pow(2.5, attempt);
                await delay(waitTime);
                continue;
            }

            if (attempt === MAX_RETRIES) throw error;
            await delay(1500);
        }
    }
    throw new Error("Batch processing failed.");
}

export async function generateBookmarkDetails(url: string): Promise<BookmarkResult> {
    const results = await generateBookmarksBatch([url]);
    return results[0];
}