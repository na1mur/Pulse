import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import App from './App.svelte';

describe('App shell', () => {
  it('renders the product name as the page heading', () => {
    render(App);

    expect(screen.getByRole('heading', { level: 1, name: 'Pulse' })).toBeTruthy();
  });
});
