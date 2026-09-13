# Cairn

A local-first, private, shareable AI bookmark manager. Everything lives on your machine: the
database, the page text, the embeddings, the models. Sharing with friends is an encrypted file
you hand over however you like. Cloud AI keys are optional, never default.

Status: **v2 rewrite in progress** on branch `v2-local-first` (see [plans/](plans/)). The
previous single-page app lives in `legacy/` until the port is complete.

## Develop

```
nvm use            # Node 24
npm install
npm run dev        # electron-vite dev: main + preload + renderer with HMR
npm test           # vitest: core + ui + main
npm run lint       # the three import firewalls, see eslint.config.js
npm run typecheck  # tsc -b over the project references
```

Note for VS Code users: its integrated terminal may export `ELECTRON_RUN_AS_NODE=1`, which makes
Electron start as plain Node (symptom: `Cannot read properties of undefined (reading 'whenReady')`).
Run `unset ELECTRON_RUN_AS_NODE` (or `Remove-Item Env:ELECTRON_RUN_AS_NODE` in PowerShell) first.
`npm -w @cairn/desktop run abi-check` proves the native modules load inside Electron.

Layout: `apps/desktop` (Electron), `apps/extension` (placeholder), `packages/core`
(runtime-agnostic TypeScript, zero `node:` imports), `packages/ui` (React components),
`plans/` (the plan and the rig-test records), `docs/`.

## Plans

Start with [plans/SEQUENCING.md](plans/SEQUENCING.md), then the phase file. Every phase merges
only after a human rig test on both reference machines is signed off in `plans/rig-tests/`.
