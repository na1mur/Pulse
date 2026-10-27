import { Logger } from '@nestjs/common';
import {
  ERROR_HTTP_STATUS,
  REQUEST_ID_HEADER,
  SERVER_TIME_HEADER,
  type ErrorBody,
  type ErrorCode,
} from '@pulse/contract';
import { STATUS_CODES, type Server } from 'node:http';
import type { Clock } from '../clock/clock.js';
import { runWithLogContext } from '../logging/log-context.js';
import { createRequestStamp } from './request-context.middleware.js';

/** The part of a socket this handler uses (a real `net.Socket` fits; specs pass a fake). */
export interface ClientErrorSocket {
  readonly writable: boolean;
  readonly destroyed: boolean;
  /** Present on a real socket; a socket that already wrote part of an answer cannot start another. */
  readonly bytesWritten?: number;
  end(data: string): unknown;
  destroy(): unknown;
}

const logger = new Logger('Http');

// A client that was too slow is told to try again (UNAVAILABLE); everything else Node rejects
// before routing is a request it could not parse or accept (VALIDATION). The status follows the
// contract's code, like every other answer (ERROR_HTTP_STATUS), not Node's 408 and 431.
function codeFor(error: NodeJS.ErrnoException): ErrorCode {
  return (error.code ?? '').includes('TIMEOUT') ? 'UNAVAILABLE' : 'VALIDATION';
}

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  VALIDATION: 'The request is invalid.',
  UNAVAILABLE: 'The request was not completed in time. Try again.',
};

/**
 * Spec 7.1: answers a request that Node rejects itself (malformed request line, oversized header,
 * a request or headers timeout) with the contract's JSON error, request ID and server time, then
 * closes the connection. Without this Node writes a bare `400 Bad Request` with no body. When the
 * socket cannot be written to, or already carries part of an answer, it is closed instead.
 * Nothing the client sent is echoed or logged (OPS-04).
 */
export function handleClientError(
  error: NodeJS.ErrnoException,
  socket: ClientErrorSocket,
  clock: Clock,
): void {
  if (!socket.writable || socket.destroyed || (socket.bytesWritten ?? 0) > 0) {
    socket.destroy();
    return;
  }
  const code = codeFor(error);
  const status = ERROR_HTTP_STATUS[code];
  const { requestId, serverTime } = createRequestStamp(clock);
  const body: ErrorBody = { code, message: MESSAGES[code] ?? 'The request is invalid.', requestId };
  const json = JSON.stringify(body);
  socket.end(
    [
      `HTTP/1.1 ${status} ${STATUS_CODES[status] ?? ''}`,
      `${REQUEST_ID_HEADER}: ${requestId}`,
      `${SERVER_TIME_HEADER}: ${serverTime}`,
      'Content-Type: application/json; charset=utf-8',
      `Content-Length: ${Buffer.byteLength(json)}`,
      'Connection: close',
      '',
      json,
    ].join('\r\n'),
  );
  runWithLogContext({ requestId }, () => {
    logger.warn({ message: 'request rejected before routing', status });
  });
}

/** Replaces Node's bare default answer for rejected requests on `server`. */
export function installClientErrorHandler(server: Server, clock: Clock): void {
  server.on('clientError', (error, socket) => {
    handleClientError(error, socket, clock);
  });
}
