/** 模板变量信息 */
export interface TemplateVariable {
  name: string
  label: string | null
  default_value: string | null
  placeholder: string | null
  required: boolean
}

/** 模板分类 */
export interface TemplateCategory {
  id: number
  name: string
  description: string | null
  color: string | null
  sort_order: number
  is_active: boolean
  template_count: number
  created_at: string
  updated_at: string
}

/** HTML 模板 */
export interface HtmlTemplate {
  id: number
  name: string
  description: string | null
  html_content: string
  css_content: string | null
  variables: TemplateVariable[] | null
  thumbnail: string | null
  width: number
  height: number
  category_id: number | null
  category_name: string | null
  is_active: boolean
  use_count: number
  created_by: number | null
  is_system: boolean
  owner_id: number | null
  created_at: string
  updated_at: string
}

/** 创建模板请求 */
export interface HtmlTemplateCreate {
  name: string
  description?: string
  html_content: string
  css_content?: string
  variables?: TemplateVariable[]
  width?: number
  height?: number
  category_id?: number
  is_active?: boolean
  is_system?: boolean // 仅管理员可设置为 true
}

/** 更新模板请求 */
export interface HtmlTemplateUpdate {
  name?: string
  description?: string
  html_content?: string
  css_content?: string
  variables?: TemplateVariable[]
  thumbnail?: string
  width?: number
  height?: number
  category_id?: number
  is_active?: boolean
}

/** 创建分类请求 */
export interface TemplateCategoryCreate {
  name: string
  description?: string
  color?: string
  sort_order?: number
  is_active?: boolean
}

/** 渲染结果 */
export interface RenderResult {
  html: string
  css: string | null
  width: number
  height: number
}
