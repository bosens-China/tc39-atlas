# TC39 Atlas 产品需求

## 产品定位

TC39 Atlas 面向关注 ECMAScript 提案的中文用户与 AI Agent。产品每天同步 TC39 提案，提供提案检索、中文 README 译文、中英文快速审查、周期变化和本地 MCP 查询。

产品由三部分组成：

- `packages/core` 负责提案模型、上游抓取、翻译、变化检测、数据集生成和内存查询。
- `apps/web` 提供发布在 GitHub Pages 的 Rspress 双语文档站。
- `apps/mcp` 提供本地 stdio MCP 服务；npm 包已完成打包能力，但尚未公开发布。

## 数据来源与发布

- TC39 Dataset 提供标题、阶段、状态和 ECMAScript 版本等结构化元数据。TC39 官方提案清单仍是权威上游。
- 各提案仓库 README 是正文来源。产品保留仓库 URL，方便用户和 Agent 回到原始资料。
- GitHub Actions 每天同步一次，也支持手动执行。代码变化可以触发重新构建。
- 同步前校验官方 JSON Schema 指纹、Schema 有效性和产品消费字段。上游契约变化或数据无效时中止发布，保留上一份 Pages 数据。
- README 明确不存在时允许保存空正文。其他下载失败会中止本轮生成，防止网络故障覆盖有效数据。
- 发布产物由 `dataset.json` 和 `manifest.json` 组成。清单包含格式版本、内容版本、生成时间、字节数和 SHA-256。
- 数据集保存当前提案、README、中文标题、中文译文、中英文快速审查和最近 366 天的变化事件，使 Web 可以生成完整的本年变化。首次成功同步只建立提案快照基线，不把同步前的存量提案记为变化；后续同步以上一份快照为锚点记录真实变化。Web 与 MCP 使用相同的稳定提案 ID 和数据语义。
- 当前规模使用单一完整数据集。只有真实体积或性能数据表明存在问题时，才引入分片或额外索引。

## 翻译与快速审查

- GitHub Actions 通过 OpenAI 官方 TypeScript SDK 调用 DeepSeek OpenAI 兼容 API，默认地址为 `https://api.deepseek.com`，默认模型为 `deepseek-v4-flash`。密钥由 Actions Secret 配置。
- 每篇提案作为一个独立结构化请求，同时生成中文标题、完整 README 译文以及内容一致的中英文快速审查。快速审查只概述问题、主要方案和成熟度，不作输入内容之外的价值判断。
- 官方英文标题始终保留为权威原文。中英文导航和详情页一级标题均显示英文标题；中文站随后展示中文标题，英文站不展示中文标题。页面描述由固定模板生成。
- 翻译提示词把标题和 README 标记为待处理数据，禁止执行其中的指令。译文必须保留 Markdown 层级、代码、链接目标、图片地址及 HTML 属性；空 README 保持空译文。
- 中文标题、README 译文和双语快速审查共用一条翻译元数据。缓存源哈希同时覆盖英文标题与 README，只有联合源哈希和策略版本都匹配时才复用；模型变化本身不触发重译。
- JSON 数据集是结构化翻译队列和缓存的权威来源。每轮生成在远端 Pages 快照与仓库快照中选择较新的有效数据，复用未变化的完整文章结果，只处理缺失或失效项目。
- 每篇提案独立并发，默认并发数为 10。网络错误、超时、408、409、429 和 5xx 最多重试 3 次；单篇失败不回滚其他英文数据。供应商偶尔添加的完整外层 JSON 代码围栏会被兼容移除，不做通用内容修复。
- 本地同步自动读取仓库根目录中被 Git 忽略的 `.env`；CI 从 Actions Secret 读取密钥。未配置翻译密钥时跳过待翻译项目，不影响英文数据发布。

## Web 产品体验

