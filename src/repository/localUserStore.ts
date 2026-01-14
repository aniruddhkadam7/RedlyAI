import { isLocalUser, type LocalUser } from './localUser';

const ACTIVE_KEY = 'ea.localUser.active';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const loadActiveLocalUser = (): Result<LocalUser> => {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (!raw) return { ok: false, error: 'No active user. Exactly one LocalUser must be active.' };
    const parsed = JSON.parse(raw) as unknown;
    if (!isLocalUser(parsed)) return { ok: false, error: 'Invalid active user. Exactly one LocalUser must be active.' };
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, error: 'Failed to load active user. Exactly one LocalUser must be active.' };
  }
};

export const setActiveLocalUser = (user: LocalUser): Result<LocalUser> => {
  if (!isLocalUser(user)) return { ok: false, error: 'Active user must be a valid LocalUser.' };
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(user));
    return { ok: true, value: user };
  } catch {
    return { ok: false, error: 'Failed to persist active user.' };
  }
};

/** Guard that rejects any operation if the active user is missing. */
export const requireActiveLocalUser = (): Result<LocalUser> => {
  const res = loadActiveLocalUser();
  if (!res.ok) return res;
  return res;
};
