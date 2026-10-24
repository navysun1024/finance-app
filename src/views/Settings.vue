<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Download, Upload, Trash2, AlertCircle, Clock, Play, Database, RefreshCw, Lock } from 'lucide-vue-next'
import { exportData, importData, clearAllData, changePassword } from '@/utils/storage'
import { useFinance } from '@/composables/useFinance'
import { exportToExcel } from '@/utils/excel'
import { INDEX_DEFINITIONS } from '@/utils/indexApi'

const importFile = ref<HTMLInputElement | null>(null)
const showResetConfirm = ref(false)
const message = ref('')
const messageType = ref<'success' | 'error'>('success')

// 调度器状态
const schedulerStatus = ref<any>(null)
const loadingScheduler = ref(false)
const manualRunning = ref(false)

// 业绩基准数据状态
const indexStatus = ref<any[]>([])
const loadingIndex = ref(false)
const refreshRunning = ref(false)

const { products, transactions, calculatePosition, refresh } = useFinance()

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

// 获取业绩基准数据状态
const fetchIndexStatus = async () => {
  loadingIndex.value = true
  try {
    const res = await fetch('/api/index/status')
    const data = await res.json()
    if (data.success) {
      // 把 code 映射到名称，按 INDEX_DEFINITIONS 顺序 + DB 里存在的 code 合并排序
      const nameMap = Object.fromEntries(INDEX_DEFINITIONS.map(d => [d.code, d]))
      const enriched = (data.data || []).map((r: any) => ({
        ...r,
        name: nameMap[r.code]?.name || r.code,
        shortName: nameMap[r.code]?.shortName || r.code,
      }))
      // 排序：先按 INDEX_DEFINITIONS 里的顺序，再把不在里面的放后面
      const defOrder = new Map(INDEX_DEFINITIONS.map((d, i) => [d.code, i]))
      enriched.sort((a: any, b: any) => {
        const ai = (defOrder.get(a.code) ?? 999) as number
        const bi = (defOrder.get(b.code) ?? 999) as number
        return ai - bi
      })
      indexStatus.value = enriched
    }
  } catch {
    indexStatus.value = []
  } finally {
    loadingIndex.value = false
  }
}

// 手动刷新业绩基准数据
const handleRefreshIndex = async () => {
  refreshRunning.value = true
  try {
    const res = await fetch('/api/index/refresh', { method: 'POST' })
    const data = await res.json()
    if (data.success) {
      const s = data.summary
      showMessage(`基准数据刷新完成: 成功 ${s.success}, 失败 ${s.failed}`, s.failed > 0 ? 'error' : 'success')
    } else {
      showMessage('刷新失败: ' + (data.error || '未知错误'), 'error')
    }
    await fetchIndexStatus()
  } catch (e: any) {
    showMessage('请求失败: ' + e.message, 'error')
  } finally {
    refreshRunning.value = false
  }
}

// 数据源标签
const sourceLabel = (source: string) => {
  const map: Record<string, string> = { chinabond: '中国债券信息网', csindex: '中证指数官网', tencent: '腾讯' }
  return map[source] || source || '-'
}

