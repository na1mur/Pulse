import { Inject, Injectable } from '@nestjs/common';
import type { OperationBody, OperationResponse } from '@pulse/contract';
import { randomUUID } from 'node:crypto';
import { STARTER_TAGS } from '../../domain/auth/starter-tags.js';
import { commandInstant } from '../../domain/command-time.js';
import { tagNameKey } from '../../domain/tag-name.js';
import {
  canonicalTimeZone,
  formatInstantMillis,
  instantFromDate,
} from '../../domain/time/index.js';
import { CLOCK, type Clock } from '../../platform/clock/clock.js';
import { UnitOfWork, type Executor } from '../../platform/database/unit-of-work.js';
import { invalidRequest } from '../../platform/errors/app-error.js';
import { IdempotencyService } from '../../platform/idempotency/idempotency.service.js';
import { RevisionService } from '../../platform/revisions/revision.service.js';
import { toPreferences } from '../preferences/preferences.mapper.js';
import { PreferencesRepository } from '../preferences/preferences.repository.js';
import { toTag } from '../tags/tag.mapper.js';
import { TagsRepository } from '../tags/tags.repository.js';
import { unauthenticated } from './auth-errors.js';
import { UsersRepository } from './users.repository.js';

type Result = OperationResponse<'auth.completeFirstSignIn'>;

/**
 * AUTH-12, US-4.1, US-6.1: the first time a person is signed in they confirm their timezone and
 * receive the starter tags (TAG-07). A data write like any other (D-30): it carries a command ID,
 * runs once per ID (R-34), bumps the user's revision (R-35) and stores the result in the same
 * transaction, so a replay is answered with what the first call answered.
 *
 * "Once" is also enforced across different command IDs, because two devices can finish setup at
 * the same moment: the preferences row is locked, and setup already completed is not repeated.
 * The timezone then stays as confirmed, never silently replaced (R-15); the answer carries the
 * current preferences, so the device sees what the server holds.
 */
@Injectable()
export class FirstSignInService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly idempotency: IdempotencyService,
    private readonly revisions: RevisionService,
    private readonly users: UsersRepository,
    private readonly preferences: PreferencesRepository,
    private readonly tags: TagsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async complete(userId: string, body: OperationBody<'auth.completeFirstSignIn'>): Promise<Result> {
    // The contract checked the name is known; the stored form is the IANA spelling (R-09).
    const timezone = canonicalTimeZone(body.timezone);
    if (timezone === undefined) {
      throw invalidRequest([{ path: 'body.timezone', message: 'Unknown IANA timezone' }]);
    }
    return this.unitOfWork.run((transaction) =>
      this.idempotency.run(transaction, userId, body.commandId, () =>
        this.setUp(transaction, userId, timezone, body.occurredAt),
      ),
    );
  }

  private async setUp(
    transaction: Executor,
    userId: string,
    timezone: string,
    occurredAt: string | undefined,
  ): Promise<Result> {
    // The lock that makes concurrent setups queue; what they see afterwards is the final state.
    const current = await this.preferences.findForUpdate(transaction, userId);
    if (current === undefined) throw unauthenticated();
    if (current.onboarding_completed_at !== null) {
      const live = await this.tags.listLive(transaction, userId);
      return {
        revision: await this.revisions.current(transaction, userId),
        preferences: toPreferences(current),
        tags: live.map(toTag),
      };
    }

    const user = await this.users.findById(transaction, userId);
    if (user === undefined) throw unauthenticated();
    const now = this.clock.now();
    const completedAt = formatInstantMillis(
      commandInstant(occurredAt, now, instantFromDate(user.created_at)),
    );
    const nowText = formatInstantMillis(now);

    const revision = await this.revisions.bump(transaction, userId);
    const confirmed = await this.preferences.confirmTimezone(transaction, userId, {
      timezone,
      completedAt,
      revision,
    });
    const created = await this.tags.insertMany(
      transaction,
      userId,
      STARTER_TAGS.map((tag) => ({
        id: randomUUID(),
        name: tag.name,
        nameKey: tagNameKey(tag.name),
        category: tag.category,
        distractionClass: tag.distractionClass,
      })),
      { revision, now: nowText },
    );
    return { revision, preferences: toPreferences(confirmed), tags: created.map(toTag) };
  }
}
