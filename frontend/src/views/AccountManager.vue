<script setup lang="ts">
import { ref, onMounted, h, computed } from 'vue'
import {
  NCard,
  NButton,
  NSpace,
  NDataTable,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NTag,
  NPopconfirm,
  NIcon,
  NSelect,
  NSpin,
  NAlert,
  useMessage,
  type DataTableColumns,
  type SelectOption,
} from 'naive-ui'
import {
  AddOutline,
  RefreshOutline,
  CreateOutline,
  TrashOutline,
  LogInOutline,
  CheckmarkCircleOutline,
  CopyOutline,
} from '@vicons/ionicons5'
import {
  getAccounts,
  createOrUpdateAccount,
  updateAccount,
  deleteAccount,
  loginAccount,
  checkAndGetUsers,
  type Account,
  type CreateAccountParams,
  type CompanyInfo,
} from '@/api/accounts'

const message = useMessage()

// 账号列表
const accounts = ref<Account[]>([])
const loading = ref(false)

// 弹窗控制
const showModal = ref(false)
const modalTitle = ref('添加账号')
const isEdit = ref(false)
const currentAccountId = ref<number | null>(null)

// 验证状态
const verifying = ref(false)
const verified = ref(false)
const companyList = ref<CompanyInfo[]>([])

// 表单数据
const formData = ref<CreateAccountParams>({
  phone: '',
  password: '',
  company_code: '',
  company_name: '',
  domain: '',
})

// 公司选项
const companyOptions = computed<SelectOption[]>(() => {
  return companyList.value.map(c => ({
    label: c.company,
    value: c.companyCode,
  }))
})

// 加载账号列表
const loadAccounts = async () => {
  loading.value = true
  try {
    const res = await getAccounts()
    if (res.code === 200) {
      accounts.value = res.data || []
    } else {
      message.error(res.message || '加载失败')
    }
  } catch (error) {
    message.error('加载账号列表失败')
  } finally {
    loading.value = false
  }
}

// 重置表单
const resetForm = () => {
  formData.value = {
    phone: '',
    password: '',
    company_code: '',
    company_name: '',
    domain: '',
  }
  verified.value = false
  companyList.value = []
}

// 打开添加弹窗
const openAddModal = () => {
  isEdit.value = false
  modalTitle.value = '添加账号'
  currentAccountId.value = null
  resetForm()
  showModal.value = true
}

// 打开编辑弹窗
const openEditModal = (account: Account) => {
  isEdit.value = true
  modalTitle.value = '编辑账号'
  currentAccountId.value = account.id
  formData.value = {
    phone: account.phone,
    password: '',
    company_code: account.company_code,
    company_name: account.company_name,
    domain: '',
  }
  verified.value = true // 编辑模式不需要重新验证
  companyList.value = []
  showModal.value = true
}

// 验证账号
const handleVerify = async () => {
  if (!formData.value.phone) {
    message.warning('请输入手机号')
    return
  }
  if (!formData.value.password) {
    message.warning('请输入密码')
    return
  }

  verifying.value = true
  try {
    const res = await checkAndGetUsers(formData.value.phone, formData.value.password)
    if (res.code === 200 && res.data?.json?.code === 10000) {
      const companies = res.data.json.data || []
      if (companies.length === 0) {
        message.error('该账号没有关联的公司')
        return
      }
      companyList.value = companies
      verified.value = true
      // 默认选择第一个公司
      if (companies.length > 0) {
        formData.value.company_code = companies[0].companyCode
        formData.value.company_name = companies[0].company
        formData.value.domain = companies[0].domain || ''
      }
      message.success(`验证成功，找到 ${companies.length} 个公司`)
    } else {
      message.error(res.data?.json?.msg || res.message || '验证失败')
    }
  } catch (error) {
    message.error('验证失败，请检查账号密码')
  } finally {
    verifying.value = false
  }
}

