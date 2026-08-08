---
title: 数据来源与更新
---

# 数据来源与更新

TC39 Atlas 每天通过 GitHub Actions 读取 [TC39 Dataset](https://tc39.es/dataset/) 和各提案的 GitHub README。结构化状态以 TC39 官方数据为准，正文以提案仓库为准。

网站和 MCP 使用同一份带版本清单与 SHA-256 校验的 JSON 数据集。一次同步或构建失败不会覆盖上一份已经发布的数据。
