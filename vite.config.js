import { defineConfig } from 'vite';

// The published build lives at https://piotrek1115.github.io/sixth-face/, so
// every asset URL needs that prefix. Locally the base stays '/' — set the
// same BASE env var Vite uses and nothing else in the app has to know, as
// long as runtime asset paths go through import.meta.env.BASE_URL (see
// src/render/labels.js). index.html's own /favicon.svg and /src/main.js are
// rewritten by Vite itself.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/sixth-face/' : '/',
}));
