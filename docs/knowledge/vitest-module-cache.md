# Vitest module cache

Vitest 5 keeps transformed modules in an on-disk cache that is **not invalidated when a tsconfig changes**. Reproduced in T0.2 (2026-10-24): after toggling the decorator flags Nest depends on (`experimentalDecorators`, `emitDecoratorMetadata`), tests kept running the old transform until the cache was cleared.

So every Vitest config in the repo sets `test.fsModuleCache: false` (`apps/server/vitest.config.ts`, `apps/desktop/vite.config.ts`). Set it in any new package too. The cost is a slightly slower cold start; revisit if a later Vitest version keys the cache on the tsconfig.
