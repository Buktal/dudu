import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  DOP_EXPECTED,
  DOUYIN_DEFINITIONS,
  dyMessageIdGenerations,
} from "./shared";

/**
 * 抖音企业号线索组件消息模板（clue-component-open 页 v1.0.5 新增，事实库
 * §2.2 对照表 + §5.18.1-§5.18.5 官方逐字样本）：高级在线预约 / 企业微信卡 /
 * 团购商品 / 系统提示 / 问题列表。源页仅展示 content 部分，信封按官方注明补
 * event/client_key/from_user_id/to_user_id，身份取值随 user_infos 官方序
 * （[0]=企业号、[1]=访客，与 ID 生成 sameAs 对齐）
 */

/** 官方样本 §5.18.1：高级在线预约（逐字；顶层 component_id/component_status） */
const goldenDyPremiumCard: WirePayload = {
  event: "im_receive_msg",
  client_key: "asdfavetgbvasf",
  from_user_id: "_000eVUpyINiqc4u9CMfAce9GgR3Aj6yI9Cn",
  to_user_id: "_000DpaOwJdpwJNe-cCMmZGHiTrOZtXjgwyE",
  content: {
    conversation_short_id:
      "@9VwP3OXCWZloOCf2aN0yVc790GDoPvGAOJdxqQulLFQQavj960zdRmYqig357zEBnE3oJ9maDzmhMGf0vZL3/A==",
    server_message_id:
      "@9VwP3OXCWZloOCf2aN0yVc790GDoPvJ12qgyjJ1IRbPX160zdRmYqig357zEBuujSkOT1XIsJ0i68fSZWfg==",
    conversation_type: 1,
    create_time: 1758195553589,
    message_type: "premium_online_appointment_card",
    source: "",
    im_mode: "Unset",
    marketing_tool:
      '{"link_type":45,"title_image":"https://p3-saiyan-sign.byteimg.com/aweme-saiyan-private/cv6349bc77u8vqee6ni0~tplv-k9qcquo31z-2000.image?lk3s=e44e97a5\\u0026x-expires=1758799992\\u0026x-signature=WSwv2ejiu7ONtuvleKy1DYFeRMI%3D","create_time":1662599423,"component_id":7140809997826394892,"title":"点击一键领取价格表⬇️⬇️⬇️","sub_title":""}',
    user_infos: [
      {
        open_id: "_000eVUpyINiqc4u9CMfAce9GgR3Aj6yI9Cn",
        nick_name: "深圳广深驾校总部",
        avatar:
          "https://p3.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-hf2m9xxmck_c9102a1f1b3a4f259e87182d921f4a76.jpeg?from=3782654143",
      },
      {
        open_id: "_000DpaOwJdpwJNe-cCMmZGHiTrOZtXjgwyE",
        nick_name: "毛士祥",
        avatar:
          "https://p3.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813_88318e131bcc41efb41713fd4a29fa20.jpeg?from=3782654143",
      },
    ],
    group_info: {},
    component_id: "7140809997826394892",
    component_status: 1,
    index: 1672502400010000,
  },
};

/** 官方样本 §5.18.2：企业微信卡（逐字；配置串字段名 common_content） */
const goldenDyEnterpriseWechatCard: WirePayload = {
  event: "im_receive_msg",
  client_key: "asdfavetgbvasf",
  from_user_id: "9d3b4506-7294-5d2f-aee6-9cf5ace3aa73",
  to_user_id: "b9b71865-7fea-44cc-8636-727e89f72be9",
  content: {
    conversation_short_id:
      "@9VwIwfmRWdMjN3X3ZYsqVc790WbtOf2KP5B1qAqhJlAXafb160zdRmYqig357zEBKEl8QmyYXAVwecSjKkRWPQ==",
    server_message_id:
      "@9VwIwfmRWdMjN3X3ZYsqVc7902frNfCKMpR4qQqmLVIUaPH560zdRmYqig357zEBKTWcn+lDsk6by5mv/nS+SQ==",
    conversation_type: 1,
    create_time: 1774842138939,
    message_type: "enterprise_wechat_card",
    source: "",
    im_mode: "Unset",
    common_content:
      '{"type":"wechat_ca_card","enterprise_name":"蓝v婚庆113","company_name":"企业号经营","tag":"提供专属优质服务","button_text":"添加企业微信"}',
    user_infos: [
      {
        open_id: "9d3b4506-7294-5d2f-aee6-9cf5ace3aa73",
        nick_name: "蓝v婚庆113",
        avatar:
          "https://p26.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813c001_oQAAAr7YXqzIfCrA4ABF1EarNjvei9igAj2AKS.jpeg?from=3782654143",
      },
      {
        open_id: "b9b71865-7fea-44cc-8636-727e89f72be9",
        nick_name: "at2201",
        avatar:
          "https://p26.douyinpic.com/aweme/720x720/aweme-avatar/douyin-user-image-file_86e8d1ef074079d967ae2833e0d8772e.jpeg?from=3782654143",
      },
    ],
    group_info: {},
    index: 1672502433310000,
  },
};

