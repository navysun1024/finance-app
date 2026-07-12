<script setup lang="ts">
import { Edit2, Trash2, ArrowRight } from 'lucide-vue-next'
import type { Position, ProductStatus } from '@/types'
import { DCA_CYCLE_OPTIONS, PRODUCT_STATUS_OPTIONS } from '@/types'
import { formatCurrency1, formatPercent, formatDate } from '@/utils/format'

withDefaults(defineProps<{
  position: Position
  status?: ProductStatus
  dailyReturn?: number | null
  showProfitAmount?: boolean
  showProfitRate?: boolean
  navUpdatedToday?: boolean
  isWatchlistMode?: boolean
  inceptionDays?: number
  fiAnnual1m?: number
  inceptionAnnualRate?: number
}>(), {
  showProfitAmount: true,
  showProfitRate: true,
  navUpdatedToday: false,
  isWatchlistMode: false
})

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
          <span 
            v-if="status"
            class="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium"
            :style="{ backgroundColor: PRODUCT_STATUS_OPTIONS.find(o => o.value === status)?.color + '15', color: PRODUCT_STATUS_OPTIONS.find(o => o.value === status)?.color }"
          >
            {{ PRODUCT_STATUS_OPTIONS.find(o => o.value === status)?.label }}
          </span>
        </div>
        <p class="text-[11px] text-apple-secondary">
          {{ position.product.code || '暂无代码' }}
          <span v-if="position.product.holder" class="mx-1">·</span>
          <span v-if="position.product.holder">{{ position.product.holder }}</span>
          <template v-if="position.product.note">
            <span class="mx-1">·</span>
            <span class="text-amber-500 truncate max-w-[100px] inline-block align-bottom">{{ position.product.note }}</span>
          </template>
          <span v-if="position.product.dcaAmount && position.product.dcaCycle" class="ml-1 text-primary-500">
            · 定投 {{ position.product.dcaAmount }}元/{{ DCA_CYCLE_OPTIONS.find(o => o.value === position.product.dcaCycle)?.label || position.product.dcaCycle }}
          </span>
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
      <!-- 自选模式：显示成立天数、近1月年化、成立年化 -->
      <template v-if="isWatchlistMode">
        <div class="flex-1 min-w-0">
          <p class="text-apple-secondary/70">成立天数</p>
          <p class="text-sm font-semibold text-apple-text truncate">{{ inceptionDays ?? '-' }} 天</p>
        </div>
        <div class="flex-1 min-w-0 text-center">
          <p class="text-apple-secondary/70">近1月</p>
          <p 
            class="text-sm font-semibold"
            :class="(fiAnnual1m ?? 0) >= 0 ? 'text-profit' : 'text-loss'"
          >
            {{ fiAnnual1m !== undefined ? `${fiAnnual1m >= 0 ? '+' : ''}${fiAnnual1m.toFixed(2)}%` : '-' }}
          </p>
        </div>
        <div class="flex-1 min-w-0 text-center">
          <p class="text-apple-secondary/70">成立年化</p>
          <p 
            class="text-sm font-semibold"
            :class="(inceptionAnnualRate ?? 0) >= 0 ? 'text-profit' : 'text-loss'"
          >
            {{ inceptionAnnualRate !== undefined ? `${inceptionAnnualRate >= 0 ? '+' : ''}${inceptionAnnualRate.toFixed(2)}%` : '-' }}
          </p>
        </div>
      </template>
      <!-- 非自选模式：显示市值、收益率、收益 -->
      <template v-else>
        <div class="flex-1 min-w-0">
          <p class="text-apple-secondary/70">市值</p>
          <p class="text-sm font-semibold text-apple-text truncate">{{ formatCurrency1(position.marketValue) }}</p>
        </div>
        <div class="flex-1 min-w-0 text-center">
          <p class="text-apple-secondary/70">{{ position.product.type === 'fixed_income' ? '年化收益率' : '收益率' }}</p>
          <p 
            class="text-sm font-semibold"
            :class="showProfitRate ? ((position.product.type === 'fixed_income' ? position.annualRate : position.profitRate) >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'"
          >
            {{ showProfitRate ? formatPercent(position.product.type === 'fixed_income' ? position.annualRate : position.profitRate) : '****' }}
          </p>
        </div>
        <div class="flex-1 min-w-0 text-center">
          <p class="text-apple-secondary/70">收益</p>
          <p 
            class="text-sm font-semibold"
            :class="showProfitAmount ? (position.profit >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'"
          >
            {{ showProfitAmount ? (position.profit >= 0 ? '+' : '') + formatCurrency1(position.profit) : '****' }}
          </p>
        </div>
      </template>
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
        <template v-if="isWatchlistMode">
          <span v-if="position.lastNavUpdateDate > 0" :class="navUpdatedToday ? 'text-primary-500 font-medium' : 'text-apple-secondary'">
            {{ formatDate(position.lastNavUpdateDate) }}
          </span>
        </template>
        <template v-else>
          持有 {{ position.totalShares.toFixed(2) }} 份
          <span v-if="position.lastNavUpdateDate > 0" class="ml-1" :class="navUpdatedToday ? 'text-primary-500 font-medium' : 'text-apple-secondary'">
            · {{ formatDate(position.lastNavUpdateDate) }}
          </span>
        </template>
      </span>
      <span class="text-[10px] text-apple-secondary flex items-center">
        详情 <ArrowRight class="w-2.5 h-2.5 ml-0.5" />
      </span>
    </div>
  </div>
</template>