# 小红书三方私信收发规格调研

调研日期：2026-11-04

本文是对 [xiaohongshu.md](xiaohongshu.md) §13 §14 之外的第二轮定向深挖，聚焦收发规格本身，不重复绑定与 token 轮换事实。结论先行：消息级收发字段级规格仍不存在于公开网络；本轮新拿到推送回调验签机制（多源一致）、线索推送报文结构（真实联调代码逆向）、网关实测规约闭环

## 置信度分级

沿用 xiaohongshu.md 体系并新增两档

- [官方]：小红书官方文档或官方后台文案逐字
- [官方实测]：本轮对 adapi 网关 curl 实测所得
- [多源]：两家及以上相互独立的第三方转述一致
- [单源]：单一第三方来源，未交叉验证
- [联调代码]：公开仓库中接收过真实推送的对接代码（最高价值的第三方证据）
- [逆向]：从前端产物或代码反推
- [推测]：仅逻辑推断，无直接证据
- [幻象]：曾被搜索摘要引用但已证伪不存在的 URL

## 0 结论速览

| 问题 | 结论 | 置信度 |
| --- | --- | --- |
| 推送回调验签 | header `X-Red-Signature`，值形如 `sha1=<40位hex>`，以对接页 token 为 secretKey 对原始 body 签名，验签可选 | [多源] |
| 验签具体算法 | HMAC-SHA1(token, rawBody)（联调代码）与 SHA1(token+rawBody) 拼接（另一实现）矛盾，倾向 HMAC | [联调代码]+[单源] |
| 推送应答要求 | HTTP 200 即视为推送成功 | [多源] |
| 推送重试 | 失败每 30s 重试一次最多 3 次；官方口径「正常推送 1 次，异常整体推送 3 次」 | [多源]+[官方] |
| 线索推送报文结构 | 信封 `{data, timestamp, source}` + SnakeCase 字段表，见 §1.4 | [联调代码] |
| 消息级推送信封（third_im 全量消息） | 不存在于公开网络 | 穷尽后判定 |
| 发送接口字段名 | `user_id` `from_user_id`（KOS 意向评论场景官方点名） | [官方] |
| 发送端点路径 | 不存在于公开网络；网关字典探测 90+ 路径全 404 | [官方实测] |
| 网关信封与错误码 | `{code,success,msg,data}`；错误码表见 §3 | [官方实测] |
| 加解密 | 未知，未见任何转述 | 穷尽后判定 |

## 1 接收侧（消息推送回调）

### 1.1 推送通道与配置入口

- [多源] 推送地址配置在聚光后台「工具-线索工具-私信API对接」，填写 POST 消息接收地址与 token
  - 来源：https://www.juxuan.net/22398.html https://help.fxiaoke.com/93d5/9188/9fad/2488 https://help.yunduoketang.com/s/crm/fab2/d478/63e3/9908
- [单源] 对接三步：填地址 → 发测试消息联调（response code 必须 200）→ API 实时推送
  - 来源：https://www.juxuan.net/22398.html
- [单源] 纷享销客侧约定：webhook 地址追加 `type=1` 表单 `type=2` 私信；私信连接对象编码固定为 `leads`；「私信与表单 token 一致」
  - 来源：https://help.fxiaoke.com/93d5/9188/9fad/2488
- [单源] token 为专业号下唯一，同一专业号表单与私信共用
  - 来源：https://www.heguang-ad.com/22395.html
- [官方] secretKey（即推送 token）加权开白后在对接群下发
  - 来源：xiaohongshu.md §13 引企微 FAQ 一.4

### 1.2 验签（本轮核心增量）

[多源] 三家代理商转述同一官方口径，逐字：

> ①解析POST 消息 header 中的X-Red-Signature 参数
> ②解析POST 消息的 request body（未经反序列化的原始body 数据）
> ③以私信api对接工具获取的 token 为 secretKey，和 body 数据生成签名，与 header 中的 signature 进行校验

来源：https://www.juxuan.net/22398.html（私信线索）https://www.heguang-ad.com/22395.html（表单，措辞同构：以落地页配置页面获取的token为secretKey）

- [多源] header 值格式形如 `sha1= 5bf9f4192d049dfe442edbcd533223673bb188e4`，40 位十六进制；验签为可选项（非必须）
- [联调代码] 算法实现 A（HMAC）：`Mac.getInstance("HmacSHA1")`，key=token，对原始 body 字节计算后 hex；header 取 `split("=")[1]` 去掉 `sha1=` 前缀
  - 仓库 https://github.com/Maskvvv/java-study `src/main/java/com/zhy/api/xiaohongshu/XiaoHongShuController.java`（2024-07-24，含 `/xiaohongshu/testSign` 联调端点，接收真实推送并解析报文）
