import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  ssr: {
    // The production image copies only web build outputs. Bundle the workspace runtime and pi-ai
    // adapter so Node never tries to execute TypeScript sources from sibling packages.
    noExternal: ['@open-codesign/providers', '@open-codesign/shared'],
    external: ['@mariozechner/pi-ai'],
  },
  server: {
    host: '0.0.0.0',
    port: 7860,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:7861',
    },
  },
});
