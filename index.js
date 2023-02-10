import * as esbuild from 'esbuild'
import servor from 'servor'
import { copy } from 'esbuild-plugin-copy'

const ctx = await esbuild.context({
  entryPoints: ['./dist/index.js'],
  bundle: true,
  outfile: './dist/bundle.js',
  //   minify: true,
  target: ['es2022'],
  plugins: [
    //   CssModulesPlugin({
    //     inject: true,
    //   }),
    copy({
      assets: {
        from: ['node_modules/pdfjs-dist/build/pdf.worker.js'],
        to: ['./pdf.worker.js']
      }
    })
  ]
})

await ctx.watch()

await servor({
  root: './dist',
  port: 5100,
  reload: false,
  static: true
})
