import { isValidStr } from "./utils";

// 进行中请求注册表（模块级全局单例，多实例共享）：接口名（或命名空间全名）-> Set<ctx>
// 用于全局 abortRequest/abortAllRequest 中断；实例隔离中断按 ctx._instance 过滤
const pendingRequestMap = new Map();

/**
 * @description 生成请求的 abort key：命名空间接口用全名（namespace.name），非命名空间接口用 name
 * @param {object} request 请求配置
 * @returns {string} abort key
 */
const getAbortKey = ({ name, namespace }) =>
  isValidStr(namespace) ? `${namespace}.${name}` : name;

/**
 * @description 注册进行中请求：普通接口按 name 登记，命名空间接口按全名（namespace.name）登记
 * 同一接口并发多次会全部记录；登记到模块级全局注册表并记录所属实例，供全局/实例隔离中断使用
 * @param {object} ctx 请求上下文
 * @param {object} instance 发起请求的实例
 */
const registerPendingRequest = (ctx, instance) => {
  const abortKey = getAbortKey(ctx.request);
  if (!isValidStr(abortKey)) return;
  // 记录本次请求登记的 key，供注销时使用；记录所属实例，供实例隔离中断过滤
  ctx._abortKey = abortKey;
  ctx._instance = instance;
  const set = pendingRequestMap.get(abortKey) ?? new Set();
  set.add(ctx);
  pendingRequestMap.set(abortKey, set);
};

/**
 * @description 注销进行中请求
 * @param {object} ctx 请求上下文
 */
const removePendingRequest = (ctx) => {
  const abortKey = ctx._abortKey;
  if (!isValidStr(abortKey)) return;
  const set = pendingRequestMap.get(abortKey);
  if (!set) return;
  set.delete(ctx);
  // 该 key 下无进行中请求时删除，避免内存泄漏
  if (set.size === 0) pendingRequestMap.delete(abortKey);
  ctx._abortKey = "";
};

/**
 * @description 中断指定接口名的进行中请求（全局：中断所有实例中该接口名的请求）
 * @param {string} name 接口名（api 配置里的 name；命名空间接口支持传全名 namespace.name）
 */
const abortRequest = (name) => {
  const set = pendingRequestMap.get(name);
  if (!set) return;
  for (const ctx of set) {
    ctx.requestTask?.abort();
  }
  pendingRequestMap.delete(name);
};

/**
 * @description 中断所有进行中请求（全局：中断所有实例的全部请求）
 */
const abortAllRequest = () => {
  for (const set of pendingRequestMap.values()) {
    for (const ctx of set) {
      ctx.requestTask?.abort();
    }
  }
  pendingRequestMap.clear();
};

/**
 * @description 中断指定实例指定接口名的进行中请求（仅该实例）
 * @param {string} name 接口名（api 配置里的 name；命名空间接口支持传全名 namespace.name）
 * @param {object} instance 目标实例
 */
const abortRequestByInstance = (name, instance) => {
  const set = pendingRequestMap.get(name);
  if (!set) return;
  // set 中可能混有其他实例的 ctx，只中断并移除指定实例的，不能直接删 key
  for (const ctx of [...set]) {
    if (ctx._instance !== instance) continue;
    set.delete(ctx);
    ctx.requestTask?.abort();
  }
  if (set.size === 0) pendingRequestMap.delete(name);
};

/**
 * @description 中断指定实例的所有进行中请求（仅该实例）
 * @param {object} instance 目标实例
 */
const abortAllRequestByInstance = (instance) => {
  for (const [name, set] of pendingRequestMap) {
    for (const ctx of [...set]) {
      if (ctx._instance !== instance) continue;
      set.delete(ctx);
      ctx.requestTask?.abort();
    }
    // 该实例请求全部移除后，若该接口名下已无任何在途请求则删除 key
    if (set.size === 0) pendingRequestMap.delete(name);
  }
};

/**
 * @description 懒转发原生 requestTask 的方法（官方方法全集）到 promise 上
 * task 未创建或已结束时调用无副作用
 * @param {Promise} promise 请求 promise
 * @param {object} ctx 请求上下文
 */
const attachRequestTaskMethods = (promise, ctx) => {
  for (const method of [
    "abort",
    "onHeadersReceived",
    "offHeadersReceived",
    "onChunkReceived",
    "offChunkReceived",
  ]) {
    promise[method] = (...args) => {
      return ctx.requestTask?.[method]?.(...args);
    };
  }
};

// ==================== 导出 ====================

export {
  registerPendingRequest,
  removePendingRequest,
  abortRequest,
  abortAllRequest,
  abortRequestByInstance,
  abortAllRequestByInstance,
  attachRequestTaskMethods,
};
