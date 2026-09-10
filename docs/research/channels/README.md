# 三渠道事实库索引

> 摄取日期：2026-09-10。各文档 §1 均有完整页面地址清单；标注「待核验(09-27)」的条目等搜索配额恢复后补——补摄计划与「解锁后可补模板」映射见 issue #14。

| 渠道 | 形态 | 官方文档门户 | 事实库 |
|---|---|---|---|
| 抖音 | 直连私信（dop IM，要求企业号） | https://developer.open-douyin.com/ | [douyin.md](./douyin.md) |
| 小红书 | 小程序客服消息（微信同款协议族） | https://miniapp.xiaohongshu.com/ （客服消息/消息推送）；电商侧 https://open.xiaohongshu.com/ | [xiaohongshu.md](./xiaohongshu.md) |
| 企业微信 | 直连私信（自建应用回调） | https://developer.work.weixin.qq.com/document/ | [wecom.md](./wecom.md) |

## 三家速记

- **抖音**：四套并行推送体系（dop/小游戏/服务商/生活服务），v0 主做 dop；验签头 `X-Douyin-Signature = sha1hex(client_secret + body)`。
- **小红书**：官方消息型推送＝小程序客服消息（URL＋Token＋EncodingAESKey，GET echostr 握手，`sha1(字典序排序)` 验签，JSON 载荷，回 success，5s×3 重试）；推送信封 `{Nonce, Timestamp, Encrypt, MsgSignature}`（body 内），加解密＝微信同族（官方 MsgDecrypt.zip 源码实锤，见 xiaohongshu.md §11）；电商 ark 网关另有订单事件推送。
- **企业微信**：`POST ?msg_signature=&timestamp=&nonce=`＋XML 信封；AES-256-CBC（Base64(EncodingAESKey+"=") 32B、IV=前 16B、PKCS#7 补 32B 倍数）；官方黄金自测样本在 wecom.md §5.1。
