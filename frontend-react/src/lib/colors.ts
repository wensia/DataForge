/**
 * 全局 Tag/Badge 颜色配置
 *
 * 参考 Flowbite、Preline UI 等流行 UI 库的 soft badge 设计模式
 * 支持 soft(柔和)、solid(实心)、outline(边框) 三种样式
 */

export const tagColors = {
  // 语义颜色
  primary: {
    soft: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    solid: 'bg-blue-500 text-white dark:bg-blue-600',
    outline:
      'border border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400',
  },
  success: {
    soft: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    solid: 'bg-emerald-500 text-white dark:bg-emerald-600',
    outline:
      'border border-emerald-300 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400',
  },
  warning: {
    soft: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    solid: 'bg-amber-500 text-white dark:bg-amber-600',
    outline:
      'border border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400',
  },
  danger: {
    soft: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    solid: 'bg-rose-500 text-white dark:bg-rose-600',
    outline:
      'border border-rose-300 text-rose-600 dark:border-rose-700 dark:text-rose-400',
  },
  info: {
    soft: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
    solid: 'bg-sky-500 text-white dark:bg-sky-600',
    outline:
      'border border-sky-300 text-sky-600 dark:border-sky-700 dark:text-sky-400',
  },

  // 中性颜色
  gray: {
    soft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    solid: 'bg-gray-500 text-white dark:bg-gray-600',
    outline:
      'border border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-400',
  },

  // 扩展颜色（用于分类等场景）
  purple: {
    soft: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    solid: 'bg-purple-500 text-white dark:bg-purple-600',
    outline:
      'border border-purple-300 text-purple-600 dark:border-purple-700 dark:text-purple-400',
  },
  pink: {
    soft: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
    solid: 'bg-pink-500 text-white dark:bg-pink-600',
    outline:
      'border border-pink-300 text-pink-600 dark:border-pink-700 dark:text-pink-400',
  },
  indigo: {
    soft: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    solid: 'bg-indigo-500 text-white dark:bg-indigo-600',
    outline:
      'border border-indigo-300 text-indigo-600 dark:border-indigo-700 dark:text-indigo-400',
  },
  teal: {
    soft: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
    solid: 'bg-teal-500 text-white dark:bg-teal-600',
    outline:
      'border border-teal-300 text-teal-600 dark:border-teal-700 dark:text-teal-400',
  },
  cyan: {
    soft: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
    solid: 'bg-cyan-500 text-white dark:bg-cyan-600',
    outline:
      'border border-cyan-300 text-cyan-600 dark:border-cyan-700 dark:text-cyan-400',
  },
  orange: {
    soft: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    solid: 'bg-orange-500 text-white dark:bg-orange-600',
    outline:
      'border border-orange-300 text-orange-600 dark:border-orange-700 dark:text-orange-400',
  },
} as const

export type TagColorName = keyof typeof tagColors
export type TagColorStyle = 'soft' | 'solid' | 'outline'

/**
 * 获取 tag 颜色类名
 * @param color 颜色名称
 * @param style 样式类型 (soft | solid | outline)
 * @returns Tailwind CSS 类名
 */
export function getTagColorClass(
  color: TagColorName | string,
  style: TagColorStyle = 'soft'
): string {
  const colorConfig = tagColors[color as TagColorName]
  if (colorConfig) {
    return colorConfig[style]
  }
  // 如果颜色不存在，返回灰色
  return tagColors.gray[style]
}

/**
 * 获取所有可用的颜色名称
 */
export function getTagColorNames(): TagColorName[] {
  return Object.keys(tagColors) as TagColorName[]
}