/** 官方样本 §5.18.3：团购商品（逐字；product_id 数字、价格单位分、URL 含 & 转义） */
const goldenDyProduct: WirePayload = {
  event: "im_receive_msg",
  client_key: "asdfavetgbvasf",
  from_user_id: "9d3b4506-7294-5d2f-aee6-9cf5ace3aa73",
  to_user_id: "b9b71865-7fea-44cc-8636-727e89f72be9",
  content: {
    conversation_short_id:
      "@9VwIwfmRWdMjN3X3ZYsqVc791mzgO/mKM5xwrQmjL1AVafT460zdRmYqig357zEBRiZ5AfXYWc7bz99LFISPpQ==",
    server_message_id:
      "@9VwIwfmRWdMjN3X3ZYsqVc790GDoPvCFMp1zrwuhLVcWaPj960zdRmYqig357zEBsmKVz6Ai3uFZVYq0Ku15yQ==",
    conversation_type: 1,
    create_time: 1758194529895,
    message_type: "product",
    source: "",
    im_mode: "Unset",
    product:
      '{"product_id":1792588596209674,"product_name":"欢聚|清汤1份2人餐","image_url":"https://p9-sign.douyinpic.com/tos-cn-i-hf2m9xxmck/c72a14d204bc4a47b91bc5c62304aff6~noop.jpeg?lk3s=4a7c4021\\u0026x-expires=1758214800\\u0026x-signature=qxVIgkngwMn%2BSa0IsIv4JaUCOLw%3D\\u0026from=1249656865","actual_amount":100,"sold_qty":6,"product_url":"aweme://poi/goodsdetail/?hide_own_nav_bar=1\\u0026activity_id=1792588596209674\\u0026enter_from=local_life_im\\u0026detail_enter_page=local_life_im\\u0026is_life_poi=1\\u0026detail_enter_method=card","image_uri":"tos-cn-i-hf2m9xxmck/c72a14d204bc4a47b91bc5c62304aff6","pc_product_url":"","origin_amount":1500}',
    user_infos: [
      {
        open_id: "9d3b4506-7294-5d2f-aee6-9cf5ace3aa73",
        nick_name: "蓝v婚庆113",
        avatar:
          "https://p11.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813c001_oQAAAr7YXqzIfCrA4ABF1EarNjvei9igAj2AKS.jpeg?from=3782654143",
      },
      {
        open_id: "b9b71865-7fea-44cc-8636-727e89f72be9",
        nick_name: "at2201",
        avatar:
          "https://p11.douyinpic.com/aweme/720x720/aweme-avatar/douyin-user-image-file_86e8d1ef074079d967ae2833e0d8772e.jpeg?from=3782654143",
      },
    ],
    group_info: {},
    index: 1672502400810000,
  },
};

