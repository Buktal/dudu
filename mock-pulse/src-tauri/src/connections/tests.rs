//! 平台连接域测试：DispatchOutcome 序列化契约 + 适配器注册表覆盖
//! （每个配置变体必有适配器，url 快照与判别互为映照）。

use super::*;

#[test]
fn dispatch_outcome_serializes_camel_case_for_frontend() {
    let outcome = DispatchOutcome {
        msg_id: "1372623149".into(),
        signature: "a".repeat(40),
        timestamp: Some("1409659813".into()),
        request_body: Some("<xml/>".into()),
        reply: Some("<xml/>".into()),
        status: 200,
        elapsed_ms: 9,
        body: "success".into(),
        error: None,
    };
    let raw = serde_json::to_string(&outcome).unwrap();
    assert!(raw.contains("\"elapsedMs\""));
    assert!(raw.contains("\"reply\""));
    assert!(!raw.contains("elapsed_ms"));
}

#[test]
fn not_sent_outcome_carries_zero_receipt_and_reason() {
    let outcome = DispatchOutcome::not_sent("缺少渠道连接配置");
    assert_eq!(outcome.status, 0);
    assert_eq!(outcome.error.as_deref(), Some("缺少渠道连接配置"));
    // 协议要素不落值：未发出请求就没有签名/唯一标识/请求快照
    assert_eq!(outcome.signature, "");
    assert_eq!(outcome.msg_id, "");
    assert_eq!(outcome.request_body, None);
    assert_eq!(outcome.timestamp, None);
    assert_eq!(outcome.reply, None);
}

