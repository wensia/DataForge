# 前端开发规则

> Vue 3 + Vite + Naive UI

## 技术栈

| 组件 | 技术 |
|------|------|
| 框架 | Vue 3 (Composition API) |
| 构建工具 | Vite |
| UI 组件库 | Naive UI |
| 图标库 | xicons |
| 状态管理 | Pinia |
| 路由 | Vue Router |

## 项目结构

```
frontend/
├── src/
│   ├── main.ts              # 应用入口
│   ├── App.vue              # 根组件
│   ├── api/                 # API 请求
│   │   ├── index.ts
│   │   └── modules/
│   ├── assets/              # 静态资源
│   ├── components/          # 公共组件
│   │   └── common/
│   ├── composables/         # 组合式函数
│   ├── layouts/             # 布局组件
│   ├── router/              # 路由配置
│   │   └── index.ts
│   ├── stores/              # Pinia 状态管理
│   │   └── index.ts
│   ├── styles/              # 全局样式
│   │   └── index.css
│   ├── types/               # TypeScript 类型定义
│   │   └── index.ts
│   ├── utils/               # 工具函数
│   │   └── index.ts
│   └── views/               # 页面组件
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Naive UI 组件使用规范

### 默认配色和标准大小

**所有组件必须使用 Naive UI 的默认配色和标准大小，不做自定义主题覆盖。**

```vue
<template>
  <!-- ✅ 正确：使用默认配置 -->
  <n-button>默认按钮</n-button>
  <n-button type="primary">主要按钮</n-button>
  <n-button type="info">信息按钮</n-button>
  <n-button type="success">成功按钮</n-button>
  <n-button type="warning">警告按钮</n-button>
  <n-button type="error">错误按钮</n-button>
  
  <n-input placeholder="请输入" />
  <n-select :options="options" />
  
  <!-- ❌ 错误：自定义尺寸和颜色 -->
  <n-button size="large" color="#custom">自定义按钮</n-button>
</template>
```

### 全局配置

```typescript
// main.ts
import { createApp } from 'vue'
import naive from 'naive-ui'
import App from './App.vue'

const app = createApp(App)
app.use(naive)
app.mount('#app')
```

### 按需引入组件

```vue
<script setup lang="ts">
import { NButton, NInput, NCard, NSpace, NForm, NFormItem } from 'naive-ui'
</script>
```

## xicons 图标库使用

Naive UI 推荐使用 xicons 图标库。

### 安装

```bash
# Ionicons 5（推荐）
pnpm add @vicons/ionicons5

# 其他可选图标集
pnpm add @vicons/antd
pnpm add @vicons/material
pnpm add @vicons/carbon
pnpm add @vicons/tabler
```

### 图标使用示例

```vue
<script setup lang="ts">
import { NIcon, NButton } from 'naive-ui'
import { HomeOutline, SettingsOutline, AddOutline } from '@vicons/ionicons5'
</script>

<template>
  <!-- 单独使用图标 -->
  <n-icon :component="HomeOutline" />
  
  <!-- 按钮中使用图标 -->
  <n-button>
    <template #icon>
      <n-icon :component="SettingsOutline" />
    </template>
    设置
  </n-button>
  
  <!-- 图标按钮 -->
  <n-button circle>
    <template #icon>
      <n-icon :component="AddOutline" />
    </template>
  </n-button>
</template>
```

### 封装图标组件

```vue
<!-- components/common/Icon.vue -->
<script setup lang="ts">
import { NIcon } from 'naive-ui'
import type { Component } from 'vue'

defineProps<{
  icon: Component
  size?: number
}>()
</script>

<template>
  <n-icon :size="size" :component="icon" />
</template>
```

## 统一响应类型

与后端响应模型对应的 TypeScript 类型：

```typescript
// types/response.ts
export interface ResponseModel<T = any> {
  code: number
  message: string
  data: T
}
```

## API 请求封装

```typescript
// api/request.ts
import axios from 'axios'
import type { ResponseModel } from '@/types/response'

const request = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    // 添加 token 等
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  (response) => {
    const res = response.data as ResponseModel
    if (res.code !== 200) {
      // 处理业务错误
      console.error(res.message)
      return Promise.reject(new Error(res.message))
    }
    return res
  },
  (error) => {
    return Promise.reject(error)
  }
)

export default request
```

## 组件开发规范

1. **Composition API**: 统一使用 `<script setup>` 语法
2. **TypeScript**: 所有代码使用 TypeScript 编写
3. **组件命名**: 使用 PascalCase 命名组件文件
4. **Props 定义**: 使用 `defineProps` 配合 TypeScript 类型
5. **事件定义**: 使用 `defineEmits` 配合 TypeScript 类型

### 组件模板

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { NButton, NCard } from 'naive-ui'

// Props 定义
interface Props {
  title: string
  count?: number
}

const props = withDefaults(defineProps<Props>(), {
  count: 0,
})

// Emits 定义
const emit = defineEmits<{
  (e: 'update', value: number): void
  (e: 'delete'): void
}>()

// 响应式数据
const localCount = ref(props.count)

// 计算属性
const displayText = computed(() => `${props.title}: ${localCount.value}`)

// 方法
const handleUpdate = () => {
  emit('update', localCount.value)
}
</script>

<template>
  <n-card :title="title">
    <p>{{ displayText }}</p>
    <n-button @click="handleUpdate">
      更新
    </n-button>
  </n-card>
</template>

<style scoped>
/* 组件样式 */
</style>
```

## 路由配置示例

```typescript
// router/index.ts
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: () => import('@/views/Home.vue'),
    },
    {
      path: '/about',
      name: 'About',
      component: () => import('@/views/About.vue'),
    },
  ],
})

export default router
```

## Pinia 状态管理示例

```typescript
// stores/user.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUserStore = defineStore('user', () => {
  // state
  const user = ref<User | null>(null)
  const token = ref<string>('')

  // getters
  const isLoggedIn = computed(() => !!token.value)

  // actions
  const login = async (username: string, password: string) => {
    // 登录逻辑
  }

  const logout = () => {
    user.value = null
    token.value = ''
  }

  return {
    user,
    token,
    isLoggedIn,
    login,
    logout,
  }
})
```

## 代码检查与格式化

使用 **Biome** 进行代码检查和格式化（替代 ESLint + Prettier）。

### Biome 优势

- 🚀 速度快 20-100 倍（Rust 编写）
- 🔧 二合一工具（Linter + Formatter）
- ⚙️ 零配置，开箱即用

### 常用命令

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 预览生产构建
pnpm preview

# 代码检查
pnpm lint

# 代码检查 + 格式化（自动修复）
pnpm format
```

### Biome 配置

配置文件：`biome.json`

```json
{
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "asNeeded"
    }
  }
}
```

## 依赖参考

```json
{
  "dependencies": {
    "vue": "^3.4.0",
    "vue-router": "^4.2.0",
    "pinia": "^2.1.0",
    "naive-ui": "^2.38.0",
    "@vicons/ionicons5": "^0.12.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "typescript": "^5.3.0",
    "@vitejs/plugin-vue": "^5.0.0",
    "@biomejs/biome": "^1.9.0"
  }
}
```

## 文档优先原则

在编写代码或修复 bug 时，优先查找官方文档：

1. **Vue 3**: https://vuejs.org/
2. **Naive UI**: https://www.naiveui.com/
3. **Vite**: https://vitejs.dev/
4. **xicons**: https://www.xicons.org/
5. **Pinia**: https://pinia.vuejs.org/
6. **Vue Router**: https://router.vuejs.org/

遵循官方最佳实践和示例代码。

