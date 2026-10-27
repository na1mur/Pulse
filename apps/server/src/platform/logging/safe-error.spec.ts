// OPS-04: what a log may say about an unexpected error. The message of a driver or validation
// error can embed user values (an email in "invalid input syntax ... "a@b.c""), so only the class
// name, a code and the stack frames are logged, never the message text.
import { describe, expect, it } from 'vitest';
import { stackFrames, summarizeError } from './safe-error.js';

class DatabaseError extends Error {
  override readonly name = 'DatabaseError';
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

describe('summarizeError (OPS-04)', () => {
  it('names the class and the code, never the message', () => {
    const error = new DatabaseError(
      'invalid input syntax for type uuid: "a.person@example.org"',
      '22P02',
    );
    const summary = summarizeError(error);
    expect(summary).toBe('DatabaseError [22P02]');
    expect(summary).not.toContain('example.org');
  });

  it('leaves out a code that is not a short upper-case identifier', () => {
    const error = Object.assign(new Error('x'), { code: 'a.person@example.org' });
    expect(summarizeError(error)).toBe('Error');
  });

  it('falls back to Error for a class name that is not a plain identifier', () => {
    const error = new Error('x');
    error.name = 'a.person@example.org says hi';
    expect(summarizeError(error)).toBe('Error');
  });

  it('describes a value that is not an Error by its type alone', () => {
    expect(summarizeError('a.person@example.org')).toBe('a thrown string');
    expect(summarizeError(null)).toBe('a thrown null');
    expect(summarizeError({ email: 'a.person@example.org' })).toBe('a thrown object');
    expect(summarizeError(undefined)).toBe('a thrown undefined');
  });
});

describe('stackFrames (OPS-04)', () => {
  it('keeps the frames and drops the message lines, also a multi-line message', () => {
    const stack = [
      'Error: invalid input for "a.person@example.org"',
      'second line of the message with a.person@example.org',
      '    at Repository.find (file:///app/repo.js:10:5)',
      '    at async Service.run (file:///app/service.js:3:1)',
    ].join('\n');
    expect(stackFrames(stack)).toBe(
      '    at Repository.find (file:///app/repo.js:10:5)\n    at async Service.run (file:///app/service.js:3:1)',
    );
  });

  it('is empty when there is no stack', () => {
    expect(stackFrames(undefined)).toBe('');
    expect(stackFrames('Error: only a message')).toBe('');
  });
});