#[test]
fn adapter_registry_covers_every_config_variant() {
    let douyin_config = ConnectionConfig::Douyin {
        url: String::new(),
        system: DouyinSystem::Dop,
        client_key: String::new(),
        client_secret: String::new(),
        mini_game_token: String::new(),
        isv_token: String::new(),
        isv_key: String::new(),
    };
    let wecom_config = ConnectionConfig::Wecom {
        url: String::new(),
        system: WecomSystem::Agent,
        corp_id: String::new(),
        token: String::new(),
        encoding_aes_key: String::new(),
        agent_id: String::new(),
    };
    let wechat_mp_config = ConnectionConfig::WechatMp {
        url: String::new(),
        app_id: String::new(),
        token: String::new(),
        encoding_aes_key: String::new(),
        mode: WechatMpMode::Plain,
    };
    let wechat_mini_config = ConnectionConfig::WechatMini {
        url: String::new(),
        app_id: String::new(),
        token: String::new(),
        encoding_aes_key: String::new(),
        mode: WechatMiniMode::Plain,
        data_format: WechatMiniDataFormat::Xml,
    };
    let feishu_config = ConnectionConfig::Feishu {
        url: String::new(),
        app_id: String::new(),
        verification_token: String::new(),
        encrypt_key: String::new(),
    };
    let dingtalk_config = ConnectionConfig::Dingtalk {
        url: String::new(),
        system: DingtalkSystem::HttpCrypto,
        token: String::new(),
        encoding_aes_key: String::new(),
        owner_key: String::new(),
        app_secret: String::new(),
    };
    let qq_config = ConnectionConfig::Qq {
        url: String::new(),
        app_id: String::new(),
        app_secret: String::new(),
    };
    let weibo_config = ConnectionConfig::Weibo {
        url: String::new(),
        app_secret: String::new(),
    };
    let xiaohongshu_config = ConnectionConfig::Xiaohongshu {
        url: String::new(),
        system: XiaohongshuSystem::Miniapp,
        token: String::new(),
        encoding_aes_key: String::new(),
        app_id: String::new(),
    };
    let kuaishou_config = ConnectionConfig::Kuaishou {
        url: String::new(),
        app_id: String::new(),
        app_secret: String::new(),
    };
    let taobao_config = ConnectionConfig::Taobao {
        url: String::new(),
        app_key: String::new(),
        app_secret: String::new(),
    };
    let jingdong_config = ConnectionConfig::Jingdong {
        url: String::new(),
        app_key: String::new(),
        app_secret: String::new(),
    };
    let pinduoduo_config = ConnectionConfig::Pinduoduo {
        url: String::new(),
        client_id: String::new(),
        client_secret: String::new(),
    };
    assert_eq!(adapter_of(&douyin_config).id(), "douyin");
    assert_eq!(adapter_of(&wecom_config).id(), "wecom");
    assert_eq!(adapter_of(&wechat_mp_config).id(), "wechat-mp");
    assert_eq!(adapter_of(&wechat_mini_config).id(), "wechat-mini");
    assert_eq!(adapter_of(&feishu_config).id(), "feishu");
    assert_eq!(adapter_of(&dingtalk_config).id(), "dingtalk");
    assert_eq!(adapter_of(&qq_config).id(), "qq");
    assert_eq!(adapter_of(&weibo_config).id(), "weibo");
    assert_eq!(adapter_of(&xiaohongshu_config).id(), "xiaohongshu");
    assert_eq!(adapter_of(&kuaishou_config).id(), "kuaishou");
    assert_eq!(adapter_of(&taobao_config).id(), "taobao");
    assert_eq!(adapter_of(&jingdong_config).id(), "jingdong");
    assert_eq!(adapter_of(&pinduoduo_config).id(), "pinduoduo");
    assert_eq!(
        adapter_by_channel("douyin").map(|adapter| adapter.id()),
        Some("douyin")
    );
    assert_eq!(
        adapter_by_channel("wecom").map(|adapter| adapter.id()),
        Some("wecom")
    );
    assert_eq!(
        adapter_by_channel("wechat-mp").map(|adapter| adapter.id()),
        Some("wechat-mp")
    );
    assert_eq!(
        adapter_by_channel("wechat-mini").map(|adapter| adapter.id()),
        Some("wechat-mini")
    );
    assert_eq!(
        adapter_by_channel("feishu").map(|adapter| adapter.id()),
        Some("feishu")
    );
    assert_eq!(
        adapter_by_channel("dingtalk").map(|adapter| adapter.id()),
        Some("dingtalk")
    );
    assert_eq!(
        adapter_by_channel("qq").map(|adapter| adapter.id()),
        Some("qq")
    );
    assert_eq!(
        adapter_by_channel("weibo").map(|adapter| adapter.id()),
        Some("weibo")
    );
    assert_eq!(
        adapter_by_channel("xiaohongshu").map(|adapter| adapter.id()),
        Some("xiaohongshu")
    );
    assert_eq!(
        adapter_by_channel("kuaishou").map(|adapter| adapter.id()),
        Some("kuaishou")
    );
    assert_eq!(
        adapter_by_channel("taobao").map(|adapter| adapter.id()),
        Some("taobao")
    );
    assert_eq!(
        adapter_by_channel("jingdong").map(|adapter| adapter.id()),
        Some("jingdong")
    );
    assert_eq!(
        adapter_by_channel("pinduoduo").map(|adapter| adapter.id()),
        Some("pinduoduo")
    );
    assert!(adapter_by_channel("telegram").is_none());
    // 渠道串与配置判别互为映照：url 快照只对匹配的配置成立
    for adapter in ADAPTERS {
        assert_eq!(
            adapter.url(&douyin_config).is_some(),
            adapter.matches(&douyin_config)
        );
        assert_eq!(
            adapter.url(&wecom_config).is_some(),
            adapter.matches(&wecom_config)
        );
        assert_eq!(
            adapter.url(&wechat_mp_config).is_some(),
            adapter.matches(&wechat_mp_config)
        );
        assert_eq!(
            adapter.url(&wechat_mini_config).is_some(),
            adapter.matches(&wechat_mini_config)
        );
        assert_eq!(
            adapter.url(&feishu_config).is_some(),
            adapter.matches(&feishu_config)
        );
        assert_eq!(
            adapter.url(&dingtalk_config).is_some(),
            adapter.matches(&dingtalk_config)
        );
        assert_eq!(
            adapter.url(&qq_config).is_some(),
            adapter.matches(&qq_config)
        );
        assert_eq!(
            adapter.url(&weibo_config).is_some(),
            adapter.matches(&weibo_config)
        );
        assert_eq!(
            adapter.url(&xiaohongshu_config).is_some(),
            adapter.matches(&xiaohongshu_config)
        );
        assert_eq!(
            adapter.url(&kuaishou_config).is_some(),
            adapter.matches(&kuaishou_config)
        );
        assert_eq!(
            adapter.url(&taobao_config).is_some(),
            adapter.matches(&taobao_config)
        );
        assert_eq!(
            adapter.url(&jingdong_config).is_some(),
            adapter.matches(&jingdong_config)
        );
        assert_eq!(
            adapter.url(&pinduoduo_config).is_some(),
            adapter.matches(&pinduoduo_config)
        );
    }
}
