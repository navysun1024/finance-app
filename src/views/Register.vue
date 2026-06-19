<script setup lang="ts">
import { ref, computed } from 'vue'
import { User, Lock, Eye, EyeOff, ArrowLeft, Check, X, TrendingUp } from 'lucide-vue-next'
import { useRouter } from 'vue-router'

const router = useRouter()
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const errorMessage = ref('')
const isLoading = ref(false)

const usernameValid = computed(() => {
  const val = username.value.trim()
  return val.length >= 3 && val.length <= 32 && /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(val)
})

const passwordStrength = computed(() => {
  const pwd = password.value
  if (!pwd) return { level: 0, label: '', color: '' }
  
  let score = 0
  if (pwd.length >= 8) score++
  if (pwd.length >= 12) score++
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++
  if (/\d/.test(pwd)) score++
  if (/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) score++
  
  if (score <= 1) return { level: 1, label: '弱', color: 'bg-profit' }
  if (score <= 2) return { level: 2, label: '较弱', color: 'bg-orange-500' }
  if (score <= 3) return { level: 3, label: '中等', color: 'bg-amber-500' }
  if (score <= 4) return { level: 4, label: '强', color: 'bg-loss' }
  return { level: 5, label: '非常强', color: 'bg-loss' }
})

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
  <div class="min-h-screen flex items-center justify-center px-4 py-12 bg-apple-bg">
    <div class="w-full max-w-[400px] animate-fade-in">
      <!-- Logo -->
      <div class="text-center mb-10">
        <div class="w-16 h-16 rounded-2xl bg-apple-text flex items-center justify-center mx-auto mb-5">
          <TrendingUp class="w-8 h-8 text-white" />
        </div>
        <h1 class="text-[34px] font-bold text-apple-text tracking-tight leading-none">创建账户</h1>
        <p class="text-[17px] text-apple-secondary mt-2">开始您的投资之旅</p>
      </div>

      <!-- Register Card -->
      <div class="bg-white rounded-apple-xl shadow-apple p-8">
        <form @submit.prevent="handleRegister" class="space-y-5">
          <div>
            <label class="block text-[12px] font-semibold text-apple-text uppercase tracking-wider mb-2">用户名</label>
            <div class="relative">
              <User class="absolute left-4 top-1/2 transform -translate-y-1/2 w-[18px] h-[18px] text-apple-secondary" />
              <input
                v-model="username"
                type="text"
                placeholder="3-32位字母、数字、下划线或中文"
                :class="[
                  'glass-input w-full pl-12 pr-10 py-3 rounded-apple outline-none text-[15px]',
                  username && usernameValid ? 'border-loss' : username && !usernameValid ? 'border-profit' : ''
                ]"
              />
              <Check v-if="username && usernameValid" class="absolute right-3 top-1/2 transform -translate-y-1/2 w-[18px] h-[18px] text-loss" />
              <X v-if="username && !usernameValid" class="absolute right-3 top-1/2 transform -translate-y-1/2 w-[18px] h-[18px] text-profit" />
            </div>
            <p v-if="username && !usernameValid" class="text-[11px] text-profit mt-1.5">用户名只能包含字母、数字、下划线和中文，长度为3-32个字符</p>
          </div>
          
          <div>
            <label class="block text-[12px] font-semibold text-apple-text uppercase tracking-wider mb-2">密码</label>
            <div class="relative">
              <Lock class="absolute left-4 top-1/2 transform -translate-y-1/2 w-[18px] h-[18px] text-apple-secondary" />
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="至少8位"
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
            <!-- Password Strength -->
            <div v-if="password" class="mt-2.5">
              <div class="flex items-center gap-1 mb-1.5">
                <div v-for="i in 5" :key="i" :class="['h-1 flex-1 rounded-full transition-all', i <= passwordStrength.level ? passwordStrength.color : 'bg-black/8']"></div>
              </div>
              <p class="text-[11px] text-apple-secondary">密码强度：<span :class="{ 'text-profit': passwordStrength.level <= 1, 'text-orange-500': passwordStrength.level === 2, 'text-amber-600': passwordStrength.level === 3, 'text-loss': passwordStrength.level >= 4 }">{{ passwordStrength.label }}</span></p>
              <div class="mt-2 grid grid-cols-2 gap-1 text-[11px]">
                <span :class="passwordRules.length ? 'text-loss' : 'text-apple-secondary'">{{ passwordRules.length ? '✓' : '○' }} 至少8个字符</span>
                <span :class="passwordRules.upper ? 'text-loss' : 'text-apple-secondary'">{{ passwordRules.upper ? '✓' : '○' }} 包含大写字母</span>
                <span :class="passwordRules.lower ? 'text-loss' : 'text-apple-secondary'">{{ passwordRules.lower ? '✓' : '○' }} 包含小写字母</span>
                <span :class="passwordRules.number ? 'text-loss' : 'text-apple-secondary'">{{ passwordRules.number ? '✓' : '○' }} 包含数字</span>
                <span :class="passwordRules.special ? 'text-loss' : 'text-apple-secondary'">{{ passwordRules.special ? '✓' : '○' }} 包含特殊字符</span>
              </div>
            </div>
          </div>
          
          <div>
            <label class="block text-[12px] font-semibold text-apple-text uppercase tracking-wider mb-2">确认密码</label>
            <div class="relative">
              <Lock class="absolute left-4 top-1/2 transform -translate-y-1/2 w-[18px] h-[18px] text-apple-secondary" />
              <input
                v-model="confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                placeholder="请再次输入密码"
                :class="[
                  'glass-input w-full pl-12 pr-12 py-3 rounded-apple outline-none text-[15px]',
                  confirmPassword && confirmPassword === password ? 'border-loss' : confirmPassword && confirmPassword !== password ? 'border-profit' : ''
                ]"
              />
              <button
                type="button"
                @click="showConfirmPassword = !showConfirmPassword"
                class="absolute right-4 top-1/2 transform -translate-y-1/2 text-apple-secondary hover:text-apple-text transition-colors"
              >
                <Eye v-if="showConfirmPassword" class="w-[18px] h-[18px]" />
                <EyeOff v-else class="w-[18px] h-[18px]" />
              </button>
            </div>
            <p v-if="confirmPassword && confirmPassword !== password" class="text-[11px] text-profit mt-1.5">两次输入的密码不一致</p>
          </div>
          
          <div v-if="errorMessage" class="text-[13px] text-profit text-center bg-profit/5 rounded-apple py-2.5 font-medium">
            {{ errorMessage }}
          </div>
          
          <button
            type="submit"
            :disabled="isLoading"
            class="w-full apple-btn-primary py-3 text-[15px] rounded-apple font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
          >
            <span>{{ isLoading ? '注册中...' : '注 册' }}</span>
          </button>
        </form>
      </div>

      <!-- Footer -->
      <div class="text-center mt-6">
        <button
          @click="goToLogin"
          class="text-[14px] text-primary-500 hover:text-primary-600 font-medium flex items-center justify-center space-x-1 mx-auto hover:underline transition-all"
        >
          <ArrowLeft class="w-4 h-4" />
          <span>返回登录</span>
        </button>
      </div>
    </div>
  </div>
</template>
