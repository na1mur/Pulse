import { describeStartupFailure, startServer } from './bootstrap.js';

try {
  await startServer();
} catch (error) {
  process.stderr.write(`${describeStartupFailure(error)}\n`);
  process.exitCode = 1;
}
