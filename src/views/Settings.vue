<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Download, Upload, Trash2, FileText, AlertCircle, Table, RefreshCw, Clock, Play } from 'lucide-vue-next'
import { exportData, importData, clearAllData, getAutoUpdateEnabled, setAutoUpdateEnabled, logout, getCurrentUser } from '@/utils/storage'
import { useFinance } from '@/composables/useFinance'
import { exportToExcel } from '@/utils/excel'

const importFile = ref<HTMLInputElement | null>(null)
const showResetConfirm = ref(false)
const message = ref('')
const messageType = ref<'success' | 'error'>('success')
const autoUpdateEnabled = ref(getAutoUpdateEnabled())

// 调度器状态
const schedulerStatus = ref<any>(null)
const loadingScheduler = ref(false)
const manualRunning = ref(false)

const { products, transactions, portfolioSummary, refresh } = useFinance()

const toggleAutoUpdate = () => {
  autoUpdateEnabled.value = !autoUpdateEnabled.value
  setAutoUpdateEnabled(autoUpdateEnabled.value)
  showMessage(autoUpdateEnabled.value ? '已开启自动更新净值' : '已关闭自动更新净值', 'success')
}

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
    
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div class="flex items-start space-x-4">
        <div class="p-3 bg-indigo-50 rounded-lg">
          <RefreshCw class="w-6 h-6 text-indigo-600" />
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-gray-800">自动更新净值</h3>
          <p class="text-gray-500 text-sm mt-1">开启后，每次打开仪表盘自动更新所有产品净值</p>
        </div>
        <button 
          @click="toggleAutoUpdate"
          :class="[
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
            autoUpdateEnabled ? 'bg-indigo-600' : 'bg-gray-300'
          ]"
        >
          <span 
            :class="[
              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
              autoUpdateEnabled ? 'translate-x-6' : 'translate-x-1'
            ]" 
          />
        </button>
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
        <p>版本号: <span class="font-mono">v0.85</span></p>
        <p>技术栈: Vue 3 + Vite + TailwindCSS + ECharts</p>
        <div class="mt-3 pt-3 border-t border-gray-300">
          <p class="font-semibold text-gray-600 mb-2">v0.85 版本变更 (2026-06-01)</p>
          <ul class="list-disc list-inside space-y-1 text-gray-500">
            <li>仪表盘资产分布图按产品类型拆分为独立图表（基金、固收理财等各一个）</li>
            <li>收益趋势图按产品类型拆分为独立堆叠柱形图</li>
            <li>分布图与趋势图中同一产品使用一致的颜色，便于对照查看</li>
            <li>分布图柱形按金额大小排序，金额最大的显示在最上方</li>
            <li>分布图与趋势图布局调整：分布图在上，趋势图在下</li>
            <li>增大图表尺寸以铺满画布，优化图例位置避免遮挡数据</li>
            <li>所有服务添加完备的日志系统（db-server/scraper/nav_service/前端）</li>
            <li>日志自动写入文件，便于异常排查</li>
            <li>db-server 添加请求日志中间件，自动记录方法、路径、状态码、耗时</li>
            <li>db-server 添加优雅关闭机制（SIGTERM/SIGINT 信号处理）</li>
          </ul>
          <p class="font-semibold text-gray-600 mt-4 mb-2">v0.84 版本变更 (2026-05-31)</p>
          <ul class="list-disc list-inside space-y-1 text-gray-500">
            <li>新增批量导入功能，支持按表格格式批量导入基金产品与交易记录</li>
            <li>批量导入时自动检测重复数据，智能跳过已存在的产品和交易</li>
            <li>导入完成后弹出详细结果提示，清晰展示新增与跳过的条目</li>
            <li>修复 Transactions 页面刷新后内容不显示的问题</li>
            <li>修复批量导入 API 路由匹配错误</li>
            <li>修复批量导入过程中变量作用域引用错误</li>
            <li>优化各服务的启动与管理流程</li>
          </ul>
          <p class="font-semibold text-gray-600 mt-4 mb-2">v0.83 版本变更 (2026-05-30)</p>
          <ul class="list-disc list-inside space-y-1 text-gray-500">
            <li>修复产品持有人信息未保存到数据库的问题</li>
            <li>优化收益趋势图布局，图例移至右上角</li>
            <li>增加图表右侧图例空间，防止遮挡数据</li>
            <li>全面优化移动端适配，导航栏改为底部标签栏</li>
            <li>模态框移动端改为底部弹出全屏显示</li>
            <li>图表容器移动端自适应高度调整</li>
            <li>表格增加横向滚动支持</li>
            <li>产品详情页标题和按钮移动端自适应布局</li>
            <li>新增 safe-area 适配，兼容刘海屏手机</li>
            <li>资产分布图由饼图改为横向柱状图，显示占比标签</li>
          </ul>
          <p class="font-semibold text-gray-600 mt-4 mb-2">v0.82 版本变更</p>
          <ul class="list-disc list-inside space-y-1 text-gray-500">
            <li>优化净值走势图布局，图表区域占满可用空间</li>
            <li>修复日期标签显示不全问题，改为水平排列</li>
            <li>日期格式简化为月/日显示，更紧凑清晰</li>
            <li>增加图表容器高度，提升数据可视化效果</li>
            <li>新增招银理财净值历史数据查询功能，支持查询最近10天净值</li>
            <li>净值走势图改为显示实际数据，缺失日期自动跳过</li>
            <li>优化净值走势图纵坐标显示，自动计算数据范围</li>
            <li>修复纵坐标标签重叠问题</li>
            <li>恢复基于puppeteer的爬虫功能，支持真实数据抓取</li>
            <li>数据存储迁移至SQLite，支持多设备数据同步</li>
            <li>新增用户注册与认证功能</li>
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
