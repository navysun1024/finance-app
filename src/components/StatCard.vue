<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  title: string
  value: string | number
  change?: number
  icon: Component
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple'
}>()

const iconBgColors: Record<string, string> = {
  blue: 'bg-primary-50 text-primary-500',
  green: 'bg-loss/10 text-loss',
  red: 'bg-profit/10 text-profit',
  yellow: 'bg-yellow-50 text-yellow-500',
  purple: 'bg-fixed-income/10 text-fixed-income'
}
</script>

<template>
  <div class="glass-card px-5 py-3">
    <div class="flex items-start justify-between">
      <div class="flex-1 min-w-0">
        <p class="text-[11px] text-apple-secondary uppercase tracking-wider font-medium mb-1">{{ title }}</p>
        <p class="text-[22px] font-semibold text-apple-text tracking-tight truncate leading-tight">{{ value }}</p>
        <p v-if="change !== undefined" :class="['text-[12px] mt-1 font-semibold tracking-tight', change >= 0 ? 'text-profit' : 'text-loss']">
          {{ change >= 0 ? '+' : '' }}{{ change.toFixed(2) }}%
        </p>
      </div>
      <div :class="['w-10 h-10 rounded-apple flex items-center justify-center flex-shrink-0 ml-3', iconBgColors[color || 'blue']]">
        <component :is="icon" class="w-[18px] h-[18px]" />
      </div>
    </div>
  </div>
</template>
