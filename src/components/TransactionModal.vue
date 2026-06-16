<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { X } from 'lucide-vue-next'
import type { Transaction, Product, TransactionType } from '@/types'
import { TRANSACTION_TYPE_OPTIONS } from '@/composables/useFinance'

const props = defineProps<{
  visible: boolean
  products: Product[]
  editTransaction?: Transaction | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', data: { productId: string; type: TransactionType; date: number; amount: number; price: number; shares: number; fee: number; note: string }): void
}>()

const productId = ref('')
const type = ref<TransactionType>('buy')
const date = ref(new Date().toISOString().split('T')[0])
const amount = ref('')
const price = ref('')
const shares = ref('')
const fee = ref('')
const note = ref('')
const isManualShares = ref(false)

const showAmount = computed(() => ['buy', 'sell', 'dividend'].includes(type.value))
const showPrice = computed(() => ['buy', 'sell', 'nav_update'].includes(type.value))
const showShares = computed(() => ['buy', 'sell'].includes(type.value))
const showFee = computed(() => ['buy', 'sell'].includes(type.value))

const calculatedShares = computed(() => {
  const amountVal = parseFloat(amount.value)
  const priceVal = parseFloat(price.value)
  if (amountVal > 0 && priceVal > 0) {
    return (amountVal / priceVal).toFixed(4)
  }
  return ''
})

watch([amount, price], () => {
  if (!isManualShares.value && calculatedShares.value) {
    shares.value = calculatedShares.value
  }
})

watch(() => type.value, () => {
  isManualShares.value = false
})

watch(() => props.visible, (val) => {
  if (val && props.editTransaction) {
    productId.value = props.editTransaction.productId
    type.value = props.editTransaction.type
    date.value = new Date(props.editTransaction.date).toISOString().split('T')[0]
    amount.value = props.editTransaction.amount.toString()
    price.value = props.editTransaction.price.toString()
    shares.value = props.editTransaction.shares.toString()
    fee.value = props.editTransaction.fee.toString()
    note.value = props.editTransaction.note
    isManualShares.value = true
  } else if (val) {
    productId.value = props.products[0]?.id || ''
    type.value = 'buy'
    date.value = new Date().toISOString().split('T')[0]
    amount.value = ''
    price.value = ''
    shares.value = ''
    fee.value = ''
    note.value = ''
    isManualShares.value = false
  }
})

const handleSharesInput = () => {
  isManualShares.value = true
}

const handleSubmit = () => {
  if (!productId.value || !type.value || !date.value) return
  if (showAmount.value && (!amount.value || parseFloat(amount.value) <= 0)) return
  if (showPrice.value && (!price.value || parseFloat(price.value) <= 0)) return
  if (showShares.value && (!shares.value || parseFloat(shares.value) <= 0)) return
  
  emit('submit', {
    productId: productId.value,
    type: type.value,
    date: new Date(date.value).getTime(),
    amount: parseFloat(amount.value) || 0,
    price: parseFloat(price.value) || 0,
    shares: parseFloat(shares.value) || 0,
    fee: parseFloat(fee.value) || 0,
    note: note.value.trim()
  })
}
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="visible" 
      class="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4"
      @mousedown.self="emit('close')"
    >
      <div class="bg-white rounded-t-xl md:rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 class="text-lg font-semibold text-gray-800">{{ editTransaction ? '编辑交易' : '新增交易' }}</h2>
          <button 
            @click="emit('close')" 
            class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X class="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div class="p-5 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">关联产品</label>
            <select 
              v-model="productId"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
            >
              <option value="" disabled>请选择产品</option>
              <option v-for="product in products" :key="product.id" :value="product.id">
                {{ product.name }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">交易类型</label>
            <select 
              v-model="type"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
            >
              <option v-for="option in TRANSACTION_TYPE_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">交易日期</label>
            <input 
              v-model="date"
              type="date" 
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
            />
          </div>
          <div v-if="showAmount">
            <label class="block text-sm font-medium text-gray-700 mb-2">金额 (元)</label>
            <input 
              v-model="amount"
              type="number" 
              step="0.01"
              min="0"
              placeholder="请输入金额"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
            />
          </div>
          <div v-if="showPrice">
            <label class="block text-sm font-medium text-gray-700 mb-2">{{ type === 'nav_update' ? '最新净值' : '单价 (元)' }}</label>
            <input 
              v-model="price"
              type="number" 
              step="0.0001"
              min="0"
              placeholder="请输入单价"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
            />
          </div>
          <div v-if="showShares">
            <label class="block text-sm font-medium text-gray-700 mb-2">
              份额
              <span v-if="calculatedShares && !isManualShares" class="text-gray-400 font-normal ml-1">(自动计算)</span>
            </label>
            <input 
              v-model="shares"
              type="number" 
              step="0.0001"
              min="0"
              :placeholder="calculatedShares ? '已自动计算' : '请输入份额'"
              @input="handleSharesInput"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
              :class="{ 'bg-gray-50 text-gray-600': calculatedShares && !isManualShares }"
            />
            <p v-if="calculatedShares && !isManualShares" class="text-xs text-gray-400 mt-1">
              份额 = 金额 ÷ 单价 = {{ amount }} ÷ {{ price }} = {{ calculatedShares }}
            </p>
          </div>
          <div v-if="showFee">
            <label class="block text-sm font-medium text-gray-700 mb-2">手续费 (元)</label>
            <input 
              v-model="fee"
              type="number" 
              step="0.01"
              min="0"
              placeholder="请输入手续费"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">备注</label>
            <textarea 
              v-model="note"
              placeholder="请输入备注信息"
              rows="2"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all resize-none"
            ></textarea>
          </div>
        </div>
        <div class="flex justify-end space-x-3 p-5 border-t border-gray-200">
          <button 
            @click="emit('close')" 
            class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            取消
          </button>
          <button 
            @click="handleSubmit" 
            :disabled="!productId || !date || (showAmount && (!amount || parseFloat(amount) <= 0))"
            class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {{ editTransaction ? '保存' : '添加' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
