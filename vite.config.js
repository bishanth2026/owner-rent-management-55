import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages project-site deployment
  base: './',

  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        resetPassword: 'reset-password.html',
      },
    },
  },
});
