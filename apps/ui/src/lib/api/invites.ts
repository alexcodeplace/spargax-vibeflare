import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listInvites,
  createInvite,
  revokeInvite,
  validateInvite,
  type InviteRecord,
  type CreatedInviteResponse,
} from '../api';

export const INVITES_KEY = ['invites'] as const;

/** Fetch all invites. */
export function useInvites() {
  return useQuery({
    queryKey: INVITES_KEY,
    queryFn: listInvites,
  });
}

/** Create a new invite and invalidate the invites list on success. */
export function useCreateInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ label, expiresInSec }: { label: string | null; expiresInSec: number }) =>
      createInvite(label, expiresInSec),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVITES_KEY }),
  });
}

/** Revoke an invite and invalidate the invites list on success. */
export function useRevokeInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeInvite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVITES_KEY }),
  });
}

/** Validate the invite token stored in the current session cookie. */
export function useValidateInvite() {
  return useQuery({
    queryKey: ['invite-validate'],
    queryFn: validateInvite,
    retry: false,
  });
}

export type { InviteRecord, CreatedInviteResponse };
