import type {
  DingtalkSystem,
  DouyinSystem,
  WechatMiniDataFormat,
  WechatMiniMode,
  WechatMpMode,
  WecomSystem,
} from "../api";

/**
 * 连接表单的体系/通道/模式选项常量（选项顺序即展示序，取值与 Rust 端
 * 各体系枚举的 snake_case 内标一致；事实库出处见各项注释）。
 */

/** 抖音推送体系（事实库 §2 四套并行体系，验签/信封完全不同） */
export const DOUYIN_SYSTEMS: readonly { value: DouyinSystem; label: string }[] =
  [
    { value: "dop", label: "dop Webhooks（移动/网站应用）" },
    { value: "life_service", label: "生活服务 WebHooks" },
    { value: "mini_game", label: "小游戏消息推送" },
    { value: "isv", label: "服务商（第三方小程序）" },
  ];

/** 企微推送通道（事实库 §2.1/§2.2/§2.10：XML 自建应用与 JSON 智能机器人） */
export const WECOM_SYSTEMS: readonly { value: WecomSystem; label: string }[] = [
  { value: "agent", label: "自建应用（XML 回调）" },
  { value: "aibot", label: "智能机器人（JSON 回调）" },
];

/** 钉钉推送通道（事实库 §2 体系 B/D：密文事件回调与机器人明文收消息） */
export const DINGTALK_SYSTEMS: readonly {
  value: DingtalkSystem;
  label: string;
}[] = [
  { value: "http_crypto", label: "事件订阅（新 HTTP 密文信封）" },
  { value: "bot", label: "机器人收消息（明文 JSON）" },
];

/** 公众号消息加解密方式（事实库 §4.1 三模式，官方服务器配置配套项） */
export const WECHAT_MP_MODES: readonly {
  value: WechatMpMode;
  label: string;
}[] = [
  { value: "plain", label: "明文模式（官方默认）" },
  { value: "compatible", label: "兼容模式（调试过渡）" },
  { value: "secure", label: "安全模式（官方推荐）" },
];

/** 小程序消息加解密方式（事实库 §3.1 三选一：明文/兼容不建议、安全强烈推荐） */
export const WECHAT_MINI_MODES: readonly {
  value: WechatMiniMode;
  label: string;
}[] = [
  { value: "plain", label: "明文模式" },
  { value: "compatible", label: "兼容模式" },
  { value: "secure", label: "安全模式（官方强烈推荐）" },
];

/** 小程序数据格式（事实库 §3.1：XML/JSON 可选，与公众号不同点） */
export const WECHAT_MINI_DATA_FORMATS: readonly {
  value: WechatMiniDataFormat;
  label: string;
}[] = [
  { value: "xml", label: "XML（本工具推送主形态）" },
  { value: "json", label: "JSON" },
];
