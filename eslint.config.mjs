// ESLint for every TypeScript, Svelte and JavaScript file outside the ignored folders.
// Rules: .claude/rules/typescript.md and svelte.md; boundaries: docs/ARCHITECTURE.md section 2
// (import rules live in .dependency-cruiser.cjs; the globals below are what it cannot see).
// Formatting is Prettier's job: eslint-config-prettier comes after every rule set.
import { defineConfig } from 'eslint/config';
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const svelteFiles = ['**/*.svelte', '**/*.svelte.ts'];
// Browser network APIs the desktop UI must not use (docs/ARCHITECTURE.md section 2).
const networkGlobals = ['fetch', 'WebSocket', 'XMLHttpRequest', 'EventSource'];
const networkMessage =
  'The UI talks to the core through lib/core (Tauri commands and events) only.';

export default defineConfig(
  {
    name: 'pulse/ignores',
    // Keep in step with .prettierignore. Prettier also reads .gitignore; ESLint does not.
    ignores: [
      'docs/',
      '.claude/',
      'apps/android/',
      'apps/desktop/src-tauri/',
      '**/node_modules/',
      '**/dist/',
      '**/build/',
      '**/target/',
      '**/coverage/',
      '**/generated/',
    ],
  },
  {
    name: 'pulse/linter-options',
    linterOptions: { reportUnusedDisableDirectives: 'error', reportUnusedInlineConfigs: 'error' },
  },

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  svelte.configs.recommended,
  comments.recommended,

  {
    name: 'pulse/type-information',
    languageOptions: {
      parserOptions: {
        // Each file is checked against the nearest tsconfig.json (apps/server, apps/desktop, ...).
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte'],
      },
    },
  },
  {
    name: 'pulse/svelte-script',
    files: svelteFiles,
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },

  {
    name: 'pulse/rules',
    rules: {
      // Silencing a rule needs a reason: `// eslint-disable-next-line rule -- why`.
      '@eslint-community/eslint-comments/require-description': 'error',
      // typescript.md: a non-null assertion needs a reason, i.e. a described inline disable.
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // `process.env['PORT']` marks a lookup that may be missing.
      '@typescript-eslint/dot-notation': ['error', { allowIndexSignaturePropertyAccess: true }],
      // Numbers read naturally in messages; objects, nullish values and `any` still do not.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
    },
  },

  {
    name: 'pulse/javascript',
    // Plain JavaScript (root configs, scripts/) belongs to no tsconfig: no type-aware rules
    // (after pulse/rules, which configures two of them).
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    name: 'pulse/server',
    files: ['apps/server/**'],
    languageOptions: { globals: globals.node },
    rules: {
      // Nest modules are empty classes carrying a decorator.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },
  {
    name: 'pulse/desktop-ui',
    files: ['apps/desktop/src/**'],
    languageOptions: { globals: globals.browser },
    rules: {
      // The UI never talks to the server: the Rust core owns HTTP and WebSocket (ARCHITECTURE 2).
      'no-restricted-globals': [
        'error',
        ...networkGlobals.map((name) => ({ name, message: networkMessage })),
      ],
      'no-restricted-properties': [
        'error',
        ...['window', 'globalThis', 'self'].flatMap((object) =>
          networkGlobals.map((property) => ({ object, property, message: networkMessage })),
        ),
      ],
    },
  },
  {
    name: 'pulse/node-tooling',
    files: ['scripts/**', '*.mjs', '*.cjs', '*.js', 'apps/*/*.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    name: 'pulse/repo-scripts',
    // Command-line tools report on the console.
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },
  prettier,
  svelte.configs.prettier,
  {
    name: 'pulse/after-prettier',
    // eslint-config-prettier turns curly off; a brace-less body Prettier wraps onto its own line
    // reads like a block, so it needs braces.
    rules: { curly: ['error', 'multi-line'] },
  },
);
