
import { proxyFetch } from '../lib/proxyFetch';

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

async function fetchWithTimeout(url: string, options: RequestInit = {}, proxyUrl?: string) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await proxyFetch(url, {
            ...options,
            signal: controller.signal
        }, proxyUrl);
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
    sources: { uri: string; title: string }[];
    confidenceScore?: number;
    confidenceReason?: string;
    platform?: 'youtube' | 'threads' | 'twitter' | 'github' | 'article' | 'website';
    author?: string;
    thumbnailUrl?: string;
}

// Helper to fetch tweet content via API, Syndication, or oEmbed
async function fetchTweetContext(url: string, apiKey?: string, proxyUrl?: string): Promise<string | null> {
    const tweetIdMatch = url.match(/(?:twitter\.com|x\.com)\/(?:#!\/)?(\w+)\/status\/(\d+)/);
    if (!tweetIdMatch) return null;
    const authorHandle = tweetIdMatch[1];
    const tweetId = tweetIdMatch[2];

    // Try API if key is present
    if (apiKey) {
        try {
            const apiUrl = `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=text,created_at,author_id`;
            const authValue = apiKey.trim().replace(/^Bearer\s+/i, '');
            const res = await fetchWithTimeout(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${authValue}`
                }
            }, proxyUrl);
            if (res.ok) {
                const data = await res.json();
                if (data.data?.text) {
                    return `X/Twitter Post Details:\n- Author: @${authorHandle}\n- Text: "${data.data.text}"\n- Publication Date: ${data.data.created_at || ''}`;
                }
            }
        } catch (e) {
            // Silently fallback to Syndication API
        }
    }

    // Fallback 1: Syndication API (Works without auth for public tweets)
    try {
        const syndicationUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}`;
        const res = await fetchWithTimeout(syndicationUrl, {}, proxyUrl);
        if (res.ok) {
            const data = await res.json();
            if (data.text) {
                return `X/Twitter Post Details (via Syndication):\n- Author: @${data.user?.screen_name || authorHandle}\n- Text: "${data.text}"\n- Publication Date: ${data.created_at || ''}`;
            }
        }
    } catch (e) {
        // Silently fallback to oEmbed
    }

    // Fallback 2: oEmbed (Robust for public tweets)
    try {
        const targetOembed = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`;
        const res = await fetchWithTimeout(targetOembed, {}, proxyUrl);
        if (res.ok) {
            const data = await res.json();
            if (data.html) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = data.html;
                const text = tempDiv.textContent || tempDiv.innerText || "";
                return `X/Twitter Post Details (via oEmbed):\n- Author: ${data.author_name || authorHandle}\n- Text: "${text.replace(/\n+/g, ' ').trim()}"`;
            }
        }
    } catch (e) {
        // Silently fail
    }

    return null;
}

// Helper to fetch Threads (threads.net / threads.com) post context
async function fetchThreadsContext(url: string, proxyUrl?: string): Promise<string | null> {
    const handleMatch = url.match(/(?:threads\.net|threads\.com)\/@([a-zA-Z0-9._]+)(?:\/post\/([a-zA-Z0-9_-]+))?/i);
    const authorHandle = handleMatch ? handleMatch[1] : '';

    // 1. Try Threads oEmbed endpoint
    try {
        const oembedUrl = `https://www.threads.net/oembed?url=${encodeURIComponent(url)}`;
        const res = await fetchWithTimeout(oembedUrl, {}, proxyUrl);
        if (res.ok) {
            const data = await res.json();
            if (data.html || data.title) {
                let postText = data.title || '';
                if (data.html) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = data.html;
                    postText = tempDiv.textContent || tempDiv.innerText || postText;
                }
                const author = data.author_name || authorHandle;
                return `Threads Post Details (via oEmbed):\n- Author: @${author}\n- Post Content: "${postText.replace(/\n+/g, ' ').trim()}"\n- Author Profile: ${data.author_url || ''}`;
            }
        }
    } catch (e) {
        // Fallback to HTML scraping
    }

    // 2. Try proxy HTML scraping for og:description and meta tags
    if (proxyUrl) {
        try {
            const res = await fetchWithTimeout(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            }, proxyUrl);
            if (res.ok) {
                const html = await res.text();
                const getMeta = (prop: string) => {
                    const match = html.match(new RegExp(`<meta\\s+(?:name|property)=["'](?:og:)?${prop}["']\\s+content=["']([^"']*)["']`, 'i'));
                    return match ? match[1] : null;
                };

                const ogDesc = getMeta('description') || getMeta('twitter:description');
                const ogTitle = getMeta('title') || getMeta('twitter:title') || html.match(/<title>([^<]*)<\/title>/i)?.[1];
                const author = getMeta('author') || authorHandle;

                if (ogDesc || ogTitle) {
                    return `Threads Post Details (Scraped):\n- Author: @${author}\n- Title/Headline: ${ogTitle || ''}\n- Post Content: "${ogDesc || ''}"`;
                }
            }
        } catch (e) {
            // Silently proceed
        }
    }

    return authorHandle ? `Threads Post from @${authorHandle}` : null;
}

// Helper to fetch YouTube content details via oEmbed + HTML metadata (Supports Videos, Shorts, Playlists, Channels)
async function fetchYouTubeContext(url: string, proxyUrl?: string): Promise<string | null> {
    const videoRegExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const videoMatch = url.match(videoRegExp);
    const videoId = videoMatch ? videoMatch[1] : null;

    const playlistMatch = url.match(/[?&]list=([^#\&\?]+)/);
    const playlistId = playlistMatch ? playlistMatch[1] : null;

    const isChannel = url.includes('/@') || url.includes('/channel/') || url.includes('/c/');

    let oEmbedData: any = null;

    // 1. YouTube official oEmbed API (Fast and highly accurate for titles, channels, and thumbnails)
    try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const res = await fetchWithTimeout(oembedUrl, {}, proxyUrl);
        if (res.ok) {
            oEmbedData = await res.json();
        }
    } catch (e) {
        // Continue to HTML extraction
    }

    let scrapedTitle = oEmbedData?.title || '';
    let authorName = oEmbedData?.author_name || '';
    let authorUrl = oEmbedData?.author_url || '';
    let thumbnailUrl = oEmbedData?.thumbnail_url || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '');
    let description = '';
    let keywords = '';
    let uploadDate = '';
    let extraContext = '';

    // 2. Fetch page HTML through proxy to extract full description, keywords, uploadDate
    if (proxyUrl) {
        try {
            const fetchTarget = videoId ? `https://www.youtube.com/watch?v=${videoId}` : (playlistId ? `https://www.youtube.com/playlist?list=${playlistId}` : url);
            const res = await fetchWithTimeout(fetchTarget, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            }, proxyUrl);
            
            if (res.ok) {
                const html = await res.text();
                const getMeta = (name: string) => {
                    const pattern = new RegExp(`<meta\\s+(?:name|property|itemprop)=["'](?:og:)?${name}["']\\s+content=["']([^"']*)["']`, 'i');
                    const match = html.match(pattern);
                    return match ? match[1] : null;
                };

                scrapedTitle = scrapedTitle || getMeta('title') || html.match(/<title>([^<]*)<\/title>/i)?.[1]?.replace(/- YouTube$/i, '').trim() || '';
                description = getMeta('description') || '';
                keywords = getMeta('keywords') || '';
                uploadDate = getMeta('datePublished') || getMeta('uploadDate') || '';
                authorName = authorName || getMeta('name') || '';

                if (playlistId) {
                    const playlistItemRegex = /"playlistVideoRenderer":\{.*?"title":\{(?:.*?"text":"(.*?)".*?|.*?"simpleText":"(.*?)")/g;
                    const matches = [...html.matchAll(playlistItemRegex)];
                    const titles = matches.map(m => m[1] || m[2]).filter(Boolean);
                    const uniqueTitles = [...new Set(titles)].slice(0, 15);
                    
                    if (uniqueTitles.length > 0) {
                        extraContext = `\n- Playlist Videos (First ${uniqueTitles.length}):\n  * ${uniqueTitles.join('\n  * ')}`;
                    }
                }
            }
        } catch (e) {
            // Silently proceed with oEmbed data
        }
    }

    if (scrapedTitle || authorName || description) {
        const typeStr = playlistId ? 'Playlist' : (videoId ? (url.includes('/shorts/') ? 'Short' : 'Video') : 'Channel');
        return `YouTube ${typeStr} Verified Context:\n- Title: ${scrapedTitle}\n- Channel / Creator: ${authorName}${authorUrl ? ` (${authorUrl})` : ''}\n- Upload Date: ${uploadDate || 'Unknown'}\n- Description: ${description ? description.slice(0, 600) : 'None'}\n- Keywords: ${keywords || 'None'}${thumbnailUrl ? `\n- Thumbnail: ${thumbnailUrl}` : ''}${extraContext}`;
    }

    return null;
}

// Helper to fetch generic web page OpenGraph / meta context for articles and websites
async function fetchWebContext(url: string, proxyUrl?: string): Promise<string | null> {
    if (!proxyUrl) return null;
    try {
        const res = await fetchWithTimeout(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }, proxyUrl);

        if (res.ok) {
            const html = await res.text();
            const getMeta = (name: string) => {
                const pattern = new RegExp(`<meta\\s+(?:name|property)=["'](?:og:)?${name}["']\\s+content=["']([^"']*)["']`, 'i');
                const match = html.match(pattern);
                return match ? match[1] : null;
            };

            const title = getMeta('title') || html.match(/<title>([^<]*)<\/title>/i)?.[1] || '';
            const desc = getMeta('description') || '';
            const published = getMeta('article:published_time') || getMeta('date') || '';
            const author = getMeta('author') || getMeta('article:author') || '';

            if (title || desc) {
                return `Web Page Metadata (Extracted):\n- Title: ${title.trim()}\n- Description: ${desc.trim()}${author ? `\n- Author: ${author}` : ''}${published ? `\n- Published: ${published}` : ''}`;
            }
        }
    } catch (e) {
        // Silently skip
    }
    return null;
}

/**
 * Generates details for a batch of URLs in a single API call to optimize quota usage.
 */
export async function generateBookmarksBatch(urls: string[], xApiKey?: string, proxyUrl?: string, modelName: string = "gemini-3.7-flash"): Promise<BookmarkResult[]> {
    if (urls.length === 0) return [];
    
    const contexts = await Promise.all(urls.map(async (url) => {
        const lowerUrl = url.toLowerCase();
        if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
            return await fetchTweetContext(url, xApiKey, proxyUrl);
        }
        if (lowerUrl.includes('threads.net') || lowerUrl.includes('threads.com')) {
            return await fetchThreadsContext(url, proxyUrl);
        }
        if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
            return await fetchYouTubeContext(url, proxyUrl);
        }
        // General website metadata extraction
        return await fetchWebContext(url, proxyUrl);
    }));

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await fetch('/api/gemini/generate-bookmarks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    urls,
                    contexts,
                    modelName,
                }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                const errMsg = errData.error || `Server returned ${res.status}`;
                throw new Error(errMsg);
            }

            const data = await res.json();
            if (Array.isArray(data.results) && data.results.length > 0) {
                return data.results;
            }

            throw new Error("Empty AI response received.");
        } catch (error: any) {
            const message = error?.message || "";

            if (message.includes('API key not valid') || message.includes('GEMINI_API_KEY is not configured')) {
                throw new ApiKeyError(message);
            }

            if ((message.includes('RESOURCE_EXHAUSTED') || message.includes('429')) && attempt < MAX_RETRIES) {
                const waitTime = INITIAL_BACKOFF_MS * Math.pow(2.5, attempt);
                await delay(waitTime);
                continue;
            }

            if (attempt === MAX_RETRIES) {
                // If all retries fail, return a fallback so bookmarks are still created and editable
                return urls.map(originalUrl => ({
                    url: originalUrl,
                    title: originalUrl.replace(/^https?:\/\//i, '').split('/')[0] || "Bookmark",
                    summary: "Could not generate AI summary at this time. You can edit this bookmark manually.",
                    keywords: [],
                    publicationDate: null,
                    sources: [],
                }));
            }
            await delay(1500);
        }
    }
    
    return urls.map(originalUrl => ({
        url: originalUrl,
        title: originalUrl.replace(/^https?:\/\//i, '').split('/')[0] || "Bookmark",
        summary: "Could not generate AI summary.",
        keywords: [],
        publicationDate: null,
        sources: [],
    }));
}

export async function generateBookmarkDetails(url: string, xApiKey?: string, proxyUrl?: string, modelName: string = "gemini-3.7-flash"): Promise<BookmarkResult> {
    const results = await generateBookmarksBatch([url], xApiKey, proxyUrl, modelName);
    return results[0];
}
