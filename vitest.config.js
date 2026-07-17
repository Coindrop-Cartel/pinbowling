import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Enabling globals allows us to use 'describe', 'it', 'expect' without importing them in every file
    globals: true,
    environment: 'jsdom',
    // Restrict Vitest to only look for unit tests in the tests/unit directory
    include: ['tests/unit/**/*.{test,spec}.js'],
    // Setup aliases to match the project's module resolution used in your source code
    alias: {
      '@scripts': path.resolve(__dirname, './scripts'),
      '@core': path.resolve(__dirname, './scripts/core'),
      '@pages': path.resolve(__dirname, './scripts/pages'),
      '@services': path.resolve(__dirname, './scripts/services'),
      '@ui': path.resolve(__dirname, './scripts/ui'),
    },
  },
});