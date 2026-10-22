# MockPulse 功能图谱

范围：仓库根 `mock-pulse/`（Tauri 2 + React 19 前端 + Rust `src-tauri/`）。维护说明见 [mock-pulse/README.md](../../mock-pulse/README.md)

渠道接入范围与事件模板全量锚定[渠道事实库](../research/channels/README.md)；高保真复刻各渠道载荷、验签与加密（[ADR-0001](../adr/0001-high-fidelity-mock.md)），19 个 HTTP 回调渠道（[ADR-0008](../adr/0008-channel-catalog-anchored-to-fact-base.md)）

| 功能 | 入口与流程 | 状态及边界 |
| --- | --- | --- |
| 渠道连接 | 连接页：按渠道配置凭据并握手测试，适配器原语经 Rust `connections/` 注册表路由 | 同一时刻仅一条运行互斥（RunSession）；渠道差异全部住在各渠道适配器内 |
| 事件素材 | 素材库：内置模板只读浏览（[ADR-0009](../adr/0009-template-direct-send.md)），另存为素材或新建，版本化保存 | 剧本步骤引用素材的不可变版本；模板不入用户库 |
| 模板直发 | 素材库点模板即改即发，发往该渠道当前连接 | 不落事件素材；多连接用最近一条可切换（[ADR-0009](../adr/0009-template-direct-send.md)） |
| 剧本 | 剧本编辑：按渠道目录分组（[ADR-0004](../adr/0004-script-per-platform.md)），步骤存 `{eventId, revision}` 引用 | 步骤只读引用模板或素材；引用解析缺失分类单点在 events 域 reference |
| 编排运行 | 编排编辑：多剧本 lane 串行／并行编织，失败策略（LanePolicy）决策表单点在 Rust `runs/policy` | 运行检查点（RunCheckpoint）启动即落盘，进程中断后可追溯不自动续发 |
| 运行与进度 | 触发直发／剧本／编排：启动结果（LaunchOutcome）四态收敛，run-progress 事件投影运行实况（LiveRun） | 全局互斥三入口统一；停止、跳过与失败回执按 lane 归位 |
| 线上编解码 | 素材编辑器内按 wire 形态（json/form/xml）装载与解析 | 确定性字节编解码单点在 events 域 codec，Rust 侧同语义对拍 |

Rust 承担验签、加密与外发请求，前端只做编辑、触发与展示（[ADR-0005](../adr/0005-monorepo-tauri-boundary.md)）；剧本 JSON 顶层仅 `{id, name, steps}`，渠道归属由目录路径表达
