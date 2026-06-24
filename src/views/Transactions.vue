<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Plus, Search, ArrowUp, ArrowDown, ChevronsUpDown, Upload, CheckCircle, AlertTriangle, X, Calendar } from 'lucide-vue-next'
import TransactionModal from '@/components/TransactionModal.vue'
import BatchImportModal from '@/components/BatchImportModal.vue'
import TransactionCard from '@/components/TransactionCard.vue'
import { useFinance } from '@/composables/useFinance'
import { formatCurrency } from '@/utils/format'
import { batchImport, type BatchImportResult } from '@/utils/storage'
import type { TransactionType, Transaction } from '@/types'

const { products, transactions, addTransaction, updateTransaction, deleteTransaction, refresh, TRANSACTION_TYPE_OPTIONS } = useFinance()

const showModal = ref(false)
const showBatchImport = ref(false)
const editingTransaction = ref<typeof transactions.value[0] | null>(null)
const showImportResult = ref(false)
const importResult = ref<BatchImportResult | null>(null)
const searchQuery = ref('')
const filterType = ref<TransactionType | 'all'>('buy')
const sortKey = ref<keyof Transaction>('date')
const sortOrder = ref<'asc' | 'desc'>('desc')

// 日期区间筛选
const dateRangeOptions = [
  { value: '1m', label: '近1月' },
  { value: '3m', label: '近3月' },
  { value: '6m', label: '近6月' },
  { value: '1y', label: '近1年' },
  { value: 'all', label: '全部' },
  { value: 'custom', label: '自定义' }
]
const dateRange = ref('3m')
const customStartDate = ref('')
const customEndDate = ref('')

// 根据预设选项计算日期范围
const computedDateBounds = computed(() => {
  if (dateRange.value === 'all') return null
  if (dateRange.value === 'custom') {
    const start = customStartDate.value ? new Date(customStartDate.value).getTime() : 0
    const end = customEndDate.value ? new Date(customEndDate.value + 'T23:59:59').getTime() : Date.now()
    return { start, end }
  }
  const now = Date.now()
  const days: Record<string, number> = { '1m': 30, '3m': 90, '6m': 180, '1y': 365 }
  const d = days[dateRange.value] || 90
  return { start: now - d * 24 * 60 * 60 * 1000, end: now }
})

onMounted(async () => {
  await refresh()
})

const filteredTransactions = computed(() => {
  let result = [...transactions.value]
  // 按日期区间筛选
  const bounds = computedDateBounds.value
  if (bounds) {
    result = result.filter(t => t.date >= bounds.start && t.date <= bounds.end)
  }
  // 按交易类型筛选
  if (filterType.value !== 'all') {
    result = result.filter(t => t.type === filterType.value)
  }
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(t => {
      const product = products.value.find(p => p.id === t.productId)
      return (
        product?.name.toLowerCase().includes(query) ||
        t.note.toLowerCase().includes(query) ||
        t.amount.toString().includes(query)
      )
    })
  }
  
  result.sort((a, b) => {
    let aVal: any = a[sortKey.value]
    let bVal: any = b[sortKey.value]
    
    if (sortKey.value === 'productId') {
      aVal = getProductName(a.productId)
      bVal = getProductName(b.productId)
      return sortOrder.value === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    }
    
    if (sortOrder.value === 'asc') {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0
    } else {
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0
    }
  })
  
  return result
})

const handleSort = (key: keyof Transaction) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortOrder.value = 'desc'
  }
}

const getSortIcon = (key: keyof Transaction) => {
  if (sortKey.value !== key) return ChevronsUpDown
  return sortOrder.value === 'asc' ? ArrowUp : ArrowDown
}

const getProductName = (productId: string) => {
  const product = products.value.find(p => p.id === productId)
  return product?.name || '未知产品'
}

const getTransactionTypeLabel = (type: TransactionType) => {
  const option = TRANSACTION_TYPE_OPTIONS.find(o => o.value === type)
  return option ? option.label : type
}

const getTransactionTypeColor = (type: TransactionType) => {
  const option = TRANSACTION_TYPE_OPTIONS.find(o => o.value === type)
  return option ? option.color : '#6b7280'
}

const handleAdd = () => {
  editingTransaction.value = null
  showModal.value = true
}

const handleEdit = (transaction: typeof transactions.value[0]) => {
  editingTransaction.value = transaction
  showModal.value = true
}

const handleDelete = (id: string) => {
  if (confirm('确定要删除这条交易记录吗？')) {
    deleteTransaction(id)
  }
}

