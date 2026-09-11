import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listChats, renameChat, deleteChat, type ChatRecord } from '../api';

export const CHATS_KEY = ['chats'] as const;

export function useChats() {
  return useQuery({
    queryKey: CHATS_KEY,
    queryFn: listChats,
  });
}

export function useRenameChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameChat(id, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHATS_KEY }),
  });
}

export function useDeleteChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteChat(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHATS_KEY }),
  });
}

export type { ChatRecord };
