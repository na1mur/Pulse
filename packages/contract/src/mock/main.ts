// `pnpm --filter @pulse/contract mock [--port 4010]`: runs the mock server until stopped.
import { parseArgs } from 'node:util';
import { startMockServer } from './mock-server.js';

// `pnpm ... mock -- --port 4010` forwards the `--` separator too; drop it.
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const { values } = parseArgs({ args, options: { port: { type: 'string', default: '4010' } } });
const port = Number(values.port);
if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new Error(`--port must be an integer between 0 and 65535, got "${values.port}"`);
}
const server = await startMockServer({ port });
process.stdout.write(
  `Pulse mock server on ${server.url} (WebSocket ${server.url.replace('http', 'ws')}/v1/sync/stream)\n`,
);
const stop = () => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
