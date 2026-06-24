<script setup lang="ts">
import { ref, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
  title?: string
  maxHeight?: string
  closeOnOverlayClick?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const isAnimating = ref(false)
const contentRef = ref<HTMLElement | null>(null)

watch(() => props.visible, (newVal) => {
  if (newVal) {
    isAnimating.value = true
    document.body.style.overflow = 'hidden'
  } else {
    setTimeout(() => {
      document.body.style.overflow = ''
    }, 300)
  }
})

const handleOverlayClick = (e: MouseEvent) => {
  if (props.closeOnOverlayClick !== false && e.target === e.currentTarget) {
    emit('close')
  }
}

const handleClose = () => {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="bottom-sheet">
      <div 
        v-if="visible" 
        class="fixed inset-0 z-50 flex flex-col items-center justify-end"
        @click="handleOverlayClick"
      >
        <!-- Backdrop -->
        <div 
          class="absolute inset-0 bg-black/50 transition-opacity duration-300"
          :class="isAnimating ? 'opacity-100' : 'opacity-0'"
        />
        
        <!-- Sheet Content -->
        <div 
          ref="contentRef"
          class="relative w-full bg-white rounded-t-3xl shadow-apple-xl overflow-hidden transition-transform duration-300 ease-out"
          :class="isAnimating ? 'translate-y-0' : 'translate-y-full'"
          :style="{ maxHeight: maxHeight || '85vh' }"
        >
          <!-- Drag Handle -->
          <div class="flex justify-center pt-3 pb-2">
            <div class="w-10 h-1.5 bg-apple-border/50 rounded-full" />
          </div>
          
          <!-- Header -->
          <div v-if="title || $slots.header" class="flex items-center justify-between px-5 py-3 border-b border-apple-border/30">
            <slot name="header">
              <h3 class="text-lg font-semibold text-apple-text">{{ title }}</h3>
            </slot>
            <button 
              @click="handleClose"
              class="touch-target flex items-center justify-center text-apple-secondary hover:text-apple-text transition-colors"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
          
          <!-- Body -->
          <div class="overflow-y-auto" :style="{ maxHeight: maxHeight ? `calc(${maxHeight} - 80px)` : 'calc(85vh - 80px)' }">
            <slot />
          </div>
          
          <!-- Footer -->
          <div v-if="$slots.footer" class="px-5 py-4 border-t border-apple-border/30 bg-white">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.bottom-sheet-enter-active,
.bottom-sheet-leave-active {
  transition: opacity 0.3s ease;
}

.bottom-sheet-enter-from,
.bottom-sheet-leave-to {
  opacity: 0;
}

.bottom-sheet-enter-active > div:last-child,
.bottom-sheet-leave-active > div:last-child {
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}

.bottom-sheet-enter-from > div:last-child,
.bottom-sheet-leave-to > div:last-child {
  transform: translateY(100%);
}
</style>