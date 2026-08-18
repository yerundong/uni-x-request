# uni-x-request 请求库

一个基于 `uni.request` 的 uni-app 请求层**终极解决方案**：配置即接口、缓存即性能、失败即提示。接口服务树、双缓存与并发去重、Mock、环境重写与本地代理、Loading/弹窗提示、错误优先级、请求中断、生命周期钩子——全链路能力开箱即用，让请求层成为项目里最省心的一环。

> 目录
>
> - [一、特性](#一特性)
> - [二、快速开始](#二快速开始)
> - [三、请求实例配置](#三请求实例配置constructor)
> - [四、接口配置 apiConfig](#四接口配置-apiconfig)
> - [五、请求参数](#五请求参数request-options)
> - [六、生命周期钩子](#六生命周期钩子)
> - [七、缓存机制](#七缓存机制)
> - [八、请求中断机制](#八请求中断机制)
> - [九、错误处理机制](#九错误处理机制)
> - [十、Mock 机制](#十mock-机制)
> - [十一、环境重写与代理](#十一环境重写与代理)
> - [十二、请求打印](#十二请求打印)
> - [十三、响应与返回值](#十三响应与返回值)
> - [十四、最佳实践完整示例](#十四最佳实践完整示例)
> - [十五、目录结构](#十五目录结构)
> - [十六、常见问题 FAQ](#十六常见问题-faq)

---

## 一、特性

- **接口服务树**：配置驱动生成 `$api.xxx()`，支持命名空间无限嵌套、restful 路径
- **请求缓存**：内存 + 本地存储双缓存，`throttle`/`debounce` 两种模式，并发去重（同参数并发只发一次请求）
- **Mock**：dev 模式拦截接口，支持正则匹配、模拟时长、函数动态数据
- **环境重写**：按正则把 baseUrl 重写到目标环境
- **本地代理**：H5 dev 环境可走本地代理（`devWebProxy`），避免跨域，目标地址写入请求头供代理转发，见[本地代理](#112-本地代理-devwebproxy)
- **提示体系**：Loading、确认框、成功提示、失败提示，均支持 `boolean | string | object | function` 四种形态
- **错误优先级**：预置错误码 + 自定义优先级，业务错误可覆盖默认错误
- **请求中断**：全局 / 实例 / 单请求三档中断，仅真正发出的网络请求可被中断
- **生命周期钩子**：`beforeRequest`、`requestSuccess`、`requestFail`、`beforePrintRequest`、`requestComplete`
- **统一打印**：dev 模式按接口打印请求/响应，自动附带可复制的 Mock 配置

---

## 二、快速开始

### 1. 创建请求实例

新建 `src/request/index.js`（或任意位置），集中管理实例：

```js
import apiConfig from "./api"; // 接口配置
import UniXRequest from "@/uni-x-request";

const uxr = new UniXRequest({
  // 基础路径（可传函数惰性求值）
  baseUrl: () => "https://api.example.com",
  // 接口配置（可传函数）
  apiConfig: () => apiConfig,
  // 默认请求配置
  method: "get",
  errorTip: true,
  loading: false,
  // 请求钩子：直接修改 request/response，返回值被忽略
  beforeRequest: async ({ request }) => {
    request.header = {
      ...request.header,
      authorization: `Bearer ${getToken()}`,
    };
  },
});

export default uxr;
```

### 2. 配置接口

新建 `src/request/api.js`：

```js
export default [
  {
    name: "getUserInfo", // 接口名（必填，全局唯一）
    apiUrl: "/api/user/info", // 接口路径
    method: "get",
  },
  {
    name: "getOrderDetail",
    apiUrl: "/api/order/{id}", // restful 路径
    method: "get",
  },
];
```

### 3. 调用接口

```js
import uxr from "@/request";

// 生成接口服务树（建议在页面/组件外生成一次）
const $api = uxr.getApiService();

// 普通调用
const user = await $api.getUserInfo();
console.log(user);

// restful 调用
const order = await $api.getOrderDetail({ restful: { id: "100201" } });
```

**成功返回业务数据，失败 reject 业务数据**（不是 Error），建议用 `try/catch`：

```js
try {
  const data = await $api.getUserInfo({ params: { a: 1 } });
  // 成功分支，data 即接口返回的业务数据
} catch (e) {
  // 失败分支，e 为接口返回的错误数据（详见"响应与返回值"）
}
```

---

## 三、请求实例配置（constructor）

创建实例时传入的配置会作为**全局默认值**，每次请求自动合并。除下列字段外，也可传入任意请求参数作为默认（见[请求参数](#五请求参数request-options)）。

> 标记说明：`◆` 实例独有字段；`➤` 与请求参数相同的字段（作为全局默认值，可被请求级覆盖，见[请求参数](#五请求参数request-options)）。

| 字段                    | 类型                                      | 默认值   | 说明                                                                                           |
| ----------------------- | ----------------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| ◆ `apiConfig`           | `array \| function`                       | `[]`     | 接口配置，函数形式用于动态生成                                                                 |
| ◆ `rewriteConfig`       | `array \| function`                       | `[]`     | 环境重写配置，见[环境重写](#十一环境重写-rewrite)                                              |
| ◆ `mockConfig`          | `array \| function`                       | `[]`     | Mock 配置，见[Mock 机制](#十mock-机制)                                                         |
| ◆ `presetErrorConfig`   | `object \| function`                      | `{}`     | 预置错误配置，与内置默认**浅合并**，见[错误处理](#九错误处理机制)                              |
| ◆ `beforeRequest`       | `function`                                | -        | 请求前钩子（置 `ctx.abort = true` 可中止请求）                                                 |
| ◆ `requestSuccess`      | `function`                                | -        | 请求成功钩子（2xx）                                                                            |
| ◆ `requestFail`         | `function`                                | -        | 请求失败钩子                                                                                   |
| ◆ `beforePrintRequest`  | `function`                                | -        | 打印前钩子（请求收尾、打印日志前调用）                                                         |
| ◆ `requestComplete`     | `function`                                | -        | 请求完成钩子（成功/失败都会调用）                                                              |
| ◆ `customRequestFields` | `object`                                  | -        | 自定义请求字段默认值，优先级：请求级 > 自定义 > 实例                                           |
| ➤ `baseUrl`             | `string \| function`                      | `''`     | 基础路径，函数形式用于动态获取                                                                 |
| ➤ `apiUrl`              | `string`                                  | `''`     | 接口路径：`url` 无值时与 `baseUrl` 拼接成 url                                                  |
| ➤ `url`                 | `string`                                  | `''`     | 完整请求路径：有值则直接使用（优先级最高，不再拼接 baseUrl）；无值则按 `baseUrl + apiUrl` 拼接 |
| ➤ `header`              | `object`                                  | `{}`     | 默认请求头                                                                                     |
| ➤ `data`                | `object`                                  | `{}`     | 默认 body 参数                                                                                 |
| ➤ `params`              | `object`                                  | `{}`     | 默认 url 参数                                                                                  |
| ➤ `restful`             | `object`                                  | `{}`     | 默认 restful 参数                                                                              |
| ➤ `method`              | `string`                                  | `'get'`  | 默认请求方法                                                                                   |
| ➤ `timeout`             | `number`                                  | -        | 请求超时（毫秒），透传 `uni.request`                                                           |
| ➤ `loading`             | `boolean \| string \| object \| function` | `false`  | 默认 Loading 配置                                                                              |
| ➤ `confirm`             | `boolean \| string \| object \| function` | `false`  | 默认确认框配置                                                                                 |
| ➤ `successTip`          | `boolean \| string \| object \| function` | `false`  | 默认成功提示配置                                                                               |
| ➤ `errorTip`            | `boolean \| string \| object \| function` | `true`   | 默认失败提示配置                                                                               |
| ➤ `cache`               | `boolean \| object`                       | `false`  | 默认缓存配置                                                                                   |
| ➤ `print`               | `boolean`                                 | `false`  | 是否打印请求日志（dev 生效）                                                                   |
| ➤ `devWebProxy`         | `boolean`                                 | `true`   | H5 dev 环境是否走本地代理                                                                      |
| ➤ `original`            | `string`                                  | `"none"` | 返回结果控制：`none`/`all`/`success`/`error`，见[13.2 返回值约定](#132-返回值约定)             |

> `baseUrl`、`apiConfig`、`rewriteConfig`、`mockConfig`、`presetErrorConfig` 支持函数惰性求值，适合"登录后动态拼接地址""按环境动态取配置"等场景。

---

## 四、接口配置 apiConfig

数组的每一项为一个接口（或命名空间）。**配置项里的字段会作为该接口的默认请求参数**，与实例默认值合并，调用时传入的即时参数优先级最高（`{ ...配置项, ...即时参数 }`）。

### 4.1 普通接口

```js
{
  name: 'getAgencyInfo',                  // 接口名（必填，服务树上即 $api.getAgencyInfo）
  desc: '获取机构信息',                   // 描述，仅注释用途
  apiUrl: '/saas/zhsf/base/app-api/template/getAgencyInfo',
  method: 'post',                         // 默认 get
  crypto: false,                          // 自定义业务字段，钩子里可读
  // 其余可配：url/baseUrl/header/timeout/data/params/restful/loading/confirm/successTip/errorTip/cache/print/devWebProxy/original
}
```

### 4.2 命名空间（嵌套）

```js
{
  namespace: 'agency',                    // 命名空间名
  children: [
    { name: 'getValueByKey', apiUrl: '/api/agency/config/getValueByKey', method: 'post' },
    // children 里可以再嵌套 namespace，无限层级
  ],
}
```

调用：`$api.agency.getValueByKey({...})`。

**中断时用全名**：`UniXRequest.abortRequest('agency.getValueByKey')`。

### 4.3 restful 路径

`apiUrl` 里用 `{key}` 占位，调用时传 `restful`：

```js
// 配置
{ name: 'getOrderDetail', apiUrl: '/api/order/{id}/{tenantCode}', method: 'get' }

// 调用 → 实际请求 /api/order/100201/TP01
const order = await $api.getOrderDetail({
  restful: { id: '100201', tenantCode: 'TP01' },
})
```

### 4.4 接口重名

接口名或命名空间重名时，后定义的同名项会被忽略，并在控制台打印警告（仅 dev）。

---

## 五、请求参数（request options）

请求参数支持两种来源，**字段完全一致**：

- **接口配置参数**：定义在 `apiConfig` 接口项中（如 `{ name: 'getOrderDetail', apiUrl: '/api/order/{id}', method: 'get' }`），作为该接口的默认配置
- **即时参数**：调用 `$api.xxx(options)` 时传入的 options，临时覆盖接口配置

合并顺序：`实例默认值 → 接口配置参数 → 即时参数`（后者覆盖前者）。支持字段如下：

### 5.1 基础字段

| 字段                                         | 类型     | 默认    | 说明                                                                                   |
| -------------------------------------------- | -------- | ------- | -------------------------------------------------------------------------------------- |
| `url`                                        | `string` | `''`    | 完整请求路径。有值则**直接使用**（不再拼接 baseUrl），无值则按 `baseUrl + apiUrl` 拼接 |
| `baseUrl`                                    | `string` | 实例值  | 本次请求的基础路径（请求级优先于实例级）                                               |
| `apiUrl`                                     | `string` | `''`    | 接口路径，与 baseUrl 拼接                                                              |
| `method`                                     | `string` | `'get'` | 请求方法：get/post/put/delete 等                                                       |
| `header`                                     | `object` | `{}`    | 请求头                                                                                 |
| `timeout`                                    | `number` | -       | 超时毫秒数                                                                             |
| `data`                                       | `object` | `{}`    | body 参数                                                                              |
| `params`                                     | `object` | `{}`    | url 参数，自动拼到 query（如 `?a=1&b=2`）                                              |
| `restful`                                    | `object` | `{}`    | restful 路径参数                                                                       |
| `dataType` / `responseType` / `sslVerify` 等 | -        | -       | `uni.request` 的其余入参原样透传                                                       |

### 5.2 缓存 cache

`false` 关闭（默认）；`true` 开启（用默认配置）；或对象：

```js
cache: {
  enable: true,        // 开关，默认 true
  id: 'myCacheId',     // 缓存 id。不传则由 url/data/params/restful/method 稳定序列化自动生成
  class: 'userInfo',   // 缓存类名，支持按类批量查询/清除
  expire: 30000,       // 过期毫秒数（优先级高于 expireAt）
  expireAt: 1740000000000, // 过期时间戳
  mode: 'throttle',    // 'throttle' 命中不重置过期 | 'debounce' 命中重置过期
  persist: true,       // 持久化到本地存储，冷启动后自动恢复
}
```

### 5.3 loading

四种形态，效果等同 `uni.showLoading`：

```js
loading: false,                       // 关闭
loading: true,                        // 开启（默认文案）
loading: '加载中...',                 // 开启，指定文案
loading: { title: '加载中...', mask: true },  // 完整配置
loading: () => ({ title: '动态文案' }),       // 函数动态返回
```

**机制**：并发多个开启 loading 的请求时，内部计数，全部结束后才隐藏，避免提前消失。

### 5.4 confirm

请求前弹出确认框（在 `beforeRequest` 钩子**之前**执行），确认才发请求，取消则中止请求（reject 裸字符串 `"Request aborted"`，不弹任何提示）：

```js
confirm: false,                       // 关闭
confirm: '确认提交？',                // 指定文案
confirm: { title: '提示', content: '确认提交？' },  // 完整配置
confirm: () => true,                  // 函数动态返回
```

### 5.5 successTip

请求成功后的提示：

```js
successTip: false,                    // 关闭（默认）
successTip: '保存成功',
successTip: {
  message: '保存成功',
  popupType: 'auto',   // auto: 文本≤25字用 toast，否则 modal
  sync: false,         // 同步模式：等提示展示完再 resolve
  icon: 'none',        // toast 配置，同 uni.showToast
  duration: 1500,
},
```

### 5.6 errorTip

请求失败后的提示（默认 `true`）：

```js
errorTip: false,                      // 不弹任何失败提示
errorTip: '自定义失败文案',
errorTip: {
  enable: true,
  message: '自定义文案',  // 传入后优先级最高，覆盖预置错误
  popupType: 'auto',
  sync: false,
},
```

**机制**：失败时库会把"预置错误 / 钩子 setErrorMessage / errorTip.message"按优先级合并，取最高者展示，并写入响应 `errCode` / `errMsg`。`enable: false` 的预置错误不会弹窗。

### 5.7 其他

| 字段          | 类型      | 默认     | 说明                                                                               |
| ------------- | --------- | -------- | ---------------------------------------------------------------------------------- |
| `print`       | `boolean` | `false`  | 请求打印开关                                                                       |
| `original`    | `string`  | `"none"` | 返回结果控制：`none`/`all`/`success`/`error`，见[13.2 返回值约定](#132-返回值约定) |
| `devWebProxy` | `boolean` | `true`   | H5 dev 环境走本地代理                                                              |

---

## 六、生命周期钩子

钩子在实例上配置，贯穿请求全流程：

```
合并配置 → confirm → startTime → handleUrl → beforeRequest（ctx.abort / ctx.terminate 可终止）
→ mock → cache → checkNetwork → loading → registerPendingRequest → uni.request
→（2xx）requestSuccess /（其他）按状态码写入预置错误
→ returnRequest（requestFail → 注销登记 → 缓存写回 → loading 归零 → 成功/失败提示 → 打印 → requestComplete → resolve/reject）
```

### 6.1 ctx 请求上下文

每次请求都会创建**独立隔离**的 `ctx` 对象（仅属于本次请求，互不共享），贯穿该请求全流程。所有钩子统一接收它（也可解构使用），**直接修改其字段即可，返回值会被忽略**：

| 字段                                                   | 说明                                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `request`                                              | 合并后的请求配置，修改后影响后续流程                                                               |
| `response`                                             | 当前响应（修改 `status` 可控制成败）                                                               |
| `abort`                                                | 请求前阶段置 `true` 中止请求（reject `"Request aborted"`，不弹提示）                               |
| `terminate`                                            | 请求前阶段置 `true` 终止请求（走正常失败收尾流程）                                                 |
| `loading`                                              | 当前请求是否展示 loading（内部计数管理）                                                           |
| `startTime`                                            | 请求开始时间戳                                                                                     |
| `requestTask`                                          | 原生请求任务对象（含 `.abort()`，可中断当前请求）                                                  |
| `errorMessage`                                         | 当前错误信息对象                                                                                   |
| `setErrorMessage({ code, message, priority, enable })` | 设置自定义错误信息，`priority` 默认 1，越高越优先                                                  |
| `setErrorMessageByPresetKey(key)`                      | 按预置错误 `key`（如 `"noNetwork"`）套用错误信息                                                   |
| `setErrorMessageByPresetCode(code)`                    | 按预设错误码 `code`（如 `"002"`、`"400"`）套用预置错误信息，匹配任意预置错误（不限于 HTTP 状态码） |

> `priority` 决定最终展示哪条错误：`setErrorMessage` 默认 1，预置错误默认 0，所以钩子里设置的业务错误会覆盖默认预置错误。

### 6.2 beforeRequest（请求前）

```js
beforeRequest: async ({ request, setErrorMessage }) => {
  // 注入请求头、校验登录、改写参数等
  // 直接修改 request / response，返回值会被忽略
  request.header = { ...request.header, token: getToken() };

  // 终止请求：置 ctx.abort = true 中止（reject "Request aborted"，不弹提示）；
  // 或置 ctx.terminate = true 终止（走正常失败收尾流程）
  // if (!isLogin) {
  //   ctx.abort = true;
  //   setErrorMessage({ code: "401", message: "请先登录" });
  // }
};
```

### 6.2 requestSuccess（请求成功，HTTP 2xx）

常用于**业务码校验**：接口 2xx 但业务失败（如 `result !== 'S0000'`），在此置 `status = 0` 转失败：

```js
requestSuccess: ({ request, response, setErrorMessage }) => {
  const { result, message } = response?.data ?? {};
  if (result !== "S0000") {
    response.status = 0; // 转失败，请求最终会 reject
    if (result === "90001") {
      setErrorMessage({ code: result, message: "您还未登录", priority: 10 }); // 高优先级
    } else {
      setErrorMessage({ code: result, message });
    }
  }
};
```

### 6.4 requestFail（请求失败）

失败时调用（HTTP 非 2xx、网络错误，或业务校验在 `requestSuccess` 里置 `status = 0` 转失败），用于补充错误信息：

```js
requestFail: ({ response, setErrorMessage }) => {
  if (response.statusCode === 500) {
    setErrorMessage({ code: "500", message: "服务繁忙，请稍后再试" });
  }
};
```

### 6.5 requestComplete（请求完成）

成功、失败都会调用（取消/中止的请求不触发），常用于统一收尾：

```js
requestComplete: ({ response }) => {
  // 关闭下拉刷新、统一埋点等
};
```

---

## 七、缓存机制

### 7.1 核心行为

- **并发去重**：相同缓存 id 的请求并发时，后到的请求**不发网络请求**，等待首个请求完成后直接复用结果（节流）。
- **失败不缓存**：请求失败不会写入缓存，pending 状态清除，下次重新发起。
- **持久化**：`persist: true` 时成功结果写入本地存储，冷启动后自动恢复，并按剩余时间重排过期。

### 7.2 缓存 id

```js
// 自动生成：基于 url/data/params/restful/method 稳定序列化（对象键排序，避免 {a,b}/{b,a} 生成不同 id）
// 也可显式指定
cache: {
  id: "getUserInfo:100201";
}
```

### 7.3 过期

| 字段                       | 行为                                                                |
| -------------------------- | ------------------------------------------------------------------- |
| `expire`                   | 相对时长（毫秒），`expire` 与 `expireAt` 同时设置时以 `expire` 为准 |
| `expireAt`                 | 绝对时间戳                                                          |
| 都不传                     | 永不过期                                                            |
| `mode: 'throttle'`（默认） | 命中缓存**不重置**过期时间                                          |
| `mode: 'debounce'`         | 每次命中**重置**过期时间（相当于"活跃就续期"）                      |

### 7.4 缓存 API（静态与实例操作同一份全局数据）

```js
import UniXRequest from "@/uni-x-request";

UniXRequest.getCacheById("myCacheId"); // 查单个（内存 miss 或过期时查本地存储）
UniXRequest.getCacheByClass("userInfo"); // 按类名查（数组）
UniXRequest.clearCacheById("myCacheId"); // 清单个（内存 + 本地）
UniXRequest.clearCacheByClass("userInfo"); // 按类名批量清
UniXRequest.clearAllCache(); // 清空所有
```

---

## 八、请求中断机制

### 8.1 中断 API

```js
// 全局：中断所有实例中该接口名的请求
UniXRequest.abortRequest("getAgencyInfo");
// 命名空间接口用全名
UniXRequest.abortRequest("agency.getValueByKey");

// 全局：中断所有实例的所有请求
UniXRequest.abortAllRequest();

// 实例级：仅中断本实例
uxr.abortRequest("getAgencyInfo");
uxr.abortAllRequest();

// 单请求级：promise 上直接中断（懒转发原生 requestTask.abort）
const p = $api.getAgencyInfo({ loading: true });
setTimeout(() => p.abort(), 3000);
```

### 8.2 中断的覆盖场景

只有**真正发出的网络请求**会被中断：请求在 `uni.request` 发起时才登记进注册表，mock / 缓存命中 / 网络检查 / loading 等请求前阶段不登记，`abortRequest` 找不到即为空操作。

| 场景                                 | 说明                                                       |
| ------------------------------------ | ---------------------------------------------------------- |
| 请求前（mock/缓存/网络检查/loading） | 未登记，abort 为 no-op，请求照常走拦截流程                 |
| 请求在途被中断                       | 原生 `requestTask.abort()`，fail 回调 `request:fail abort` |
| 响应已到达后                         | `requestTask.abort()` 无副作用，成功结果照常返回           |

### 8.3 中断后的结果

中断（含取消/终止）的请求一律 reject 裸字符串 `"Request aborted"`（不是 `response.data`，也没有 `errCode`/`errMsg`），且**不弹任何提示**、不触发 `requestFail` 钩子。

---

## 九、错误处理机制

### 9.1 内置预置错误（`presetErrorConfig` 覆盖合并）

```js
default:      { message: '系统异常，请联系开发商' }     // 兜底
noNetwork:    { code: '002', message: '无网络链接' }
// 4xx：400~451 全系列（badRequest/unauthorized/notFound...）
// 5xx：500~511 全系列（internalServerError/badGateway...）
// 取消/中止不走预置错误：直接 reject 裸字符串 "Request aborted"
```

实例可覆盖：

```js
new UniXRequest({
  presetErrorConfig: {
    unauthorized: { code: "401", message: "登录已过期，请重新登录" }, // 覆盖内置 401
    noNetwork: { message: "网络不可用，请检查网络连接" }, // 覆盖文案
    90001: { code: "90001", message: "您还未登录" }, // 新增业务错误
  },
});
```

### 9.2 错误优先级

`priority` 越高越优先（默认 0），相同优先级**后者覆盖前者**：

- 预置错误（HTTP 状态码、noNetwork）：优先级 0
- 钩子 `setErrorMessage`：默认优先级 **1**
- 请求级 `errorTip.message`：按 errorTip 配置解析（默认 1）

> 取消/中止的请求不参与错误优先级合并：直接 reject 裸字符串 `"Request aborted"`，不弹提示。

### 9.3 错误流向

失败时，最终 errorMessage 的 `code`/`message` 写入响应 `errCode`/`errMsg`，并据此弹提示（`enable: true` 时）。调用方 catch 拿到的内容由 `original` 决定，见[13.2 返回值约定](#132-返回值约定)。

**网络层失败**（超时、断网、abort 等）不走 HTTP 状态码预置：catch 检测到原生错误 `errMsg` 含 `abort` 时置 `ctx.abort = true`，最终 reject 裸字符串 `"Request aborted"`（不弹提示）；其余网络错误直接取原生 `errno`/`error` 写入 `errCode`、`errMsg`/`errorMessage` 写入 `errMsg`。再由 `requestFail` 钩子补充处理（如设置业务文案、跳登录）。

---

## 十、Mock 机制

- 仅 **dev** 模式生效，build 自动关闭
- `url` 支持字符串或数组，按**正则**匹配请求 url；`method` 可选，缺省匹配任意方法，配置了则需与请求方法一致
- 配置项里的非控制字段会进入响应体
- `status` 缺省视为成功（`1`）；显式配置 `status: 0` 可模拟失败

```js
// 实例配置或 develop.config.js 里
mockConfig: [
  {
    url: "/api/order/{id}", // 支持正则：/\/order\// 或数组
    method: "get",
    enable: true,
    duration: 800, // 模拟耗时（毫秒），期间可被中断
    data: { list: [] }, // 静态数据，或函数动态生成
  },
];
```

`data` 支持函数（无参调用，每次命中时动态生成最新数据）：

```js
{
  url: '/api/user/info',
  method: 'get',
  duration: 500,
  data: () => ({ name: 'mock-user' }),
}
```

**快速复制 mock**：dev 模式打开请求打印面板，`CopyMock` 里是现成的 mock 配置，可直接粘贴使用。

---

## 十一、环境重写与代理

### 11.1 环境重写

按正则把 `baseUrl` 重写到目标环境（如 dev 打到本地、测试环境）：

```js
rewriteConfig: [
  {
    target: "http://localhost:8080", // 命中后 baseUrl 替换为该地址
    match: ["/api", "saas-industry"], // 字符串或正则数组，命中任一即重写
    enable: true,
  },
];
```

命中后 `response.rewriteHit = true`，打印面板会显示 `<Rewrite>` 标识。

### 11.2 本地代理 devWebProxy

H5 **开发环境**的跨域兜底方案：开启后请求地址改为本地 `location.origin`（dev server 地址），目标 `baseUrl` 写入请求头 `proxy` 字段，由本地代理服务器读取后转发到目标环境：

```js
// 开启（实例级配置，默认 true；仅 H5 dev 环境生效）
devWebProxy: true,

// 实际请求（假设 dev server 运行在 localhost:8080）
// 请求地址： http://localhost:8080/api/user/info        ← location.origin + apiUrl
// 请求头：   proxy: "https://api.example.com"           ← 目标 baseUrl，代理据此转发
```

配套的本地代理服务器需读取 `proxy` 请求头并转发。vue-cli 项目在 `vue.config.js` 中配合 `http-proxy-middleware` 使用：

```js
// vue.config.js
const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = {
  devServer: {
    setupMiddlewares(middlewares, { app }) {
      app.use("/", (req, res, next) => {
        const target = req.get("proxy"); // 读取目标地址
        if (target) {
          const proxy = createProxyMiddleware({ target, changeOrigin: true });
          proxy(req, res, next);
        } else {
          next();
        }
      });
      return middlewares;
    },
  },
};
```

vite 项目可参考 `server.proxy` 或同类中间件实现。

> 与环境重写的区别：重写是**直接替换** baseUrl；代理是**请求本地 + 请求头携带目标地址**，由代理服务器转发，前端天然无跨域。

---

## 十二、请求打印

- 开关：实例 `print: true` 或单请求 `print: true`；正式环境（build/release）不打印
- dev 面板按接口分组输出 `Request` / `Response` / `CopyMock`
- 响应标识：`<Rewrite>` `<Mock>` `<Cache>` 前缀 + 绿（成功）/ 红（失败）配色

---

## 十三、响应与返回值

### 13.1 响应对象

| 字段                                  | 说明                                                          |
| ------------------------------------- | ------------------------------------------------------------- |
| `status`                              | `1` 成功 / `0` 失败（内部标志，默认 `0`，成功路径显式置 `1`） |
| `data`                                | 业务数据                                                      |
| `errCode` / `errMsg`                  | 失败时写入的最终错误码 / 文案                                 |
| `statusCode`                          | HTTP 状态码（取原始响应时可见）                               |
| `duration`                            | 请求耗时（毫秒，Mock 不统计）                                 |
| `mockHit` / `cacheHit` / `rewriteHit` | 命中标识                                                      |
| `header` / `cookies` 等               | uni.request 原始响应字段                                      |

### 13.2 返回值约定

`original` 控制 resolve/reject 的内容（默认 `"none"`）：

| `original`     | 成功 resolve    | 失败 reject     |
| -------------- | --------------- | --------------- |
| `none`（默认） | 整个 `response` | 整个 `response` |
| `all`          | `response.data` | `response.data` |
| `success`      | `response.data` | 整个 `response` |
| `error`        | 整个 `response` | `response.data` |

**注意**：失败时 reject 的是业务数据而非 Error 对象，请用 `try/catch` 或 `.catch` 处理，不要依赖 `error.message`。

**注意**：取消/中止的请求 reject 的是裸字符串 `"Request aborted"`（不是业务数据，也没有 `errCode`/`errMsg`），如需区分请单独判断。

---

## 十四、最佳实践完整示例

### 14.1 请求实例（含业务校验、登录拦截）

```js
// src/request/index.js
import apiConfig from "./api";
import UniXRequest from "@/uni-x-request";

const uxr = new UniXRequest({
  baseUrl: () => uni.getStorageSync("baseUrl") || "https://api.example.com",
  apiConfig: () => apiConfig,
  print: true, // dev 打印
  header: { "Content-Type": "application/json" },
  errorTip: true,

  // 请求前：注入 token
  beforeRequest: async ({ request }) => {
    request.header = {
      ...request.header,
      authorization: `Bearer ${getToken()}`,
    };
  },

  // 请求成功：业务码校验，90001 未登录 → 转失败 + 高优错误 + 跳登录
  requestSuccess: ({ request, response, setErrorMessage }) => {
    const { result, message } = response?.data ?? {};
    if (result !== "S0000") {
      response.status = 0;
      setErrorMessage({ code: result, message });
      if (result === "90001") {
        uni.navigateTo({ url: "/pages/login/index" });
      }
    }
  },
});

export default uxr;
```

### 14.2 接口配置

```js
// src/request/api.js
export default [
  {
    name: "getUserInfo",
    apiUrl: "/api/user/info",
    method: "get",
  },
  {
    name: "getOrderDetail",
    apiUrl: "/api/order/{id}",
    method: "get",
  },
  {
    namespace: "auth",
    children: [
      { name: "login", apiUrl: "/api/auth/login", method: "post" },
      { name: "logout", apiUrl: "/api/auth/logout", method: "post" },
    ],
  },
];
```

### 14.3 页面调用

```js
// pages/user/index.vue
import uxr from "@/request";
const $api = uxr.getApiService();

export default {
  data: () => ({ list: [], loading: false }),

  async onLoad() {
    await this.fetchList();
  },

  methods: {
    async fetchList() {
      this.loading = true;
      try {
        // 缓存 + loading + 成功提示
        this.list = await $api.getOrderDetail({
          restful: { id: "100201" },
          cache: { expire: 30000, mode: "debounce" },
          loading: "加载中...",
        });
        uni.showToast({ title: "获取成功", icon: "none" });
      } catch (e) {
        // e 为失败业务数据，errCode/errMsg 已在响应里
        console.log("请求失败", e);
      } finally {
        this.loading = false;
      }
    },

    // 中断示例：离开页面时中断本页所有请求
    onUnload() {
      uxr.abortAllRequest();
    },
  },
};
```

### 14.4 缓存实战

```js
// 首次调用发网络请求，30s 内再次调用直接读缓存
await $api.getUserInfo({ cache: { id: "myUser", expire: 30000 } });
await $api.getUserInfo({ cache: { id: "myUser", expire: 30000 } }); // cacheHit

// 用户退出时清理
UniXRequest.clearCacheById("myUser");
```

---

## 十五、目录结构

```
src/uni-x-request/
├── index.js        # 主类 UniXRequest：请求主流程、钩子、服务树（getApiService/getUrl）、中断与缓存 API
├── enum.js         # 常量：请求字段、默认配置、预置错误、默认响应
├── utils.js        # 工具：类型判断、打印、checkNetwork、buildApiService
├── url.js          # URL 处理：restful/params/重写/拼接
├── message.js      # 提示体系：loading/confirm/successTip/errorTip/错误优先级
├── cache.js        # 缓存：内存+本地存储、throttle/debounce、并发去重
├── requestTask.js  # 中断：进行中请求注册表、abort 系列、任务方法转发
└── mock.js         # Mock：正则匹配、模拟时长、动态数据
```

---

## 十六、常见问题 FAQ

**Q1：失败时 reject 的不是 Error，拿不到 error.message？**
失败 reject 的内容由 `original` 决定：默认 `"none"` 取整个 `response`（含 `errCode`/`errMsg`）；若设 `"all"` 则只取 `response.data`（不含错误码/文案）。要稳定拿到错误码/文案，可设 `original: "error"`（失败取整个 response），或开启 `print` 看打印日志。

**Q2：请求取消了还会弹"系统异常"？**
不会。取消/中止的请求会 reject 裸字符串 `"Request aborted"`，不进入错误提示流程，不弹任何提示。

**Q3：并发请求 loading 提前消失？**
不会。内部按计数管理，全部请求结束才 `uni.hideLoading()`。

**Q4：同一个接口带不同 header，缓存会串吗？**
会共享缓存——缓存 id 只基于 `url/data/params/restful/method`，不包含 header。多登录态场景请显式传 `cache.id`。

**Q5：Mock 在正式环境生效吗？**
不生效。Mock 仅在 dev 模式可用。

**Q6：`getUrl`** **是什么？**
接口方法上的附加方法，用于**只拿处理后的 URL 不发请求**：

```js
const url = $api.getOrderDetail.getUrl({ restful: { id: "100201" } });
```

**Q7：`apiConfig`** **为什么用函数？**
`apiConfig: () => newApiConfig` 惰性求值，适合"登录后才确定的接口列表/动态环境配置"。

**Q8：中断一个已完成的请求？**
无副作用。请求结束后会从注册表注销，`abortRequest` 找不到即空操作。

---

## 附：TODO（规划中）

- 上传 / 下载封装（`uni.uploadFile` / `uni.downloadFile` + 进度）
- 请求重试机制（`retry` 配置）
