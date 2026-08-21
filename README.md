# TC39 Atlas

TC39 Atlas 是面向中文开发者与 AI Agent 的 ECMAScript 提案资料库，汇集 TC39 提案索引、中文译文、中英文提案速览、阶段变化与兼容性信息，便于查阅提案并评估现代 ECMAScript 能力。

## 同步与翻译

同步分为两个阶段：

```bash
pnpm sync:scan
pnpm sync:translate
```

`sync:scan` 获取最新 TC39 Dataset 和各提案的 Raw README，只生成 `.cache/tc39-atlas/translation-plan.json` 与数据快照，不调用模型，也不修改正式数据集。计划会列出需要翻译的仓库、英文内容、内容哈希及失效原因。

`sync:translate` 校验并消费同一份计划和快照。默认通过 `.env` 中的 `DEEPSEEK_API_KEY` 调用模型；也可以由本地 AI Agent 根据计划生成 `.cache/tc39-atlas/translation-results.json`：

```json
{
  "schemaVersion": 1,
  "planRevision": "复制 translation-plan.json 的 revision",
  "model": "local-ai-agent",
  "translations": [
    {
      "proposalId": "proposal-example",
      "sourceHash": "复制计划项目的 sourceHash",
      "titleZh": "中文标题",
      "readmeZh": "完整 README 译文",
      "overview": {
        "en": "English overview.",
        "zh": "中文速览。"
      }
    }
  ]
}
```

Agent 结果可以只覆盖部分计划项；配置模型密钥时，剩余项目由模型继续处理。`.cache/`、生成的提案 Markdown 和构建缓存均被 Git 忽略；本地完成后只需审查并提交 `apps/web/docs/public/data/dataset.json` 与 `manifest.json`。只有生成时间、提案同步时间或翻译完成时间变化时，`sync:translate` 会保留上一份正式数据文件；`pnpm sync` 会依次执行完整的两阶段流程。

## 开源协议

[MIT](./LICENSE) © yliu