// 选择公司
const handleCompanyChange = (value: string) => {
  const company = companyList.value.find(c => c.companyCode === value)
  if (company) {
    formData.value.company_code = company.companyCode
    formData.value.company_name = company.company
    formData.value.domain = company.domain || ''
  }
}

// 提交表单
const handleSubmit = async () => {
  if (!formData.value.phone) {
    message.warning('请输入手机号')
    return
  }
  if (!isEdit.value && !formData.value.password) {
    message.warning('请输入密码')
    return
  }
  if (!isEdit.value && !verified.value) {
    message.warning('请先验证账号')
    return
  }
  if (!isEdit.value && !formData.value.company_code) {
    message.warning('请选择公司')
    return
  }

  try {
    if (isEdit.value && currentAccountId.value) {
      // 编辑模式：只更新密码
      if (!formData.value.password) {
        message.warning('请输入新密码')
        return
      }
      const res = await updateAccount(currentAccountId.value, {
        password: formData.value.password,
      })
      if (res.code === 200) {
        message.success('更新成功')
        showModal.value = false
        loadAccounts()
      } else {
        message.error(res.message || '更新失败')
      }
    } else {
      // 添加模式：创建或更新（Upsert）
      const res = await createOrUpdateAccount(formData.value)
      if (res.code === 200) {
        message.success(res.message || '操作成功')
        showModal.value = false
        loadAccounts()
      } else {
        message.error(res.message || '操作失败')
      }
    }
  } catch (error) {
    message.error('操作失败')
  }
}

// 删除账号
const handleDelete = async (id: number) => {
  try {
    const res = await deleteAccount(id)
    if (res.code === 200) {
      message.success('删除成功')
      loadAccounts()
    } else {
      message.error(res.message || '删除失败')
    }
  } catch (error) {
    message.error('删除失败')
  }
}

// 登录账号
const handleLogin = async (id: number) => {
  const loadingMessage = message.loading('正在登录...', { duration: 0 })
  try {
    const res = await loginAccount(id)
    loadingMessage.destroy()
    if (res.code === 200) {
      message.success('登录成功')
      loadAccounts()
    } else {
      message.error(res.message || '登录失败')
    }
  } catch (error) {
    loadingMessage.destroy()
    message.error('登录失败')
  }
}

// 格式化时间
const formatTime = (time: string | null) => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}

