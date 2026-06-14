<script setup lang="ts">
import { ref } from 'vue'
import { User, Lock, Eye, EyeOff, LogIn, ArrowRight } from 'lucide-vue-next'
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
  
  // 基本输入验证
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
  <div class="min-h-screen flex items-center justify-center p-4 relative">
    <!-- 装饰圆形 -->
    <div class="absolute top-20 left-10 w-72 h-72 bg-blue-300 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-pulse"></div>
    <div class="absolute top-40 right-10 w-72 h-72 bg-cyan-300 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-pulse" style="animation-delay: 2s;"></div>
    <div class="absolute bottom-20 left-1/3 w-72 h-72 bg-indigo-300 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-pulse" style="animation-delay: 4s;"></div>
    
    <div class="w-full max-w-md relative z-10">
      <div class="glass-card rounded-3xl shadow-2xl p-8">
        <div class="text-center mb-8">
          <div class="w-20 h-20 bg-gradient-to-br from-blue-500 via-cyan-500 to-indigo-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-cyan-500/30">
            <LogIn class="w-10 h-10 text-white" />
          </div>
          <h1 class="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">AssetPulse</h1>
          <p class="text-gray-500 mt-2">智能理财，触手可及</p>
        </div>
        
        <form @submit.prevent="handleLogin" class="space-y-6">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">用户名</label>
            <div class="relative">
              <User class="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                v-model="username"
                type="text"
                placeholder="请输入用户名"
                class="glass-input w-full pl-12 pr-4 py-3.5 rounded-xl outline-none text-gray-800 placeholder-gray-400"
              />
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">密码</label>
            <div class="relative">
              <Lock class="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="请输入密码"
                class="glass-input w-full pl-12 pr-12 py-3.5 rounded-xl outline-none text-gray-800 placeholder-gray-400"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <Eye v-if="showPassword" class="w-5 h-5" />
                <EyeOff v-else class="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <div v-if="errorMessage" class="text-red-500 text-sm text-center bg-red-50/80 backdrop-blur-sm rounded-xl py-2">
            {{ errorMessage }}
          </div>
          
          <button
            type="submit"
            :disabled="isLoading"
            class="w-full bg-gradient-to-r from-blue-500 via-cyan-500 to-indigo-500 text-white py-3.5 rounded-xl font-medium hover:shadow-xl hover:shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center space-x-2 hover:-translate-y-0.5"
          >
            <span>{{ isLoading ? '登录中...' : '登 录' }}</span>
            <ArrowRight v-if="!isLoading" class="w-5 h-5" />
          </button>
        </form>
        
        <div class="mt-6 text-center">
          <p class="text-gray-500">
            还没有账户？
            <button
              @click="goToRegister"
              class="text-indigo-600 hover:text-indigo-700 font-medium hover:underline transition-all"
            >
              立即注册
            </button>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>