// 格式化更新时间
const formatUpdatedAt = (ts: number | null) => {
  if (!ts) return '-'
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(() => {
  fetchSchedulerStatus()
  fetchIndexStatus()
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
    // 为每个产品计算完整的 position（不过滤 totalShares > 0），
    // 确保已清仓产品的已实现盈亏也能正确导出
    const allPositions = products.value.map(p => calculatePosition(p))
    await exportToExcel(
      products.value,
      allPositions,
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

// 修改密码
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const changingPassword = ref(false)

const handleChangePassword = async () => {
  if (!currentPassword.value) return showMessage('请输入当前密码', 'error')
  if (newPassword.value.length < 8) return showMessage('新密码至少8个字符', 'error')
  if (newPassword.value !== confirmPassword.value) return showMessage('两次输入的新密码不一致', 'error')
  if (newPassword.value === currentPassword.value) return showMessage('新密码不能与当前密码相同', 'error')

  changingPassword.value = true
  try {
    await changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    showMessage('密码修改成功', 'success')
  } catch (e: any) {
    showMessage(e.message || '修改密码失败', 'error')
  } finally {
    changingPassword.value = false
  }
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
    
    <!-- 账户安全：修改密码 -->
    <div class="glass-card p-6">
      <div class="flex items-start space-x-4">
        <div class="w-11 h-11 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
          <Lock class="w-5 h-5 text-white" />
        </div>
        <div class="flex-1">
          <h3 class="text-[15px] font-semibold text-apple-text">账户安全</h3>
          <p class="text-[13px] text-apple-secondary mt-1">修改登录密码，修改成功后其它设备需重新登录</p>
        </div>
      </div>
      <form @submit.prevent="handleChangePassword" class="mt-4 space-y-3">
        <div>
          <label class="block text-[12px] font-semibold text-apple-secondary mb-1.5">当前密码</label>
          <input
            v-model="currentPassword"
            type="password"
            autocomplete="current-password"
            placeholder="请输入当前密码"
            class="glass-input w-full px-4 py-2.5 rounded-apple outline-none text-[14px]"
          />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-[12px] font-semibold text-apple-secondary mb-1.5">新密码</label>
            <input
              v-model="newPassword"
              type="password"
              autocomplete="new-password"
              placeholder="至少 8 个字符"
              class="glass-input w-full px-4 py-2.5 rounded-apple outline-none text-[14px]"
            />
          </div>
          <div>
            <label class="block text-[12px] font-semibold text-apple-secondary mb-1.5">确认新密码</label>
            <input
              v-model="confirmPassword"
              type="password"
              autocomplete="new-password"
              placeholder="请再次输入新密码"
              class="glass-input w-full px-4 py-2.5 rounded-apple outline-none text-[14px]"
            />
          </div>
        </div>
        <button
          type="submit"
          :disabled="changingPassword"
          class="apple-btn-primary px-5 py-2 text-[13px] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {{ changingPassword ? '提交中...' : '修改密码' }}
        </button>
      </form>
    </div>

    <div class="glass-card p-6">
      <div class="flex items-start space-x-4">
        <div class="w-11 h-11 bg-primary-500 rounded-xl flex items-center justify-center flex-shrink-0">
          <Download class="w-5 h-5 text-white" />
        </div>
        <div class="flex-1">
          <h3 class="text-[15px] font-semibold text-apple-text">数据备份与迁移</h3>
          <p class="text-[13px] text-apple-secondary mt-1">导出/导入数据，支持 JSON 备份和 Excel 报表</p>
        </div>
      </div>
      <div class="mt-4 space-y-2">
        <div class="flex items-center justify-between py-2 px-3 rounded-apple bg-black/[0.025] dark:bg-white/[0.04]">
          <div>
            <p class="text-[13px] font-medium text-apple-text">导出为 JSON</p>
            <p class="text-[11px] text-apple-secondary mt-0.5">完整备份，可迁移到其他设备</p>
          </div>
          <button @click="handleExport" class="apple-btn-primary px-4 py-1.5 text-[12px]">导出</button>
        </div>
        <div class="flex items-center justify-between py-2 px-3 rounded-apple bg-black/[0.025] dark:bg-white/[0.04]">
          <div>
            <p class="text-[13px] font-medium text-apple-text">导出投资明细 Excel</p>
            <p class="text-[11px] text-apple-secondary mt-0.5">产品汇总、交易明细、投资汇总</p>
          </div>
          <button @click="handleExportExcel" class="apple-btn-primary px-4 py-1.5 text-[12px]">导出Excel</button>
        </div>
        <div class="flex items-center justify-between py-2 px-3 rounded-apple bg-black/[0.025] dark:bg-white/[0.04]">
          <div>
            <p class="text-[13px] font-medium text-apple-text">导入 JSON 数据</p>
            <p class="text-[11px] text-apple-secondary mt-0.5">从之前导出的备份文件恢复</p>
          </div>
          <input ref="importFile" type="file" accept=".json" @change="handleFileImport" class="hidden" id="import-file" />
          <label for="import-file" class="inline-flex items-center space-x-1.5 px-4 py-1.5 glass-btn rounded-full cursor-pointer text-[12px] font-medium">
            <Upload class="w-3.5 h-3.5 text-apple-secondary" />
            <span>选择文件</span>
          </label>
        </div>
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
            每天自动更新权益与理财产品净值
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

    <!-- 业绩基准数据状态 -->
    <div class="glass-card p-6">
      <div class="flex items-start space-x-4">
        <div class="w-11 h-11 bg-indigo-500 rounded-xl flex items-center justify-center flex-shrink-0">
          <Database class="w-5 h-5 text-white" />
        </div>
        <div class="flex-1">
          <h3 class="text-[15px] font-semibold text-apple-text">业绩基准数据</h3>
          <p class="text-[13px] text-apple-secondary mt-1">持久化存储的指数行情，用于产品业绩基准对比</p>
        </div>
        <button
          @click="handleRefreshIndex"
          :disabled="refreshRunning"
          class="apple-btn-primary flex items-center space-x-2 px-4 py-2 text-[13px] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': refreshRunning }" />
          <span>{{ refreshRunning ? '刷新中...' : '刷新' }}</span>
        </button>
      </div>

      <div v-if="loadingIndex" class="mt-4 text-[13px] text-apple-secondary">加载中...</div>
      <div v-else-if="indexStatus.length === 0" class="mt-4 text-[13px] text-apple-secondary">暂无基准数据</div>
      <div v-else class="mt-4 space-y-2.5">
        <div
          v-for="item in indexStatus"
          :key="item.code"
          class="flex items-center py-2 px-3 rounded-apple bg-black/[0.025] dark:bg-white/[0.04]"
        >
          <!-- 左侧：名称 + 代码 -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center space-x-2">
              <span class="text-[13px] font-medium text-apple-text truncate">{{ item.name }}</span>
              <span class="text-[11px] text-apple-secondary font-mono bg-black/[0.05] dark:bg-white/[0.06] px-1.5 py-0.5 rounded">{{ item.code }}</span>
            </div>
            <div class="flex items-center space-x-3 mt-1 text-[11px] text-apple-secondary">
              <span>{{ sourceLabel(item.source) }}</span>
              <span>·</span>
              <span>{{ item.count?.toLocaleString() || 0 }} 条</span>
            </div>
          </div>
          <!-- 右侧：日期范围 + 更新时间 -->
          <div class="text-right flex-shrink-0 ml-3">
            <div class="text-[12px] text-apple-text font-medium">
              {{ item.startDate || '-' }} ~ {{ item.endDate || '-' }}
            </div>
            <div class="text-[11px] text-apple-secondary mt-0.5">更新 {{ formatUpdatedAt(item.updatedAt) }}</div>
          </div>
        </div>
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
