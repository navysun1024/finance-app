<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ArrowLeft, Plus, Edit2, Trash2, TrendingUp, TrendingDown, RefreshCw, Calendar } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { useFinance } from '@/composables/useFinance'
import { formatCurrency, formatCurrencyInt, formatPercent, formatDate, getDateOnly } from '@/utils/format'
import { fetchFundNav, fetchCmbNav, fetchCmbNavHistory, type NavResult } from '@/utils/fundApi'
import TransactionModal from '@/components/TransactionModal.vue'
import * as echarts from 'echarts'

const route = useRoute()
const router = useRouter()
const { getProductById, getPositionById, getTransactionsByProductId, addTransaction, updateTransaction, deleteTransaction, PRODUCT_TYPE_OPTIONS } = useFinance()

const fetchingNav = ref(false)
const fetchingNavHistory = ref(false)
const navFetchError = ref('')
const navHistorySuccess = ref('')

const handleFetchNav = async () => {
  if (!product.value?.code) return

  const todayTimestamp = getDateOnly(Date.now())
  const existingTransactions = getTransactionsByProductId(productId.value)
  if (existingTransactions.some(
    t => t.type === 'nav_update' && getDateOnly(t.date) === todayTimestamp
  )) return

  fetchingNav.value = true
  navFetchError.value = ''
  try {
    let result: NavResult
    let sourceLabel: string
    if (product.value.type === 'fund') {
      result = await fetchFundNav(product.value.code)
      sourceLabel = '天天基金'
    } else {
      result = await fetchCmbNav(product.value.code)
      sourceLabel = '招银理财'
    }
    let dateTimestamp = Date.now()
    if (result.date) {
      const cleaned = result.date.trim()
      if (/^\d{8}$/.test(cleaned)) {
        dateTimestamp = new Date(
          parseInt(cleaned.substring(0, 4)),
          parseInt(cleaned.substring(4, 6)) - 1,
          parseInt(cleaned.substring(6, 8))
        ).getTime()
      } else {
        const parts = cleaned.split(/[-/]/)
        if (parts.length === 3) {
          dateTimestamp = new Date(
            parseInt(parts[0]),
            parseInt(parts[1]) - 1,
            parseInt(parts[2])
          ).getTime()
        }
      }
    }
    const navNote = result.date
      ? `${sourceLabel}自动查询 - 净值日期 ${result.date}`
      : `${sourceLabel}自动查询`
    if (!existingTransactions.some(
      t => t.type === 'nav_update' && getDateOnly(t.date) === dateTimestamp
    )) {
      addTransaction(
        productId.value,
        'nav_update',
        dateTimestamp,
        0,
        result.nav,
        0,
        0,
        navNote
      )
    }
  } catch (e: any) {
    navFetchError.value = e.message || '查询失败'
  } finally {
    fetchingNav.value = false
  }
}

const handleFetchNavHistory = async () => {
  if (!product.value?.code || product.value.type === 'fund') return

  fetchingNavHistory.value = true
  navFetchError.value = ''
  navHistorySuccess.value = ''
  
  try {
    const existingTransactions = getTransactionsByProductId(productId.value)
    const existingDates = new Set(
      existingTransactions
        .filter(t => t.type === 'nav_update')
        .map(t => getDateOnly(t.date))
    )

    const results = await fetchCmbNavHistory(product.value.code, 10)
    let addedCount = 0

    for (const result of results) {
      let dateTimestamp = Date.now()
      if (result.date) {
        const cleaned = result.date.trim()
        if (/^\d{8}$/.test(cleaned)) {
          dateTimestamp = new Date(
            parseInt(cleaned.substring(0, 4)),
            parseInt(cleaned.substring(4, 6)) - 1,
            parseInt(cleaned.substring(6, 8))
          ).getTime()
        } else {
          const parts = cleaned.split(/[-/]/)
          if (parts.length === 3) {
            dateTimestamp = new Date(
              parseInt(parts[0]),
              parseInt(parts[1]) - 1,
              parseInt(parts[2])
            ).getTime()
          }
        }
      }

      const dateKey = getDateOnly(dateTimestamp)
      if (!existingDates.has(dateKey)) {
        addTransaction(
          productId.value,
          'nav_update',
          dateTimestamp,
          0,
          result.nav,
          0,
          0,
          `招银理财批量查询 - 净值日期 ${result.date}`
        )
        existingDates.add(dateKey)
        addedCount++
      }
    }

    if (addedCount > 0) {
      navHistorySuccess.value = `成功更新 ${addedCount} 条净值数据`
    } else {
      navHistorySuccess.value = '所有日期的净值数据已存在，无需更新'
    }
  } catch (e: any) {
    navFetchError.value = e.message || '查询失败'
  } finally {
    fetchingNavHistory.value = false
  }
}

