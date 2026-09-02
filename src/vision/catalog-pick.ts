import { ITEMS, type Item, type ItemCategory } from '../constants'
import type { CatalogKind } from './ai-walls-schema'

const KIND_ALIASES: Record<string, ItemCategory> = {
  bed: 'bed',
  床: 'bed',
  双人床: 'bed',
  单人床: 'bed',
  榻榻米: 'bed',
  sofa: 'sofa',
  沙发: 'sofa',
  转角沙发: 'sofa',
  armchair: 'armchair',
  单人沙发: 'armchair',
  扶手椅: 'armchair',
  table: 'table',
  桌: 'table',
  餐桌: 'table',
  圆桌: 'table',
  圆餐桌: 'table',
  茶几: 'table',
  书桌: 'table',
  chair: 'chair',
  椅: 'chair',
  餐椅: 'chair',
  wardrobe: 'wardrobe',
  衣柜: 'wardrobe',
  衣帽间: 'wardrobe',
  drawer: 'drawer',
  斗柜: 'drawer',
  床头柜: 'drawer',
  storage: 'storage',
  储物柜: 'storage',
  柜: 'storage',
  stool: 'stool',
  凳: 'stool',
  light: 'light',
  灯: 'light',
  door: 'door',
  门: 'door',
  window: 'window',
  窗: 'window',
  窗户: 'window'
}

export function catalogKindFromLabel(label?: string): CatalogKind | null {
  if (!label) return null
  const key = label.trim().toLowerCase()
  return (KIND_ALIASES[key] ?? KIND_ALIASES[label.trim()] ?? null) as CatalogKind | null
}

/** First catalog item for a detected kind. Never invents a URL. */
export function catalogItemForKind(kind?: string, name?: string): Item | null {
  const resolved = catalogKindFromLabel(kind) ?? catalogKindFromLabel(name)
  if (!resolved) return null
  return ITEMS.find((item) => item.category === resolved) ?? null
}
