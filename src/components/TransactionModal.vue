<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { X } from 'lucide-vue-next'
import type { Transaction, Product, TransactionType, Position } from '@/types'
import { PRODUCT_TYPE_OPTIONS, TRANSACTION_TYPE_OPTIONS } from '@/composables/useFinance'

const props = defineProps<{
  visible: boolean
  products: Product[]
  editTransaction?: Transaction | null
  currentProduct?: Product | null
  currentPosition?: Position | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', data: { productId: string; type: TransactionType; date: number; amount: number; price: number; shares: number; fee: number; note: string }): void
}>()

// 是否为单产品模式（从产品详情页打开）
const isSingleProductMode = computed(() => {
  return props.products.length <= 1 || !!props.currentProduct
})

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
const allSellMode = ref(false)  // 全部卖出模式

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

// 全部卖出模式：自动填充份额、单价、金额
const handleAllSell = () => {
  if (allSellMode.value && props.currentPosition) {
    type.value = 'sell'
    shares.value = props.currentPosition.totalShares.toFixed(4)
    price.value = props.currentPosition.currentNav.toFixed(4)
    isManualShares.value = true
    // 自动计算金额
    const totalShares = props.currentPosition.totalShares
    const currentNav = props.currentPosition.currentNav
    amount.value = (totalShares * currentNav).toFixed(2)
  }
}

watch(allSellMode, () => {
  if (allSellMode.value) {
    handleAllSell()
  }
})

watch([amount, price], () => {
  if (!isManualShares.value && calculatedShares.value) {
    shares.value = calculatedShares.value
  }
  // 如果不是全部卖出模式，则金额跟随份额和单价变化
  if (!allSellMode.value) {
    const sharesVal = parseFloat(shares.value)
    const priceVal = parseFloat(price.value)
    if (sharesVal > 0 && priceVal > 0 && type.value === 'sell') {
      amount.value = (sharesVal * priceVal).toFixed(2)
    }
  }
})

watch(() => type.value, () => {
  isManualShares.value = false
  if (allSellMode.value) {
    allSellMode.value = false
  }
})

watch(shares, () => {
  if (!allSellMode.value && isManualShares.value) {
    const sharesVal = parseFloat(shares.value)
    const priceVal = parseFloat(price.value)
    if (sharesVal > 0 && priceVal > 0 && type.value === 'sell') {
      amount.value = (sharesVal * priceVal).toFixed(2)
    }
  }
})

watch(() => props.visible, (val) => {
  console.log('[TransactionModal] visible变化:', val, 'currentProduct:', props.currentProduct?.id, 'products.length:', props.products.length)
  if (val) {
    // 重置全部卖出模式
    allSellMode.value = false
    
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
        const normalizedType = editedProduct.type
        selectedProductType.value = normalizedType
      }
    } else {
      // 新增时
      type.value = 'buy'
      date.value = new Date().toISOString().split('T')[0]
      amount.value = ''
      price.value = ''
      shares.value = ''
      fee.value = ''
      note.value = ''
      isManualShares.value = false
      
      console.log('[TransactionModal] isSingleProductMode:', isSingleProductMode.value)
      if (isSingleProductMode.value) {
        // 单产品模式：自动设置产品类型和产品
        const currentProduct = props.currentProduct || props.products[0]
        console.log('[TransactionModal] currentProduct:', currentProduct?.id)
        if (currentProduct) {
          const normalizedType = currentProduct.type
          selectedProductType.value = normalizedType
          productId.value = currentProduct.id
          console.log('[TransactionModal] 设置productId:', productId.value)
        }
      } else {
        // 多产品模式：默认为第一个产品类型的第一个产品
        productId.value = props.products[0]?.id || ''
        selectedProductType.value = 'equity'
      }
    }
  }
})

const filteredProducts = computed(() => {
  return props.products.filter(p => {
    const normalizedType = p.type
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
        <div class="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- 单产品模式下隐藏产品类型和产品选择 -->
          <template v-if="!isSingleProductMode">
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
          </template>
          <!-- 单产品模式下显示产品名称 -->
          <div v-else class="sm:col-span-2">
            <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">产品</label>
            <div class="glass-input w-full px-4 py-2.5 rounded-xl bg-black/3 text-apple-text font-medium">
              {{ (currentProduct || products[0])?.name }}
            </div>
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
              class="glass-input w-full px-4 py-2.5 rounded-xl outline-none min-w-0 date-input-fix"
            />
          </div>
          <!-- 全部卖出选项 -->
          <div v-if="isSingleProductMode && currentPosition && currentPosition.totalShares > 0 && !editTransaction && type === 'sell'" class="sm:col-span-2 flex items-center py-2">
            <label class="flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                v-model="allSellMode"
                class="w-4 h-4 text-primary-500 border-apple-border rounded focus:ring-primary-500"
              />
              <span class="ml-2 text-sm text-apple-text">全部卖出</span>
            </label>
          </div>
          <div v-if="showAmount">
            <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">金额 (元)</label>
            <input 
              v-model="amount"
              type="number" 
              step="0.01"
              min="0"
              placeholder="请输入金额"
              @wheel.prevent
              class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
            />
          </div>
          <div v-if="showPrice">
            <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">
              {{ type === 'nav_update' ? '最新净值' : '单价 (元)' }}
            </label>
            <input 
              v-model="price"
              type="number" 
              step="0.0001"
              min="0"
              placeholder="请输入单价"
              @wheel.prevent
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
              @wheel.prevent
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
              @wheel.prevent
              class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
            />
          </div>
          <div class="sm:col-span-2">
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
