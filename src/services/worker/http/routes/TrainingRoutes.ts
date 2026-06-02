// SPDX-License-Identifier: Apache-2.0
import express, { Request, Response } from 'express';
import { z } from 'zod';
import { BaseRouteHandler } from '../BaseRouteHandler.js';
import { validateBody } from '../middleware/validateBody.js';
import { logger } from '../../../../utils/logger.js';
import type { DatabaseManager } from '../../DatabaseManager.js';
import {
  createTrainingFact,
  listTrainingFacts,
  retireTrainingFact,
} from '../../../training/TrainingService.js';
import { getProjectContext } from '../../../../utils/project-name.js';

const listQuerySchema = z.object({
  cwd: z.string().min(1).optional(),
  scope: z.enum(['project', 'global', 'all']).default('all'),
});

const createFactSchema = z
  .object({
    cwd: z.string().min(1).optional(),
    scope: z.enum(['project', 'global']),
    title: z.string().min(1).max(500),
    content: z.string().min(1).max(10000),
  })
  .strict();

const retireParamsSchema = z.object({ id: z.coerce.number().int().positive() });

export class TrainingRoutes extends BaseRouteHandler {
  constructor(private dbManager: DatabaseManager) {
    super();
  }

  setupRoutes(app: express.Application): void {
    app.post('/api/training/facts', validateBody(createFactSchema), this.handleCreate.bind(this));
    app.get('/api/training/facts', this.handleList.bind(this));
    app.post('/api/training/facts/:id/retire', this.handleRetire.bind(this));
  }

  private handleCreate = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    const body = req.body as z.infer<typeof createFactSchema>;
    const sessionStore = this.dbManager.getSessionStore();
    const chromaSync = this.dbManager.getChromaSync();
    const result = await createTrainingFact(sessionStore, chromaSync, body);
    logger.info('TRAINING', `created fact id=${result.id} scope=${body.scope} project=${result.project}`);
    res.json({ ok: true, ...result });
  });

  private handleList = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'ValidationError', issues: parsed.error.issues });
      return;
    }
    const { cwd, scope } = parsed.data;
    const sessionStore = this.dbManager.getSessionStore();
    const project = getProjectContext(cwd ?? process.cwd()).primary;
    const includeGlobal = scope === 'all' || scope === 'global';
    const facts = listTrainingFacts(sessionStore, { project, includeGlobal });
    res.json({ ok: true, facts });
  });

  private handleRetire = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    const parsed = retireParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      this.badRequest(res, 'invalid_id');
      return;
    }
    const sessionStore = this.dbManager.getSessionStore();
    const chromaSync = this.dbManager.getChromaSync();
    await retireTrainingFact(sessionStore, chromaSync, parsed.data.id);
    logger.info('TRAINING', `retired fact id=${parsed.data.id}`);
    res.json({ ok: true });
  });
}
