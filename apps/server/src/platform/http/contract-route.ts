import { Get, HttpCode, Post, Query, applyDecorators } from '@nestjs/common';
import { httpOperation, successStatusOf, type HttpOperationName } from '@pulse/contract';

/**
 * Binds a handler to a contract operation: method, path and success status all come from the
 * catalogue, so routes cannot drift from the contract. Annotate the handler's parameters with
 * `OperationBody<Name>` and friends and its result with `OperationResponse<Name>`.
 */
export function ContractRoute(name: HttpOperationName): MethodDecorator {
  const op = httpOperation(name);
  const path = op.path.replace(/\{(\w+)\}/g, ':$1');
  return applyDecorators(
    op.method === 'GET' ? Get(path) : Post(path),
    HttpCode(successStatusOf(op)),
  );
}

// Body and path-parameter decorators join ContractQuery when the first operation needs them.
function schemaOf(name: HttpOperationName, part: 'params' | 'query' | 'body') {
  const schema = httpOperation(name)[part];
  if (!schema) throw new Error(`Contract operation ${name} has no ${part}`);
  return schema;
}

/** The validated query of a contract operation (unknown query fields are rejected). */
export const ContractQuery = (name: HttpOperationName): ParameterDecorator =>
  Query({ schema: schemaOf(name, 'query') });
