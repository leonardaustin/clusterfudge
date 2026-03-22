import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/layouts': path.resolve(__dirname, './src/layouts'),
      '@/views': path.resolve(__dirname, './src/views'),
      '@/stores': path.resolve(__dirname, './src/stores'),
      '@/hooks': path.resolve(__dirname, './src/hooks'),
      '@/styles': path.resolve(__dirname, './src/styles'),
      '@/lib': path.resolve(__dirname, './src/lib'),
    },
  },

  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          router: ['react-router-dom'],
          radix: [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-popover',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-tabs',
            '@radix-ui/react-collapsible',
          ],
          icons: ['lucide-react'],
        },
      },
    },
  },

  server: {
    strictPort: true,
  },
})
