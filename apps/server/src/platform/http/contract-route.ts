import {
  Body,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  SetMetadata,
  applyDecorators,
} from '@nestjs/common';
import { httpOperation, successStatusOf, type HttpOperationName } from '@pulse/contract';

/** Metadata key under which `ContractRoute` records the operation's `auth` requirement. */
export const OPERATION_AUTH = 'pulse:operation-auth';

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
    // The global auth guard enforces what the catalogue says: an operation cannot be bound to a
    // route and forget its authentication.
    SetMetadata(OPERATION_AUTH, op.auth),
  );
}

function schemaOf(name: HttpOperationName, part: 'params' | 'query' | 'body') {
  const schema = httpOperation(name)[part];
  if (!schema) throw new Error(`Contract operation ${name} has no ${part}`);
  return schema;
}

/** The validated query of a contract operation (unknown query fields are rejected). */
export const ContractQuery = (name: HttpOperationName): ParameterDecorator =>
  Query({ schema: schemaOf(name, 'query') });

/** The validated JSON body of a contract operation (unknown fields are rejected, spec 9.1). */
export const ContractBody = (name: HttpOperationName): ParameterDecorator =>
  Body({ schema: schemaOf(name, 'body') });

/** The validated path parameters of a contract operation. */
export const ContractParams = (name: HttpOperationName): ParameterDecorator =>
  Param({ schema: schemaOf(name, 'params') });
