<script setup lang="ts">
import { computed } from 'vue'
import { Edit2, Trash2, ArrowRight, Scale } from 'lucide-vue-next'
import type { Position, ProductStatus } from '@/types'
import { DCA_CYCLE_OPTIONS, PRODUCT_STATUS_OPTIONS } from '@/types'
import { formatCurrency1, formatPercent, formatDate } from '@/utils/format'

const props = withDefaults(defineProps<{
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
  isComparing?: boolean
}>(), {
  showProfitAmount: true,
  showProfitRate: true,
  navUpdatedToday: false,
  isWatchlistMode: false,
  isComparing: false
})

const emit = defineEmits<{
  edit: [productId: string]
  delete: [productId: string]
  click: [productId: string]
  compare: [productId: string]
}>()

// 定存产品：计算存款进度
const termDepositProgress = computed(() => {
  const product = props.position.product
  if (product.type !== 'term_deposit') return 0
  
  const durationMonths = product.durationMonths || 0
  if (durationMonths <= 0) return 0
  
  let startDate: number
  if (product.maturityDate && durationMonths) {
    const maturityDateMs = new Date(product.maturityDate).getTime()
    const durationDays = durationMonths * 30
    startDate = maturityDateMs - durationDays * 24 * 60 * 60 * 1000
  } else {
    startDate = product.createdAt || Date.now()
  }
  
  const now = Date.now()
  const totalDurationMs = durationMonths * 30 * 24 * 60 * 60 * 1000
  const elapsedMs = Math.max(0, now - startDate)
  
  const progress = (elapsedMs / totalDurationMs) * 100
  return Math.min(100, Math.max(0, progress))
})

// 定存产品：计算剩余天数
const termDepositRemainingDays = computed(() => {
  const product = props.position.product
  if (product.type !== 'term_deposit') return 0
  
  const durationMonths = product.durationMonths || 0
  if (durationMonths <= 0) return 0
  
  let startDate: number
  if (product.maturityDate && durationMonths) {
    const maturityDateMs = new Date(product.maturityDate).getTime()
    const durationDays = durationMonths * 30
    startDate = maturityDateMs - durationDays * 24 * 60 * 60 * 1000
  } else {
    startDate = product.createdAt || Date.now()
  }
  
  const now = Date.now()
  const totalDurationDays = durationMonths * 30
  const elapsedDays = Math.floor((now - startDate) / (24 * 60 * 60 * 1000))
  return Math.max(0, totalDurationDays - elapsedDays)
})

// 格式化存款期限
const formatDuration = (durationMonths: number): string => {
  if (!durationMonths || durationMonths <= 0) return '-'
  if (durationMonths >= 12) {
    const years = Math.floor(durationMonths / 12)
    const remainMonths = durationMonths % 12
    if (remainMonths === 0) return `${years}年`
    return `${years}年${remainMonths}个月`
  }
  return `${durationMonths}个月`
}
</script>

