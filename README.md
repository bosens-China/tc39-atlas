# TC39 Atlas

面向中文用户与 AI Agent 的 TC39 提案索引服务，统一提供每日同步、REST API 和 MCP 查询能力。

需要 Node.js 22 和 pnpm 11。

内部 workspace 包直接导出 TypeScript 源码，由 pnpm workspace 链接和 `tsx` 运行；
只有部署目标明确要求 JavaScript 产物时，MCP/Hono 服务才使用 `tsdown` 编译。

## 本地开发

```powershell
$env:DATABASE_URL='postgres://tc39_atlas:tc39_atlas@127.0.0.1:55439/tc39_atlas'
pnpm db:up
pnpm db:migrate
pnpm dev:mcp
```

Web 界面在另一个终端启动：

```powershell
pnpm --filter web dev
```

- Docker Compose 仅运行开发数据库，后端始终通过本地 `tsx` 进程启动。
- PostgreSQL：`127.0.0.1:55439`
- 后端：`http://127.0.0.1:43127`
- MCP Streamable HTTP：`http://127.0.0.1:43127/mcp`
- REST API：`http://127.0.0.1:43127/api`
- OpenAPI：`http://127.0.0.1:43127/api/openapi.json`
- Swagger UI：`http://127.0.0.1:43127/api/docs`
- 健康检查：`http://127.0.0.1:43127/health`（最近 48 小时无成功同步时返回 503）

## 生产 Compose

生产栈包含 PostgreSQL、Node.js 22 后端和 Nginx 静态 Web。首次启动会自动迁移、同步并翻译待处理 README；按需在 `.env` 中配置翻译服务变量。

```powershell
docker compose -f compose.prod.yaml up -d --build
```

- Web：`http://127.0.0.1:8080`
- REST API、Swagger UI、健康检查和 MCP 均由 Web 入口同源代理。
- `WEB_PORT`、`POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB` 和翻译变量均可通过环境变量覆盖。

供前端直接对接的只读接口：

- `GET /api/proposals`：按阶段、版本、状态和关键词检索
- `GET /api/proposals/{id}`：读取提案详情、README 与当前匹配的中文译文
- `GET /api/changes`：读取一天、一周或一个月内的变化
- `GET /api/health`：API 健康检查

查询参数、响应结构和校验规则以 OpenAPI 文档为准。请求日志由 Hono logger 输出，
输入由 Zod 在数据库查询前校验。

服务启动后会立即同步一次 TC39 数据，随后每 24 小时同步；本地调试可设置
`SYNC_ON_START=false`。绑定到 `0.0.0.0` 或 `::` 时必须通过逗号分隔的
`ALLOWED_HOSTS` 显式配置公开域名，可用 `ALLOWED_ORIGINS` 限制浏览器来源。

README 中文翻译使用 OpenAI 官方 TypeScript SDK，默认调用 Responses API。配置
`TRANSLATION_API_KEY` 后，每次英文同步提交完成会翻译原文或策略发生变化的提案；
默认模型为 `gpt-5.6-luna`，每批 100 条且并发 100。兼容供应商可通过
`TRANSLATION_BASE_URL` 和 `TRANSLATION_MODEL` 切换。未配置 Key 时只跳过翻译，
不会影响英文数据同步。产品只保存最终 Markdown 译文。DeepSeek 的
`deepseek-v4-flash` 使用 Responses API，显式关闭思考并使用该模型公布的最大输出
上限；当前不支持该接口的 `deepseek-v4-pro` 会按模型名改用 Chat Completions。

提案元数据来自 `https://tc39.es/dataset/proposals.min.json`，README 来自各提案
仓库。同步会校验官方 Schema 指纹和实际消费字段；上游契约变化或数据校验失败时，
日志会输出 `tc39_dataset_schema_changed` 或
`tc39_dataset_validation_failed`，本次同步不会写入数据库。
提案仓库 README 明确返回 404 时保存空正文；其他下载失败会中止本次同步，
避免临时网络故障覆盖上一份有效正文。

## 质量检查

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