const handleSubmit = (data: { productId: string; type: TransactionType; date: number; amount: number; price: number; shares: number; fee: number; note: string }) => {
  if (editingTransaction.value) {
    updateTransaction(
      editingTransaction.value.id,
      data.productId,
      data.type,
      data.date,
      data.amount,
      data.price,
      data.shares,
      data.fee,
      data.note
    )
  } else {
    addTransaction(
      data.productId,
      data.type,
      data.date,
      data.amount,
      data.price,
      data.shares,
      data.fee,
      data.note
    )
  }
  showModal.value = false
}

const handleBatchImport = async (data: { products: any[]; transactions: any[] }) => {
  try {
    const result = await batchImport(data)
    importResult.value = result
    showImportResult.value = true
    await refresh()
  } catch (error) {
    console.error('批量导入失败:', error)
    importResult.value = {
      success: false,
      products: { total: 0, imported: 0, skipped: 0, skippedNames: [] },
      transactions: { total: 0, imported: 0, skipped: 0, skippedDetails: [] }
    }
    showImportResult.value = true
  }
  showBatchImport.value = false
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h2 class="apple-section-title">交易记账</h2>
      </div>
      <div class="flex items-center space-x-3">
        <button 
          @click="showBatchImport = true"
          class="flex items-center space-x-2 px-4 py-2.5 glass-btn text-apple-text rounded-full text-[14px] font-medium"
        >
          <Upload class="w-4 h-4" />
          <span>批量导入</span>
        </button>
        <button 
          @click="handleAdd"
          class="apple-btn-primary flex items-center space-x-2 px-5 py-2.5 text-[14px]"
        >
          <Plus class="w-4 h-4" />
          <span>新增交易</span>
        </button>
      </div>
    </div>
    
    <div class="flex flex-col sm:flex-row gap-3">
      <div class="relative flex-1">
        <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-apple-secondary" />
        <input 
          v-model="searchQuery"
          type="text" 
          placeholder="搜索产品名称或备注..."
          class="glass-input w-full pl-10 pr-4 py-2.5 rounded-apple outline-none text-[15px]"
        />
      </div>
      <select 
        v-model="filterType"
        class="glass-input px-4 py-2.5 rounded-apple outline-none text-[15px]"
      >
        <option value="all">全部类型</option>
        <option v-for="option in TRANSACTION_TYPE_OPTIONS" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>
    
    <!-- 日期区间选择 -->
    <div class="flex flex-wrap items-center gap-2">
      <Calendar class="w-4 h-4 text-apple-secondary flex-shrink-0" />
      <div class="flex items-center space-x-0.5 bg-black/4 rounded-full p-0.5">
        <button
          v-for="opt in dateRangeOptions"
          :key="opt.value"
          @click="dateRange = opt.value"
          :class="[
            'px-3 py-1 text-[12px] rounded-full transition-all duration-200 font-medium',
            dateRange === opt.value
              ? 'bg-white text-apple-text shadow-sm'
              : 'text-apple-secondary hover:text-apple-text'
          ]"
        >
          {{ opt.label }}
        </button>
      </div>
      <template v-if="dateRange === 'custom'">
        <input
          v-model="customStartDate"
          type="date"
          class="glass-input px-3 py-1 text-[12px] rounded-apple outline-none"
        />
        <span class="text-apple-secondary text-[12px]">至</span>
        <input
          v-model="customEndDate"
          type="date"
          class="glass-input px-3 py-1 text-[12px] rounded-apple outline-none"
        />
      </template>
      <span class="text-[12px] text-apple-secondary ml-auto">共 {{ filteredTransactions.length }} 条记录</span>
    </div>
    
    <!-- 移动端卡片布局 -->
    <div class="md:hidden space-y-2">
      <div v-if="filteredTransactions.length > 0" class="space-y-2">
        <TransactionCard 
          v-for="transaction in filteredTransactions" 
          :key="transaction.id" 
          :transaction="transaction"
          @edit="handleEdit"
          @delete="handleDelete"
        />
      </div>
      <div v-else class="glass-card p-8 text-center">
        <p class="text-apple-text text-[16px] font-medium">暂无交易记录</p>
        <p class="text-apple-secondary text-[13px] mt-2">点击上方按钮添加交易记录</p>
      </div>
    </div>
    
    <!-- 桌面端表格布局 -->
    <div class="hidden md:block glass-card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full apple-table">
          <thead>
            <tr>
              <th 
                class="px-4 py-2.5 whitespace-nowrap text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 select-none"
                @click="handleSort('date')"
              >
                <div class="flex items-center space-x-1">
                  <span>日期</span>
                  <component :is="getSortIcon('date')" class="w-3.5 h-3.5" :class="sortKey === 'date' ? 'text-primary-500' : ''" />
                </div>
              </th>
              <th 
                class="px-4 py-2.5 whitespace-nowrap text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 select-none"
                @click="handleSort('productId')"
              >
                <div class="flex items-center space-x-1">
                  <span>产品</span>
                  <component :is="getSortIcon('productId')" class="w-3.5 h-3.5" :class="sortKey === 'productId' ? 'text-primary-500' : ''" />
                </div>
              </th>
              <th 
                class="px-4 py-2.5 whitespace-nowrap text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 select-none"
                @click="handleSort('type')"
              >
                <div class="flex items-center space-x-1">
                  <span>类型</span>
                  <component :is="getSortIcon('type')" class="w-3.5 h-3.5" :class="sortKey === 'type' ? 'text-primary-500' : ''" />
                </div>
              </th>
              <th 
                class="px-4 py-2.5 whitespace-nowrap text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 select-none"
                @click="handleSort('amount')"
              >
                <div class="flex items-center space-x-1">
                  <span>金额</span>
                  <component :is="getSortIcon('amount')" class="w-3.5 h-3.5" :class="sortKey === 'amount' ? 'text-primary-500' : ''" />
                </div>
              </th>
              <th 
                class="px-4 py-2.5 whitespace-nowrap text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 select-none"
                @click="handleSort('price')"
              >
                <div class="flex items-center space-x-1">
                  <span>单价/净值</span>
                  <component :is="getSortIcon('price')" class="w-3.5 h-3.5" :class="sortKey === 'price' ? 'text-primary-500' : ''" />
                </div>
              </th>
              <th 
                class="px-4 py-2.5 whitespace-nowrap text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 select-none"
                @click="handleSort('shares')"
              >
                <div class="flex items-center space-x-1">
                  <span>份额</span>
                  <component :is="getSortIcon('shares')" class="w-3.5 h-3.5" :class="sortKey === 'shares' ? 'text-primary-500' : ''" />
                </div>
              </th>
              <th 
                class="px-4 py-2.5 whitespace-nowrap text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider cursor-pointer hover:bg-black/4 select-none"
                @click="handleSort('fee')"
              >
                <div class="flex items-center space-x-1">
                  <span>手续费</span>
                  <component :is="getSortIcon('fee')" class="w-3.5 h-3.5" :class="sortKey === 'fee' ? 'text-primary-500' : ''" />
                </div>
              </th>
              <th class="px-4 py-2.5 whitespace-nowrap text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider">备注</th>
              <th class="px-4 py-2.5 whitespace-nowrap text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody>
          <tr v-for="transaction in filteredTransactions" :key="transaction.id" class="transition-colors">
            <td class="px-4 py-3 whitespace-nowrap text-[14px] text-apple-text">{{ new Date(transaction.date).toLocaleDateString('zh-CN') }}</td>
            <td class="px-4 py-3 whitespace-nowrap text-[14px] text-apple-text">{{ getProductName(transaction.productId) }}</td>
            <td class="px-4 py-3 whitespace-nowrap">
              <span 
                class="apple-tag text-[11px] font-medium"
                :style="{ backgroundColor: getTransactionTypeColor(transaction.type) + '15', color: getTransactionTypeColor(transaction.type) }"
              >
                {{ getTransactionTypeLabel(transaction.type) }}
              </span>
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-[14px]" :class="transaction.type === 'buy' ? 'text-apple-text' : transaction.type === 'sell' ? 'text-profit' : 'text-amber-500'">
              {{ transaction.type === 'buy' ? '-' : '+' }}{{ formatCurrency(transaction.amount) }}
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-[14px] text-apple-secondary">{{ transaction.price.toFixed(4) }}</td>
            <td class="px-4 py-3 whitespace-nowrap text-[14px] text-apple-secondary">{{ transaction.shares.toFixed(4) }}</td>
            <td class="px-4 py-3 whitespace-nowrap text-[14px] text-apple-secondary">{{ formatCurrency(transaction.fee) }}</td>
            <td class="px-4 py-3 whitespace-nowrap text-[14px] text-apple-secondary">{{ transaction.note || '-' }}</td>
            <td class="px-4 py-3 whitespace-nowrap">
              <div class="flex items-center space-x-1.5">
                <button 
                  @click="handleEdit(transaction)"
                  class="w-8 h-8 flex items-center justify-center text-apple-secondary hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
                <button 
                  @click="handleDelete(transaction.id)"
                  class="w-8 h-8 flex items-center justify-center text-apple-secondary hover:text-profit hover:bg-profit/5 rounded-lg transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
        </table>
      </div>
      <div v-if="filteredTransactions.length === 0" class="p-10 text-center">
        <p class="text-apple-text text-[17px] font-medium">暂无交易记录</p>
        <p class="text-apple-secondary text-[14px] mt-2">点击上方按钮添加交易记录</p>
      </div>
    </div>
    
    <BatchImportModal
      :visible="showBatchImport"
      :products="products"
      @close="showBatchImport = false"
      @import="handleBatchImport"
    />
    
    <TransactionModal 
      :visible="showModal"
      :products="products"
      :edit-transaction="editingTransaction"
      @close="showModal = false"
      @submit="handleSubmit"
    />
    
    <Teleport to="body">
      <div 
        v-if="showImportResult && importResult" 
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        @click.self="showImportResult = false"
      >
        <div class="bg-white rounded-apple-lg shadow-apple-xl w-full max-w-md">
          <div class="flex items-center justify-between p-5 border-b border-apple-border/50">
            <div class="flex items-center space-x-2">
              <div class="p-2 rounded-full" :class="importResult.success ? 'bg-loss/10' : 'bg-profit/10'">
                <component :is="importResult.success ? CheckCircle : AlertTriangle" class="w-5 h-5" :class="importResult.success ? 'text-loss' : 'text-profit'" />
              </div>
              <h3 class="text-lg font-semibold text-apple-text">
                {{ importResult.success ? '导入完成' : '导入失败' }}
              </h3>
            </div>
            <button 
              @click="showImportResult = false" 
              class="p-2 hover:bg-black/5 rounded-full transition-colors"
            >
              <X class="w-5 h-5 text-apple-secondary" />
            </button>
          </div>
          
          <div v-if="importResult.success" class="p-5 space-y-4">
            <div v-if="importResult.products.total > 0" class="bg-black/3 rounded-apple p-4">
              <p class="text-sm font-medium text-apple-text mb-2">产品导入结果</p>
              <div class="flex items-center space-x-4 text-sm">
                <span class="text-loss">
                  <CheckCircle class="w-4 h-4 inline mr-1" />
                  新增 {{ importResult.products.imported }} 个
                </span>
                <span v-if="importResult.products.skipped > 0" class="text-yellow-600">
                  <AlertTriangle class="w-4 h-4 inline mr-1" />
                  跳过 {{ importResult.products.skipped }} 个（已存在）
                </span>
              </div>
              <div v-if="importResult.products.skippedNames.length > 0" class="mt-2">
                <p class="text-xs text-apple-secondary">已存在的产品：{{ importResult.products.skippedNames.join('、') }}</p>
              </div>
            </div>
            
            <div class="bg-black/3 rounded-apple p-4">
              <p class="text-sm font-medium text-apple-text mb-2">交易记录导入结果</p>
              <div class="flex items-center space-x-4 text-sm">
                <span class="text-loss">
                  <CheckCircle class="w-4 h-4 inline mr-1" />
                  新增 {{ importResult.transactions.imported }} 条
                </span>
                <span v-if="importResult.transactions.skipped > 0" class="text-yellow-600">
                  <AlertTriangle class="w-4 h-4 inline mr-1" />
                  跳过 {{ importResult.transactions.skipped }} 条（已存在）
                </span>
              </div>
              <div v-if="importResult.transactions.skippedDetails.length > 0" class="mt-2">
                <p class="text-xs text-apple-secondary mb-1">已存在的交易：</p>
                <ul class="text-xs text-apple-secondary space-y-1 max-h-32 overflow-y-auto">
                  <li v-for="(detail, index) in importResult.transactions.skippedDetails.slice(0, 10)" :key="index">
                    {{ detail.date }} {{ detail.productName }} {{ formatCurrency(detail.amount) }}
                  </li>
                  <li v-if="importResult.transactions.skippedDetails.length > 10" class="text-yellow-500">
                    ... 还有 {{ importResult.transactions.skippedDetails.length - 10 }} 条
                  </li>
                </ul>
              </div>
            </div>
          </div>
          
          <div v-else class="p-5">
            <p class="text-profit text-sm">批量导入失败，请检查数据格式后重试</p>
          </div>
          
          <div class="flex justify-end p-5 border-t border-apple-border/50">
            <button 
              @click="showImportResult = false" 
              class="apple-btn-primary"
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
