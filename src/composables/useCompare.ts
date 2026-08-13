import { ref, watch } from 'vue'

export type CompareType = 'equity' | 'fixed_income' | 'term_deposit'

const STORAGE_KEY = 'compareList'
const MAX_COMPARE = 8

// 全局共享状态（模块级单例）
const compareType = ref<CompareType>('equity')
const compareIds = ref<string[]>([])

// 从 localStorage 加载
try {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    const parsed = JSON.parse(saved)
    compareType.value = parsed.type || 'equity'
    compareIds.value = Array.isArray(parsed.productIds) ? parsed.productIds : []
  }
} catch {
  // 保持默认值
}

// 持久化到 localStorage
watch([compareType, compareIds], () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    type: compareType.value,
    productIds: compareIds.value
  }))
}, { deep: true })

export function useCompare() {
  // 切换产品：若类型不同则切换类型并替换列表
  const toggleCompare = (productId: string, type: CompareType): boolean => {
    if (compareType.value !== type) {
      compareType.value = type
      compareIds.value = [productId]
      return true
    }
    const idx = compareIds.value.indexOf(productId)
    if (idx !== -1) {
      compareIds.value.splice(idx, 1)
      return false
    }
    if (compareIds.value.length >= MAX_COMPARE) return false
    compareIds.value.push(productId)
    return true
  }

  const removeFromCompare = (productId: string) => {
    const idx = compareIds.value.indexOf(productId)
    if (idx !== -1) compareIds.value.splice(idx, 1)
  }

  // 切换类型并清空已选产品
  const switchType = (type: CompareType) => {
    if (compareType.value !== type) {
      compareType.value = type
      compareIds.value = []
    }
  }

  const clearCompare = () => {
    compareIds.value = []
  }

  const isInCompare = (productId: string) => compareIds.value.includes(productId)

  return {
    compareType,
    compareIds,
    toggleCompare,
    removeFromCompare,
    switchType,
    clearCompare,
    isInCompare,
    MAX_COMPARE
  }
}
