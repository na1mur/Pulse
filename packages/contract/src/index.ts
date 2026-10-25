// @pulse/contract: the one source of every operation, event and error (spec section 7).
// Schemas are zod; types are inferred from them (`z.infer<typeof Session>`) or derived from the
// catalogue (`OperationBody<'timer.start'>`). The HTTP client lives in `@pulse/contract/client`.
export * from './primitives.js';
export * from './entities.js';
export * from './errors.js';
export * from './events.js';
export * from './http.js';
export * from './operations/auth.js';
export * from './operations/timer-sessions.js';
export * from './operations/settings.js';
export * from './operations/system.js';
export * from './catalogue.js';
export * from './examples/index.js';
