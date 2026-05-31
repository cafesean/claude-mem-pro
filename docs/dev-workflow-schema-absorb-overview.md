# dev-workflow Schema Absorb — full pipeline (Phases 1-6)

This is the rollup for the six branches that implement the
dev-workflow-schema-absorb spec. Each phase ships independently
behind a separate PR; they layer cleanly so older phases need not be
merged before newer ones can be reviewed.

## Spec

Spec docs live in the consuming polyrepo at
`monorepo/_context/plugins/claude-mem/_specs/dev-workflow-schema-absorb/`.

## Branches

| Branch | Phase | Adds | Tests |
|---|---|---|---|
| `feature/dev-workflow-schema-absorb-phase-1` | 1 | 61-topic taxonomy + 9-kind discriminator + 6 prompts + kind detector + enrichment service + JSONB filter helper | 90 |
| `feature/dev-workflow-schema-absorb-phase-2` | 2 | UserPromptSubmit correction detector + capture service | 27 |
| `feature/dev-workflow-schema-absorb-phase-3` | 3 | SessionRecord schema + sonnet synthesiser + session boundary | 25 |
| `feature/dev-workflow-schema-absorb-phase-4` | 4 | Markdown renderer + three-way merge | 17 |
| `feature/dev-workflow-schema-absorb-phase-5` | 5 | LearningRecord + per-topic extractor + drift detector | 11 |
| `feature/dev-workflow-schema-absorb-phase-6` | 6 | Golden doc generator + drift detector | 8 |

Total: 178 new tests, 0 failures. Every phase is a pure addition —
no modifications to existing claude-mem schemas, storage, or live
generation pipeline.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 4 — Golden Docs (Phase 6)                              │
│  GoldenDocGenerator → _context/_arch/<topic>.md draft         │
│  GoldenDocDriftDetector → needs_review flagging               │
└──────────────────────────────────────────────────────────────┘
                            ↑ generate
┌──────────────────────────────────────────────────────────────┐
│  Layer 3 — Learning Records (Phase 5)                         │
│  LearningExtractor → per-topic LearningRecord                 │
│  LearningDriftDetector → re-extract triggers                  │
└──────────────────────────────────────────────────────────────┘
                            ↑ aggregate
┌──────────────────────────────────────────────────────────────┐
│  Layer 2 — Session Records (Phase 3 + 4)                      │
│  SessionSynthesizer → structured SessionRecord                │
│  SessionBoundary → 3 trigger paths converge on close          │
│  renderSessionMarkdown + threeWayMerge → human-edit-safe md   │
└──────────────────────────────────────────────────────────────┘
                            ↑ synthesise
┌──────────────────────────────────────────────────────────────┐
│  Layer 1 — Observations (Phase 1 + 2)                         │
│  Detector → 9 kinds → prompt module → LLM → Zod payload       │
│  CorrectionCaptureService → live user_correction signal       │
│  JSONB filter helper → topic/kind/applies_to queries          │
└──────────────────────────────────────────────────────────────┘
```

## Wiring not landed (deferred to follow-ups)

These pieces require live worker / hook changes and are explicitly
NOT in any of the six PRs — they slot on top once the primitives are
reviewed:

- BullMQ worker dispatch into DevWorkflowEnrichmentService
- UserPromptSubmit hook → CorrectionCaptureService
- CLI command `claude-mem session-end` → SessionBoundary
- SessionStop hook → SessionBoundary.onSessionStop
- Repository tables: `session_records`, `learning_records`, `golden_doc_sources`
- dev-workflow plugin command rewire (`/session-start /session-update /session-end` → claude-mem)
- Markdown render-on-demand CLI: `claude-mem render-session <id>`
- Migration importer: `claude-mem migrate sessions --from-dir=_ai/sessions/`

Each is straightforward once a host wires the adapter contracts the
services already expose.

## Model routing

- Atomic observation prompts (Phase 1) — Haiku for mechanical kinds
  (change/feature/discovery/sdk_note/user_correction), Sonnet for
  reasoning kinds (architecture_issue/lesson/problem_analysis/decision).
- Session synthesis (Phase 3) — Sonnet default.
- Learning extraction (Phase 5) — Sonnet default.
- Golden doc generation (Phase 6) — Sonnet default.

## Cost ceiling assumptions

- Detector + per-kind prompts run microseconds without LLM.
- 80% of observations route to Haiku; structured-output kinds cap
  at < $0.02 per observation.
- Session synthesis caps observations at 200 (truncated) so a
  pathological session does not blow context.
- Learning extraction skips topics below minLessons (default 3).
- All synthesis sub-agents use temperature 0 so re-runs on identical
  inputs are deterministic.
