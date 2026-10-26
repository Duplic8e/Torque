import type { ID } from '../data/types';

export function newId(): ID {
  return crypto.randomUUID();
}
