import type {
  AlipayConnectionConfig,
  ElemeConnectionConfig,
  JingdongConnectionConfig,
  MeituanConnectionConfig,
  PinduoduoConnectionConfig,
  TaobaoConnectionConfig,
} from "./api";
import type { ChannelTrait, CredentialField } from "./channel-traits-model";
import { hasText } from "./channel-traits-model";

/**
 * 交易行集（taobao/jingdong/pinduoduo/meituan/eleme/alipay）：电商/交易系
 * 六渠道，无通道选择器。各行自带默认连接 + 凭证字段 + 必填集 + 信封形态 +
 * 验证文案；构建器均为文件内函数（不导出），必填集统一走 hasText。
 */

/** 原型默认值：全球栈 HMAC-SHA256 验签起步 */
export const defaultTaobaoConnection: TaobaoConnectionConfig = {
  channel: "taobao",
  url: "http://127.0.0.1:8080/webhooks/taobao",
  appKey: "",
  appSecret: "",
};

/** 原型默认值：JOS MD5 签名起步 */
export const defaultJingdongConnection: JingdongConnectionConfig = {
  channel: "jingdong",
  url: "http://127.0.0.1:8080/webhooks/jingdong",
  appKey: "",
  appSecret: "",
};

/** 原型默认值：PMC UPPER(MD5) 签名起步 */
export const defaultPinduoduoConnection: PinduoduoConnectionConfig = {
  channel: "pinduoduo",
  url: "http://127.0.0.1:8080/webhooks/pinduoduo",
  clientId: "",
  clientSecret: "",
};

/** 原型默认值：合作中心 MD5(url?字母序+secret) 签名起步 */
export const defaultMeituanConnection: MeituanConnectionConfig = {
  channel: "meituan",
  url: "http://127.0.0.1:8080/webhooks/meituan",
  appId: "",
  appSecret: "",
};

/** 原型默认值：用户线 SHA1 五步签名起步 */
export const defaultElemeConnection: ElemeConnectionConfig = {
  channel: "eleme",
  url: "http://127.0.0.1:8080/webhooks/eleme",
  consumerKey: "",
  consumerSecret: "",
};

/** 原型默认值：异步通知 RSA2 验签起步 */
export const defaultAlipayConnection: AlipayConnectionConfig = {
  channel: "alipay",
  url: "http://127.0.0.1:8080/webhooks/alipay",
  appId: "",
  appPrivateKey: "",
};

/** 淘宝凭证字段（事实库 §4.2，全球栈 HTTPS 回调）：消息体 = AppKey + body，密钥 = AppSecret */
function taobaoFields(draft: TaobaoConnectionConfig): CredentialField[] {
  return [
    {
      key: "appKey",
      label: "AppKey",
      note: "全球栈应用标识：验签消息体 = AppKey 拼接请求 body（官方示例 AppKey「123456」），缺失即签名不可复算。",
      value: draft.appKey,
      secret: false,
    },
    {
      key: "appSecret",
      label: "AppSecret",
      note: "全球栈应用密钥：Authorization = HEX(HMAC-SHA256(AppKey+body, AppSecret)) 头验签的密钥；数据明文传输，无 AES。",
      value: draft.appSecret,
      secret: true,
    },
  ];
}

/** 京东凭证字段（事实库 §4.1/§4.2/§6，JOS 消息推送模拟）：sign = UPPER(MD5(appSecret+字母序 k+v+appSecret)) */
function jingdongFields(draft: JingdongConnectionConfig): CredentialField[] {
  return [
    {
      key: "appKey",
      label: "AppKey",
      note: "应用 app_key（应用中心创建应用获取）：系统参数（事实库 §4.2 表必传项），参与字母序签名拼接。",
      value: draft.appKey,
      secret: false,
    },
    {
      key: "appSecret",
      label: "AppSecret",
      note: "应用密钥：sign = UPPER(MD5(appSecret + 按字母序 k+v 拼接 + appSecret))（官方签名步骤逐字，事实库 §4.1）两端夹 secret 的签名源。",
      value: draft.appSecret,
      secret: true,
    },
  ];
}

