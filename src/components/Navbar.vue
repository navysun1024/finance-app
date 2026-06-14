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

// 用户菜单下拉
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
    <div class="container mx-auto px-4">
      <div class="flex items-center justify-between h-16">
        <div class="flex items-center space-x-8">
          <h1 class="text-xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">AssetPulse</h1>
          <div class="flex items-center space-x-1">
            <button
              v-for="item in navItems"
              :key="item.name"
              @click="router.push({ name: item.name })"
              :class="[
                'flex items-center space-x-2 px-4 py-2 rounded-xl transition-all duration-300',
                isActive(item.name)
                  ? 'bg-white/60 text-indigo-700 shadow-sm backdrop-blur-sm'
                  : 'text-gray-600 hover:bg-white/40 hover:text-gray-800'
              ]"
            >
              <component :is="item.icon" class="w-5 h-5" />
              <span>{{ item.label }}</span>
            </button>
          </div>
        </div>
        <!-- 右侧：用户信息 + 版本号 -->
        <div class="flex items-center space-x-3 text-sm">
          <span class="text-gray-400 font-mono text-xs">v1.0</span>
          <div ref="userMenuRef" class="relative">
            <button
              @click="toggleUserMenu"
              class="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/40 backdrop-blur-sm hover:bg-white/60 transition-all duration-300 cursor-pointer"
            >
              <User class="w-4 h-4 text-blue-500" />
              <span class="text-gray-600 font-medium">{{ getCurrentUser().username || '未登录' }}</span>
              <ChevronDown class="w-3.5 h-3.5 text-gray-400 transition-transform" :class="{ 'rotate-180': showUserMenu }" />
            </button>
            <!-- 下拉菜单 -->
            <Transition name="dropdown">
              <div
                v-if="showUserMenu"
                class="absolute right-0 top-full mt-2 w-48 glass-card rounded-xl shadow-xl overflow-hidden"
              >
                <div class="px-4 py-3 border-b border-gray-200/50">
                  <p class="text-xs text-gray-400">当前登录</p>
                  <p class="text-sm font-medium text-gray-700 truncate">{{ getCurrentUser().username }}</p>
                </div>
                <div class="py-1">
                  <button
                    @click="router.push({ name: 'settings' }); showUserMenu = false"
                    class="w-full flex items-center space-x-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-white/60 transition-colors"
                  >
                    <Settings class="w-4 h-4" />
                    <span>账户设置</span>
                  </button>
                  <button
                    @click="handleLogout"
                    class="w-full flex items-center space-x-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50/60 transition-colors"
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
            ? 'text-indigo-600'
            : 'text-gray-500'
        ]"
      >
        <component :is="item.icon" class="w-5 h-5" />
        <span class="text-xs mt-0.5">{{ item.label }}</span>
      </button>
    </div>
  </nav>
</template>