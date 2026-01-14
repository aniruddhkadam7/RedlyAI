export type LocalUserType = 'LOCAL';

export type LocalUser = {
  id: string; // uuid
  displayName: string;
  createdAt: string; // ISO timestamp
  type: LocalUserType;
};

export const isLocalUser = (value: unknown): value is LocalUser => {
  const v = value as any;
  return (
    v?.type === 'LOCAL' &&
    typeof v?.id === 'string' && v.id.trim().length > 0 &&
    typeof v?.displayName === 'string' && v.displayName.trim().length > 0 &&
    typeof v?.createdAt === 'string' && v.createdAt.trim().length > 0
  );
};
