# TC39 Atlas 初始版本

- 基线：全新产品
- 依赖：无

## 背景与目标

TC39 Atlas 面向关注 ECMAScript 提案的中文用户与 AI Agent。产品每天同步 TC39 提案，提供提案检索、中文译文和周期变化信息。

项目采用 pnpm monorepo。`apps/web` 和 `apps/mcp` 分别提供 Web 与 MCP 入口，`packages/core` 统一负责提案模型、数据同步、查询和 PostgreSQL 存储。

## 产品组成

### 后端核心

- 每天从 TC39 Dataset 和各提案仓库同步数据。
- 以 TC39 Dataset 作为标题、阶段、状态和 ECMAScript 版本的结构化来源；其权威上游仍是 TC39 官方提案清单。
- 以提案仓库的 README 作为提案正文来源。
- 每次同步下载官网提供的 JSON Schema。官方 Schema 指纹变化、Schema 无效或实际消费字段校验失败时记录结构化错误并中止写入，保留上一份成功快照。
- 保存提案仓库 URL。正文信息不足时，用户或 Agent 可以继续访问原仓库。
- 使用 PostgreSQL 保存产品需要的提案数据。
- 提供稳定的提案 ID，供 Web 与 MCP 共同使用。

### MCP

- MCP 作为服务器进程部署，通过 HTTPS 对外提供 Streamable HTTP 端点。
- MCP 服务在服务器内连接 PostgreSQL，不向用户暴露数据库连接信息。
- 初始版本不分发本地 stdio 服务或 npm 代理。
- MCP 只提供只读查询，不开放通用 SQL 查询。
- 支持按一个或多个提案阶段筛选。
- 支持按一个或多个 ECMAScript 版本筛选。
- 支持按一个或多个关键词组合搜索。
- 支持查看全部提案的轻量索引。
- 支持通过稳定 ID 查看一个或多个提案的 README。
- 支持筛选已撤回或不再活跃的提案。
- 每项结果包含提案仓库 URL 和数据更新时间。
- MCP 只提供当前稳定状态，不提供历史版本或变化事件查询。

MCP 的最小工具集为：

- `search_proposals`：组合阶段、ECMAScript 版本、关键词和状态进行搜索。无筛选条件时返回全部提案。
- `get_proposals`：根据一个或多个 ID 返回提案摘要或 README 正文。

MCP 通过资源提供轻量浏览入口：

- `tc39://stages/{stage}`
- `tc39://editions/{edition}`
- `tc39://proposals/{id}`

阶段和版本资源只返回 ID、标题、阶段、ECMAScript 版本和状态。每份提案正文只保留一个权威入口。

### Web API

- Hono 提供只读 REST API，供后续 Web 界面直接对接。
- 提供提案列表、提案详情、周期变化和健康检查接口。
- Zod 在数据库查询前校验路径和查询参数。
- OpenAPI JSON 作为接口契约，并通过 Swagger UI 提供可交互文档。
- Hono logger 输出请求日志。
- REST API 可以读取变化事件；MCP 仍只公开当前稳定状态。

### 部署与工程质量

- 使用 Node.js 22 多阶段 Dockerfile 构建并以非 root 用户运行。
- Docker Compose 同时启动 PostgreSQL 与后端，分别使用本机端口 55439 和 43127。
- 容器启动时自动执行数据库迁移，并提供健康检查。
- 仓库根目录统一配置 ESLint，TypeScript 禁止显式 `any`。

### Web

- 提供与 MCP 一致的提案筛选、搜索、列表和详情能力。
- 提案详情页使用“中文译文”和“英文原文”两个 Tab 展示 README。
- 每天同步提案后，使用 AI 生成或更新 README 的中文译文。
- README 原文未变化时，直接复用已有译文，不重复翻译。
- 保留原文、译文和提案仓库 URL，避免译文替代权威原文。
- 展示过去一天、一周和一个月的提案变化。
- 变化范围包括新增提案、阶段变化、完成、撤回以及转为不活跃状态。
- 周期变化由不同时间点的提案状态比较得出，不作为 MCP 查询能力公开。

## 统一数据语义

- 提案阶段包括 Stage 0、Stage 1、Stage 2、Stage 2.7、Stage 3 和 Stage 4。
- TC39 Dataset 未提供阶段的提案使用空阶段，不自行推断。
- 提案状态区分进行中、已完成、不活跃和已撤回；仓库归档不等同于提案废弃。
- 只有已进入对应 ECMAScript 规范版本的提案拥有确定的版本值。
- 进行中的提案不使用预计年份冒充确定的 ECMAScript 版本。
- 搜索覆盖提案 ID、标题和 README。
- 多关键词搜索默认要求全部关键词匹配，并允许切换为任一关键词匹配。

## 范围与非目标

初始版本不包含以下能力：

- 抓取或展示会议纪要、Issue 和 Pull Request。
- 向 MCP 暴露历史版本、变化事件或任意 SQL 查询。
- 自动解释 README 的具体文本差异。
- 使用译文替代 TC39 原始内容或官方状态。

## 验收标准

- 每次成功同步后，Web 与 MCP 查询到一致的当前提案状态。
- 用户和 Agent 可以组合阶段、ECMAScript 版本、状态和多个关键词筛选提案。
- 用户和 Agent 可以通过稳定 ID 获取一个或多个提案的 README 和仓库 URL。
- 已撤回或不再活跃的提案可以被明确筛选。
- Web 可以通过两个 Tab 展示 README 原文及对应中文译文。
- README 原文未变化时，系统不会重复生成译文。
- Web 可以分别展示过去一天、一周和一个月内的新增、阶段变化、完成、撤回和转为不活跃的情况。
- Web 所需的列表、详情和周期变化 REST API 通过 OpenAPI 契约公开。
- MCP 不返回历史变化数据，Web 的周期变化不影响 MCP 的当前状态查询。
- Agent 客户端可以通过公开的 HTTPS Streamable HTTP 端点连接 MCP 服务。
- Node.js 22 容器可以完成迁移、同步并通过健康检查。

## 对后续计划的影响

后续需求应复用统一提案模型。会议纪要、Issue、语义差异分析和更长时间范围的历史查询，需要作为独立增量需求规划。
