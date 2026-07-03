<script setup lang="ts">
import { Edit2, Trash2, ArrowRight } from 'lucide-vue-next'
import type { Position } from '@/types'
import { formatCurrency1, formatPercent, formatDate } from '@/utils/format'

defineProps<{
  position: Position
  dailyReturn?: number | null
}>()

const emit = defineEmits<{
  edit: [productId: string]
  delete: [productId: string]
  click: [productId: string]
}>()
</script>

<template>
  <div 
    @click="emit('click', position.productId)"
    class="glass-card p-3 cursor-pointer active:scale-[0.99] transition-transform"
  >
    <div class="flex items-start justify-between">
      <div class="flex-1 min-w-0">
        <div class="flex items-center space-x-1.5 mb-0.5">
          <span 
            class="w-1.5 h-1.5 rounded-full"
            :class="{
              'bg-blue-500': position.product.type === 'fund',
              'bg-green-500': position.product.type === 'fixed_income'
            }"
          />
          <h3 class="text-sm font-semibold text-apple-text truncate">{{ position.product.name }}</h3>
        </div>
        <p class="text-[11px] text-apple-secondary">
          {{ position.product.code || '暂无代码' }}
          <span v-if="position.product.holder" class="mx-1">·</span>
          <span v-if="position.product.holder">{{ position.product.holder }}</span>
        </p>
      </div>
      <div class="flex items-center space-x-1 ml-2">
        <button 
          @click.stop="emit('edit', position.productId)"
          class="w-7 h-7 flex items-center justify-center text-apple-secondary hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors"
        >
          <Edit2 class="w-3.5 h-3.5" />
        </button>
        <button 
          @click.stop="emit('delete', position.productId)"
          class="w-7 h-7 flex items-center justify-center text-apple-secondary hover:text-profit hover:bg-profit/5 rounded-lg transition-colors"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
    
    <div class="mt-2 flex items-center justify-between text-[11px]">
      <div class="flex-1 min-w-0">
        <p class="text-apple-secondary/70">市值</p>
        <p class="text-sm font-semibold text-apple-text truncate">{{ formatCurrency1(position.marketValue) }}</p>
      </div>
      <div class="flex-1 min-w-0 text-center">
        <p class="text-apple-secondary/70">{{ position.product.type === 'fixed_income' ? '年化收益率' : '收益率' }}</p>
        <p 
          class="text-sm font-semibold"
          :class="(position.product.type === 'fixed_income' ? position.annualRate : position.profitRate) >= 0 ? 'text-profit' : 'text-loss'"
        >
          {{ formatPercent(position.product.type === 'fixed_income' ? position.annualRate : position.profitRate) }}
        </p>
      </div>
      <div class="flex-1 min-w-0 text-center">
        <p class="text-apple-secondary/70">收益</p>
        <p 
          class="text-sm font-semibold"
          :class="position.profit >= 0 ? 'text-profit' : 'text-loss'"
        >
          {{ position.profit >= 0 ? '+' : '' }}{{ formatCurrency1(position.profit) }}
        </p>
      </div>
      <div class="flex-1 min-w-0 text-right">
        <p class="text-apple-secondary/70">当日收益</p>
        <p 
          class="text-sm font-semibold"
          :class="dailyReturn !== null && dailyReturn !== undefined && dailyReturn >= 0 ? 'text-profit' : 'text-loss'"
        >
          {{ dailyReturn !== null && dailyReturn !== undefined ? `${dailyReturn >= 0 ? '+' : ''}${dailyReturn.toFixed(2)}%` : '--' }}
        </p>
      </div>
    </div>
    
    <div class="flex items-center justify-between mt-2 pt-2 border-t border-apple-border/20">
      <span class="text-[10px] text-apple-secondary">
        持有 {{ position.totalShares.toFixed(2) }} 份
        <span v-if="position.lastNavUpdateDate > 0" class="ml-1 text-apple-secondary/70">
          · {{ formatDate(position.lastNavUpdateDate) }}
        </span>
      </span>
      <span class="text-[10px] text-apple-secondary flex items-center">
        详情 <ArrowRight class="w-2.5 h-2.5 ml-0.5" />
      </span>
    </div>
  </div>
</template>