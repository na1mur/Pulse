import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import { fieldErrors } from '@pulse/contract';
import { AppError } from '../errors/app-error.js';

const LOCATION = { body: 'body', query: 'query', param: 'params', custom: 'custom' } as const;

/**
 * Validates every argument that carries a contract schema (`@Body({ schema })` and friends, set by
 * the contract decorators) and reports failures as VALIDATION with field paths (spec 7.1). Nest's
 * built-in StandardSchemaValidationPipe validates the same way but cannot say where a field was.
 */
@Injectable()
export class ContractValidationPipe implements PipeTransform<unknown, Promise<unknown>> {
  async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    const { schema } = metadata;
    if (!schema) return value;
    const result = await schema['~standard'].validate(value);
    if (result.issues) {
      throw new AppError('VALIDATION', 'The request is invalid.', {
        fields: fieldErrors(LOCATION[metadata.type], result.issues),
      });
    }
    return result.value;
  }
}
