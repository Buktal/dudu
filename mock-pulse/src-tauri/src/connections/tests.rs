//! 平台连接域测试：DispatchOutcome 序列化契约 + 适配器注册表覆盖
//! （每个配置变体必有适配器，注册表按 matches() 路由、url 快照恒有值）。

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

/// send_measured_outcome 的 Ok 折叠契约：快照四字段逐字装订，reply 按收到的
/// 状态码 + 正文推导，计时口径与 send_measured 同源。
#[test]
fn send_measured_outcome_folds_snapshot_and_reply_on_receipt() {
    use crate::test_support::{quick_client, start_single_server, RecordedPost};
    let responder: fn(&RecordedPost) -> (String, String) =
        |_| ("HTTP/1.1 200 OK".into(), "ok".into());
    let (addr, _rx) = start_single_server(responder, std::time::Duration::ZERO);
    let outcome = send_measured_outcome(
        quick_client(std::time::Duration::from_secs(2))
            .post(format!("http://{addr}/hook"))
            .header("Content-Type", "application/json")
            .body(r#"{"event":"probe"}"#.to_string()),
        "",
        DispatchSnapshot {
            msg_id: "msg-1".into(),
            signature: "sig".into(),
            timestamp: Some("1700000000".into()),
            request_body: Some(r#"{"event":"probe"}"#.into()),
        },
        |status, body| (status == 200).then(|| format!("reply:{body}")),
    );

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.body, "ok");
    assert_eq!(outcome.error, None);
    assert!(outcome.elapsed_ms < 2_000, "{outcome:?}");
    // 快照字段逐字落入结果（Ok/Err 同值）
    assert_eq!(outcome.msg_id, "msg-1");
    assert_eq!(outcome.signature, "sig");
    assert_eq!(outcome.timestamp.as_deref(), Some("1700000000"));
    assert_eq!(
        outcome.request_body.as_deref(),
        Some(r#"{"event":"probe"}"#)
    );
    // Ok 分支增量：reply 由回执推导
    assert_eq!(outcome.reply.as_deref(), Some("reply:ok"));
}

/// send_measured_outcome 的 Err 折叠契约：未收到响应时 status 0 + 空正文 +
/// request_error_reason 折叠文案（此处锚定超时分支 + 补充文案透传——本机对
/// 关闭端口表现为过滤而非拒绝，延迟应答 + 短超时客户端才可控确定）；快照
/// 字段照常保留（超时/连接失败路径同样保留请求快照），reply 恒 None。
#[test]
fn send_measured_outcome_err_branch_keeps_snapshot_without_reply() {
    use crate::test_support::{quick_client, start_single_server, RecordedPost};
    let responder: fn(&RecordedPost) -> (String, String) =
        |_| ("HTTP/1.1 200 OK".into(), "ok".into());
    let (addr, _rx) = start_single_server(responder, std::time::Duration::from_secs(1));
    let outcome = send_measured_outcome(
        quick_client(std::time::Duration::from_millis(200))
            .post(format!("http://{addr}/hook"))
            .body("{}".to_string()),
        "（官方要求 1.5 秒内应答）",
        DispatchSnapshot {
            msg_id: "msg-2".into(),
            signature: "sig".into(),
            timestamp: Some("1700000001".into()),
            request_body: Some("{}".into()),
        },
        |_, body| Some(format!("不应被调用：{body}")),
    );

    assert_eq!(outcome.status, 0);
    assert_eq!(outcome.body, "");
    let error = outcome.error.expect("应有错误原因");
    assert!(
        error.starts_with("等待响应超时（官方要求 1.5 秒内应答）："),
        "{error}"
    );
    assert_eq!(outcome.msg_id, "msg-2");
    assert_eq!(outcome.signature, "sig");
    assert_eq!(outcome.timestamp.as_deref(), Some("1700000001"));
    assert_eq!(outcome.request_body.as_deref(), Some("{}"));
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
    let meituan_config = ConnectionConfig::Meituan {
        url: String::new(),
        app_id: String::new(),
        app_secret: String::new(),
    };
    let eleme_config = ConnectionConfig::Eleme {
        url: String::new(),
        consumer_key: String::new(),
        consumer_secret: String::new(),
    };
    let alipay_config = ConnectionConfig::Alipay {
        url: String::new(),
        app_id: String::new(),
        app_private_key: String::new(),
    };
    let bilibili_config = ConnectionConfig::Bilibili {
        url: String::new(),
        client_id: String::new(),
        app_secret: String::new(),
    };
    let whatsapp_config = ConnectionConfig::Whatsapp {
        url: String::new(),
        app_secret: String::new(),
        verify_token: String::new(),
    };
    let telegram_config = ConnectionConfig::Telegram {
        url: String::new(),
        secret_token: String::new(),
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
    assert_eq!(adapter_of(&meituan_config).id(), "meituan");
    assert_eq!(adapter_of(&eleme_config).id(), "eleme");
    assert_eq!(adapter_of(&alipay_config).id(), "alipay");
    assert_eq!(adapter_of(&bilibili_config).id(), "bilibili");
    assert_eq!(adapter_of(&telegram_config).id(), "telegram");
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
    assert_eq!(
        adapter_by_channel("meituan").map(|adapter| adapter.id()),
        Some("meituan")
    );
    assert_eq!(
        adapter_by_channel("eleme").map(|adapter| adapter.id()),
        Some("eleme")
    );
    assert_eq!(
        adapter_by_channel("alipay").map(|adapter| adapter.id()),
        Some("alipay")
    );
    assert_eq!(
        adapter_by_channel("bilibili").map(|adapter| adapter.id()),
        Some("bilibili")
    );
    assert_eq!(
        adapter_by_channel("whatsapp").map(|adapter| adapter.id()),
        Some("whatsapp")
    );
    assert_eq!(
        adapter_by_channel("telegram").map(|adapter| adapter.id()),
        Some("telegram")
    );
    assert!(adapter_by_channel("zhihu").is_none());
    assert_eq!(adapter_of(&whatsapp_config).id(), "whatsapp");
    // 注册表按 matches() 路由（生产唯一不变量）：每个配置取到的适配器对本
    // 配置判别恒真、url 快照恒有值——宽→窄 downcast 收敛于适配器侧 narrow!
    // 单点，错配即编程错误（unreachable 终止），不测错配分支
    for (channel, config) in [
        ("douyin", &douyin_config),
        ("wecom", &wecom_config),
        ("wechat-mp", &wechat_mp_config),
        ("wechat-mini", &wechat_mini_config),
        ("feishu", &feishu_config),
        ("dingtalk", &dingtalk_config),
        ("qq", &qq_config),
        ("weibo", &weibo_config),
        ("xiaohongshu", &xiaohongshu_config),
        ("kuaishou", &kuaishou_config),
        ("taobao", &taobao_config),
        ("jingdong", &jingdong_config),
        ("pinduoduo", &pinduoduo_config),
        ("meituan", &meituan_config),
        ("eleme", &eleme_config),
        ("alipay", &alipay_config),
        ("bilibili", &bilibili_config),
        ("whatsapp", &whatsapp_config),
        ("telegram", &telegram_config),
    ] {
        let adapter = adapter_of(config);
        assert!(adapter.matches(config), "{channel} 适配器应判别本渠道配置");
        assert!(adapter.url(config).is_some(), "{channel} 应取到 url 快照");
    }
}
