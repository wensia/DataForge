/**
 * Visual style definitions for the application.
 * Based on shadcn/ui's 5 visual styles.
 *
 * Each style defines a cohesive visual aesthetic including:
 * - Border radius treatment
 * - Font preferences
 * - Overall visual feel
 */

export const styles = [
  'lyra',
  'vega',
  'nova',
  'maia',
  'mira',
  'anthropic',
] as const

export type Style = (typeof styles)[number]

export const DEFAULT_STYLE: Style = 'lyra'

export interface StyleConfig {
  name: string
  radius: string
  font: string | null // null means user can customize font
  forceFont: boolean // whether to force the specified font
  label: {
    zh: string
    en: string
  }
  description: {
    zh: string
    en: string
  }
}

export const styleConfig: Record<Style, StyleConfig> = {
  lyra: {
    name: 'Lyra',
    radius: '0.25rem', // 4px - minimal/sharp
    font: 'jetbrains-mono',
    forceFont: true, // Force monospace font
    label: {
      zh: '天琴座',
      en: 'Lyra',
    },
    description: {
      zh: '方正锐利，技术感',
      en: 'Sharp & Technical',
    },
  },
  vega: {
    name: 'Vega',
    radius: '0.5rem', // 8px - classic
    font: null,
    forceFont: false,
    label: {
      zh: '织女星',
      en: 'Vega',
    },
    description: {
      zh: '经典平衡，通用',
      en: 'Classic & Balanced',
    },
  },
  nova: {
    name: 'Nova',
    radius: '0.375rem', // 6px - compact
    font: null,
    forceFont: false,
    label: {
      zh: '新星',
      en: 'Nova',
    },
    description: {
      zh: '紧凑布局，适合仪表盘',
      en: 'Compact Layout',
    },
  },
  maia: {
    name: 'Maia',
    radius: '0.75rem', // 12px - soft/rounded
    font: null,
    forceFont: false,
    label: {
      zh: '昴宿星',
      en: 'Maia',
    },
    description: {
      zh: '圆润柔和，友好',
      en: 'Soft & Rounded',
    },
  },
  mira: {
    name: 'Mira',
    radius: '0.25rem', // 4px - dense
    font: null,
    forceFont: false,
    label: {
      zh: '蒭藁增二',
      en: 'Mira',
    },
    description: {
      zh: '密集型，高信息密度',
      en: 'Dense & Compact',
    },
  },
  anthropic: {
    name: 'Anthropic',
    radius: '0.375rem', // 6px - balanced
    font: 'poppins', // Headings: Poppins, Body: Lora (handled in CSS)
    forceFont: true,
    label: {
      zh: 'Anthropic',
      en: 'Anthropic',
    },
    description: {
      zh: '温暖优雅，品牌风格',
      en: 'Warm & Elegant',
    },
  },
}
