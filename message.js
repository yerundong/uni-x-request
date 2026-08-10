import {
  isValidStr,
  isBool,
  isFunc,
  isObj,
  isUndef,
  isValidNum,
  sleep,
} from './utils'

/**
 * @description 解析请求传入的提示配置：loading、confirm、successTip、errorTip
 * @param {any} config 提示配置
 * @param {object} defConfig 默认提示配置
 * @param {object} request 请求配置
 * @param {object} response 请求结果
 * @returns {object} 解析后的提示配置
 */
const parseConfig = async (config, defConfig, request, response) => {
  if (isUndef(config)) {
    return defConfig
  } else if (isObj(config)) {
    return { ...defConfig, enable: true, ...config }
  } else if (isValidStr(config)) {
    return { ...defConfig, enable: true, message: config }
  } else if (isFunc(config)) {
    const conf = await config(request, response)
    return parseConfig(conf, defConfig, request, response)
  } else if (isBool(config)) {
    return { ...defConfig, enable: config }
  } else {
    return { ...defConfig, enable: false }
  }
}

/**
 * @description 处理请求前 loading
 * @param {object} ctx 请求上下文
 * @returns {boolean} 是否成功显示 loading
 */
const handleShowLoading = async ({ request }) => {
  // 默认 loading 配置
  const defConf = {
    enable: true,
  }

  let { loading } = request

  // 解析 loading 配置
  loading = await parseConfig(loading, defConf, request)

  let { enable, ...popupConfig } = loading

  // 不符合弹窗条件，直接返回
  if (!enable) return false

  uni.hideLoading()
  uni.hideToast()

  uni.showLoading(popupConfig)
  return true
}

/**
 * @description 处理请求前确认弹窗
 * @param {object} ctx 请求上下文
 */
const handleConfirm = async ({ request }) => {
  // 默认 confirm 配置
  const defConf = {
    enable: true,
    title: '提示',
    content: '确定提交？',
  }

  let { confirm } = request

  // 解析 confirm 配置
  confirm = await parseConfig(confirm, defConf, request)

  let { enable, ...popupConfig } = confirm

  // 不符合弹窗条件，直接返回
  if (!enable) return true

  uni.hideLoading()
  uni.hideToast()

  const res = await uni.showModal(popupConfig)
  return res.confirm
}

/**
 * @description 处理成功提示弹窗
 * @param {object} ctx 请求上下文
 */
const handleSuccessTip = async ({ request, response }) => {
  // 默认 successTip 配置
  const defConf = {
    enable: false,
    sync: false,
    popupType: 'auto',
  }

  let { successTip } = request

  // 解析 successTip
  successTip = await parseConfig(successTip, defConf, request, response)

  let { enable, message, sync, popupType, ...popupConfig } = successTip

  // 不符合弹窗条件，直接返回
  if (!enable || !message) return response

  uni.hideLoading()
  uni.hideToast()

  // auto 类型转成具体类型
  if (popupType === 'auto') {
    if (message.length > 25) {
      popupType = 'modal'
    } else {
      popupType = 'toast'
    }
  }

  if (popupType === 'toast') {
    // 合并默认 toast 配置
    popupConfig = {
      icon: 'none',
      duration: 1500,
      ...popupConfig,
      title: message,
    }
    uni.showToast(popupConfig)
    if (sync) await sleep(popupConfig.duration)
  } else if (popupType === 'modal') {
    // 合并默认 modal 配置
    popupConfig = {
      title: '提示',
      showCancel: false,
      confirmText: '知道了',
      ...popupConfig,
      content: message,
    }

    if (sync) {
      await uni.showModal(popupConfig)
    } else {
      uni.showModal(popupConfig)
    }
  }

  return response
}

/**
 * @description 根据优先级设置报错信息到上下文里
 * @param {object} errMsg 报错信息配置
 * @param {object} ctxErrMsg 上下文报错信息配置
 * @returns 新的报错信息配置
 */
const setErrorMessageByPriority = (errMsg = {}, ctxErrMsg = {}) => {
  let newCtxErrMsg = { ...ctxErrMsg }
  if (errMsg.priority >= ctxErrMsg.priority) {
    newCtxErrMsg.priority = errMsg.priority
    if (isValidStr(errMsg.code) || isValidNum(errMsg.code))
      newCtxErrMsg.code = errMsg.code
    if (isValidStr(errMsg.message)) newCtxErrMsg.message = errMsg.message
    if (isBool(errMsg.enable)) newCtxErrMsg.enable = errMsg.enable
  }
  return newCtxErrMsg
}

/**
 * @description 设置错误信息（带 enable / priority 默认值处理）
 * @param {object} errMsg 错误信息配置
 * @param {string} [errMsg.code] 错误码
 * @param {string} [errMsg.message] 错误消息
 * @param {boolean} [errMsg.enable=true] 是否弹出提示
 * @param {number} [errMsg.priority=1] 提示优先级
 * @param {object} [ctxErrMsg] 上下文错误信息配置
 * @returns {object} 合并后的错误信息配置
 */
