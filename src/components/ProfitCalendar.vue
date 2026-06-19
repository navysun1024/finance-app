<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { formatCurrency } from '@/utils/format'

interface ProductProfit {
  productName: string
  profit: number
}

interface DailyProfit {
  date: string  // YYYY-MM-DD
  profit: number
  productProfits?: ProductProfit[]
}

const props = defineProps<{
  profitData: DailyProfit[]
  productType?: string
}>()

// 当前查看的年月
const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth() + 1)  // 1-12

// Tooltip 状态
const tooltipVisible = ref(false)
const tooltipData = ref<{ date: string; profit: number; products: ProductProfit[] } | null>(null)
const tooltipPos = ref({ x: 0, y: 0 })

const showTooltip = (event: MouseEvent, dateStr: string, profit: number, products: ProductProfit[]) => {
  if (products.length === 0) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  tooltipPos.value = {
    x: rect.left + rect.width / 2,
    y: rect.top - 4
  }
  tooltipData.value = { date: dateStr, profit, products }
  tooltipVisible.value = true
}

const hideTooltip = () => {
  tooltipVisible.value = false
}

// 视图模式: 'month' | 'year'
const viewMode = ref<'month' | 'year'>('month')

// 星期标题
const weekDays = ['日', '一', '二', '三', '四', '五', '六']

// 月份标题
const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']

// 将收益数据转换为 Map 方便查询（包含产品明细）
const profitMap = computed(() => {
  const map = new Map<string, { profit: number; productProfits: ProductProfit[] }>()
  for (const item of props.profitData) {
    map.set(item.date, { profit: item.profit, productProfits: item.productProfits || [] })
  }
  return map
})

// 获取指定月份的天数
const getDaysInMonth = (year: number, month: number) => {
  return new Date(year, month, 0).getDate()
}

// 获取指定月份第一天是星期几
const getFirstDayOfMonth = (year: number, month: number) => {
  return new Date(year, month - 1, 1).getDay()
}

// 生成月历数据
const calendarDays = computed(() => {
  const days: { date: string; day: number; profit: number | null; isCurrentMonth: boolean; productProfits: ProductProfit[] }[] = []
  const daysInMonth = getDaysInMonth(currentYear.value, currentMonth.value)
  const firstDay = getFirstDayOfMonth(currentYear.value, currentMonth.value)
  
  // 填充空白日期
  for (let i = 0; i < firstDay; i++) {
    days.push({ date: '', day: 0, profit: null, isCurrentMonth: false, productProfits: [] })
  }
  
  // 填充当月日期
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear.value}-${String(currentMonth.value).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const data = profitMap.value.get(dateStr)
    days.push({ 
      date: dateStr, 
      day, 
      profit: data ? data.profit : null, 
      isCurrentMonth: true,
      productProfits: data ? data.productProfits : []
    })
  }
  
  return days
})

// 年视图：获取每月收益汇总
const yearlySummary = computed(() => {
  const summary: { month: number; totalProfit: number; days: number }[] = []
  for (let month = 1; month <= 12; month++) {
    let totalProfit = 0
    let days = 0
    const daysInMonth = getDaysInMonth(currentYear.value, month)
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentYear.value}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const data = profitMap.value.get(dateStr)
      if (data !== undefined) {
        totalProfit += data.profit
        days++
      }
    }
    summary.push({ month, totalProfit, days })
  }
  return summary
})

// 月度汇总
const monthSummary = computed(() => {
  let totalProfit = 0
  let positiveDays = 0
  let negativeDays = 0
  
  for (const day of calendarDays.value) {
    if (day.profit !== null) {
      totalProfit += day.profit
      if (day.profit > 0) positiveDays++
      else if (day.profit < 0) negativeDays++
    }
  }
  
  return { totalProfit, positiveDays, negativeDays }
})

// 切换月份
const prevMonth = () => {
  if (currentMonth.value === 1) {
    currentMonth.value = 12
    currentYear.value--
  } else {
    currentMonth.value--
  }
}

const nextMonth = () => {
  if (currentMonth.value === 12) {
    currentMonth.value = 1
    currentYear.value++
  } else {
    currentMonth.value++
  }
}

