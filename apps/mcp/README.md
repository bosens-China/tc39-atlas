# @tc39-atlas/mcp

本地只读 TC39 提案 MCP 服务。npm 包内置一份通过清单校验的数据快照，因此首次运行无需等待网络；以后启动时优先使用本地缓存，并在后台静默检查更新。提案详情包含英文原文、中文译文和中英文快速审查。

> 当前包尚未发布到 npm。以下配置是发布后的预定用法；仓库内开发请先构建再运行。

## 使用

在支持本地 stdio MCP 的客户端中添加：

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

Windows 客户端如果无法解析 `npx`，将命令改为 `npx.cmd`。

服务提供 `search_proposals` 和 `get_proposals` 两个只读工具，以及按阶段、版本和提案 ID 浏览的资源。

## 数据与缓存

- `TC39_ATLAS_MANIFEST_URL`：覆盖默认发布清单地址。
- `TC39_ATLAS_CACHE_DIR`：覆盖本地缓存目录。

本地缓存不存在时，服务会先把内置快照写入缓存。随后只获取远端清单；版本发生变化时才下载、校验并原子替换完整数据。网络错误不会阻止服务启动。所有运行日志写入 stderr，不会污染 stdio 协议输出。
