export const toKebabCase = (str) => {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

export const toCamelCase = (str) => {
  return str.toLowerCase().replace(/(\-\w)/g, (m) => m[1].toUpperCase())
}

export const toDotCase = (str: string) => {
  return str
    .replace(/(?!^)([A-Z])/g, ' $1')
    .replace(/[_\s]+(?=[a-zA-Z])/g, '.')
    .toLowerCase()
}

export const tryParseInt = (value) => {
  return parseInt(value) == value && !Number.isNaN(value)
    ? parseInt(value)
    : value
}

const flushMap = new WeakMap()

export const normalize = (html) =>
  html
    .replace(/\n/g, '')
    .replace(/[\t ]+\</g, '<')
    .replace(/\>[\t ]+\</g, '><')
    .replace(/\>[\t ]+$/g, '>')

export const markFlush = (t, flush) => flushMap.set(t, flush)
