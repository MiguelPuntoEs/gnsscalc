import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://gnsscalc.com',
  trailingSlash: 'never',
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        'gnss-js': 'gnss-js/dist/index.js',
      },
    },
    optimizeDeps: {
      include: ['react-imask', 'imask'],
    },
  },
});