const productId = computed(() => route.params.id as string)
const product = computed(() => getProductById(productId.value))
const position = computed(() => getPositionById(productId.value))
const transactions = computed(() => getTransactionsByProductId(productId.value))

const showModal = ref(false)
const editingTransaction = ref<typeof transactions.value[0] | null>(null)
const chartRef = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null

const getProductTypeLabel = (type: string) => {
  const option = PRODUCT_TYPE_OPTIONS.find(o => o.value === type)
  return option ? option.label : type
}

const getProductTypeColor = (type: string) => {
  const option = PRODUCT_TYPE_OPTIONS.find(o => o.value === type)
  return option ? option.color : '#6b7280'
}

const handleAddTransaction = () => {
  editingTransaction.value = null
  showModal.value = true
}

const handleEditTransaction = (transaction: typeof transactions.value[0]) => {
  editingTransaction.value = transaction
  showModal.value = true
}

const handleDeleteTransaction = (id: string) => {
  if (confirm('确定要删除这条交易记录吗？')) {
    deleteTransaction(id)
  }
}

const handleSubmitTransaction = (data: { productId: string; type: string; date: number; amount: number; price: number; shares: number; fee: number; note: string }) => {
  if (editingTransaction.value) {
    updateTransaction(
      editingTransaction.value.id,
      data.productId,
      data.type as any,
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
      data.type as any,
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

const initChart = () => {
  if (!chartRef.value) return
  chart = echarts.init(chartRef.value)
  
  const navTransactions = transactions.value
    .filter(t => t.type === 'nav_update')
    .map(t => ({
      date: new Date(t.date).toISOString().split('T')[0],
      nav: t.price
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
  
  const navValues = navTransactions.map(t => t.nav)
  const minNav = Math.min(...navValues, position.value?.currentNav || 1)
  const maxNav = Math.max(...navValues, position.value?.currentNav || 1)
  const navRange = maxNav - minNav
  const padding = navRange * 0.1 || 0.02
  
  const chartOption = {
    tooltip: {
      trigger: 'axis',
      formatter: '{b}<br/>净值: {c}'
    },
    grid: {
      left: '10%',
      right: '5%',
      bottom: '22%',
      top: '8%',
      containLabel: false
    },
    xAxis: {
      type: 'category',
      data: navTransactions.map(t => {
        const dateStr = t.date
        if (dateStr.length === 10 && dateStr.includes('-')) {
          const parts = dateStr.split('-')
          return `${parts[1]}/${parts[2]}`
        }
        if (dateStr.length === 8) {
          return `${dateStr.substring(4, 6)}/${dateStr.substring(6, 8)}`
        }
        return dateStr
      }),
      axisLabel: {
        rotate: 0,
        fontSize: 10,
        interval: 0
      },
      axisTick: {
        alignWithLabel: true
      },
      axisLine: {
        show: true
      }
    },
    yAxis: {
      type: 'value',
      min: Math.max(0, minNav - padding),
      max: maxNav + padding,
      axisLabel: {
        fontSize: 9,
        interval: 'auto',
        formatter: (value: number) => value.toFixed(4)
      },
      splitNumber: 5,
      axisLine: {
        show: true
      },
      axisTick: {
        show: true
      }
    },
    series: [{
      type: 'line',
      data: navTransactions.map(t => t.nav),
      smooth: true,
      lineStyle: {
        color: (position.value?.profit ?? 0) >= 0 ? '#10b981' : '#ef4444',
        width: 2
      },
      itemStyle: {
        color: (position.value?.profit ?? 0) >= 0 ? '#10b981' : '#ef4444'
      },
      symbol: 'circle',
      symbolSize: 6
    }]
  }
  
  chart.setOption(chartOption)
}

const handleResize = () => {
  chart?.resize()
}

onMounted(() => {
  if (!product.value) {
    router.push({ name: 'products' })
    return
  }
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
})
</script>

<template>
  <div v-if="product" class="space-y-6">
    <div class="flex flex-col md:flex-row md:items-center space-y-3 md:space-y-0 md:space-x-4">
      <div class="flex items-center space-x-4">
        <button 
          @click="router.push({ name: 'products' })"
          class="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
        >
          <ArrowLeft class="w-5 h-5" />
        </button>
        <div class="flex-1 min-w-0">
          <div class="flex items-center space-x-3">
            <h2 class="text-xl font-bold text-gray-800 truncate">{{ product.name }}</h2>
            <span v-if="product.code" class="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded flex-shrink-0">
              {{ product.code }}
            </span>
          </div>
          <div class="flex items-center space-x-2 mt-1">
            <span 
              class="text-sm px-2 py-0.5 rounded-full"
              :style="{ backgroundColor: getProductTypeColor(product.type) + '20', color: getProductTypeColor(product.type) }"
            >
              {{ getProductTypeLabel(product.type) }}
            </span>
            <span v-if="product.note" class="text-sm text-gray-500 truncate">{{ product.note }}</span>
          </div>
        </div>
      </div>
      <div class="flex items-center space-x-2 flex-wrap gap-2">
        <button
          v-if="product.code && product.type !== 'fund'"
          @click="handleFetchNavHistory"
          :disabled="fetchingNavHistory"
          class="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          <Calendar class="w-4 h-4" :class="{ 'animate-spin': fetchingNavHistory }" />
          <span>{{ fetchingNavHistory ? '查询中...' : '查询近10天净值' }}</span>
        </button>
        <button
          v-if="product.code"
          @click="handleFetchNav"
          :disabled="fetchingNav"
          class="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': fetchingNav }" />
          <span>{{ fetchingNav ? '查询中...' : '查询净值' }}</span>
        </button>
      </div>
    </div>
    <p v-if="navFetchError" class="text-sm text-red-600 mt-2">{{ navFetchError }}</p>
    <p v-if="navHistorySuccess" class="text-sm text-green-600 mt-2">{{ navHistorySuccess }}</p>
    
    <div v-if="position" class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <p class="text-gray-500 text-sm">累计投入</p>
        <p class="text-xl font-bold text-gray-800 mt-1">{{ formatCurrency(position.totalInvestment) }}</p>
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <p class="text-gray-500 text-sm">持有份额</p>
        <p class="text-xl font-bold text-gray-800 mt-1">{{ position.totalShares.toFixed(4) }} 份</p>
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <p class="text-gray-500 text-sm">平均成本</p>
        <p class="text-xl font-bold text-gray-800 mt-1">{{ formatCurrency(position.avgCost) }}</p>
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <p class="text-gray-500 text-sm">当前净值</p>
        <p class="text-xl font-bold text-gray-800 mt-1">{{ position.currentNav.toFixed(4) }}</p>
      </div>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-800">持仓概览</h3>
          <component 
            :is="(position?.profitRate ?? 0) >= 0 ? TrendingUp : TrendingDown" 
            :class="['w-5 h-5', (position?.profitRate ?? 0) >= 0 ? 'text-profit' : 'text-loss']"
          />
        </div>
        <div class="space-y-4">
          <div class="flex justify-between">
            <span class="text-gray-500">持有天数</span>
            <span class="font-semibold text-gray-800">{{ position?.holdingDays || 0 }} 天</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">当前市值</span>
            <span class="font-semibold text-gray-800">{{ formatCurrencyInt(position?.marketValue || 0) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">盈亏金额</span>
            <span :class="['font-semibold', (position?.profit ?? 0) >= 0 ? 'text-profit' : 'text-loss']">
              {{ formatCurrency(position?.profit || 0) }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">收益率</span>
            <span :class="['font-semibold', (position?.profitRate ?? 0) >= 0 ? 'text-profit' : 'text-loss']">
              {{ formatPercent(position?.profitRate || 0) }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">年化收益率</span>
            <span :class="['font-semibold', (position?.annualRate ?? 0) >= 0 ? 'text-profit' : 'text-loss']">
              {{ formatPercent(position?.annualRate || 0) }}
            </span>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col min-h-[250px] md:min-h-[320px]">
        <h3 class="text-lg font-semibold text-gray-800 mb-3">净值走势</h3>
        <div ref="chartRef" class="flex-1 min-h-0"></div>
      </div>
    </div>
    
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-gray-800">历史交易</h3>
        <button 
          @click="handleAddTransaction"
          class="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus class="w-4 h-4" />
          <span>新增交易</span>
        </button>
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">日期</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类型</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">金额</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">单价/净值</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">份额</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">手续费</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">备注</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="transaction in transactions" :key="transaction.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{{ formatDate(transaction.date) }}</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span 
                  class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                  :class="{
                    'bg-green-100 text-green-600': transaction.type === 'buy',
                    'bg-red-100 text-red-600': transaction.type === 'sell',
                    'bg-yellow-100 text-yellow-600': transaction.type === 'dividend',
                    'bg-blue-100 text-blue-600': transaction.type === 'nav_update'
                  }"
                >
                  {{ transaction.type === 'buy' ? '买入' : transaction.type === 'sell' ? '卖出' : transaction.type === 'dividend' ? '分红' : '净值更新' }}
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
                    @click="handleEditTransaction(transaction)"
                    class="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                  >
                    <Edit2 class="w-4 h-4" />
                  </button>
                  <button 
                    @click="handleDeleteTransaction(transaction.id)"
                    class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="transactions.length === 0" class="px-6 py-12 text-center">
          <p class="text-gray-500">暂无交易记录</p>
          <p class="text-gray-400 text-sm mt-2">点击上方按钮添加交易记录</p>
        </div>
      </div>
      </div>
    </div>
    
    <TransactionModal 
      :visible="showModal"
      :products="product ? [product] : []"
      :edit-transaction="editingTransaction"
      @close="showModal = false"
      @submit="handleSubmitTransaction"
    />
  </div>
</template>
