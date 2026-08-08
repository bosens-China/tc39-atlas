import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  platform: 'node',
  target: 'node22',
  format: 'esm',
  clean: true,
  deps: {
    alwaysBundle: ['@tc39-atlas/core'],
    onlyImport: ['@modelcontextprotocol/server', 'zod'],
  },
});
