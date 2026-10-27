import type { OperationResponse } from '@pulse/contract';
import { formatDateMillis } from '../../domain/time/index.js';
import type { UserRow } from './users.repository.js';

/**
 * The wire `User`: what the signed-in person may see of their account. The password hash and
 * the Google subject never leave the server, only whether they exist.
 */
export function toUser(row: UserRow): OperationResponse<'auth.getMe'> {
  return {
    id: row.id,
    email: row.email,
    emailVerifiedAt:
      row.email_verified_at === null ? null : formatDateMillis(row.email_verified_at),
    hasPassword: row.password_hash !== null,
    googleLinked: row.google_subject !== null,
    createdAt: formatDateMillis(row.created_at),
    updatedAt: formatDateMillis(row.updated_at),
  };
}
