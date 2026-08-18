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
} from "./utils";
import { getMockResponse } from "./mock";
import { handleUrl } from "./url";
import {
  abortRequest,
  abortAllRequest,
  abortRequestByInstance,
  abortAllRequestByInstance,
  registerPendingRequest,
  removePendingRequest,
  attachRequestTaskMethods,
} from "./requestTask";
import {
  setRequestCache,
  checkCacheSync,
  waitForCache,
  setPendingCache,
  clearCacheById,
  clearCacheByClass,
  clearAllCache,
  getCacheByClass,
  getCacheById,
} from "./cache";
import {
  handleShowLoading,
  handleConfirm,
  handleSuccessTip,
  handleErrorTip,
  setErrorMessage,
  setErrorMessageByPresetKey,
  setErrorMessageByPresetCode,
} from "./message";
import {
  UNI_REQUEST_FIELDS,
  REQUEST_FIELDS,
  DEFAULT_INSTANCE_CONFIG,
  DEFAULT_PRESET_ERROR_CONFIG,
  DEFAULT_RESPONSE,
} from "./enum";

/**
 * @description 封装请求类
 * @param {object} options 实例配置
 * @param {array} options.apiConfig 接口配置
 * @param {array} options.rewriteConfig 重写配置
 * @param {array} options.mockConfig mock 配置
 * @param {array} options.presetErrorConfig 预设错误配置
 * @param {object} options.customRequestFields 自定义请求字段配置
 * @param 其他字段请参考 request 方法入参的字段说明
 */
class UniXRequest {
  constructor(options) {
    // 将默认配置、参数配置合并到实例上
    // 注意：有些需要惰性求值的字段在私有 getter 里二次处理
    Object.assign(this, DEFAULT_INSTANCE_CONFIG, options);
  }

  // 并发请求的 loading 计数，归零才隐藏全局 loading
  #loadingCount = 0;

