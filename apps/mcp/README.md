# @tc39-atlas/mcp

本地只读 TC39 提案 MCP 服务。首次运行会下载 TC39 Atlas 发布的数据集；以后启动时先使用本地缓存，并在后台静默检查更新。

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

已有缓存时，网络错误不会阻止 MCP 启动；首次运行且没有缓存时需要能访问数据发布地址。所有运行日志写入 stderr，不会污染 stdio 协议输出。
