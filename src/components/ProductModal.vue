<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { X } from 'lucide-vue-next'
import type { Product, ProductType, NavSource, InterestMethod } from '@/types'
import { PRODUCT_TYPE_OPTIONS } from '@/composables/useFinance'
import { DCA_CYCLE_OPTIONS, NAV_SOURCE_OPTIONS, INTEREST_METHOD_OPTIONS, DURATION_OPTIONS } from '@/types'
import { INDEX_DEFINITIONS } from '@/utils/indexApi'
import { parseBenchmarkFormula, serializeBenchmarkFormula, type BenchmarkComponent } from '@/utils/benchmark'

const props = defineProps<{
  visible: boolean
  editProduct?: Product | null
  defaultType?: ProductType
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', data: { name: string; type: ProductType; note: string; code: string; holder: string; dcaAmount: number; dcaCycle: string; navSource: NavSource; holdingTerm: string; benchmarkEnabled: boolean; benchmarkFormula: string; interestRate: number; durationMonths: number; minAmount: number; maturityDate: string; interestMethod: InterestMethod | string; bankName: string }): void
}>()

const name = ref('')
const type = ref<ProductType>('equity')
const code = ref('')
const note = ref('')
const holder = ref('')
const dcaAmount = ref(0)
const dcaCycle = ref('')
const navSource = ref<NavSource>('')
const holdingTerm = ref('')
const benchmarkEnabled = ref(false)
const benchmarkComponents = ref<BenchmarkComponent[]>([])
// 定期存款特有字段
const interestRate = ref(0)
const durationMonths = ref(12)
const minAmount = ref(0)
const maturityDate = ref('')
const interestMethod = ref<InterestMethod | string>('maturity')
const bankName = ref('')

// 持有期限常用预设选项
const HOLDING_TERM_OPTIONS = [
  { value: '', label: '自定义/不填写' },
  { value: '7天', label: '7天' },
  { value: '14天', label: '14天' },
  { value: '30天', label: '30天' },
  { value: '60天', label: '60天' },
  { value: '90天', label: '90天' },
  { value: '180天', label: '180天' },
  { value: '270天', label: '270天' },
  { value: '365天', label: '365天' },
  { value: '1年', label: '1年' },
  { value: '2年', label: '2年' },
  { value: '3年', label: '3年' },
  { value: '5年', label: '5年' },
  { value: '无固定期限', label: '无固定期限' }
]

const availableNavSources = computed(() => {
  return NAV_SOURCE_OPTIONS.filter(opt => opt.applicableTypes.includes(type.value))
})

watch(() => props.visible, (val) => {
  if (val && props.editProduct) {
    name.value = props.editProduct.name
    type.value = props.editProduct.type
    code.value = props.editProduct.code || ''
    note.value = props.editProduct.note
    holder.value = props.editProduct.holder || ''
    dcaAmount.value = props.editProduct.dcaAmount || 0
    dcaCycle.value = props.editProduct.dcaCycle || ''
    navSource.value = props.editProduct.navSource || (props.editProduct.type === 'equity' || props.editProduct.type === 'fund' ? 'tiantian' : '')
    holdingTerm.value = (props.editProduct as any).holdingTerm || ''
    benchmarkEnabled.value = (props.editProduct as any).benchmarkEnabled || false
    benchmarkComponents.value = parseBenchmarkFormula((props.editProduct as any).benchmarkFormula || '')
    // 定期存款特有字段
    interestRate.value = (props.editProduct.interestRate as number) || 0
    durationMonths.value = (props.editProduct.durationMonths as number) || 12
    minAmount.value = (props.editProduct.minAmount as number) || 0
    maturityDate.value = props.editProduct.maturityDate || ''
    interestMethod.value = (props.editProduct.interestMethod as InterestMethod) || 'maturity'
    bankName.value = props.editProduct.bankName || ''
  } else if (val) {
    name.value = ''
    type.value = props.defaultType || 'equity'
    code.value = ''
    note.value = ''
    holder.value = ''
    dcaAmount.value = 0
    dcaCycle.value = ''
    navSource.value = (props.defaultType || 'equity') === 'equity' ? 'tiantian' : ''
    holdingTerm.value = ''
    benchmarkEnabled.value = false
    benchmarkComponents.value = []
    // 定期存款特有字段默认值
    interestRate.value = 0
    durationMonths.value = 12
    minAmount.value = 0
    maturityDate.value = ''
    interestMethod.value = 'maturity'
    bankName.value = ''
  }
})

