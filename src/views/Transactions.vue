<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Plus, Edit2, Trash2, Search, ArrowUp, ArrowDown, ChevronsUpDown, Upload, CheckCircle, AlertTriangle, X, Calendar } from 'lucide-vue-next'
import TransactionModal from '@/components/TransactionModal.vue'
import BatchImportModal from '@/components/BatchImportModal.vue'
import { useFinance } from '@/composables/useFinance'
import { formatCurrency, formatDate } from '@/utils/format'
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
      <h2 class="text-xl font-bold text-white drop-shadow-sm">交易记账</h2>
      <div class="flex items-center space-x-3">
        <button 
          @click="showBatchImport = true"
          class="flex items-center space-x-2 px-4 py-2 glass-btn text-gray-700 rounded-xl text-sm"
        >
          <Upload class="w-4 h-4" />
          <span>批量导入</span>
        </button>
        <button 
          @click="handleAdd"
          class="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:shadow-lg hover:shadow-indigo-500/30 transition-all duration-300 hover:-translate-y-0.5 text-sm"
        >
          <Plus class="w-4 h-4" />
          <span>新增交易</span>
        </button>
      </div>
    </div>
    
    <div class="flex flex-col sm:flex-row gap-4">
      <div class="relative flex-1">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input 
          v-model="searchQuery"
          type="text" 
          placeholder="搜索产品名称或备注..."
          class="glass-input w-full pl-10 pr-4 py-2 rounded-xl outline-none"
        />
      </div>
      <select 
        v-model="filterType"
        class="glass-input px-4 py-2 rounded-xl outline-none"
      >
        <option value="all">全部类型</option>
        <option v-for="option in TRANSACTION_TYPE_OPTIONS" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>
    
    <!-- 日期区间选择 -->
    <div class="flex flex-wrap items-center gap-2">
      <Calendar class="w-4 h-4 text-gray-500 flex-shrink-0" />
      <div class="flex items-center space-x-1 glass-btn rounded-xl p-0.5">
        <button
          v-for="opt in dateRangeOptions"
          :key="opt.value"
          @click="dateRange = opt.value"
          :class="[
            'px-3 py-1 text-xs rounded-lg transition-all duration-300',
            dateRange === opt.value
              ? 'bg-white/80 text-indigo-700 shadow-sm font-medium'
              : 'text-gray-500 hover:text-gray-700'
          ]"
        >
          {{ opt.label }}
        </button>
      </div>
      <template v-if="dateRange === 'custom'">
        <input
          v-model="customStartDate"
          type="date"
          class="glass-input px-3 py-1 text-xs rounded-xl outline-none"
        />
        <span class="text-gray-400 text-xs">至</span>
        <input
          v-model="customEndDate"
          type="date"
          class="glass-input px-3 py-1 text-xs rounded-xl outline-none"
        />
      </template>
      <span class="text-xs text-gray-500 ml-auto">共 {{ filteredTransactions.length }} 条记录</span>
    </div>
    
    <div class="glass-card rounded-2xl overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th 
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                @click="handleSort('date')"
              >
                <div class="flex items-center space-x-1">
                  <span>日期</span>
                  <component :is="getSortIcon('date')" class="w-4 h-4" :class="sortKey === 'date' ? 'text-primary-600' : ''" />
                </div>
              </th>
              <th 
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                @click="handleSort('productId')"
              >
                <div class="flex items-center space-x-1">
                  <span>产品</span>
                  <component :is="getSortIcon('productId')" class="w-4 h-4" :class="sortKey === 'productId' ? 'text-primary-600' : ''" />
                </div>
              </th>
              <th 
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                @click="handleSort('type')"
              >
                <div class="flex items-center space-x-1">
                  <span>类型</span>
                  <component :is="getSortIcon('type')" class="w-4 h-4" :class="sortKey === 'type' ? 'text-primary-600' : ''" />
                </div>
              </th>
              <th 
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                @click="handleSort('amount')"
              >
                <div class="flex items-center space-x-1">
                  <span>金额</span>
                  <component :is="getSortIcon('amount')" class="w-4 h-4" :class="sortKey === 'amount' ? 'text-primary-600' : ''" />
                </div>
              </th>
              <th 
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                @click="handleSort('price')"
              >
                <div class="flex items-center space-x-1">
                  <span>单价/净值</span>
                  <component :is="getSortIcon('price')" class="w-4 h-4" :class="sortKey === 'price' ? 'text-primary-600' : ''" />
                </div>
              </th>
              <th 
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                @click="handleSort('shares')"
              >
                <div class="flex items-center space-x-1">
                  <span>份额</span>
                  <component :is="getSortIcon('shares')" class="w-4 h-4" :class="sortKey === 'shares' ? 'text-primary-600' : ''" />
                </div>
              </th>
              <th 
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                @click="handleSort('fee')"
              >
                <div class="flex items-center space-x-1">
                  <span>手续费</span>
                  <component :is="getSortIcon('fee')" class="w-4 h-4" :class="sortKey === 'fee' ? 'text-primary-600' : ''" />
                </div>
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">备注</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
          <tr v-for="transaction in filteredTransactions" :key="transaction.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{{ formatDate(transaction.date) }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{{ getProductName(transaction.productId) }}</td>
            <td class="px-6 py-4 whitespace-nowrap">
              <span 
                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                :style="{ backgroundColor: getTransactionTypeColor(transaction.type) + '20', color: getTransactionTypeColor(transaction.type) }"
              >
                {{ getTransactionTypeLabel(transaction.type) }}
              </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm" :class="transaction.type === 'buy' ? 'text-gray-800' : transaction.type === 'sell' ? 'text-profit' : 'text-yellow-600'">
              {{ transaction.type === 'buy' ? '-' : '+' }}{{ formatCurrency(transaction.amount) }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{{ transaction.price.toFixed(4) }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{{ transaction.shares.toFixed(4) }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{{ formatCurrency(transaction.fee) }}</td>
            <td class="px-6 py-4 text-sm text-gray-600">{{ transaction.note || '-' }}</td>
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="flex items-center space-x-2">
                <button 
                  @click="handleEdit(transaction)"
                  class="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                >
                  <Edit2 class="w-4 h-4" />
                </button>
                <button 
                  @click="handleDelete(transaction.id)"
                  class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
        </table>
      </div>
      <div v-if="filteredTransactions.length === 0" class="px-6 py-12 text-center">
        <p class="text-gray-600">暂无交易记录</p>
        <p class="text-gray-500 text-sm mt-2">点击上方按钮添加交易记录</p>
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
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md">
          <div class="flex items-center justify-between p-5 border-b border-gray-200">
            <div class="flex items-center space-x-2">
              <div class="p-2 rounded-full" :class="importResult.success ? 'bg-green-100' : 'bg-red-100'">
                <component :is="importResult.success ? CheckCircle : AlertTriangle" class="w-5 h-5" :class="importResult.success ? 'text-green-600' : 'text-red-600'" />
              </div>
              <h3 class="text-lg font-semibold text-gray-800">
                {{ importResult.success ? '导入完成' : '导入失败' }}
              </h3>
            </div>
            <button 
              @click="showImportResult = false" 
              class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X class="w-5 h-5 text-gray-500" />
            </button>
          </div>
          
          <div v-if="importResult.success" class="p-5 space-y-4">
            <div v-if="importResult.products.total > 0" class="bg-gray-50 rounded-lg p-4">
              <p class="text-sm font-medium text-gray-700 mb-2">产品导入结果</p>
              <div class="flex items-center space-x-4 text-sm">
                <span class="text-green-600">
                  <CheckCircle class="w-4 h-4 inline mr-1" />
                  新增 {{ importResult.products.imported }} 个
                </span>
                <span v-if="importResult.products.skipped > 0" class="text-yellow-600">
                  <AlertTriangle class="w-4 h-4 inline mr-1" />
                  跳过 {{ importResult.products.skipped }} 个（已存在）
                </span>
              </div>
              <div v-if="importResult.products.skippedNames.length > 0" class="mt-2">
                <p class="text-xs text-gray-500">已存在的产品：{{ importResult.products.skippedNames.join('、') }}</p>
              </div>
            </div>
            
            <div class="bg-gray-50 rounded-lg p-4">
              <p class="text-sm font-medium text-gray-700 mb-2">交易记录导入结果</p>
              <div class="flex items-center space-x-4 text-sm">
                <span class="text-green-600">
                  <CheckCircle class="w-4 h-4 inline mr-1" />
                  新增 {{ importResult.transactions.imported }} 条
                </span>
                <span v-if="importResult.transactions.skipped > 0" class="text-yellow-600">
                  <AlertTriangle class="w-4 h-4 inline mr-1" />
                  跳过 {{ importResult.transactions.skipped }} 条（已存在）
                </span>
              </div>
              <div v-if="importResult.transactions.skippedDetails.length > 0" class="mt-2">
                <p class="text-xs text-gray-500 mb-1">已存在的交易：</p>
                <ul class="text-xs text-gray-500 space-y-1 max-h-32 overflow-y-auto">
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
            <p class="text-red-600 text-sm">批量导入失败，请检查数据格式后重试</p>
          </div>
          
          <div class="flex justify-end p-5 border-t border-gray-200">
            <button 
              @click="showImportResult = false" 
              class="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
