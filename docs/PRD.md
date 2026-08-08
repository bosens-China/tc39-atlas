# TC39 Atlas 产品需求

## 产品定位

TC39 Atlas 面向关注 ECMAScript 提案的中文用户与 AI Agent。产品每天同步 TC39 提案，提供提案检索、中文 README 译文、周期变化和本地 MCP 查询。

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
- 数据集保存当前提案、README、中文译文和最近 35 天的变化事件。Web 与 MCP 使用相同的稳定提案 ID 和数据语义。
- 当前规模使用单一完整数据集。只有真实体积或性能数据表明存在问题时，才引入分片或额外索引。

## 中文翻译

- GitHub Actions 通过 OpenAI 官方 TypeScript SDK 调用 Responses API。API Key、Base URL 和模型由 Actions Secret 或变量配置。
- 官方英文标题始终保留为权威原文。当前标题使用仓库内的人工中文种子；新增或英文原文变化的标题通过结构化输出自动翻译，并单独记录源哈希。
- 中文站使用中文标题并保留英文原标题，英文站只使用官方英文标题。页面描述由标题和固定模板生成，不让模型编写事实摘要。
- 每份非空 README 作为一个请求翻译。产品只保存非空的最终 Markdown，不保存推理过程，也不引入通用 Markdown 修复器。
- 翻译提示词把 README 标记为待处理数据，禁止执行其中的指令。译文必须保留 Markdown 层级、代码、链接目标、图片地址及 HTML 属性。
- 每条译文保存原文哈希、翻译策略版本、模型和完成时间。只有原文哈希与策略版本均匹配时才复用译文；模型变化本身不触发重译。
- JSON 数据集是译文队列和缓存的权威来源。每轮生成从现有 Pages 数据集中复用有效的标题和 README 译文，并翻译缺失或失效项目。
- 默认每批处理 100 条，并发数为 100。网络错误、超时、408、409、429 和 5xx 最多重试 3 次；永久错误不重试。
- 未配置翻译密钥时跳过新译文，不影响英文数据发布。单项翻译失败也不回滚其他英文数据。

## Web 产品体验

- Rspress 提供文档外壳、约定式路由、静态生成、内置全文搜索、语言切换和深浅主题。
- JSON 数据集是 Web 与 MCP 的唯一权威数据源。Web 构建前从数据集生成中英文提案 Markdown，不维护第二份手写提案内容。
- 每个提案拥有独立的中英文静态 URL，并展示 README、阶段、状态、版本、同步时间和官方仓库入口。
- 提案目录提供阶段、状态、版本和组合关键词筛选；筛选条件写入 URL，便于刷新、分享和直接访问。
- 周期动态的时间范围写入 URL。TanStack Query 只负责加载和缓存静态数据，筛选与周期计算在浏览器内完成。
- Web 通过 Pages 相对路径读取静态数据，不依赖 REST API、数据库或常驻后端。Rspress `base` 负责 GitHub Pages 项目子路径。
- 周期动态展示过去一天、一周和一个月内的新增、阶段变化、完成、撤回和转为不活跃事件。

## 本地 MCP

- MCP 将作为 `@tc39-atlas/mcp` 公共 npm 包分发，通过 `npx` 启动本地 stdio 服务；发布前可从仓库本地构建和调试。
- MCP 只提供只读能力。`search_proposals` 支持阶段、ECMAScript 版本、状态和多个关键词；`get_proposals` 根据稳定 ID 返回摘要或 README 正文。
- 阶段、版本和提案资源分别通过 `tc39://stages/{stage}`、`tc39://editions/{edition}` 和 `tc39://proposals/{id}` 提供轻量浏览入口。
- 首次运行且没有缓存时，MCP 等待完整数据集下载。已有缓存时立即提供服务，并在后台静默检查清单版本。
- 只有内容版本变化，且字节数、SHA-256 和 Schema 均通过校验时，MCP 才原子替换缓存。网络或校验失败时继续使用旧缓存。
- MCP 工具调用只读取本地内存快照，不在调用过程中访问外部网络。运行日志只写入 stderr，避免污染 stdio 协议。
- 数据更新与程序更新相互独立。数据在 MCP 启动时检查，程序通过 npm 语义版本和 `npx @latest` 更新。

## 统一数据语义

- 阶段包括 Stage 0、1、2、2.7、3 和 4。Dataset 未提供阶段时保持为空，不自行推断。
- 状态区分进行中、已完成、不活跃和已撤回。仓库归档不等同于提案废弃。
- 只有已进入对应 ECMAScript 规范版本的提案拥有确定版本。进行中的提案不使用预计年份冒充版本。
- 搜索覆盖提案 ID、中英文标题、英文 README 和中文译文。多关键词默认全部匹配，也允许切换为任一匹配。

## 部署、分发与质量边界

- Web 和数据通过 GitHub Actions 部署到 GitHub Pages。工作流生成 Rspress 的 `doc_build` 产物；同步或构建失败时不覆盖上一份成功版本。
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
