import { Injectable } from '@nestjs/common';
import type { OperationBody } from '@pulse/contract';
import { sql } from 'kysely';
import type { Executor } from '../../platform/database/unit-of-work.js';

/** What an install reports about itself when it signs in: the contract's `DeviceInfo`. */
export type DeviceReport = OperationBody<'auth.login'>['device'];

export interface NewCredential {
  readonly id: string;
  readonly deviceId: string;
  readonly userId: string;
  readonly tokenHash: Buffer;
  readonly familyId: string;
  readonly now: string;
  readonly expiresAt: string;
}

export interface CredentialRow {
  readonly deviceId: string;
  readonly userId: string;
  readonly revokedAt: Date | null;
}

/** SQL for `devices` and `credentials` (refresh credentials: only their hashes exist here). */
@Injectable()
export class SessionsRepository {
  /**
   * Serialises everything that registers or moves one device ID until the transaction ends. The
   * ID comes from the client and is globally unique, so two accounts can race for it.
   */
  async lockDevice(executor: Executor, deviceId: string): Promise<void> {
    await sql`select pg_advisory_xact_lock(hashtextextended(${deviceId}, 0))`.execute(executor);
  }

  /**
   * An install that another account used signs in as someone else: the old device row goes, and
   * its credentials with it (ON DELETE CASCADE); a device is never reassigned, so nothing the
   * previous account had on it carries over (D-34).
   */
  async deleteDeviceOfOtherUser(
    executor: Executor,
    deviceId: string,
    userId: string,
  ): Promise<void> {
    await executor
      .deleteFrom('devices')
      .where('id', '=', deviceId)
      .where('user_id', '<>', userId)
      .execute();
  }

  /** Creates the device or refreshes what it reports about itself. Call under `lockDevice`. */
  async upsertDevice(
    executor: Executor,
    userId: string,
    device: DeviceReport,
    now: string,
  ): Promise<void> {
    await executor
      .insertInto('devices')
      .values({
        id: device.id,
        user_id: userId,
        name: device.name,
        platform: device.platform,
        app_version: device.appVersion,
        created_at: now,
        last_seen_at: now,
      })
      .onConflict((conflict) =>
        conflict.column('id').doUpdateSet({
          name: device.name,
          platform: device.platform,
          app_version: device.appVersion,
          last_seen_at: now,
        }),
      )
      .execute();
  }

  async touchDevice(executor: Executor, deviceId: string, now: string): Promise<void> {
    await executor
      .updateTable('devices')
      .set({ last_seen_at: now })
      .where('id', '=', deviceId)
      .execute();
  }

  async clearPushToken(executor: Executor, deviceId: string): Promise<void> {
    await executor
      .updateTable('devices')
      .set({ push_token: null })
      .where('id', '=', deviceId)
      .execute();
  }

  async insertCredential(executor: Executor, credential: NewCredential): Promise<void> {
    await executor
      .insertInto('credentials')
      .values({
        id: credential.id,
        device_id: credential.deviceId,
        user_id: credential.userId,
        token_hash: credential.tokenHash,
        family_id: credential.familyId,
        issued_at: credential.now,
        expires_at: credential.expiresAt,
      })
      .execute();
  }

  /**
   * Signs a device out: every credential it holds, whatever family, is revoked once. Returns how
   * many were still live, so a caller can tell a revocation that ended something from a repeat.
   */
  async revokeDevice(
    executor: Executor,
    deviceId: string,
    userId: string,
    now: string,
  ): Promise<number> {
    const result = await executor
      .updateTable('credentials')
      .set({ revoked_at: now })
      .where('device_id', '=', deviceId)
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  /**
   * Rotation in one statement: revoke the presented credential if (and only if) it is still
   * unrevoked and unexpired, and in the same statement insert its successor in the same family
   * and device. Two concurrent rotations of one token cannot both succeed: the second waits for
   * the first's row lock, re-reads `revoked_at`, finds it set and matches nothing. Returns the
   * family's identity, or undefined when nothing was rotated.
   */
  async rotate(
    executor: Executor,
    presentedHash: Buffer,
    next: { id: string; tokenHash: Buffer; now: string; expiresAt: string },
  ): Promise<{ deviceId: string; userId: string; familyId: string } | undefined> {
    const result = await sql<{ device_id: string; user_id: string; family_id: string }>`
      with spent as (
        update credentials
           set revoked_at = ${next.now}::timestamptz
         where token_hash = ${presentedHash}
           and revoked_at is null
           and expires_at > ${next.now}::timestamptz
        returning device_id, user_id, family_id
      )
      insert into credentials (id, device_id, user_id, token_hash, family_id, issued_at, expires_at)
      select ${next.id}::uuid, device_id, user_id, ${next.tokenHash}::bytea, family_id,
             ${next.now}::timestamptz, ${next.expiresAt}::timestamptz
        from spent
      returning device_id, user_id, family_id`.execute(executor);
    const row = result.rows[0];
    return row === undefined
      ? undefined
      : { deviceId: row.device_id, userId: row.user_id, familyId: row.family_id };
  }

  /** The credential a token hash belongs to, revoked or not (to tell reuse from an unknown token). */
  async findByHash(executor: Executor, tokenHash: Buffer): Promise<CredentialRow | undefined> {
    const row = await executor
      .selectFrom('credentials')
      .select(['device_id', 'user_id', 'revoked_at'])
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();
    return row === undefined
      ? undefined
      : { deviceId: row.device_id, userId: row.user_id, revokedAt: row.revoked_at };
  }

  /**
   * Whether this family is still signed in: it holds an unrevoked, unexpired credential for this
   * user and device. One indexed lookup; the auth guard runs it on every request, which is what
   * makes revocation immediate rather than "within 15 minutes".
   */
  async isFamilyActive(
    executor: Executor,
    claims: { userId: string; deviceId: string; familyId: string },
    now: string,
  ): Promise<boolean> {
    const row = await executor
      .selectFrom('credentials')
      .select('id')
      .where('family_id', '=', claims.familyId)
      .where('user_id', '=', claims.userId)
      .where('device_id', '=', claims.deviceId)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', new Date(now))
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  }
}
