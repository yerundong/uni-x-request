const {
  platform,
  ua,
  deviceType,
  miniProgram: { envVersion } = {},
} = uni.getSystemInfoSync()

/**
 * @description 是否移动端
 */
const isMobile = deviceType === 'phone'

/**
 * @description 是否dev模式
 */
const isDev = process.env.NODE_ENV === 'development'

/**
 * @description 是否小程序开发工具
 */
const isDevtool = platform === 'devtools' || ua?.includes?.('devtool')

/**
 * @description 是否 build 模式
 */
const isBuild = process.env.NODE_ENV === 'production'

/**
 * @description 是否是小程序平台
 */
const isMp = (() => {
  let res = false
  // #ifdef MP
  res = true
  // #endif
  return res
})()

/**
 * @description 是否网页平台
 */
const isWeb = (() => {
  let res = false
  // #ifdef H5 || WEB
  res = true
  // #endif
  return res
})()

/**
 * @description 是否正式版
 */
const isRelease = (isMp && envVersion === 'release') || (isWeb && isBuild)

/**
 * @description 睡眠函数
 * @param {LikeNumber} time 睡眠时间
 */
const sleep = async (time = 0) => {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve()
    }, time)
  })
}

/**
 * @description 是否 undefined 类型
 * @param {any} value 目标数据
 * @returns {boolean}
 */
const isUndef = value => value === undefined

/**
 * @description 是否 String 类型
 * @param {any} value 目标数据
 * @returns {boolean}
 */
const isStr = value => {
  return typeof value === 'string'
}

/**
 * @description 是否 Boolean 类型
 * @param {any} value 目标数据
 * @returns {boolean}
 */
const isBool = value => typeof value === 'boolean'

/**
 * @description 判断数据是否是 ValidString 类型，即非空字符类型
 * @param {any} value 目标数据
 * @returns {boolean}
 */
const isValidStr = value => isStr(value) && value !== ''

/**
 * @description 是否 Array 类型
 * @param {any} value 目标数据
 * @returns {boolean}
 */
const isArr = value => Array.isArray(value)

/**
 * @description 是否 Object 类型
 * @param {any} value 目标数据
 * @returns {boolean}
 */
const isObj = value => typeof value === 'object' && value !== null

/**
 * @description 是否 Function 类型
 * @param {any} value 目标数据
 * @returns {boolean}
 */
const isFunc = value => typeof value === 'function'

/**
 * @description 是否 Number 类型
 * @param {any} value 目标数据
 * @returns {boolean}
 */
const isValidNum = value => typeof value === 'number' && !Number.isNaN(value)

/**
 * @description 从对象中提取指定键值对
 * @param {object} obj 目标对象
 * @param {array} keys 目标键值对
 * @returns {object} 提取后的对象
 */
const pick = (obj, keys) => {
  const res = {}
  for (const key of keys) {
    if (isUndef(obj[key])) continue
    res[key] = obj[key]
  }
  return res
}

/**
 * @description 检查网络状态
 */
const checkNetwork = () => {
  return new Promise((resolve, reject) => {
    uni.getNetworkType({
      success(res) {
        // 明确断网才拦截；wifi/4g/2g/unknown 等均视为有网
        if (res.networkType === 'none') {
          reject()
        } else {
          resolve()
        }
      },
      fail() {
        // 查询网络状态失败时按有网处理，避免误拦截请求
        resolve()
      },
    })
  })
}

/**
 * @description 打印请求
 * @param {any} response 请求返回数据
 */
