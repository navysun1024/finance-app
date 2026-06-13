<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { LayoutDashboard, PlusCircle, FolderOpen, Settings } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()

const navItems = [
  { name: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
  { name: 'transactions', label: '交易记账', icon: PlusCircle },
  { name: 'products', label: '产品列表', icon: FolderOpen },
  { name: 'settings', label: '设置', icon: Settings }
]

const isActive = (name: string) => route.name === name
</script>

<template>
  <nav class="bg-white shadow-sm border-b border-gray-200 fixed top-0 left-0 right-0 z-50 hidden md:block">
    <div class="container mx-auto px-4">
      <div class="flex items-center justify-between h-16">
        <div class="flex items-center space-x-8">
          <h1 class="text-xl font-bold text-primary-600">理财收益统计</h1>
          <div class="flex items-center space-x-1">
            <button
              v-for="item in navItems"
              :key="item.name"
              @click="router.push({ name: item.name })"
              :class="[
                'flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors',
                isActive(item.name)
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-100'
              ]"
            >
              <component :is="item.icon" class="w-5 h-5" />
              <span>{{ item.label }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </nav>
  <nav class="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 md:hidden safe-area-bottom">
    <div class="flex items-center justify-around h-14">
      <button
        v-for="item in navItems"
        :key="item.name"
        @click="router.push({ name: item.name })"
        :class="[
          'flex flex-col items-center justify-center flex-1 h-full transition-colors',
          isActive(item.name)
            ? 'text-primary-600'
            : 'text-gray-400'
        ]"
      >
        <component :is="item.icon" class="w-5 h-5" />
        <span class="text-xs mt-0.5">{{ item.label }}</span>
      </button>
    </div>
  </nav>
</template>