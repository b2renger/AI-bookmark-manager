# Setup guide

Everything is configured in the app under **Settings**. Keys are saved in your browser only.

You only need **one** AI option to start. Gemini is the quickest.

- [Google Gemini](#google-gemini)
- [Groq](#groq)
- [OpenRouter](#openrouter)
- [Mistral](#mistral)
- [Ollama](#ollama)
- [LM Studio](#lm-studio)
- [On this device (WebGPU)](#on-this-device-webgpu)
- [Jina Reader](#jina-reader)
- [X / Twitter](#x--twitter)
- [Notion](#notion)
- [Your own proxy](#your-own-proxy)

## Google Gemini

1. Open <https://aistudio.google.com/apikey> and sign in with a Google account.
2. Create an API key and copy it.
3. In the app: **Settings > AI model**, choose **Google Gemini**, paste the key.
4. Tap **Load list**. This checks the key and shows the models it can use. Pick one and save.

The free tier is limited per minute and per day; a "rate limit" error means wait or switch model. Leave "Google Search grounding" off unless your key has billing enabled.

## Groq

1. Open <https://console.groq.com/keys>, sign in, create a key.
2. In the app: **Settings > AI model > Other provider or local server**, service **Groq**, paste the key.
3. Tap **Load list**, pick a model, save.

## OpenRouter

1. Open <https://openrouter.ai/keys>, sign in, create a key.
2. In the app: service **OpenRouter**, paste the key.
3. Tap **Load list** and choose a model whose name ends in `:free`, or keep `openrouter/free`.

## Mistral

1. Open <https://console.mistral.ai/api-keys>, sign in, create a key.
2. In the app: service **Mistral**, paste the key, tap **Load list**, pick a model.

## Ollama

Desktop only. Ollama runs on your computer and must be told to accept this site.

1. Install Ollama from <https://ollama.com> and pull a model, for example `ollama pull gemma3:4b`.
2. Set the environment variable `OLLAMA_ORIGINS` to the app's origin, which Settings shows (for example `https://b2renger.github.io`), then restart Ollama. Per-system steps: <https://docs.ollama.com/faq>.
3. In the app: service **Ollama**, tap **Load list**, pick your model.

Your browser may ask for permission to reach your local network. Allow it.

## LM Studio

Desktop only.

1. In LM Studio, load a model and start the local server.
2. In the server settings, turn on **Enable CORS**: <https://lmstudio.ai/docs/developer/core/server/settings>.
3. In the app: service **LM Studio**, tap **Load list**, pick your model.

## On this device (WebGPU)

No key. In **Settings > AI model**, choose **On this device (WebGPU)**, keep the recommended model, and tap **Download and load**. Use Wi-Fi: the download is several hundred megabytes and happens once. Expect slower and simpler summaries than a cloud model, especially on a phone.

## Jina Reader

Jina Reader turns a web page into plain text for models that cannot open pages themselves. It works without a key at a low rate limit.

To raise the limit, get a free key on <https://jina.ai/reader> (the key is shown in the "API Key & Billing" part of the page) and paste it under **Fetch page text with Jina Reader**.

When this option is on, the address of each link is sent to jina.ai.

## X / Twitter

You usually do not need a token: public posts are read through X's public embed endpoints when they allow it.

A token only helps if you also set up [your own proxy](#your-own-proxy), because the X API refuses calls made directly from a web page.

1. Open the X developer console at <https://console.x.com> and sign in.
2. Create an app, then copy its **Bearer Token**. Details: <https://docs.x.com/x-api/getting-started/getting-access>.
3. In the app: **Settings > Twitter / X Integration**, paste the token.
4. Set your proxy URL under **Proxy Configuration**, then tap **Test X Connection**.

X may refuse a valid token if the developer account has no plan or credits. In that case the test shows X's own error message.

## Notion

Notion sync needs [your own proxy](#your-own-proxy): Notion's API refuses calls made directly from a web page.

1. Open <https://www.notion.so/profile/integrations> and create an **internal** integration. Notion's guide: <https://www.notion.com/help/create-integrations-with-the-notion-api>.
2. Give it the capabilities **Read content**, **Update content** and **Insert content**, then copy its secret (it starts with `ntn_` or `secret_`).
3. In Notion, open the database you want to sync, open its **...** menu, choose **Connections**, and add your integration. Without this step the token works but sees no database.
4. In the app: **Settings > Notion Integration**, paste the secret, set your proxy URL, then tap **Test Notion Connection**.

## Your own proxy

Needed only for **Notion sync** and the **X token**. Summaries work without it.

Public CORS proxies are not a good fit here: your Notion and X tokens would pass through a third party, and they tend to block or charge for production sites. The repository includes a small private proxy you run on your own free Cloudflare account. It only accepts requests from your copy of the app and only forwards to the services listed in the file.

1. Create a free account at <https://dash.cloudflare.com>.
2. Go to **Workers & Pages**, create a new **Worker**, and deploy the default "Hello World" one.
3. Open its code editor, delete the sample code, and paste the contents of [`proxy/cloudflare-worker.js`](../proxy/cloudflare-worker.js).
4. At the top of the file, check `ALLOWED_ORIGINS`. It must contain the origin of the site you use the app from, for example `https://b2renger.github.io` (no path, no trailing slash).
5. Deploy. Copy the Worker's address, which looks like `https://something.your-name.workers.dev`.
6. In the app: **Settings > Proxy Configuration**, set the proxy URL to that address followed by `/?`, for example `https://something.your-name.workers.dev/?`, and save.

Cloudflare's own documentation for this kind of Worker: <https://developers.cloudflare.com/workers/examples/cors-header-proxy/>.

When running the app locally you can use `npm run dev:proxy` and the "Local dev server" proxy option instead.
