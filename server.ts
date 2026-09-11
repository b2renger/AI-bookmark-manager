import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Server-side Gemini AI generation endpoint
  app.post('/api/gemini/generate-bookmarks', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
      }

      const { urls, contexts, modelName = 'gemini-3.7-flash' } = req.body;
      if (!Array.isArray(urls) || urls.length === 0) {
        return res.json({ results: [] });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = `
Analyze the following list of URLs and generate concise, accurate bookmark summaries:
${urls.map((url: string, i: number) => {
  const ctx = contexts && contexts[i] ? contexts[i] : null;
  return `${i + 1}. URL: ${url}${ctx ? `\n   [Retrieved Page/API Context]:\n${ctx}` : '\n   [Retrieved Page/API Context]: None'}`;
}).join('\n\n')}

Instructions for EACH URL:
1. Extract or determine an accurate, concise Title (for videos/threads include Creator/Author when helpful).
2. Generate a clear, high-quality 2-sentence informative Summary explaining what the content or page covers.
3. Identify 3-5 specific, relevant Keywords.
4. Search or extract the original Publication/Upload Date in ISO 8601 format (YYYY-MM-DD) or null.
5. Identify the Platform: "youtube", "threads", "twitter", "github", "article", or "website".
6. Extract the Author / Creator / Channel name if available.
7. Calculate a numerical AI CONFIDENCE SCORE (integer from 0 to 100) assessing how certain you are of the accuracy of the summary:
   - 90 - 100: Very High confidence. Verified metadata, direct post text, full transcript/description, or verified search grounding matches the specific page.
   - 75 - 89: High confidence. Strong search snippets, verified author/title and clear topic, minor details inferred.
   - 50 - 74: Moderate confidence. Partial content retrieved or broad domain understanding without deep text.
   - 20 - 49: Low confidence. Content is private, paywalled, or limited to URL path heuristics.
   - 0 - 19: Unverified / Restricted.
8. Provide a short 1-sentence CONFIDENCE REASON explaining the rationale behind the score (e.g., "Full YouTube video metadata and description verified", "Direct Threads post text extracted", "Verified via live Google Search grounding", "Restricted access without API key").

PLATFORM-SPECIFIC GUIDELINES:
- YouTube: Synthesize the video or playlist topic, creator/channel, and main points. Use the provided description and title.
- Threads: Synthesize the author and the specific thought/post text. If post text is available, summarize accurately.
- X / Twitter: If context is missing and search cannot find the tweet text, do not hallucinate; set summary to "Could not retrieve tweet content. Please provide an X API Key in Settings.", title to "Restricted Tweet", confidenceScore to 15, and confidenceReason to "Tweet content restricted without API key".

Format your response strictly as a valid JSON array of objects with keys:
"url", "title", "summary", "keywords", "publicationDate", "confidenceScore", "confidenceReason", "platform", "author"
Do not include markdown code fence formatting or surrounding conversation.
`;

      const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
      let response: any = null;
      let lastError: any = null;

      // Rate-limiting strategy with progressive backoff & tool shedding
      const strategies = [
        { model: modelName, useSearch: true, delayBefore: 0 },
        { model: modelName, useSearch: true, delayBefore: 4000 },
        { model: modelName, useSearch: false, delayBefore: 2500 },
        { model: 'gemini-3.6-flash', useSearch: false, delayBefore: 2000 },
        { model: 'gemini-3.1-flash-lite', useSearch: false, delayBefore: 1500 },
      ];

      for (let sIndex = 0; sIndex < strategies.length; sIndex++) {
        const strat = strategies[sIndex];
        try {
          if (strat.delayBefore > 0) {
            console.log(`[Gemini] Waiting ${strat.delayBefore}ms to respect rate limit before attempt ${sIndex + 1}...`);
            await sleep(strat.delayBefore);
          }

          const callConfig: any = {
            temperature: 0.2,
          };
          if (strat.useSearch) {
            callConfig.tools = [{ googleSearch: {} }];
          }

          response = await ai.models.generateContent({
            model: strat.model,
            contents: prompt,
            config: callConfig,
          });

          if (response) {
            break; // Succeeded!
          }
        } catch (err: any) {
          lastError = err;
          const errMsg = err?.message || '';
          
          if (errMsg.includes('API key not valid') || errMsg.includes('INVALID_ARGUMENT')) {
            // Non-recoverable auth configuration error
            throw err;
          }
          // Silently proceed to next strategy on rate limits or transient errors
        }
      }

      // If all strategies were unable to produce AI text, return fallback records
      if (!response) {
        const fallbackResults = urls.map((originalUrl: string) => {
          const domain = originalUrl.replace(/^https?:\/\//i, '').split('/')[0] || 'Link';
          return {
            url: originalUrl,
            title: domain,
            summary: 'API quota limit reached. Bookmark saved. Click Retry to summarize.',
            keywords: [domain],
            publicationDate: null,
            sources: [],
          };
        });
        return res.json({ results: fallbackResults, quotaExhausted: true });
      }

      let rawText = response.text || '';
      if (!rawText.trim() && response.candidates?.[0]?.content?.parts) {
        const parts = response.candidates[0].content.parts;
        const nonThought = parts
          .filter((p: any) => p.text && !p.thought)
          .map((p: any) => p.text)
          .join('');
        rawText = nonThought || parts.map((p: any) => p.text || '').join('');
      }

      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      const groundingChunks = (groundingMetadata as any)?.groundingChunks || [];
      const sources = groundingChunks
        .filter((chunk: any) => chunk.web && chunk.web.uri)
        .map((chunk: any) => ({
          uri: chunk.web.uri,
          title: chunk.web.title || chunk.web.uri,
        }));

      // Extract JSON array
      let parsedResults: any[] = [];
      let cleaned = rawText.trim();
      if (cleaned.includes('```')) {
        cleaned = cleaned.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      }
      const startIdx = cleaned.indexOf('[');
      const endIdx = cleaned.lastIndexOf(']');
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        cleaned = cleaned.substring(startIdx, endIdx + 1);
      }

      try {
        parsedResults = JSON.parse(cleaned);
      } catch (err) {
        console.warn('[Gemini] JSON Parse warning on response:', rawText);
      }

      if (!Array.isArray(parsedResults)) {
        parsedResults = [];
      }

      const results = urls.map((originalUrl: string, idx: number) => {
        const found = parsedResults.find((r: any) =>
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

        const domainFallback = originalUrl.replace(/^https?:\/\//i, '').split('/')[0] || 'Link';
        const lowerUrl = originalUrl.toLowerCase();

        // Platform detection fallback
        let detectedPlatform: 'youtube' | 'threads' | 'twitter' | 'github' | 'article' | 'website' = 'website';
        if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
          detectedPlatform = 'youtube';
        } else if (lowerUrl.includes('threads.net') || lowerUrl.includes('threads.com')) {
          detectedPlatform = 'threads';
        } else if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
          detectedPlatform = 'twitter';
        } else if (lowerUrl.includes('github.com')) {
          detectedPlatform = 'github';
        } else if (found?.platform && ['youtube', 'threads', 'twitter', 'github', 'article', 'website'].includes(found.platform)) {
          detectedPlatform = found.platform;
        }

        // Thumbnail extraction for YouTube
        let thumbUrl: string | undefined = undefined;
        const ytVideoMatch = originalUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
        if (ytVideoMatch && ytVideoMatch[1]) {
          thumbUrl = `https://img.youtube.com/vi/${ytVideoMatch[1]}/hqdefault.jpg`;
        }

        // Calculate sanitized confidence score
        let confidenceScore = 80;
        if (typeof found?.confidenceScore === 'number' && !isNaN(found.confidenceScore)) {
          confidenceScore = Math.max(0, Math.min(100, Math.round(found.confidenceScore)));
        } else {
          // Fallback confidence based on context availability
          const hasCtx = contexts && contexts[idx] && contexts[idx].length > 20;
          if (detectedPlatform === 'youtube' || detectedPlatform === 'threads') {
            confidenceScore = hasCtx ? 92 : 75;
          } else if (detectedPlatform === 'twitter') {
            confidenceScore = hasCtx ? 95 : 20;
          } else {
            confidenceScore = hasCtx ? 88 : 78;
          }
        }

        let confidenceReason = found?.confidenceReason;
        if (!confidenceReason) {
          if (confidenceScore >= 85) {
            confidenceReason = "Verified direct metadata & page content retrieved.";
          } else if (confidenceScore >= 60) {
            confidenceReason = "Grounded via web search results and domain metadata.";
          } else {
            confidenceReason = "Limited context available for this source.";
          }
        }

        return {
          url: originalUrl,
          title: found?.title || domainFallback,
          summary: found?.summary || (rawText ? 'Extracted details from web sources.' : 'Summary could not be generated.'),
          keywords: Array.isArray(found?.keywords) ? found.keywords : [],
          publicationDate: validDate,
          sources: sources.slice(0, 5),
          confidenceScore,
          confidenceReason,
          platform: detectedPlatform,
          author: found?.author || undefined,
          thumbnailUrl: thumbUrl,
        };
      });

      return res.json({ results });
    } catch (error: any) {
      console.error('[Gemini Generate Bookmarks Error]:', error);
      return res.status(500).json({ error: error.message || 'Gemini generation failed' });
    }
  });

  // Generalized proxy endpoint
  app.post('/api/proxy', async (req, res) => {
    try {
      const { url, method, headers, body } = req.body;

      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      console.log(`[Proxy] ${method || 'GET'} ${url}`);

      const requestHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (compatible; AISBookmarkManager/1.0)',
        ...(headers || {}),
      };

      const proxyObj: RequestInit = {
        method: method || 'GET',
        headers: requestHeaders,
      };

      if (body) {
        if (typeof body === 'string') {
          proxyObj.body = body;
        } else {
          proxyObj.body = JSON.stringify(body);
        }
      }

      const response = await fetch(url, proxyObj);
      const data = await response.text();

      // Forward status and headers
      res.status(response.status);
      
      response.headers.forEach((value, name) => {
        // Exclude headers that might cause issues with node/express responses
        if (!['content-encoding', 'transfer-encoding', 'connection', 'content-length'].includes(name.toLowerCase())) {
          res.setHeader(name, value);
        }
      });

      res.send(data);
    } catch (error: any) {
      console.error('[Proxy] Error:', error);
      res.status(500).json({ error: error.message || 'Internal Server Proxy Error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
