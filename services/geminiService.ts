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
 * Generates details for a batch of URLs.
 * Dynamically selects between url_context (direct retrieval) and googleSearch (for social media/blocked sites).
 */
export async function generateBookmarksBatch(urls: string[]): Promise<BookmarkResult[]> {
    if (!process.env.API_KEY) {
        throw new Error("API Key is missing.");
    }

    if (urls.length === 0) return [];
    
    // Detect if the batch contains Twitter/X links which often block direct scraping/retrieval
    const isTwitterBatch = urls.some(u => 
        u.toLowerCase().includes('twitter.com') || 
        u.toLowerCase().includes('x.com')
    );

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            let tools: any[];
            let strategyPrompt: string;

            if (isTwitterBatch) {
                // Strategy A: Google Search for Twitter/X (bypassing login walls via search index)
                tools = [{ googleSearch: {} }];
                strategyPrompt = `
                You are analyzing Twitter/X posts.
                
                TARGET URLs:
                ${urls.map((url, i) => `${i + 1}. ${url}`).join('\n')}
                
                INSTRUCTIONS:
                1. Use Google Search to find the specific content of these tweets/posts. 
                2. Do NOT guess or hallucinate. If you cannot find the text in the search snippets, return a summary stating "Content unavailable".
                3. Transcription: The summary must be the actual text of the post.
                4. Title: "Tweet by [Author Name/Handle]".
                `;
            } else {
                // Strategy B: url_context for standard websites
                const urlContextLinks = urls.map(url => ({ url }));
                tools = [{ 
                    // @ts-ignore
                    url_context: { links: urlContextLinks } 
                }];
                strategyPrompt = `
                You are analyzing standard web pages.
                
                TARGET URLs:
                ${urls.map((url, i) => `${i + 1}. ${url}`).join('\n')}
                
                INSTRUCTIONS:
                1. Use the url_context tool to read the live page content.
                2. If the tool returns no content (e.g., blocked), return "Content unavailable".
                3. Summary: A 2-sentence overview.
                4. Title: The actual HTML page title.
                `;
            }

            const prompt = `
            ${strategyPrompt}
            
            COMMON OUTPUT REQUIREMENTS:
            - Identify 3-5 keywords (hashtags for tweets).
            - Find publication date (YYYY-MM-DD).
            
            Return ONLY a JSON array:
            [
              {
                "url": "input_url",
                "title": "Title",
                "summary": "Content...",
                "keywords": ["tag1"],
                "publicationDate": "YYYY-MM-DD"
              }
            ]
            `;
            
            const response = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: prompt,
                config: {
                    tools: tools,
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
                throw new Error("Failed to parse analysis results.");
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
                console.warn(`Quota limit reached. Retrying in ${waitTime}ms...`);
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