import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    glsl({
      include: [
        '**/*.glsl',
        '**/*.vert',
        '**/*.frag'
      ],
      defaultExtension: 'glsl',
      compress: false,
      watch: true
    })
  ],
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@samplers': resolve(__dirname, 'src/samplers'),
      '@shaders': resolve(__dirname, 'src/shaders'),
      '@interaction': resolve(__dirname, 'src/interaction'),
      '@playground': resolve(__dirname, 'src/playground'),
      '@utils': resolve(__dirname, 'src/utils'),
      'three/addons/': 'three/examples/jsm/'
    }
  },
  server: {
    port: 3000,
    open: true,
    fs: {
      deny: ['.git', 'node_modules', 'legacy', 'libs']
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: ['legacy/**']
    }
  },
  optimizeDeps: {
    exclude: ['legacy']
  }
});

