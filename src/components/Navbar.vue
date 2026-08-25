<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { LayoutDashboard, PlusCircle, TrendingUp, DollarSign, Settings, LogOut, ChevronDown, Tag, Landmark } from 'lucide-vue-next'
import { getCurrentUser, logout } from '@/utils/storage'

const router = useRouter()
const route = useRoute()

const navItems = [
  { name: 'dashboard', label: '概览', icon: LayoutDashboard },
  { name: 'transactions', label: '记账', icon: PlusCircle },
  { name: 'equity', label: '权益', icon: TrendingUp },
  { name: 'fixed-income', label: '固收', icon: DollarSign },
  { name: 'term-deposit', label: '定存', icon: Landmark },
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
  <!-- Desktop Nav -->
  <nav class="glass-nav fixed top-0 left-0 right-0 z-50 hidden md:block">
    <div class="max-w-7xl mx-auto px-6 lg:px-8">
      <div class="flex items-center justify-between h-[52px]">
        <!-- Logo -->
        <router-link :to="{ name: 'dashboard' }" class="flex items-center space-x-2 group">
          <div class="w-8 h-8 rounded-lg bg-apple-text flex items-center justify-center">
            <TrendingUp class="w-4.5 h-4.5 text-white" />
          </div>
          <span class="text-[17px] font-semibold text-apple-text tracking-tight group-hover:text-primary-500 transition-colors">AssetTrack</span>
        </router-link>

        <!-- Nav Links -->
        <div class="flex items-center space-x-0.5">
          <button
            v-for="item in navItems"
            :key="item.name"
            @click="router.push({ name: item.name })"
            :class="[
              'flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200',
              isActive(item.name)
                ? 'bg-apple-text text-white'
                : 'text-apple-secondary hover:text-apple-text hover:bg-black/5'
            ]"
          >
            <component :is="item.icon" class="w-3.5 h-3.5" />
            <span>{{ item.label }}</span>
          </button>
        </div>

        <!-- User Menu -->
        <div class="flex items-center space-x-3">
          <span class="inline-flex items-center gap-1 text-[10px] text-primary-500 font-mono tracking-wide bg-primary-50 px-2 py-0.5 rounded-full font-medium">
            <Tag class="w-2.5 h-2.5" />v1.4.8
          </span>
          <div ref="userMenuRef" class="relative">
            <button
              @click="toggleUserMenu"
              class="flex items-center space-x-2 pl-2 pr-3 py-1.5 rounded-full hover:bg-black/5 transition-all duration-200 cursor-pointer"
            >
              <div class="w-7 h-7 rounded-full bg-primary-500 flex items-center justify-center">
                <span class="text-white text-xs font-semibold">{{ (getCurrentUser().username || 'U').charAt(0).toUpperCase() }}</span>
              </div>
              <span class="text-[13px] text-apple-text font-medium hidden sm:inline">{{ getCurrentUser().username || '用户' }}</span>
              <ChevronDown class="w-3.5 h-3.5 text-apple-secondary transition-transform duration-200" :class="{ 'rotate-180': showUserMenu }" />
            </button>
            <Transition name="dropdown">
              <div
                v-if="showUserMenu"
                class="absolute right-0 top-full mt-2 w-52 bg-white/95 backdrop-blur-xl border border-black/8 rounded-2xl shadow-apple-xl overflow-hidden"
              >
                <div class="px-4 py-3.5 border-b border-black/5">
                  <p class="text-[11px] text-apple-secondary uppercase tracking-wider font-medium">已登录</p>
                  <p class="text-[14px] font-semibold text-apple-text mt-0.5 truncate">{{ getCurrentUser().username }}</p>
                </div>
                <div class="py-1.5">
                  <button
                    @click="router.push({ name: 'settings' }); showUserMenu = false"
                    class="w-full flex items-center space-x-2.5 px-4 py-2.5 text-[13px] text-apple-text hover:bg-black/4 transition-colors"
                  >
                    <Settings class="w-4 h-4 text-apple-secondary" />
                    <span>账户设置</span>
                  </button>
                  <div class="mx-3 border-t border-black/5 my-1"></div>
                  <button
                    @click="handleLogout"
                    class="w-full flex items-center space-x-2.5 px-4 py-2.5 text-[13px] text-profit hover:bg-profit/5 transition-colors"
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

  <!-- Mobile Bottom Nav -->
  <nav class="fixed bottom-0 left-0 right-0 z-50 glass-nav md:hidden safe-area-bottom border-t border-black/5">
    <div class="flex items-stretch justify-around h-[58px] pb-0.5">
      <button
        v-for="item in navItems"
        :key="item.name"
        @click="router.push({ name: item.name })"
        :class="[
          'flex flex-col items-center justify-center flex-1 h-full touch-target transition-all duration-200 active:scale-95',
          isActive(item.name)
            ? 'text-primary-500'
            : 'text-apple-secondary'
        ]"
      >
        <component :is="item.icon" :class="['w-[22px] h-[22px]', isActive(item.name) ? 'scale-105' : '']" />
        <span class="text-[10px] mt-0.5 font-medium tracking-tight">{{ item.label }}</span>
      </button>
    </div>
  </nav>
</template>
