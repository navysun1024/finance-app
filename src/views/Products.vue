<script setup lang="ts">
import { ref, computed } from 'vue'
import { Plus, Edit2, Trash2, Search, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-vue-next'
import ProductModal from '@/components/ProductModal.vue'
import { useFinance } from '@/composables/useFinance'
import { useRouter } from 'vue-router'
import type { ProductType } from '@/types'
import { formatDate } from '@/utils/format'

const { products, addProduct, updateProduct, deleteProduct, calculatePosition, PRODUCT_TYPE_OPTIONS } = useFinance()
const router = useRouter()

const showModal = ref(false)
const editingProduct = ref<typeof products.value[0] | null>(null)
const searchQuery = ref('')
const filterType = ref<ProductType | 'all'>('all')

const sortKey = ref<'name' | 'marketValue' | 'annualRate' | 'profitRate' | 'holdingDays' | 'lastNavUpdateDate'>('name')
const sortOrder = ref<'asc' | 'desc'>('asc')

const filteredProducts = computed(() => {
  let result = [...products.value]
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(p => p.name.toLowerCase().includes(query) || p.note.toLowerCase().includes(query))
  }
  if (filterType.value !== 'all') {
    result = result.filter(p => p.type === filterType.value)
  }
  result.sort((a, b) => {
    const posA = calculatePosition(a)
    const posB = calculatePosition(b)
    let comparison = 0
    switch (sortKey.value) {
      case 'name':
        comparison = a.name.localeCompare(b.name, 'zh-CN')
        break
      case 'marketValue':
        comparison = (posA?.marketValue || 0) - (posB?.marketValue || 0)
        break
      case 'annualRate':
        comparison = (posA?.annualRate || 0) - (posB?.annualRate || 0)
        break
      case 'profitRate':
        comparison = (posA?.profitRate || 0) - (posB?.profitRate || 0)
        break
      case 'holdingDays':
        comparison = (posA?.holdingDays || 0) - (posB?.holdingDays || 0)
        break
      case 'lastNavUpdateDate':
        comparison = (posA?.lastNavUpdateDate || 0) - (posB?.lastNavUpdateDate || 0)
        break
    }
    return sortOrder.value === 'asc' ? comparison : -comparison
  })
  return result
})

const handleSort = (key: typeof sortKey.value) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortOrder.value = 'asc'
  }
}

const getProductTypeLabel = (type: string) => {
  const option = PRODUCT_TYPE_OPTIONS.find(o => o.value === type)
  return option ? option.label : type
}

const getProductTypeColor = (type: string) => {
  const option = PRODUCT_TYPE_OPTIONS.find(o => o.value === type)
  return option ? option.color : '#6b7280'
}

const getPosition = (productId: string) => {
  const product = products.value.find(p => p.id === productId)
  return product ? calculatePosition(product) : null
}

const handleAdd = () => {
  editingProduct.value = null
  showModal.value = true
}

const handleEdit = (product: typeof products.value[0]) => {
  editingProduct.value = product
  showModal.value = true
}

const handleDelete = (id: string) => {
  if (confirm('确定要删除这个产品吗？相关的交易记录也会被删除。')) {
    deleteProduct(id)
  }
}

