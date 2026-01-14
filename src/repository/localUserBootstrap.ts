import { v4 as uuid } from 'uuid';
import { type LocalUser, isLocalUser } from './localUser';
import { loadActiveLocalUser, setActiveLocalUser } from './localUserStore';

const getOsUsername = (): string | undefined => {
  if (typeof process !== 'undefined' && process.env) {
    const candidate = process.env.USERNAME || process.env.USER || process.env.LOGNAME;
    if (candidate && String(candidate).trim()) return String(candidate).trim();
  }
  return undefined;
};

/** Ensure exactly one LocalUser exists and is active. */
export const ensureLocalUser = (): { ok: true; value: LocalUser } | { ok: false; error: string } => {
  const existing = loadActiveLocalUser();
  if (existing.ok && isLocalUser(existing.value)) {
    return existing;
  }

  const displayName = getOsUsername() || 'Local Architect';
  const user: LocalUser = {
    id: uuid(),
    displayName,
    createdAt: new Date().toISOString(),
    type: 'LOCAL',
  };

  const persisted = setActiveLocalUser(user);
  if (!persisted.ok) {
    // Guarantee a non-null current user even if persistence failed.
    return { ok: true, value: user };
  }
  return { ok: true, value: user };
};
