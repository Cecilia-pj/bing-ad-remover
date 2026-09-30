// ==UserScript==
// @name         Bing 搜索去广告
// @namespace    https://github.com/Cecilia-pj/bing-ad-remover
// @version      1.0.0
// @description  移除 Bing 搜索结果页的广告条目（b_ad / b_wpt_top / b_adTop / b_adBottom / b_adMiddle / b_adLastChild），并清理残留的空白容器
// @author       Cecilia-pj
// @match        *://*.bing.com/*
// @match        *://bing.com/*
// @run-at       document-start
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    /* =================================================================
     * 实测的 Bing 广告 DOM 结构（来自搜索结果页存档）：
     *
     *   顶部广告条   #b_mcw > ol#b_topw > li.b_ad.b_wpt_top.b_adTop
     *                └── ul > li（同组的多条广告）
     *   广告尾项     li.b_adLastChild          <- 不带 b_ad 前缀，最容易漏
     *   结果列表     #b_results > li.b_ad / li.b_adBottom / li.b_adMiddle
     *   右栏 / 侧栏  #b_context .b_ad、#b_pole .b_ad、#b_rrat_cont .b_ad
     *
     * 三层处理：
     *   1) document-start 注入 CSS，先把广告收掉，避免闪现（FOUC）
     *   2) 按 class 精确摘除节点（remove，而不是藏）
     *   3) 内部特征兜底 —— 条目里只要出现广告标题链接 / 广告角标，
     *      哪怕 Bing 把外层 class 改名了也照样摘掉
     *
     * 关于 Bing 的反广告拦截检测（重要，不是 bug）：
     *   页面内有一段内联脚本会检查 .b_ad / .b_adTop / .b_adBottom 等元素的
     *   offsetHeight / offsetWidth 是否 < 1，只要判定为"被隐藏"，就写入
     *   cookie SRCHHPGUSR 的 AV=14 / ADV=14。
     *   也就是说：只要用了任何去广告手段（隐藏也好、删除也好），这个标记
     *   都会被写上，靠调脚本规避不掉。实测它只影响 Bing 服务端少发广告，
     *   不影响正常搜索与结果展示。
     * ================================================================= */

    const DEBUG = false;        // true -> 控制台输出每次摘除的数量
    const STYLE_ID = 'bing-ad-remover-style';
    const PURGE_DELAY = 60;     // DOM 变动后的合并延迟（ms）

    /* ---------- 1) 广告选择器 ---------- */

    // 广告条目本身（li 级别）
    const ITEM_SELECTORS = [
        // 顶部广告条：b_ad + b_wpt_top + b_adTop 三件套
        'li.b_ad',
        'li.b_adTop',
        'li.b_wpt_top',
        // 结果列表里的其它广告位
        'li.b_adBottom',
        'li.b_adMiddle',
        // 广告尾项：没有 b_ad 前缀，必须单独列
        'li.b_adLastChild',
    ];

    // 广告包裹块 / 容器（以及 Bing 自己代码里标注为广告的块）
    const BOX_SELECTORS = [
        '#b_topw > li.b_ad',
        '#b_topw > li.b_adTop',
        '#b_topw > li.b_adLastChild',
        '#b_topw li.b_ad',
        '#b_results > li.b_ad',
        '#b_results > li.b_adBottom',
        '#b_results > li.b_adMiddle',
        '#b_results .b_ad',
        '#b_context .b_ad',
        '#b_pole .b_ad',
        '#b_rrat_cont .b_ad',
        '#b_ims_bza_pole',
        '.sb_add.sb_adTA',
        '.mta_ad',
        '.b_spa_adblock',
        '.partnerLinks',
        '.b_adlabel',
        '#zune_upsell',
        '.ad_sc',
    ];

    const AD_SELECTOR = ITEM_SELECTORS.concat(BOX_SELECTORS).join(',');

    // 条目级兜底特征：这些只会出现在广告条目内部
    const AD_MARKERS = [
        'a.sb_adTA_title_link_cn',   // 广告标题链接
        'h2.b_topTitleAd',           // 顶部广告标题
        '.b_adlabel',                // "广告" 角标
        '.b_adurl',                  // 广告署名链接
    ].join(',');

    // 条目级扫描范围
    const ITEM_SCOPE = [
        '#b_results > li',
        '#b_topw > li',
        '#b_context > li',
        '#b_pole > li',
        '#b_rrat_cont > li',
    ].join(',');

    // 摘空之后需要一并移除的容器（避免留下空白占位）
    const EMPTY_BOXES = ['b_mcw', 'b_topw', 'b_topw_rrat', 'b_rrat_cont', 'b_pole'];

    /* ---------- 2) 样式：第一道防线，避免广告闪现 ---------- */

    const CSS = [
        AD_SELECTOR + ' { display: none !important; }',
        '#b_mcw:empty, #b_topw:empty, #b_topw_rrat:empty, #b_rrat_cont:empty, #b_pole:empty { display: none !important; }',
    ].join('\n');

    /* ---------- 3) 工具 ---------- */

    function log() {
        if (!DEBUG) return;
        console.debug.apply(console, ['%c[BingAdRemover]', 'color:#0a7', ...arguments]);
    }

    function injectStyle() {
        const root = document.head || document.documentElement;
        if (!root) { setTimeout(injectStyle, 20); return; }
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        root.appendChild(style);
    }

    let removedTotal = 0;

    function purge() {
        let n = 0;
        const scope = document.documentElement;
        if (!scope || !scope.querySelectorAll) return 0;

        // (a) 按 class 精确摘除
        for (const el of scope.querySelectorAll(AD_SELECTOR)) {
            if (el.isConnected) { el.remove(); n++; }
        }

        // (b) 条目级兜底：外层 class 被改名也认得出
        for (const li of scope.querySelectorAll(ITEM_SCOPE)) {
            if (!li.isConnected) continue;
            if (li.querySelector(AD_MARKERS)) { li.remove(); n++; }
        }

        // (c) 清掉被摘空的容器，别留空白
        for (const id of EMPTY_BOXES) {
            const box = document.getElementById(id);
            if (box && box.isConnected && box.children.length === 0) { box.remove(); n++; }
        }

        if (n) { removedTotal += n; log('removed ' + n + ' node(s), total ' + removedTotal); }
        return n;
    }

    // DOM 变动频繁时合并处理，避免反复扫描
    let queued = false;
    function schedule() {
        if (queued) return;
        queued = true;
        setTimeout(function () { queued = false; purge(); }, PURGE_DELAY);
    }

    /* ---------- 4) 启动 ---------- */

    injectStyle();

    (function waitRoot() {
        if (!document.documentElement) { setTimeout(waitRoot, 10); return; }

        // 先挂观察器，保证不漏掉 #b_topw 的插入
        const mo = new MutationObserver(schedule);
        mo.observe(document.documentElement, { childList: true, subtree: true });

        purge();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', purge, { once: true });
        }
        window.addEventListener('load', purge, { once: true });
        // Bing 滚动懒加载广告
        window.addEventListener('scroll', schedule, { passive: true });
    })();
})();
