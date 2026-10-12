// ==UserScript==
// @name         Bing 外观跟随系统默认
// @namespace    https://github.com/Cecilia-pj/bing-ad-remover
// @version      1.0.0
// @description  把必应的「外观」锁定为「系统默认值」，随操作系统的深浅色自动切换，并消除首屏闪烁（cn.bing.com 默认锁死浅色）
// @author       Cecilia-pj
// @match        *://*.bing.com/*
// @match        *://bing.com/*
// @run-at       document-start
// @grant        none
// @license      MIT
// @downloadURL  https://github.com/Cecilia-pj/bing-ad-remover/raw/main/bing-appearance-system-theme.user.js
// @updateURL    https://github.com/Cecilia-pj/bing-ad-remover/raw/main/bing-appearance-system-theme.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Bing 主题机制（由 cn.bing.com/account/general 内联的
  // DarkSchemeCookies 模块逆向确认，非猜测）：
  //
  //   cookie 名 : SRCHHPGUSR   （单个复合 cookie，格式 KEY=VAL&KEY=VAL）
  //   WEBTHEME  : 用户选择     "0"=浅色  "1"=深色  "2"=系统默认
  //   PREFCOL   : 系统实际色   "1"=系统深色  "0"=系统浅色
  //   body.b_dark : 深色渲染的开关 class
  //
  //   服务端首屏判定（已用 curl 实测验证）：
  //     WEBTHEME=0            -> 永远浅色
  //     WEBTHEME=1            -> 永远深色
  //     WEBTHEME=2 + PREFCOL=1 -> 深色
  //     WEBTHEME=2 + PREFCOL=0 -> 浅色
  //
  //   => 服务端读不到客户端的 prefers-color-scheme，只能靠 PREFCOL。
  //      所以「系统默认值」必须 WEBTHEME=2 且 PREFCOL 与系统实时一致，
  //      否则首屏会闪一下浅色再由 JS 纠正。
  //
  //   另注：cn.bing.com 服务端硬下发 DarkSchemeCookies.defaultThemeOption="0"
  //   （即默认浅色），这是国内版锁死浅色的根因，本脚本用 cookie 覆盖绕过。
  // ─────────────────────────────────────────────────────────────

  var COOKIE_NAME = 'SRCHHPGUSR';
  var K_WEBTHEME = 'WEBTHEME';
  var K_PREFCOL = 'PREFCOL';

  var THEME_SYSTEM = '2';
  var COL_DARK = '1';
  var COL_LIGHT = '0';

  var COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 年
  var LOG_PREFIX = '[bing-appearance-system-theme]';

  var darkQuery =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

  /** 当前操作系统是否为深色模式 */
  function systemIsDark() {
    return !!(darkQuery && darkQuery.matches);
  }

  /** 读取复合 cookie SRCHHPGUSR，返回 { KEY: VAL } 对象（保持原有大小写） */
  function readCompositeCookie() {
    var out = {};
    var all = document.cookie ? document.cookie.split(';') : [];

    for (var i = 0; i < all.length; i++) {
      var pair = all[i];
      var eq = pair.indexOf('=');
      if (eq < 0) continue;

      var name = pair.slice(0, eq).replace(/^\s+/, '');
      if (name !== COOKIE_NAME) continue;

      // 同一名字可能有多个 path/domain 版本，取信息量最大的一个
      var body = pair.slice(eq + 1);
      var parsed = parseComposite(body);
      if (Object.keys(parsed).length >= Object.keys(out).length) {
        out = parsed;
      }
    }
    return out;
  }

  /** 把 "A=1&B=2" 解析成对象 */
  function parseComposite(body) {
    var obj = {};
    var parts = body.split('&');
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i];
      if (!seg) continue;
      var eq = seg.indexOf('=');
      if (eq < 0) {
        obj[decodeSafe(seg)] = '';
      } else {
        obj[decodeSafe(seg.slice(0, eq))] = decodeSafe(seg.slice(eq + 1));
      }
    }
    return obj;
  }

  /** 序列化成 "A=1&B=2" */
  function stringifyComposite(obj) {
    return Object.keys(obj)
      .map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]);
      })
      .join('&');
  }

  function decodeSafe(s) {
    try {
      return decodeURIComponent(s);
    } catch (e) {
      return s;
    }
  }

  /**
   * 写入 WEBTHEME=2 + PREFCOL=<系统实时值>，其余键原样保留。
   * 返回 true 表示本次确实发生了变更。
   */
  function applyThemeCookie() {
    var pref = systemIsDark() ? COL_DARK : COL_LIGHT;
    var cookie = readCompositeCookie();

    if (
      cookie[K_WEBTHEME] === THEME_SYSTEM &&
      cookie[K_PREFCOL] === pref
    ) {
      return false; // 已是目标状态，不重复写
    }

    cookie[K_WEBTHEME] = THEME_SYSTEM;
    cookie[K_PREFCOL] = pref;

    // 旧版 Bing 用 THEME 键，一并同步，避免被页面回写成旧值
    if (cookie['THEME'] !== undefined) {
      cookie['THEME'] = THEME_SYSTEM;
    }

    var value = COOKIE_NAME + '=' + stringifyComposite(cookie);

    // 双写：当前主机（覆盖 .bing.com 上已有的旧 cookie）+ 全域
    writeCookie(value, null);
    writeCookie(value, '.bing.com');

    console.log(
      LOG_PREFIX + '已应用系统默认主题，PREFCOL=' + pref
    );

    return true;
  }

  function writeCookie(value, domain) {
    var parts = [
      value,
      'path=/',
      'max-age=' + COOKIE_MAX_AGE,
      'SameSite=Lax'
    ];
    if (domain) parts.push('domain=' + domain);
    document.cookie = parts.join('; ');
  }

  // ── 1. 首屏之前就把 cookie 写好，服务端直接返回正确的 b_dark ──
  var changed = applyThemeCookie();

  // ── 2. 同步 body.b_dark，避免已打开的页面停留在错误主题 ──
  function syncBodyClass() {
    if (!document.body) return;
    if (systemIsDark()) {
      document.body.classList.add('b_dark');
    } else {
      document.body.classList.remove('b_dark');
    }
  }

  function boot() {
    applyThemeCookie();
    syncBodyClass();
  }

  if (document.body) {
    boot();
  } else {
    // document-start 阶段 body 还不存在，等最早可用的时机
    document.addEventListener('DOMContentLoaded', boot, { once: true });
    document.addEventListener('readystatechange', function onReady() {
      if (document.readyState === 'interactive' || document.readyState === 'complete') {
        document.removeEventListener('readystatechange', onReady);
        boot();
      }
    });
  }

  // ── 3. 系统深浅色切换时实时跟随（无需刷新） ──
  if (darkQuery) {
    var onSchemeChange = function () {
      var wasChanged = applyThemeCookie();
      syncBodyClass();
      if (wasChanged) {
        // cookie 变了但当前 DOM 的深色 CSS 是按旧主题注入的，刷新一次最稳妥
        // 用 replace 避免在历史里留下记录
        window.location.replace(window.location.href);
      }
    };

    if (typeof darkQuery.addEventListener === 'function') {
      darkQuery.addEventListener('change', onSchemeChange);
    } else if (typeof darkQuery.addListener === 'function') {
      // 老版 WebKit
      darkQuery.addListener(onSchemeChange);
    }
  }

  // ── 4. Bing 有时会在 SPA 跳转后重置外观，兜底纠正一次 ──
  var lastKnown = systemIsDark() ? COL_DARK : COL_LIGHT;
  setInterval(function () {
    var cookie = readCompositeCookie();
    var pref = systemIsDark() ? COL_DARK : COL_LIGHT;

    if (
      cookie[K_WEBTHEME] !== THEME_SYSTEM ||
      cookie[K_PREFCOL] !== pref ||
      lastKnown !== pref
    ) {
      lastKnown = pref;
      applyThemeCookie();
      syncBodyClass();
    }
  }, 3000);
})();
