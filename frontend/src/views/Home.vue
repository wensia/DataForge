<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NCard, NButton, NSpace, NIcon, NResult } from 'naive-ui'
import { CloudOutline, RefreshOutline, PeopleOutline } from '@vicons/ionicons5'
import { getHealthStatus } from '@/api'
import type { ResponseModel } from '@/types'

const router = useRouter()
const loading = ref(false)
const healthStatus = ref<string>('')
const message = ref<string>('')

const checkHealth = async () => {
  loading.value = true
  try {
    const res: ResponseModel<{ status: string }> = await getHealthStatus()
    healthStatus.value = res.data?.status || ''
    message.value = res.message
  } catch (error) {
    healthStatus.value = 'error'
    message.value = '服务连接失败'
  } finally {
    loading.value = false
  }
}

const goToAccounts = () => {
  router.push('/accounts')
}

onMounted(() => {
  checkHealth()
})
</script>

<template>
  <div class="home-container">
    <n-card class="welcome-card">
      <template #header>
        <n-space align="center">
          <n-icon :component="CloudOutline" :size="28" />
          <span>云客中转</span>
        </n-space>
      </template>

      <n-result
        v-if="healthStatus === 'healthy'"
        status="success"
        title="服务运行正常"
        :description="message"
      />
      <n-result
        v-else-if="healthStatus === 'error'"
        status="error"
        title="服务连接失败"
        description="请检查后端服务是否启动"
      />
      <n-result
        v-else
        status="info"
        title="正在检查服务状态..."
        description="请稍候"
      />

      <template #footer>
        <n-space justify="center">
          <n-button type="primary" :loading="loading" @click="checkHealth">
            <template #icon>
              <n-icon :component="RefreshOutline" />
            </template>
            刷新状态
          </n-button>
          <n-button @click="goToAccounts">
            <template #icon>
              <n-icon :component="PeopleOutline" />
            </template>
            账号管理
          </n-button>
        </n-space>
      </template>
    </n-card>
  </div>
</template>

<style scoped>
.home-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.welcome-card {
  width: 100%;
  max-width: 500px;
}
</style>
