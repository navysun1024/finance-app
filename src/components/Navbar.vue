<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { LayoutDashboard, PlusCircle, TrendingUp, DollarSign, Settings, User, LogOut, ChevronDown } from 'lucide-vue-next'
import { getCurrentUser, logout } from '@/utils/storage'

const router = useRouter()
const route = useRoute()

const navItems = [
  { name: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
  { name: 'transactions', label: '交易记账', icon: PlusCircle },
  { name: 'funds', label: '基金', icon: TrendingUp },
  { name: 'fixed-income', label: '固收理财', icon: DollarSign },
  { name: 'settings', label: '设置', icon: Settings }
]

const isActive = (name: string) => route.name === name

const showUserMenu = ref(false)
const userMenuRef = ref<HTMLElement | null>(null)

const toggleUserMenu = () => {
  showUserMenu.value = !showUserMenu.value
}

const handleClickOutside = (e: MouseEvent) => {
  if (userMenuRef.value && !userMenuRef.value.contains(e.target as Node)) {
    showUserMenu.value = false
  }
}

const handleLogout = () => {
  showUserMenu.value = false
  logout()
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <nav class="glass-nav fixed top-0 left-0 right-0 z-50 hidden md:block">
    <div class="container mx-auto px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <div class="flex items-center space-x-8">
          <h1 class="text-xl font-bold text-primary">AssetPulse</h1>
          <div class="flex items-center space-x-1">
            <button
              v-for="item in navItems"
              :key="item.name"
              @click="router.push({ name: item.name })"
              :class="[
                'flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-300',
                isActive(item.name)
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
              ]"
            >
              <component :is="item.icon" class="w-5 h-5" />
              <span>{{ item.label }}</span>
            </button>
          </div>
        </div>
        <div class="flex items-center space-x-4 text-sm">
          <span class="text-gray-500 font-mono text-xs">V1.1.2</span>
          <div ref="userMenuRef" class="relative">
            <button
              @click="toggleUserMenu"
              class="flex items-center space-x-2 px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-all duration-300 cursor-pointer"
            >
              <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <User class="w-4 h-4 text-primary" />
              </div>
              <span class="text-gray-600 font-medium hidden sm:inline">{{ getCurrentUser().username || '用户' }}</span>
              <ChevronDown class="w-4 h-4 text-gray-500 transition-transform" :class="{ 'rotate-180': showUserMenu }" />
            </button>
            <Transition name="dropdown">
              <div
                v-if="showUserMenu"
                class="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
              >
                <div class="px-4 py-3 border-b border-gray-200">
                  <p class="text-xs text-gray-500">当前登录</p>
                  <p class="text-sm font-medium text-gray-800 truncate">{{ getCurrentUser().username }}</p>
                </div>
                <div class="py-1">
                  <button
                    @click="router.push({ name: 'settings' }); showUserMenu = false"
                    class="w-full flex items-center space-x-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <Settings class="w-4 h-4" />
                    <span>账户设置</span>
                  </button>
                  <button
                    @click="handleLogout"
                    class="w-full flex items-center space-x-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut class="w-4 h-4" />
                    <span>退出登录</span>
                  </button>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </div>
  </nav>
  <nav class="fixed bottom-0 left-0 right-0 z-50 glass-nav md:hidden safe-area-bottom">
    <div class="flex items-center justify-around h-14">
      <button
        v-for="item in navItems"
        :key="item.name"
        @click="router.push({ name: item.name })"
        :class="[
          'flex flex-col items-center justify-center flex-1 h-full transition-all duration-300',
          isActive(item.name)
            ? 'text-primary'
            : 'text-gray-500'
        ]"
      >
        <component :is="item.icon" class="w-5 h-5" />
        <span class="text-xs mt-0.5">{{ item.label }}</span>
      </button>
    </div>
  </nav>
</template>
