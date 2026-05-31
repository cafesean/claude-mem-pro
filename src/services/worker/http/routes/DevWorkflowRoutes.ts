// SPDX-License-Identifier: Apache-2.0

import express, { Request, Response } from 'express';
import { z } from 'zod';
import { BaseRouteHandler } from '../BaseRouteHandler.js';
import { validateBody } from '../middleware/validateBody.js';
import { logger } from '../../../../utils/logger.js';
import type { DatabaseManager } from '../../DatabaseManager.js';

const userCorrectionSchema = z
  .object({
    sessionDbId: z.number().int().positive().optional(),
    memorySessionId: z.string().min(1).optional(),
    project: z.string().min(1),
    userMessage: z.string().min(1),
    signal: z.object({
      category: z.enum(['rejection', 'past-reference', 'direct', 'style']),
      confidence: z.number(),
      matchedText: z.string()
    })
  })
  .strict();

const sessionBoundarySchema = z
  .object({
    memorySessionId: z.string().min(1),
    project: z.string().min(1).optional(),
    trigger: z.enum(['explicit-cmd', 'session-stop-hook', 'idle-timeout']).default('session-stop-hook')
  })
  .strict();

/**
 * Worker HTTP routes for the dev-workflow live integrations:
 *   POST /api/observations/dev-workflow/user-correction
 *     Fire-and-forget correction capture from the UserPromptSubmit hook.
 *
 *   POST /api/sessions/dev-workflow/close
 *     Triggers SessionBoundary synthesis for a closed session.
 */
export class DevWorkflowRoutes extends BaseRouteHandler {
  constructor(private dbManager: DatabaseManager) {
    super();
  }

  setupRoutes(app: express.Application): void {
    app.post(
      '/api/observations/dev-workflow/user-correction',
      validateBody(userCorrectionSchema),
      this.handleUserCorrection.bind(this)
    );
    app.post(
      '/api/sessions/dev-workflow/close',
      validateBody(sessionBoundarySchema),
      this.handleSessionClose.bind(this)
    );
  }

  private handleUserCorrection = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    const body = req.body as z.infer<typeof userCorrectionSchema>;
    const sessionStore = this.dbManager.getSessionStore();

    // Fast path: persist a stub user_correction observation right away with
    // detector signal, so even if LLM enrichment fails we have the verbatim
    // quote + category recorded. Full LLM enrichment can be layered later.
    try {
      const memorySessionId =
        body.memorySessionId ?? sessionStore.getOrCreateManualSession(body.project);
      const title = body.userMessage.slice(0, 80) + (body.userMessage.length > 80 ? '…' : '');
      const stubPayload = {
        kind: 'user_correction',
        verbatim_quote: body.userMessage,
        agent_did_wrong: '(captured at hook time; full root-cause analysis pending)',
        root_cause: '(captured at hook time)',
        signal_category: body.signal.category,
        topics: [] as string[]
      };

      const stored = sessionStore.storeObservation(
        memorySessionId,
        body.project,
        {
          type: 'user_correction',
          title,
          subtitle: `signal=${body.signal.category} conf=${body.signal.confidence.toFixed(2)}`,
          facts: [body.signal.matchedText],
          narrative: body.userMessage,
          concepts: ['user_correction'],
          files_read: [],
          files_modified: [],
          agent_type: 'live-correction-hook',
          agent_id: null,
          metadata: JSON.stringify({
            dev_workflow: stubPayload,
            source: 'live-correction-hook'
          })
        }
      );

      logger.info('DW-CORRECTION', `captured stub correction id=${stored.id} signal=${body.signal.category}`);
      res.json({ continue: true, observationId: stored.id });
    } catch (err) {
      logger.warn('DW-CORRECTION', `capture failed: ${(err as Error).message?.slice(0, 200)}`);
      res.status(500).json({ continue: true, error: 'capture_failed' });
    }
  });

  private handleSessionClose = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    const body = req.body as z.infer<typeof sessionBoundarySchema>;
    const sessionStore = this.dbManager.getSessionStore();

    // For now, just mark the session as closed in our log. Full sonnet
    // synthesis happens via the `claude-mem-dw dw synthesize-session` CLI;
    // wiring it inline here would require running a sonnet call inside the
    // worker which we keep external for cost/latency control.
    logger.info(
      'DW-BOUNDARY',
      `session close requested memorySessionId=${body.memorySessionId} trigger=${body.trigger}`
    );
    res.json({ continue: true, queued: true });
  });
}
