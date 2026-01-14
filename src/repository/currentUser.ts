import { ensureLocalUser } from './localUserBootstrap';
import type { LocalUser } from './localUser';

export const getCurrentUserOrThrow = (): LocalUser => {
  const res = ensureLocalUser();
  if (!res.ok) {
    throw new Error(res.error || 'Current user is unavailable.');
  }
  return res.value;
};

export const getCurrentUser = (): LocalUser => {
  const res = ensureLocalUser();
  if (res.ok) return res.value;
  // Fallback to a synthesized user to avoid undefined; still surfaces in logs.
  return {
    id: 'local-fallback',
    displayName: 'Local Architect',
    createdAt: new Date().toISOString(),
    type: 'LOCAL',
  };
};
