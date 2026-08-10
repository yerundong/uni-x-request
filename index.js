/**
 * 待做
 * 1. 上传/下载方法
 * 2. 重试机制
 */
import {
  buildApiService,
  printRequest,
  checkNetwork,
  isFunc,
  pick,
  sleep,
} from './utils'
import { getMockResponse } from './mock'
import { handleUrl } from './url'
import {
  abortRequest,
  abortAllRequest,
  abortRequestByInstance,
  abortAllRequestByInstance,
  registerPendingRequest,
  removePendingRequest,
  attachRequestTaskMethods,
} from './requestTask'
import {
  setRequestCache,
  getCacheResponse,
  setPendingCache,
  clearCacheById,
  clearCacheByClass,
  clearAllCache,
  getCacheByClass,
  getCacheById,
} from './cache'
import {
  handleShowLoading,
  handleConfirm,
  handleSuccessTip,
  handleErrorTip,
  setErrorMessage,
  setPresetErrorByKey,
  setPresetErrorByCode,
} from './message'
import {
  UNI_REQUEST_FIELDS,
  REQUEST_FIELDS,
  DEFAULT_INSTANCE_CONFIG,
  DEFAULT_PRESET_ERROR_CONFIG,
  DEFAULT_RESPONSE,
} from './enum'

/**
 * @description 封装请求类
 * @param {object} options 实例配置
 * @param {array} options.apiConfig 接口配置
 * @param {array} options.rewriteConfig 重写配置
 * @param {array} options.mockConfig mock 配置
 * @param {string} options.defaultMessage 默认错误消息
 * @param 其他字段请参考 request 方法入参的字段说明
 */
class UniXRequest {
  constructor(options) {
    // 将默认配置、参数配置合并到实例上
    // 注意：有些需要惰性求值的字段在私有 getter 里二次处理
    Object.assign(this, DEFAULT_INSTANCE_CONFIG, options)
  }

  // 并发请求的 loading 计数，归零才隐藏全局 loading
  #loadingCount = 0

