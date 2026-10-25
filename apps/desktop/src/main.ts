import { mount } from 'svelte';

import App from './app/App.svelte';
import './app/app.css';

const target = document.getElementById('app');
if (!target) {
  throw new Error('index.html has no #app element to mount the UI into');
}

mount(App, { target });
