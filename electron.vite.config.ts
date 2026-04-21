import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['better-sqlite3', 'keytar', 'node-pty'] })],
    build: {
      lib: {
        entry: path.resolve(__dirname, 'apps/desktop/src/main/index.ts'),
        formats: ['cjs'],
        fileName: () => '[name].js'
      },
      outDir: path.resolve(__dirname, 'apps/desktop/out/main'),
      rollupOptions: {
        external: ['better-sqlite3', 'keytar', 'node-pty'],
      },
    },
    resolve: {
      alias: {
        '@nexusmind': path.resolve(__dirname, 'packages')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: path.resolve(__dirname, 'apps/desktop/src/preload/index.ts'),
        formats: ['cjs'],
        fileName: () => '[name].js'
      },
      outDir: path.resolve(__dirname, 'apps/desktop/out/preload')
    }
  },
  renderer: {
    plugins: [react()],
    root: path.resolve(__dirname, 'apps/desktop/src/renderer'),
    build: {
      outDir: path.resolve(__dirname, 'apps/desktop/out/renderer'),
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'apps/desktop/src/renderer/index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@nexusmind': path.resolve(__dirname, 'packages')
      }
    }
  }
})
