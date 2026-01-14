import type { ViewInstance, ViewStatus } from '../viewpoints/ViewInstance';

const STORAGE_KEY = 'ea:diagram-views';

const dispatchViewsChanged = () => {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('ea:viewsChanged'));
    }
  } catch {
    // Best-effort only.
  }
};

const readFromStorage = (): ViewInstance[] => {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ViewInstance[];
  } catch {
    return [];
  }
};

const writeToStorage = (views: ViewInstance[]) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    // ignore write failures; operate in-memory only.
  }
};

const upsert = (view: ViewInstance): ViewInstance => {
  const existing = readFromStorage();
  const nextStatus: ViewStatus = 'SAVED';
  const normalized: ViewInstance = {
    ...view,
    status: nextStatus,
  };

  const byId = new Map(existing.map((v) => [v.id, v] as const));
  byId.set(view.id, normalized);
  const merged = Array.from(byId.values());

  writeToStorage(merged);
  dispatchViewsChanged();
  return normalized;
};

export const ViewStore = {
  /** Persist a view and mark it as SAVED. */
  save(view: ViewInstance): ViewInstance {
    return upsert(view);
  },

  list(): ViewInstance[] {
    return readFromStorage();
  },

  get(viewId: string): ViewInstance | undefined {
    return readFromStorage().find((v) => v.id === viewId);
  },
};
