# DuduAdmin 前端实施票索引

状态：2026-09-30 用户确认拆分后，9 张实施票已发布。父规格为 [DuduAdmin 首版前端与数据契约 Spec](https://github.com/Buktal/dudu/issues/68)；每票的完整交付内容与验收条件以 GitHub Issue 为准，本文仅维护索引与交接说明。

## 实施范围与顺序

沿用已确认顺序：功能规则与数据契约 → 正式前端 → 后端实现与真实联调。每张前端票包含界面交互、HTTP 请求与结果反馈、相应测试；运行时不使用模拟数据或假登录。

共同前置复用 [Admin 表结构与接口字段如何统一？](https://github.com/Buktal/dudu/issues/67) 及其已有业务决策依赖。首张登录与环境票直接依赖它，其余票通过首票传递依赖。发布与 ready-for-agent 标签不表示前置决策已经完成；开工时以 GitHub 原生阻塞状态为准。

## 已发布票

| 顺序 | 实施票 | 直接前置 | 交付结果 |
| --- | --- | --- | --- |
| 1 | [DuduAdmin：登录、环境选择与管理入口](https://github.com/Buktal/dudu/issues/69) | [Admin 表结构与接口字段如何统一？](https://github.com/Buktal/dudu/issues/67) | 平台管理员选择目标服务，通过真实认证请求进入后台，并能退出；后续企业及运营功能复用同一个身份、环境与请求处理边界。 |
| 2 | [DuduAdmin：查找企业并查看详情](https://github.com/Buktal/dudu/issues/70) | [DuduAdmin：登录、环境选择与管理入口](https://github.com/Buktal/dudu/issues/69) | 平台管理员从企业列表查找目标并进入详情，看到真实接口返回的企业资料与管理员非敏感信息，并能区分空数据与查询失败。 |
| 3 | [DuduAdmin：选择六位企业 ID 并开通企业](https://github.com/Buktal/dudu/issues/71) | [DuduAdmin：查找企业并查看详情](https://github.com/Buktal/dudu/issues/70) | 平台管理员随机生成或手输检测六位企业 ID，填写基础资料与初始管理员凭据，提交一个完整的企业开通请求，并能查看成功结果或保留资料继续纠错。 |
| 4 | [DuduAdmin：编辑企业基础资料](https://github.com/Buktal/dudu/issues/72) | [DuduAdmin：查找企业并查看详情](https://github.com/Buktal/dudu/issues/70) | 平台管理员编辑选定企业的基础资料，保存后列表和详情显示一致的新值，取消或失败时保持正确状态。 |
| 5 | [DuduAdmin：停用与恢复企业](https://github.com/Buktal/dudu/issues/73) | [DuduAdmin：查找企业并查看详情](https://github.com/Buktal/dudu/issues/70) | 平台管理员对明确的企业执行停用或恢复，在操作前看到已确认的影响，操作后看到与接口一致的状态。 |
| 6 | [DuduAdmin：重置企业管理员密码](https://github.com/Buktal/dudu/issues/74) | [DuduAdmin：查找企业并查看详情](https://github.com/Buktal/dudu/issues/70) | 平台管理员确认目标企业和稳定定位的管理员后重置其密码，并按约定处理凭据交付、成功与失败。 |
| 7 | [DuduAdmin：查看运营概览与企业资源汇总](https://github.com/Buktal/dudu/issues/75) | [DuduAdmin：查找企业并查看详情](https://github.com/Buktal/dudu/issues/70) | 平台管理员查看企业运营概况，并从企业详情了解员工、接待组及渠道接入账号的数量与状态汇总。 |
| 8 | [DuduAdmin：查询平台操作记录](https://github.com/Buktal/dudu/issues/76) | [DuduAdmin：登录、环境选择与管理入口](https://github.com/Buktal/dudu/issues/69) | 平台管理员通过已确定的查询条件回查企业开通与维护记录，了解操作时间、目标和结果。 |
| 9 | [DuduAdmin：查看个人账号并修改密码](https://github.com/Buktal/dudu/issues/77) | [DuduAdmin：登录、环境选择与管理入口](https://github.com/Buktal/dudu/issues/69) | 平台管理员查看当前账号，按规则修改自己的密码，并按接口结果继续会话或重新登录。 |

## 执行与验收边界

- 查找企业与详情完成后，企业开通、编辑、停用恢复、管理员重置、概览与资源汇总可并行；操作记录查询和个人账号只依赖登录入口。
- 本轮对应 52 条前端相关用户故事；故事 49、50 的企业侧三项登录与跨企业同名登录保留给后续 Server 和 Desk 真实认证接入。故事 34、51 的数据库原子性与真实权限隔离部分也在后端阶段验收。
- 前端成功分支通过隔离测试中的受控 HTTP 结果验证，正式运行连接真实服务。服务未就绪时如实报错；测试设施不能成为运行时 mock、登录绕过或演示版。
- 各票完成自身交互、请求契约、lint、类型检查、相关测试、构建与实际界面验证。数据库迁移、并发唯一性、事务回滚和真实成功联调遵循父 Spec 的后端阶段要求。
- 视觉与导航在前端设计实施中确定，不把未生成的图片或提示词当作已批准方案；新增依赖继续执行仓库审批要求。
- 9 张票均使用 GitHub 原生子 Issue 和阻塞关系，并带 ready-for-agent 标签。父 Spec 的正文、状态和标签保持原样，实施票不依赖父 Spec 关闭。

## 发布核对

已逐票核对标题、正文与批准稿一致（仅将前置草案编号替换为真实链接），原生子票与阻塞关系、标签正确；父 Spec 正文、状态和标签未改变。发布实施票不代表业务实现或接口验收完成。

