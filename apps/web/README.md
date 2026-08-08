# TC39 Atlas Web

基于 Rspress 2、React、TanStack Query、Ant Design 和 UnoCSS 的静态双语文档站。

`pnpm generate:docs` 从 `docs/public/data/dataset.json` 生成中英文提案 Markdown。中文站使用 `titleZh` 和中文 README，英文站保留 TC39 官方标题和原文。Rspress 负责独立详情路由、静态生成、全文搜索、语言切换和 GitHub Pages 子路径；提案目录与周期动态仍在浏览器内完成筛选和查询。

```powershell
pnpm --filter web dev
pnpm --filter web build
```

开发与发布命令见[仓库 README](../../README.md)。
