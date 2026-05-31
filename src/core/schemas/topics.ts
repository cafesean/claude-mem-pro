// SPDX-License-Identifier: Apache-2.0

/**
 * Topic taxonomy for structured observation tagging.
 *
 * Locked enum of 44 topics across 7 categories, sourced from the
 * dev-workflow plugin's session-update schema. Used to constrain
 * the free-form `concepts` field on memory items / observations
 * into a stable cross-session vocabulary.
 *
 * Expansion process: PR-based. Add new topics only when no existing
 * topic fits the work being tagged.
 *
 * See spec: _context/plugins/claude-mem/_specs/dev-workflow-schema-absorb/
 */

import { z } from 'zod';

export const TOPIC_CATEGORIES = {
  architecture: [
    'rls',
    'permissions',
    'rbac',
    'multi-tenancy',
    'org-isolation',
    'org-switching',
    'extension-pattern',
    'router-pattern',
    'repository-pattern',
    'actor-pattern',
    'schema-design',
    'migration'
  ],
  sdk: [
    'core-sdk',
    'framework-sdk',
    'cloud-sdk',
    'messaging-sdk',
    'cadra-sdk',
    'sdk-api-design',
    'sdk-exports',
    'sdk-build'
  ],
  infrastructure: [
    'caching',
    'cdn',
    'vercel',
    'serverless',
    'neon-http',
    'docker',
    'redis',
    'bullmq',
    'database',
    's3',
    'deployment'
  ],
  frontend: [
    'data-table',
    'inline-editing',
    'forms',
    'modals',
    'mobile-layout',
    'canvas-rendering',
    'streaming',
    'sse'
  ],
  auth_security: [
    'auth',
    'jwt',
    'session-management',
    'api-keys',
    'oauth',
    'cors'
  ],
  integration: [
    'trpc',
    'rest-api',
    'open-api',
    'webhooks',
    'messaging-channels',
    'whatsapp'
  ],
  testing: [
    'e2e-testing',
    'integration-testing',
    'smoke-testing',
    'regression-testing'
  ],
  plugins_agents: [
    'plugins',
    'skills',
    'agents',
    'hooks',
    'codex',
    'obsidian'
  ]
} as const;

export const TOPICS = [
  ...TOPIC_CATEGORIES.architecture,
  ...TOPIC_CATEGORIES.sdk,
  ...TOPIC_CATEGORIES.infrastructure,
  ...TOPIC_CATEGORIES.frontend,
  ...TOPIC_CATEGORIES.auth_security,
  ...TOPIC_CATEGORIES.integration,
  ...TOPIC_CATEGORIES.testing,
  ...TOPIC_CATEGORIES.plugins_agents
] as const satisfies readonly string[];

export type Topic = (typeof TOPICS)[number];

const TOPIC_SET: ReadonlySet<string> = new Set(TOPICS);

export const TopicSchema: z.ZodType<Topic> = z.enum(TOPICS as unknown as [string, ...string[]]) as unknown as z.ZodType<Topic>;

export const TopicsArraySchema = z.array(TopicSchema).default([]);

export interface ValidateTopicsResult {
  valid: Topic[];
  invalid: string[];
}

export function isTopic(value: string): value is Topic {
  return TOPIC_SET.has(value);
}

/**
 * Partition a list of strings into known topics and unknown values.
 * Does not throw — caller decides how to handle invalid entries.
 */
export function validateTopics(input: readonly string[]): ValidateTopicsResult {
  const valid: Topic[] = [];
  const invalid: string[] = [];
  for (const value of input) {
    if (isTopic(value)) {
      valid.push(value);
    } else {
      invalid.push(value);
    }
  }
  return { valid, invalid };
}

/**
 * Find which category a topic belongs to. Returns null if topic is unknown.
 */
export function topicCategory(topic: string): keyof typeof TOPIC_CATEGORIES | null {
  for (const [category, list] of Object.entries(TOPIC_CATEGORIES) as Array<
    [keyof typeof TOPIC_CATEGORIES, readonly string[]]
  >) {
    if (list.includes(topic)) {
      return category;
    }
  }
  return null;
}
