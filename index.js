import * as esbuild from 'esbuild'
import servor from 'servor'
import parser from './core/vdom-parser.js'

const ctx = await esbuild.context({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: './dist/bundle.js',
  // minify: true,
  target: ['es6'],
  loader: {
    '.css': 'text'
  },
  plugins: [
    parser
    //   CssModulesPlugin({
    //     inject: true,
    //   }),
    // copy({
    //   assets: {
    //     from: ['node_modules/pdfjs-dist/build/pdf.worker.js'],
    //     to: ['./pdf.worker.js']
    //   }
    // })
  ]
})

await ctx.watch()

await servor({
  root: './dist',
  port: 5100,
  reload: false,
  static: true
})