  // 基础路径 getter
  get #baseUrl() {
    const baseUrl = this.baseUrl
    return isFunc(baseUrl) ? baseUrl() : baseUrl
  }

  // 接口配置 getter
  get #apiConfig() {
    const apiConfig = this.apiConfig
    return isFunc(apiConfig) ? apiConfig() : apiConfig
  }

  // 获取 api 服务
  getApiService() {
    const apiConfig = this.#apiConfig
    return buildApiService(apiConfig, this)
  }

  // 重写配置 getter
  get #rewriteConfig() {
    const rewriteConfig = this.rewriteConfig
    return isFunc(rewriteConfig) ? rewriteConfig() : rewriteConfig
  }

  // mock 配置项 getter
  get #mockConfig() {
    const mockConfig = this.mockConfig
    return isFunc(mockConfig) ? mockConfig() : mockConfig
  }

  // 预设错误配置 getter
  get #presetErrorConfig() {
    const presetErrorConfig = this.presetErrorConfig
    const pec = isFunc(presetErrorConfig)
      ? presetErrorConfig()
      : presetErrorConfig
    return { ...DEFAULT_PRESET_ERROR_CONFIG, ...pec }
  }

  // 合并默认请求配置：从实例配置里取默认请求配置，再与传入配置合并
  #mergeDefaultRequest(options) {
    const defaultRequest = pick(this, REQUEST_FIELDS)
    return Object.assign({}, defaultRequest, options)
  }

  /**
   * @description 根据缓存 id 获取缓存数据（缓存为全局共享，静态方法与实例方法操作同一份数据）
   * @param {string} cacheId 缓存 id
   * @returns {object} 缓存数据
   */
  static getCacheById = getCacheById

  /**
   * @description 根据缓存类名获取缓存数据（缓存为全局共享，静态方法与实例方法操作同一份数据）
   * @param {string} cacheClass 缓存类名
   * @returns {array} 缓存数据
   */
  static getCacheByClass = getCacheByClass

  /**
   * @description 清除指定缓存（缓存为全局共享，静态方法与实例方法操作同一份数据）
   * @param {string} cacheId 缓存 id
   */
  static clearCacheById = clearCacheById

  /**
   * @description 按缓存类名批量清除（缓存为全局共享，静态方法与实例方法操作同一份数据）
   * @param {string} cacheClass 缓存类名
   */
  static clearCacheByClass = clearCacheByClass

  /**
   * @description 清除所有缓存（缓存为全局共享，静态方法与实例方法操作同一份数据）
   */
  static clearAllCache = clearAllCache

  /**
   * @description 中断指定接口名的进行中请求（全局：中断所有实例中该接口名的请求）
   * @param {string} name 接口名（api 配置里的 name；命名空间接口支持传全名 namespace.name）
   */
  static abortRequest = abortRequest

  /**
   * @description 中断所有进行中请求（全局：中断所有实例的全部请求）
   */
  static abortAllRequest = abortAllRequest

  /**
   * @description 中断本实例指定接口名的进行中请求（仅本实例；需要全局中断用 UniXRequest.abortRequest）
   * @param {string} name 接口名（api 配置里的 name；命名空间接口支持传全名 namespace.name）
   */
  abortRequest(name) {
    abortRequestByInstance(name, this)
  }

  /**
   * @description 中断本实例的所有进行中请求（仅本实例；需要全局中断用 UniXRequest.abortAllRequest）
   */
  abortAllRequest() {
    abortAllRequestByInstance(this)
  }

  /**
   * @description 获取处理后的请求 url
   * @param {object} options 请求配置
   * @returns {string} 处理后的请求 url
   */
  getUrl(options) {
    // 合并默认请求配置
    const request = this.#mergeDefaultRequest(options)
    const {
      request: { url },
    } = handleUrl({
      request,
      response: {},
      rewriteConfig: this.#rewriteConfig,
      baseUrl: this.#baseUrl,
    })
    return url
  }

  /**
   * @description 返回请求结果，以及请求结束后执行求统一的打印、提示、缓存出处理
   * @param {object} ctx 请求上下文
   */
  async #returnRequest(ctx) {
    // 请求已结束，从进行中请求注册表注销
    removePendingRequest(ctx)

    // 中断请求统一收尾：不论响应原本成功还是失败，只要有 abort 标记就强制转为中断失败
    if (ctx.abortFlag) {
      ctx.response.status = 0
      delete ctx.response.data
      ctx.errorMessage = setPresetErrorByKey(
        'abortRequest',
        this.#presetErrorConfig,
        ctx.errorMessage
      )
    }

    // 请求返回后，将请求结果写入缓存
    await setRequestCache(ctx)

    // 隐藏 loading：并发请求计数归零才隐藏
    if (ctx.loading) {
      this.#loadingCount--
      if (this.#loadingCount <= 0) {
        this.#loadingCount = 0
        uni.hideLoading()
      }
    }

    // 请求成功
    if (ctx.response.status) {
      const response = await handleSuccessTip(ctx)
      ctx.response = response
    }
    // 请求失败
    else {
      const { errorMessage, response } = await handleErrorTip(ctx)
      ctx.errorMessage = errorMessage
      ctx.response = response
    }

    // 记录请求耗时
    if (!ctx.response.mockHit) {
      const duration = new Date().getTime() - ctx.startTime
      ctx.response.duration = duration
    }

    // 打印请求
    printRequest(ctx)

    let response
    if (ctx.request.original) {
      response = ctx.response
    } else {
      response = ctx.response.data
    }

    if (ctx.response.status) {
      return Promise.resolve(response)
    } else {
      return Promise.reject(response)
    }
  }

  /**
   * 请求方法
   * @param {object} options 请求配置
   * * @param {string} [options.method='get'] 请求类型
   *
   * * @param {string} options.url 完整请求路径。若无值，会根据 baseUrl 和 apiUrl 参数拼接；若有值，会直接使用该值。
   * * @param {string} options.baseUrl 请求基础路径
   * * @param {string} options.apiUrl 请求接口路径
   *
   * * @param {object} [options.header] 头部信息
   * * @param {number} [options.timeout] 请求延时
   * * @param {number} [options.responseType] 响应的数据类型，支持text/arraybuffer/json
   * * @param {object} [options.data] body参数
   * * @param {object} [options.params] url参数
   * * @param {object} [options.restful] restful参数
   * * @param {boolean} [options.print=false] 是否打印请求日志
   * * @param {boolean} [options.original=false] 是否获取原始响应和配置
   * * @param {boolean} [options.webProxy=true] 是否开启开发环境网页平台代理请求
   *
   * * @param {boolean|object} [options.cache=false] 请求缓存配置
   * * 1.object类型参数说明：
   * * @param {boolean} [options.cache.enable=true] 是否开启请求缓存
   * * @param {number} [options.cache.expire] 缓存有效时间（单位毫秒）。过了这个时间, 就会自动清除缓存。不传默认永不清除。
   * * @param {number} [options.cache.expireAt] 缓存过期时间节点（时间戳）。与 expire 设置任一即可生效；若两者都设置，以 expire 为准（由 expire 生成过期时间节点）。
   * * @param {string} [options.cache.id] 缓存id。每次请求的唯一标识。若不传，将由请求参数自动生成。调用 clearCacheById(cacheId)可实现清除缓存
   * * @param {string} [options.cache.class] 缓存类名，不同请求可以重复。调用 clearCacheByClass(cacheClass)可实现批量清除缓存
   * * @param {string} [options.cache.mode='throttle'] 缓存模式。有两种：throttle - 节流，debounce - 防抖
   * * @param {boolean} [options.cache.persist=false] 是否持久化到本地存储。开启后成功结果会额外写入本地存储，冷启动后可恢复；失败结果始终不缓存，也不会持久化
   * * 2.boolean类型参数说明：表示 cache.enable 的值, 其他配置字段取用默认值
   *
   * * @param {boolean|string|object} [options.loading=false] 请求 loading 配置
   * * 1.object类型参数说明：
   * * * @param {boolean} [options.loading.enable=true] 是否开启loading
   * * * @param 剩余其他配置项和 uni.showLoading 一致
   * * 2.boolean类型参数说明：表示 loading.enable 的值, 其他配置字段取用默认值
   * * 3.string类型参数说明：表示 loading.title 的值, 其他配置字段取用默认值
   * * 4.function类型参数说明：
   * * function执行如返回object类型, 与上面1相同；
   * * unction执行如返回boolean类型, 与上面2相同
   * * function执行如返回string类型, 与上面3相同
   *
   * * @param {boolean|string|object} [options.confirm=false] 请求前询问确认配置
   * * 1.object类型参数说明：
   * * * @param {boolean} [options.confirm.enable=true] 是否开启确认框
   * * * @param 剩余其他配置项和 uni.showModal 一致
   * * 2.boolean类型参数说明：表示 confirm.enable 的值, 其他配置字段取用默认值
   * * 3.string类型参数说明：表示 confirm.content 的值, 其他配置字段取用默认值
   * * 4.function类型参数说明：
   * * function执行如返回object类型, 与上面1相同；
   * * unction执行如返回boolean类型, 与上面2相同
   * * function执行如返回string类型, 与上面3相同
   *
   * * @param {object|string|function} [options.successTip=false] 请求成功提示配置
   * * * 1.object类型参数说明：
   * * * @param {boolean} [options.successTip.enable=true] 是否开启成功提示
   * * * @param {string} options.successTip.message 成功提示语，toast 的 title，modal的 content
   * * * @param {boolean} [options.successTip.sync=false] 提示是否为同步的
   * * * @param {'auto'|'toast'|'modal'} [options.successTip.popupType='auto'] 提示框形式, 可选值：auto/toast/modal, 默认为auto, 根据提示文本长度自动选择 toast 和 modal
   * * * @param 剩余其他配置项和 uni.showToast、uni.showModal 一致
   * * * 2.boolean类型参数说明：表示 successTip.enable 的值, 其他配置字段取用默认值
   * * * 3.string类型参数说明：表示successTip.message的值, 其他配置字段取用默认值
   * * * 4.function类型参数说明：
   * * * function执行如返回object类型, 与上面1相同；
   * * * unction执行如返回boolean类型, 与上面2相同
   * * * function执行如返回string类型, 与上面3相同
   *
   * * @param {object|boolean|string|function} [options.errorTip=true] 请求异常消息配置
   * * * 1.object类型参数说明：
   * * * @param {boolean} [options.errorTip.enable=true] 是否开启异常提示
   * * * @param {string} [errorTip.message] 异常提示语
   * * * @param {string} options.errorTip.code 异常码
   * * * @param {boolean} [options.errorTip.priority=1] 提示优先级
   * * * @param {boolean} [options.errorTip.sync=false] 提示是否为同步的
   * * * @param {'auto'|'toast'|'modal'} [options.errorTip.popupType='auto'] 提示框形式, 可选值：auto/toast/modal, 默认为 auto, 根据提示文本长度自动选择 toast 和 modal
   * * * @param 剩余其他配置项和 uni.showToast、uni.showModal 一致
   * * * 2.boolean类型参数说明：
   * * * 表示 errorTip.enable 的值, 其他配置字段取用默认值
   * * * 3.string类型参数说明：
   * * * 表示 errorTip.message的值, 其他配置字段取用默认值
   * * * 4.function类型参数说明：
   * * * function执行如返回object类型, 与上面1相同；
   * * * unction执行如返回boolean类型, 与上面2相同
   * * * function执行如返回string类型, 与上面3相同
   */
  async request(options) {
    // 每次请求独立的上下文：承载请求配置、响应、loading、耗时、任务等状态
    const ctx = {
      request: null, // 请求配置
      response: null, // 响应数据，用于内部记录
      loading: false, // 是否展示 loading
      startTime: 0, // 请求开始时间，用于计算耗时
      requestTask: null, // 原生请求任务对象，用于取消请求等操作
      errorMessage: {
        code: null,
        message: null,
        enable: true,
        priority: 0,
      }, // 错误消息，按请求隔离（避免并发串号）
      // 设置错误信息：写入本请求的 errorMessage，供钩子调用
      setErrorMessage: errMsg => {
        ctx.errorMessage = setErrorMessage(errMsg, ctx.errorMessage)
      },
    }

    // 初始化默认错误信息
    ctx.errorMessage = setPresetErrorByKey(
      'default',
      this.#presetErrorConfig,
      ctx.errorMessage
    )

    // 发起请求
    const promise = this.#doRequest(options, ctx)

    // 懒转发原生 requestTask 的方法到 promise 上（含中断标记）
    attachRequestTaskMethods(promise, ctx)

    return promise
  }

  /**
   * @description 发起请求
   * @param {object} options 请求配置
   * @param {object} ctx 上下文对象，承载请求配置、响应、loading、耗时、任务等状态
   * @returns {Promise} 请求 Promise
   */
  async #doRequest(options, ctx) {
    // 合并默认请求配置
    ctx.request = this.#mergeDefaultRequest(options)
    // 合并默认响应配置
    ctx.response = Object.assign({}, DEFAULT_RESPONSE)

    // 请求前弹窗确认
    const confirm = await handleConfirm(ctx)
    if (!confirm) {
      ctx.response.status = 0
      ctx.errorMessage = setPresetErrorByKey(
        'cancelRequest',
        this.#presetErrorConfig,
        ctx.errorMessage
      )
      return this.#returnRequest(ctx)
    }

    // 记录请求开始时间
    ctx.startTime = new Date().getTime()

    // 请求钩子1: 调用请求前钩子
    if (isFunc(this.beforeRequest)) {
      await this.beforeRequest(ctx)
    }

    // 注册进行中请求，供 abortRequest/abortAllRequest 中断
    registerPendingRequest(ctx, this)

    // 处理请求 url
    const { request, response } = handleUrl(
      ctx,
      this.#rewriteConfig,
      this.#baseUrl
    )
    ctx.request = request
    ctx.response = response

    // 拦截1：验证网络是否通畅
    try {
      await checkNetwork()
    } catch {
      ctx.response.status = 0
      ctx.errorMessage = setPresetErrorByKey(
        'noNetwork',
        this.#presetErrorConfig,
        ctx.errorMessage
      )
      return this.#returnRequest(ctx)
    }

    // 拦截2：mock 处理
    const mockResponse = await getMockResponse(ctx.request, this.#mockConfig)
    // 若存在 mock 数据, 则拦截请求， 直接响应 mock 数据
    if (mockResponse) {
      ctx.response = mockResponse
      // mock 配置了模拟时长时，展示 loading 并等待，模拟真实请求的加载体验
      // 分片等待并感知中断标记，便于在mock时，中断请求能够及时退出
      if (mockResponse.duration > 0) {
        ctx.loading = await handleShowLoading(ctx)
        if (ctx.loading) this.#loadingCount++
        const slice = 100
        for (
          let waited = 0;
          waited < mockResponse.duration && !ctx.abortFlag;
          waited += slice
        ) {
          await sleep(slice)
        }
      }
      return this.#returnRequest(ctx)
    }

    // 拦截3：请求缓存处理
    const cacheResponse = await getCacheResponse(ctx)
    // 若存在缓存, 则拦截请求，直接响应缓存结果
    if (cacheResponse) {
      ctx.response = cacheResponse
      return this.#returnRequest(ctx)
    }
    // 若不存在缓存, 则可能需要设入 pending 状态的缓存
    else {
      setPendingCache(ctx)
    }

    // 处理 loading：仅真实网络请求才展示（mock/缓存命中已提前返回，避免闪 loading）
    ctx.loading = await handleShowLoading(ctx)
    if (ctx.loading) this.#loadingCount++

    // 若在请求发出前已被中断（abortRequest 时 requestTask 尚未创建），直接按中断处理，不再发起请求
    if (ctx.abortFlag) {
      return this.#returnRequest(ctx)
    }

    // uni.request请求入参
    const uniRequestOptions = {
      ...pick(ctx.request, UNI_REQUEST_FIELDS),
    }

    // 进行请求操作
    try {
      // 取出调用方传入的原生回调（若存在），与库内部处理合并
      const {
        success: userSuccess,
        fail: userFail,
        complete: userComplete,
      } = uniRequestOptions

      // 执行请求：传入 success/fail 回调换取 requestTask（支持中断），并保持 Promise 化
      const requestResponse = await new Promise((resolve, reject) => {
        ctx.requestTask = uni.request({
          ...uniRequestOptions,
          success: res => {
            userSuccess?.(res)
            resolve(res)
          },
          fail: err => {
            userFail?.(err)
            reject(err)
          },
          complete: res => {
            userComplete?.(res)
          },
        })
      })

      // 请求成功时，errMsg固定为 request:ok，无意义，所以删除
      delete requestResponse.errMsg

      // 合并到响应对象上
      Object.assign(ctx.response, requestResponse)

      // 请求状态码
      const { statusCode } = requestResponse

      // 状态码转换为字符串
      const statusCodeStr = String(statusCode)

      // 请求成功
      if (statusCodeStr.startsWith('2')) {
        if (isFunc(this.requestSuccess)) {
          // 请求钩子2: 调用请求成功钩子
          await this.requestSuccess(ctx)
        }
      }
      // 请求网络通了，但业务失败
      else {
        ctx.response.status = 0

        // 设置状态码对应的预置错误消息
        ctx.errorMessage = setPresetErrorByCode(
          statusCodeStr,
          this.#presetErrorConfig,
          ctx.errorMessage
        )

        // 请求钩子3: 调用请求失败钩子
        if (isFunc(this.requestFail)) {
          await this.requestFail(ctx)
        }
      }
    } catch (error) {
      console.log('❌ error', error)
      Object.assign(ctx.response, error)
      console.log('❌ ctx.response', ctx.response)
      ctx.errorMessage = setErrorMessage(
        {
          code: error?.errno ?? error?.error,
          message: error?.errMsg ?? error?.errorMessage,
        },
        ctx.errorMessage
      )
      console.log('❌ ctx.errorMessage', ctx.errorMessage)

      ctx.response.status = 0

      // 中断请求的失败类型
      if (error?.errMsg.includes('abort')) {
        // 中断请求，直接拦截
        return this.#returnRequest(ctx)
      }

      // 请求钩子3: 调用请求失败钩子
      if (isFunc(this.requestFail)) {
        await this.requestFail(ctx)
      }
    }

    return this.#returnRequest(ctx)
  }
}

export default UniXRequest