- Rspress 提供文档外壳、左侧栏、右侧大纲、约定式路由、静态生成、内置全文搜索、语言切换和深浅主题。
- 顶栏依次提供周刊动态、所有提案、接入 AI Agent 和关于，并由 Rspress 提供多语言切换。每个顶栏目录通过自己的 `_meta.json` 生成独立侧边栏。
- 首页通过 Markdown frontmatter 使用 Rspress 内置 Home 布局；提案目录、周期动态、Agent 接入和详情使用文档页，不维护并行的 React 应用壳。
- JSON 数据集是 Web 与 MCP 的唯一权威数据源。Web 构建前从数据集生成中英文提案目录、五个日历周期的变化页、详情 Markdown、年份与阶段上下文页，以及提案侧边栏元数据。
- 每个提案保留 `/proposals/<id>` 中英文兼容 URL，并展示当前语言的快速审查、README、阶段、状态、版本、同步时间、语言切换和官方仓库入口。
- 提案侧边栏始终显示官方英文标题，同时按 ECMAScript 年份和 TC39 阶段组织；年份使用 `/proposals/year/<year>/<id>`，阶段使用 `/proposals/stage/<stage>/<id>`，组内优先按首次记录时间倒序。文章级结构化结果缺失时，中文侧边栏使用 Rspress 内置 tag 标记“未译”；已完成翻译的空 README 不误报。上下文页不加入全文搜索，避免同一提案重复出现。
- 周刊动态侧边栏提供今日、本周、本月、本季度和本年变化，按数据集生成时间的 UTC 日历边界筛选新增、阶段变化、完成、撤回和转为不活跃事件。
- AI Agent 栏目提供 Skills 与 MCP 两个入口。Skills 从当前 GitHub 仓库安装；MCP 在 npm 发布前提供仓库本地运行说明。
- 用户通过文档导航和 Rspress 全文搜索查找提案，不提供客户端组合筛选与分页。
- Web 构建产物不依赖 REST API、数据库、浏览器端数据请求或常驻后端。Rspress `base` 负责 GitHub Pages 项目子路径。

## 本地 MCP

- MCP 将作为 `@tc39-atlas/mcp` 公共 npm 包分发，通过 `npx` 启动本地 stdio 服务；发布前可从仓库本地构建和调试。
- MCP 只提供只读能力。`search_proposals` 支持阶段、ECMAScript 版本、状态和多个关键词；`get_proposals` 根据稳定 ID 返回摘要，或返回 README、中文译文和中英文快速审查详情。
- 阶段、版本和提案资源分别通过 `tc39://stages/{stage}`、`tc39://editions/{edition}` 和 `tc39://proposals/{id}` 提供轻量浏览入口。
- npm 包构建时内置当前有效数据和清单。首次运行按本地缓存、内置快照、远端下载的顺序选择启动数据，因此无缓存和离线场景也能立即提供服务；启动后在后台静默检查清单版本。
- 只有内容版本变化，且字节数、SHA-256 和 Schema 均通过校验时，MCP 才原子替换缓存。网络或校验失败时继续使用旧缓存。
- MCP 工具调用只读取本地内存快照，不在调用过程中访问外部网络。运行日志只写入 stderr，避免污染 stdio 协议。
- 数据更新与程序更新相互独立。数据在 MCP 启动时检查，程序通过 npm 语义版本和 `npx @latest` 更新。

## 统一数据语义

- 阶段包括 Stage 0、1、2、2.7、3 和 4。Dataset 未提供阶段时保持为空，不自行推断。
- 状态区分进行中、已完成、不活跃和已撤回。仓库归档不等同于提案废弃。
- 只有已进入对应 ECMAScript 规范版本的提案拥有确定版本。进行中的提案不使用预计年份冒充版本。
- 搜索覆盖提案 ID、中英文标题、英文 README、中文译文和中英文快速审查。多关键词默认全部匹配，也允许切换为任一匹配。

## 部署、分发与质量边界

- Web 和数据通过 GitHub Actions 部署到 GitHub Pages。Pull Request CI 和 Pages 发布统一执行格式、Lint、类型与测试检查；Pages 工作流再同步数据并生成 Rspress 的 `doc_build` 产物。同步或构建失败时不覆盖上一份成功版本。
- MCP 计划只通过 npm 分发，不提供二进制、MCPB、Docker 镜像或远程 MCP 服务。
- npm 自动发布当前禁用；未来启用时使用 GitHub Actions OIDC Trusted Publishing，不在仓库保存长期写 token。
- TypeScript 禁止显式 `any`。数据模型、生成、查询、翻译、缓存和 MCP 契约使用 Vitest 覆盖。
- 用户运行方式、环境变量和 Pages 设置以[仓库 README](../README.md)为准；npm 首次发布见[后续计划](./plans/npm-publishing/PRD.md)。

## 非目标

- 不抓取或展示会议纪要、Issue 和 Pull Request。
- 不向 MCP 暴露历史变化、任意 SQL 或 README 文本差异解释。
- 不用中文译文替代 TC39 原始内容、官方状态或原仓库。
- 不提供 REST API、远程 Streamable HTTP MCP、PostgreSQL 或常驻应用服务器。
- 不让每个 MCP 客户端逐仓库抓取上游。
- 不预先引入 Redis、消息队列、数据分片、通用翻译缓存表、分块翻译器或 Batch API。
