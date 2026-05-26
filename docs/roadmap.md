# 功能梳理和后续规划

`ss-mcp-chrome` 当前分为五层能力：

1. Chrome 接管：标签页、跳转、读取页面、截图、点击、填写、执行可信脚本。
2. 页面辅助：截图保存为本地文件、页面元素选择器、连接诊断。
3. 用户脚本：安装、编辑、启停、匹配高亮、手动运行、页面加载后自动运行。
4. MCP 接入：stdio MCP 和 Streamable HTTP MCP。
5. 本机启动：Native Messaging Host 注册和扩展侧边栏一键启动。

## 已完成

- 右侧 Side Panel 管理界面
- 扩展设置页
- 单按钮连接和断开
- 红黄绿状态灯
- 连接诊断面板
- Native Messaging 一键启动基础链路
- 截图保存为本地 PNG 文件
- 页面元素选择器
- GitHub 项目链接
- 用户脚本列表、新建、编辑、删除、启停、运行
- 当前页面命中脚本高亮
- 基础 UserScript 元信息解析
- 基础 GM API
- Codex、OpenClaw、Hermes 接入说明

## 建议补充

- 脚本导入/导出：支持 `.user.js` 文件导入和导出备份。
- 脚本日志面板：把 `GM_log` 和运行错误展示到侧边栏里。
- 脚本运行记录：记录最近运行时间、运行页面、成功/失败状态。
- 匹配规则预览：编辑脚本时实时显示当前页面是否命中。
- 脚本排序和搜索：脚本多了以后需要快速查找。
- 权限提示：根据 `@grant`、`@match` 显示脚本风险。
- 用户脚本兼容层：逐步补 `GM_openInTab`、`GM_registerMenuCommand`、`GM_notification` 等常用 API。
- 网络请求抓包：记录 fetch/XHR 请求，支持导出 HAR 或简化 JSON。
- 流程录制和回放：录制点击、输入、跳转，并生成可复用脚本。
- 任务日志：记录 MCP 工具调用、参数摘要、结果和耗时。
- 危险操作确认：对 `browser_eval`、`github_delete_repository` 等工具增加可配置确认。
- 打包发布：增加 GitHub Actions，自动打包扩展 zip 和 npm 包。

## 暂不建议

- 远程开放 WebSocket：当前设计只适合本机 `127.0.0.1`，远程开放风险高。
- 默认启用第三方脚本仓库：用户脚本能读写页面，先做手动导入更稳。
- 在任意页面默认执行 `browser_eval`：该能力应保持显式调用。
