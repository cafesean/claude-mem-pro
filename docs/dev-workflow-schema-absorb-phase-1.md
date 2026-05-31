# dev-workflow Schema Absorb — Phase 1

Implementation log for Phase 1 of the dev-workflow-schema-absorb spec.
The full spec lives at `monorepo/_context/plugins/claude-mem/_specs/dev-workflow-schema-absorb/`.

## What landed

Six commits, all on `feature/dev-workflow-schema-absorb-phase-1`:

| Commit | Phase | Scope |
|---|---|---|
| `0a994cda` | 1.1 | Locked 61-topic taxonomy + validator + category lookup |
| `12d1b6a7` | 1.2 | 9-kind discriminated union + Zod schemas + metadata helpers |
| `4e9698aa` | 1.4 | Per-kind prompt registry + haiku/sonnet routing |
| `85d93c15` | 1.5 | Heuristic kind detector |
| `c0f1244a` | 1.6 | DevWorkflowEnrichmentService (opt-in pipeline) |
| `8c84f173` | 1.7 | Postgres JSONB filter helper for dev_workflow fields |

Total: ~2300 LOC added, 90+ tests passing, zero modifications to the existing generation pipeline.

## Architectural choice — layered, not migrated

The existing `MemoryItemSchema` already has a `kind` field constrained to
`observation | summary | prompt | manual`, plus a `metadata: JsonObject` and a
free-form `concepts: string[]` array. The dev-workflow schema is layered
on top via `metadata.dev_workflow` — a typed payload validated by a Zod
discriminated union of nine kinds:

- legacy: `change`, `feature`, `discovery`
- new:    `architecture_issue`, `lesson`, `user_correction`, `sdk_note`, `problem_analysis`, `decision`

Existing rows are unaffected; existing search keeps working. The new
filter helper queries the JSONB payload via Postgres `?|` / `?&` /
`->>` operators — no schema migration required.

## Routing table — haiku vs sonnet

```
KIND_MODEL: {
  change:             'haiku',
  feature:            'haiku',
  discovery:          'haiku',
  sdk_note:           'haiku',
  user_correction:    'haiku',
  architecture_issue: 'sonnet',
  lesson:             'sonnet',
  problem_analysis:   'sonnet',
  decision:           'sonnet'
}
```

Rationale: mechanical extraction (file lists, narratives, verbatim
quotes) stays on Haiku. Reasoning-heavy kinds (status enums, evidence
grading, causal sequences, comparison logic) escalate to Sonnet. Detector
runs first (no LLM cost) → routes to right model.

## Where it lives in the repo

```
src/core/schemas/
  topics.ts                      ← 61-topic taxonomy + validators
  dev-workflow-kind.ts           ← 9-kind Zod discriminated union

src/server/generation/dev-workflow-prompts/
  types.ts                       ← PromptModule + KIND_MODEL routing
  architecture-issue.ts          ← prompt module
  lesson.ts                      ← prompt module
  user-correction.ts             ← prompt module
  sdk-note.ts                    ← prompt module
  problem-analysis.ts            ← prompt module
  decision.ts                    ← prompt module
  kind-detector.ts               ← heuristic classifier
  enrichment-service.ts          ← opt-in pipeline orchestrator
  index.ts                       ← registry + helpers

src/storage/postgres/
  observation-dev-workflow-search.ts ← JSONB filter helper

tests/core/schemas/
  topics.test.ts
  dev-workflow-kind.test.ts

tests/server/generation/
  dev-workflow-prompts.test.ts
  kind-detector.test.ts
  enrichment-service.test.ts

tests/storage/
  observation-dev-workflow-search.test.ts
```

## What is NOT done in Phase 1

| Phase 1 task | Status | Why |
|---|---|---|
| 1.3 Migration to back `concepts` w/ topics | SKIPPED | Layered metadata covers it; no DB change needed |
| 1.6 wire into live `ProviderObservationGenerator` | DEFERRED | Service exists but worker uses legacy path. Flag-gate flip is a future PR. |
| 1.7 GIN index on metadata.dev_workflow.topics | DEFERRED | Filter works against existing `metadata` JSONB; add GIN if query volume warrants it |
| 1.8 A/B test on 20 historic sessions | DEFERRED | Needs API key + historic data not available in this clone |

## Next milestones (out of Phase 1)

- **Phase 2** — UserPromptSubmit hook for real-time `user_correction` capture
- **Phase 3** — Session record synthesis (Sonnet sub-agent, full dev-workflow YAML schema)
- **Phase 4** — Markdown renderer + dev-workflow `/session-*` command rewire
- **Phase 5** — Per-topic learning extraction
- **Phase 6** — Golden doc generation

See spec at `monorepo/_context/plugins/claude-mem/_specs/dev-workflow-schema-absorb/`.

## Spec note

The original spec stated 44 topics / 7 categories. The actual count in
`plugins/dev-workflow/commands/session-update.md` is **61 topics across 8
categories** (the original count missed the `infrastructure` `s3` entry
and undercounted `architecture` + `plugins_agents`). Spec was corrected
during Phase 1 implementation.
