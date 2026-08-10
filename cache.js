import { isObj, pick, isValidNum, isUndef, isValidStr, isBool } from './utils'

// ==================== 内存缓存管理 ====================

/**
 * @description 接口缓存管理
 */
const RCM = {
  /**
   * @description 缓存数据
   * @property {string} caches[cacheId].id - 缓存 id（即 caches 的 key）
   * @property {boolean} caches[cacheId].persist - 是否持久化到本地存储
   * @property {string} caches[cacheId].class - 缓存类名
   * @property {number} caches[cacheId].expire - 缓存有效时长（毫秒）
   * @property {number} caches[cacheId].expireAt - 过期绝对时间点（时间戳）
   * @property {'throttle'|'debounce'} caches[cacheId].mode - 缓存模式: 'throttle'(命中不重置过期) | 'debounce'(每次命中重置过期)
   * @property {'pending'|'success'} caches[cacheId].status - 请求状态: 'pending'(请求中) | 'success'(成功)，失败结果不会被缓存
   * @property {any} caches[cacheId].response - 缓存的接口响应数据
   */
  caches: {},
  // 设置缓存
  setCache(cacheId, data) {
    this.caches[cacheId] = data
  },
  // 获取缓存
  getCacheById(cacheId) {
    return this.caches[cacheId]
  },
  // 根据缓存类名获取缓存数据
  getCacheByClass(cacheClass) {
    const list = []
    for (const cacheId in this.caches) {
      const item = this.caches[cacheId]
      if (item.class === cacheClass) {
        list.push(item)
      }
    }
    return list
  },
  // 根据缓存 id 删除缓存
  deleteCacheById(cacheId) {
    delete this.caches[cacheId]
    // 清理过期定时器，避免定时器泄漏或重复删除
    const timer = expireTimers.get(cacheId)
    if (timer) {
      clearTimeout(timer)
      expireTimers.delete(cacheId)
    }
    notifyWaiters(cacheId)
  },
  // 根据缓存类名删除缓存
  deleteCacheByClass(cacheClass) {
    for (const cacheId in this.caches) {
      const item = this.caches[cacheId]
      if (item.class === cacheClass) {
        this.deleteCacheById(cacheId)
      }
    }
  },
  // 删除所有缓存
  deleteAllCache() {
    for (const cacheId in this.caches) {
      this.deleteCacheById(cacheId)
    }
  },
  // 是否存在缓存
  isCacheExist(cacheId) {
    return !!this.caches[cacheId]
  },
}

// ==================== 等待者管理 ====================

/**
 * @description 等待者管理：缓存状态变化时主动通知等待该缓存的请求
 * 使用场景：同一请求并发多次，后到的请求等待先到的请求完成
 */
const waiters = new Map()

// 注册等待者，返回一个在缓存状态变化时 resolve 的 Promise（值为首个请求的响应结果）
const waitForCache = cacheId =>
  new Promise(resolve => {
    const list = waiters.get(cacheId) ?? new Set()
    list.add(resolve)
    waiters.set(cacheId, list)
  })

// 通知该缓存的所有等待者，状态已变化，并传递首个请求的响应结果
const notifyWaiters = (cacheId, value) => {
  const list = waiters.get(cacheId)
  if (!list) return
  waiters.delete(cacheId)
  for (const resolve of list) resolve(value)
}

// ==================== 过期定时器管理 ====================

/**
 * @description 过期定时器管理：cacheId -> 定时器 id
 * throttle：设缓存时启动，命中缓存不重置
 * debounce：每次命中缓存都重置
 */
const expireTimers = new Map()

// 启动过期定时器，到期删除缓存
const scheduleExpire = (cacheId, expire) => {
  if (!isValidNum(expire)) return
  // 先清旧定时器，避免并发恢复同一缓存时双开，孤儿定时器到点提前删除仍有效的缓存
  const old = expireTimers.get(cacheId)
  if (old) clearTimeout(old)
  const timer = setTimeout(() => {
    expireTimers.delete(cacheId)
    RCM.deleteCacheById(cacheId)
    // 内存定时器到期时同步清理本地存储，避免过期条目残留
    storageRemove(cacheId)
  }, expire)
  expireTimers.set(cacheId, timer)
}

// 重置过期定时器（debounce 模式命中时调用）
const resetExpire = (cacheId, expire) => {
  const old = expireTimers.get(cacheId)
  if (old) clearTimeout(old)
  scheduleExpire(cacheId, expire)
}

// ==================== 工具函数 ====================

/**
 * @description 检查是否开启缓存
 * @param {object} request 请求配置
 */
