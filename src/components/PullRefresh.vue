<script setup lang="ts">
import { ref, computed } from 'vue'
import { RefreshCw } from 'lucide-vue-next'

const props = defineProps<{
  disabled?: boolean
  pullThreshold?: number
  refreshText?: string
  pullingText?: string
  refreshingText?: string
}>()

const emit = defineEmits<{
  refresh: []
}>()

const scrollTop = ref(0)
const isPulling = ref(false)
const isRefreshing = ref(false)
const startY = ref(0)
const currentY = ref(0)

const pullThreshold = computed(() => props.pullThreshold || 80)
const progress = computed(() => Math.min(scrollTop.value / pullThreshold.value, 1))
const isReadyToRefresh = computed(() => scrollTop.value >= pullThreshold.value)

const handleTouchStart = (e: TouchEvent) => {
  if (props.disabled || isRefreshing.value) return
  startY.value = e.touches[0].clientY
  currentY.value = startY.value
}

const handleTouchMove = (e: TouchEvent) => {
  if (props.disabled || isRefreshing.value) return
  
  currentY.value = e.touches[0].clientY
  const delta = currentY.value - startY.value
  
  if (delta > 0 && window.scrollY === 0) {
    e.preventDefault()
    isPulling.value = true
    scrollTop.value = delta * 0.5
  }
}

const handleTouchEnd = () => {
  if (!isPulling.value || isRefreshing.value) return
  
  if (isReadyToRefresh.value) {
    scrollTop.value = 60
    isRefreshing.value = true
    emit('refresh')
  } else {
    scrollTop.value = 0
  }
  
  isPulling.value = false
}

const onRefreshComplete = () => {
  isRefreshing.value = false
  scrollTop.value = 0
}

defineExpose({ onRefreshComplete })
</script>

<template>
  <div 
    class="relative overflow-hidden"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <!-- 下拉指示器 -->
    <div 
      class="absolute top-0 left-0 right-0 flex flex-col items-center justify-center transition-all duration-300 ease-out pointer-events-none z-10"
      :style="{ height: scrollTop + 'px', opacity: scrollTop > 0 ? 1 : 0 }"
    >
      <div class="flex flex-col items-center">
        <div 
          class="relative w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-300"
          :class="{ 'rotate-180': isReadyToRefresh && !isRefreshing }"
        >
          <RefreshCw 
            class="w-5 h-5 text-primary-500 transition-all duration-300"
            :class="{ 'animate-spin': isRefreshing }"
            :style="{ transform: `rotate(${progress * 180}deg)` }"
          />
        </div>
        <span class="mt-2 text-[13px] text-apple-secondary">
          <template v-if="isRefreshing">
            {{ refreshingText || '刷新中...' }}
          </template>
          <template v-else-if="isReadyToRefresh">
            {{ refreshText || '释放刷新' }}
          </template>
          <template v-else>
            {{ pullingText || '下拉刷新' }}
          </template>
        </span>
      </div>
    </div>
    
    <!-- 内容区域 -->
    <div 
      class="transition-transform duration-300 ease-out"
      :style="{ transform: isRefreshing ? 'translateY(60px)' : 'translateY(0)' }"
    >
      <slot />
    </div>
  </div>
</template>