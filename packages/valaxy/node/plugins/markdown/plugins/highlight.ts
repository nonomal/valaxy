import type { TransformerCompactLineOption } from '@shikijs/transformers'
import type { LanguageRegistration, ShikiTransformer } from 'shiki'
import type { Logger } from 'vite'
import type { ShikiResolveLang } from '../../../worker_shikiResolveLang'
import type { MarkdownOptions, ThemeOptions } from '../types'
import {

  transformerCompactLineOptions,
  transformerNotationDiff,
  transformerNotationErrorLevel,
  transformerNotationFocus,
  transformerNotationHighlight,
} from '@shikijs/transformers'
// ref vitepress
import { customAlphabet } from 'nanoid'
import c from 'picocolors'
import {
  addClassToHast,
  createHighlighter,
  isSpecialLang,
} from 'shiki'
import { createSyncFn } from 'synckit'

const resolveLangSync = createSyncFn<ShikiResolveLang>(
  require.resolve('valaxy/dist/node/worker_shikiResolveLang.js'),
)
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz', 10)

/**
 * 2 steps:
 *
 * 1. convert attrs into line numbers:
 *    {4,7-13,16,23-27,40} -> [4,7,8,9,10,11,12,13,16,23,24,25,26,27,40]
 * 2. convert line numbers into line options:
 *    [{ line: number, classes: string[] }]
 */
function attrsToLines(attrs: string): TransformerCompactLineOption[] {
  // eslint-disable-next-line regexp/optimal-quantifier-concatenation, regexp/no-super-linear-backtracking
  attrs = attrs.replace(/^(?:\[.*?\])?.*?([\d,-]+).*/, '$1').trim()
  const result: number[] = []
  if (!attrs)
    return []

  attrs
    .split(',')
    .map(v => v.split('-').map(v => Number.parseInt(v, 10)))
    .forEach(([start, end]) => {
      if (start && end) {
        result.push(
          ...Array.from({ length: end - start + 1 }, (_, i) => start + i),
        )
      }
      else {
        result.push(start)
      }
    })
  return result.map(v => ({
    line: v,
    classes: ['highlighted'],
  }))
}

export async function highlight(
  theme: ThemeOptions,
  options: MarkdownOptions,
  logger: Pick<Logger, 'warn'> = console,
): Promise<(str: string, lang: string, attrs: string) => string> {
  const {
    defaultHighlightLang: defaultLang = 'txt',
    codeTransformers: userTransformers = [],
  } = options

  const highlighter = await createHighlighter({
    themes:
      typeof theme === 'object' && 'light' in theme && 'dark' in theme
        ? [theme.light, theme.dark]
        : [theme],
    langs: [
      // load long time, about 3s
      // ...Object.keys(bundledLanguages),
      ...(options.languages || []),
      ...Object.values(options.languageAlias || {}),
    ],
    langAlias: options.languageAlias,
  })

  function loadLanguage(name: string | LanguageRegistration) {
    const lang = typeof name === 'string' ? name : name.name
    if (
      !isSpecialLang(lang)
      && !highlighter.getLoadedLanguages().includes(lang)
    ) {
      const resolvedLang = resolveLangSync(lang)
      if (resolvedLang.length)
        highlighter.loadLanguageSync(resolvedLang)
      else return false
    }
    return true
  }

  // patch for twoslash - https://github.com/vuejs/vitepress/issues/4334
  const internal = highlighter.getInternalContext()
  const getLanguage = internal.getLanguage
  internal.getLanguage = (name) => {
    loadLanguage(name)
    return getLanguage.call(internal, name)
  }

  await options?.shikiSetup?.(highlighter)
  const transformers: ShikiTransformer[] = [
    transformerNotationDiff(),
    transformerNotationFocus({
      classActiveLine: 'has-focus',
      classActivePre: 'has-focused-lines',
    }),
    transformerNotationHighlight(),
    transformerNotationErrorLevel(),
    {
      name: 'valaxy:add-class',
      pre(node) {
        addClassToHast(node, 'vp-code')
      },
    },
    {
      name: 'valaxy:clean-up',
      pre(node) {
        delete node.properties.tabindex
        delete node.properties.style
      },
    },
  ]
  const vueRE = /-vue$/
  const lineNoStartRE = /=(\d*)/
  const lineNoRE = /:(no-)?line-numbers(=\d*)?$/
  const mustacheRE = /\{\{.*?\}\}/g

  return (str: string, lang: string, attrs: string) => {
    const vPre = vueRE.test(lang) ? '' : 'v-pre'
    lang
      = lang
        .replace(lineNoStartRE, '')
        .replace(lineNoRE, '')
        .replace(vueRE, '')
        .toLowerCase() || defaultLang

    if (!loadLanguage(lang)) {
      logger.warn(
        c.yellow(
          `\nThe language '${lang}' is not loaded, falling back to '${defaultLang}' for syntax highlighting.`,
        ),
      )
      lang = defaultLang
    }

    const lineOptions = attrsToLines(attrs)
    const mustaches = new Map<string, string>()

    const removeMustache = (s: string) => {
      if (vPre)
        return s
      return s.replace(mustacheRE, (match) => {
        let marker = mustaches.get(match)
        if (!marker) {
          marker = nanoid()
          mustaches.set(match, marker)
        }
        return marker
      })
    }

    const restoreMustache = (s: string) => {
      mustaches.forEach((marker, match) => {
        s = s.replaceAll(marker, match)
      })
      return s
    }

    str = removeMustache(str).trimEnd()

    const highlighted = highlighter.codeToHtml(str, {
      lang,
      transformers: [
        ...transformers,
        transformerCompactLineOptions(lineOptions),
        {
          name: 'valaxy:v-pre',
          pre(node) {
            if (vPre)
              node.properties['v-pre'] = ''
          },
        },
        {
          name: 'valaxy:empty-line',
          code(hast) {
            hast.children.forEach((span) => {
              if (
                span.type === 'element'
                && span.tagName === 'span'
                && Array.isArray(span.properties.class)
                && span.properties.class.includes('line')
                && span.children.length === 0
              ) {
                span.children.push({
                  type: 'element',
                  tagName: 'wbr',
                  properties: {},
                  children: [],
                })
              }
            })
          },
        },
        ...userTransformers,
      ],
      meta: {
        __raw: attrs,
      },
      ...(typeof theme === 'object' && 'light' in theme && 'dark' in theme
        ? { themes: theme, defaultColor: false }
        : { theme }),
    })

    return restoreMustache(highlighted)
  }
}
