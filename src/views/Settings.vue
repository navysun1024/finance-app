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

const handleExportExcel = () => {
  try {
    exportToExcel(
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
      <h2 class="text-xl font-bold text-gray-800">数据管理</h2>
      <p class="text-gray-500 text-sm mt-1">管理您的理财数据，支持导出、导入和重置操作</p>
    </div>
    
    <div v-if="message" :class="['p-4 rounded-lg mb-6', messageType === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700']">
      {{ message }}
    </div>
    
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div class="flex items-start space-x-4">
        <div class="p-3 bg-blue-50 rounded-lg">
          <Download class="w-6 h-6 text-blue-600" />
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-gray-800">导出数据</h3>
          <p class="text-gray-500 text-sm mt-1">将所有数据导出为JSON文件，方便备份或迁移到其他设备</p>
        </div>
        <button 
          @click="handleExport"
          class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          导出
        </button>
      </div>
    </div>
    
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div class="flex items-start space-x-4">
        <div class="p-3 bg-green-50 rounded-lg">
          <Table class="w-6 h-6 text-green-600" />
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-gray-800">导出投资明细Excel</h3>
          <p class="text-gray-500 text-sm mt-1">将投资产品汇总、交易明细和投资汇总导出为Excel表格</p>
        </div>
        <button 
          @click="handleExportExcel"
          class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          导出Excel
        </button>
      </div>
    </div>
    
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div class="flex items-start space-x-4">
        <div class="p-3 bg-orange-50 rounded-lg">
          <Upload class="w-6 h-6 text-orange-600" />
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-gray-800">导入数据</h3>
          <p class="text-gray-500 text-sm mt-1">从JSON文件导入理财数据</p>
        </div>
        <input 
          ref="importFile"
          type="file" 
          accept=".json"
          @change="handleFileImport"
          class="hidden"
          id="import-file"
        />
        <label for="import-file" class="inline-flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
          <FileText class="w-5 h-5 text-gray-500" />
          <span>选择JSON文件</span>
        </label>
      </div>
    </div>
    
    <!-- 定时净值更新调度器 -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div class="flex items-start space-x-4">
        <div class="p-3 bg-cyan-50 rounded-lg">
          <Clock class="w-6 h-6 text-cyan-600" />
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-gray-800">定时净值更新</h3>
          <p class="text-gray-500 text-sm mt-1">每天自动更新4次基金与理财产品净值（09:30 / 12:00 / 15:00 / 20:00）</p>
        </div>
        <button
          @click="handleToggleScheduler"
          :disabled="loadingScheduler"
          :class="[
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
            schedulerStatus?.enabled ? 'bg-cyan-600' : 'bg-gray-300'
          ]"
        >
          <span
            :class="[
              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
              schedulerStatus?.enabled ? 'translate-x-6' : 'translate-x-1'
            ]"
          />
        </button>
      </div>
      <div v-if="schedulerStatus" class="mt-4 text-sm text-gray-600 space-y-1.5 bg-gray-50 rounded-lg p-3">
        <div class="flex justify-between">
          <span class="text-gray-500">调度状态</span>
          <span :class="schedulerStatus.enabled ? 'text-green-600 font-medium' : 'text-gray-400'">{{ schedulerStatus.enabled ? '已启用' : '已暂停' }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">下次执行</span>
          <span class="font-mono">{{ schedulerStatus.nextRunTime }}</span>
        </div>
        <div v-if="schedulerStatus.lastRunTime" class="flex justify-between">
          <span class="text-gray-500">上次执行</span>
          <span class="font-mono">{{ new Date(schedulerStatus.lastRunTime).toLocaleString('zh-CN') }}</span>
        </div>
        <div v-if="schedulerStatus.lastRunSummary" class="flex justify-between">
          <span class="text-gray-500">上次结果</span>
          <span>成功 {{ schedulerStatus.lastRunSummary.success }} / 跳过 {{ schedulerStatus.lastRunSummary.skipped }} / 失败 {{ schedulerStatus.lastRunSummary.failed }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">累计执行</span>
          <span>{{ schedulerStatus.totalRuns }} 次</span>
        </div>
      </div>
      <div class="mt-4">
        <button
          @click="handleManualRun"
          :disabled="manualRunning"
          class="flex items-center space-x-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Play class="w-4 h-4" :class="{ 'animate-spin': manualRunning }" />
          <span>{{ manualRunning ? '执行中...' : '立即执行一次' }}</span>
        </button>
      </div>
    </div>
    
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div class="flex items-start space-x-4">
        <div class="p-3 bg-red-50 rounded-lg">
          <Trash2 class="w-6 h-6 text-red-600" />
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-gray-800">重置数据</h3>
          <p class="text-gray-500 text-sm mt-1">清除所有理财数据，此操作无法撤销</p>
        </div>
        <button 
          @click="showResetConfirm = true"
          class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          重置
        </button>
      </div>
    </div>
    
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div class="flex items-start space-x-4">
        <div class="p-3 bg-purple-50 rounded-lg">
          <span class="w-6 h-6 flex items-center justify-center bg-purple-600 text-white rounded-full text-sm font-bold">
            {{ getCurrentUser().username?.charAt(0).toUpperCase() || '?' }}
          </span>
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-gray-800">账户信息</h3>
          <p class="text-gray-500 text-sm mt-1">当前登录用户: {{ getCurrentUser().username }}</p>
        </div>
        <button 
          @click="logout"
          class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          退出登录
        </button>
      </div>
    </div>
    
    <div class="bg-blue-50 rounded-xl p-6">
      <h3 class="font-semibold text-blue-800 mb-2">数据存储说明</h3>
      <ul class="text-blue-600 text-sm space-y-1">
        <li>• 所有数据存储在服务端的SQLite数据库中</li>
        <li>• 登录后可在任意设备访问您的数据</li>
        <li>• 建议定期导出数据进行备份</li>
        <li>• 不同用户的数据相互隔离</li>
      </ul>
    </div>
    
    <div class="bg-gray-50 rounded-xl p-6">
      <h3 class="font-semibold text-gray-700 mb-2">应用信息</h3>
      <div class="text-gray-500 text-sm space-y-2">
        <p>版本号: <span class="font-mono">v0.90</span></p>
        <p>技术栈: Vue 3 + Vite + TailwindCSS + ECharts</p>
        <div class="mt-3 pt-3 border-t border-gray-300">
          <p class="font-semibold text-gray-600 mb-2">v0.90 版本变更 (2026-06-02)</p>
          <ul class="list-disc list-inside space-y-1 text-gray-500">
            <li>新增净值定时更新调度器，支持配置执行时间与间隔</li>
            <li>固收理财历史净值缓存优化，页面加载速度显著提升</li>
            <li>产品列表搜索支持按产品代码搜索</li>
            <li>基金页面持仓汇总默认隐藏，点击展开查看</li>
            <li>删除仪表盘自动更新净值功能，改用定时调度器</li>
            <li>JSON 导入文件大小限制提升至 10MB</li>
            <li>导入数据错误提示优化，显示具体原因</li>
            <li>添加网页 favicon 图标</li>
            <li>重构 README 文档，完善项目结构说明</li>
          </ul>
        </div>
      </div>
    </div>
    
    <Teleport to="body">
      <div 
        v-if="showResetConfirm" 
        class="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4"
        @click.self="showResetConfirm = false"
      >
        <div class="bg-white rounded-t-xl md:rounded-xl shadow-xl w-full max-w-md">
          <div class="p-6">
            <div class="flex items-center justify-center w-12 h-12 bg-red-100 rounded-full mx-auto mb-4">
              <AlertCircle class="w-6 h-6 text-red-600" />
            </div>
            <h3 class="text-lg font-semibold text-gray-800 text-center mb-2">确认重置</h3>
            <p class="text-gray-500 text-center">确定要清除所有理财数据吗？此操作无法撤销！</p>
          </div>
          <div class="flex justify-end space-x-3 p-6 border-t border-gray-200">
            <button 
              @click="showResetConfirm = false" 
              class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button 
              @click="handleReset" 
              class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              确认重置
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
