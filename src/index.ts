import type {
  StateAdapter,
  StateAdapterError,
  StatePath,
  StateResult,
  StateSubscription,
  StateValue,
} from '@ankhorage/contracts/state';
import { observable } from '@legendapp/state';

export interface LegendStateAdapterOptions {
  readonly initialState?: Record<string, StateValue>;
}

interface PathResolution {
  readonly ok: true;
  readonly parts: readonly string[];
}

interface PathResolutionError {
  readonly ok: false;
  readonly error: StateAdapterError;
}

type PathResolutionResult = PathResolution | PathResolutionError;

type StateRecord = Record<string, StateValue>;

type StateListenerSet = Set<(value: StateValue | undefined) => void>;

export function createLegendStateAdapter(
  options: LegendStateAdapterOptions = {},
): StateAdapter {
  const root$ = observable<StateRecord>({ ...(options.initialState ?? {}) });
  const listeners = new Map<string, StateListenerSet>();

  const emit = (path: StatePath, value: StateValue | undefined) => {
    const keyResult = normalizePath(path);
    if (!keyResult.ok) return;

    const listenersForPath = listeners.get(pathPartsToKey(keyResult.parts));
    if (!listenersForPath) return;

    for (const listener of listenersForPath) {
      listener(value);
    }
  };

  return {
    capabilities: {
      subscriptions: true,
      computed: false,
      persistence: false,
    },
    get(path) {
      const pathResult = normalizePath(path);
      if (!pathResult.ok) return pathResult;

      return {
        ok: true,
        data: readPath(root$.get(), pathResult.parts),
      };
    },
    set(path, value) {
      const pathResult = normalizePath(path);
      if (!pathResult.ok) return pathResult;

      const nextStateResult = setPath(root$.get(), pathResult.parts, value);
      if (!nextStateResult.ok) return nextStateResult;

      root$.set(nextStateResult.data);
      emit(path, value);
      return { ok: true };
    },
    subscribe(path, listener) {
      const pathResult = normalizePath(path);
      if (!pathResult.ok) return pathResult;

      const key = pathPartsToKey(pathResult.parts);
      const listenersForPath = listeners.get(key) ?? new Set<(value: StateValue | undefined) => void>();
      const wrappedListener = (value: StateValue | undefined) => {
        listener({ path, value });
      };

      listenersForPath.add(wrappedListener);
      listeners.set(key, listenersForPath);

      const subscription: StateSubscription = {
        unsubscribe() {
          listenersForPath.delete(wrappedListener);
          if (listenersForPath.size === 0) {
            listeners.delete(key);
          }
        },
      };

      return {
        ok: true,
        data: subscription,
      };
    },
    delete(path) {
      const pathResult = normalizePath(path);
      if (!pathResult.ok) return pathResult;

      const nextStateResult = deletePath(root$.get(), pathResult.parts);
      if (!nextStateResult.ok) return nextStateResult;

      root$.set(nextStateResult.data);
      emit(path, undefined);
      return { ok: true };
    },
  };
}

function normalizePath(path: StatePath): PathResolutionResult {
  const parts = Array.isArray(path) ? path : path.split('.');
  const normalized = parts.map((part) => part.trim()).filter(Boolean);

  if (normalized.length === 0) {
    return createError('invalid_path', 'State path must contain at least one segment.');
  }

  return {
    ok: true,
    parts: normalized,
  };
}

function pathPartsToKey(parts: readonly string[]): string {
  return parts.join('.');
}

function readPath(source: StateRecord, parts: readonly string[]): StateValue | undefined {
  let current: StateValue | undefined = source;

  for (const part of parts) {
    if (!isPlainStateRecord(current)) {
      return undefined;
    }

    current = current[part];
  }

  return current;
}

function setPath(
  source: StateRecord,
  parts: readonly string[],
  value: StateValue,
): StateResult<StateRecord> {
  const [head, ...tail] = parts;
  if (!head) {
    return createError('invalid_path', 'State path must contain at least one segment.');
  }

  if (tail.length === 0) {
    return {
      ok: true,
      data: {
        ...source,
        [head]: value,
      },
    };
  }

  const existing = source[head];
  const child = existing === undefined ? {} : existing;
  if (!isPlainStateRecord(child)) {
    return createError(
      'path_conflict',
      `Cannot set nested state below non-object path segment "${head}".`,
    );
  }

  const childResult = setPath(child, tail, value);
  if (!childResult.ok) return childResult;

  return {
    ok: true,
    data: {
      ...source,
      [head]: childResult.data,
    },
  };
}

function deletePath(source: StateRecord, parts: readonly string[]): StateResult<StateRecord> {
  const [head, ...tail] = parts;
  if (!head) {
    return createError('invalid_path', 'State path must contain at least one segment.');
  }

  if (tail.length === 0) {
    const { [head]: _removed, ...nextState } = source;
    return {
      ok: true,
      data: nextState,
    };
  }

  const existing = source[head];
  if (existing === undefined) {
    return { ok: true, data: source };
  }

  if (!isPlainStateRecord(existing)) {
    return createError(
      'path_conflict',
      `Cannot remove nested state below non-object path segment "${head}".`,
    );
  }

  const childResult = deletePath(existing, tail);
  if (!childResult.ok) return childResult;

  return {
    ok: true,
    data: {
      ...source,
      [head]: childResult.data,
    },
  };
}

function isPlainStateRecord(value: unknown): value is StateRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createError(code: string, message: string): { readonly ok: false; readonly error: StateAdapterError } {
  return {
    ok: false,
    error: { code, message },
  };
}
