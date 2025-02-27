import type { PluginOption } from 'vite'
import type { ResolvedValaxyOptions } from '../options'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { slash, uniq } from '@antfu/utils'
import { toAtFS } from '../utils'

/**
 * setup client for defineAppSetup
 */
export function createClientSetupPlugin({ clientRoot, themeRoot, userRoot }: ResolvedValaxyOptions): PluginOption {
  const setupEntry = slash(resolve(clientRoot, 'setup'))

  return {
    name: 'valaxy:setup',
    enforce: 'pre',
    async transform(code, id) {
      if (id.startsWith(setupEntry)) {
        const name = id.slice(setupEntry.length + 1).replace(/\?.*$/, '') // remove query
        const imports: string[] = []
        const injections: string[] = []

        const setups = uniq([
          themeRoot,
          userRoot,
        ]).map(i => join(i, 'setup', name))

        setups.forEach((path, idx) => {
          if (!existsSync(path))
            return

          imports.push(`import __n${idx} from '${toAtFS(path)}'`)

          let fn = `__n${idx}`

          if (/\binjection_return\b/.test(code))
            fn = `injection_return = ${fn}`
          if (/\binjection_arg\b/.test(code))
            fn += ('(injection_arg)')
          else
            fn += ('()')

          injections.push(
            `// ${path}`,
            fn,
          )
        })

        code = code.replace('/* __imports__ */', imports.join('\n'))
        code = code.replace('/* __injections__ */', injections.join('\n'))

        return code
      }

      return null
    },
  }
}
