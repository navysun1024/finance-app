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
      <h2 class="text-xl font-bold text-white drop-shadow-sm">数据管理</h2>
      <p class="text-white/80 text-sm mt-1">管理您的理财数据，支持导出、导入和重置操作</p>
    </div>
    
    <div v-if="message" :class="['p-4 rounded-xl mb-6 backdrop-blur-sm', messageType === 'success' ? 'bg-green-400/30 text-green-100' : 'bg-red-400/30 text-red-100']">
      {{ message }}
    </div>
    
    <div class="glass-card rounded-2xl p-6 hover:bg-white/80 transition-all duration-300">
      <div class="flex items-start space-x-4">
        <div class="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/30">
          <Download class="w-6 h-6 text-white" />
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-gray-800">导出数据</h3>
          <p class="text-gray-500 text-sm mt-1">将所有数据导出为JSON文件，方便备份或迁移到其他设备</p>
        </div>
        <button 
          @click="handleExport"
          class="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:shadow-lg hover:shadow-indigo-500/30 transition-all duration-300 hover:-translate-y-0.5"
        >
          导出
        </button>
      </div>
    </div>
    
    <div class="glass-card rounded-2xl p-6 hover:bg-white/80 transition-all duration-300">
      <div class="flex items-start space-x-4">
        <div class="p-3 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl shadow-lg shadow-emerald-500/30">
          <Table class="w-6 h-6 text-white" />
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-gray-800">导出投资明细Excel</h3>
          <p class="text-gray-500 text-sm mt-1">将投资产品汇总、交易明细和投资汇总导出为Excel表格</p>
        </div>
        <button 
          @click="handleExportExcel"
          class="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl hover:shadow-lg hover:shadow-emerald-500/30 transition-all duration-300 hover:-translate-y-0.5"
        >
          导出Excel
        </button>
      </div>
    </div>
    
    <div class="glass-card rounded-2xl p-6 hover:bg-white/80 transition-all duration-300">
      <div class="flex items-start space-x-4">
        <div class="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg shadow-amber-500/30">
          <Upload class="w-6 h-6 text-white" />
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
        <label for="import-file" class="inline-flex items-center space-x-2 px-4 py-2 glass-btn rounded-xl cursor-pointer hover:bg-white/80 transition-all duration-300">
          <FileText class="w-5 h-5 text-gray-500" />
          <span>选择JSON文件</span>
        </label>
      </div>
    </div>
    
    <!-- 定时净值更新调度器 -->
    <div class="glass-card rounded-2xl p-6 hover:bg-white/80 transition-all duration-300">
      <div class="flex items-start space-x-4">
        <div class="p-3 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl shadow-lg shadow-cyan-500/30">
          <Clock class="w-6 h-6 text-white" />
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-gray-800">定时净值更新</h3>
          <p class="text-gray-500 text-sm mt-1">
            每天自动更新基金与理财产品净值
            <span v-if="schedulerStatus?.scheduleTimes">（{{ schedulerStatus.scheduleTimes.join(' / ') }}）</span>
          </p>
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
      <div v-if="schedulerStatus" class="mt-4 text-sm text-gray-600 space-y-1.5 bg-white/50 rounded-xl p-3 backdrop-blur-sm">
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
          class="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl hover:shadow-lg hover:shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:-translate-y-0.5"
        >
          <Play class="w-4 h-4" :class="{ 'animate-spin': manualRunning }" />
          <span>{{ manualRunning ? '执行中...' : '立即执行一次' }}</span>
        </button>
      </div>
    </div>
    
    <div class="glass-card rounded-2xl p-6 hover:bg-white/80 transition-all duration-300">
      <div class="flex items-start space-x-4">
        <div class="p-3 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl shadow-lg shadow-red-500/30">
          <Trash2 class="w-6 h-6 text-white" />
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-gray-800">重置数据</h3>
          <p class="text-gray-500 text-sm mt-1">清除所有理财数据，此操作无法撤销</p>
        </div>
        <button 
          @click="showResetConfirm = true"
          class="px-4 py-2 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl hover:shadow-lg hover:shadow-red-500/30 transition-all duration-300 hover:-translate-y-0.5"
        >
          重置
        </button>
      </div>
    </div>
    
    <div class="glass-card rounded-2xl p-6 hover:bg-white/80 transition-all duration-300">
      <div class="flex items-start space-x-4">
        <div class="p-3 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl shadow-lg shadow-blue-500/30">
          <span class="w-6 h-6 flex items-center justify-center text-white rounded-full text-sm font-bold">
            {{ getCurrentUser().username?.charAt(0).toUpperCase() || '?' }}
          </span>
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-gray-800">账户信息</h3>
          <p class="text-gray-500 text-sm mt-1">当前登录用户: {{ getCurrentUser().username }}</p>
        </div>
        <button 
          @click="logout"
          class="px-4 py-2 glass-btn text-gray-700 rounded-xl hover:bg-white/80 transition-all duration-300"
        >
          退出登录
        </button>
      </div>
    </div>
    
    <div class="glass-card rounded-2xl p-6">
      <h3 class="font-semibold text-indigo-700 mb-2">数据存储说明</h3>
      <ul class="text-gray-600 text-sm space-y-1">
        <li>• 所有数据存储在服务端的SQLite数据库中</li>
        <li>• 登录后可在任意设备访问您的数据</li>
        <li>• 建议定期导出数据进行备份</li>
        <li>• 不同用户的数据相互隔离</li>
      </ul>
    </div>
    
    <div class="glass-card rounded-2xl p-6">
      <h3 class="font-semibold text-gray-800 mb-2">应用信息</h3>
      <div class="text-gray-500 text-sm space-y-2">
        <p>版本号: <span class="font-mono text-indigo-600">v1.1.0</span></p>
        <p>技术栈: Vue 3 + Vite + TailwindCSS + ECharts</p>
        <div class="mt-3 pt-3 border-t border-gray-200/50">
          <p class="font-semibold text-gray-700 mb-2">v1.1.0 版本变更 (2026-06-15)</p>
          <ul class="list-disc list-inside space-y-1 text-gray-500">
            <li>新增产品定投属性：支持设置定投金额和定投周期（每日/每周/每两周/每月）</li>
            <li>产品备注显示限购信息，支持暂停申购状态识别</li>
            <li>JSON 导入导出支持定投字段，兼容旧版本数据</li>
            <li>弹窗交互优化：修复文本选择时弹窗意外关闭的问题</li>
            <li>产品列表移除首字母图标，界面更简洁</li>
          </ul>
          <p class="font-semibold text-gray-700 mb-2 mt-4">v1.0.2 版本变更 (2026-06-12)</p>
          <ul class="list-disc list-inside space-y-1 text-gray-500">
            <li>表格视觉优化：表头加深、行高紧凑、内容强制不换行</li>
            <li>移动端导航栏移至底部，修复顶部空白问题</li>
            <li>Docker 部署支持飞牛NAS，含完整构建与数据持久化方案</li>
            <li>修复 Alpine Nginx SVG favicon 不显示问题</li>
          </ul>
          <p class="font-semibold text-gray-700 mb-2 mt-4">v1.0 版本变更 (2026-06-02)</p>
          <ul class="list-disc list-inside space-y-1 text-gray-500">
            <li>全新毛玻璃质感 UI 主题，冷色调渐变背景</li>
            <li>历史交易列表新增日期区间筛选，默认显示近三个月</li>
            <li>产品详情页历史交易同步支持日期区间筛选</li>
            <li>修复跨用户数据隔离 Bug，导入数据不再影响其他用户</li>
            <li>新增基金历史净值补全功能，支持东方财富数据源</li>
            <li>基金页面持仓汇总缓存优化，页面刷新后自动恢复</li>
            <li>导航栏、卡片、按钮、输入框全面升级为玻璃质感</li>
            <li>登录/注册页面视觉重构，添加动态装饰元素</li>
          </ul>
          <p class="font-semibold text-gray-700 mb-2 mt-4">v0.90 版本变更 (2026-06-01)</p>
          <ul class="list-disc list-inside space-y-1 text-gray-500">
            <li>新增净值定时更新调度器，支持配置执行时间与间隔</li>
            <li>固收理财历史净值缓存优化，页面加载速度显著提升</li>
            <li>产品列表搜索支持按产品代码搜索</li>
            <li>基金页面持仓汇总默认隐藏，点击展开查看</li>
            <li>JSON 导入文件大小限制提升至 10MB</li>
          </ul>
        </div>
      </div>
    </div>
    
    <Teleport to="body">
      <div 
        v-if="showResetConfirm" 
        class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center z-50 p-0 md:p-4"
        @click.self="showResetConfirm = false"
      >
        <div class="glass-card rounded-t-2xl md:rounded-2xl shadow-2xl w-full max-w-md">
          <div class="p-6">
            <div class="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl mx-auto mb-4 shadow-lg shadow-red-500/30">
              <AlertCircle class="w-6 h-6 text-white" />
            </div>
            <h3 class="text-lg font-semibold text-gray-800 text-center mb-2">确认重置</h3>
            <p class="text-gray-500 text-center">确定要清除所有理财数据吗？此操作无法撤销！</p>
          </div>
          <div class="flex justify-end space-x-3 p-6 border-t border-gray-200/50">
            <button 
              @click="showResetConfirm = false" 
              class="px-4 py-2 glass-btn text-gray-600 rounded-xl transition-all duration-300"
            >
              取消
            </button>
            <button 
              @click="handleReset" 
              class="px-4 py-2 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl hover:shadow-lg hover:shadow-red-500/30 transition-all duration-300 hover:-translate-y-0.5"
            >
              确认重置
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
