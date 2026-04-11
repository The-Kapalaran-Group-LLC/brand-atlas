import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        codeSplitting: true, // Enable code splitting for better chunking
      },
    },
    chunkSizeWarningLimit: 1200, // Adjust this value as needed (in KB)
  },
});
