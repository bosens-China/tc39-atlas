# TC39 Atlas

TC39 Atlas 面向中文用户与 AI Agent，提供 TC39 提案索引、中文 README 译文、中英文快速审查、阶段变化和本地 MCP 查询。

GitHub Actions 负责抓取上游并生成静态 JSON。Web 发布到 GitHub Pages；MCP 已完成本地 stdio 功能和 npm 打包，但公开发布暂缓。项目不需要数据库、后端常驻服务或 Docker。

## 使用 Skills

从当前仓库发现并安装 Agent Skills：

```powershell
npx skills add https://github.com/bosens-China/tc39-atlas
```

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

npm 包内置构建时的数据快照，因此首次运行即使没有缓存或网络也能立即查询。以后每次启动都会先读取本地缓存，再在后台静默检查更新。网络失败不会影响已有数据，下载内容通过字节数、SHA-256 和 schema 三重校验后才会替换旧数据。

可选环境变量：

- `TC39_ATLAS_MANIFEST_URL`：覆盖默认清单地址。
- `TC39_ATLAS_CACHE_DIR`：覆盖系统默认缓存目录。

MCP 提供 `search_proposals` 和 `get_proposals` 两个只读工具，以及按阶段、ECMAScript 版本和提案 ID 浏览的资源。提案详情同时返回英文原文、中文译文和中英文快速审查。

## 本地开发

项目需要 Node.js 22.14 或 24，以及 pnpm 11。

```powershell
pnpm install
pnpm sync
pnpm dev:web
```

`pnpm sync` 会自动读取仓库根目录中被 Git 忽略的 `.env`，抓取 TC39 Dataset 与各提案 README，并更新 `apps/web/docs/public/data/`。启动 Web 时，Rspress 会根据这份数据生成中英文提案文档。每篇提案默认通过 DeepSeek `deepseek-v4-flash` 的一次结构化请求生成中文标题、完整 README 译文和中英文快速审查，并以 10 篇为默认并发数。单次 AI 请求超时为 120 秒，暂时性错误最多重试 2 次。标题与 README 的联合源哈希、翻译策略以及由模型、端点、提示词、输出 Schema 和关键请求参数生成的翻译器指纹均未变化时，直接复用整篇结果。未设置 `DEEPSEEK_API_KEY` 时只跳过待翻译内容，不影响英文数据；存在单篇翻译失败时不会覆盖上一份数据集。兼容配置见 [.env.example](./.env.example)。

工作区职责保持三层：私有包 `@tc39-atlas/core` 负责共享模型、查询、抓取、翻译和数据生成；私有应用 `@tc39-atlas/web` 负责 Rspress 静态站；可发布包 `@tc39-atlas/mcp` 提供本地 CLI 与 MCP 服务。

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

工作流先读取现有 Pages 数据集，复用联合源哈希、翻译策略和翻译器指纹均未变化的文章级结构化结果。随后抓取上游、记录最近 366 天的变化、生成 `dataset.json` 与 `manifest.json`，最后由 Rspress 生成包含双语快速审查的提案文档、全文搜索索引和 Pages 静态站点。首次成功同步只建立提案快照基线，不会把同步前的全部存量提案记为新增；后续同步以上一份快照为锚点记录变化。任一步骤或单篇翻译失败时不会覆盖当前 Pages 版本。

仓库需要完成以下设置：

1. Pages 来源使用 GitHub Actions。
2. 如需自动翻译新增内容，将密钥保存为 Actions Secret `DEEPSEEK_API_KEY`。

`manifest.json` 包含格式版本、内容版本、生成时间、文件字节数和 SHA-256。Web 与 MCP 均消费同一份已发布数据。

## npm 发布

公开包名预留为 `@tc39-atlas/mcp`。包入口、构建、测试、`npm pack` 校验和 OIDC 发布步骤已经完成，但 [npm 发布工作流](./.github/workflows/release.yml)当前被显式禁用，不会执行 `npm publish`。首次发布与 Trusted Publisher 配置留待 [npm 自动发布计划](./docs/plans/npm-publishing/PRD.md)完成。

## 质量检查

```powershell
pnpm check
pnpm build
```

Pull Request 工作流执行相同的质量检查和全量构建；Pages 工作流会先通过质量门禁，再同步数据和构建站点。
