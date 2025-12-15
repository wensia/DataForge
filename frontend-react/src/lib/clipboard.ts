/**
 * 兼容 HTTP 域名的复制功能
 * 优先使用 Clipboard API，失败时回退到 execCommand
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // 优先尝试 Clipboard API (仅在安全上下文中可用)
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Clipboard API 失败，继续尝试 fallback
    }
  }

  // Fallback: 使用 textarea + execCommand (兼容 HTTP)
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0'
  textarea.setAttribute('readonly', '')
  document.body.appendChild(textarea)
  textarea.select()
  textarea.setSelectionRange(0, text.length) // 兼容移动端

  try {
    const success = document.execCommand('copy')
    return success
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}
