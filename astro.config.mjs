import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://gnsscalc.com',
  trailingSlash: 'never',
  integrations: [
    react(),
    sitemap({
      serialize(item) {
        if (item.url === 'https://gnsscalc.com/') {
          item.priority = 1.0;
          item.changefreq = 'weekly';
        } else {
          item.priority = 0.8;
          item.changefreq = 'monthly';
        }
        return item;
      },
    }),
  ],
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
