<script setup lang="ts">
import { ref } from 'vue'
import { User, Lock, Eye, EyeOff, ArrowRight, TrendingUp } from 'lucide-vue-next'
import { useRouter } from 'vue-router'

const router = useRouter()
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const errorMessage = ref('')
const isLoading = ref(false)

const handleLogin = async () => {
  if (!username.value.trim() || !password.value.trim()) {
    errorMessage.value = '请输入用户名和密码'
    return
  }
  
  const trimmedUsername = username.value.trim()
  if (trimmedUsername.length < 3) {
    errorMessage.value = '用户名至少3个字符'
    return
  }
  if (password.value.length < 8) {
    errorMessage.value = '密码至少8个字符'
    return
  }
  
  isLoading.value = true
  errorMessage.value = ''
  
  try {
    const response = await fetch('/api/db/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: trimmedUsername, password: password.value })
    })
    
    const data = await response.json()
    
    if (response.ok && data.success) {
      localStorage.setItem('token', data.token)
      localStorage.setItem('username', data.username)
      router.push({ name: 'dashboard' })
    } else {
      errorMessage.value = data.error || '登录失败'
    }
  } catch (error) {
    errorMessage.value = '网络错误，请稍后重试'
  } finally {
    isLoading.value = false
  }
}

const goToRegister = () => {
  router.push('/register')
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 py-12 bg-apple-bg">
    <div class="w-full max-w-[400px] animate-fade-in">
      <!-- Logo -->
      <div class="text-center mb-10">
        <div class="w-16 h-16 rounded-2xl bg-apple-text flex items-center justify-center mx-auto mb-5">
          <TrendingUp class="w-8 h-8 text-white" />
        </div>
        <h1 class="text-[34px] font-bold text-apple-text tracking-tight leading-none">AssetTrack</h1>
        <p class="text-[17px] text-apple-secondary mt-2">智能理财，从容掌控</p>
      </div>

      <!-- Login Card -->
      <div class="bg-white rounded-apple-xl shadow-apple p-8">
        <form @submit.prevent="handleLogin" class="space-y-5">
          <div>
            <label class="block text-[12px] font-semibold text-apple-text uppercase tracking-wider mb-2">用户名</label>
            <div class="relative">
              <User class="absolute left-4 top-1/2 transform -translate-y-1/2 w-[18px] h-[18px] text-apple-secondary" />
              <input
                v-model="username"
                type="text"
                placeholder="请输入用户名"
                class="glass-input w-full pl-12 pr-4 py-3 rounded-apple outline-none text-[15px]"
              />
            </div>
          </div>
          
          <div>
            <label class="block text-[12px] font-semibold text-apple-text uppercase tracking-wider mb-2">密码</label>
            <div class="relative">
              <Lock class="absolute left-4 top-1/2 transform -translate-y-1/2 w-[18px] h-[18px] text-apple-secondary" />
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="请输入密码"
                class="glass-input w-full pl-12 pr-12 py-3 rounded-apple outline-none text-[15px]"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-4 top-1/2 transform -translate-y-1/2 text-apple-secondary hover:text-apple-text transition-colors"
              >
                <Eye v-if="showPassword" class="w-[18px] h-[18px]" />
                <EyeOff v-else class="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>
          
          <div v-if="errorMessage" class="text-[13px] text-profit text-center bg-profit/5 rounded-apple py-2.5 font-medium">
            {{ errorMessage }}
          </div>
          
          <button
            type="submit"
            :disabled="isLoading"
            class="w-full apple-btn-primary py-3 text-[15px] rounded-apple font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            <span>{{ isLoading ? '登录中...' : '登 录' }}</span>
            <ArrowRight v-if="!isLoading" class="w-[18px] h-[18px]" />
          </button>
        </form>
      </div>

      <!-- Footer Link -->
      <div class="text-center mt-6">
        <p class="text-[14px] text-apple-secondary">
          还没有账户？
          <button
            @click="goToRegister"
            class="text-primary-500 hover:text-primary-600 font-medium hover:underline transition-all"
          >
            立即注册
          </button>
        </p>
      </div>
    </div>
  </div>
</template>
