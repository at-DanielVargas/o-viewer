import * as esbuild from 'esbuild'
import parser from './core/vdom-parser.js'

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: './dist/bundle.js',
  minify: true,
  target: ['es6'],
  loader: {
    '.css': 'text'
  },
  plugins: [parser]
})