const handleSubmit = (data: { name: string; type: ProductType; note: string; code: string; holder: string }) => {
  if (editingProduct.value) {
    updateProduct(editingProduct.value.id, data.name, data.type, data.note, data.code, data.holder)
  } else {
    addProduct(data.name, data.type, data.note, data.code, data.holder)
  }
  showModal.value = false
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl font-bold text-gray-800">产品列表</h2>
        <p class="text-gray-500 text-sm mt-1">共 {{ products.length }} 个理财产品</p>
      </div>
      <button 
        @click="handleAdd"
        class="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
      >
        <Plus class="w-5 h-5" />
        <span>新增产品</span>
      </button>
    </div>
    
    <div class="flex flex-col sm:flex-row gap-4">
      <div class="relative flex-1">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input 
          v-model="searchQuery"
          type="text" 
          placeholder="搜索产品名称或备注..."
          class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
        />
      </div>
      <select 
        v-model="filterType"
        class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
      >
        <option value="all">全部类型</option>
        <option v-for="option in PRODUCT_TYPE_OPTIONS" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>
    
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th 
                class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100/80 transition-colors select-none"
                @click="handleSort('name')"
              >
                <div class="flex items-center space-x-1">
                  <span>产品</span>
                  <ArrowUpDown v-if="sortKey !== 'name'" class="w-3 h-3 text-gray-400" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-600" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-600" />
                </div>
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">持有人</th>
              <th 
                class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100/80 transition-colors select-none"
                @click="handleSort('marketValue')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>市值</span>
                  <ChevronsUpDown v-if="sortKey !== 'marketValue'" class="w-3 h-3 text-gray-400" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-600" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-600" />
                </div>
              </th>
              <th 
                class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100/80 transition-colors select-none"
                @click="handleSort('annualRate')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>年化</span>
                  <ArrowUpDown v-if="sortKey !== 'annualRate'" class="w-3 h-3 text-gray-400" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-600" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-600" />
                </div>
              </th>
              <th 
                class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100/80 transition-colors select-none"
                @click="handleSort('holdingDays')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>持有</span>
                  <ArrowUpDown v-if="sortKey !== 'holdingDays'" class="w-3 h-3 text-gray-400" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-600" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-600" />
                </div>
              </th>
              <th 
                class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100/80 transition-colors select-none"
                @click="handleSort('profitRate')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>收益率</span>
                  <ArrowUpDown v-if="sortKey !== 'profitRate'" class="w-3 h-3 text-gray-400" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-600" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-600" />
                </div>
              </th>
              <th 
                class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100/80 transition-colors select-none"
                @click="handleSort('lastNavUpdateDate')"
              >
                <div class="flex items-center justify-end space-x-1">
                  <span>净值更新</span>
                  <ArrowUpDown v-if="sortKey !== 'lastNavUpdateDate'" class="w-3 h-3 text-gray-400" />
                  <ArrowUp v-else-if="sortOrder === 'asc'" class="w-3 h-3 text-primary-600" />
                  <ArrowDown v-else class="w-3 h-3 text-primary-600" />
                </div>
              </th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr 
              v-for="product in filteredProducts" 
              :key="product.id" 
              class="hover:bg-gray-50 cursor-pointer"
              @click="router.push({ name: 'product-detail', params: { id: product.id } })"
            >
              <td class="px-4 py-4">
                <div class="flex items-center space-x-3">
                  <div 
                    class="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold flex-shrink-0"
                    :style="{ backgroundColor: getProductTypeColor(product.type) }"
                  >
                    {{ product.name.charAt(0) }}
                  </div>
                  <div class="min-w-0">
                    <h3 class="font-semibold text-gray-800 truncate">{{ product.name }}</h3>
                    <div class="flex items-center space-x-2 mt-0.5">
                      <span 
                        class="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                        :style="{ backgroundColor: getProductTypeColor(product.type) + '20', color: getProductTypeColor(product.type) }"
                      >
                        {{ getProductTypeLabel(product.type) }}
                      </span>
                      <span v-if="product.code" class="text-xs font-mono text-gray-500">代码: {{ product.code }}</span>
                    </div>
                  </div>
                </div>
              </td>
              <td class="px-4 py-4 whitespace-nowrap">
                <p class="text-gray-600">{{ product.holder || '-' }}</p>
              </td>
              <td class="px-4 py-4 text-right whitespace-nowrap">
                <template v-if="getPosition(product.id)">
                  <p class="font-semibold text-gray-800">{{ Math.round((getPosition(product.id) as any).marketValue).toLocaleString() }} 元</p>
                </template>
                <template v-else>
                  <p class="text-sm text-gray-400">-</p>
                </template>
              </td>
              <td class="px-4 py-4 text-right whitespace-nowrap">
                <template v-if="getPosition(product.id)">
                  <p 
                    class="font-semibold"
                    :class="(getPosition(product.id) as any).annualRate >= 0 ? 'text-red-600' : 'text-green-600'"
                  >
                    {{ (getPosition(product.id) as any).annualRate >= 0 ? '+' : '' }}{{ (getPosition(product.id) as any).annualRate.toFixed(2) }}%
                  </p>
                </template>
                <template v-else>
                  <p class="text-sm text-gray-400">-</p>
                </template>
              </td>
              <td class="px-4 py-4 text-right whitespace-nowrap">
                <template v-if="getPosition(product.id)">
                  <p class="font-semibold text-gray-800">{{ (getPosition(product.id) as any).holdingDays }} 天</p>
                </template>
                <template v-else>
                  <p class="text-sm text-gray-400">-</p>
                </template>
              </td>
              <td class="px-4 py-4 text-right whitespace-nowrap">
                <template v-if="getPosition(product.id)">
                  <p 
                    class="font-semibold"
                    :class="(getPosition(product.id) as any).profitRate >= 0 ? 'text-red-600' : 'text-green-600'"
                  >
                    {{ (getPosition(product.id) as any).profitRate >= 0 ? '+' : '' }}{{ (getPosition(product.id) as any).profitRate.toFixed(2) }}%
                  </p>
                </template>
                <template v-else>
                  <p class="text-sm text-gray-400">-</p>
                </template>
              </td>
              <td class="px-4 py-4 text-right whitespace-nowrap">
                <template v-if="getPosition(product.id) && (getPosition(product.id) as any).lastNavUpdateDate > 0">
                  <p class="font-semibold text-gray-800 text-sm">
                    {{ formatDate((getPosition(product.id) as any).lastNavUpdateDate) }}
                  </p>
                </template>
                <template v-else>
                  <p class="text-sm text-gray-400">暂无记录</p>
                </template>
              </td>
              <td class="px-4 py-4 text-center whitespace-nowrap" @click.stop>
                <div class="flex items-center justify-center space-x-2">
                  <button 
                    @click="handleEdit(product)"
                    class="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                  >
                    <Edit2 class="w-4 h-4" />
                  </button>
                  <button 
                    @click="handleDelete(product.id)"
                    class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="filteredProducts.length === 0" class="p-8 text-center">
        <p class="text-gray-500">暂无产品数据</p>
        <p class="text-gray-400 text-sm mt-2">点击上方按钮添加理财产品</p>
      </div>
    </div>
    
    <ProductModal 
      :visible="showModal"
      :edit-product="editingProduct"
      @close="showModal = false"
      @submit="handleSubmit"
    />
  </div>
</template>
