import { isDev, isArr, isFunc } from './utils'

/**
 * @description 处理 mock 请求
 * @param {object} request 请求配置
 * @param {array} mockConfig mock 配置项
 * @returns {object | undefined} 命中的 mock 响应，未命中返回 undefined
 */
const getMockResponse = async (request, mockConfig) => {
  // 仅开发模式需要 mock
  if (!isDev) return

  let mockHitConfig

  // 检测 mock 是否命中，主要判断 url、method 是否匹配
  for (const item of mockConfig) {
    // 未启用或 method 不匹配的配置项直接跳过
    if (
      !item.enable ||
      request.method?.toLowerCase() !== item.method?.toLowerCase()
    ) {
      continue
    }

    // url 支持单个字符串或字符串数组，任一命中即视为匹配
    const urls = isArr(item.url) ? item.url : [item.url]
    const isHit = urls.some(match => new RegExp(match).test(request.url))

    if (isHit) {
      mockHitConfig = { status: 1, ...item }
      break
    }
  }

  // 未命中任何 mock 配置
  if (!mockHitConfig) return

  // data 支持函数形式动态生成
  mockHitConfig.data = isFunc(mockHitConfig.data)
    ? mockHitConfig.data()
    : mockHitConfig.data

  // 剥离 mock 配置的控制字段（enable），避免混入响应数据
  const mockResponse = { ...mockHitConfig, mockHit: true }
  delete mockResponse.enable

  return mockResponse
}

// ==================== 导出 ====================

export { getMockResponse }
