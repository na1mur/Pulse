import type { OperationResponse } from '@pulse/contract';
import { formatDateMillis } from '../../domain/time/index.js';
import type { TagRow } from './tags.repository.js';

type WireTag = OperationResponse<'auth.completeFirstSignIn'>['tags'][number];

/** The wire `Tag`: no name key, revision or deletion mark (server-side bookkeeping). */
export function toTag(row: TagRow): WireTag {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    distractionClass: row.distraction_class,
    archived: row.archived,
    createdAt: formatDateMillis(row.created_at),
    updatedAt: formatDateMillis(row.updated_at),
  };
}