const printRequest = ({ request, response }) => {
  //  打印开关关闭时，或者正式环境时，不打印任何信息
  if (!request.print || isRelease) return

  // 前缀标识
  let prefixArr = []
  if (response.rewriteHit) {
    prefixArr.push('Rewrite')
  }
  if (request.header?.proxy) {
    prefixArr.push('proxy')
  }
  if (response.mockHit) {
    prefixArr.push('Mock')
  }
  if (response.cacheHit) {
    prefixArr.push('Cache')
  }

  let prefix = prefixArr.join('/')
  if (prefix) prefix = `<${prefix}> `

  // 颜色
  const styles = {
    red: '#FF0030',
    green: '#00FF80',
  }
  const styleKey = response.status ? 'green' : 'red'
  const color = styles?.[styleKey]

  // 请求标题
  const title = `${prefix}${request.name || 'unknown'}`

  // copyMock
  let copyMock = { content: '' }
  const copyObj = {
    url: request.apiUrl,
    method: request.method,
    enable: true,
    duration: 500,
    ...pick(response, ['errCode', 'errMsg', 'status', 'data']),
  }
  copyMock = JSON.stringify(copyObj)

  // 标题样式
  const cssTitle = `font-weight: bold; color: ${color};font-size: 18px;`
  // 键值样式
  const cssKey = `font-weight: bold; color: ${color};`

  if (isMobile && !isDevtool) {
    console['log'](`%c ${title}`, cssTitle, {
      Request: request,
      Response: response,
    })
  } else {
    console.groupCollapsed(`%c${title}`, cssTitle)
    console['log'](`%cRequest:`, cssKey, request)
    console['log'](`%cResponse:`, cssKey, response)
    console.groupCollapsed(`%cCopyMock`, cssKey)
    console['log'](copyMock)
    console.groupEnd()
    console.groupEnd()
  }
}

/**
 * @description 递归构建 api 服务树：支持命名空间无限嵌套
 * @param {array} config 接口配置
 * @param {object} instance 请求实例（提供 request / getUrl 方法）
 * @returns {object} api 服务树
 */
const buildApiService = (config, instance) => {
  const apiServ = {}

  // 绑定实例方法，避免脱绑调用丢失 this（request/getUrl 内部都依赖实例上下文）
  const { request, getUrl } = instance
  const requestBound = request.bind(instance)
  const getUrlBound = getUrl.bind(instance)

  // path 记录命名空间路径（如 "valueOf"），用于生成接口全名（如 "valueOf.getValueByKey1"）
  const buildService = (config, target, path = '') => {
    for (const item of config) {
      const { name, namespace, children } = item

      // 命名空间分组
      if (isValidStr(namespace)) {
        if (target[namespace] !== undefined) {
          !isRelease &&
            console.warn(
              `[uni-x-request] 接口命名空间 "${namespace}" 重名，已忽略本次定义`
            )
          continue
        }
        target[namespace] = {}
        if (isArr(children)) {
          buildService(
            children,
            target[namespace],
            path ? `${path}.${namespace}` : namespace
          )
        }
        continue
      }

      // 普通接口
      if (isValidStr(name)) {
        if (target[name] !== undefined) {
          !isRelease &&
            console.warn(
              `[uni-x-request] 接口方法 "${name}" 重名，已忽略本次定义`
            )
          continue
        }
        // 普通接口方法
        target[name] = immediateOptions => {
          // 合并定义配置和即时配置
          const options = { ...item, ...immediateOptions }
          // 命名空间下的接口记录命名空间路径（一层如 "namespace1"，两层如 "namespace1.namespace2"，以此类推）
          // abort 注册表会据此生成接口全名（namespace.name）作为 key
          if (path) options.namespace = path
          return requestBound(options)
        }
        // 获取处理后的请求 url
        target[name].getUrl = immediateOptions => {
          // 合并定义配置和即时配置
          const options = { ...item, ...immediateOptions }
          // 与请求入口保持一致，记录命名空间路径
          if (path) options.namespace = path
          return getUrlBound(options)
        }
      }
    }
  }

  buildService(config, apiServ)
  return apiServ
}

// ==================== 导出 ====================

export {
  isMobile,
  isDev,
  isDevtool,
  isBuild,
  isMp,
  isWeb,
  isRelease,
  sleep,
  isUndef,
  isStr,
  isBool,
  isValidStr,
  isArr,
  isObj,
  isFunc,
  isValidNum,
  pick,
  checkNetwork,
  printRequest,
  buildApiService,
}
