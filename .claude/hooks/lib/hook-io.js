// Shared stdin and exit handling for Pulse's PreToolUse hooks.
// decide(input, raw) returns null (allow), or { decision: 'block' | 'ask', reason }.
// Block: reason on stderr, exit 2. Ask: permission JSON on stdout, exit 0. Allow: silent exit 0.
'use strict';

function finish(result) {
  if (result && result.decision === 'block') {
    process.stderr.write(result.reason + '\n');
    process.exit(2);
  }
  if (result && result.decision === 'ask') {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: result.reason },
    }));
  }
  process.exit(0);
}

function runHook(name, maxBytes, decide) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > maxBytes) finish({ decision: 'block', reason: `BLOCKED: input too large for ${name} to check.` });
  });
  process.stdin.on('end', () => {
    let input = null;
    try {
      input = JSON.parse(raw);
    } catch {
      // handled below
    }
    if (!input || typeof input !== 'object') {
      finish({ decision: 'block', reason: `BLOCKED: ${name} could not parse its input.` });
    }
    finish(decide(input, raw));
  });
}

module.exports = { runHook };
