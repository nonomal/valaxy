import type { ValaxyAddon } from 'valaxy/types'
import type { ResolvedValaxyOptions } from '../options'
import type { ValaxyAddonResolver, ValaxyNodeConfig } from '../types'
import path from 'node:path'
import fs from 'fs-extra'
import { mergeValaxyConfig, resolveValaxyConfigFromRoot } from './valaxy'

export function defineValaxyAddon<AddonOptions = object>(
  addonFunc: (addonOptions?: AddonOptions, valaxyOptions?: ResolvedValaxyOptions) => ValaxyAddon & {
    setup?: ValaxyAddonResolver['setup']
  },
) {
  return addonFunc
}
export const defineAddon = defineValaxyAddon

export async function resolveAddonsConfig(addons: ValaxyAddonResolver[], options: ResolvedValaxyOptions) {
  let valaxyConfig: ValaxyNodeConfig = {} as ValaxyNodeConfig
  for (const addon of addons) {
    // unconfig get node_modules/valaxy-addon-xxx/valaxy.config.ts(not exist) but get userRoot/valaxy.config.ts
    // so we need to check if valaxy.config.ts exist
    const addonConfigPath = path.resolve(addon.root, 'valaxy.config.ts')
    if (!await fs.exists(addonConfigPath))
      continue

    const { config, configFile } = await resolveValaxyConfigFromRoot(addon.root, options)
    if (!config)
      continue

    addon.configFile = configFile
    valaxyConfig = mergeValaxyConfig(config, valaxyConfig)
  }
  return valaxyConfig
}
