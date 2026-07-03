<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Download, Upload, Trash2, FileText, AlertCircle, Table, Clock, Play } from 'lucide-vue-next'
import { exportData, importData, clearAllData, logout, getCurrentUser } from '@/utils/storage'
import { useFinance } from '@/composables/useFinance'
import { exportToExcel } from '@/utils/excel'

const importFile = ref<HTMLInputElement | null>(null)
const showResetConfirm = ref(false)
const message = ref('')
const messageType = ref<'success' | 'error'>('success')

// 调度器状态
const schedulerStatus = ref<any>(null)
const loadingScheduler = ref(false)
const manualRunning = ref(false)

const { products, transactions, portfolioSummary, refresh } = useFinance()

// 获取调度器状态
const fetchSchedulerStatus = async () => {
  try {
    const res = await fetch('/api/nav-scheduler/status')
    schedulerStatus.value = await res.json()
  } catch {
    schedulerStatus.value = null
  }
}

// 格式化调度时间显示（合并连续的时间区间）
const formatScheduleTimes = (times: string[]) => {
  if (!times || times.length === 0) return ''
  const sorted = [...times].sort()
  const intervals: string[] = []
  let start = sorted[0]
  let prevHour = parseInt(start.split(':')[0])
  
  for (let i = 1; i < sorted.length; i++) {
    const currentHour = parseInt(sorted[i].split(':')[0])
    if (currentHour !== prevHour + 1) {
      intervals.push(start === sorted[i-1] ? start : `${start}-${sorted[i-1]}`)
      start = sorted[i]
    }
    prevHour = currentHour
  }
  intervals.push(start === sorted[sorted.length-1] ? start : `${start}-${sorted[sorted.length-1]}`)
  
  return intervals.join(' / ')
}

// 手动触发净值更新
const handleManualRun = async () => {
  manualRunning.value = true
  try {
    const res = await fetch('/api/nav-scheduler/run', { method: 'POST' })
    const data = await res.json()
    if (data.success) {
      const s = data.summary
      showMessage(`更新完成: 成功 ${s.success}, 跳过 ${s.skipped}, 失败 ${s.failed}`, s.failed > 0 ? 'error' : 'success')
    } else {
      showMessage('手动更新失败: ' + (data.error || '未知错误'), 'error')
    }
    await fetchSchedulerStatus()
  } catch (e: any) {
    showMessage('请求失败: ' + e.message, 'error')
  } finally {
    manualRunning.value = false
  }
}

// 切换调度器启用/禁用
const handleToggleScheduler = async () => {
  loadingScheduler.value = true
  try {
    const res = await fetch('/api/nav-scheduler/toggle', { method: 'POST' })
    const data = await res.json()
    showMessage(data.enabled ? '定时更新已启用' : '定时更新已暂停', 'success')
    await fetchSchedulerStatus()
  } catch {
    showMessage('操作失败', 'error')
  } finally {
    loadingScheduler.value = false
  }
}

onMounted(() => {
  fetchSchedulerStatus()
})

