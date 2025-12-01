<script setup lang="ts">
import {
  type ApiKey,
  type ApiKeyCreate,
  type ApiKeyUpdate,
  createApiKey,
  deleteApiKey,
  getApiKeys,
  updateApiKey,
} from '@/api/apiKeys'
import {
  AddOutline,
  CheckmarkCircleOutline,
  CloseCircleOutline,
  CopyOutline,
  CreateOutline,
  RefreshOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import {
  type DataTableColumns,
  NButton,
  NCard,
  NDataTable,
  NDatePicker,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NModal,
  NPopconfirm,
  NSpace,
  NTag,
  useMessage,
} from 'naive-ui'
import { h, onMounted, ref } from 'vue'

const message = useMessage()

// 密钥列表
const apiKeys = ref<ApiKey[]>([])
const loading = ref(false)

// 弹窗控制
const showModal = ref(false)
const modalTitle = ref('添加密钥')
const isEdit = ref(false)
const currentKeyId = ref<number | null>(null)

// 表单数据
const formData = ref<ApiKeyCreate & { is_active?: boolean }>({
  name: '',
  key: '',
  expires_at: '',
  notes: '',
})

// 过期时间控制
const expiresAtTimestamp = ref<number | null>(null)

// 加载密钥列表
const loadApiKeys = async () => {
  loading.value = true
  try {
    const res = await getApiKeys()
    if (res.code === 200) {
      apiKeys.value = res.data?.items || []
    } else {
      message.error(res.message || '加载失败')
    }
  } catch {
    message.error('加载密钥列表失败')
  } finally {
    loading.value = false
  }
}

// 重置表单
const resetForm = () => {
  formData.value = {
    name: '',
    key: '',
    expires_at: '',
    notes: '',
  }
  expiresAtTimestamp.value = null
}

// 打开添加弹窗
const openAddModal = () => {
  isEdit.value = false
  modalTitle.value = '添加密钥'
  currentKeyId.value = null
  resetForm()
  showModal.value = true
}

// 打开编辑弹窗
const openEditModal = (row: ApiKey) => {
  isEdit.value = true
  modalTitle.value = '编辑密钥'
  currentKeyId.value = row.id
  formData.value = {
    name: row.name,
    key: row.key,
    expires_at: row.expires_at || '',
    notes: row.notes || '',
    is_active: row.is_active,
  }
  expiresAtTimestamp.value = row.expires_at ? new Date(row.expires_at).getTime() : null
  showModal.value = true
}

// 处理过期时间变化
const handleExpiresAtChange = (timestamp: number | null) => {
  expiresAtTimestamp.value = timestamp
  if (timestamp) {
    formData.value.expires_at = new Date(timestamp).toISOString()
  } else {
    formData.value.expires_at = ''
  }
}

// 提交表单
const handleSubmit = async () => {
  if (!formData.value.name) {
    message.warning('请输入密钥名称')
    return
  }

  try {
    if (isEdit.value && currentKeyId.value) {
      // 编辑模式
      const updateData: ApiKeyUpdate = {
        name: formData.value.name,
        notes: formData.value.notes || undefined,
        expires_at: formData.value.expires_at || undefined,
      }
      const res = await updateApiKey(currentKeyId.value, updateData)
      if (res.code === 200) {
        message.success('更新成功')
        showModal.value = false
        loadApiKeys()
      } else {
        message.error(res.message || '更新失败')
      }
    } else {
      // 添加模式
      const createData: ApiKeyCreate = {
        name: formData.value.name,
        notes: formData.value.notes || undefined,
        expires_at: formData.value.expires_at || undefined,
      }
      // 如果提供了自定义密钥
      if (formData.value.key) {
        createData.key = formData.value.key
      }
      const res = await createApiKey(createData)
      if (res.code === 200) {
        message.success('创建成功')
        showModal.value = false
        loadApiKeys()
      } else {
        message.error(res.message || '创建失败')
      }
    }
  } catch {
    message.error('操作失败')
  }
}

// 切换启用/禁用状态
const handleToggleActive = async (row: ApiKey) => {
  try {
    const res = await updateApiKey(row.id, { is_active: !row.is_active })
    if (res.code === 200) {
      message.success(row.is_active ? '已禁用' : '已启用')
      loadApiKeys()
    } else {
      message.error(res.message || '操作失败')
    }
  } catch {
    message.error('操作失败')
  }
}

// 删除密钥
const handleDelete = async (id: number) => {
  try {
    const res = await deleteApiKey(id)
    if (res.code === 200) {
      message.success('删除成功')
      loadApiKeys()
    } else {
      message.error(res.message || '删除失败')
    }
  } catch {
    message.error('删除失败')
  }
}

// 格式化时间
const formatTime = (time: string | null) => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}

// 复制到剪贴板
const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

