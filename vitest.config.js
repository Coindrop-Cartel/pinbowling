import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

// Recreate __dirname for ES Modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    alias: {
      '@scripts': path.resolve(__dirname, './scripts'),
      '@services': path.resolve(__dirname, './scripts/services'),
      '@ui': path.resolve(__dirname, './scripts/ui'),
      '@core': path.resolve(__dirname, './scripts/core'),
      '@pages': path.resolve(__dirname, './scripts/pages'),
    },
    environment: 'jsdom',
  },
});