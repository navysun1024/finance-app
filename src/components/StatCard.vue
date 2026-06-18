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
  blue: 'bg-primary/10 text-primary',
  green: 'bg-loss/10 text-loss',
  red: 'bg-profit/10 text-profit',
  yellow: 'bg-amber-500/10 text-amber-600',
  purple: 'bg-fixed-income/10 text-fixed-income'
}

const iconBgColorsHover: Record<string, string> = {
  blue: 'hover:bg-primary/20',
  green: 'hover:bg-loss/20',
  red: 'hover:bg-profit/20',
  yellow: 'hover:bg-amber-500/20',
  purple: 'hover:bg-fixed-income/20'
}
</script>

<template>
  <div class="glass-card rounded-2xl p-4">
    <div class="flex items-start justify-between">
      <div class="flex-1 min-w-0">
        <p class="text-gray-500 text-xs mb-1">{{ title }}</p>
        <p class="text-xl font-bold text-gray-800 truncate">{{ value }}</p>
        <p v-if="change !== undefined" :class="['text-xs mt-1 font-semibold', change >= 0 ? 'text-profit' : 'text-loss']">
          {{ change >= 0 ? '+' : '' }}{{ change.toFixed(2) }}%
        </p>
      </div>
      <div :class="['p-2.5 rounded-lg transition-all duration-300 flex-shrink-0 ml-2', iconBgColors[color || 'blue'], iconBgColorsHover[color || 'blue']]">
        <component :is="icon" class="w-5 h-5" />
      </div>
    </div>
  </div>
</template>
