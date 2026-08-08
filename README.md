# TC39 Atlas

TC39 Atlas 面向中文用户与 AI Agent，提供 TC39 提案索引、中文 README 译文、阶段变化和本地 MCP 查询。

GitHub Actions 负责抓取上游并生成静态 JSON。Web 发布到 GitHub Pages；MCP 已完成本地 stdio 功能和 npm 打包，但公开发布暂缓。项目不需要数据库、后端常驻服务或 Docker。

## 使用 MCP（暂未发布）

`@tc39-atlas/mcp` 尚未发布到 npm，下面是发布后的预定配置；当前开发者请使用后面的本地运行命令。后续发布工作见 [npm 自动发布计划](./docs/plans/npm-publishing/PRD.md)。

需要 Node.js 22.14 或更高版本。在支持本地 stdio MCP 的客户端中添加以下配置：

```json
{
  "mcpServers": {
    "tc39-atlas": {
      "command": "npx",
      "args": ["-y", "@tc39-atlas/mcp@latest"]
    }
  }
}
```

Windows 客户端如果无法解析 `npx`，请将命令改为 `npx.cmd`。

首次运行且没有缓存时，MCP 会等待数据集下载完成。以后每次启动都会先读取本地缓存，再在后台静默检查更新。网络失败不会影响已有缓存，下载内容通过字节数、SHA-256 和 schema 三重校验后才会替换旧数据。

可选环境变量：

- `TC39_ATLAS_MANIFEST_URL`：覆盖默认清单地址。
- `TC39_ATLAS_CACHE_DIR`：覆盖系统默认缓存目录。

MCP 提供 `search_proposals` 和 `get_proposals` 两个只读工具，以及按阶段、ECMAScript 版本和提案 ID 浏览的资源。

## 本地开发

项目需要 Node.js 22.14 或 24，以及 pnpm 11。

```powershell
pnpm install
pnpm sync
pnpm --filter web dev
```

`pnpm sync` 会抓取 TC39 Dataset 与各提案 README，并更新 `apps/web/docs/public/data/`。启动 Web 时，Rspress 会根据这份数据生成中英文提案文档。现有标题使用仓库内的人工中文种子；种子未覆盖的新标题和 README 由 OpenAI SDK 翻译。未设置 `TRANSLATION_API_KEY` 时只跳过待翻译内容，不影响英文数据。配置项见 [.env.example](./.env.example)。

本地运行 MCP：

```powershell
pnpm --filter @tc39-atlas/mcp build
pnpm --filter @tc39-atlas/mcp start
```

如需让 MCP 读取 Rspress 开发服务器提供的本地数据，可设置：

```powershell
$env:TC39_ATLAS_MANIFEST_URL='http://127.0.0.1:3000/data/manifest.json'
pnpm dev:mcp
```

## 数据发布与 GitHub Pages

[Pages 工作流](./.github/workflows/pages.yml)在以下场景运行：

- 每天定时同步一次；
- 手动触发；
- `main` 分支中的 Web、core 或工作流发生变化。

工作流先读取现有 Pages 数据集，复用原文哈希和翻译策略均未变化的标题与 README 译文。随后抓取上游、记录最近 35 天的变化、生成 `dataset.json` 与 `manifest.json`，最后由 Rspress 生成提案文档、全文搜索索引和 Pages 静态站点。任一步骤失败时不会覆盖当前 Pages 版本。

仓库需要完成以下设置：

1. Pages 来源使用 GitHub Actions。
2. 如需自动翻译新增内容，将密钥保存为 Actions Secret `TRANSLATION_API_KEY`。
3. 按需设置变量 `TRANSLATION_BASE_URL` 与 `TRANSLATION_MODEL`。

`manifest.json` 包含格式版本、内容版本、生成时间、文件字节数和 SHA-256。Web 与 MCP 均消费同一份已发布数据。

## npm 发布

公开包名预留为 `@tc39-atlas/mcp`。包入口、构建、测试、`npm pack` 校验和 OIDC 发布步骤已经完成，但 [npm 发布工作流](./.github/workflows/release.yml)当前被显式禁用，不会执行 `npm publish`。首次发布与 Trusted Publisher 配置留待 [npm 自动发布计划](./docs/plans/npm-publishing/PRD.md)完成。

## 质量检查

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