  // 基础路径 getter
  get #baseUrl() {
    const baseUrl = this.baseUrl;
    return isFunc(baseUrl) ? baseUrl() : baseUrl;
  }

  // 接口配置 getter
  get #apiConfig() {
    const apiConfig = this.apiConfig;
    return isFunc(apiConfig) ? apiConfig() : apiConfig;
  }

  // 获取 api 服务
  getApiService() {
    const apiConfig = this.#apiConfig;
    return buildApiService(apiConfig, this);
  }

  // 重写配置 getter
  get #rewriteConfig() {
    const rewriteConfig = this.rewriteConfig;
    return isFunc(rewriteConfig) ? rewriteConfig() : rewriteConfig;
  }

  // mock 配置项 getter
  get #mockConfig() {
    const mockConfig = this.mockConfig;
    return isFunc(mockConfig) ? mockConfig() : mockConfig;
  }

  // 预设错误配置 getter
  get #presetErrorConfig() {
    const presetErrorConfig = this.presetErrorConfig;
    const pec = isFunc(presetErrorConfig)
      ? presetErrorConfig()
      : presetErrorConfig;
    return { ...DEFAULT_PRESET_ERROR_CONFIG, ...pec };
  }

  // 合并请求配置：实例配置+自定义请求字段默认值+请求配置
  #mergeRequestOptions(requestOptions) {
    const instanceOptions = pick(this, REQUEST_FIELDS);
    const customRequestFields = this.customRequestFields || {};
    return Object.assign(
      {},
      instanceOptions,
      customRequestFields,
      requestOptions,
    );
  }

  /**
   * @description 根据缓存 id 获取缓存数据（缓存为全局共享，静态方法与实例方法操作同一份数据）
   * @param {string} cacheId 缓存 id
   * @returns {object} 缓存数据
   */
  static getCacheById = getCacheById;

  /**
   * @description 根据缓存类名获取缓存数据（缓存为全局共享，静态方法与实例方法操作同一份数据）
   * @param {string} cacheClass 缓存类名
   * @returns {array} 缓存数据
   */
  static getCacheByClass = getCacheByClass;

  /**
   * @description 清除指定缓存（缓存为全局共享，静态方法与实例方法操作同一份数据）
   * @param {string} cacheId 缓存 id
   */
  static clearCacheById = clearCacheById;

  /**
   * @description 按缓存类名批量清除（缓存为全局共享，静态方法与实例方法操作同一份数据）
   * @param {string} cacheClass 缓存类名
   */
  static clearCacheByClass = clearCacheByClass;

  /**
   * @description 清除所有缓存（缓存为全局共享，静态方法与实例方法操作同一份数据）
   */
  static clearAllCache = clearAllCache;

  /**
   * @description 中断指定接口名的进行中请求（全局：中断所有实例中该接口名的请求）
   * @param {string} name 接口名（api 配置里的 name；命名空间接口支持传全名 namespace.name）
   */
  static abortRequest = abortRequest;

  /**
   * @description 中断所有进行中请求（全局：中断所有实例的全部请求）
   */
  static abortAllRequest = abortAllRequest;

  /**
   * @description 中断本实例指定接口名的进行中请求（仅本实例；需要全局中断用 UniXRequest.abortRequest）
   * @param {string} name 接口名（api 配置里的 name；命名空间接口支持传全名 namespace.name）
   */
  abortRequest(name) {
    abortRequestByInstance(name, this);
  }

  /**
   * @description 中断本实例的所有进行中请求（仅本实例；需要全局中断用 UniXRequest.abortAllRequest）
   */
  abortAllRequest() {
    abortAllRequestByInstance(this);
  }

  /**
   * @description 获取处理后的请求 url
   * @param {object} options 请求配置
   * @returns {string} 处理后的请求 url
   */
  getUrl(options) {
    // 合并实例配置和传入配置，得到最终请求配置
    const request = this.#mergeRequestOptions(options);
    const {
      request: { url },
    } = handleUrl({
      request,
      response: {},
      rewriteConfig: this.#rewriteConfig,
      baseUrl: this.#baseUrl,
    });
    return url;
  }

  /**
   * @description 返回请求结果，以及请求结束后执行求统一的打印、提示、缓存出处理
   * @param {object} ctx 请求上下文
   */
  async #returnRequest(ctx) {
    // 请求生命周期钩子: 仅失败时调用请求失败钩子（中止、成功不触发）
    if (!ctx.abort && !ctx.response.status && isFunc(this.requestFail)) {
      await this.requestFail(ctx);
    }

    // 请求已结束，从进行中请求注册表注销
    removePendingRequest(ctx);

    // 请求返回后，将请求结果写入缓存
    await setRequestCache(ctx);

    // 隐藏 loading：并发请求计数归零才隐藏
    if (ctx.loading) {
      this.#loadingCount--;
      if (this.#loadingCount <= 0) {
        this.#loadingCount = 0;
        uni.hideLoading();
      }
    }

    if (ctx.abort) {
      return Promise.reject("Request aborted");
    }

    // 请求成功
    if (ctx.response.status) {
      const response = await handleSuccessTip(ctx);
      ctx.response = response;
    }
    // 请求失败
    else {
      const { errorMessage, response } = await handleErrorTip(ctx);
      ctx.errorMessage = errorMessage;
      ctx.response = response;
    }

    // 计算请求耗时
    if (!ctx.response.mockHit) {
      const duration = new Date().getTime() - ctx.startTime;
      ctx.response.duration = duration;
    }

    // 请求生命周期钩子: 打印请求前调用
    if (isFunc(this.beforePrintRequest)) {
      await this.beforePrintRequest(ctx);
    }

    // 打印请求
    printRequest(ctx);

    // 请求生命周期: 执行请求完成回调
    if (isFunc(this.requestComplete)) {
      await this.requestComplete(ctx);
    }

    // 处理实际请求结果
    let actualResponse;
    if (ctx.request.original) {
      actualResponse = ctx.response;
    } else {
      actualResponse = ctx.response.data;
    }
    if (ctx.response.status) {
      return Promise.resolve(actualResponse);
    } else {
      return Promise.reject(actualResponse);
    }
  }

  /**
   * 请求方法
   * @param {object} options 请求配置
   * * @param {string} [options.method='get'] 请求类型
   * * @param {string} options.url 完整请求路径。若无值，会根据 baseUrl 和 apiUrl 参数拼接；若有值，会直接使用该值。
   * * @param {string} options.baseUrl 请求基础路径
   * * @param {string} options.apiUrl 请求接口路径
   * * @param {object} [options.header] 头部信息
   * * @param {number} [options.timeout] 请求延时
   * * @param {number} [options.responseType] 响应的数据类型，支持text/arraybuffer/json
   * * @param {object} [options.data] body参数
   * * @param {object} [options.params] url参数
   * * @param {object} [options.restful] restful参数
   * * @param {boolean} [options.print=false] 是否打印请求日志
   * * @param {boolean} [options.original=false] 是否获取原始响应和配置
   * * @param {boolean} [options.devWebProxy=true] 是否开启开发环境网页平台代理请求
   * * @param {boolean|object} [options.cache=false] 请求缓存配置
   * * @param {boolean|string|object} [options.loading=false] 请求 loading 配置
   * * @param {boolean|string|object} [options.confirm=false] 请求前询问确认配置
   * * @param {object|string|function} [options.successTip=false] 请求成功提示配置
   * * @param {object|boolean|string|function} [options.errorTip=true] 请求异常消息配置
   * * @param 其他字段，uni.request 的其余入参原样透传
   */
  async request(options) {
    // 每次请求独立的上下文：承载请求配置、响应、loading、耗时、任务等状态
    const ctx = {
      request: null, // 请求配置
      response: null, // 响应数据，用于内部记录
      loading: false, // 是否展示 loading
      abort: false, // 是否中止请求
      terminate: false, // 是否终止请求
      startTime: 0, // 请求开始时间，用于计算耗时
      requestTask: null, // 原生请求任务对象，用于取消请求等操作
      errorMessage: {
        code: null,
        message: null,
        enable: true,
        priority: 0,
      }, // 错误消息，按请求隔离（避免并发串号）
      // 设置错误信息：写入本请求上下文的 errorMessage，供钩子调用
      setErrorMessage: (errMsg) => {
        ctx.errorMessage = setErrorMessage(errMsg, ctx.errorMessage);
      },
      // 根据预设错误键名设置错误信息：写入本请求上下文的 errorMessage，供钩子调用
      setErrorMessageByPresetKey: (key) => {
        ctx.errorMessage = setErrorMessageByPresetKey(
          key,
          this.#presetErrorConfig,
          ctx.errorMessage,
        );
      },
      // 根据预设错误码设置错误信息：写入本请求上下文的 errorMessage，供钩子调用
      setErrorMessageByPresetCode: (code) => {
        ctx.errorMessage = setErrorMessageByPresetCode(
          code,
          this.#presetErrorConfig,
          ctx.errorMessage,
        );
      },
    };

    // 初始化默认错误信息
    ctx.errorMessage = setErrorMessageByPresetKey(
      "default",
      this.#presetErrorConfig,
      ctx.errorMessage,
    );

    // 发起请求
    const promise = this.#doRequest(options, ctx);

    // 懒转发原生 requestTask 的方法到 promise 上（未创建或已结束时调用无副作用）
    attachRequestTaskMethods(promise, ctx);

    return promise;
  }

  /**
   * @description 发起请求
   * @param {object} options 请求配置
   * @param {object} ctx 上下文对象，承载请求配置、响应、loading、耗时、任务等状态
   * @returns {Promise} 请求 Promise
   */
  async #doRequest(options, ctx) {
    // 合并实例配置+自定义请求字段默认值+请求配置，得到最终的请求配置
    ctx.request = this.#mergeRequestOptions(options);
    // 合并默认响应配置
    ctx.response = Object.assign({}, DEFAULT_RESPONSE);

    // 请求前弹窗确认
    const confirm = await handleConfirm(ctx);
    if (!confirm) {
      ctx.abort = true;
      return this.#returnRequest(ctx);
    }

    // 记录请求开始时间
    ctx.startTime = new Date().getTime();

    // 处理请求 url
    const { request, response } = handleUrl(
      ctx,
      this.#rewriteConfig,
      this.#baseUrl,
    );
    ctx.request = request;
    ctx.response = response;

    // 请求生命周期钩子: 调用请求前钩子
    if (isFunc(this.beforeRequest)) {
      await this.beforeRequest(ctx);
      if (ctx.abort || ctx.terminate) return this.#returnRequest(ctx);
    }

    // 假性请求1：mock
    const mockResponse = await getMockResponse(ctx.request, this.#mockConfig);
    // 若存在 mock 数据, 则拦截请求，直接响应 mock 数据
    if (mockResponse) {
      ctx.response = mockResponse;
      // mock 配置了模拟时长时，展示 loading 并等待，模拟真实请求的加载体验
      if (mockResponse.duration > 0) {
        ctx.loading = await handleShowLoading(ctx);
        if (ctx.loading) this.#loadingCount++;
        const slice = 100;
        for (let waited = 0; waited < mockResponse.duration; waited += slice) {
          await sleep(slice);
        }
      }
      return this.#returnRequest(ctx);
    }

    // 假性请求2：请求缓存（同步检查 + 原子登记 pending，杜绝同 tick 并发去重竞态）
    const cacheResult = checkCacheSync(ctx.request);
    // 命中成功缓存，直接响应缓存结果
    if (cacheResult?.status === "success") {
      ctx.response = {
        ...ctx.response,
        ...cacheResult.response,
        cacheHit: true,
      };
      return this.#returnRequest(ctx);
    }
    // 已有相同请求进行中：等待首个请求的结果（并发去重）
    if (cacheResult?.status === "pending") {
      const waitResponse = await waitForCache(cacheResult.cacheId);
      if (waitResponse) {
        ctx.response = {
          ...ctx.response,
          ...waitResponse,
          // 仅成功结果标记缓存命中；共享失败保持失败语义
          cacheHit: !!waitResponse.status,
        };
        // 共享失败：与真实请求一致按状态码设置预置错误，保证并发各请求的错误提示一致
        if (!waitResponse.status) {
          ctx.errorMessage = setErrorMessageByPresetCode(
            String(waitResponse.statusCode),
            this.#presetErrorConfig,
            ctx.errorMessage,
          );
        }
        return this.#returnRequest(ctx);
      }
      // 等待期间缓存被清除（clearCacheById 等）：回退重新登记并发起真实请求
      setPendingCache(ctx);
    }
    // 无缓存：登记 pending（与上方 checkCacheSync 同一同步段内完成，无 await 间隙）
    else {
      setPendingCache(ctx);
    }

    // 真实请求前，验证网络是否通畅
    try {
      await checkNetwork();
    } catch {
      ctx.errorMessage = setErrorMessageByPresetKey(
        "noNetwork",
        this.#presetErrorConfig,
        ctx.errorMessage,
      );
      return this.#returnRequest(ctx);
    }

    // 展示 loading：仅真实网络请求才展示（mock/缓存命中已提前返回，避免闪 loading）
    ctx.loading = await handleShowLoading(ctx);
    if (ctx.loading) this.#loadingCount++;

    // uni.request 请求入参
    const uniRequestOptions = {
      ...pick(ctx.request, UNI_REQUEST_FIELDS),
    };

    // 发起真实请求操作
    try {
      // 取出调用方传入的原生回调（若存在），与库内部处理合并
      const {
        success: userSuccess,
        fail: userFail,
        complete: userComplete,
      } = uniRequestOptions;

      // 注册进行中请求：只有真正发出的请求才可被 abortRequest/abortAllRequest 中断
      registerPendingRequest(ctx, this);

      // 执行请求：传入 success/fail 回调换取 requestTask（支持中断），并保持 Promise 化
      const requestResponse = await new Promise((resolve, reject) => {
        ctx.requestTask = uni.request({
          ...uniRequestOptions,
          success: (res) => {
            userSuccess?.(res);
            resolve(res);
          },
          fail: (err) => {
            userFail?.(err);
            reject(err);
          },
          complete: (res) => {
            userComplete?.(res);
          },
        });
      });

      // 请求成功时，errMsg固定为 request:ok，无意义，所以删除
      delete requestResponse.errMsg;

      // 合并到响应对象上
      Object.assign(ctx.response, requestResponse);

      // 请求状态码
      const { statusCode } = requestResponse;

      // 状态码转换为字符串
      const statusCodeStr = String(statusCode);

      // 请求成功
      if (statusCodeStr.startsWith("2")) {
        ctx.response.status = 1;
        if (isFunc(this.requestSuccess)) {
          // 请求生命周期钩子: 调用请求成功钩子
          await this.requestSuccess(ctx);
        }
      }
      // 请求网络通了，但业务失败
      else {
        // 设置状态码对应的预置错误消息
        ctx.errorMessage = setErrorMessageByPresetCode(
          statusCodeStr,
          this.#presetErrorConfig,
          ctx.errorMessage,
        );
      }
    } catch (error) {
      // 合并 error 到响应对象上
      Object.assign(ctx.response, error);

      // 中断请求：已发出的请求被 abort
      if (error?.errMsg?.toLowerCase().includes("abort")) {
        ctx.abort = true;
      } else {
        // 其它网络错误：从原生错误对象提取错误码和错误消息
        ctx.errorMessage = setErrorMessage(
          {
            code: error?.errno ?? error?.error,
            message: error?.errMsg ?? error?.errorMessage,
          },
          ctx.errorMessage,
        );
      }
    }

    return this.#returnRequest(ctx);
  }
}

export default UniXRequest;
