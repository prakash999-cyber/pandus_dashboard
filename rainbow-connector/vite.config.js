import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/main.jsx',
      name: 'RainbowConnector',
      fileName: () => 'wallet-connect.bundle.js',
      formats: ['iife']
    },
    outDir: '../',
    emptyOutDir: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.warn', 'console.info'],
        passes: 2,
      },
      mangle: true,
      format: {
        comments: false,
      },
    },
    target: 'es2020',
    rollupOptions: {
      external: [],
      output: {
        globals: {}
      },
    }
  },
  define: {
    'process.env.NODE_ENV': '"production"'
  }
});