// 表格列定义
const columns: DataTableColumns<ApiKey> = [
  {
    title: 'ID',
    key: 'id',
    width: 60,
  },
  {
    title: '名称',
    key: 'name',
    width: 120,
    ellipsis: {
      tooltip: true,
    },
  },
  {
    title: '密钥',
    key: 'key',
    width: 200,
    render(row) {
      // 显示前8位...后4位
      const shortKey =
        row.key.length > 16 ? `${row.key.slice(0, 12)}...${row.key.slice(-4)}` : row.key
      return h(NSpace, { size: 4, align: 'center', wrap: false }, () => [
        h(
          'span',
          {
            style: { fontFamily: 'monospace', fontSize: '12px' },
            title: row.key,
          },
          shortKey
        ),
        h(
          NButton,
          {
            size: 'tiny',
            quaternary: true,
            onClick: () => copyToClipboard(row.key),
          },
          {
            icon: () => h(NIcon, { size: 14 }, { default: () => h(CopyOutline) }),
          }
        ),
      ])
    },
  },
  {
    title: '状态',
    key: 'is_active',
    width: 80,
    render(row) {
      return h(
        NTag,
        {
          type: row.is_active ? 'success' : 'error',
          size: 'small',
        },
        { default: () => (row.is_active ? '启用' : '禁用') }
      )
    },
  },
  {
    title: '使用次数',
    key: 'usage_count',
    width: 90,
    render(row) {
      return h('span', {}, row.usage_count.toString())
    },
  },
  {
    title: '最后使用',
    key: 'last_used_at',
    width: 160,
    render(row) {
      return formatTime(row.last_used_at)
    },
  },
  {
    title: '过期时间',
    key: 'expires_at',
    width: 160,
    render(row) {
      if (!row.expires_at) {
        return h(NTag, { size: 'small', type: 'info' }, { default: () => '永不' })
      }
      const isExpired = new Date(row.expires_at) < new Date()
      return h(
        'span',
        { style: { color: isExpired ? '#d03050' : 'inherit' } },
        formatTime(row.expires_at)
      )
    },
  },
  {
    title: '操作',
    key: 'actions',
    width: 200,
    fixed: 'right',
    render(row) {
      return h(NSpace, { size: 'small' }, () => [
        h(
          NButton,
          {
            size: 'small',
            type: row.is_active ? 'warning' : 'success',
            onClick: () => handleToggleActive(row),
          },
          {
            default: () => (row.is_active ? '禁用' : '启用'),
            icon: () =>
              h(NIcon, null, {
                default: () => h(row.is_active ? CloseCircleOutline : CheckmarkCircleOutline),
              }),
          }
        ),
        h(
          NButton,
          {
            size: 'small',
            onClick: () => openEditModal(row),
          },
          {
            default: () => '编辑',
            icon: () => h(NIcon, null, { default: () => h(CreateOutline) }),
          }
        ),
        h(
          NPopconfirm,
          {
            onPositiveClick: () => handleDelete(row.id),
          },
          {
            trigger: () =>
              h(
                NButton,
                {
                  size: 'small',
                  type: 'error',
                },
                {
                  default: () => '删除',
                  icon: () => h(NIcon, null, { default: () => h(TrashOutline) }),
                }
              ),
            default: () => '确定要删除这个密钥吗？',
          }
        ),
      ])
    },
  },
]

onMounted(() => {
  loadApiKeys()
})
</script>

<template>
  <div class="api-key-manager">
    <n-card title="API 密钥管理">
      <template #header-extra>
        <n-space>
          <n-button @click="loadApiKeys" :loading="loading">
            <template #icon>
              <n-icon :component="RefreshOutline" />
            </template>
            刷新
          </n-button>
          <n-button type="primary" @click="openAddModal">
            <template #icon>
              <n-icon :component="AddOutline" />
            </template>
            添加密钥
          </n-button>
        </n-space>
      </template>

      <n-data-table
        :columns="columns"
        :data="apiKeys"
        :loading="loading"
        :bordered="false"
        :single-line="false"
        :scroll-x="1000"
      />
    </n-card>

    <!-- 添加/编辑弹窗 -->
    <n-modal
      v-model:show="showModal"
      :title="modalTitle"
      preset="dialog"
      style="width: 500px"
    >
      <n-form :model="formData" label-placement="left" label-width="90px">
        <n-form-item label="名称" required>
          <n-input
            v-model:value="formData.name"
            placeholder="请输入密钥名称"
          />
        </n-form-item>
        <n-form-item v-if="!isEdit" label="自定义密钥">
          <n-input
            v-model:value="formData.key"
            placeholder="留空则自动生成"
          />
        </n-form-item>
        <n-form-item v-if="isEdit" label="密钥">
          <n-input
            :value="formData.key"
            disabled
          />
        </n-form-item>
        <n-form-item label="过期时间">
          <n-date-picker
            :value="expiresAtTimestamp"
            type="datetime"
            clearable
            placeholder="留空则永不过期"
            style="width: 100%"
            @update:value="handleExpiresAtChange"
          />
        </n-form-item>
        <n-form-item label="备注">
          <n-input
            v-model:value="formData.notes"
            type="textarea"
            placeholder="可选备注信息"
            :rows="3"
          />
        </n-form-item>
      </n-form>
      <template #action>
        <n-space>
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" @click="handleSubmit">
            {{ isEdit ? '保存' : '添加' }}
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.api-key-manager {
  padding: 20px;
  min-height: 100vh;
  background: #f5f7f9;
}
</style>
