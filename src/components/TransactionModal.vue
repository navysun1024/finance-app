<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import { X } from 'lucide-vue-next'
import type { Transaction, Product, TransactionType, Position } from '@/types'
import { PRODUCT_TYPE_OPTIONS, TRANSACTION_TYPE_OPTIONS } from '@/composables/useFinance'
import { fetchEquityNav, fetchCmbNavHistory, fetchIcbcNavHistory, type NavResult } from '@/utils/equityApi'
import { getDateOnly } from '@/utils/format'

const props = defineProps<{
  visible: boolean
  products: Product[]
  editTransaction?: Transaction | null
  currentProduct?: Product | null
  currentPosition?: Position | null
  transactions?: Transaction[]
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
const isFetchingNav = ref(false)  // 是否正在获取净值

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

watch(() => type.value, async (newType) => {
  isManualShares.value = false
  if (allSellMode.value) {
    allSellMode.value = false
  }
  
  // 切换到买入/卖出模式时，主动获取净值
  if ((newType === 'buy' || newType === 'sell') && productId.value && date.value) {
    const currentProduct = props.currentProduct || props.products.find(p => p.id === productId.value)
    if (currentProduct) {
      const nav = await fetchNavByDate(currentProduct, date.value)
      if (nav !== null) {
        price.value = nav.toFixed(4)
        const sharesVal = parseFloat(shares.value)
        if (sharesVal > 0) {
          amount.value = (sharesVal * nav).toFixed(2)
        }
      }
    }
  }
})

// 从数据库交易记录中获取指定日期的净值
const fetchNavFromDatabase = (product: Product, targetDate: string): number | null => {
  if (!props.transactions || props.transactions.length === 0) return null
  
  // 筛选当前产品的 nav_update 类型交易记录
  const navUpdates = props.transactions.filter(
    t => t.productId === product.id && t.type === 'nav_update'
  )
  
  if (navUpdates.length === 0) return null
  
  // 查找目标日期的净值（找到最接近的日期）
  const targetDateTs = new Date(targetDate).getTime()
  const targetDateMidnight = getDateOnly(targetDateTs)
  
  let closest: Transaction | null = null
  let minDiff = Infinity
  
  for (const tx of navUpdates) {
    const txDateMidnight = getDateOnly(tx.date)
    const diff = Math.abs(txDateMidnight - targetDateMidnight)
    if (diff < minDiff) {
      minDiff = diff
      closest = tx
    }
  }
  
  // 只接受距离目标日期不超过3天的记录
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000
  if (closest && minDiff <= threeDaysMs) {
    return closest.price
  }
  
  return null
}

// 根据日期获取对应产品的净值（优先从数据库获取）
const fetchNavByDate = async (product: Product, targetDate: string): Promise<number | null> => {
  // 定期存款类型不需要获取净值
  if (product.type === 'term_deposit') {
    return null
  }
  
  // 优先从数据库获取（更快）
  const dbNav = fetchNavFromDatabase(product, targetDate)
  if (dbNav !== null) {
    console.log('[TransactionModal] 从数据库获取净值:', dbNav, '日期:', targetDate)
    return dbNav
  }
  
  // 数据库没有时，再从外部 API 获取
  if (!product.code || !product.navSource) {
    console.log('[TransactionModal] 无code或navSource，无法获取净值')
    return null
  }
  
  try {
    isFetchingNav.value = true
    const navSource = product.navSource
    
    // 对于权益/基金类产品，使用fetchEquityNav获取
    if (product.type === 'equity' || product.type === 'fund' || navSource === 'tiantian') {
      const result = await fetchEquityNav(product.code)
      console.log('[TransactionModal] 从天天基金获取净值:', result.nav)
      return result.nav
    }
    
    // 对于固收类产品，根据navSource选择不同的API获取历史净值
    if (navSource === 'cmb' || navSource === 'icbc') {
      let history: NavResult[]
      if (navSource === 'cmb') {
        history = await fetchCmbNavHistory(product.code)
      } else {
        history = await fetchIcbcNavHistory(product.code)
      }
      
      // 查找目标日期的净值（找到最接近的日期）
      const targetDateTs = new Date(targetDate).getTime()
      let closest: NavResult | null = null
      let minDiff = Infinity
      
      for (const item of history) {
        const itemDateTs = new Date(item.date).getTime()
        const diff = Math.abs(itemDateTs - targetDateTs)
        if (diff < minDiff) {
          minDiff = diff
          closest = item
        }
      }
      
      if (closest) {
        console.log('[TransactionModal] 从历史数据获取净值:', closest.nav, '日期:', closest.date)
        return closest.nav
      }
    }
    
    console.log('[TransactionModal] 未找到净值数据')
    return null
  } catch (e) {
    console.error('获取净值失败:', e)
    return null
  } finally {
    isFetchingNav.value = false
  }
}

// 日期或产品变化时自动获取净值
watch([date, productId], async ([newDate, newProductId]) => {
  console.log('[TransactionModal] 日期/产品变化 - 日期:', newDate, '产品ID:', newProductId, '类型:', type.value)
  if (!newDate || !newProductId) return
  if (type.value !== 'buy' && type.value !== 'sell') return
  
  const currentProduct = props.currentProduct || props.products.find(p => p.id === newProductId)
  if (!currentProduct) {
    console.log('[TransactionModal] 未找到产品')
    return
  }
  
  console.log('[TransactionModal] 产品信息:', currentProduct.name, '类型:', currentProduct.type, 'navSource:', currentProduct.navSource)
  
  const nav = await fetchNavByDate(currentProduct, newDate)
  if (nav !== null) {
    console.log('[TransactionModal] 获取到净值:', nav)
    price.value = nav.toFixed(4)
    // 自动计算金额（如果有份额的话）
    const sharesVal = parseFloat(shares.value)
    if (sharesVal > 0) {
      amount.value = (sharesVal * nav).toFixed(2)
    }
  } else {
    console.log('[TransactionModal] 未获取到净值')
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
        const normalizedType = editedProduct.type === 'fund' ? 'equity' : editedProduct.type
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
          const normalizedType = currentProduct.type === 'fund' ? 'equity' : currentProduct.type
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
    console.log('[TransactionModal] 初始化完成 - productId:', productId.value, 'type:', type.value)
    
    // 初始化完成后，主动触发一次净值获取（如果是买入/卖出模式）
    if (productId.value && (type.value === 'buy' || type.value === 'sell')) {
      nextTick(async () => {
        console.log('[TransactionModal] 初始化后主动获取净值')
        const currentProduct = props.currentProduct || props.products.find(p => p.id === productId.value)
        if (currentProduct) {
          const nav = await fetchNavByDate(currentProduct, date.value)
          if (nav !== null) {
            price.value = nav.toFixed(4)
            const sharesVal = parseFloat(shares.value)
            if (sharesVal > 0) {
              amount.value = (sharesVal * nav).toFixed(2)
            }
          }
        }
      })
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
          <div v-else>
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
          <!-- 全部卖出选项 -->
          <div v-if="isSingleProductMode && currentPosition && currentPosition.totalShares > 0 && !editTransaction && type === 'sell'" class="flex items-center py-2">
            <label class="flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                v-model="allSellMode"
                class="w-4 h-4 text-primary-500 border-apple-border rounded focus:ring-primary-500"
              />
              <span class="ml-2 text-sm text-apple-text">全部卖出</span>
            </label>
          </div>
          <div>
            <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">交易日期</label>
            <input 
              v-model="date"
              type="date" 
              class="glass-input w-full px-4 py-2.5 rounded-xl outline-none min-w-0 date-input-fix"
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
              @wheel.prevent
              class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
            />
          </div>
          <div v-if="showPrice">
            <label class="flex items-center justify-between text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">
              <span>{{ type === 'nav_update' ? '最新净值' : '单价 (元)' }}</span>
              <span v-if="isFetchingNav" class="text-[10px] text-primary-500 normal-case tracking-normal">正在获取净值...</span>
            </label>
            <input 
              v-model="price"
              type="number" 
              step="0.0001"
              min="0"
              placeholder="请输入单价"
              @wheel.prevent
              class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
              :class="{ 'opacity-50': isFetchingNav }"
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