// 切换年份
const prevYear = () => {
  currentYear.value--
}

const nextYear = () => {
  currentYear.value++
}

// 获取收益颜色
const getProfitColor = (profit: number | null) => {
  if (profit === null) return 'text-apple-secondary'
  if (profit > 0) return 'text-profit'
  if (profit < 0) return 'text-loss'
  return 'text-apple-text'
}

// 获取收益背景色（热力图效果）
const getProfitBg = (profit: number | null) => {
  if (profit === null) return 'bg-black/3'
  const abs = Math.abs(profit)
  if (profit > 0) {
    if (abs > 1000) return 'bg-profit/15'
    if (abs > 500) return 'bg-profit/10'
    return 'bg-profit/5'
  } else {
    if (abs > 1000) return 'bg-loss/15'
    if (abs > 500) return 'bg-loss/10'
    return 'bg-loss/5'
  }
}
</script>

<template>
  <div class="profit-calendar flex flex-col h-full">
    <!-- 头部控制区 -->
    <div class="flex items-center justify-between mb-1 flex-shrink-0">
      <div class="flex items-center space-x-0.5">
        <button 
          @click="viewMode === 'month' ? prevMonth() : prevYear()"
          class="p-0.5 hover:bg-black/5 rounded-full transition-colors"
        >
          <ChevronLeft class="w-3 h-3 text-apple-secondary" />
        </button>
        
        <div class="flex items-center space-x-1 min-w-[90px] justify-center">
          <span class="text-xs font-semibold text-apple-text">{{ currentYear }}年</span>
          <span v-if="viewMode === 'month'" class="text-xs font-semibold text-apple-text">
            {{ monthNames[currentMonth - 1] }}
          </span>
        </div>
        
        <button 
          @click="viewMode === 'month' ? nextMonth() : nextYear()"
          class="p-0.5 hover:bg-black/5 rounded-full transition-colors"
        >
          <ChevronRight class="w-3 h-3 text-apple-secondary" />
        </button>
      </div>
      
      <!-- 视图切换 -->
      <div class="flex items-center space-x-0.5 bg-black/5 rounded-full p-0.5">
        <button
          @click="viewMode = 'month'"
          :class="[
            'px-1.5 py-0.5 text-[9px] rounded-full transition-all',
            viewMode === 'month' ? 'bg-white shadow-sm text-apple-text font-medium' : 'text-apple-secondary hover:text-apple-text'
          ]"
        >
          月
        </button>
        <button
          @click="viewMode = 'year'"
          :class="[
            'px-1.5 py-0.5 text-[9px] rounded-full transition-all',
            viewMode === 'year' ? 'bg-white shadow-sm text-apple-text font-medium' : 'text-apple-secondary hover:text-apple-text'
          ]"
        >
          年
        </button>
      </div>
    </div>

    <!-- 月视图 -->
    <div v-if="viewMode === 'month'" class="flex flex-col flex-1 min-h-0">
      <!-- 星期标题 -->
      <div class="grid grid-cols-7 gap-px mb-px flex-shrink-0 px-4">
        <div 
          v-for="day in weekDays" 
          :key="day"
          class="text-center text-[10px] font-medium text-apple-secondary py-px"
        >
          {{ day }}
        </div>
      </div>
      
      <!-- 日历网格 -->
      <div class="grid grid-cols-7 gap-px flex-1 content-start px-4 relative">
        <div
          v-for="(day, index) in calendarDays"
          :key="index"
          @mouseenter="day.profit !== null && day.productProfits.length > 0 && showTooltip($event, day.date, day.profit!, day.productProfits)"
          @mouseleave="hideTooltip"
          :class="[
            'rounded-sm flex flex-col items-center justify-center py-0.5 transition-all h-[30px]',
            day.isCurrentMonth ? getProfitBg(day.profit) : 'bg-transparent',
            day.profit !== null ? 'cursor-pointer' : ''
          ]"
        >
          <span 
            v-if="day.day > 0"
            :class="[
              'text-xs leading-none font-medium',
              day.isCurrentMonth ? 'text-apple-text' : 'text-apple-secondary/50'
            ]"
          >
            {{ day.day }}
          </span>
          <span 
            v-if="day.profit !== null && day.isCurrentMonth"
            :class="['text-[10px] leading-none font-medium', getProfitColor(day.profit)]"
          >
            {{ day.profit > 0 ? '+' : '' }}{{ day.profit.toFixed(0) }}
          </span>
        </div>
      </div>
      
      <!-- 月度汇总 -->
      <div class="mt-1 pt-1 border-t border-apple-border/30 flex justify-between text-[10px] flex-shrink-0">
        <div class="flex items-center space-x-2">
          <span class="text-apple-secondary">
            盈 <span class="text-profit font-medium">{{ monthSummary.positiveDays }}</span>
          </span>
          <span class="text-apple-secondary">
            亏 <span class="text-loss font-medium">{{ monthSummary.negativeDays }}</span>
          </span>
        </div>
        <span :class="['font-semibold', getProfitColor(monthSummary.totalProfit)]">
          {{ monthSummary.totalProfit >= 0 ? '+' : '' }}{{ formatCurrency(monthSummary.totalProfit) }}
        </span>
      </div>
    </div>

    <!-- 年视图 -->
    <div v-else class="flex flex-col flex-1 min-h-0">
      <div class="grid grid-cols-4 gap-1.5 flex-1 content-start px-4">
        <div
          v-for="item in yearlySummary"
          :key="item.month"
          @click="currentMonth = item.month; viewMode = 'month'"
          :class="[
            'px-1.5 py-1.5 rounded-apple cursor-pointer transition-all hover:shadow-apple',
            item.days > 0 ? getProfitBg(item.totalProfit) : 'bg-black/3'
          ]"
        >
          <div class="text-[10px] font-medium text-apple-text">{{ monthNames[item.month - 1] }}</div>
          <div 
            v-if="item.days > 0"
            :class="['text-xs font-semibold mt-0.5', getProfitColor(item.totalProfit)]"
          >
            {{ item.totalProfit >= 0 ? '+' : '' }}{{ formatCurrency(item.totalProfit) }}
          </div>
          <div v-else class="text-xs text-apple-secondary mt-0.5">-</div>
          <div v-if="item.days > 0" class="text-[9px] text-apple-secondary mt-0.5">
            {{ item.days }} 日
          </div>
        </div>
      </div>
      
      <!-- 年度汇总 -->
      <div class="mt-2 pt-1.5 border-t border-apple-border/30 flex justify-between items-center flex-shrink-0">
        <span class="text-[10px] text-apple-secondary">{{ currentYear }} 年度汇总</span>
        <span :class="['text-xs font-semibold', getProfitColor(yearlySummary.reduce((sum, m) => sum + m.totalProfit, 0))]">
          {{ yearlySummary.reduce((sum, m) => sum + m.totalProfit, 0) >= 0 ? '+' : '' }}{{ formatCurrency(yearlySummary.reduce((sum, m) => sum + m.totalProfit, 0)) }}
        </span>
      </div>
    </div>

    <!-- Tooltip -->
    <Teleport to="body">
      <div
        v-if="tooltipVisible && tooltipData"
        class="fixed z-50 pointer-events-none"
        :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px', transform: 'translate(-50%, -100%)' }"
      >
        <div class="bg-apple-text text-white text-[11px] rounded-apple shadow-apple-lg px-3 py-2 min-w-[140px]">
          <div class="font-medium mb-1 text-white/60">{{ tooltipData.date }}</div>
          <div class="space-y-0.5">
            <div v-for="p in tooltipData.products" :key="p.productName" class="flex justify-between gap-3">
              <span class="text-white/50 truncate max-w-[100px]">{{ p.productName }}</span>
              <span :class="p.profit >= 0 ? 'text-profit' : 'text-loss'">
                {{ p.profit >= 0 ? '+' : '' }}{{ p.profit.toFixed(2) }}
              </span>
            </div>
          </div>
          <div class="border-t border-white/20 mt-1 pt-1 flex justify-between font-medium">
            <span>合计</span>
            <span :class="tooltipData.profit >= 0 ? 'text-profit' : 'text-loss'">
              {{ tooltipData.profit >= 0 ? '+' : '' }}{{ tooltipData.profit.toFixed(2) }}
            </span>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.profit-calendar {
  font-family: inherit;
}
</style>