const setErrorMessage = (errMsg = {}, ctxErrMsg = {}) => {
  errMsg = { ...errMsg }
  if (!isBool(errMsg.enable)) errMsg.enable = true
  if (!isValidNum(errMsg.priority)) errMsg.priority = 1
  return setErrorMessageByPriority(errMsg, ctxErrMsg)
}

/**
 * @description 根据预设错误键名设置错误信息到上下文里
 * @param {string} key 预设错误键名
 * @param {object} presetErrorConfig 预设错误配置
 * @param {object} [ctxErrMsg] 上下文错误信息配置
 * @returns {object} 合并后的错误信息配置
 */
const setPresetErrorByKey = (key, presetErrorConfig, ctxErrMsg = {}) => {
  const target = presetErrorConfig?.[key]
  if (!target) return ctxErrMsg

  // 预设错误码优先级固定为 0
  let priority = 0
  // 中止请求和取消请求优先级最高
  if (['abortRequest', 'cancelRequest'].includes(key)) {
    priority = Infinity
  }

  if (priority >= ctxErrMsg.priority) {
    // 预设错误弹出提示默认为 true
    const enable = isBool(target.enable) ? target.enable : true
    return setErrorMessage({ ...target, priority, enable }, ctxErrMsg)
  }
  return ctxErrMsg
}

/**
 * @description 根据预设错误码设置错误信息到上下文里
 * @param {string} code 预设错误码
 * @param {object} presetErrorConfig 预设错误配置
 * @param {object} [ctxErrMsg] 上下文错误信息配置
 * @returns {object} 合并后的错误信息配置
 */
const setPresetErrorByCode = (code, presetErrorConfig, ctxErrMsg = {}) => {
  let target
  for (const key in presetErrorConfig) {
    const element = presetErrorConfig[key]
    if (element.code === code) {
      target = element
      break
    }
  }
  if (!target) return ctxErrMsg
  // 预设错误码优先级固定为 0
  let priority = 0
  // 中止请求和取消请求优先级最高
  if (['000', '001'].includes(code)) {
    priority = Infinity
  }
  if (priority >= ctxErrMsg.priority) {
    // 预设错误弹出提示默认为 true
    const enable = isBool(target.enable) ? target.enable : true
    return setErrorMessage({ ...target, priority, enable }, ctxErrMsg)
  }
  return ctxErrMsg
}

/**
 * @description 处理报错提示弹窗
 * @param {object} ctx 请求上下文
 */
const handleErrorTip = async ({ errorMessage, request, response }) => {
  // 默认 errorTip 配置
  const defConf = {
    enable: true,
    priority: 1,
    sync: false,
    popupType: 'auto',
  }

  let { errorTip } = request

  // 解析得到完整的 errorTip 配置
  errorTip = await parseConfig(errorTip, defConf, request, response)

  let { enable, code, message, priority, popupType, sync, ...popupConfig } =
    errorTip

  console.log('⚡ errorMessage', errorMessage)
  console.log('⚡ errorTip', errorTip)

  // 设置 errorTip 到 errorMessage，比对优先级，取高优先级的提示
  errorMessage = setErrorMessageByPriority(
    {
      code,
      message,
      priority,
      enable,
    },
    errorMessage
  )
  console.log('⚡ errorMessage', errorMessage)

  // 设置最高优先级的报错信息配置到响应数据
  response.errCode = errorMessage.code
  response.errMsg = errorMessage.message

  // 弹出报错信息
  if (errorMessage.enable && errorMessage.message) {
    uni.hideLoading()
    uni.hideToast()

    // auto 类型转成具体类型
    if (popupType === 'auto') {
      if (errorMessage.message.length > 25) {
        popupType = 'modal'
      } else {
        popupType = 'toast'
      }
    }

    if (popupType === 'toast') {
      // 合并默认 toast 配置
      popupConfig = {
        icon: 'none',
        duration: 1500,
        ...popupConfig,
        title: errorMessage.message,
      }
      uni.showToast(popupConfig)
      if (sync) await sleep(popupConfig.duration)
    } else if (popupType === 'modal') {
      // 合并默认 modal 配置
      popupConfig = {
        title: '提示',
        showCancel: false,
        confirmText: '知道了',
        ...popupConfig,
        content: errorMessage.message,
      }

      if (sync) {
        await uni.showModal(popupConfig)
      } else {
        uni.showModal(popupConfig)
      }
    }
  }

  return {
    response,
    errorMessage,
  }
}

export {
  handleShowLoading,
  handleConfirm,
  handleSuccessTip,
  handleErrorTip,
  setErrorMessage,
  setErrorMessageByPriority,
  setPresetErrorByKey,
  setPresetErrorByCode,
}
