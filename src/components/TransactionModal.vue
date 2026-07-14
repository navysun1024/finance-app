<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { X } from 'lucide-vue-next'
import type { Transaction, Product, TransactionType } from '@/types'
import { PRODUCT_TYPE_OPTIONS, TRANSACTION_TYPE_OPTIONS } from '@/composables/useFinance'

const props = defineProps<{
  visible: boolean
  products: Product[]
  editTransaction?: Transaction | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', data: { productId: string; type: TransactionType; date: number; amount: number; price: number; shares: number; fee: number; note: string }): void
}>()

const selectedProductType = ref<string>('equity')
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
  if (val) {
    if (props.editTransaction) {
      productId.value = props.editTransaction.productId
      type.value = props.editTransaction.type
      date.value = new Date(props.editTransaction.date).toISOString().split('T')[0]
      amount.value = props.editTransaction.amount.toString()
      price.value = props.editTransaction.price.toString()
      shares.value = props.editTransaction.shares.toString()
      fee.value = props.editTransaction.fee.toString()
      note.value = props.editTransaction.note
      isManualShares.value = true
      // 根据编辑的产品自动设置产品类型
      const editedProduct = props.products.find(p => p.id === props.editTransaction!.productId)
      if (editedProduct) {
        const normalizedType = editedProduct.type === 'fund' ? 'equity' : editedProduct.type
        selectedProductType.value = normalizedType
      }
    } else {
      // 新增时默认为第一个产品类型的第一个产品
      productId.value = props.products[0]?.id || ''
      type.value = 'buy'
      date.value = new Date().toISOString().split('T')[0]
      amount.value = ''
      price.value = ''
      shares.value = ''
      fee.value = ''
      note.value = ''
      isManualShares.value = false
      // 默认为权益类型
      selectedProductType.value = 'equity'
    }
  }
})

const filteredProducts = computed(() => {
  return props.products.filter(p => {
    const normalizedType = p.type === 'fund' ? 'equity' : p.type
    return normalizedType === selectedProductType.value
  })
})

// 当选择的产品类型变化时，重置产品选择
watch(selectedProductType, () => {
  const filtered = filteredProducts.value
  productId.value = filtered.length > 0 ? filtered[0].id : ''
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
      class="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-0 md:p-4"
      @mousedown.self="emit('close')"
    >
      <div class="bg-white rounded-t-apple-lg md:rounded-apple-lg shadow-apple-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between p-5 border-b border-apple-border/50">
          <h2 class="text-lg font-semibold text-apple-text">{{ editTransaction ? '编辑交易' : '新增交易' }}</h2>
          <button 
            @click="emit('close')" 
            class="p-2 hover:bg-black/5 rounded-full transition-colors"
          >
            <X class="w-5 h-5 text-apple-secondary" />
          </button>
        </div>
        <div class="p-5 space-y-4">
          <div>
            <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">产品类型</label>
            <select 
              v-model="selectedProductType"
              class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
            >
              <option v-for="option in PRODUCT_TYPE_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">关联产品</label>
            <select 
              v-model="productId"
              class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
            >
              <option value="" disabled>请选择产品</option>
              <option v-for="product in filteredProducts" :key="product.id" :value="product.id">
                {{ product.name }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">交易类型</label>
            <select 
              v-model="type"
              class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
            >
              <option v-for="option in TRANSACTION_TYPE_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">交易日期</label>
            <input 
              v-model="date"
              type="date" 
              class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
            />
          </div>
          <div v-if="showAmount">
            <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">金额 (元)</label>
            <input 
              v-model="amount"
              type="number" 
              step="0.01"
              min="0"
              placeholder="请输入金额"
              class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
            />
          </div>
          <div v-if="showPrice">
            <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">{{ type === 'nav_update' ? '最新净值' : '单价 (元)' }}</label>
            <input 
              v-model="price"
              type="number" 
              step="0.0001"
              min="0"
              placeholder="请输入单价"
              class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
            />
          </div>
          <div v-if="showShares">
            <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">
              份额
              <span v-if="calculatedShares && !isManualShares" class="text-apple-secondary/70 font-normal normal-case tracking-normal ml-1">(自动计算)</span>
            </label>
            <input 
              v-model="shares"
              type="number" 
              step="0.0001"
              min="0"
              :placeholder="calculatedShares ? '已自动计算' : '请输入份额'"
              @input="handleSharesInput"
              class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
              :class="{ 'bg-black/3 text-apple-secondary': calculatedShares && !isManualShares }"
            />
            <p v-if="calculatedShares && !isManualShares" class="text-xs text-apple-secondary/70 mt-1">
              份额 = 金额 ÷ 单价 = {{ amount }} ÷ {{ price }} = {{ calculatedShares }}
            </p>
          </div>
          <div v-if="showFee">
            <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">手续费 (元)</label>
            <input 
              v-model="fee"
              type="number" 
              step="0.01"
              min="0"
              placeholder="请输入手续费"
              class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
            />
          </div>
          <div>
            <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">备注</label>
            <textarea 
              v-model="note"
              placeholder="请输入备注信息"
              rows="2"
              class="glass-input w-full px-4 py-2.5 rounded-xl outline-none resize-none"
            ></textarea>
          </div>
        </div>
        <div class="flex justify-end space-x-3 p-5 border-t border-apple-border/50">
          <button 
            @click="emit('close')" 
            class="px-4 py-2 text-apple-secondary hover:bg-black/5 rounded-full transition-colors"
          >
            取消
          </button>
          <button 
            @click="handleSubmit" 
            :disabled="!productId || !date || (showAmount && (!amount || parseFloat(amount) <= 0))"
            class="apple-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ editTransaction ? '保存' : '添加' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
