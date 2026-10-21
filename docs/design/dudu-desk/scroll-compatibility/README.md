# DUDU Desk 消息滚动验证记录

日期：2026-10-09。本文与同目录脚本、采样为本次诊断的历史资料，不是当前业务契约。下列命令从仓库根目录执行。文中所述 `VITE_DESK_MOCK` 运行时与 Mock 适配器已于 2026-10-13 移除，相关步骤不可复现

## 已确认的现象

- 用户使用鼠标滚轮，在开发版消息列表滚动到底部时观察到反弹、闪烁和滚动条长度变化
- IDEA 执行 `E:\Nvm\nodejs\yarn.cmd run tauri:dev` 和直接启动开发 exe 都能出现问题，不能归因于 IDEA 本身
- 带远程调试端口的窗口曾表现正常，但没有单独验证调试端口的因果关系
- 开启同一 Mock 适配器后，用户自行打包并启动 Release EXE，确认“不抖动”。这是用户对本次打包版本的实测反馈，不代表已定位开发版根因或覆盖所有场景

消息列表继续使用用户提供的 Virtuoso 写法。关闭消息区浏览器滚动锚定、改变 ResizeObserver 帧调度的两次试验都未解决用户复现，已撤回。消息列表和滚动 CSS 没有保留本次试验改动

## 证据与判断边界

`baseline.ndjson.gz` 保存开发窗口的滚轮、滚动几何和可见项目位置，不包含消息正文。基线检查有 1374 次有效比较，31 次向下滚轮期间的可见消息反向位移，其中 12 次前一帧处于底部；样例包含 430px 位移、总滚动高度从 2194 变为 2624。项目自身高度不变时，虚拟列表总高度仍可能变化

开发版与 Release 均使用 Tauri/WebView2。现有证据更指向开发与生产运行差异，尚不能认定是 WebView2 的普遍兼容性问题。代码检查可见的差异包括 React 开发检查（入口保留 StrictMode）、Vite 热更新，以及 Redux Toolkit 默认开发检查；Tauri 宿主也有 debug/release 差异。它们都是待验证因素，尚无证据指定其中一个为根因，也未为此关闭检查或改变列表参数

## 基线检查与可选采样

```powershell
node docs/design/dudu-desk/scroll-compatibility/check-scroll.cjs
```

默认重放保存的失败基线，预期输出 `FAIL` 并退出 1。它检查相邻采样帧中同一可见、等高项目是否逆滚轮方向移动；这是复核历史症状的工具，不会驱动当前应用，也不能凭此证明当前版本已经修复

如需在开发窗口重新采样

1. 运行 `node docs/design/dudu-desk/scroll-compatibility/collect-scroll.cjs`，监听本机 `127.0.0.1:9435`
2. 临时在子项目 `dudu-desk/index.html` 加入 `<script src="http://127.0.0.1:9435/probe.js"></script>`，刷新开发窗口。采样器匹配消息区的 Virtuoso 容器
3. 用鼠标滚轮上下滚动、到底后停手数秒。同目录生成 `scroll.ndjson`
4. 执行 `node docs/design/dudu-desk/scroll-compatibility/check-scroll.cjs docs/design/dudu-desk/scroll-compatibility/scroll.ndjson`
5. 移除临时 script 标签、刷新窗口并停止采集进程。本次诊断结束时应用入口已移除采样器

采样器会读取布局并包装容器的滚动方法，可能影响时序；不能以带采样器或调试端口的窗口替代普通窗口最终验证

## 本次保留的变更

账号与会话 runtime 仅根据 `VITE_DESK_MOCK === "true"` 加载现有 Mock，允许开发与打包测试使用相同的模拟坐席和消息。配置与打包方式见 [DUDU Desk README](../../../../dudu-desk/README.md)。没有新增依赖

验证：282 项前端测试通过，lint、类型检查通过；关闭 Mock 的生产构建通过；正常 Tauri 配置的 Release 构建通过。用户自行打包的 EXE 已确认不抖动，开发版反弹根因仍未定位
