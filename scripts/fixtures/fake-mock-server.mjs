// Stand-in for `pnpm --filter @pulse/contract mock` in scripts/contract-mock-smoke.test.mjs.
//
//   node fake-mock-server.mjs --port N [--mode ok|silent|exit|refuse] [--pid-file F] [--wrap]
//
// --wrap re-runs this script as a child and mirrors its exit code, like pnpm's launcher processes,
// so the test can prove the whole process tree is stopped. Modes: ok answers GET /health and an
// `auth` WebSocket message with `ready`; silent accepts connections but never answers; exit quits
// with code 3; refuse answers `auth` with an `error` message.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    port: { type: 'string' },
    mode: { type: 'string', default: 'ok' },
    'pid-file': { type: 'string' },
    wrap: { type: 'boolean', default: false },
  },
});

if (values.wrap) {
  const args = process.argv.slice(1).filter((arg) => arg !== '--wrap');
  const child = spawn(process.execPath, args, { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 1));
} else if (values.mode === 'exit') {
  process.exit(3);
} else {
  if (values['pid-file']) writeFileSync(values['pid-file'], String(process.pid));
  const now = () => new Date().toISOString();
  const server = createServer((request, response) => {
    if (values.mode === 'silent') return;
    if (request.url === '/health') {
      response
        .writeHead(200, { 'content-type': 'application/json', 'pulse-server-time': now() })
        .end('{"status":"ok"}');
      return;
    }
    response.writeHead(404).end();
  });
  // Just enough WebSocket (RFC 6455) for one short masked client frame and one reply.
  server.on('upgrade', (request, socket) => {
    // The smoke client may drop the connection without a closing handshake.
    socket.on('error', () => undefined);
    if (values.mode === 'silent') return;
    const accept = createHash('sha1')
      .update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    socket.once('data', (frame) => {
      const length = frame[1] & 0x7f;
      const mask = frame.subarray(2, 6);
      const payload = frame.subarray(6, 6 + length).map((byte, index) => byte ^ mask[index % 4]);
      const auth = JSON.parse(Buffer.from(payload).toString('utf8')).type === 'auth';
      const type = auth && values.mode === 'ok' ? 'ready' : 'error';
      const reply = Buffer.from(JSON.stringify({ type, serverTime: now(), revision: 0 }));
      socket.write(Buffer.concat([Buffer.from([0x81, reply.length]), reply]));
    });
  });
  server.listen(Number(values.port), '127.0.0.1');
}
