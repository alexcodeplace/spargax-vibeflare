import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listKeys, createKey, revokeKey, type ApiKey } from '../api';

export const KEYS_KEY = ['keys'] as const;

/** Fetch all API keys. */
export function useKeys() {
  return useQuery({
    queryKey: KEYS_KEY,
    queryFn: listKeys,
  });
}

/** Create a new API key and invalidate the keys list on success. */
export function useCreateKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ label, isAdmin }: { label: string; isAdmin: boolean }) =>
      createKey(label, isAdmin),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS_KEY }),
  });
}

/** Revoke an API key and invalidate the keys list on success. */
export function useRevokeKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS_KEY }),
  });
}

export type { ApiKey };
