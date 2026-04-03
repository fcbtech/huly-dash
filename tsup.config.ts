import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['bin/huly.ts'],
  format: ['cjs'],
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node'
  }
})