- [单源] 算法实现 B（拼接）：`crypto.createHash('sha1')` 依次 update(token) update(rawBody) 后 hex
  - 仓库 https://github.com/fengqililin59-cpu/syqw `backend/src/services/publicWebhookAuth.service.js`（自称「小红书线索/私信推送：SHA1(token + rawBody) → hex，Header 形如 sha1=xxx」）
- 矛盾未决：「以 token 为 secretKey」的官方措辞与 HMAC 概念吻合，且实现 A 是接收真实报文的联调控制器；实现 B 未见联调证据。建议实现按 HMAC-SHA1 并在验签失败时回退拼接 SHA1 兼容，联调阶段实测裁决

### 1.3 推送行为事实

- [官方] 「正常情况下推送1次，如出现异常会整体推送3次」（企微 FAQ 二.4，转引 xiaohongshu.md §13）
- [多源] 失败时「每隔 30s 重试一次，最多重试 3 次」；response code 200 即认为推送成功
  - 来源：https://www.juxuan.net/22398.html https://www.heguang-ad.com/22395.html
- [单源] 去重机制：按用户 id+落地页 id 去重，同页面重复手机号仅推送一次（表单场景）
  - 来源：https://www.heguang-ad.com/22395.html

### 1.4 线索推送报文结构

[联调代码] java-study 控制器反序列化模型逐字段（SnakeCase 命名策略），信封：

```json
{
  "data": { "…LeadsInfo…" },
  "timestamp": 1721796000000,
  "source": "…"
}
```

LeadsInfo 字段表（字段名逐字取自代码）：

| 字段 | 类型 | 备注 |
| --- | --- | --- |
| landing_page_id | Long | 落地页 ID |
| url | String | 发送地址而非落地页地址（与 heguang Q&A 口径互证） |
| submitted_time | String | 格式 `yyyy-MM-dd HH:mm:ss`，时区 GMT+8 |
| source_channel | String | 渠道，可区分搜索广告与信息流广告 |
| account_id | String | 投放账号 ID |
| account_name | String | 投放账号名 |
| campaign_id | Long | 广告计划 ID |
| campaign_name | String | 广告计划名 |
| unit_id | Long | 广告单元 ID |
| unit_name | String | 广告单元名 |
| creative_id | Long | 广告创意 ID |
| leads_id | String | 线索 ID |
| keyword | String | 关键词 |
| data | Array | `{label: String, value: String}` 数组，线索标签键值对 |

来源：https://github.com/Maskvvv/java-study 同上路径

- [第三方转述] 私信线索推送语义字段与该结构吻合：时间/地区、小红书号/用户昵称、线索标签（如「留客资」）、电话号码/微信号、备注、标注客服、投放账号、是否留资、笔记链接、计划/单元/创意及其 ID
  - 来源：https://www.juxuan.net/22398.html
- [单源] 私信线索与表单线索可按线索类型区分；私信线索仅广告流量带计划/单元/创意归因，自然流量无
  - 来源：https://guide.weiling.cn/docs/xiao-hong-shu-ju-guang-biao-dan-si-xin-xian-suo-zhuan-fa-chang-jian-wen-ti

### 1.5 消息级推送信封（third_im 全量消息）

不存在于公开网络。已穷尽路径见 §5。已知边界：

- [官方] 消息样例存在于企微文档「小红书-三方客服消息样例」（`w3_AfgAWgafAFYdb8y7XM0TAa5IMmCnN`），登录墙内，匿名访问返回 retcode 30004 / oidbret 200062（check userInfo failed），POST 与 GET 形态均验证无匿名通道
- [联调代码] youyoufengchen/ai- `modules/platform_adapter.py` 的小红书适配器为示意代码（自注「简化验证」，`signature == api_key`），其 event_type/user_id/content 字段猜测不可采信，仅佐证 `X-Red-Signature` 头名在民间流传
- [推测] third_im scope 含 `three_im_leads_push`，意向线索推送与全量消息推送大概率共用同一回调通道与验签机制

### 1.6 握手与应答

- 零证据。公开材料中无 URL 验证（challenge）握手流程记载
- [多源] 唯一应答要求：推送接收方返回 HTTP 200；联调以 200 为通过条件

