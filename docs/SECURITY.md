# Security notes

## Secrets

- Runtime API keys (Gemini, Anthropic) are entered in Settings and stored with Electron
  `safeStorage` (DPAPI on Windows, Keychain on macOS, libsecret on Linux). They are write-only
  across IPC: the renderer can set a key but never read one back.
- `.env` is dev-only and gitignored. Nothing from it is baked into a build.
- The Ed25519 identity key and per-collection keys are stored the same way from P6 on.

## Gemini key history (P0, 2026-09-13)

The legacy app (`legacy/vite.config.ts`) `define`d `GEMINI_API_KEY` from `.env` into the client
bundle. No `.env` was ever committed to this repository (verified: `git log --all -- .env` is
empty and `git grep AIza` over all tracked history finds no key). Any key that was used with a
*built* legacy bundle (AI Studio deployment or a local `vite build`) should nevertheless be
treated as exposed and **revoked in Google AI Studio**. Action for the owner: revoke and
re-create the key; the new key is only ever entered in Settings.

## Renderer hardening

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webviewTag: false`,
`app.enableSandbox()`, a deny-all permission handler, a deny-all `setWindowOpenHandler`, a CSP
that forbids remote scripts and connections, and the Electron fuses `runAsNode=false`,
`enableNodeCliInspectArguments=false`, `onlyLoadAppFromAsar=true`. A bookmark manager renders
hostile HTML by definition; the renderer never talks to the network.

## Outbound traffic

Every outbound request goes through `apps/desktop/src/main/net` (enforced by ESLint firewall C)
and writes a row to `egress_log`, which is a first-class screen in the app.
