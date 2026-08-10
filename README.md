# TC39 Atlas

TC39 Atlas 面向中文用户与 AI Agent，提供 TC39 提案索引、中文 README 译文、中英文快速审查、阶段变化、机器可读文档和兼容性感知的 ECMAScript 现代化 Skill。

GitHub Actions 负责抓取上游并生成静态 JSON。Web 与机器可读 Markdown 发布到 GitHub Pages。项目不需要数据库、后端常驻服务或 Docker。

## 使用 Skill

仓库对外提供一个 `modernize-ecmascript` Skill，可以通过以下命令发现并安装：

```powershell
npx skills add https://github.com/bosens-China/tc39-atlas --skill modernize-ecmascript
```

Skill 会自动识别单仓库或 monorepo 中的 TypeScript、构建工具、Node、浏览器和部署基线，结合 TC39 Stage 与 ECMAScript 版本选择当前项目安全可用的最新稳定能力。不确定目标或需要提高兼容基线时会先询问，并在修改前后汇报采用范围与验证结果。

文档站同时发布中文根 [`llms.txt`](https://bosens-china.github.io/tc39-atlas/llms.txt) 和英文 [`en/llms.txt`](https://bosens-china.github.io/tc39-atlas/en/llms.txt)，供 Agent 按需发现并读取提案 Markdown。

## 本地开发

项目需要 Node.js 22.14 或 24，以及 pnpm 11。

```powershell
pnpm install
pnpm sync
pnpm dev:web
```

`pnpm sync` 会自动读取仓库根目录中被 Git 忽略的 `.env`，抓取 TC39 Dataset 与各提案 README，并更新 `apps/web/docs/public/data/`。启动 Web 时，Rspress 会根据这份数据生成中英文提案文档。每篇提案默认通过 DeepSeek `deepseek-v4-flash` 的一次结构化请求生成中文标题、完整 README 译文和中英文快速审查，并以 10 篇为默认并发数。单次 AI 请求超时为 120 秒，暂时性错误最多重试 2 次。标题与 README 的联合源哈希、翻译策略以及由模型、端点、提示词、输出 Schema 和关键请求参数生成的翻译器指纹均未变化时，直接复用整篇结果。未设置 `DEEPSEEK_API_KEY` 时只跳过待翻译内容，不影响英文数据；存在单篇翻译失败时不会覆盖上一份数据集。兼容配置见 [.env.example](./.env.example)。

工作区职责保持两层：私有包 `@tc39-atlas/core` 负责共享模型、查询、抓取、翻译和数据生成；私有应用 `@tc39-atlas/web` 负责 Rspress 静态站与机器可读 Markdown。

## 数据发布与 GitHub Pages

[Pages 工作流](./.github/workflows/pages.yml)在以下场景运行：

- 每天定时同步一次；
- 手动触发；
- `main` 分支中的 Web、core 或工作流发生变化。

工作流先读取现有 Pages 数据集，复用联合源哈希、翻译策略和翻译器指纹均未变化的文章级结构化结果。随后抓取上游、记录最近 366 天的变化、生成 `dataset.json` 与 `manifest.json`，最后由 Rspress 生成包含双语快速审查的提案文档、全文搜索索引和 Pages 静态站点。首次成功同步只建立提案快照基线，不会把同步前的全部存量提案记为新增；后续同步以上一份快照为锚点记录变化。任一步骤或单篇翻译失败时不会覆盖当前 Pages 版本。

仓库需要完成以下设置：

1. Pages 来源使用 GitHub Actions。
2. 如需自动翻译新增内容，将密钥保存为 Actions Secret `DEEPSEEK_API_KEY`。

`manifest.json` 包含格式版本、内容版本、生成时间、文件字节数和 SHA-256，供同步与发布流程校验数据完整性。

## 质量检查

```powershell
pnpm check
pnpm build
```

Pull Request 工作流执行相同的质量检查和全量构建；Pages 工作流会先通过质量门禁，再同步数据和构建站点。