const handleExport = async () => {
  const data = await exportData()
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `finance-data-${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  
  showMessage('数据导出成功', 'success')
}

const handleExportExcel = async () => {
  try {
    await exportToExcel(
      products.value,
      portfolioSummary.value.positions,
      transactions.value
    )
    showMessage('Excel导出成功', 'success')
  } catch (error) {
    console.error('Excel导出失败:', error)
    showMessage('Excel导出失败', 'error')
  }
}

const handleFileImport = async () => {
  if (!importFile.value?.files?.[0]) return
  
  const file = importFile.value.files[0]
  const reader = new FileReader()
  reader.onload = async (e) => {
    const text = e.target?.result as string
    if (!text?.trim()) {
      showMessage('文件内容为空', 'error')
      return
    }
    const result = await importData(text)
    if (result.success) {
      await refresh()
      showMessage(result.message, 'success')
    } else {
      showMessage(result.message, 'error')
    }
  }
  reader.readAsText(file)
}

const handleReset = () => {
  if (confirm('确定要重置所有数据吗？此操作无法撤销！')) {
    clearAllData()
    showResetConfirm.value = false
    showMessage('数据已重置', 'success')
  }
}

const showMessage = (msg: string, type: 'success' | 'error') => {
  message.value = msg
  messageType.value = type
  setTimeout(() => {
    message.value = ''
  }, 3000)
}
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <div>
      <h2 class="apple-section-title">设置</h2>
      <p class="apple-section-subtitle mt-1">管理您的理财数据，支持导出、导入和重置操作</p>
    </div>
    
    <div v-if="message" :class="['p-4 rounded-apple mb-6 text-[14px] font-medium', messageType === 'success' ? 'bg-loss/8 text-loss' : 'bg-profit/8 text-profit']">
      {{ message }}
    </div>
    
    <div class="glass-card p-6">
      <div class="flex items-start space-x-4">
        <div class="w-11 h-11 bg-primary-500 rounded-xl flex items-center justify-center flex-shrink-0">
          <Download class="w-5 h-5 text-white" />
        </div>
        <div class="flex-1">
          <h3 class="text-[15px] font-semibold text-apple-text">导出数据</h3>
          <p class="text-[13px] text-apple-secondary mt-1">将所有数据导出为JSON文件，方便备份或迁移到其他设备</p>
        </div>
        <button 
          @click="handleExport"
          class="apple-btn-primary px-5 py-2 text-[13px]"
        >
          导出
        </button>
      </div>
    </div>
    
    <div class="glass-card p-6">
      <div class="flex items-start space-x-4">
        <div class="w-11 h-11 bg-loss rounded-xl flex items-center justify-center flex-shrink-0">
          <Table class="w-5 h-5 text-white" />
        </div>
        <div class="flex-1">
          <h3 class="text-[15px] font-semibold text-apple-text">导出投资明细Excel</h3>
          <p class="text-[13px] text-apple-secondary mt-1">将投资产品汇总、交易明细和投资汇总导出为Excel表格</p>
        </div>
        <button 
          @click="handleExportExcel"
          class="apple-btn-primary px-5 py-2 text-[13px]"
        >
          导出Excel
        </button>
      </div>
    </div>
    
    <div class="glass-card p-6">
      <div class="flex items-start space-x-4">
        <div class="w-11 h-11 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
          <Upload class="w-5 h-5 text-white" />
        </div>
        <div class="flex-1">
          <h3 class="text-[15px] font-semibold text-apple-text">导入数据</h3>
          <p class="text-[13px] text-apple-secondary mt-1">从JSON文件导入理财数据</p>
        </div>
        <input 
          ref="importFile"
          type="file" 
          accept=".json"
          @change="handleFileImport"
          class="hidden"
          id="import-file"
        />
        <label for="import-file" class="inline-flex items-center space-x-2 px-4 py-2 glass-btn rounded-full cursor-pointer text-[13px] font-medium">
          <FileText class="w-4 h-4 text-apple-secondary" />
          <span>选择JSON文件</span>
        </label>
      </div>
    </div>
    
    <!-- 定时净值更新调度器 -->
    <div class="glass-card p-6">
      <div class="flex items-start space-x-4">
        <div class="w-11 h-11 bg-cyan-500 rounded-xl flex items-center justify-center flex-shrink-0">
          <Clock class="w-5 h-5 text-white" />
        </div>
        <div class="flex-1">
          <h3 class="text-[15px] font-semibold text-apple-text">定时净值更新</h3>
          <p class="text-[13px] text-apple-secondary mt-1">
            每天自动更新基金与理财产品净值
            <span v-if="schedulerStatus?.scheduleTimes">（{{ formatScheduleTimes(schedulerStatus.scheduleTimes) }}）</span>
          </p>
        </div>
        <button
          @click="handleToggleScheduler"
          :disabled="loadingScheduler"
          :class="[
            'relative inline-flex h-7 w-12 items-center rounded-full transition-colors',
            schedulerStatus?.enabled ? 'bg-primary-500' : 'bg-black/15'
          ]"
        >
          <span
            :class="[
              'inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform',
              schedulerStatus?.enabled ? 'translate-x-6' : 'translate-x-1'
            ]"
          />
        </button>
      </div>
      <div v-if="schedulerStatus" class="mt-4 text-[13px] text-apple-secondary space-y-2 bg-apple-bg rounded-apple p-4">
        <div class="flex justify-between">
          <span>调度状态</span>
          <span :class="schedulerStatus.enabled ? 'text-loss font-medium' : 'text-apple-secondary'">{{ schedulerStatus.enabled ? '已启用' : '已暂停' }}</span>
        </div>
        <div class="flex justify-between">
          <span>下次执行</span>
          <span class="font-mono text-apple-text">{{ schedulerStatus.nextRunTime }}</span>
        </div>
        <div v-if="schedulerStatus.lastRunTime" class="flex justify-between">
          <span>上次执行</span>
          <span class="font-mono text-apple-text">{{ new Date(schedulerStatus.lastRunTime).toLocaleString('zh-CN') }}</span>
        </div>
        <div v-if="schedulerStatus.lastRunSummary" class="flex justify-between">
          <span>上次结果</span>
          <span class="text-apple-text">成功 {{ schedulerStatus.lastRunSummary.success }} / 跳过 {{ schedulerStatus.lastRunSummary.skipped }} / 失败 {{ schedulerStatus.lastRunSummary.failed }}</span>
        </div>
        <div class="flex justify-between">
          <span>累计执行</span>
          <span class="text-apple-text">{{ schedulerStatus.totalRuns }} 次</span>
        </div>
      </div>
      <div class="mt-4">
        <button
          @click="handleManualRun"
          :disabled="manualRunning"
          class="apple-btn-primary flex items-center space-x-2 px-5 py-2 text-[13px] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play class="w-3.5 h-3.5" :class="{ 'animate-spin': manualRunning }" />
          <span>{{ manualRunning ? '执行中...' : '立即执行一次' }}</span>
        </button>
      </div>
    </div>
    
    <div class="glass-card p-6">
      <div class="flex items-start space-x-4">
        <div class="w-11 h-11 bg-profit rounded-xl flex items-center justify-center flex-shrink-0">
          <Trash2 class="w-5 h-5 text-white" />
        </div>
        <div class="flex-1">
          <h3 class="text-[15px] font-semibold text-apple-text">重置数据</h3>
          <p class="text-[13px] text-apple-secondary mt-1">清除所有理财数据，此操作无法撤销</p>
        </div>
        <button 
          @click="showResetConfirm = true"
          class="px-5 py-2 bg-profit text-white rounded-full text-[13px] font-medium hover:opacity-90 transition-all"
        >
          重置
        </button>
      </div>
    </div>
    
    <div class="glass-card p-6">
      <div class="flex items-start space-x-4">
        <div class="w-11 h-11 bg-apple-text rounded-xl flex items-center justify-center flex-shrink-0">
          <span class="text-white text-[14px] font-semibold">
            {{ (getCurrentUser().username || '?').charAt(0).toUpperCase() }}
          </span>
        </div>
        <div class="flex-1">
          <h3 class="text-[15px] font-semibold text-apple-text">账户信息</h3>
          <p class="text-[13px] text-apple-secondary mt-1">当前登录用户: {{ getCurrentUser().username }}</p>
        </div>
        <button 
          @click="logout"
          class="px-4 py-2 glass-btn text-apple-text rounded-full text-[13px] font-medium"
        >
          退出登录
        </button>
      </div>
    </div>
    
    <div class="glass-card p-6">
      <h3 class="text-[15px] font-semibold text-primary-500 mb-3">数据存储说明</h3>
      <ul class="text-[13px] text-apple-secondary space-y-1.5">
        <li>• 所有数据存储在服务端的SQLite数据库中</li>
        <li>• 登录后可在任意设备访问您的数据</li>
        <li>• 建议定期导出数据进行备份</li>
        <li>• 不同用户的数据相互隔离</li>
      </ul>
    </div>
    
    <Teleport to="body">
      <div 
        v-if="showResetConfirm" 
        class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        @click.self="showResetConfirm = false"
      >
        <div class="bg-white rounded-apple-xl shadow-apple-xl w-full max-w-md">
          <div class="p-8 text-center">
            <div class="w-14 h-14 bg-profit/10 rounded-2xl mx-auto mb-5 flex items-center justify-center">
              <AlertCircle class="w-7 h-7 text-profit" />
            </div>
            <h3 class="text-[20px] font-semibold text-apple-text mb-2">确认重置</h3>
            <p class="text-[14px] text-apple-secondary">确定要清除所有理财数据吗？此操作无法撤销！</p>
          </div>
          <div class="flex justify-end space-x-3 px-8 pb-8">
            <button 
              @click="showResetConfirm = false" 
              class="px-5 py-2.5 glass-btn text-apple-text rounded-full text-[14px] font-medium"
            >
              取消
            </button>
            <button 
              @click="handleReset" 
              class="px-5 py-2.5 bg-profit text-white rounded-full text-[14px] font-medium hover:opacity-90 transition-all"
            >
              确认重置
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
