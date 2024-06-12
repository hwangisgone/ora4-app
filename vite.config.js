import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { makeOffline } from "vite-plugin-make-offline";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte(), makeOffline()],
  build: {
      minify: false
  },
})
