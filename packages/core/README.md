# @tc39-atlas/core

TC39 Atlas 的内部共享包，负责提案模型、上游抓取、标题与 README 增量翻译、变化检测、JSON 数据集生成和内存查询。

该包不会发布到 npm，由 Web 在构建和数据同步时直接使用。开发命令见[仓库 README](../../README.md)。

两阶段同步先运行 `pnpm sync:scan`，再运行 `pnpm sync:translate`。当前翻译计划和 Agent 结果使用 `schemaVersion: 2`；升级前生成的计划需要重新扫描，Agent 结果也需要对应新的计划版本。若扫描后正式数据已经更新，翻译阶段会拒绝覆盖，并提示重新运行 `pnpm sync:scan`。
