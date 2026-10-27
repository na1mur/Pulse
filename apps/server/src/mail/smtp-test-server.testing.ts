// Test support (not built into dist, see tsconfig.build.json): in-process SMTP servers on a free
// loopback port, so the mail specs need no Mailpit and no network.
import { createServer, type Server, type Socket } from 'node:net';
import { simpleParser, type ParsedMail } from 'mailparser';
import { SMTPServer } from 'smtp-server';
import type { MailConfig } from '../platform/config/app-config.js';

export interface TestSmtpServer {
  readonly port: number;
  /** Every message the server accepted, parsed. */
  readonly messages: readonly ParsedMail[];
  /** How many times a client tried to log in. */
  readonly authAttempts: () => number;
  readonly close: () => Promise<void>;
}

export interface TestSmtpServerOptions {
  /** Answer RCPT TO with a 550 whose text contains the address (as real servers do). */
  readonly rejectRecipients?: boolean;
  /** Answer the end of DATA with a 554. */
  readonly rejectData?: boolean;
  /** Offer STARTTLS (with an untrusted certificate, so a client that verifies it must refuse). */
  readonly offerTls?: boolean;
}

/** A catcher like Mailpit: no TLS, no required login. */
export async function startTestSmtpServer(
  options: TestSmtpServerOptions = {},
): Promise<TestSmtpServer> {
  const messages: ParsedMail[] = [];
  let authAttempts = 0;
  const server = new SMTPServer({
    logger: false,
    authOptional: true,
    allowInsecureAuth: true,
    disabledCommands: options.offerTls === true ? [] : ['STARTTLS'],
    onAuth(_auth, _session, callback) {
      authAttempts += 1;
      callback(new Error('Invalid login'));
    },
    onRcptTo(address, _session, callback) {
      if (options.rejectRecipients === true) {
        callback(
          Object.assign(new Error(`Mailbox ${address.address} does not exist`), {
            responseCode: 550,
          }),
        );
        return;
      }
      callback();
    },
    onData(stream, _session, callback) {
      if (options.rejectData === true) {
        stream.resume();
        stream.on('end', () => {
          callback(Object.assign(new Error('Message refused'), { responseCode: 554 }));
        });
        return;
      }
      simpleParser(stream)
        .then((parsed) => {
          messages.push(parsed);
          callback();
        })
        .catch((error: unknown) => {
          callback(error instanceof Error ? error : new Error('parse failed'));
        });
    },
  });
  const port = await new Promise<number>((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.server.address();
      if (address === null || typeof address === 'string') reject(new Error('no port'));
      else resolve(address.port);
    });
  });
  return {
    port,
    messages,
    authAttempts: () => authAttempts,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}

/** A server that accepts connections and never says a word (a hung mail host). */
export async function startSilentServer(): Promise<{
  readonly port: number;
  readonly close: () => Promise<void>;
}> {
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  const port = await new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(typeof address === 'object' && address !== null ? address.port : 0);
    });
  });
  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => {
          resolve();
        });
      }),
  };
}

/** A port nothing listens on: connecting is refused at once. */
export async function unusedPort(): Promise<number> {
  const server = createServer();
  const port = await new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(typeof address === 'object' && address !== null ? address.port : 0);
    });
  });
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  return port;
}

export function catcherConfig(port: number, overrides: Partial<MailConfig> = {}): MailConfig {
  return {
    host: '127.0.0.1',
    port,
    user: undefined,
    password: undefined,
    from: 'Pulse <pulse@example.org>',
    ...overrides,
  };
}
