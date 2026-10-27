import { AppError } from '../../platform/errors/app-error.js';

/**
 * The one answer for wrong credentials, unusable tokens and a signed-out device: it says nothing
 * about why (spec 9.1 uniform errors).
 */
export function unauthenticated(): AppError {
  return new AppError('UNAUTHENTICATED', 'Authentication is required.');
}