## 2 发送侧

### 2.1 官方逐字事实（企微 FAQ，转引 xiaohongshu.md §13）

- 字段名：「若为KOS意向评论，调用私信发送接口针对意向评论回复时，需要在user_id和from_user_id字段中均填入KOS UID，否则将无法发送成功」（二.18）——发送请求体含 `user_id` `from_user_id` 两字段，`user_id` 定位收件人
- 意向评论回复报错：「意向评论未查到，确认评论是否存在」（二.15）
- 发送权限报错：「当前账号无发送权限或次数已超限，请至小红书客户端处理」（二.16），影响名片/留资卡/交易卡/表单
- 频控：一天 20 个陌生人、未回复 24h 内 1 条、24h 后再 1 条、累计 3 条（一.7）；另一口径「用户没回复一天只能发20条」（三.2），两官方口径并存
- 消息类型：语音收发接口均无；不支持类型来件自动同步「暂不支持此消息类型，请到小红书 App 端查看」（二.1）；卡片「在文档中有露出的都支持收发」（二.5/一.5）

### 2.2 发送端点路径

不存在于公开网络。网关字典探测 90+ 候选路径全部 Go `404 page not found`，代表组：

- 动词系 `/api/open/im/message/send` `/msg` `/send_message` `/reply` `/batch/send` `/sendMessage` `/send/message` `/sendText` `/push/user` `/user/message/send` `/session/message/send` `/talk/send`
- 按类型 `/api/open/im/text/send` `/image/send` `/video/send` `/file/upload` `/card/send` `/note/send` `/order/send`
- 前缀变体 `/api/open/three_im/*` `/third_im/*` `/threeim/*` `/api/open/c/*` `/sixin/*` `/kos/*`
- 上传系 `/api/open/im/upload` `/material/upload` `/message/upload`
- 媒体外 `/api/open/im/message/list` `/session/list` `/conversation*` `/unread*` `/account*` `/binding*` `/kos/list`

唯一存活的 im 域端点见 §4。判定：发送端点命名不可枚举，或托管在未公开网关/路径组

### 2.3 发送协议推断

- [推测] 请求为 POST + JSON + Access-Token 头 + 网关信封（与已实测网关规约一致）
- [推测] 文本报文含消息类型字段与文本内容字段，字段名未知；`user_id` 定位收件人，`from_user_id` 为发送账号（KOS 意向评论场景两者均填 KOS UID）
- [官方] 端点与文档在加权开白后经对接群下发，公开网络获取无门

## 3 网关通用规约（官方实测）

全部为 [官方实测]，方法与证据链见 §5.1

- 鉴权：业务 API 走 `Access-Token` 请求头；缺失回 410018 `access_token不为空`，错误回 410019 `access_token错误`
- 信封：`{"code":0,"success":true,"msg":"成功","data":{...}}`；HTTP 状态恒 200，成败看 `code`
- 错误码：400001 表单非法（leads 域参数校验先于 token 校验）；700000 资源不存在（leads 路由组 JSON 兜底 `{"success":false,"code":700000,"msg":"资源不存在,请核实URL","data":{}}`）；-240000 leona 系统异常
- 404 判别法：未注册路径回 Go 原生 `404 page not found`（HTTP 404）；已注册路径回 JSON 信封错误（HTTP 200）——可用此区分端点存在性
- 路由组差异：`/api/open/leads/*` 有 JSON 兜底，`/api/open/im/*` 无兜底
- `/api/open/im/comment/list` 仅接受 POST，GET 回 404
- beta 网关 `adapi.beta.xiaohongshu.com` 全路径 504，判定内网
- 未见任何签名头要求；发送方向鉴权仅有 Access-Token 实测证据

## 4 本轮新发现端点

- [官方实测] `POST /api/open/im/material/list`——docs-center 未记载，存在且 token 前置校验（空 token 回 410018），疑似私信素材库接口
- [官方] `POST /api/open/im/comment/list`——FAQ 4439 载明，意向评论列表
- [官方实测] `POST /api/open/leads`——存在，逐字段校验梯子：空体回 400001 表单非法 → 缺 click_id 回「非法click_id」→ 有 click_id 缺 event_type 回表单非法 → event_type 字符串值全拒（枚举校验）；Access-Token 不影响报错顺序
- [官方实测] `POST /api/open/oauth2/refresh_token`——已实现于 DuDu 绑定骨架

## 5 已穷尽路径清单

### 5.1 网关字典探测

