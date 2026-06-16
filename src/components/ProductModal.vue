<script setup lang="ts">
import { ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import type { Product, ProductType } from '@/types'
import { PRODUCT_TYPE_OPTIONS } from '@/composables/useFinance'
import { DCA_CYCLE_OPTIONS } from '@/types'

const props = defineProps<{
  visible: boolean
  editProduct?: Product | null
  defaultType?: ProductType
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', data: { name: string; type: ProductType; note: string; code: string; holder: string; dcaAmount: number; dcaCycle: string }): void
}>()

const name = ref('')
const type = ref<ProductType>('fund')
const code = ref('')
const note = ref('')
const holder = ref('')
const dcaAmount = ref(0)
const dcaCycle = ref('')

watch(() => props.visible, (val) => {
  if (val && props.editProduct) {
    name.value = props.editProduct.name
    type.value = props.editProduct.type
    code.value = props.editProduct.code || ''
    note.value = props.editProduct.note
    holder.value = props.editProduct.holder || ''
    dcaAmount.value = props.editProduct.dcaAmount || 0
    dcaCycle.value = props.editProduct.dcaCycle || ''
  } else if (val) {
    name.value = ''
    type.value = props.defaultType || 'fund'
    code.value = ''
    note.value = ''
    holder.value = ''
    dcaAmount.value = 0
    dcaCycle.value = ''
  }
})

const handleSubmit = () => {
  if (!name.value.trim()) return
  emit('submit', { 
    name: name.value.trim(), 
    type: type.value, 
    note: note.value.trim(), 
    code: code.value.trim(),
    holder: holder.value.trim(),
    dcaAmount: dcaAmount.value,
    dcaCycle: dcaCycle.value
  })
}
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="visible" 
      class="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4"
      @mousedown.self="emit('close')"
    >
      <div class="bg-white rounded-t-xl md:rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 class="text-lg font-semibold text-gray-800">{{ editProduct ? '编辑产品' : '新增产品' }}</h2>
          <button 
            @click="emit('close')" 
            class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X class="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div class="p-5 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">产品名称</label>
            <input 
              v-model="name"
              type="text" 
              placeholder="请输入产品名称"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
            />
          </div>
          <div v-if="!props.defaultType">
            <label class="block text-sm font-medium text-gray-700 mb-2">产品类型</label>
            <select 
              v-model="type"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
            >
              <option v-for="option in PRODUCT_TYPE_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              产品代码
              <span class="text-xs text-gray-400 ml-1">（基金代码支持从天天基金网查询净值）</span>
            </label>
            <input 
              v-model="code"
              type="text" 
              placeholder="请输入产品代码"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">持有人</label>
            <input 
              v-model="holder"
              type="text" 
              placeholder="请输入持有人姓名"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
            />
          </div>
          <div class="flex space-x-4">
            <div class="flex-1">
              <label class="block text-sm font-medium text-gray-700 mb-2">定投金额</label>
              <input 
                v-model.number="dcaAmount"
                type="number" 
                min="0"
                placeholder="0"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
              />
            </div>
            <div class="flex-1">
              <label class="block text-sm font-medium text-gray-700 mb-2">定投周期</label>
              <select 
                v-model="dcaCycle"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
              >
                <option v-for="option in DCA_CYCLE_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">备注</label>
            <textarea 
              v-model="note"
              placeholder="请输入备注信息"
              rows="3"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all resize-none"
            ></textarea>
          </div>
        </div>
        <div class="flex justify-end space-x-3 p-5 border-t border-gray-200">
          <button 
            @click="emit('close')" 
            class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            取消
          </button>
          <button 
            @click="handleSubmit" 
            :disabled="!name.trim()"
            class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {{ editProduct ? '保存' : '添加' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
