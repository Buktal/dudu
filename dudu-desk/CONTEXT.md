# CONTEXT.md — dudu-desk domain glossary

Names for good seams. Architecture reviews and refactors use these terms;
naming a module after a concept not listed here means adding it here first.

- **Reception workspace** — the agent-facing desk. Three modes: calm (one
  conversation), parallel (primary + pinned), quick (cards).
- **Conversation queue** — the filterable, sortable list of conversations
  awaiting or under reception. Owns query, cursors, counts, membership
  (`rewriteQueueIds`) and re-read triggers.
- **Reply pipeline** — draft → attach → send → advance-to-next. Owns the
  reply-allowed decision and submission lifecycle.
- **Live events** — the subscription + reconnect + recovery flow. Owns cursor
  dedup, receipt ranking and the queue/history/capability fan-out.
- **Reply policy** — the reply-allowed decision: restriction + capability +
  one clock value (`replyRestriction` in `reply-pipeline.ts`).
- **Operation** — a scoped inbox request: abort-previous + generation guard +
  guaranteed release (`runOperation` in `stores/requests.ts`).
- **Fixture builder** — the shared kernel (`fixtures.ts`) both the seeded
  development world and the hand-built test world build conversations through.
