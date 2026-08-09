# TC39 Atlas Web

基于 Rspress 2 的静态双语文档站。

`pnpm generate:docs` 从 `docs/public/data/dataset.json` 生成中英文提案目录、五个日历周期的变化页、详情 Markdown 与提案侧边栏元数据。两个语言版本的侧边栏和详情页一级标题都使用 TC39 官方英文标题；中文页随后展示可用的中文标题和 README，缺失译文的中文侧边栏条目显示“未译”。Rspress 负责 Home 首页、四个顶部栏目、独立侧边栏、页面大纲、静态路由、全文搜索、语言切换和 GitHub Pages 子路径。

提案保留 `/proposals/<id>` 兼容路径，同时为侧边栏生成 `/proposals/year/<year>/<id>` 和 `/proposals/stage/<stage>/<id>` 两种浏览路径。兼容路径是唯一加入全文搜索的详情页，避免重复结果。

```powershell
pnpm dev:web
pnpm --filter @tc39-atlas/web build
```

开发与发布命令见[仓库 README](../../README.md)。
