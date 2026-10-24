---
name: svelte5-best-practices
description: "Svelte 5 runes, snippets, and modern best practices for TypeScript and component development. Use when writing, reviewing, or refactoring Svelte 5 components (plain Svelte 5 + Vite, no SvelteKit). Triggers on: Svelte components, runes ($state, $derived, $effect, $props, $bindable, $inspect), snippets ({#snippet}, {@render}), event handling, TypeScript props typing, generic components, performance optimization, or component testing."
license: MIT
metadata:
  author: ejirocodes
  version: '1.0.0'
---

# Svelte 5 Best Practices

## Quick Reference

| Topic | When to Use | Reference |
|-------|-------------|-----------|
| **Runes** | $state, $derived, $effect, $props, $bindable, $inspect | [runes.md](references/runes.md) |
| **Snippets** | Replacing slots, {#snippet}, {@render} | [snippets.md](references/snippets.md) |
| **Events** | onclick handlers, callback props, context API | [events.md](references/events.md) |
| **TypeScript** | Props typing, generic components | [typescript.md](references/typescript.md) |
| **Performance** | Universal reactivity, avoiding over-reactivity, streaming | [performance.md](references/performance.md) |

## Essential Patterns

### Reactive State

```svelte
<script>
  let count = $state(0);           // Reactive state
  let doubled = $derived(count * 2); // Computed value
</script>
```

### Component Props

```svelte
<script>
  let { name, count = 0 } = $props();
  let { value = $bindable() } = $props(); // Two-way binding
</script>
```

### Snippets (replacing slots)

```svelte
<script>
  let { children, header } = $props();
</script>

{@render header?.()}
{@render children()}
```

### Event Handlers

```svelte
<!-- Svelte 5: use onclick, not on:click -->
<button onclick={() => count++}>Click</button>
```

### Callback Props (replacing createEventDispatcher)

```svelte
<script>
  let { onclick } = $props();
</script>

<button onclick={() => onclick?.({ data })}>Click</button>
```

## Common Mistakes

1. **Using `let` without `$state`** - Variables are not reactive without `$state()`
2. **Using `$effect` for derived values** - Use `$derived` instead
3. **Using `on:click` syntax** - Use `onclick` in Svelte 5
4. **Using `createEventDispatcher`** - Use callback props instead
5. **Using `<slot>`** - Use snippets with `{@render}`
6. **Forgetting `$bindable()`** - Required for `bind:` to work

> Pulse: plain Svelte 5 + Vite inside Tauri (no SvelteKit, no SSR). The SvelteKit and Svelte 4 migration references were removed when this skill was installed.
