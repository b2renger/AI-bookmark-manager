# AI Bookmark Manager

Paste a list of links and get, for each one, a title, a two-sentence summary, keywords, the author and the publication date. Edit the results, then export them (JSON, CSV, Markdown, HTML, Netscape bookmarks) or sync them to Notion.

The app is a static site. There is no server: your API keys and your bookmarks stay in your browser's storage, and requests go straight from your browser to the AI service you choose.

## Choosing a model

Step-by-step instructions for every key and service are in the [setup guide](docs/SETUP.md). Each field in Settings also links to the right page.

Open **Settings > AI model**.

| Option | What you need | Notes |
| --- | --- | --- |
| Google Gemini | A Gemini API key (a free tier exists) | Recommended. Gemini fetches each page itself, so summaries come from the real content. |
| Other provider or local server | A key for Groq, OpenRouter or Mistral, or Ollama / LM Studio running on your computer | Any OpenAI-compatible endpoint works. These models cannot open web pages, so page text comes from Jina Reader. |
| On this device (WebGPU) | A browser with WebGPU | A small model is downloaded once into the browser. Private and free, but slower and less accurate, especially on phones. |

Model line-ups and free quotas change often. The **Load list** button asks the service which models your key can use right now.

### Local servers

- **Ollama:** set the `OLLAMA_ORIGINS` environment variable to the site's origin (shown in Settings, for example `https://<user>.github.io`), then restart Ollama.
- **LM Studio:** start the local server and turn on **Enable CORS** in its server settings.

Your browser may ask for permission to let the site reach your local network.

## Install as an app

The site is a PWA. In Chrome or Edge, use the **Install** offer shown in the app or the browser menu's "Install app" / "Add to Home screen". On iPhone and iPad, open it in Safari and use **Share > Add to Home Screen**. Once installed it starts without a network; cloud models still need a connection, and new versions are offered with a **Reload** button.

## Version

The version is shown under the title and at the bottom of Settings. Its last number is the deployment counter, so it goes up by one each time the site is deployed.

## Confidence score

The score describes what was actually read, not how sure the model feels:

- **High:** the summary was written from the page or post text.
- **Moderate / low:** only a title or description was available.
- **No summary:** nothing could be read. The bookmark is flagged so you can retry or write the summary yourself. The app never fills in a placeholder.

## What needs a proxy

Browsers block direct calls to some services. Summaries work without a proxy, but these two features do not:

- **Notion sync**
- **The X API bearer token**

The repository includes a small private proxy to run on your own free Cloudflare account (`proxy/cloudflare-worker.js`). See [Your own proxy](docs/SETUP.md#your-own-proxy). Public CORS proxies are not recommended: your tokens would pass through them.

## Privacy

- Keys are stored in this browser's `localStorage` and sent only to the service they belong to.
- Link addresses are sent to the AI service you choose, and to jina.ai when "Fetch page text with Jina Reader" is on.
- On a free Gemini key, Google's terms for unpaid use apply to what you send.

## Run locally

Requires Node.js 22 or later.

```
npm install
npm run dev
```

To also get the local CORS proxy at `/api/proxy` (for Notion sync), run `npm run dev:proxy` instead and choose "Local dev server" in the proxy settings.

## Deploy to GitHub Pages

1. In the repository, open **Settings > Pages** and set **Source** to **GitHub Actions**.
2. Push to `main`. The workflow in `.github/workflows/deploy.yml` builds the site and publishes it.
