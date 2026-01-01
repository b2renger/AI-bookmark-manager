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

// Helper to fetch youtube content details via proxy (Supports Videos and Playlists)
async function fetchYouTubeContext(url: string, proxyUrl?: string): Promise<string | null> {
    // 1. Robust Video ID extraction (covers youtu.be, watch?v=, embed/, etc.)
    const videoRegExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const videoMatch = url.match(videoRegExp);
    const videoId = videoMatch ? videoMatch[1] : null;

    // 2. Playlist ID extraction
    const playlistMatch = url.match(/[?&]list=([^#\&\?]+)/);
    const playlistId = playlistMatch ? playlistMatch[1] : null;
    
    // If neither, we can't do anything special
    if (!videoId && !playlistId) return null;

    // Prioritize Video if both exist (watching a video in a playlist context)
    // Only treat as Playlist if there is NO video ID.
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
        const res = await fetch(fetchUrl);
        if (res.ok) {
            const html = await res.text();
            
            // Helper to extract meta content safely handling single/double quotes
            const getMeta = (name: string) => {
                const pattern = new RegExp(`<meta\\s+(?:name|property)=["'](?:og:)?${name}["']\\s+content=["']([^"']*)["']`, 'i');
                const match = html.match(pattern);
                return match ? match[1] : null;
            };

            // Try standard and OG tags
            const title = getMeta('title') || html.match(/<title>([^<]*)<\/title>/i)?.[1] || '';
            const desc = getMeta('description') || '';
            
            let extraContext = '';
            if (type === 'Playlist') {
                // Attempt to extract video titles from the playlist page HTML
                // This regex looks for titles inside the JSON blobs YouTube embeds in the page
                const playlistItemRegex = /"playlistVideoRenderer":\{.*?"title":\{(?:.*?"text":"(.*?)".*?|.*?"simpleText":"(.*?)")/g;
                const matches = [...html.matchAll(playlistItemRegex)];
                const titles = matches.map(m => m[1] || m[2]).filter(Boolean);
                const uniqueTitles = [...new Set(titles)].slice(0, 15);
                
                if (uniqueTitles.length > 0) {
                    extraContext = `\n\nVideos in this playlist (First ${uniqueTitles.length}):\n- ${uniqueTitles.join('\n- ')}`;
                }
            }
            
            // Only return if we found something useful
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
               - IF "[Additional Context Retrieved]" is present for a URL, PRIORTIZE using that information.
               - For YouTube videos, read the description (from Context if available, or search results).
               - For YouTube playlists, use the list of videos (from Context if available) to describe the collection's theme.
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