watch(type, (newType) => {
  const available = NAV_SOURCE_OPTIONS.filter(opt => opt.applicableTypes.includes(newType))
  if (!available.some(opt => opt.value === navSource.value)) {
    navSource.value = available[0]?.value || ''
  }
  // 切换为非固收时清空持有期限
  if (newType === 'equity' || newType === 'fund') {
    holdingTerm.value = ''
  }
})

const benchmarkFormulaPreview = computed(() => {
  return serializeBenchmarkFormula(benchmarkComponents.value)
})

const toggleBenchmarkIndex = (indexCode: string) => {
  const idx = benchmarkComponents.value.findIndex(c => c.indexCode === indexCode)
  if (idx !== -1) {
    benchmarkComponents.value.splice(idx, 1)
  } else {
    const def = INDEX_DEFINITIONS.find(d => d.code === indexCode)
    benchmarkComponents.value.push({
      indexCode,
      indexName: def?.name || indexCode,
      weight: 0.5,
    })
  }
}

const isBenchmarkIndexSelected = (indexCode: string) => {
  return benchmarkComponents.value.some(c => c.indexCode === indexCode)
}

const updateBenchmarkWeight = (indexCode: string, weight: number) => {
  const comp = benchmarkComponents.value.find(c => c.indexCode === indexCode)
  if (comp) {
    comp.weight = Math.max(0, Math.min(100, weight)) / 100
  }
}

const getBenchmarkWeight = (indexCode: string): number => {
  const comp = benchmarkComponents.value.find(c => c.indexCode === indexCode)
  return comp ? Math.round(comp.weight * 100) : 50
}

