import type {
  StateAdapter,
  StateAdapterError,
  StateListener,
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

interface LegendStateContext {
  readonly emit: (path: StatePath, value: StateValue | undefined) => void;
  readonly listeners: Map<string, StateListenerSet>;
  readonly readRootState: () => StateRecord;
  readonly writeRootState: (nextState: StateRecord) => void;
}

export function createLegendStateAdapter(options: LegendStateAdapterOptions = {}): StateAdapter {
  const context = createLegendStateContext(options);
  return {
    capabilities: {
      subscriptions: true,
      computed: false,
      persistence: false,
    },
    get: createGetOperation(context),
    set: createSetOperation(context),
    subscribe: createSubscribeOperation(context),
    delete: createDeleteOperation(context),
  };
}

function createLegendStateContext(options: LegendStateAdapterOptions): LegendStateContext {
  const root$ = observable<{ state: unknown }>({ state: { ...(options.initialState ?? {}) } });
  const listeners = new Map<string, StateListenerSet>();
  const readRootState = (): StateRecord => {
    const currentState = root$.state.get();
    return isPlainStateRecord(currentState) ? currentState : {};
  };
  const writeRootState = (nextState: StateRecord) => {
    root$.state.set(nextState);
  };
  const emit = (path: StatePath, value: StateValue | undefined) => {
    const keyResult = normalizePath(path);
    if (!keyResult.ok) return;

    const listenersForPath = listeners.get(pathPartsToKey(keyResult.parts));
    if (!listenersForPath) return;

    for (const listener of listenersForPath) {
      listener(value);
    }
  };
  return { emit, listeners, readRootState, writeRootState };
}

function createGetOperation(context: LegendStateContext): StateAdapter['get'] {
  return function get<TValue extends StateValue = StateValue>(
    path: StatePath,
  ): StateResult<TValue | undefined> {
    const pathResult = normalizePath(path);
    if (!pathResult.ok) return pathResult;
    const value = readPath(context.readRootState(), pathResult.parts);
    return createStateDataResult<TValue | undefined>(value as TValue | undefined);
  };
}

function createSetOperation(context: LegendStateContext): StateAdapter['set'] {
  return function set<TValue extends StateValue = StateValue>(
    path: StatePath,
    value: TValue,
  ): StateResult {
    const pathResult = normalizePath(path);
    if (!pathResult.ok) return pathResult;
    const nextStateResult = setPath(context.readRootState(), pathResult.parts, value);
    if (!nextStateResult.ok) return nextStateResult;
    context.writeRootState(nextStateResult.data);
    context.emit(path, value);
    return { ok: true };
  };
}

function createSubscribeOperation(context: LegendStateContext): StateAdapter['subscribe'] {
  return function subscribe<TValue extends StateValue = StateValue>(
    path: StatePath,
    listener: StateListener<TValue>,
  ): StateResult<StateSubscription> {
    const pathResult = normalizePath(path);
    if (!pathResult.ok) return pathResult;
    const key = pathPartsToKey(pathResult.parts);
    const listenersForPath =
      context.listeners.get(key) ?? new Set<(value: StateValue | undefined) => void>();
    const wrappedListener = (value: StateValue | undefined) => {
      listener({ path, value: value as TValue | undefined });
    };
    listenersForPath.add(wrappedListener);
    context.listeners.set(key, listenersForPath);
    const subscription: StateSubscription = {
      unsubscribe() {
        listenersForPath.delete(wrappedListener);
        if (listenersForPath.size === 0) {
          context.listeners.delete(key);
        }
      },
    };
    return { ok: true, data: subscription };
  };
}

function createDeleteOperation(context: LegendStateContext): NonNullable<StateAdapter['delete']> {
  return function deleteState(path: StatePath): StateResult {
    const pathResult = normalizePath(path);
    if (!pathResult.ok) return pathResult;
    const nextStateResult = deletePath(context.readRootState(), pathResult.parts);
    if (!nextStateResult.ok) return nextStateResult;
    context.writeRootState(nextStateResult.data);
    context.emit(path, undefined);
    return { ok: true };
  };
}

function normalizePath(path: StatePath): PathResolutionResult {
  const parts = typeof path === 'string' ? path.split('.') : [...path];
  const normalized = parts.map((part: string) => part.trim()).filter(Boolean);

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

    current = Reflect.get(current, part);
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

  const existing = Reflect.get(source, head) as StateValue | undefined;
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
    return {
      ok: true,
      data: Object.fromEntries(Object.entries(source).filter(([key]) => key !== head)),
    };
  }

  const existing = Reflect.get(source, head) as StateValue | undefined;
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

function createError(
  code: string,
  message: string,
): { readonly ok: false; readonly error: StateAdapterError } {
  return {
    ok: false,
    error: { code, message },
  };
}

function createStateDataResult<TValue>(data: TValue): StateResult<TValue> {
  const result = {
    ok: true,
    data,
  };

  return result as StateResult<TValue>;
}
