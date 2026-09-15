import type {
  AlipayConnectionConfig,
  ElemeConnectionConfig,
  JingdongConnectionConfig,
  MeituanConnectionConfig,
  PinduoduoConnectionConfig,
  TaobaoConnectionConfig,
} from "../api";

/**
 * 电商/交易系渠道的凭证字段构建器（纯数据，无 JSX）：淘宝/京东/拼多多/美团/
 * 饿了么/支付宝六渠道——自 credential-fields.ts 按职责拆出（单文件 ≤ 500 行，
 * #46 随支付宝接入拆分）；共享的表单字段形态也在此声明（router 单向依赖本
 * 模块，无循环）。标签/说明锚定各渠道事实库（docs/research/channels/）。
 */

/** 表单字段的构建形态：key 对应配置字段名，secret 走掩码输入 */
export type CredentialField = {
  key: string;
  label: string;
  note: string;
  value: string;
  secret: boolean;
};

/** 淘宝凭证字段（事实库 §4.2，全球栈 HTTPS 回调）：消息体 = AppKey + body，密钥 = AppSecret */
export function taobaoFields(draft: TaobaoConnectionConfig): CredentialField[] {
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
export function jingdongFields(
  draft: JingdongConnectionConfig,
): CredentialField[] {
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
export function pinduoduoFields(
  draft: PinduoduoConnectionConfig,
): CredentialField[] {
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
export function meituanFields(
  draft: MeituanConnectionConfig,
): CredentialField[] {
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
export function elemeFields(draft: ElemeConnectionConfig): CredentialField[] {
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
export function alipayFields(draft: AlipayConnectionConfig): CredentialField[] {
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
