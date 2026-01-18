
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
const FETCH_TIMEOUT_MS = 10000; // 10s timeout for context fetches

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, options: RequestInit = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
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
async function fetchTweetContext(url: string, apiKey?: string, proxyUrl?: string): Promise<string | null> {
    const tweetIdMatch = url.match(/(?:twitter\.com|x\.com)\/(?:#!\/)?(\w+)\/status\/(\d+)/);
    if (!tweetIdMatch) return null;
    const tweetId = tweetIdMatch[2];

    // Try API if key is present
    if (apiKey) {
        try {
            const apiUrl = `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=text,created_at,author_id`;
            // Use proxy if provided to avoid CORS on browser
            const requestUrl = proxyUrl ? `${proxyUrl}${encodeURIComponent(apiUrl)}` : apiUrl;

            const res = await fetchWithTimeout(requestUrl, {
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
        const targetOembed = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`;
        const oembedUrl = proxyUrl ? `${proxyUrl}${encodeURIComponent(targetOembed)}` : targetOembed;

        const res = await fetchWithTimeout(oembedUrl);
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

// Helper to fetch youtube content details via proxy (Supports Videos and Playlists)
async function fetchYouTubeContext(url: string, proxyUrl?: string): Promise<string | null> {
    const videoRegExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const videoMatch = url.match(videoRegExp);
    const videoId = videoMatch ? videoMatch[1] : null;

    const playlistMatch = url.match(/[?&]list=([^#\&\?]+)/);
    const playlistId = playlistMatch ? playlistMatch[1] : null;
    
    if (!videoId && !playlistId) return null;

    const isVideo = !!videoId;
    if (!proxyUrl) return null;

    let targetUrl = '';
    let type = '';

    if (isVideo) {
        targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
        type = 'Video';
    } else {
        targetUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
        type = 'Playlist';
    }

    const fetchUrl = `${proxyUrl}${encodeURIComponent(targetUrl)}`;
    
    try {
        const res = await fetchWithTimeout(fetchUrl);
        if (res.ok) {
            const html = await res.text();
            
            const getMeta = (name: string) => {
                const pattern = new RegExp(`<meta\\s+(?:name|property)=["'](?:og:)?${name}["']\\s+content=["']([^"']*)["']`, 'i');
                const match = html.match(pattern);
                return match ? match[1] : null;
            };

            const title = getMeta('title') || html.match(/<title>([^<]*)<\/title>/i)?.[1] || '';
            const desc = getMeta('description') || '';
            
            let extraContext = '';
            if (type === 'Playlist') {
                const playlistItemRegex = /"playlistVideoRenderer":\{.*?"title":\{(?:.*?"text":"(.*?)".*?|.*?"simpleText":"(.*?)")/g;
                const matches = [...html.matchAll(playlistItemRegex)];
                const titles = matches.map(m => m[1] || m[2]).filter(Boolean);
                const uniqueTitles = [...new Set(titles)].slice(0, 15);
                
                if (uniqueTitles.length > 0) {
                    extraContext = `\n\nVideos in this playlist (First ${uniqueTitles.length}):\n- ${uniqueTitles.join('\n- ')}`;
                }
            }
            
            if (title || desc || extraContext) {
                 return `YouTube ${type} Details (Scraped):\nTitle: ${title}\nDescription: ${desc}${extraContext}`;
            }
        }
    } catch (e) {
        console.warn(`YouTube proxy fetch failed for ${type}`, e);
    }
    return null;
}

/**
 * Generates details for a batch of URLs in a single API call to optimize quota usage.
 */
export async function generateBookmarksBatch(urls: string[], xApiKey?: string, proxyUrl?: string): Promise<BookmarkResult[]> {
    if (!process.env.API_KEY) {
        throw new ApiKeyError("API_KEY environment variable is not set.");
    }

    if (urls.length === 0) return [];
    
    const contexts = await Promise.all(urls.map(async (url) => {
        if (url.includes('twitter.com') || url.includes('x.com')) {
            return await fetchTweetContext(url, xApiKey, proxyUrl);
        }
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            return await fetchYouTubeContext(url, proxyUrl);
        }
        return null;
    }));

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Re-instantiate AI with the current env API Key (which might have changed via openSelectKey)
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const prompt = `
            Analyze the following list of URLs and provide detailed summaries:
            ${urls.map((url, i) => {
                const ctx = contexts[i];
                return `${i + 1}. ${url}${ctx ? `\n   [Additional Context Retrieved]: ${ctx}` : ''}`;
            }).join('\n')}
            
            Instructions for EACH URL:
            1. Use the search tool to find the actual page content and metadata. 
            2. Extract a clear title and a 2-sentence informative summary.
            3. Identify 3-5 specific keywords.
            4. SEARCH FOR THE ORIGINAL PUBLICATION DATE. Return strictly in ISO 8601 format (YYYY-MM-DD) or null.
            
            Format your response as a valid JSON array of objects.
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
                throw new Error("Invalid JSON format in AI response.");
            }

            return urls.map(originalUrl => {
                const found = results.find(r => 
                    r.url?.toLowerCase() === originalUrl.toLowerCase() || 
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
                    sources: sources.slice(0, 5),
                };
            });

        } catch (error: any) {
            console.error(`Batch Attempt ${attempt + 1} failed:`, error);
            const message = error?.message || "";

            // Catch specific platform auth errors to trigger re-selection
            if (message.includes('API key not valid') || message.includes('404') || message.includes('Requested entity was not found.')) {
                throw new ApiKeyError("API Key invalid or expired.");
            }

            if ((message.includes('RESOURCE_EXHAUSTED') || message.includes('429')) && attempt < MAX_RETRIES) {
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
