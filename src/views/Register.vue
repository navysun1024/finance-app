<script setup lang="ts">
import { ref, computed } from 'vue'
import { User, Lock, Eye, EyeOff, UserPlus, ArrowLeft, Check, X } from 'lucide-vue-next'
import { useRouter } from 'vue-router'

const router = useRouter()
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const errorMessage = ref('')
const isLoading = ref(false)

// 用户名验证
const usernameValid = computed(() => {
  const val = username.value.trim()
  return val.length >= 3 && val.length <= 32 && /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(val)
})

// 密码强度检测
const passwordStrength = computed(() => {
  const pwd = password.value
  if (!pwd) return { level: 0, label: '', color: '' }
  
  let score = 0
  if (pwd.length >= 8) score++
  if (pwd.length >= 12) score++
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++
  if (/\d/.test(pwd)) score++
  if (/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) score++
  
  if (score <= 1) return { level: 1, label: '弱', color: 'bg-red-500' }
  if (score <= 2) return { level: 2, label: '较弱', color: 'bg-orange-500' }
  if (score <= 3) return { level: 3, label: '中等', color: 'bg-yellow-500' }
  if (score <= 4) return { level: 4, label: '强', color: 'bg-green-500' }
  return { level: 5, label: '非常强', color: 'bg-emerald-500' }
})

// 密码规则检查
const passwordRules = computed(() => ({
  length: password.value.length >= 8,
  upper: /[A-Z]/.test(password.value),
  lower: /[a-z]/.test(password.value),
  number: /\d/.test(password.value),
  special: /[!@#$%^&*(),.?":{}|<>]/.test(password.value)
}))

const handleRegister = async () => {
  if (!username.value.trim()) {
    errorMessage.value = '请输入用户名'
    return
  }
  
  if (!usernameValid.value) {
    errorMessage.value = '用户名只能包含字母、数字、下划线和中文，且长度为3-32个字符'
    return
  }
  
  if (!password.value.trim()) {
    errorMessage.value = '请输入密码'
    return
  }
  
  if (password.value !== confirmPassword.value) {
    errorMessage.value = '两次输入的密码不一致'
    return
  }
  
  if (password.value.length < 8) {
    errorMessage.value = '密码长度至少8位'
    return
  }
  
  isLoading.value = true
  errorMessage.value = ''
  
  try {
    const response = await fetch('/api/db/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value.trim(), password: password.value })
    })
    
    const data = await response.json()
    
    if (response.ok && data.success) {
      localStorage.setItem('token', data.token)
      localStorage.setItem('username', data.username)
      router.push({ name: 'dashboard' })
    } else {
      errorMessage.value = data.error || '注册失败'
    }
  } catch (error) {
    errorMessage.value = '网络错误，请稍后重试'
  } finally {
    isLoading.value = false
  }
}

const goToLogin = () => {
  router.push('/login')
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-green-50 to-teal-100 flex items-center justify-center p-4">
    <div class="w-full max-w-md">
      <div class="bg-white rounded-2xl shadow-xl p-8">
        <div class="text-center mb-8">
          <div class="w-16 h-16 bg-gradient-to-r from-green-500 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserPlus class="w-8 h-8 text-white" />
          </div>
          <h1 class="text-2xl font-bold text-gray-800">创建账户</h1>
          <p class="text-gray-500 mt-2">开始您的投资之旅</p>
        </div>
        
        <form @submit.prevent="handleRegister" class="space-y-6">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">用户名</label>
            <div class="relative">
              <User class="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                v-model="username"
                type="text"
                placeholder="请输入用户名（3-32位字母、数字、下划线或中文）"
                :class="[
                  'w-full pl-10 pr-10 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all',
                  username && usernameValid ? 'border-green-500' : username && !usernameValid ? 'border-red-400' : 'border-gray-300'
                ]"
              />
              <Check v-if="username && usernameValid" class="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-green-500" />
              <X v-if="username && !usernameValid" class="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-red-400" />
            </div>
            <p v-if="username && !usernameValid" class="text-xs text-red-500 mt-1">用户名只能包含字母、数字、下划线和中文，长度为3-32个字符</p>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">密码</label>
            <div class="relative">
              <Lock class="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="请输入密码（至少8位）"
                class="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <Eye v-if="showPassword" class="w-5 h-5" />
                <EyeOff v-else class="w-5 h-5" />
              </button>
            </div>
            <!-- 密码强度指示器 -->
            <div v-if="password" class="mt-2">
              <div class="flex items-center gap-1 mb-1">
                <div v-for="i in 5" :key="i" :class="['h-1.5 flex-1 rounded-full transition-all', i <= passwordStrength.level ? passwordStrength.color : 'bg-gray-200']"></div>
              </div>
              <p class="text-xs text-gray-500">密码强度：<span :class="{ 'text-red-500': passwordStrength.level <= 1, 'text-orange-500': passwordStrength.level === 2, 'text-yellow-600': passwordStrength.level === 3, 'text-green-500': passwordStrength.level >= 4 }">{{ passwordStrength.label }}</span></p>
              <!-- 密码规则提示 -->
              <div class="mt-2 grid grid-cols-2 gap-1 text-xs">
                <span :class="passwordRules.length ? 'text-green-500' : 'text-gray-400'">{{ passwordRules.length ? '✓' : '○' }} 至少8个字符</span>
                <span :class="passwordRules.upper ? 'text-green-500' : 'text-gray-400'">{{ passwordRules.upper ? '✓' : '○' }} 包含大写字母</span>
                <span :class="passwordRules.lower ? 'text-green-500' : 'text-gray-400'">{{ passwordRules.lower ? '✓' : '○' }} 包含小写字母</span>
                <span :class="passwordRules.number ? 'text-green-500' : 'text-gray-400'">{{ passwordRules.number ? '✓' : '○' }} 包含数字</span>
                <span :class="passwordRules.special ? 'text-green-500' : 'text-gray-400'">{{ passwordRules.special ? '✓' : '○' }} 包含特殊字符</span>
              </div>
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">确认密码</label>
            <div class="relative">
              <Lock class="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                v-model="confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                placeholder="请再次输入密码"
                :class="[
                  'w-full pl-10 pr-12 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all',
                  confirmPassword && confirmPassword === password ? 'border-green-500' : confirmPassword && confirmPassword !== password ? 'border-red-400' : 'border-gray-300'
                ]"
              />
              <button
                type="button"
                @click="showConfirmPassword = !showConfirmPassword"
                class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <Eye v-if="showConfirmPassword" class="w-5 h-5" />
                <EyeOff v-else class="w-5 h-5" />
              </button>
            </div>
            <p v-if="confirmPassword && confirmPassword !== password" class="text-xs text-red-500 mt-1">两次输入的密码不一致</p>
          </div>
          
          <div v-if="errorMessage" class="text-red-500 text-sm text-center">
            {{ errorMessage }}
          </div>
          
          <button
            type="submit"
            :disabled="isLoading"
            class="w-full bg-gradient-to-r from-green-500 to-teal-500 text-white py-3 rounded-lg font-medium hover:from-green-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-2"
          >
            <span>{{ isLoading ? '注册中...' : '注 册' }}</span>
          </button>
        </form>
        
        <div class="mt-6 text-center">
          <p class="text-gray-500">
            <button
              @click="goToLogin"
              class="text-green-600 hover:text-green-700 font-medium flex items-center justify-center space-x-1 mx-auto"
            >
              <ArrowLeft class="w-4 h-4" />
              <span>返回登录</span>
            </button>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>