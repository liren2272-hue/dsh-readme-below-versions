# @local/dsh-readme-below-versions

把 DSH 插件页里**组合包的详细介绍文档（README）**从页面顶部挪到**「更新 / 版本」区块下方**；
对没有更新栏的本地 `@local/*` 包，则挪到页面最后一个自有区块（来源）下方。

## 为什么是插件而不是改 DSH

DSH 内置的 `@deepseek-ai/dsh-client-ui-plugin-manager`（打包在 `app.asar` 内）在组合包详情页里把各区块按固定顺序渲染：

| 顺序 | 区块 | 标记 |
| --- | --- | --- |
| 1 | 详细介绍文档 / README | 无标记（`BundleDetailSection`） |
| 2 | 本 bundle 的配置表单 | `data-plugin-config` |
| 3 | 行列表（含每行的开关） | `data-plugin-rows` |
| 4 | **更新 / 版本**（重新检查、更新到、版本列表） | `data-plugin-versions` |
| 5 | 来源 | `data-plugin-source` |
| 6 | 其它插件注入的 `plugins.detail.section` | — |

README 就在第 1 位，更新栏在第 4 位，所以用户看到的是「README 在更新栏上面」。
这两个区块都在 React 树内部，不是 slot，其它插件没法用 `ctx.slots` 换位；直接改 `app.asar` 又会在 DSH 升级时丢掉。

本插件因此只装饰浏览器 DOM：`.detailSections` 的实测 CSS 是
`display:flex; flex-direction:column; gap:32px`，所以给它写 flex `order`
就能改变绘制顺序——**一个节点都不移动**，React 的 reconciliation 不受影响。
关闭 bundle 时 `apply` 返回的清理函数会撤掉全部内联样式，页面恢复原状。

## 行为

- README 的 `order` 设为 `1`，锚点之后的所有兄弟块（来源、扩展槽）设为 `2`
  → 视觉顺序变成：`[配置][行列表][更新/版本][README][来源][扩展槽]`
- 锚点优先取 `[data-plugin-versions]`（更新栏）。**没有更新栏时回退**：取页面
  最后一个自有区块（本地包通常是 `data-plugin-source` 来源块）作为锚点，
  README 依然落到它下方 → 本地 `@local/*` link 包同样生效。
- 只在同时存在 `[data-plugin-detail]`（组合包详情页）和至少一个自有区块时生效；
  没有 README 的页面完全不动。
- 组件重建由 `MutationObserver` 重新断言，另有 3 秒轮询兜底。
- 不读取任何 Cordis 服务（`inject: []`），不会触发 `cannot get property … without inject`。

## 自测

```bash
"$HOME/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node.exe" selftest.mjs
```

用假 DOM 覆盖：正常换位、无 README、无更新栏、README 已在下方、本地包
（无更新栏、锚点回退到来源）、`lastPageSection`/`SECTION_SELECTOR` 断言，
以及 `apply`/`dispose` 的样式写入与清理。
