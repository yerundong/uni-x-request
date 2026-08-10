import { isDev, isValidStr, isObj, isStr, isArr } from './utils'

/**
 * @description 通过 object 数据生成 URL 查询字符串: "a=1&b=2&c=3"
 * 键和值默认进行编码，undefined 值会被跳过
 * @param {object} obj 目标对象
 * @returns {string} 查询字符串，无参数时返回空串
 */
const stringifyQuery = (obj = {}) => {
  const parts = []
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    // 跳过 undefined 值，避免拼出 "key=undefined"
    if (value === undefined) continue
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  }
  // 无参数时返回空串，避免出现孤立的 "?"
  if (!parts.length) return ''
  return parts.join('&')
}

/**
 * @description url写入restful
 * @param {string} url 请求url
 * @param {object} restfulObj restful参数
 */
const writeRestful = (url = '', restfulObj = {}) => {
  if (!isStr(url)) url = ''
  if (!isObj(restfulObj)) return url
  for (const key in restfulObj) {
    const reg = new RegExp(`{${key}}`, 'g')
    url = url.replace(reg, restfulObj[key])
  }
  return url
}

/**
 * @description url写入params
 * @param {string} url 请求url
 * @param {object} paramsObj params参数
 */
const writeParams = (url = '', paramsObj = {}) => {
  if (!isStr(url)) url = ''
  if (!isObj(paramsObj)) return url
  const query = stringifyQuery(paramsObj)
  // 无参数时原样返回
  if (!query) return url

  // 根据 url 当前的 query 状态决定连接符：
  //   a/b/c          → 追加 "?xxx"
  //   a/b/c? 或 a/b/c?x=1& → 追加 "xxx"
  //   a/b/c?x=1      → 追加 "&xxx"
  const hasQuery = url.includes('?')
  const endsWithSep = /[?&]$/.test(url)
  if (!hasQuery) return url + '?' + query
  if (endsWithSep) return url + query
  return url + '&' + query
}

/**
 * @description 清除 URL 中的重复斜杠
 * @param {string} url URL 地址
 * @returns 清除重复斜杠后的 URL 地址
 */
const clearDuplicateSlash = url => {
  if (!isStr(url)) return url

  // 分离 hash（# 及后面全部不处理）
  const [urlBody, hash] = url.split('#')
  // 分离 query（? 及后面全部不处理）
  const [protoPath, query] = urlBody.split('?')

  let result
  // 匹配 xxx:// 协议头
  const protoReg = /^(\w+:\/\/)(.+)?$/
  if (protoReg.test(protoPath)) {
    const [, scheme, rest] = protoPath.match(protoReg)
    // 协议后方所有连续斜杠统一合并为单斜杠
    const cleanRest = (rest ?? '').replace(/\/+/g, '/')
    // 去掉协议后开头多余斜杠，实现 xxx:///a → xxx://a
    result = scheme + cleanRest.replace(/^\//, '')
  } else {
    // 无协议纯路径，全局合并多斜杠
    result = protoPath.replace(/\/+/g, '/')
  }

  // 拼接回 query、hash
  if (query !== undefined) result += '?' + query
  if (hash !== undefined) result += '#' + hash
  return result
}

/**
 * @description 处理请求url
 * @param {object} ctx 请求上下文
 * @param {object} rewriteConfig 重写配置
 * @param {object} baseUrl 基础url
 * @returns {object} 处理后的url信息
 */
const handleUrl = ({ request, response }, rewriteConfig, baseUrl) => {
  const { url, apiUrl, restful, params, header, webProxy } = request

  // 若有 url 参数，直接使用该值
  if (isValidStr(url)) {
    const rq = {
      ...request,
      url: clearDuplicateSlash(writeParams(writeRestful(url, restful), params)),
    }
    delete rq.apiUrl
    delete rq.baseUrl
    return {
      request: rq,
      response,
    }
  }

  // baseUrl 优先使用 request.baseUrl，若为空则使用实例级别的 baseUrl
  const targetBaseUrl = isValidStr(request.baseUrl)
    ? request.baseUrl
    : isValidStr(baseUrl)
    ? baseUrl
    : ''

  // 将 restful、params 参数写入 url
  let finalBaseUrl = writeRestful(targetBaseUrl, restful)
  let finalApiUrl = writeParams(writeRestful(apiUrl, restful), params)
  let rewriteHit = false,
    finalHeader = header

  // 如果有配置重写, 并命中重写配置, 则将 baseUrl 替换成目标地址
  if (rewriteConfig?.length) {
    a: for (let i = 0, item; (item = rewriteConfig[i]); i++) {
      const { target, match, enable } = item
      const matches = isArr(match) ? match : [match]
      if (enable && isStr(target) && matches.length) {
        for (let i = 0, regApi; (regApi = matches[i]); i++) {
          if (
            new RegExp(regApi).test(finalBaseUrl) ||
            new RegExp(regApi).test(finalApiUrl)
          ) {
            finalBaseUrl = target
            rewriteHit = true
            break a
          }
        }
      }
    }
  }

  // 拼接
  let finalUrl = finalBaseUrl + finalApiUrl

  // 网页平台，开发环境，且配置了webProxy，则需要请求本地，代理到目标地址
  // #ifdef WEB || H5
  if (isDev && webProxy) {
    // 请求地址改为本地地址，代理到目标地址
    finalUrl = location.origin + finalApiUrl
    // 代理放在请求头，用于外部代理请求时获取
    finalHeader = Object.assign({}, header, {
      proxy: finalBaseUrl,
    })
  }
  // #endif

  return {
    request: {
      ...request,
      url: clearDuplicateSlash(finalUrl),
      header: finalHeader,
      baseUrl: targetBaseUrl,
    },
    response: {
      ...response,
      rewriteHit,
    },
  }
}

// ==================== 导出 ====================

export { clearDuplicateSlash, handleUrl }
