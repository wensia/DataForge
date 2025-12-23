import type { TemplateVariable } from '../data/schema'

/**
 * 使用变量默认值替换 HTML 中的 {{变量名}} 占位符
 */
export function replaceVariablesWithDefaults(
  html: string,
  variables: TemplateVariable[] | null
): string {
  if (!variables || variables.length === 0) {
    return html
  }

  let result = html
  for (const variable of variables) {
    const placeholder = `{{${variable.name}}}`
    const value = variable.default_value || ''
    result = result.split(placeholder).join(value)
  }
  return result
}

const BASE_STYLES = `
  html,
  body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    background: #ffffff;
  }
  * {
    box-sizing: border-box;
  }
`

export function buildTemplateSrcDoc(html: string, css?: string | null) {
  const safeHtml = html || ''

  if (!safeHtml) {
    const combinedCss = [BASE_STYLES, css].filter(Boolean).join('\n')
    return `<!doctype html><html><head><meta charset="utf-8" /><style>${combinedCss}</style></head><body></body></html>`
  }

  // 完整 HTML 文档：只注入自定义 CSS，不注入 BASE_STYLES（避免覆盖原有样式）
  if (/<html[\s>]/i.test(safeHtml)) {
    if (!css) {
      return safeHtml
    }

    if (/<head[\s>]/i.test(safeHtml)) {
      return safeHtml.replace(
        /<\/head>/i,
        `<style>${css}</style></head>`
      )
    }

    return safeHtml.replace(
      /<html[^>]*>/i,
      (match) => `${match}<head><style>${css}</style></head>`
    )
  }

  // HTML 片段：需要注入 BASE_STYLES 来提供基础样式
  const combinedCss = [BASE_STYLES, css].filter(Boolean).join('\n')
  return `<!doctype html><html><head><meta charset="utf-8" /><style>${combinedCss}</style></head><body>${safeHtml}</body></html>`
}
