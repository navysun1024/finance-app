<script setup lang="ts">
import { TrendingUp, TrendingDown } from 'lucide-vue-next'
import type { Position } from '@/types'
import { formatCurrencyInt, formatPercent } from '@/utils/format'
import { useRouter } from 'vue-router'
import { PRODUCT_TYPE_OPTIONS } from '@/composables/useFinance'

defineProps<{
  position: Position
}>()

const router = useRouter()

const getProductTypeLabel = (type: string) => {
  const option = PRODUCT_TYPE_OPTIONS.find(o => o.value === type)
  return option ? option.label : type
}

const getProductTypeColor = (type: string) => {
  const option = PRODUCT_TYPE_OPTIONS.find(o => o.value === type)
  return option ? option.color : '#6b7280'
}
</script>

<template>
  <div 
    class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow cursor-pointer"
    @click="router.push({ name: 'product-detail', params: { id: position.productId } })"
  >
    <div class="flex items-start justify-between mb-4">
      <div>
        <h3 class="font-semibold text-gray-800">{{ position.product.name }}</h3>
        <span 
          class="inline-block mt-1 px-2 py-0.5 text-xs rounded-full"
          :style="{ backgroundColor: getProductTypeColor(position.product.type) + '20', color: getProductTypeColor(position.product.type) }"
        >
          {{ getProductTypeLabel(position.product.type) }}
        </span>
      </div>
      <component 
        :is="position.profitRate >= 0 ? TrendingUp : TrendingDown" 
        :class="['w-5 h-5', position.profitRate >= 0 ? 'text-profit' : 'text-loss']"
      />
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <p class="text-gray-500 text-xs">市值</p>
        <p class="font-semibold text-gray-800">{{ formatCurrencyInt(position.marketValue) }}</p>
      </div>
      <div>
        <p class="text-gray-500 text-xs">持有天数</p>
        <p class="font-medium text-gray-700">{{ position.holdingDays }} 天</p>
      </div>
      <div>
        <p class="text-gray-500 text-xs">收益率</p>
        <p :class="['font-semibold', position.profitRate >= 0 ? 'text-profit' : 'text-loss']">
          {{ formatPercent(position.profitRate) }}
        </p>
      </div>
      <div>
        <p class="text-gray-500 text-xs">年化收益率</p>
        <p :class="['font-semibold', position.annualRate >= 0 ? 'text-profit' : 'text-loss']">
          {{ formatPercent(position.annualRate) }}
        </p>
      </div>
      <div>
        <p class="text-gray-500 text-xs">持仓</p>
        <p class="font-medium text-gray-700">{{ position.totalShares.toFixed(4) }} 份</p>
      </div>
      <div>
        <p class="text-gray-500 text-xs">盈亏</p>
        <p :class="['font-semibold', position.profit >= 0 ? 'text-profit' : 'text-loss']">
          {{ formatCurrencyInt(position.profit) }}
        </p>
      </div>
    </div>
  </div>
</template>
