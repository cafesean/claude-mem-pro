// SPDX-License-Identifier: Apache-2.0

/**
 * Session boundary trigger helpers — Phase 3.
 *
 * Three independent paths can close a session:
 *
 *   1. Explicit cmd  — `claude-mem session-end --session-id=X`
 *   2. SessionStop hook — emitted by the host when Claude Code stops
 *   3. Idle timeout — configurable, default disabled
 *
 * All three converge on `closeSession(sessionId)`. This module owns the
 * orchestration but defers gathering inputs + synthesis to caller-
 * injected functions, so it stays pure and unit-testable.
 */

import type { SessionRecord, SynthesisInputs } from '../../core/schemas/session-record.js';

export type CloseTrigger = 'explicit-cmd' | 'session-stop-hook' | 'idle-timeout';

export interface CloseSessionOptions {
  trigger: CloseTrigger;
  /** Project hint when multiple sessions are active. */
  project?: string;
}

export interface CloseSessionResult {
  sessionId: string;
  record: SessionRecord | null;
  trigger: CloseTrigger;
  synthesisCostUsd?: number;
  synthesisDurationMs?: number;
}

export interface BoundaryAdapters {
  /** Gather observations + transcript + git for the session. */
  gatherInputs: (sessionId: string) => Promise<SynthesisInputs>;
  /** Run the synthesiser; returns the populated record (or null). */
  synthesise: (
    inputs: SynthesisInputs
  ) => Promise<{
    record: SessionRecord | null;
    costUsd?: number;
    durationMs?: number;
  }>;
  /** Persist the record (e.g. upsert into session_records table). */
  persist: (record: SessionRecord) => Promise<void>;
  /** Lookup helper — verify the session exists before synthesising. */
  exists: (sessionId: string) => Promise<boolean>;
}

const DEFAULT_IDLE_MINUTES = 0;

export interface SessionBoundaryConfig {
  /** Idle minutes before auto-close. 0 disables. */
  idleCloseMinutes?: number;
  /** Listener invoked on each close — telemetry hook. */
  onClose?: (result: CloseSessionResult) => void;
}

export class SessionBoundary {
  private readonly idleCloseMinutes: number;
  private readonly onClose?: (result: CloseSessionResult) => void;

  constructor(
    private readonly adapters: BoundaryAdapters,
    config: SessionBoundaryConfig = {}
  ) {
    this.idleCloseMinutes = config.idleCloseMinutes ?? DEFAULT_IDLE_MINUTES;
    this.onClose = config.onClose;
  }

  async closeSession(
    sessionId: string,
    options: CloseSessionOptions
  ): Promise<CloseSessionResult> {
    const exists = await this.adapters.exists(sessionId);
    if (!exists) {
      throw new Error(`session_not_found: ${sessionId}`);
    }

    const inputs = await this.adapters.gatherInputs(sessionId);
    const synthOutcome = await this.adapters.synthesise(inputs);

    if (synthOutcome.record) {
      await this.adapters.persist(synthOutcome.record);
    }

    const result: CloseSessionResult = {
      sessionId,
      record: synthOutcome.record,
      trigger: options.trigger,
      synthesisCostUsd: synthOutcome.costUsd,
      synthesisDurationMs: synthOutcome.durationMs
    };

    this.onClose?.(result);
    return result;
  }

  /**
   * Returns true if idle-timeout is enabled and the supplied
   * lastActivityAt is older than the configured threshold.
   */
  shouldAutoClose(lastActivityAt: Date | null): boolean {
    if (this.idleCloseMinutes <= 0) return false;
    if (!lastActivityAt) return false;
    const elapsedMin = (Date.now() - lastActivityAt.getTime()) / 60_000;
    return elapsedMin >= this.idleCloseMinutes;
  }

  /**
   * Helper for hosts to drive a SessionStop hook directly without
   * threading the trigger parameter every time.
   */
  onSessionStop(sessionId: string, options: { project?: string } = {}): Promise<CloseSessionResult> {
    return this.closeSession(sessionId, {
      trigger: 'session-stop-hook',
      project: options.project
    });
  }
}