/** 拼多多凭证字段（事实库 §4.1，PMC 订阅推送模拟）：sign = UPPER(MD5(secret+ASCII 排序 kv+secret)) */
function pinduoduoFields(draft: PinduoduoConnectionConfig): CredentialField[] {
  return [
    {
      key: "clientId",
      label: "Client ID",
      note: "应用 client_id（应用详情查看）：公共参数必传项（事实库 §4.1 表），参与 ASCII 排序签名拼接。",
      value: draft.clientId,
      secret: false,
    },
    {
      key: "clientSecret",
      label: "Client Secret",
      note: "应用密钥：sign = UPPER(MD5(client_secret + 按 ASCII 升序 k+v 拼接 + client_secret))（官方签名三步逐字，事实库 §4.1，官方向量已核验）两端夹 secret 的签名源；access_token 放参数集参签，非 Authorization 头。",
      value: draft.clientSecret,
      secret: true,
    },
  ];
}

/** 美团凭证字段（事实库 §4.1/§6，合作中心表单回调）：sig = MD5(url?字母序 k=v+secret) */
function meituanFields(draft: MeituanConnectionConfig): CredentialField[] {
  return [
    {
      key: "appId",
      label: "AppID",
      note: "应用 app_id（开发者中心查看）：系统级参数必传项（事实库 §4.1/§6），参与字母序签名拼接，由适配器随直发补齐。",
      value: draft.appId,
      secret: false,
    },
    {
      key: "appSecret",
      label: "App Secret",
      note: "应用密钥（官方亦称 consumer_secret）：待签串 = 请求 url + ? + 全字段（sig 除外）字母序 k=v & 连接 + secret，MD5 32 位小写即 sig（官方五步逐字，事实库 §4.1，官方向量已对拍）。",
      value: draft.appSecret,
      secret: true,
    },
  ];
}

/** 饿了么凭证字段（事实库 §4.1/§6，用户线推送模拟）：sig = SHA1(HEX(url?字母序+secret)) */
function elemeFields(draft: ElemeConnectionConfig): CredentialField[] {
  return [
    {
      key: "consumerKey",
      label: "Consumer Key",
      note: "应用 Key（应用身份标识，饿了么分配、可在接入后台查看）：系统级参数必传项（事实库 §4.1/§6「每次调用带 consumer_key + timestamp(秒) + sig」），参与 ASCII 排序签名拼接。",
      value: draft.consumerKey,
      secret: false,
    },
    {
      key: "consumerSecret",
      label: "Consumer Secret",
      note: "应用 Secret（应用私钥）：除 sig 外参数按 ASCII 排序 k=v & 连接，拼 url?…+ secret 后 UTF-8 逐字节 HEX，SHA1 取 40 位小写即 sig（官方五步逐字，事实库 §4.1，官方示例待签串已复现）。",
      value: draft.consumerSecret,
      secret: true,
    },
  ];
}

/** 支付宝凭证字段（事实库 §4.1/§4.3/§6.1，异步通知三地址）：sign = Base64(RSA-SHA256(字母序待签串)) */
function alipayFields(draft: AlipayConnectionConfig): CredentialField[] {
  return [
    {
      key: "appId",
      label: "AppID",
      note: "应用 APPID（创建应用生成）：异步通知公共参数 app_id（非三方场景 auth_app_id=app_id，事实库 §5.1）随载荷信封携带，此处仅随连接记录。",
      value: draft.appId,
      secret: false,
    },
    {
      key: "appPrivateKey",
      label: "签名私钥",
      note: "支付宝侧签名私钥（PEM PKCS#8/PKCS#1 或 DER Base64）：与商户侧配置的支付宝公钥成对（通知验签用支付宝公钥，事实库 §4.3），sign = Base64(RSA-SHA256(剔除 sign/sign_type 后字典序 k=v 串))；测试联调自备密钥对，私钥建议落专用文件（事实库 §4.5）。",
      value: draft.appPrivateKey,
      secret: true,
    },
  ];
}

/** 淘宝核：appKey + appSecret 必填（验签消息体 = AppKey + body） */
function taobaoReady(config: TaobaoConnectionConfig): boolean {
  return hasText(config.appKey) && hasText(config.appSecret);
}

/** 京东核：appKey + appSecret 必填（UPPER(MD5) 签名的密钥与系统参数） */
function jingdongReady(config: JingdongConnectionConfig): boolean {
  return hasText(config.appKey) && hasText(config.appSecret);
}

/** 拼多多核：clientId + clientSecret 必填（UPPER(MD5) 签名的密钥与公共参数） */
function pinduoduoReady(config: PinduoduoConnectionConfig): boolean {
  return hasText(config.clientId) && hasText(config.clientSecret);
}