/** 官方样本 §5.18.4：系统提示（逐字；平台系统消息，tips 含中文引号与 {{1}} 占位符） */
const goldenDyNotice: WirePayload = {
  event: "im_receive_msg",
  client_key: "asdfavetgbvasf",
  from_user_id: "9d3b4506-7294-5d2f-aee6-9cf5ace3aa73",
  to_user_id: "b9b71865-7fea-44cc-8636-727e89f72be9",
  content: {
    conversation_short_id:
      "@9VwIwfmRWdMjN3X3ZYsqVc791mzgO/mKM5xwrQmjL1AVafT460zdRmYqig357zEBRiZ5AfXYWc7bz99LFISPpQ==",
    server_message_id:
      "@9VwIwfmRWdMjN3X3ZYsqVc790GDoPvCEPpdyoAmiLFUXafP/60zdRmYqig357zEBRa5mCKbBH8coTKGmZKJ++A==",
    conversation_type: 1,
    create_time: 1758194191506,
    message_type: "notice",
    source: "",
    im_mode: "Unset",
    notice:
      '{"tips":"回复超时，智能客服介入接待（您可以在“人工客服设置-接待不及时设置”中调整配置） {{1}}","push_detail":""}',
    user_infos: [
      {
        open_id: "9d3b4506-7294-5d2f-aee6-9cf5ace3aa73",
        nick_name: "蓝v婚庆113",
        avatar:
          "https://p11.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813c001_oQAAAr7YXqzIfCrA4ABF1EarNjvei9igAj2AKS.jpeg?from=3782654143",
      },
      {
        open_id: "b9b71865-7fea-44cc-8636-727e89f72be9",
        nick_name: "at2201",
        avatar:
          "https://p11.douyinpic.com/aweme/720x720/aweme-avatar/douyin-user-image-file_86e8d1ef074079d967ae2833e0d8772e.jpeg?from=3782654143",
      },
    ],
    group_info: {},
    index: 1672502400750000,
  },
};

/** 官方样本 §5.18.5：问题列表（逐字；快捷引导提问与选项） */
const goldenDyQuestionList: WirePayload = {
  event: "im_receive_msg",
  client_key: "asdfavetgbvasf",
  from_user_id: "9d3b4506-7294-5d2f-aee6-9cf5ace3aa73",
  to_user_id: "b9b71865-7fea-44cc-8636-727e89f72be9",
  content: {
    conversation_short_id:
      "@9VwIwfmRWdMjN3X3ZYsqVc791mzgO/mKM5xwrQmjL1AVafT460zdRmYqig357zEBRiZ5AfXYWc7bz99LFISPpQ==",
    server_message_id:
      "@9VwIwfmRWdMjN3X3ZYsqVc790GDoPvCEPpZ2qwmvKlARaPL160zdRmYqig357zEBTLO2+Id3h22GEtDgzAsOtQ==",
    conversation_type: 1,
    create_time: 1758194195199,
    message_type: "question_list",
    source: "",
    im_mode: "Unset",
    question_list:
      '{"title":"好的亲，请问您家房子是在【哪个城市】呢？给您安排附近门店。","questions":["北京","上海","深圳","广州","杭州","南京","成都","其他城市"]}',
    user_infos: [
      {
        open_id: "9d3b4506-7294-5d2f-aee6-9cf5ace3aa73",
        nick_name: "蓝v婚庆113",
        avatar:
          "https://p11.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813c001_oQAAAr7YXqzIfCrA4ABF1EarNjvei9igAj2AKS.jpeg?from=3782654143",
      },
      {
        open_id: "b9b71865-7fea-44cc-8636-727e89f72be9",
        nick_name: "at2201",
        avatar:
          "https://p11.douyinpic.com/aweme/720x720/aweme-avatar/douyin-user-image-file_86e8d1ef074079d967ae2833e0d8772e.jpeg?from=3782654143",
      },
    ],
    group_info: {},
    index: 1672502400770000,
  },
};

export const DOUYIN_IM_LEADS_SCHEMAS = [
  defineSchema(DOUYIN_DEFINITIONS, "dy-premium-card", {
    eventName: "im_receive_msg",
    name: "接收私信 · 在线预约卡片（线索）",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDyPremiumCard,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-enterprise-wechat-card", {
    eventName: "im_receive_msg",
    name: "接收私信 · 企业微信卡片（线索）",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDyEnterpriseWechatCard,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-product", {
    eventName: "im_receive_msg",
    name: "接收私信 · 团购商品（线索）",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDyProduct,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-notice", {
    eventName: "im_receive_msg",
    name: "接收私信 · 系统提示（线索）",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDyNotice,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-question-list", {
    eventName: "im_receive_msg",
    name: "接收私信 · 问题引导（线索）",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDyQuestionList,
  }),
] as const;
