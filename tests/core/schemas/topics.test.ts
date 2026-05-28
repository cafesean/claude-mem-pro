// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'bun:test';
import {
  TOPICS,
  TOPIC_CATEGORIES,
  TopicSchema,
  TopicsArraySchema,
  isTopic,
  topicCategory,
  validateTopics
} from '../../../src/core/schemas/topics.js';

describe('topic taxonomy', () => {
  it('exposes 61 topics across 8 categories', () => {
    expect(TOPICS.length).toBe(61);
  });

  it('contains no duplicates', () => {
    const set = new Set(TOPICS);
    expect(set.size).toBe(TOPICS.length);
  });

  it('groups topics into 8 categories', () => {
    expect(Object.keys(TOPIC_CATEGORIES).length).toBe(8);
  });

  it('every category total equals total topic count', () => {
    const total = Object.values(TOPIC_CATEGORIES).reduce((sum, list) => sum + list.length, 0);
    expect(total).toBe(TOPICS.length);
  });

  it('includes well-known anchors', () => {
    for (const anchor of ['rls', 'caching', 'oauth', 'core-sdk', 'data-table', 'trpc', 'e2e-testing', 'plugins']) {
      expect(isTopic(anchor)).toBe(true);
    }
  });

  it('rejects unknown topics', () => {
    expect(isTopic('not-a-topic')).toBe(false);
    expect(isTopic('')).toBe(false);
  });
});

describe('TopicSchema', () => {
  it('parses valid topic', () => {
    expect(TopicSchema.parse('rls')).toBe('rls');
  });

  it('throws on invalid topic', () => {
    expect(() => TopicSchema.parse('made-up')).toThrow();
  });
});

describe('TopicsArraySchema', () => {
  it('parses array of valid topics', () => {
    expect(TopicsArraySchema.parse(['rls', 'caching'])).toEqual(['rls', 'caching']);
  });

  it('defaults to empty array', () => {
    expect(TopicsArraySchema.parse(undefined)).toEqual([]);
  });

  it('throws if any topic is invalid', () => {
    expect(() => TopicsArraySchema.parse(['rls', 'not-a-topic'])).toThrow();
  });
});

describe('validateTopics', () => {
  it('partitions valid and invalid', () => {
    const result = validateTopics(['rls', 'foo', 'caching', 'bar']);
    expect(result.valid).toEqual(['rls', 'caching']);
    expect(result.invalid).toEqual(['foo', 'bar']);
  });

  it('handles empty input', () => {
    expect(validateTopics([])).toEqual({ valid: [], invalid: [] });
  });

  it('handles all-invalid input', () => {
    expect(validateTopics(['x', 'y'])).toEqual({ valid: [], invalid: ['x', 'y'] });
  });

  it('handles all-valid input', () => {
    expect(validateTopics(['rls', 'caching'])).toEqual({
      valid: ['rls', 'caching'],
      invalid: []
    });
  });
});

describe('topicCategory', () => {
  it('finds architecture topics', () => {
    expect(topicCategory('rls')).toBe('architecture');
    expect(topicCategory('migration')).toBe('architecture');
  });

  it('finds infrastructure topics', () => {
    expect(topicCategory('caching')).toBe('infrastructure');
    expect(topicCategory('vercel')).toBe('infrastructure');
  });

  it('finds auth_security topics', () => {
    expect(topicCategory('oauth')).toBe('auth_security');
  });

  it('returns null for unknown', () => {
    expect(topicCategory('not-a-topic')).toBeNull();
  });
});
