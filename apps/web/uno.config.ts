import { defineConfig, presetWind3 } from 'unocss';

export default defineConfig({
  content: {
    filesystem: [
      './docs/**/*.{md,mdx,ts,tsx}',
      './src/**/*.{ts,tsx}',
      './theme/**/*.{ts,tsx}',
    ],
  },
  presets: [presetWind3()],
});
