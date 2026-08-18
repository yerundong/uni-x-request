// uni.request 请求入参的字段集合
const UNI_REQUEST_FIELDS = [
  "url",
  "method",
  "timeout",
  "responseType",
  "data",
  "header",
  "dataType",
  "sslVerify",
  "withCredentials",
  "firstIpv4",
  "enableHttp2",
  "enableQuic",
  "enableCache",
  "enableHttpDNS",
  "httpDNSServiceId",
  "enableChunked",
  "forceCellularNetwork",
  "enableCookie",
  "cloudCache",
  "defer",
  "success",
  "fail",
  "complete",
];

// request 请求入参的字段集合
const REQUEST_FIELDS = [
  ...UNI_REQUEST_FIELDS,
  "baseUrl",
  "apiUrl",
  "params",
  "restful",
  "loading",
  "confirm",
  "errorTip",
  "successTip",
  "cache",
  "print",
  "devWebProxy",
  "original",
];

// 默认实例配置
const DEFAULT_INSTANCE_CONFIG = {
  apiConfig: [],
  rewriteConfig: [],
  mockConfig: [],
  url: "",
  baseUrl: "",
  apiUrl: "",
  method: "get",
  loading: false,
  confirm: false,
  errorTip: true,
  successTip: false,
  cache: false,
  print: false,
  devWebProxy: true,
  original: "none",
  header: {},
  data: {},
  params: {},
  restful: {},
};

/**
 * @description 默认预设错误配置
 * @code 错误码
 * @message 错误提示语
 * @priority 错误优先级，默认为 0
 * @enable 是否弹出提示，默认为 true
 */
const DEFAULT_PRESET_ERROR_CONFIG = {
  default: {
    message: "系统异常，请联系开发商",
  },
  noNetwork: {
    code: "000",
    message: "无网络链接",
  },

  // ========== 4xx 客户端错误 ==========
  badRequest: {
    code: "400",
    message: "400: Bad Request",
  },
  unauthorized: {
    code: "401",
    message: "401: Unauthorized",
  },
  paymentRequired: {
    code: "402",
    message: "402: Payment Required",
  },
  forbidden: {
    code: "403",
    message: "403: Forbidden",
  },
  notFound: {
    code: "404",
    message: "404: Not Found",
  },
  methodNotAllowed: {
    code: "405",
    message: "405: Method Not Allowed",
  },
  notAcceptable: {
    code: "406",
    message: "406: Not Acceptable",
  },
  proxyAuthenticationRequired: {
    code: "407",
    message: "407: Proxy Authentication Required",
  },
  requestTimeout: {
    code: "408",
    message: "408: Request Timeout",
  },
  conflict: {
    code: "409",
    message: "409: Conflict",
  },
  gone: {
    code: "410",
    message: "410: Gone",
  },
  lengthRequired: {
    code: "411",
    message: "411: Length Required",
  },
  preconditionFailed: {
    code: "412",
    message: "412: Precondition Failed",
  },
  payloadTooLarge: {
    code: "413",
    message: "413: Payload Too Large",
  },
  uriTooLong: {
    code: "414",
    message: "414: URI Too Long",
  },
  unsupportedMediaType: {
    code: "415",
    message: "415: Unsupported Media Type",
  },
  rangeNotSatisfiable: {
    code: "416",
    message: "416: Range Not Satisfiable",
  },
  expectationFailed: {
    code: "417",
    message: "417: Expectation Failed",
  },
  imATeapot: {
    code: "418",
    message: "418: I'm a teapot",
  },
  misdirectedRequest: {
    code: "421",
    message: "421: Misdirected Request",
  },
  unprocessableEntity: {
    code: "422",
    message: "422: Unprocessable Entity",
  },
  locked: {
    code: "423",
    message: "423: Locked",
  },
  failedDependency: {
    code: "424",
    message: "424: Failed Dependency",
  },
  tooEarly: {
    code: "425",
    message: "425: Too Early",
  },
  upgradeRequired: {
    code: "426",
    message: "426: Upgrade Required",
  },
  preconditionRequired: {
    code: "428",
    message: "428: Precondition Required",
  },
  tooManyRequests: {
    code: "429",
    message: "429: Too Many Requests",
  },
  requestHeaderFieldsTooLarge: {
    code: "431",
    message: "431: Request Header Fields Too Large",
  },
  unavailableForLegalReasons: {
    code: "451",
    message: "451: Unavailable For Legal Reasons",
  },

  // ========== 5xx 服务端错误 ==========
  internalServerError: {
    code: "500",
    message: "500: Internal Server Error",
  },
  notImplemented: {
    code: "501",
    message: "501: Not Implemented",
  },
  badGateway: {
    code: "502",
    message: "502: Bad Gateway",
  },
  serviceUnavailable: {
    code: "503",
    message: "503: Service Unavailable",
  },
  gatewayTimeout: {
    code: "504",
    message: "504: Gateway Timeout",
  },
  httpVersionNotSupported: {
    code: "505",
    message: "505: HTTP Version Not Supported",
  },
  variantAlsoNegotiates: {
    code: "506",
    message: "506: Variant Also Negotiates",
  },
  insufficientStorage: {
    code: "507",
    message: "507: Insufficient Storage",
  },
  loopDetected: {
    code: "508",
    message: "508: Loop Detected",
  },
  notExtended: {
    code: "510",
    message: "510: Not Extended",
  },
  networkAuthenticationRequired: {
    code: "511",
    message: "511: Network Authentication Required",
  },
};

// 默认响应数据
const DEFAULT_RESPONSE = {
  status: 0,
  rewriteHit: false,
  mockHit: false,
  cacheHit: false,
  duration: 0,
};

// ==================== 导出 ====================

export {
  UNI_REQUEST_FIELDS,
  REQUEST_FIELDS,
  DEFAULT_INSTANCE_CONFIG,
  DEFAULT_PRESET_ERROR_CONFIG,
  DEFAULT_RESPONSE,
};
