export type AuditEvent = {
  userId: string;
  action: string;
  repositoryName: string;
  timestamp: string;
};

const AUDIT_LIMIT = 200;

const keyForRepo = (repositoryName: string) => `ea.audit.${repositoryName}`;

export const recordAuditEvent = (event: {
  userId: string;
  action: string;
  repositoryName: string;
  timestamp?: string;
}): void => {
  const userId = (event.userId || '').trim();
  const repositoryName = (event.repositoryName || '').trim();
  const action = (event.action || '').trim();
  if (!userId || !repositoryName || !action) return;

  const entry: AuditEvent = {
    userId,
    action,
    repositoryName,
    timestamp: event.timestamp ?? new Date().toISOString(),
  };

  try {
    const key = keyForRepo(repositoryName);
    const existingRaw = localStorage.getItem(key);
    const items: AuditEvent[] = existingRaw ? (JSON.parse(existingRaw) as AuditEvent[]) : [];
    items.unshift(entry);
    if (items.length > AUDIT_LIMIT) items.length = AUDIT_LIMIT;
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Best-effort only.
  }
};

export const readAuditEventsForOwner = (repositoryName: string, requesterIsOwner: boolean): AuditEvent[] => {
  if (!requesterIsOwner) return [];
  try {
    const raw = localStorage.getItem(keyForRepo(repositoryName));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AuditEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
