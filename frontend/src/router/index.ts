import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/Home.vue'),
  },
  {
    path: '/accounts',
    name: 'Accounts',
    component: () => import('@/views/AccountManager.vue'),
  },
  {
    path: '/api-keys',
    name: 'ApiKeys',
    component: () => import('@/views/ApiKeyManager.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
