import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import * as path from 'path';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Local use only: accept calls from the dev page itself.
  app.use(cors({ origin: [/^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/] }));
  app.use(express.json({ limit: '10mb' }));

  // Optional CORS proxy for local development (Notion sync, X API).
  // The published site is static and does not include this server.
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

  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
