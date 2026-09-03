<script setup lang="ts">
import { TrendingUp, TrendingDown } from 'lucide-vue-next'
import type { Position } from '@/types'
import { formatCurrency1, formatPercent } from '@/utils/format'
import { useRouter } from 'vue-router'
import { PRODUCT_TYPE_OPTIONS } from '@/composables/useFinance'

withDefaults(defineProps<{
  position: Position
  showProfitAmount?: boolean
  showProfitRate?: boolean
}>(), {
  showProfitAmount: true,
  showProfitRate: true
})

const router = useRouter()

const getProductTypeLabel = (type: string) => {
  const normalized = type
  const option = PRODUCT_TYPE_OPTIONS.find(o => o.value === normalized)
  return option ? option.label : type
}

const getProductTypeColor = (type: string) => {
  const normalized = type
  const option = PRODUCT_TYPE_OPTIONS.find(o => o.value === normalized)
  return option ? option.color : '#86868b'
}
</script>

<template>
  <div 
    class="glass-card p-5 cursor-pointer group"
    @click="router.push({ name: 'product-detail', params: { id: position.productId } })"
  >
    <!-- Header -->
    <div class="flex items-start justify-between mb-4">
      <div class="min-w-0 flex-1">
        <h3 class="text-[15px] font-semibold text-apple-text truncate group-hover:text-primary-500 transition-colors">{{ position.product.name }}</h3>
        <span 
          class="apple-tag mt-1.5"
          :style="{ backgroundColor: getProductTypeColor(position.product.type) + '15', color: getProductTypeColor(position.product.type) }"
        >
          {{ getProductTypeLabel(position.product.type) }}
        </span>
      </div>
      <div :class="['w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ml-2', showProfitRate ? (position.profitRate >= 0 ? 'bg-profit/8' : 'bg-loss/8') : 'bg-black/4']">
        <component 
          v-if="showProfitRate"
          :is="position.profitRate >= 0 ? TrendingUp : TrendingDown" 
          :class="['w-4 h-4', position.profitRate >= 0 ? 'text-profit' : 'text-loss']"
        />
        <span v-else class="text-[12px] text-apple-secondary font-mono">**</span>
      </div>
    </div>

    <!-- Data Grid -->
    <div class="grid grid-cols-2 gap-x-4 gap-y-3">
      <div>
        <p class="text-[11px] text-apple-secondary uppercase tracking-wider font-medium">市值</p>
        <p class="text-[15px] font-semibold text-apple-text mt-0.5">{{ formatCurrency1(position.marketValue) }}</p>
      </div>
      <div>
        <p class="text-[11px] text-apple-secondary uppercase tracking-wider font-medium">持有天数</p>
        <p class="text-[15px] font-medium text-apple-text mt-0.5">{{ position.holdingDays }} 天</p>
      </div>
      <div>
        <p class="text-[11px] text-apple-secondary uppercase tracking-wider font-medium">收益率</p>
        <p :class="['text-[15px] font-semibold mt-0.5', position.profitRate >= 0 ? 'text-profit' : 'text-loss']">
          {{ showProfitRate ? formatPercent(position.profitRate) : '****' }}
        </p>
      </div>
      <div>
        <p class="text-[11px] text-apple-secondary uppercase tracking-wider font-medium">年化收益率</p>
        <p :class="['text-[15px] font-semibold mt-0.5', position.annualRate >= 0 ? 'text-profit' : 'text-loss']">
          {{ showProfitRate ? formatPercent(position.annualRate) : '****' }}
        </p>
      </div>
      <div>
        <p class="text-[11px] text-apple-secondary uppercase tracking-wider font-medium">持仓</p>
        <p class="text-[15px] font-medium text-apple-text mt-0.5">{{ position.totalShares.toFixed(4) }} 份</p>
      </div>
      <div>
        <p class="text-[11px] text-apple-secondary uppercase tracking-wider font-medium">盈亏</p>
        <p :class="['text-[15px] font-semibold mt-0.5', position.profit >= 0 ? 'text-profit' : 'text-loss']">
          {{ showProfitAmount ? formatCurrency1(position.profit) : '****' }}
        </p>
      </div>
    </div>
  </div>
</template>
