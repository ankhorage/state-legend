import { describe, expect, it } from 'bun:test';

import { createLegendStateAdapter } from './index';

describe('createLegendStateAdapter', () => {
  it('supports path-based set and get', () => {
    const adapter = createLegendStateAdapter();

    const setResult = adapter.set(['forms', 'contact', 'values'], {
      firstname: 'Fabio',
      newsletter: true,
    });
    const getResult = adapter.get(['forms', 'contact', 'values']);

    expect(setResult).toEqual({ ok: true });
    expect(getResult).toEqual({
      ok: true,
      data: {
        firstname: 'Fabio',
        newsletter: true,
      },
    });
  });

  it('supports initial state and string paths', () => {
    const adapter = createLegendStateAdapter({
      initialState: {
        session: {
          user: {
            id: 'user-1',
          },
        },
      },
    });

    expect(adapter.get('session.user.id')).toEqual({ ok: true, data: 'user-1' });
  });

  it('notifies subscribers on set', () => {
    const adapter = createLegendStateAdapter();
    const snapshots: unknown[] = [];
    const subscriptionResult = adapter.subscribe('counter.value', ({ value }) => {
      snapshots.push(value);
    });

    expect(subscriptionResult.ok).toBe(true);

    adapter.set('counter.value', 1);
    adapter.set('counter.value', 2);

    expect(snapshots).toEqual([1, 2]);
  });

  it('stops notifying after unsubscribe', async () => {
    const adapter = createLegendStateAdapter();
    const snapshots: unknown[] = [];
    const subscriptionResult = adapter.subscribe('counter.value', ({ value }) => {
      snapshots.push(value);
    });

    if (!subscriptionResult.ok) {
      throw new Error('Expected subscription to succeed.');
    }

    adapter.set('counter.value', 1);
    await subscriptionResult.data.unsubscribe();
    adapter.set('counter.value', 2);

    expect(snapshots).toEqual([1]);
  });

  it('deletes values and notifies subscribers', () => {
    const adapter = createLegendStateAdapter({
      initialState: {
        session: {
          user: {
            id: 'user-1',
          },
        },
      },
    });
    const snapshots: unknown[] = [];
    adapter.subscribe('session.user', ({ value }) => {
      snapshots.push(value);
    });

    const deleteResult = adapter.delete?.('session.user');

    expect(deleteResult).toEqual({ ok: true });
    expect(adapter.get('session.user')).toEqual({ ok: true, data: undefined });
    expect(snapshots).toEqual([undefined]);
  });

  it('returns deterministic errors for empty paths', () => {
    const adapter = createLegendStateAdapter();

    expect(adapter.get('')).toEqual({
      ok: false,
      error: {
        code: 'invalid_path',
        message: 'State path must contain at least one segment.',
      },
    });
  });

  it('returns deterministic errors for nested path conflicts', () => {
    const adapter = createLegendStateAdapter({
      initialState: {
        session: 'invalid',
      },
    });

    expect(adapter.set('session.user.id', 'user-1')).toEqual({
      ok: false,
      error: {
        code: 'path_conflict',
        message: 'Cannot set nested state below non-object path segment "session".',
      },
    });
  });
});