adapi.xiaohongshu.com 上 90+ 候选路径（§2.2 代表组 + 分组全量在会话记录），覆盖 send/msg/reply/push/upload/material/session/conversation/user/card/kos/three_im/third_im/camelCase/v1 等命名空间；除 §4 四个端点外全 404

### 5.2 官方渠道

- docs-center 全库 656 篇（本地缓存 global_articles.json）二次确认无收发字段级规格；third_im 相关仅 oauth2 两接口与 FAQ 4439
- ad.xiaohongshu.com 前端 chunk 逆向：OpenApiDoc（52dd7459）与 ThreeImManage（746bf6ae）均已下载分析；文档数据走 `/api/leona/content/center/article/list`，categoryId=761 仅 MAPI 入门一篇
- 企微文档墙：三份文档 ID（接口文档 w3_Aa4AnwYNAGYOfLNcOh4Sj6Xg1O35v、消息样例 w3_AfgAWgafAFYdb8y7XM0TAa5IMmCnN、入驻流程 w3_ACwAJQbSACQKkvCc2xCT3au2Fq2t2）；匿名 opendoc GET/POST/JSON 三形态均 retcode 30004；webReader 三次网络错误；文档 ID 全网无索引
- Wayback Machine 会话期不可用（Temporarily Offline）

### 5.3 第三方生态

- 代理商：juxuan.net 22398/22581 heguang-ad.com 22395/22584 ad-ka.cn h-nd-306——仅线索推送，验签与流程已提取，无消息级规格
- CRM/客服厂商：fxiaoke 卫瓴 云朵课堂（配置级） 网易七鱼 合力亿捷 5887 米多客 美洽 CSDN meiqia888（零代码） 来鼓 laigu.com（产品页） TP CX Cloud 知乎 p/1897590519900661246（HTTP 403 无法取文）
- GitHub：code search `X-Red-Signature` 命中 7 文件 3 仓库（java-study syqw ai-，已全部分级）；早前 gh 搜索 xiaohongshu adapi/third_im/three_im 等零命中；REST 配额会话内耗尽
- 其他仓库：Panniantong/Agent-Reach（笔记读取，非 IM） wenxtech/xiao_hong_shu_ad_go（聚光报表客户端，无 IM）
- 幻象排除：搜索摘要曾引用 `pgyplugin.xiaohongshu.com/domestic/first-open-guide/msg-push` `web-ok.xiaohongshu.com/domestic/docs/openApi/v2.doc` 等「三方IM官方推送文档」，精确搜索无任何索引、TLS 握手失败，判定为搜索摘要模型编造，[幻象] 不可引用

## 6 来源清单

- 官方：https://ad.xiaohongshu.com/openApiDoc?categoryId=761&articleId=3047 https://adapi.xiaohongshu.com（实测） doc.weixin.qq.com 三份文档（墙内）
- 线索推送：https://www.juxuan.net/22398.html https://www.heguang-ad.com/22395.html https://m.ad-ka.cn/h-nd-306
- CRM 对接：https://help.fxiaoke.com/93d5/9188/9fad/2488 https://guide.weiling.cn/docs/xiao-hong-shu-ju-guang-biao-dan-si-xin-xian-suo-zhuan-fa-chang-jian-wen-ti https://help.yunduoketang.com/s/crm/fab2/d478/63e3/9908
- 联调代码：https://github.com/Maskvvv/java-study https://github.com/fengqililin59-cpu/syqw https://github.com/youyoufengchen/ai-
- 厂商生态：https://www.7x24cc.com/help/innews/5887.html https://blog.csdn.net/meiqia888/article/details/142205302 https://zhuanlan.zhihu.com/p/1897590519900661246 https://laigu.com https://www.yun88.com/product/8220.html

## 7 对 DuDu 的实现启示

- 回调接收模块可先行落地：X-Red-Signature 验签（HMAC-SHA1 为主、拼接 SHA1 兜底、剥离 `sha1=` 前缀）、原始 body 保存、200 应答、`{data,timestamp,source}` 信封与 §1.4 字段表解析，均有多源或联调代码支撑
- token 沿用现有轮换体系，推送 secretKey 与 Access-Token 是否同值需联调确认（表单与私信 token 一致仅说明线索域内共用）
- 频控参数（20 陌生人/3 条累计/24h 规则）可作发送限流默认配置
- 发送侧仍无从实现：端点路径与请求体结构缺位，只能等加权开白后从对接群获取文档；绑定骨架继续保留占位
