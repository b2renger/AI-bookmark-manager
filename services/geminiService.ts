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

// Helper to fetch tweet content via API or oEmbed
async function fetchTweetContext(url: string, apiKey?: string): Promise<string | null> {
    const tweetIdMatch = url.match(/(?:twitter\.com|x\.com)\/(?:#!\/)?(\w+)\/status\/(\d+)/);
    if (!tweetIdMatch) return null;
    const tweetId = tweetIdMatch[2];

    // Try API if key is present
    if (apiKey) {
        try {
            // Note: This often fails in browser due to CORS unless proxy/extension is used
            const res = await fetch(`https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=text,created_at,author_id`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                return `Tweet content: "${data.data.text}" (Posted: ${data.data.created_at})`;
            } else {
                console.warn(`Twitter API returned status ${res.status}, falling back.`);
            }
        } catch (e) {
            console.warn("Twitter API fetch failed (likely CORS), falling back to oEmbed", e);
        }
    }

    // Fallback to oEmbed (Robust for public tweets)
    try {
        const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`;
        const res = await fetch(oembedUrl);
        if (res.ok) {
            const data = await res.json();
            // Clean up HTML tags from the blockquote to get raw text
            if (data.html) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = data.html;
                const text = tempDiv.textContent || tempDiv.innerText || "";
                return `Tweet content (via oEmbed): "${text.replace(/\n+/g, ' ').trim()}"`;
            }
        }
    } catch (e) {
        console.warn("Twitter oEmbed failed", e);
    }

    return null;
}

// Helper to fetch youtube content details via proxy
async function fetchYouTubeContext(url: string, proxyUrl?: string): Promise<string | null> {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    const videoId = (match && match[7].length === 11) ? match[7] : false;
    
    if (!videoId) return null;

    // Use proxy if available to fetch the page HTML and extract meta description
    if (proxyUrl) {
        const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const fetchUrl = `${proxyUrl}${encodeURIComponent(targetUrl)}`;
        try {
            const res = await fetch(fetchUrl);
            if (res.ok) {
                const html = await res.text();
                const descMatch = html.match(/<meta name="description" content="([^"]*)"/);
                const titleMatch = html.match(/<meta name="title" content="([^"]*)"/);
                
                const title = titleMatch ? titleMatch[1] : '';
                const desc = descMatch ? descMatch[1] : '';
                
                if (title || desc) {
                     return `YouTube Video Details:\nTitle: ${title}\nDescription: ${desc}`;
                }
            }
        } catch (e) {
            console.warn("YouTube proxy fetch failed, relying on Google Search tool", e);
        }
    }
    return null;
}

/**
 * Generates details for a batch of URLs in a single API call to optimize quota usage.
 * Processes multiple URLs simultaneously to stay within RPM/RPD limits.
 */
export async function generateBookmarksBatch(urls: string[], xApiKey?: string, proxyUrl?: string): Promise<BookmarkResult[]> {
    if (!process.env.API_KEY) {
        throw new ApiKeyError("API_KEY environment variable is not set.");
    }

    if (urls.length === 0) return [];
    
    // Pre-fetch contexts for X/Twitter and YouTube URLs
    const contexts = await Promise.all(urls.map(async (url) => {
        if (url.includes('twitter.com') || url.includes('x.com')) {
            return await fetchTweetContext(url, xApiKey);
        }
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            return await fetchYouTubeContext(url, proxyUrl);
        }
        return null;
    }));

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const prompt = `
            Analyze the following list of URLs and provide detailed summaries:
            ${urls.map((url, i) => {
                const ctx = contexts[i];
                return `${i + 1}. ${url}${ctx ? `\n   [Additional Context Retrieved]: ${ctx}` : ''}`;
            }).join('\n')}
            
            Instructions for EACH URL:
            1. Use the search tool to find the actual page content and metadata. 
               - IF Additional Context is provided above for a URL (e.g. Tweet content, YouTube description), PRIORTIZE using that context for the summary.
               - For YouTube videos, specifically read the VIDEO DESCRIPTION and use it to generate the summary.
            2. Extract a clear title and a 2-sentence informative summary.
            3. Identify 3-5 specific keywords.
            4. SEARCH FOR THE ORIGINAL PUBLICATION DATE. If the page is an article, news piece, blog post, or video, find when it was originally published.
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
                    tools: [{ googleSearch: {} }],
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

export async function generateBookmarkDetails(url: string, xApiKey?: string, proxyUrl?: string): Promise<BookmarkResult> {
    const results = await generateBookmarksBatch([url], xApiKey, proxyUrl);
    return results[0];
}
