import { Injectable } from '@nestjs/common';
import type { OperationResponse } from '@pulse/contract';
import { UnitOfWork } from '../../platform/database/unit-of-work.js';
import { unauthenticated } from './auth-errors.js';
import { toUser } from './user.mapper.js';
import { UsersRepository } from './users.repository.js';

@Injectable()
export class AccountService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly users: UsersRepository,
  ) {}

  /** The signed-in account; `userId` comes from the verified access token, never from the request. */
  async me(userId: string): Promise<OperationResponse<'auth.getMe'>> {
    const row = await this.users.findById(this.unitOfWork.pool, userId);
    // The guard just proved a live credential, which cannot outlive its user (ON DELETE CASCADE);
    // a missing row is a race with account deletion.
    if (row === undefined) throw unauthenticated();
    return toUser(row);
  }
}