const handleSubmit = () => {
  if (!name.value.trim()) return
  emit('submit', { 
    name: name.value.trim(), 
    type: type.value, 
    note: note.value.trim(), 
    code: code.value.trim(),
    holder: holder.value.trim(),
    dcaAmount: dcaAmount.value,
    dcaCycle: dcaCycle.value,
    navSource: navSource.value,
    holdingTerm: holdingTerm.value.trim(),
    benchmarkEnabled: benchmarkEnabled.value,
    benchmarkFormula: benchmarkEnabled.value ? benchmarkFormulaPreview.value : '',
    interestRate: interestRate.value,
    durationMonths: durationMonths.value,
    minAmount: minAmount.value,
    maturityDate: maturityDate.value,
    interestMethod: interestMethod.value,
    bankName: bankName.value.trim()
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
      <div class="bg-white rounded-t-apple-lg md:rounded-apple-lg shadow-apple-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between p-5 border-b border-apple-border/50">
          <h2 class="text-lg font-semibold text-apple-text">{{ editProduct ? '编辑产品' : '新增产品' }}</h2>
          <button 
            @click="emit('close')" 
            class="p-2 hover:bg-black/5 rounded-full transition-colors"
          >
            <X class="w-5 h-5 text-apple-secondary" />
          </button>
        </div>
        <div class="p-5 space-y-4">
          <div>
            <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">产品名称</label>
            <input 
              v-model="name"
              type="text" 
              placeholder="请输入产品名称"
              class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
            />
          </div>
          <div v-if="!props.defaultType">
            <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">产品类型</label>
            <select 
              v-model="type"
              class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
            >
              <option v-for="option in PRODUCT_TYPE_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
          <div v-if="type !== 'term_deposit'">
            <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">
              产品代码
              <span class="text-xs text-apple-secondary/70 normal-case tracking-normal ml-1">（权益代码支持从天天基金网查询净值）</span>
            </label>
            <input 
              v-model="code"
              type="text" 
              placeholder="请输入产品代码"
              class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
            />
          </div>
          <div v-if="type !== 'term_deposit'">
            <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">净值查询源</label>
            <select 
              v-model="navSource"
              class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
            >
              <option v-for="option in availableNavSources" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">持有人</label>
            <input 
              v-model="holder"
              type="text" 
              placeholder="请输入持有人姓名"
              class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
            />
          </div>
          <div v-if="type === 'fixed_income'">
            <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">持有期限</label>
            <div class="flex gap-2">
              <select 
                v-model="holdingTerm"
                class="glass-input w-1/2 px-3 py-2.5 rounded-xl outline-none"
              >
                <option v-for="opt in HOLDING_TERM_OPTIONS" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
              <input 
                v-model="holdingTerm"
                type="text" 
                placeholder="自定义，如: 90天"
                class="glass-input flex-1 px-4 py-2.5 rounded-xl outline-none"
              />
            </div>
          </div>
          <!-- 定期存款特有字段 -->
          <div v-if="type === 'term_deposit'" class="space-y-4 border-t border-apple-border/30 pt-4">
            <div class="flex space-x-4">
              <div class="flex-1">
                <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">年利率(%)</label>
                <input 
                  v-model.number="interestRate"
                  type="number" 
                  min="0"
                  step="0.01"
                  placeholder="如: 3.50"
                  class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
                />
              </div>
              <div class="flex-1">
                <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">存款期限</label>
                <select 
                  v-model.number="durationMonths"
                  class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
                >
                  <option v-for="opt in DURATION_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
            </div>
            <div class="flex space-x-4">
              <div class="flex-1">
                <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">本金</label>
                <input 
                  v-model.number="minAmount"
                  type="number" 
                  min="0"
                  placeholder="0"
                  class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
                />
              </div>
              <div class="flex-1">
                <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">付息方式</label>
                <select 
                  v-model="interestMethod"
                  class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
                >
                  <option v-for="opt in INTEREST_METHOD_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
            </div>
            <div class="flex space-x-4">
              <div class="flex-1">
                <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">到期日期</label>
                <input 
                  v-model="maturityDate"
                  type="date" 
                  class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
                />
              </div>
              <div class="flex-1">
                <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">开户银行</label>
                <input 
                  v-model="bankName"
                  type="text" 
                  placeholder="如: 工商银行"
                  class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
                />
              </div>
            </div>
          </div>
          <div v-if="type !== 'term_deposit'" class="flex space-x-4">
            <div class="flex-1">
              <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">定投金额</label>
              <input 
                v-model.number="dcaAmount"
                type="number" 
                min="0"
                placeholder="0"
                class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
              />
            </div>
            <div class="flex-1">
              <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">定投周期</label>
              <select 
                v-model="dcaCycle"
                class="glass-input w-full px-4 py-2.5 rounded-xl outline-none"
              >
                <option v-for="option in DCA_CYCLE_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>
          </div>
          <!-- 比较基准配置 -->
          <div v-if="type !== 'term_deposit'" class="border-t border-apple-border/30 pt-4">
            <div class="flex items-center justify-between">
              <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider">比较基准</label>
              <button
                type="button"
                @click="benchmarkEnabled = !benchmarkEnabled"
                :class="[
                  'relative w-10 h-6 rounded-full transition-colors duration-200',
                  benchmarkEnabled ? 'bg-primary-500' : 'bg-black/10'
                ]"
              >
                <span
                  :class="[
                    'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200',
                    benchmarkEnabled ? 'translate-x-4' : ''
                  ]"
                ></span>
              </button>
            </div>
            <div v-if="benchmarkEnabled" class="mt-3 space-y-2">
              <p class="text-xs text-apple-secondary">选择指数并设置权重，生成比较基准趋势线</p>
              <div v-for="idx in INDEX_DEFINITIONS" :key="idx.code" class="flex items-center gap-3 py-1.5">
                <button
                  type="button"
                  @click="toggleBenchmarkIndex(idx.code)"
                  :class="[
                    'w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors',
                    isBenchmarkIndexSelected(idx.code) ? 'bg-primary-500 border-primary-500' : 'border-apple-border'
                  ]"
                >
                  <svg v-if="isBenchmarkIndexSelected(idx.code)" class="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </button>
                <span class="text-sm text-apple-text flex-1">{{ idx.name }}</span>
                <div v-if="isBenchmarkIndexSelected(idx.code)" class="flex items-center gap-1">
                  <input
                    :value="getBenchmarkWeight(idx.code)"
                    @input="updateBenchmarkWeight(idx.code, parseFloat(($event.target as HTMLInputElement).value) || 0)"
                    type="number"
                    min="0"
                    max="100"
                    class="glass-input w-14 px-2 py-1 text-xs rounded-lg outline-none text-right"
                  />
                  <span class="text-xs text-apple-secondary">%</span>
                </div>
              </div>
              <div v-if="benchmarkComponents.length > 0" class="mt-2 px-3 py-2 bg-black/5 rounded-lg">
                <p class="text-[11px] text-apple-secondary">公式预览</p>
                <p class="text-xs font-mono text-apple-text mt-0.5">{{ benchmarkFormulaPreview }}</p>
              </div>
            </div>
          </div>
          <div>
            <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">备注</label>
            <textarea 
              v-model="note"
              placeholder="请输入备注信息"
              rows="3"
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
            :disabled="!name.trim()"
            class="apple-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ editProduct ? '保存' : '添加' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
