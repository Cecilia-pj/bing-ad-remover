# bing-ad-remover

Bing 网页版的用户脚本（UserScript）集合：移除搜索结果页广告 + 让外观跟随系统深浅色。

两个脚本互相独立，可以只装需要的那个。

## 脚本一览

| 脚本 | 作用 |
|---|---|
| [`bing-search-ad-remover.user.js`](./bing-search-ad-remover.user.js) | 移除搜索结果页广告 |
| [`bing-appearance-system-theme.user.js`](./bing-appearance-system-theme.user.js) | 外观锁定「系统默认值」，随系统深浅色切换 |

## 安装

浏览器安装 [Tampermonkey](https://www.tampermonkey.net/) 或 Violentmonkey，然后点对应链接，管理器会自动弹出安装页：

**移除广告**
<https://github.com/Cecilia-pj/bing-ad-remover/raw/main/bing-search-ad-remover.user.js>

**外观跟随系统**
<https://github.com/Cecilia-pj/bing-ad-remover/raw/main/bing-appearance-system-theme.user.js>

两个脚本头部都带 `@updateURL` / `@downloadURL`，仓库发新版后 Tampermonkey 会自动检测更新。

---

# 1. 移除搜索广告

## 效果

清掉搜索结果页上的全部广告条目：

- **顶部广告条** —— `li.b_ad.b_wpt_top.b_adTop`（含其内部整组广告）
- **结果列表内广告** —— `li.b_ad` / `li.b_adBottom` / `li.b_adMiddle`
- **广告尾项** —— `li.b_adLastChild`（故意不带 `b_ad` 前缀，只看 `b_ad` 会漏）
- **右栏 / 侧栏** —— `#b_context .b_ad`、`#b_pole .b_ad`、`#b_rrat_cont .b_ad`
- **图片/视频搜索广告位** —— `#b_ims_bza_pole`

摘除广告后连带清理被摘空的容器（`#b_mcw` / `#b_topw` 等），页面不会留下空白。

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

---

# 2. 外观跟随系统默认

## 效果

把必应「设置 → 外观」锁定为**系统默认值**：Windows 切深色，Bing 就是深色；切回浅色，Bing 跟着变浅，无需刷新。

顺带解决 `cn.bing.com`（国内版）**无论系统深浅色都固定浅色**的问题 —— 服务端硬编码了 `DarkSchemeCookies.defaultThemeOption="0"`，本脚本绕过它。

## 为什么需要这个

Bing 的主题存在一个复合 cookie `SRCHHPGUSR` 里（格式 `KEY=VAL&KEY=VAL`，还塞了 `HV`/`HVE`/`BRW` 等遥测键），真正决定外观的是两个键：

| 键 | 含义 | 取值 |
|---|---|---|
| `WEBTHEME` | 用户选择 | `0`=浅色 `1`=深色 **`2`=系统默认** |
| `PREFCOL` | 系统实际色 | `1`=系统深色 `0`=系统浅色 |

渲染开关是 `<body>` 上的 `b_dark` class。

**服务端首屏判定**（实测，非推断）：

```
WEBTHEME=0                -> 永远浅色
WEBTHEME=1                -> 永远深色（忽略系统）
WEBTHEME=2 + PREFCOL=1    -> 深色
WEBTHEME=2 + PREFCOL=0    -> 浅色
```

关键点：**服务端读不到客户端的 `prefers-color-scheme`**，只能靠 `PREFCOL`。

所以「系统默认值」不是把 `WEBTHEME` 设成 `2` 就完事 —— 必须让 `PREFCOL` 跟系统实时值一致，否则首屏会先出浅色、再由页面 JS 纠正，**闪一下白底**。只写 `WEBTHEME=2` 而不管 `PREFCOL`，正是网上那些同类脚本失效的原因。

## 实现

`document-start` 阶段就把 cookie 写好，服务端直接直出正确的 `b_dark`，**零闪烁**。

| 措施 | 作用 |
|---|---|
| 读 `matchMedia('(prefers-color-scheme: dark)')` | 拿到系统当前深浅 |
| 写 `WEBTHEME=2` + `PREFCOL=<系统实时值>` | 服务端直出正确主题 |
| **保留 cookie 内其他所有键** | 遥测键丢了可能被判异常 |
| 同步旧版遗留的 `THEME` 键 | 防止被页面回写成旧值 |
| 双写当前主机 + `.bing.com` | 避免遗留旧域 cookie 覆盖 |
| 监听 `matchMedia` 的 `change` | 系统切换时实时跟随 |
| 3s 轮询兜底 | 防 Bing 在 SPA 跳转时重置外观 |

系统主题变化后会 `location.replace` 刷新一次：深色 CSS 是服务端按 cookie 注入的，不刷新拿不到新样式。用 `replace` 而非 `assign`，避免在历史里堆记录。

## 开发：cookie 读写离线回归

`SRCHHPGUSR` 是复合 cookie，改解析逻辑时务必确认**其他键不会丢**。可直接用 curl 验证服务端认不认：

```bash
curl -s -A "Mozilla/5.0" \
  -b "SRCHHPGUSR=WEBTHEME=2&PREFCOL=1" \
  "https://cn.bing.com/search?q=test" | grep -o '<body class="[^"]*"'
# -> <body class="b_respl b_dark"
```

深色系统用 `PREFCOL=1`，浅色系统用 `PREFCOL=0`。这个「服务端渲染型站点直接 curl 验 cookie」的办法对同类站点通用。

## License

MIT
