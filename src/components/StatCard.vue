<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  title: string
  value: string | number
  change?: number
  icon: Component
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple'
}>()

const bgColorClasses = {
  blue: 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/30',
  green: 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/30',
  red: 'bg-gradient-to-br from-red-500 to-rose-600 shadow-red-500/30',
  yellow: 'bg-gradient-to-br from-amber-500 to-yellow-600 shadow-amber-500/30',
  purple: 'bg-gradient-to-br from-purple-500 to-violet-600 shadow-purple-500/30'
}
</script>

<template>
  <div class="glass-card rounded-2xl p-3 sm:p-4 hover:bg-white/80 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
    <div class="flex items-start justify-between">
      <div>
        <p class="text-gray-500 text-xs mb-1">{{ title }}</p>
        <p class="text-xl font-bold text-gray-800">{{ value }}</p>
        <p v-if="change !== undefined" :class="['text-xs mt-0.5 font-medium', change >= 0 ? 'text-profit' : 'text-loss']">
          {{ change >= 0 ? '+' : '' }}{{ change.toFixed(2) }}%
        </p>
      </div>
      <div :class="['p-2 rounded-xl shadow-lg', bgColorClasses[color || 'blue']]">
        <component :is="icon" class="w-5 h-5 text-white" />
      </div>
    </div>
  </div>
</template>