const isCacheEnable = request => {
  // 布尔简写：true 开启（用默认配置），false 关闭
  if (isBool(request.cache)) return request.cache
  // 对象配置：enable 缺省视为开启
  if (isObj(request.cache)) {
    if (isUndef(request.cache.enable)) return true
    if (isBool(request.cache.enable)) return request.cache.enable
  }
  return false
}

/**
 * @description 稳定序列化：递归对对象键排序，使 {a:1,b:2} 与 {b:2,a:1} 生成相同缓存键
 * 数组保持原序（数组元素顺序有语义，不能排序）
 * @param {any} value 目标数据
 */
const stableStringify = value =>
  JSON.stringify(value, (key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.keys(val)
        .sort()
        .reduce((acc, k) => {
          acc[k] = val[k]
          return acc
        }, {})
    }
    return val
  })

/**
 * @description 生成请求缓存 id
 * @param {object} request 请求配置
 */
const genCacheId = request => {
  const str = stableStringify(
    pick(request, ['url', 'data', 'params', 'restful', 'method'])
  )
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

/**
 * @description 获取请求缓存 id
 * @param {object} request 请求配置
 */
const getCacheId = request => {
  if (isValidStr(request.cache?.id)) return request.cache.id
  return genCacheId(request)
}

/**
 * @description 计算缓存条目的过期时间节点
 * expire 与 expireAt 设置任一即生效：设置了 expire 则以 expire 为准（expireAt 由其生成），否则取 expireAt
 * @param {number} [expire] 缓存有效时间（毫秒）
 * @param {number} [expireAt] 过期时间节点（时间戳）
 * @returns {number|undefined} 过期时间节点
 */
const getExpireAt = (expire, expireAt) => {
  if (isValidNum(expire)) return Date.now() + expire
  return isValidNum(expireAt) ? expireAt : undefined
}

// 计算到期前的剩余时间（毫秒），无过期时间节点时返回 undefined（永不过期）
const getRemainTime = expireAt =>
  isValidNum(expireAt) ? expireAt - Date.now() : undefined

// ==================== 本地存储适配 ====================

/**
 * @description 本地存储适配层：cache.persist 开启时，把成功结果持久化到本地
 * 采用"每条目一个 key"的布局（id -> 缓存条目），读写删均为 O(1)，避免整表读改写放大
 * 注意：写入失败（容量超限/序列化失败）时静默降级为仅内存缓存
 */
const STORAGE_KEY_PREFIX = '__UXR_CACHE:'

// 写入单个缓存条目
const storageSet = (cacheId, data) => {
  try {
    uni.setStorageSync(STORAGE_KEY_PREFIX + cacheId, data)
  } catch (e) {
    // 忽略：写入失败（容量超限/序列化失败），降级为仅内存缓存
  }
}

// 读取单个缓存条目
const storageGet = cacheId => {
  try {
    return uni.getStorageSync(STORAGE_KEY_PREFIX + cacheId) || null
  } catch (e) {
    return null
  }
}

// 删除单个缓存条目
const storageRemove = cacheId => {
  try {
    uni.removeStorageSync(STORAGE_KEY_PREFIX + cacheId)
  } catch (e) {
    // 忽略：key 不存在等场景无需处理
  }
}

// 获取所有持久化缓存 id
const storageGetAllIds = () => {
  try {
    const { keys } = uni.getStorageInfoSync()
    return keys
      .filter(key => key.startsWith(STORAGE_KEY_PREFIX))
      .map(key => key.slice(STORAGE_KEY_PREFIX.length))
  } catch (e) {
    return []
  }
}

// 读取本地存储中的整个缓存对象（批量场景：按类目查询/清除、冷启动清理）
const storageGetAll = () => {
  const map = {}
  for (const cacheId of storageGetAllIds()) {
    const entry = storageGet(cacheId)
    if (entry) map[cacheId] = entry
  }
  return map
}

// 清空本地存储中的整个缓存对象
const storageClear = () => {
  for (const cacheId of storageGetAllIds()) {
    storageRemove(cacheId)
  }
}

// 从本地存储读取并校验过期（过期即删除）；仅返回成功条目
const readFromStorage = cacheId => {
  const entry = storageGet(cacheId)
  if (!entry) return null
  // 本地存储没有定时器，靠 expireAt 惰性校验
  if (isValidNum(entry.expireAt) && Date.now() >= entry.expireAt) {
    storageRemove(cacheId)
    return null
  }
  return entry.status === 'success' ? entry : null
}

// ==================== 缓存读写 ====================

/**
 * @description 设置缓存为 pending 状态
 * @param {object} ctx 请求上下文
 */
const setPendingCache = async ({ request }) => {
  const cacheId = getCacheId(request)
  if (isCacheEnable(request)) {
    RCM.setCache(cacheId, {
      id: cacheId,
      persist: request.cache?.persist,
      status: 'pending',
      class: request.cache?.class,
      mode: request.cache?.mode || 'throttle',
      expire: request.cache?.expire,
      expireAt: getExpireAt(request.cache?.expire, request.cache?.expireAt),
    })
  }
}

/**
 * @description 将请求结果设置到缓存里（仅成功结果会被缓存）
 * @param {object} request 请求配置
 * @param {any} response 响应结果
 */
const setRequestCache = async ({ request, response }) => {
  const cacheId = getCacheId(request)
  if (
    isCacheEnable(request) &&
    RCM.isCacheExist(cacheId) &&
    !response.mockHit
  ) {
    const targetCache = RCM.getCacheById(cacheId)

    if (response.status) {
      // 首个请求完成（pending → success）时确定过期时间节点并启动定时器、持久化；
      // 缓存命中路径（status 已是 success）沿用原有过期时间节点，避免延长 throttle 的过期时间；
      // 例外：新配置给出更早的过期时间（如永久缓存升级为带 expire）时，只收紧不延长
      const isFirstComplete = targetCache?.status === 'pending'

      const cacheData = {
        id: cacheId,
        persist: request.cache?.persist,
        expire: request.cache?.expire,
        class: request.cache?.class,
        mode: request.cache?.mode || 'throttle',
        status: 'success',
        response,
      }

      if (isFirstComplete) {
        // expire 优先：设置了 expire 则 expireAt 由其生成，否则直接取配置的 expireAt
        cacheData.expireAt = getExpireAt(
          request.cache?.expire,
          request.cache?.expireAt
        )
        // 定时器按剩余时间启动：expire 场景等价于 expire 本身，仅设 expireAt 场景为 expireAt - now
        scheduleExpire(cacheId, getRemainTime(cacheData.expireAt))
      } else {
        // 缓存命中：沿用原有过期时间节点（避免延长 throttle 的过期时间）
        const existingExpireAt = targetCache.expireAt
        const newExpireAt = getExpireAt(
          request.cache?.expire,
          request.cache?.expireAt
        )
        // 过期时间只收紧不延长：
        // - 新配置未给过期时间 → 沿用原值（限时缓存不会被"升级"为永久）
        // - 原为永久缓存且新配置给出过期时间 → 采用新值（永久 → 带 expire）
        // - 两者均为限时 → 取更早者
        cacheData.expireAt = !isValidNum(newExpireAt)
          ? existingExpireAt
          : !isValidNum(existingExpireAt)
          ? newExpireAt
          : Math.min(existingExpireAt, newExpireAt)

        // 过期时间被收紧时：重排定时器，并同步持久化
        if (cacheData.expireAt !== existingExpireAt) {
          resetExpire(cacheId, getRemainTime(cacheData.expireAt))
          if (request.cache?.persist) {
            storageSet(cacheId, cacheData)
          }
        }
      }

      RCM.setCache(cacheId, cacheData)

      // persist 模式：额外持久化成功结果（与内存条目结构一致，含 expireAt）
      if (request.cache?.persist && isFirstComplete) {
        storageSet(cacheId, cacheData)
      }
    }

    // 通知等待者：该缓存已完成，可继续处理（失败时不缓存，直接传递失败结果）
    notifyWaiters(cacheId, response)

    // 失败结果不缓存：删除 pending 条目，下一次相同请求将重新发起
    if (!response.status) {
      RCM.deleteCacheById(cacheId)
      if (request.cache?.persist) {
        storageRemove(cacheId)
      }
    }
  }
}

/**
 * @description 从缓存中获取请求结果（响应数据和提示）
 * @param {object} request 请求参数
 */
const getRequestCache = async request => {
  if (isCacheEnable(request)) {
    const cacheId = getCacheId(request)
    let targetCache = RCM.getCacheById(cacheId)

    // 内存 miss 且开启持久化：尝试从本地存储恢复
    if (!targetCache && request.cache?.persist) {
      targetCache = readFromStorage(cacheId)
      if (targetCache) {
        // 提升到内存，并按剩余时间重排过期定时器
        RCM.setCache(cacheId, targetCache)
        scheduleExpire(cacheId, getRemainTime(targetCache.expireAt))
      }
    }

    // 若缓存里没有，返回 null
    if (!targetCache) return null

    // 请求状态
    const targetCacheStatus = targetCache?.status

    // 若缓存里有成功结果，直接返回响应
    if (targetCacheStatus === 'success') {
      // debounce 模式：每次命中都重置过期定时器，并同步更新内存与本地存储的过期时间节点
      if (targetCache.mode === 'debounce') {
        const expireAt = getExpireAt(targetCache.expire, targetCache.expireAt)
        targetCache.expireAt = expireAt
        // 有 expire 则按时长延长；仅设 expireAt 时维持原截止时间点
        resetExpire(cacheId, getRemainTime(expireAt))
        if (request.cache?.persist) {
          storageSet(cacheId, targetCache)
        }
      }
      return targetCache.response
    }

    // 若缓存里有正在请求的，等待它请求完成
    // 成功时返回首个请求的响应；失败时缓存已清除，直接拿到首个请求的失败响应
    if (targetCacheStatus === 'pending') {
      return await waitForCache(cacheId)
    }
  }
}

/**
 * @description 获取缓存响应
 * @param {object} ctx 请求上下文
 * @returns {object} 缓存响应结果
 */
const getCacheResponse = async ({ request, response }) => {
  // 获取缓存响应结果
  const cacheResponse = await getRequestCache(request)

  let finalResponse

  // 若有缓存结果, 更新 data、cacheHit
  if (cacheResponse) {
    finalResponse = {
      ...response,
      ...cacheResponse,
      cacheHit: true,
    }
  }
  return finalResponse
}

// ==================== 缓存查询与清除 ====================

/**
 * @description 根据缓存 id 获取缓存数据
 * @param {string} [cacheId] 缓存id
 * @returns {object} 缓存数据
 */
const getCacheById = cacheId =>
  RCM.getCacheById(cacheId) || readFromStorage(cacheId)

/**
 * @description 根据缓存类名获取缓存数据（内存 + 本地存储，存储条目会校验过期并清理）
 * @param {string} [cacheClass] 缓存类名
 * @returns {array} 缓存数据
 */
const getCacheByClass = cacheClass => {
  // 内存条目（可能含 pending 状态，保留原语义）
  const memoryList = RCM.getCacheByClass(cacheClass)
  const memoryIds = new Set(memoryList.map(item => item.id))

  // 补充本地存储条目：按 class 过滤 + 校验过期（内存已有的 id 不重复返回）
  const map = storageGetAll()
  for (const cacheId in map) {
    if (memoryIds.has(cacheId)) continue
    const entry = map[cacheId]
    if (entry?.class !== cacheClass) continue
    // 过期条目静默清理
    if (isValidNum(entry?.expireAt) && Date.now() >= entry.expireAt) {
      storageRemove(cacheId)
      continue
    }
    // 仅成功条目可查询
    if (entry?.status === 'success') {
      memoryList.push(entry)
    }
  }
  return memoryList
}

/**
 * @description 清除缓存（内存 + 本地存储）
 * @param {string} [cacheId] 缓存id
 */
const clearCacheById = cacheId => {
  RCM.deleteCacheById(cacheId)
  storageRemove(cacheId)
}

/**
 * @description 批量清除缓存（内存 + 本地存储）
 * @param {string} [cacheClass] 缓存类名
 */
const clearCacheByClass = cacheClass => {
  RCM.deleteCacheByClass(cacheClass)
  // 同步清理本地存储中同 class 的条目
  const map = storageGetAll()
  for (const cacheId in map) {
    if (map[cacheId]?.class === cacheClass) {
      storageRemove(cacheId)
    }
  }
}

/**
 * @description 清除所有缓存（内存 + 本地存储）
 */
const clearAllCache = () => {
  RCM.deleteAllCache()
  // 清空本地存储中的缓存对象
  storageClear()
}

// ==================== 冷启动清理 ====================

// 清理本地存储中已过期的残留条目（幂等，逐条删除，无整表写回）
const sweepExpiredStorage = () => {
  const map = storageGetAll()
  const now = Date.now()
  for (const cacheId in map) {
    const entry = map[cacheId]
    if (isValidNum(entry?.expireAt) && now >= entry.expireAt) {
      storageRemove(cacheId)
    }
  }
}

// 模块加载时执行一次（ES 模块单例，与实例化次数无关）；延迟到当前任务之后，不阻塞启动
setTimeout(sweepExpiredStorage, 0)

// ==================== 导出 ====================

export {
  setPendingCache,
  setRequestCache,
  getCacheResponse,
  getCacheById,
  getCacheByClass,
  clearCacheById,
  clearCacheByClass,
  clearAllCache,
}
