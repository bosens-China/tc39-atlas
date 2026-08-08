# TC39 Atlas 产品需求

## 产品定位

TC39 Atlas 面向关注 ECMAScript 提案的中文用户与 AI Agent，每天同步 TC39 提案，统一提供提案检索、中文译文、周期变化、REST API 和 MCP 查询能力。

产品由三部分组成：

- `apps/web` 提供中文 Web 界面。
- `apps/mcp` 提供 Hono REST API 与 Streamable HTTP MCP 服务。
- `packages/core` 统一负责提案模型、同步、翻译、查询和 PostgreSQL 存储。

## 数据来源与同步

- TC39 Dataset 提供标题、阶段、状态和 ECMAScript 版本等结构化元数据；TC39 官方提案清单仍是其权威上游。
- 各提案仓库 README 是正文来源，并保留仓库 URL 供用户和 Agent 回到原始资料。
- 服务启动时默认立即同步一次，随后每 24 小时同步；启动时同步可以独立关闭。
- 同步前校验官方 JSON Schema 指纹、Schema 有效性和产品实际消费字段。上游契约变化或数据无效时中止写入，保留上一份成功快照。
- README 明确不存在时允许保存空正文；其他下载失败时中止本次同步，避免网络故障覆盖有效快照。
- PostgreSQL 保存当前提案、README、中文译文和产品所需的变化事件。Web 与 MCP 复用稳定提案 ID 和统一数据语义。

## 查询接口

### MCP

- MCP 通过 HTTPS Streamable HTTP 部署，只提供只读查询，不暴露数据库连接、通用 SQL 或历史变化。
- `search_proposals` 支持组合阶段、ECMAScript 版本、状态和多个关键词；无筛选条件时返回全部提案。
- `get_proposals` 根据一个或多个稳定 ID 返回提案摘要或 README 正文。
- 阶段、版本和提案资源分别通过 `tc39://stages/{stage}`、`tc39://editions/{edition}` 和 `tc39://proposals/{id}` 提供轻量浏览入口。

### REST API

- Hono 提供提案列表、详情、周期变化和健康检查接口。
- Zod 在数据库查询前校验输入，OpenAPI 与 Swagger UI 提供公开接口契约，请求日志由 Hono logger 输出。
- 服务端导出链式路由类型，Web 通过 Hono `hc` 复用请求参数和响应类型。
- REST API 可以读取变化事件；MCP 只公开当前稳定状态。

## README 中文翻译

- 服务端通过 OpenAI 官方 TypeScript SDK 调用 Responses API；API Key、Base URL 和模型均由环境变量配置。供应商已明确公布的接口差异可以按精确模型名路由。
- 每份非空 README 作为一个请求翻译，只保存非空的最终 Markdown，不保存推理过程，也不引入 AST 校验、通用 Markdown 修复器或自动拒绝规则。
- 翻译提示词以明确的数据边界隔离 README，禁止执行其中的指令；要求完整翻译自然语言，并保持 Markdown 层级、代码、链接目标、图片地址及 HTML 属性。
- 提案记录保存译文对应的原文哈希、翻译策略版本、模型和完成时间。只有原文哈希与策略版本都匹配时才复用译文，模型变更本身不触发重译。
- 英文同步提交后处理待翻译队列。译文只有在原文哈希仍匹配时才写入；单项失败不回滚英文数据，下次运行继续重试。
- PostgreSQL 是译文缓存的唯一权威来源。历史异常译文由人工修复或清退后重新进入队列。
- 每轮先取得待处理快照，按每组 100 条、默认并发 100 处理。网络错误、超时、408、409、429 和 5xx 最多重试 3 次并随机退避，永久错误不重复请求。

## Web 产品体验

- Web 提供提案筛选、组合关键词搜索、分页、详情和周期变化页面。
- TanStack Router 文件路由管理页面与类型化 URL 搜索参数；未知地址回到提案列表。
- TanStack Query 管理服务端请求、缓存、取消、轮询和重试；失败状态提供明确反馈和重试入口。
- React Compiler 保持启用，业务组件写法应能被编译器优化。
- 提案详情以“中文译文”和“英文原文”两个 Tab 展示 README，并保留官方仓库入口。
- 周期动态展示过去一天、一周和一个月内的新增、阶段变化、完成、撤回和转为不活跃事件。

## 统一数据语义

- 阶段包括 Stage 0、1、2、2.7、3 和 4；Dataset 未提供阶段时保持为空，不自行推断。
- 状态区分进行中、已完成、不活跃和已撤回；仓库归档不等同于提案废弃。
- 只有已进入对应 ECMAScript 规范版本的提案拥有确定版本，进行中的提案不使用预计年份冒充版本。
- 搜索覆盖提案 ID、标题和 README；多关键词默认全部匹配，也允许切换为任一匹配。

## 部署与质量边界

- 本地开发 Compose 只运行 PostgreSQL，后端通过本地 `tsx` 启动。
- 生产 Compose 运行 PostgreSQL、Node.js 22 非 root 后端和 Nginx 静态 Web，并通过同源入口代理 REST API 与 MCP。
- 容器启动时自动迁移数据库；最近 48 小时没有成功同步时健康检查返回 503。
- TypeScript 禁止显式 `any`，核心数据源、同步、查询、翻译和服务契约使用 Vitest 覆盖。

## 非目标

- 不抓取或展示会议纪要、Issue 和 Pull Request。
- 不向 MCP 暴露历史变化、任意 SQL 或 README 文本差异解释。
- 不用中文译文替代 TC39 原始内容、官方状态或原仓库。
- 不预先引入 Redis、消息队列、通用翻译缓存表、分块翻译器或 Batch API；只有真实规模与费率问题出现后再单独规划。

用户运行方式和环境变量以[仓库 README](../README.md)为准，REST 请求结构以运行中的 OpenAPI 文档为准。
