import { acceptHMRUpdate, defineStore } from 'pinia'
import { useDynamicLeftSidebar } from 'valaxy'

export const useYunAppStore = defineStore('yun-app', () => {
  // global cache for yun
  const leftSidebar = useDynamicLeftSidebar()

  return {
    leftSidebar,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useYunAppStore, import.meta.hot))
