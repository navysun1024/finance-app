<script setup lang="ts">
import { ref, computed } from 'vue'
import { X, Upload, AlertTriangle, CheckCircle } from 'lucide-vue-next'
import { parseFundTable } from '@/utils/importParser'
import { generateId } from '@/utils/storage'

const props = defineProps<{
  visible: boolean
  products: { id: string; name: string; code: string }[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'import', data: { products: any[]; transactions: any[] }): void
}>()

const rawText = ref('')
const previewData = computed(() => {
  if (!rawText.value.trim()) return null
  return parseFundTable(rawText.value)
})

const importCount = computed(() => previewData.value?.rows.length || 0)
const errorCount = computed(() => previewData.value?.errors.length || 0)

const handleImport = () => {
  if (!previewData.value || previewData.value.rows.length === 0) return
  const newProducts: any[] = []
  const newTransactions: any[] = []
  
  for (const row of previewData.value.rows) {
    let product = props.products.find(p => p.code === row.fundCode)
    
    if (!product) {
      product = newProducts.find(p => p.code === row.fundCode)
    }
    
    if (!product) {
      const productId = generateId()
      product = { id: productId, name: row.fundName, code: row.fundCode }
      newProducts.push({
        id: productId,
        name: row.fundName,
        type: 'fund',
        code: row.fundCode,
        note: '',
        createdAt: Date.now()
      })
    }
    
    const dateParts = row.date.split(/[-/]/)
    const dateTimestamp = new Date(
      parseInt(dateParts[0]),
      parseInt(dateParts[1]) - 1,
      parseInt(dateParts[2])
    ).getTime()
    
    newTransactions.push({
      id: generateId(),
      productId: product.id,
      productCode: row.fundCode,
      type: 'buy',
      date: dateTimestamp,
      amount: row.amount,
      price: row.nav,
      shares: row.shares,
      fee: row.fee,
      note: `批量导入 - ${row.fundName}`
    })
  }
  
  emit('import', { products: newProducts, transactions: newTransactions })
}
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="visible" 
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      @mousedown.self="emit('close')"
    >
      <div class="bg-white rounded-apple-lg shadow-apple-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div class="flex items-center justify-between p-5 border-b border-apple-border/50">
          <div class="flex items-center space-x-2">
            <Upload class="w-5 h-5 text-primary-500" />
            <h2 class="text-lg font-semibold text-apple-text">批量导入交易</h2>
          </div>
          <button 
            @click="emit('close')" 
            class="p-2 hover:bg-black/5 rounded-full transition-colors"
          >
            <X class="w-5 h-5 text-apple-secondary" />
          </button>
        </div>
        
        <div class="p-5 overflow-y-auto space-y-4 flex-1">
          <div class="bg-primary-50 border border-primary-200 rounded-apple p-4 text-sm text-primary-700">
            <p class="font-medium mb-1">使用说明</p>
            <p>从天天基金网或银行交易记录中复制表格数据，粘贴到下方输入框中。</p>
            <p class="mt-1">支持格式：确认日期、基金代码、基金简称、业务类型、确认状态、确认份额、确认金额、手续费、确认净值
            <br>支持业务类型：买基金、定时定额投资（均作为买入处理）</p>
          </div>
          
          <div>
            <label class="block text-[11px] font-medium text-apple-secondary uppercase tracking-wider mb-2">粘贴交易数据</label>
            <textarea 
              v-model="rawText"
              placeholder="在此粘贴基金交易记录表格数据..."
              rows="8"
              class="glass-input w-full px-4 py-3 rounded-apple outline-none font-mono text-sm resize-none"
            ></textarea>
          </div>
          
          <div v-if="previewData">
            <div class="flex items-center space-x-4 mb-3">
              <div class="flex items-center space-x-1 text-sm text-loss">
                <CheckCircle class="w-4 h-4" />
                <span>可导入 {{ importCount }} 条</span>
              </div>
              <div v-if="errorCount > 0" class="flex items-center space-x-1 text-sm text-yellow-600">
                <AlertTriangle class="w-4 h-4" />
                <span>跳过 {{ errorCount }} 条</span>
              </div>
            </div>
            
            <div class="glass-card overflow-hidden">
              <table class="w-full text-sm apple-table">
                <thead>
                  <tr>
                    <th class="px-3 py-2.5 text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider">日期</th>
                    <th class="px-3 py-2.5 text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider">基金代码</th>
                    <th class="px-3 py-2.5 text-left text-[11px] font-semibold text-apple-secondary uppercase tracking-wider">基金名称</th>
                    <th class="px-3 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider">金额</th>
                    <th class="px-3 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider">份额</th>
                    <th class="px-3 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider">净值</th>
                    <th class="px-3 py-2.5 text-right text-[11px] font-semibold text-apple-secondary uppercase tracking-wider">手续费</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-apple-border/50">
                  <tr v-for="(row, index) in previewData.rows" :key="index">
                    <td class="px-3 py-2 whitespace-nowrap text-apple-text">{{ row.date }}</td>
                    <td class="px-3 py-2 whitespace-nowrap font-mono text-apple-text">{{ row.fundCode }}</td>
                    <td class="px-3 py-2 text-apple-text">{{ row.fundName }}</td>
                    <td class="px-3 py-2 text-right whitespace-nowrap text-apple-text">{{ row.amount.toFixed(2) }}</td>
                    <td class="px-3 py-2 text-right whitespace-nowrap text-apple-secondary">{{ row.shares.toFixed(2) }}</td>
                    <td class="px-3 py-2 text-right whitespace-nowrap text-apple-secondary">{{ row.nav.toFixed(4) }}</td>
                    <td class="px-3 py-2 text-right whitespace-nowrap text-apple-secondary">{{ row.fee.toFixed(2) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div v-if="previewData.errors.length > 0" class="mt-3">
              <p class="text-sm font-medium text-yellow-600 mb-1">跳过记录：</p>
              <ul class="space-y-1">
                <li v-for="(err, index) in previewData.errors" :key="index" class="text-xs text-apple-secondary">
                  {{ err }}
                </li>
              </ul>
            </div>
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
            @click="handleImport" 
            :disabled="!previewData || previewData.rows.length === 0"
            class="apple-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload class="w-4 h-4" />
            <span>确认导入 {{ importCount > 0 ? `(${importCount}条)` : '' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>