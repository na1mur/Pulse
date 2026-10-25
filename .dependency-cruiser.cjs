// Architecture-boundary check for the TypeScript workspaces (docs/ARCHITECTURE.md sections 2-3).
// Run by scripts/check.mjs: `depcruise apps packages`. Rust boundaries are crate dependencies in
// Cargo.toml; Kotlin packages are checked in review (ARCHITECTURE section 5).

// Matches an npm package by name: installed (any node_modules layout, pnpm's included) or, when
// it does not resolve, the bare module name.
const npmPackage = (names) => `(^|/)node_modules/(${names})(/|$)|^(${names})(/|$)`;

// Network clients the desktop UI must never use: the Rust core owns HTTP and WebSocket.
const NETWORK_PACKAGES = npmPackage(
  'axios|ky|ofetch|ws|undici|node-fetch|cross-fetch|isomorphic-ws|socket[.]io-client|' +
    'graphql-request|@tauri-apps/plugin-(http|websocket|upload)',
);
const DATABASE_PACKAGES = npmPackage('kysely|pg');

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ARCHITECTURE 2: the server never imports client code and clients never import server code;
    // they meet only in packages/contract.
    {
      name: 'server-not-to-clients',
      severity: 'error',
      comment: 'apps/server must not import client code; share it through packages/contract.',
      from: { path: '^apps/server/' },
      to: { path: '^apps/(desktop|android)/' },
    },
    {
      name: 'clients-not-to-server',
      severity: 'error',
      comment: 'Client code must not import apps/server; share it through packages/contract.',
      from: { path: '^apps/(desktop|android)/' },
      to: { path: '^apps/server/' },
    },
    {
      name: 'packages-not-to-apps',
      severity: 'error',
      comment: 'packages/* (contract, tokens) are depended on by the apps, never the reverse.',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },

    // ARCHITECTURE 2: the UI never talks to the server; lib/core alone calls Tauri.
    {
      name: 'desktop-ui-no-network',
      severity: 'error',
      comment:
        'The desktop UI calls Tauri commands through lib/core; the Rust core owns the network.',
      from: { path: '^apps/desktop/src/' },
      to: { path: NETWORK_PACKAGES },
    },
    {
      name: 'tauri-api-only-in-lib-core',
      severity: 'error',
      comment: 'Only apps/desktop/src/lib/core may import @tauri-apps/* (invoke, events).',
      from: { path: '^apps/desktop/src/', pathNot: '^apps/desktop/src/lib/core/' },
      to: { path: npmPackage('@tauri-apps/[^/]+') },
    },

    // ARCHITECTURE 2-3: features meet only through their public entry file; lib/ is shared code
    // underneath the features and the app shell.
    {
      name: 'feature-only-through-index',
      severity: 'error',
      comment: 'Import another feature only through its index.ts; move shared code to lib/.',
      from: { path: '^apps/desktop/src/features/([^/]+)/' },
      to: {
        path: '^apps/desktop/src/features/[^/]+/',
        pathNot: ['^apps/desktop/src/features/$1/', '^apps/desktop/src/features/[^/]+/index[.]ts$'],
      },
    },
    {
      name: 'desktop-lib-not-to-features',
      severity: 'error',
      comment: 'lib/ is shared by features and the app shell, so it must not depend on them.',
      from: { path: '^apps/desktop/src/lib/' },
      to: { path: '^apps/desktop/src/(features|app)/' },
    },

    // ARCHITECTURE 3 (server): domain/ is pure; controllers never touch the database.
    {
      name: 'server-domain-pure',
      severity: 'error',
      comment: 'apps/server/src/domain holds pure functions: no Nest, no database, no other layer.',
      from: { path: '^apps/server/src/domain/' },
      to: {
        path: [
          npmPackage('@nestjs/[^/]+'),
          DATABASE_PACKAGES,
          '^apps/server/src/(modules|platform|mail)/',
        ],
      },
    },
    {
      name: 'server-transport-no-database',
      severity: 'error',
      comment: 'Controllers and gateways call services; only repositories run SQL.',
      from: { path: '^apps/server/src/.+[.](controller|gateway)[.]ts$' },
      to: { path: ['[.]repository[.]ts$', DATABASE_PACKAGES] },
    },

    // General hygiene.
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular imports hide layering mistakes and break module initialisation order.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'The import does not resolve to a file or an installed package.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-non-package-json',
      severity: 'error',
      comment: "Import only packages declared in the importing package's package.json.",
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'not-to-test',
      severity: 'error',
      comment: 'Production code must not import tests.',
      from: { pathNot: '[.](spec|test)[.]ts$' },
      to: { path: '[.](spec|test)[.]ts$' },
    },
    {
      name: 'server-not-to-dev-dep',
      severity: 'error',
      comment: 'The server image installs production dependencies only; tests may use dev ones.',
      from: { path: '^apps/server/src/', pathNot: '[.](spec|test)[.]ts$' },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    // Build output, Rust and Android sources are not part of the TypeScript graph. Anchored to
    // the workspace's own folders: an unanchored dist/ would also drop every npm package that
    // ships from dist/ and so the edges the rules above check (QA T0.2 Bug 1,
    // scripts/dependency-cruiser.test.mjs). node_modules stays in for the same reason.
    exclude: {
      path: '^(apps|packages)/[^/]+/(dist|build|coverage)/|^target/|^apps/(android|desktop/src-tauri)/',
    },
    // Type-only imports count too: a server type imported by the desktop is still a boundary leak.
    tsPreCompilationDeps: true,
    // A missing workspace package is reported against the importing package's own manifest.
    combinedDependencies: false,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    skipAnalysisNotInRules: true,
  },
};
