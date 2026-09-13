# Cairn (working name) — plans

Fork of AI-bookmark-manager into a local-first, private, shareable AI bookmark manager. Branch `v2-local-first`; phase branches `v2/p<N>-<slug>`.

Reading order:

1. [PLAN.md](PLAN.md) — the master plan: context, fixed constraints, research verdict, the 17 settled decisions, phase table, technical design summary, verification.
2. [SEQUENCING.md](SEQUENCING.md) — phase order, branch rule, dependency graph. Point an agent at this file to execute a phase.
3. [p0-foundation.md](p0-foundation.md) … [p10-global-rag-mcp.md](p10-global-rag-mcp.md) — one file per phase: goal, deliverables, ordered tasks with verification, automated tests, the 10-step human rig checklist (both rigs, measured numbers), exit criteria, what could go wrong.
4. [MILESTONES.md](MILESTONES.md) — the 4-week demo screenshot and its cut line, v1 to friends, v2, calendar sanity check.
5. [TECHNICAL-DESIGN.md](TECHNICAL-DESIGN.md) — repo layout, process model, full SQLite DDL, `applyOp`/HLC/runs, core module APIs, `.bkmshare` format, data flows, renderer, packaging, test harness, v2 hooks.
6. [rig-tests/TEMPLATE.md](rig-tests/TEMPLATE.md) — copy to `rig-tests/p<N>-<slug>.md` for each phase sign-off.

Research behind the decisions (persona agents, 2026-09-12): [research/00-codebase-inventory.md](research/00-codebase-inventory.md), [research/01-the-doubtful.md](research/01-the-doubtful.md) (prior art and critique), [research/02-the-expert.md](research/02-the-expert.md) (state of the art, versions, risk register), [research/03-the-pragmatic.md](research/03-the-pragmatic.md) (decision record with pros/cons and reversal triggers), [research/04-the-planner.md](research/04-the-planner.md) (source of the phase files).

Reference rigs: Windows RTX 3050 Ti Laptop 4 GB VRAM / 32 GB RAM, and Apple M1 16 GB. Nothing merges into `v2-local-first` without a signed-off rig test on both.
