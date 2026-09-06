import { createRouter, createWebHistory } from 'vue-router'
import { h, defineComponent, defineAsyncComponent } from 'vue'

const Products = defineAsyncComponent(() => import('@/views/Products.vue'))

const EquityProducts = defineComponent({
  render() {
    return h(Products, { type: 'equity' })
  }
})

const FixedIncomeProducts = defineComponent({
  render() {
    return h(Products, { type: 'fixed_income' })
  }
})

const TermDepositProducts = defineComponent({
  render() {
    return h(Products, { type: 'term_deposit' })
  }
})

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/Login.vue')
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/Register.vue')
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/Dashboard.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/transactions',
      name: 'transactions',
      component: () => import('@/views/Transactions.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/equity',
      name: 'equity',
      component: EquityProducts,
      meta: { requiresAuth: true }
    },
    {
      path: '/fixed-income',
      name: 'fixed-income',
      component: FixedIncomeProducts,
      meta: { requiresAuth: true }
    },
    {
      path: '/term-deposit',
      name: 'term-deposit',
      component: TermDepositProducts,
      meta: { requiresAuth: true }
    },
    {
      path: '/products',
      name: 'products',
      component: () => import('@/views/Products.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/products/:id',
      name: 'product-detail',
      component: () => import('@/views/ProductDetail.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/Settings.vue'),
      meta: { requiresAuth: true }
    }
  ]
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token')
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth)
  
  if (requiresAuth && !token) {
    next('/login')
  } else if (!requiresAuth && token && (to.path === '/login' || to.path === '/register')) {
    next({ name: 'dashboard' })
  } else {
    next()
  }
})

export default router