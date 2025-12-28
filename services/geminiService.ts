import { GoogleGenAI } from "@google/genai";

const MAX_RETRIES = 3; 
const INITIAL_BACKOFF_MS = 5000;

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
 * Generates details for a batch of URLs using the url_context tool.
 */
export async function generateBookmarksBatch(urls: string[]): Promise<BookmarkResult[]> {
    if (!process.env.API_KEY) {
        throw new Error("API Key is missing.");
    }

    if (urls.length === 0) return [];
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            // Prepare links for the url_context tool
            const urlContextLinks = urls.map(url => ({ url }));

            const prompt = `
            Analyze these URLs using the url_context tool to fetch their actual live content.
            
            Requested URLs:
            ${urls.map((url, i) => `${i + 1}. ${url}`).join('\n')}
            
            For each URL:
            1. Extract the main headline or page title.
            2. Write a 2-sentence summary of the core content.
            3. Identify 3-5 relevant keywords.
            4. Find the publication date (YYYY-MM-DD format).

            IF IT IS A TWEET/X POST:
            - Transcription: You MUST transcribe the tweet text exactly as it appears.
            - Title: Set title to "Tweet by [User] (@handle)".
            - Keywords: Use all hashtags present in the tweet.

            Return your response ONLY as a JSON array of objects.
            JSON Format Example:
            [
              {
                "url": "input_url",
                "title": "Title Here",
                "summary": "Summary here...",
                "keywords": ["kw1", "kw2"],
                "publicationDate": "YYYY-MM-DD"
              }
            ]
            `;
            
            const response = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: prompt,
                config: {
                    // Correct implementation of the url_context tool
                    tools: [{ 
                        // @ts-ignore
                        url_context: {} 
                    }],
                    temperature: 0.1,
                    responseMimeType: "application/json"
                }
            });

            const responseText = response.text;
            if (!responseText) {
                throw new Error("Empty AI response received.");
            }

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
            } catch (e) {
                console.error("JSON Parse Error:", responseText);
                throw new Error("Failed to parse analysis results. The page might be protected or too complex.");
            }

            return urls.map(originalUrl => {
                const found = results.find(r => 
                    r.url?.toLowerCase().includes(originalUrl.toLowerCase()) || 
                    originalUrl.toLowerCase().includes(r.url?.toLowerCase() || '---')
                );
                
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
                    sources: sources.length > 0 ? sources.slice(0, 5) : [{ uri: originalUrl, title: "Source Content" }],
                };
            });

        } catch (error: any) {
            const message = error?.message || "";
            const isQuotaError = message.includes('429') || message.includes('RESOURCE_EXHAUSTED');

            if (isQuotaError && attempt < MAX_RETRIES) {
                const waitTime = INITIAL_BACKOFF_MS * Math.pow(3, attempt);
                console.warn(`Grounding quota limit reached. Retrying in ${waitTime}ms...`);
                await delay(waitTime);
                continue;
            }

            if (attempt === MAX_RETRIES) throw error;
            await delay(2000);
        }
    }
    throw new Error("Processing failed after several attempts.");
}

export async function generateBookmarkDetails(url: string): Promise<BookmarkResult> {
    const results = await generateBookmarksBatch([url]);
    return results[0];
}