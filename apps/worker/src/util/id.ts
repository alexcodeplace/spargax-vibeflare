import { nanoid as _nanoid } from 'nanoid';

export function nanoid(size?: number): string {
  return _nanoid(size);
}

export function newId(): string {
  return _nanoid(21);
}

export function newApiKey(): { full: string; prefix: string } {
  const body = _nanoid(40);
  const full = `vf-${body}`;
  return { full, prefix: full.slice(0, 8) };
}
