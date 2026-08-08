# npm 自动发布

- 基线：[当前产品 PRD](../../PRD.md)
- 依赖：MCP 包代码、测试和打包配置已经完成

## 背景与目标

`@tc39-atlas/mcp` 暂不发布到 npm。保留已经实现的包入口、构建、测试和 OIDC 工作流模板，待首次人工发布及 npm Trusted Publisher 配置完成后再启用自动发布。

## 新增、变更与移除

- 当前禁用 GitHub Release 触发的 `npm publish`，防止误发布。
- 首次人工发布后，在 npm 配置绑定本仓库的 `release.yml` Trusted Publisher。
- 移除工作流禁用条件，恢复 GitHub Release 触发和 OIDC 发布。

## 范围与非目标

- 不修改已经完成的 MCP 运行、缓存、查询和 npm 包构建功能。
- 当前不执行 `npm publish`，不创建 npm token，也不修改 npm 网站设置。

## 验收标准

- `@tc39-atlas/mcp` 首次版本存在于 npm registry。
- Trusted Publisher 与仓库、`release.yml` 和 `npm` environment 完全匹配。
- 发布工作流通过类型检查、测试、构建和 `npm pack --dry-run` 后使用 OIDC 发布。
- GitHub Release 标签与 `package.json` 版本不一致时拒绝发布。

## 对后续计划的影响

无。
