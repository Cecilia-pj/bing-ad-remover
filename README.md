# bing-ad-remover

移除 Bing 搜索结果页广告的用户脚本（UserScript）。

## 效果

清掉搜索结果页上的全部广告条目：

- **顶部广告条** —— `li.b_ad.b_wpt_top.b_adTop`（含其内部整组广告）
- **结果列表内广告** —— `li.b_ad` / `li.b_adBottom` / `li.b_adMiddle`
- **广告尾项** —— `li.b_adLastChild`（故意不带 `b_ad` 前缀，只看 `b_ad` 会漏）
- **右栏 / 侧栏** —— `#b_context .b_ad`、`#b_pole .b_ad`、`#b_rrat_cont .b_ad`
- **图片/视频搜索广告位** —— `#b_ims_bza_pole`

摘除广告后连带清理被摘空的容器（`#b_mcw` / `#b_topw` 等），页面不会留下空白。

## 安装

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/) 或 Violentmonkey
2. 打开 [`bing-search-ad-remover.user.js`](./bing-search-ad-remover.user.js)，点 `Raw`，按提示安装

## 覆盖范围

`@match *://*.bing.com/*`，生效于 `document-start`。

选择器只在 `#b_results` / `#b_topw` / `#b_context` / `#b_pole` / `#b_rrat_cont` 这些结果容器内起作用，不影响 Bing 首页、图片、地图等其他页面。

## 实现

三层处理，从快到准：

| 层 | 手段 | 作用 |
|---|---|---|
| 1 | `document-start` 注入 CSS `display:none !important` | 防广告闪现（FOUC） |
| 2 | 按 class `remove()` 摘除节点 | 彻底移除，不留占位 |
| 3 | 内部特征兜底 | Bing 改外层 class 也能命中 |

第 3 层的判定依据是「条目内部是否出现广告专属节点」：

```
a.sb_adTA_title_link_cn   广告标题链接
h2.b_topTitleAd           顶部广告标题
.b_adlabel                "广告" 角标
.b_adurl                  广告署名链接
```

`MutationObserver` + `scroll` 事件合并调度（60ms debounce），覆盖滚动懒加载与异步插入的广告。

CSS 与 JS 共用同一份选择器数组，不会出现两处不同步的漏网。

## 已知行为（不是 bug）

Bing 页面内有一段内联脚本会遍历广告元素，检查 `offsetHeight / offsetWidth` 是否小于 1：

```js
function isHidden(el) {
  if (el.closest('.b_adTop.defBlkSkip')) return false;   // 白名单
  const r = el.getBoundingClientRect(), c = ge('b_content');
  return el.offsetHeight < 1 || el.offsetWidth < 1
      || el.offsetLeft < -100 || el.offsetTop < -100
      || c.offsetHeight < r.top || c.offsetWidth < r.left;
}
```

只要判定"被隐藏"，就写入 cookie `SRCHHPGUSR` 的 `AV=14` / `ADV=14`。关键在于 **命中数变 0 同样会触发**——所以 `remove()` 和 `display:none` 都躲不掉这个标记，靠调整脚本规避不了。

实测影响：仅 Bing 服务端少发广告，不影响搜索与结果展示。

## 开发：选择器离线验证

改选择器之前，建议先用页面存档离线跑一遍，确认「广告全命中 + 正常结果零误伤」，别靠改一次刷一次。

本仓库的选择器是在 `cn.bing.com/search?q=stranslate` 的 MHTML 存档上验证过的：

```
[1] 广告选择器命中：8 个元素（4 个 li + 4 个内部容器）
[2] 条目级兜底命中：2 个
[3] 误伤检查
    广告选择器与 --normal 撞车：0
    位于正常元素内部的广告命中：0
    页面正常结果 li.b_algo：9 个  →  摘除后仍保留 9 个
结论：PASS
```

## License

MIT
