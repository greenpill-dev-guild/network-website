import { defineConfig, passthroughImageService } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';
import keystatic from '@keystatic/astro';
import node from '@astrojs/node';

export default defineConfig({
  integrations: [tailwind(), react(), keystatic()],
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  image: {
    service: passthroughImageService(),
  },
});