// 复制到剪贴板
const copyToClipboard = async (text: string | number) => {
  try {
    await navigator.clipboard.writeText(String(text))
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

// 表格列定义
const columns: DataTableColumns<Account> = [
  {
    title: 'ID',
    key: 'id',
    width: 50,
  },
  {
    title: '云客用户ID',
    key: 'user_id',
    width: 140,
    render(row) {
      if (!row.user_id) {
        return h(NTag, { size: 'small', type: 'warning' }, { default: () => '未登录' })
      }
      // 截取显示前8位...后4位
      const shortId = row.user_id.length > 12 
        ? `${row.user_id.slice(0, 8)}...${row.user_id.slice(-4)}`
        : row.user_id
      return h(
        NSpace,
        { size: 4, align: 'center', wrap: false },
        () => [
          h(
            'span',
            { 
              style: { fontFamily: 'monospace', fontSize: '12px' },
              title: row.user_id,
            },
            shortId
          ),
          h(
            NButton,
            {
              size: 'tiny',
              quaternary: true,
              onClick: () => copyToClipboard(row.user_id!),
            },
            {
              icon: () => h(NIcon, { size: 14 }, { default: () => h(CopyOutline) }),
            }
          ),
        ]
      )
    },
  },
  {
    title: '手机号',
    key: 'phone',
    width: 120,
  },
  {
    title: '公司名称',
    key: 'company_name',
    minWidth: 180,
    ellipsis: {
      tooltip: true,
    },
  },
  {
    title: '公司代码',
    key: 'company_code',
    width: 90,
  },
  {
    title: '状态',
    key: 'status',
    width: 70,
    render(row) {
      return h(
        NTag,
        {
          type: row.status === 1 ? 'success' : 'error',
          size: 'small',
        },
        { default: () => (row.status === 1 ? '在线' : '离线') }
      )
    },
  },
  {
    title: '最后登录',
    key: 'last_login',
    width: 160,
    render(row) {
      return formatTime(row.last_login)
    },
  },
  {
    title: '操作',
    key: 'actions',
    width: 180,
    fixed: 'right',
    render(row) {
      return h(NSpace, { size: 'small' }, () => [
        h(
          NButton,
          {
            size: 'small',
            type: 'primary',
            onClick: () => handleLogin(row.id),
          },
          {
            default: () => '登录',
            icon: () => h(NIcon, null, { default: () => h(LogInOutline) }),
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
            default: () => '确定要删除这个账号吗？',
          }
        ),
      ])
    },
  },
]

onMounted(() => {
  loadAccounts()
})
</script>

<template>
  <div class="account-manager">
    <n-card title="云客账号管理">
      <template #header-extra>
        <n-space>
          <n-button @click="loadAccounts" :loading="loading">
            <template #icon>
              <n-icon :component="RefreshOutline" />
            </template>
            刷新
          </n-button>
          <n-button type="primary" @click="openAddModal">
            <template #icon>
              <n-icon :component="AddOutline" />
            </template>
            添加账号
          </n-button>
        </n-space>
      </template>

      <n-data-table
        :columns="columns"
        :data="accounts"
        :loading="loading"
        :bordered="false"
        :single-line="false"
      />
    </n-card>

    <!-- 添加/编辑弹窗 -->
    <n-modal
      v-model:show="showModal"
      :title="modalTitle"
      preset="dialog"
      style="width: 500px"
    >
      <n-spin :show="verifying">
        <n-form :model="formData" label-placement="left" label-width="80px">
          <n-form-item label="手机号" required>
            <n-input
              v-model:value="formData.phone"
              placeholder="请输入手机号"
              :disabled="isEdit || verified"
            />
          </n-form-item>
          <n-form-item :label="isEdit ? '新密码' : '密码'" :required="true">
            <n-input
              v-model:value="formData.password"
              type="password"
              show-password-on="click"
              :placeholder="isEdit ? '请输入新密码' : '请输入密码'"
              :disabled="!isEdit && verified"
            />
          </n-form-item>

          <!-- 添加模式：验证按钮 -->
          <n-form-item v-if="!isEdit && !verified" label=" ">
            <n-button type="primary" @click="handleVerify" :loading="verifying">
              <template #icon>
                <n-icon :component="CheckmarkCircleOutline" />
              </template>
              验证账号
            </n-button>
          </n-form-item>

          <!-- 验证成功提示 -->
          <n-form-item v-if="!isEdit && verified" label=" ">
            <n-alert type="success" :show-icon="true">
              账号验证成功，请选择要添加的公司
            </n-alert>
          </n-form-item>

          <!-- 公司选择 -->
          <n-form-item v-if="!isEdit && verified" label="公司" required>
            <n-select
              v-model:value="formData.company_code"
              :options="companyOptions"
              placeholder="请选择公司"
              @update:value="handleCompanyChange"
            />
          </n-form-item>

          <!-- 编辑模式：显示公司信息 -->
          <n-form-item v-if="isEdit" label="公司">
            <n-input :value="formData.company_name" disabled />
          </n-form-item>
          <n-form-item v-if="isEdit" label="公司代码">
            <n-input :value="formData.company_code" disabled />
          </n-form-item>
        </n-form>
      </n-spin>
      <template #action>
        <n-space>
          <n-button @click="showModal = false">取消</n-button>
          <n-button
            v-if="!isEdit && verified"
            type="info"
            @click="resetForm"
          >
            重新验证
          </n-button>
          <n-button
            type="primary"
            @click="handleSubmit"
            :disabled="!isEdit && !verified"
          >
            {{ isEdit ? '保存' : '添加' }}
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.account-manager {
  padding: 20px;
  min-height: 100vh;
  background: #f5f7f9;
}
</style>
