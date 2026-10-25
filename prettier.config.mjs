// Prettier formats TypeScript, Svelte, JavaScript, JSON, YAML, CSS, HTML and Markdown outside the
// ignored folders (.prettierignore). Rust uses rustfmt and Kotlin ktlint (CLAUDE.md, Commands).
/** @type {import('prettier').Config} */
export default {
  // Matches .editorconfig's max line length for Rust and Kotlin.
  printWidth: 100,
  singleQuote: true,
  plugins: ['prettier-plugin-svelte'],
  overrides: [{ files: '*.svelte', options: { parser: 'svelte' } }],
};
