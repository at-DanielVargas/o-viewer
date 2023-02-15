import fs from 'fs'
import path from 'path'
import parser from 'parse5'

function vnode(name, attributes = {}, children = '', indent = '') {
  const attrs = Object.keys(attributes).reduce((acc, name) => {
    acc.push(`"${name}": ${attributes[name]}`)
    return acc
  }, [])
  return `${indent}h("${name}", {${attrs.join(', ')}}, ${children})`
}

function cleanChildren(children = []) {
  return children.filter((c) => {
    if (!c.nodeName.startsWith('#')) return true
    return c.value && c.value.trim()
  })
}

function extractDirectives(node) {
  const directives = []
  node.attrs = node.attrs.reduce((attrs, attr) => {
    let name = attr.name
    let value = attr.value
    if (name === ':for') directives.push({ name: 'for', value })
    else if (name === ':if') directives.push({ name: 'if', value })
    else if (name.startsWith(':')) {
      name = name.slice(1)
      attrs.push({ name, value })
    } else if (name.startsWith('@')) {
      name = `on${name.slice(1)}`
      value = `this.${value}.bind(this)`
      attrs.push({ name, value })
    } else attrs.push({ name, value: `\`${value}\`` })
    return attrs
  }, [])
  return [node, directives]
}

function wrapDirectives(directives, content, indent = '') {
  directives.reverse().forEach((directive) => {
    if (directive.name === 'if')
      return (content = `((${directive.value}) ? ${content} : '')`)
    if (directive.name === 'for') {
      const [_, item, items] = directive.value.match(/\s*(.*)\s+in\s+(.*)\s*/)
      return (content = `((${items}).map((${item}) => (${content})))`)
    }
  })
  return indent + content
}

function convert(node, indentSize = 0) {
  const indent = ' '.repeat(indentSize)
  if (node.nodeName === '#text') {
    return node.value.trim() ? `\`${node.value}\`` : ''
  }
  if (node.nodeName === '#document-fragment') {
    return `[${indent}\n${cleanChildren(node.childNodes)
      .map((c) => convert(c, indentSize + 2))
      .join(',\n')}]`
  }
  let directives
  ;[node, directives] = extractDirectives(node)
  const attributes = node.attrs.reduce(
    (attrs, attr) => Object.assign(attrs, { [attr.name]: attr.value }),
    {}
  )
  const children = node.childNodes
    ? cleanChildren(node.childNodes)
        .map((c) => convert(c, indent + 4))
        .join(',\n')
    : ''
  let childrenIndent
  if (!node.childNodes || node.childNodes.length === 0)
    childrenIndent = JSON.stringify('')
  else if (node.childNodes.length === 1) childrenIndent = children
  else childrenIndent = `[\n${children}\n]`
  return wrapDirectives(
    directives,
    vnode(node.nodeName, attributes, childrenIndent),
    indent
  )
}

function parse(html) {
  const document = parser.parseFragment(html)
  return convert(document)
}

export default {
  name: 'html-vdom',
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      let contents = await fs.promises.readFile(args.path, 'utf8')
      const normalize = (html) =>
        html
          .replace(/\n/g, '')
          .replace(/[\t ]+\</g, '<')
          .replace(/\>[\t ]+\</g, '><')
          .replace(/\>[\t ]+$/g, '>')

      const getContentFolder = (filePath, newPath) => {
        return new Promise((resolve, reject) => {
          fs.realpath(filePath, {}, async (error, absolutePath) => {
            const parts = absolutePath.split(path.sep)
            parts.pop()
            if (newPath) {
              parts.push(newPath)
            }
            const filePath = path.resolve(parts.join(path.sep))
            const contents = await fs.promises.readFile(filePath, 'utf8')
            resolve(parse(contents))
          })
        })
      }

      const regex =
        /@CustomElement\(\{\s*tag:\s*'[^']*',\s*templateUrl:\s*'([^']*)',\s*styleUrl:\s*'([^']*)'\s*\}\)/gm
      const matches = regex.exec(contents)
      const replaces = []
      if (args.path.indexOf('src') !== -1) {
        if (matches && matches.length >= 3) {
          replaces.push(await getContentFolder(args.path, matches[1]))
          replaces.push(await getContentFolder(args.path, matches[2]))
        }

        const repRegex =
          /@CustomElement\(\{\s*tag:\s*'[^']*',\s*templateUrl:\s*(.*),\s*styleUrl:\s*(.*)\s*\}\)/gm
        const repMatches = repRegex.exec(normalize(contents))

        if (repMatches && repMatches.length >= 3) {
          for (let index = 1; index < repMatches.length; index++) {
            contents = contents.replace(repMatches[index], replaces[index - 1])
          }
        }
      }

      const result = `import { h } from 'petit-dom'; ${contents}`
      return { contents: result, loader: 'ts' }
    })
  }
}
