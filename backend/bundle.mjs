import { build } from 'esbuild'
import { resolve } from 'node:path'

const root = process.cwd()
await build({
  absWorkingDir: root,
  entryPoints: [resolve(root, 'src/handler.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: resolve(root, 'dist/index.js'),
  sourcemap: false,
  minify: true,
})
console.log('Created dist/index.js')


