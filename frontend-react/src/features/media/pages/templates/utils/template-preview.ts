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
  const combinedCss = [BASE_STYLES, css].filter(Boolean).join('\n')
  const safeHtml = html || ''

  if (!safeHtml) {
    return `<!doctype html><html><head><meta charset="utf-8" /><style>${combinedCss}</style></head><body></body></html>`
  }

  if (/<html[\s>]/i.test(safeHtml)) {
    if (!combinedCss) {
      return safeHtml
    }

    if (/<head[\s>]/i.test(safeHtml)) {
      return safeHtml.replace(
        /<\/head>/i,
        `<style>${combinedCss}</style></head>`
      )
    }

    return safeHtml.replace(
      /<html[^>]*>/i,
      (match) => `${match}<head><style>${combinedCss}</style></head>`
    )
  }

  return `<!doctype html><html><head><meta charset="utf-8" /><style>${combinedCss}</style></head><body>${safeHtml}</body></html>`
}
