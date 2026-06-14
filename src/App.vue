<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import Navbar from '@/components/Navbar.vue'

const route = useRoute()
const showNavbar = () => {
  return !['/login', '/register'].includes(route.path)
}
</script>

<template>
  <div class="min-h-screen">
    <Navbar v-if="showNavbar()" />
    <main :class="['container mx-auto px-4 py-6', showNavbar() ? 'pt-20 pb-24 md:pb-6' : '']">
      <RouterView />
    </main>
  </div>
</template>