<template>
  <div 
    @click="position.product.type !== 'term_deposit' && emit('click', position.productId)"
    :class="['glass-card p-3 active:scale-[0.99] transition-transform', position.product.type !== 'term_deposit' ? 'cursor-pointer' : '']"
  >
    <div class="flex items-start justify-between">
      <div class="flex-1 min-w-0">
        <div class="flex items-center flex-nowrap min-w-0 space-x-1.5 mb-0.5">
          <span 
            class="w-1.5 h-1.5 rounded-full flex-shrink-0"
            :class="{
              'bg-blue-500': position.product.type === 'equity' || position.product.type === 'fund',
              'bg-green-500': position.product.type === 'fixed_income',
              'bg-amber-500': position.product.type === 'term_deposit'
            }"
          />
          <h3 class="text-sm font-semibold text-apple-text truncate flex-1 min-w-0">{{ position.product.name }}</h3>
          <span 
            v-if="status"
            class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium flex-shrink-0 whitespace-nowrap"
            :style="{ backgroundColor: PRODUCT_STATUS_OPTIONS.find(o => o.value === status)?.color + '15', color: PRODUCT_STATUS_OPTIONS.find(o => o.value === status)?.color }"
          >
            {{ PRODUCT_STATUS_OPTIONS.find(o => o.value === status)?.label }}
          </span>
          <span 
            v-if="position.product.type === 'term_deposit' && position.product.durationMonths"
            class="ml-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/10 text-amber-600 flex-shrink-0 whitespace-nowrap"
          >
            {{ formatDuration(position.product.durationMonths) }}
          </span>
        </div>
        <p class="text-[11px] text-apple-secondary">
          <template v-if="position.product.type === 'term_deposit'">
            <span v-if="position.product.bankName">{{ position.product.bankName }}</span>
            <span v-if="position.product.minAmount" class="ml-1">本金{{ position.product.minAmount.toLocaleString() }}元</span>
          </template>
          <template v-else>
            {{ position.product.code || '暂无代码' }}
            <span v-if="position.product.holder" class="mx-1">·</span>
            <span v-if="position.product.holder">{{ position.product.holder }}</span>
            <span v-if="position.product.type === 'fixed_income' && (position.product as any).holdingTerm" class="mx-1">·</span>
            <span v-if="position.product.type === 'fixed_income' && (position.product as any).holdingTerm" class="text-fixed-income">期限{{ (position.product as any).holdingTerm }}</span>
            <template v-if="position.product.note">
              <span class="mx-1">·</span>
              <span class="text-amber-500 truncate max-w-[100px] inline-block align-bottom">{{ position.product.note }}</span>
            </template>
            <span v-if="position.product.dcaAmount && position.product.dcaCycle" class="ml-1 text-primary-500">
              · 定投 {{ position.product.dcaAmount }}元/{{ DCA_CYCLE_OPTIONS.find(o => o.value === position.product.dcaCycle)?.label || position.product.dcaCycle }}
            </span>
          </template>
        </p>
      </div>
      <div class="flex items-center -space-x-0.5 ml-2">
        <button
          v-if="position.product.type !== 'term_deposit'"
          @click.stop="emit('compare', position.productId)"
          :class="[
            'touch-target w-8 h-8 flex items-center justify-center rounded-md transition-colors',
            isComparing
              ? 'text-primary-500 bg-primary-50'
              : 'text-apple-secondary hover:text-primary-500 hover:bg-primary-50'
          ]"
          :title="isComparing ? '移出对比' : '加入对比'"
        >
          <Scale class="w-3.5 h-3.5" />
        </button>
        <button
          @click.stop="emit('edit', position.productId)"
          class="touch-target w-8 h-8 !hidden md:!flex items-center justify-center text-apple-secondary hover:text-primary-500 hover:bg-primary-50 rounded-md transition-colors"
        >
          <Edit2 class="w-3.5 h-3.5" />
        </button>
        <button
          @click.stop="emit('delete', position.productId)"
          class="touch-target w-8 h-8 !hidden md:!flex items-center justify-center text-apple-secondary hover:text-profit hover:bg-profit/5 rounded-md transition-colors"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
    
    <div class="mt-1.5 text-[11px]">
      <!-- 自选模式：一行 3 列（成立天数、近1月年化、成立年化） -->
      <template v-if="isWatchlistMode">
        <div class="grid grid-cols-3 gap-x-2">
          <div class="min-w-0">
            <p class="text-apple-secondary/70 text-[10px]">成立天数</p>
            <p class="text-[12px] font-semibold text-apple-text truncate">{{ inceptionDays ?? '-' }} 天</p>
          </div>
          <div class="min-w-0 text-left">
            <p class="text-apple-secondary/70 text-[10px]">近1月</p>
            <p 
              class="text-[12px] font-semibold"
              :class="(fiAnnual1m ?? 0) >= 0 ? 'text-profit' : 'text-loss'"
            >
              {{ fiAnnual1m !== undefined ? `${fiAnnual1m >= 0 ? '+' : ''}${fiAnnual1m.toFixed(2)}%` : '-' }}
            </p>
          </div>
          <div class="min-w-0 text-left">
            <p class="text-apple-secondary/70 text-[10px]">成立年化</p>
            <p 
              class="text-[12px] font-semibold"
              :class="(inceptionAnnualRate ?? 0) >= 0 ? 'text-profit' : 'text-loss'"
            >
              {{ inceptionAnnualRate !== undefined ? `${inceptionAnnualRate >= 0 ? '+' : ''}${inceptionAnnualRate.toFixed(2)}%` : '-' }}
            </p>
          </div>
        </div>
      </template>
      <!-- 非自选模式：一行 4 列（市值、当日收益/年利率、收益率、收益） -->
      <template v-else>
        <div class="grid grid-cols-4 gap-x-2">
          <div class="min-w-0">
            <p class="text-apple-secondary/70 text-[10px]">市值</p>
            <p class="text-[12px] font-semibold text-apple-text truncate">{{ formatCurrency1(position.marketValue) }}</p>
          </div>
          <!-- 定存产品：不显示当日收益，替换为利率 -->
          <div v-if="position.product.type !== 'term_deposit'" class="min-w-0 text-left">
            <p class="text-apple-secondary/70 text-[10px]">当日收益</p>
            <p 
              class="text-[12px] font-semibold"
              :class="dailyReturn !== null && dailyReturn !== undefined ? (dailyReturn > 0 ? 'text-profit' : dailyReturn < 0 ? 'text-loss' : '') : ''"
            >
              {{ dailyReturn !== null && dailyReturn !== undefined ? `${dailyReturn > 0 ? '+' : ''}${dailyReturn.toFixed(2)}%` : '--' }}
            </p>
          </div>
          <div v-else class="min-w-0 text-left">
            <p class="text-apple-secondary/70 text-[10px]">年利率</p>
            <p class="text-[12px] font-semibold text-profit">{{ position.product.interestRate ? `${position.product.interestRate.toFixed(2)}%` : '-' }}</p>
          </div>
          <div class="min-w-0 text-left">
            <p class="text-apple-secondary/70 text-[10px]">{{ position.product.type === 'fixed_income' || position.product.type === 'term_deposit' ? '年化收益率' : '收益率' }}</p>
            <p 
              class="text-[12px] font-semibold"
              :class="showProfitRate ? ((position.product.type === 'fixed_income' || position.product.type === 'term_deposit' ? position.annualRate : position.profitRate) >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'"
            >
              {{ showProfitRate ? formatPercent(position.product.type === 'fixed_income' || position.product.type === 'term_deposit' ? position.annualRate : position.profitRate) : '****' }}
            </p>
          </div>
          <div class="min-w-0 text-left">
            <p class="text-apple-secondary/70 text-[10px]">收益</p>
            <p 
              class="text-[12px] font-semibold"
              :class="showProfitAmount ? (position.profit >= 0 ? 'text-profit' : 'text-loss') : 'text-apple-secondary'"
            >
              {{ showProfitAmount ? (position.profit >= 0 ? '+' : '') + formatCurrency1(position.profit) : '****' }}
            </p>
          </div>
        </div>
      </template>
    </div>
    
    <!-- 定存产品：显示存款进度条和剩余天数 -->
    <div v-if="position.product.type === 'term_deposit' && !isWatchlistMode" class="mt-1.5 pt-2 border-t border-black/5">
      <div class="w-full h-2.5 bg-apple-border/30 rounded-full overflow-hidden">
        <div 
          class="h-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-300"
          :style="{ width: `${termDepositProgress}%` }"
        />
      </div>
      <div class="flex items-center justify-between mt-1.5 text-[10px]">
        <span class="text-apple-secondary">
          进度
          <span class="ml-1 text-amber-600 font-medium">{{ termDepositProgress.toFixed(0) }}%</span>
        </span>
        <span class="text-amber-600 font-medium">
          剩 {{ termDepositRemainingDays }} 天
        </span>
        <span v-if="position.product.maturityDate" class="text-[10px] text-amber-500/80 truncate max-w-[80px]">
          {{ position.product.maturityDate }}
        </span>
      </div>
    </div>
    <!-- 非定存产品或自选模式：保持原有显示 -->
    <div v-else class="flex items-center justify-between mt-2 pt-2 border-t border-apple-border/20">
      <span class="text-[10px] text-apple-secondary">
        <template v-if="isWatchlistMode">
          <span v-if="position.lastNavUpdateDate > 0" :class="navUpdatedToday ? 'text-primary-500 font-medium' : 'text-apple-secondary'">
            {{ formatDate(position.lastNavUpdateDate) }}
          </span>
        </template>
        <template v-else>
          <template v-if="position.product.type === 'term_deposit'">
            存款 {{ position.totalShares.toFixed(2) }} 元
            <span v-if="position.product.maturityDate" class="ml-1 text-amber-500">
              · 到期 {{ position.product.maturityDate }}
            </span>
          </template>
          <template v-else>
            持有 {{ position.totalShares.toFixed(2) }} 份
            <span v-if="position.lastNavUpdateDate > 0" class="ml-1" :class="navUpdatedToday ? 'text-primary-500 font-medium' : 'text-apple-secondary'">
              · {{ formatDate(position.lastNavUpdateDate) }}
            </span>
          </template>
        </template>
      </span>
      <span class="text-[10px] text-apple-secondary flex items-center">
        详情 <ArrowRight class="w-2.5 h-2.5 ml-0.5" />
      </span>
    </div>
  </div>
</template>