/** 美团核：appId + appSecret 必填（MD5(url?字母序+secret) 的密钥与系统参数） */
function meituanReady(config: MeituanConnectionConfig): boolean {
  return hasText(config.appId) && hasText(config.appSecret);
}

/** 饿了么核：consumerKey + consumerSecret 必填（SHA1 五步签名的密钥与系统参数） */
function elemeReady(config: ElemeConnectionConfig): boolean {
  return hasText(config.consumerKey) && hasText(config.consumerSecret);
}

/** 支付宝核：appPrivateKey 必填（RSA-SHA256 签名私钥；appId 随信封不参与） */
function alipayReady(config: AlipayConnectionConfig): boolean {
  return hasText(config.appPrivateKey);
}

/** 交易行集：键即渠道 id，值即该行完整描述（组装见 ./channel-traits） */
export const tradeTraits = {
  taobao: {
    defaultConnection: defaultTaobaoConnection,
    credentialFields: taobaoFields,
    credentialReady: taobaoReady,
    wireFormat: "JSON",
    testNote: () =>
      "发送 Verify 验证（POST 官方正向样本明文 + Authorization = HEX(HMAC-SHA256(AppKey+body, AppSecret)) 头），检查服务是否返回 HTTP 200（500ms 签收语义）。",
    selectors: [],
  },
  jingdong: {
    defaultConnection: defaultJingdongConnection,
    credentialFields: jingdongFields,
    credentialReady: jingdongReady,
    wireFormat: "JSON",
    testNote: () =>
      "发送推送探针（POST 官方状态枚举样本明文，query 带 app_key/timestamp/v 与 sign = UPPER(MD5(appSecret+字母序 k+v+appSecret))），检查服务是否返回 HTTP 200（官方验证握手口径待核验，探针语义同普通推送）。",
    selectors: [],
  },
  pinduoduo: {
    defaultConnection: defaultPinduoduoConnection,
    credentialFields: pinduoduoFields,
    credentialReady: pinduoduoReady,
    wireFormat: "JSON",
    testNote: () =>
      "发送推送探针（POST 官方订单状态样本明文，query 带 client_id/timestamp（UNIX 秒）与 sign = UPPER(MD5(client_secret+ASCII 排序 k+v+client_secret))），检查服务是否返回 HTTP 200（官方验证握手口径待核验，探针语义同普通推送）。",
    selectors: [],
  },
  meituan: {
    defaultConnection: defaultMeituanConnection,
    credentialFields: meituanFields,
    credentialReady: meituanReady,
    wireFormat: "表单",
    testNote: () =>
      "发送推送探针（POST 官方订单核验样本表单，字段集尾部追加 app_id/timestamp 与 sig = MD5(url?字母序 k=v 串 + App Secret)），检查服务是否返回 HTTP 200（官方验证握手正文待核验，探针语义同普通推送）。",
    selectors: [],
  },
  eleme: {
    defaultConnection: defaultElemeConnection,
    credentialFields: elemeFields,
    credentialReady: elemeReady,
    wireFormat: "JSON",
    testNote: () =>
      '发送推送探针（POST 官方订单状态核验样本明文，query 带 consumer_key/timestamp 与 sig = SHA1(HEX(url?字母序 k=v 串 + Consumer Secret))），检查服务是否返回 HTTP 200（官方无握手，探针语义同普通推送；成功应答口径 HTTP 200 + {"message":"ok"}）。',
    selectors: [],
  },
  alipay: {
    defaultConnection: defaultAlipayConnection,
    credentialFields: alipayFields,
    credentialReady: alipayReady,
    wireFormat: "表单",
    testNote: () =>
      "发送推送探针（POST 官方支付异步通知核验样本表单，sign = Base64(RSA-SHA256(剔除 sign/sign_type 后字典序 k=v 串))，RSA2），检查服务是否返回 HTTP 200 并回纯文本 success（官方网关验证握手细节待核验，探针语义同普通推送）。",
    selectors: [],
  },
} as const satisfies {
  taobao: ChannelTrait<TaobaoConnectionConfig>;
  jingdong: ChannelTrait<JingdongConnectionConfig>;
  pinduoduo: ChannelTrait<PinduoduoConnectionConfig>;
  meituan: ChannelTrait<MeituanConnectionConfig>;
  eleme: ChannelTrait<ElemeConnectionConfig>;
  alipay: ChannelTrait<AlipayConnectionConfig>;
};
