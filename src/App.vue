<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import Navbar from '@/components/Navbar.vue'

const route = useRoute()
const showNavbar = () => {
  return !['/login', '/register'].includes(route.path)
}
</script>

<template>
  <div class="min-h-screen bg-apple-bg">
    <Navbar v-if="showNavbar()" />
    <main :class="['max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 md:py-6', showNavbar() ? 'md:pt-24 pb-[calc(env(safe-area-inset-bottom,0px)+96px)] md:pb-8' : '']">
      <RouterView v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" />
        </transition>
      </RouterView>
    </main>
  </div>
</template>
