<script setup lang="ts">
import { ref, computed } from 'vue'
import { Edit2, Trash2 } from 'lucide-vue-next'
import type { Transaction } from '@/types'
import { formatCurrency, formatDate } from '@/utils/format'
import { useFinance } from '@/composables/useFinance'

const props = defineProps<{
  transaction: Transaction
}>()

const emit = defineEmits<{
  edit: [transaction: Transaction]
  delete: [id: string]
}>()

const { products, TRANSACTION_TYPE_OPTIONS } = useFinance()

const slideOffset = ref(0)
const isDragging = ref(false)
const startX = ref(0)

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

const handleTouchStart = (e: TouchEvent) => {
  isDragging.value = true
  startX.value = e.touches[0].clientX
}

const handleTouchMove = (e: TouchEvent) => {
  if (!isDragging.value) return
  const delta = e.touches[0].clientX - startX.value
  slideOffset.value = Math.max(-100, Math.min(0, delta))
}

const handleTouchEnd = () => {
  if (slideOffset.value < -50) {
    slideOffset.value = -100
  } else {
    slideOffset.value = 0
  }
  isDragging.value = false
}

const handleMouseDown = (e: MouseEvent) => {
  isDragging.value = true
  startX.value = e.clientX
}

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return
  const delta = e.clientX - startX.value
  slideOffset.value = Math.max(-100, Math.min(0, delta))
}

const handleMouseUp = () => {
  if (slideOffset.value < -50) {
    slideOffset.value = -100
  } else {
    slideOffset.value = 0
  }
  isDragging.value = false
}
</script>

<template>
  <div class="relative overflow-hidden rounded-apple-lg glass-card touch-none">
    <div class="absolute right-0 top-0 bottom-0 flex">
      <button 
        @click="emit('edit', transaction)"
        class="w-[100px] min-w-[100px] bg-primary-500 flex items-center justify-center active:bg-primary-600 transition-colors"
      >
        <Edit2 class="w-6 h-6 text-white" />
      </button>
      <button 
        @click="emit('delete', transaction.id)"
        class="w-[100px] min-w-[100px] bg-profit flex items-center justify-center active:bg-red-600 transition-colors"
      >
        <Trash2 class="w-6 h-6 text-white" />
      </button>
    </div>
    
    <div 
      class="relative bg-white p-3 transition-transform duration-200 ease-out cursor-pointer"
      :style="{ transform: `translateX(${slideOffset}px)` }"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
    >
      <div class="flex items-start justify-between mb-1.5">
        <div>
          <span class="text-[11px] text-apple-secondary">{{ formatDate(transaction.date) }}</span>
          <p class="text-sm font-semibold text-apple-text mt-0.5 truncate max-w-[180px]">{{ getProductName }}</p>
        </div>
        <span 
          class="apple-tag text-[10px] font-medium px-2 py-0.5"
          :style="{ backgroundColor: getTransactionTypeColor(transaction.type) + '15', color: getTransactionTypeColor(transaction.type) }"
        >
          {{ getTransactionTypeLabel(transaction.type) }}
        </span>
      </div>
      
      <div class="flex items-center justify-between">
        <span class="text-[11px] text-apple-secondary">
          <span>单价 {{ transaction.price.toFixed(4) }}</span>
          <span class="mx-1.5">|</span>
          <span>份额 {{ transaction.shares.toFixed(3) }}</span>
          <span v-if="transaction.fee > 0" class="mx-1.5">|</span>
          <span v-if="transaction.fee > 0">手续费 {{ formatCurrency(transaction.fee) }}</span>
        </span>
        <span :class="['text-base font-semibold', transaction.type === 'buy' ? 'text-apple-text' : transaction.type === 'sell' ? 'text-profit' : 'text-amber-500']">
          {{ transaction.type === 'buy' ? '-' : '+' }}{{ formatCurrency(transaction.amount) }}
        </span>
      </div>
      
      <div v-if="transaction.note" class="mt-1.5 text-[11px] text-apple-secondary truncate">
        {{ transaction.note }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.touch-none {
  touch-action: none;
}
</style>