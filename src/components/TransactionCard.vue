<script setup lang="ts">
import { computed } from 'vue'
import { Edit2, Trash2 } from 'lucide-vue-next'
import type { Transaction } from '@/types'
import { formatCurrency1, formatDate } from '@/utils/format'
import { useFinance } from '@/composables/useFinance'

const props = defineProps<{
  transaction: Transaction
  changePercent?: string
  hideProductName?: boolean
}>()

const emit = defineEmits<{
  edit: [transaction: Transaction]
  delete: [id: string]
}>()

const { products, TRANSACTION_TYPE_OPTIONS } = useFinance()

const getProductName = computed(() => {
  const product = products.value.find(p => p.id === props.transaction.productId)
  return product?.name || '未知产品'
})

const getTransactionTypeLabel = (type: string) => {
  const option = TRANSACTION_TYPE_OPTIONS.find(o => o.value === type)
  return option ? option.label : type
}

const getTransactionTypeColor = (type: string) => {
  const option = TRANSACTION_TYPE_OPTIONS.find(o => o.value === type)
  return option ? option.color : '#6b7280'
}
</script>

<template>
  <div class="relative overflow-hidden rounded-apple-lg glass-card">
    <div class="relative bg-white p-2.5 md:p-3">
      <!-- 右上角：编辑/删除按钮（仅 PC 显示） -->
      <div class="!hidden md:!flex absolute right-3 top-3 items-center gap-1 z-10">
        <button
          @click.stop="emit('edit', transaction)"
          class="touch-target w-8 h-8 flex items-center justify-center rounded-lg text-apple-secondary hover:text-primary-500 hover:bg-primary-500/10 transition-colors flex-shrink-0"
          title="编辑"
        >
          <Edit2 class="w-3.5 h-3.5" />
        </button>
        <button
          @click.stop="emit('delete', transaction.id)"
          class="touch-target w-8 h-8 flex items-center justify-center rounded-lg text-apple-secondary hover:text-loss hover:bg-loss/10 transition-colors flex-shrink-0"
          title="删除"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- 净值更新卡片：精简布局 -->
      <template v-if="transaction.type === 'nav_update'">
        <div class="flex items-center justify-between md:pr-[72px]">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-[11px] shrink-0 font-medium" :style="{ color: getTransactionTypeColor(transaction.type) }">{{ formatDate(transaction.date) }}</span>
            <span v-if="transaction.note" class="text-[11px] text-apple-secondary truncate">{{ transaction.note }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span
              class="apple-tag text-[10px] font-medium px-2 py-0.5"
              :style="{ backgroundColor: getTransactionTypeColor(transaction.type) + '15', color: getTransactionTypeColor(transaction.type) }"
            >
              {{ getTransactionTypeLabel(transaction.type) }}
            </span>
          </div>
        </div>
        <div class="flex items-center justify-between mt-1 md:mt-1.5 md:pr-[72px]">
          <span class="text-[11px] text-apple-secondary">
            <span>净值 {{ transaction.price.toFixed(4) }}</span>
          </span>
          <span
            v-if="changePercent"
            class="text-[15px] md:text-base font-semibold leading-tight"
            :class="changePercent.startsWith('+') ? 'text-profit' : 'text-loss'"
          >
            {{ changePercent }}
          </span>
          <span v-else class="text-[15px] md:text-base font-semibold text-apple-text leading-tight">--</span>
        </div>
      </template>

      <!-- 普通交易卡片：原有布局 -->
      <template v-else>
        <div class="flex items-start justify-between mb-1 md:mb-1.5 md:pr-[72px]">
          <div class="min-w-0">
            <span class="text-[11px] text-apple-secondary leading-tight">{{ formatDate(transaction.date) }}</span>
            <p v-if="!hideProductName" class="text-[13px] md:text-sm font-semibold text-apple-text mt-0.5 leading-tight truncate max-w-[180px]">{{ getProductName }}</p>
          </div>
          <span
            class="apple-tag text-[10px] font-medium px-2 py-0.5 flex-shrink-0"
            :style="{ backgroundColor: getTransactionTypeColor(transaction.type) + '15', color: getTransactionTypeColor(transaction.type) }"
          >
            {{ getTransactionTypeLabel(transaction.type) }}
          </span>
        </div>

        <div class="flex items-center justify-between md:pr-[72px]">
          <span class="text-[11px] text-apple-secondary leading-tight">
            <span>单价 {{ transaction.price.toFixed(4) }}</span>
            <span class="mx-1.5">|</span>
            <span>份额 {{ transaction.shares.toFixed(3) }}</span>
            <span v-if="transaction.fee > 0" class="mx-1.5">|</span>
            <span v-if="transaction.fee > 0">手续费 {{ formatCurrency1(transaction.fee) }}</span>
          </span>
          <span :class="['text-[15px] md:text-base font-semibold leading-tight', transaction.type === 'buy' ? 'text-apple-text' : transaction.type === 'sell' ? 'text-profit' : 'text-amber-500']">
            {{ transaction.type === 'buy' ? '-' : '+' }}{{ formatCurrency1(transaction.amount) }}
          </span>
        </div>
      </template>

      <div v-if="transaction.note && transaction.type !== 'nav_update'" class="mt-1 md:mt-1.5 text-[11px] text-apple-secondary truncate md:pr-[72px] leading-tight">
        {{ transaction.note }}
      </div>
    </div>
  </div>
</template>
