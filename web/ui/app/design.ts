// The one stylesheet, served at /app.css (ADR 0054). Outage Premium: calm white surfaces, Inter, an 8-point spacing
// scale, hairline borders, soft layered shadows, glass panels over the map, restrained motion (200 to 300 ms, ease out,
// no bounce), fully responsive from 320 px phones to wide screens. Colours come from core/shared/design/tokens.json
// through tokens.gen.ts, the same file the Android theme is built from.
import { TOKENS_CSS } from './tokens.gen.ts';

const BASE = `
@font-face{font-family:Inter;font-style:normal;font-weight:100 900;font-display:swap;src:url(/fonts/inter-latin.woff2) format("woff2")}
:root{--ease:cubic-bezier(.2,.8,.2,1);--sh-1:0 1px 2px rgba(16,24,40,.05);--sh-2:0 1px 2px rgba(16,24,40,.04),0 4px 12px rgba(16,24,40,.06);--sh-3:0 2px 4px rgba(16,24,40,.04),0 12px 32px rgba(16,24,40,.10);--sh-4:0 4px 8px rgba(16,24,40,.04),0 24px 64px rgba(16,24,40,.16);--glass:rgba(255,255,255,.86);--hair:rgba(11,13,18,.08)}
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--c-paper);color:var(--c-ink);font:400 1rem/1.55 var(--font);font-feature-settings:"cv11","ss01";-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
h1,h2,h3,p{margin:0}
h1,h2,h3{letter-spacing:-.022em;font-weight:600;color:var(--c-ink)}
a{color:var(--c-accent);text-decoration:none}
button,input,select{font:inherit;color:inherit}
button{cursor:pointer;-webkit-tap-highlight-color:transparent}
:focus-visible{outline:2px solid var(--c-focus);outline-offset:2px;border-radius:6px}
::selection{background:var(--c-accent-2)}
.ico{width:20px;height:20px;fill:currentColor;flex:none}
.visually-hidden{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.container{width:100%;max-width:1200px;margin:0 auto;padding:0 24px}
.container.narrow{max-width:760px}
.wordmark{height:22px;width:auto;display:block}
.wordmark .wm{fill:var(--c-accent)}
.brand{display:inline-flex;align-items:center;min-height:44px}
.brand .wordmark{height:24px}
.sub{color:var(--c-muted);font-size:.875rem}
.fine{color:var(--c-muted);font-size:.75rem;line-height:1.5}
.fine.pad{padding:4px 4px 8px}
.tag{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:6px;background:var(--c-paper-3);color:var(--c-muted);font-size:.6875rem;font-weight:500;letter-spacing:.01em;vertical-align:middle}
.tag.dark{background:rgba(255,255,255,.12);color:#fff}
.eyebrow,.eyebrow-s{font-size:.75rem;font-weight:600;color:var(--c-accent);letter-spacing:.02em}
.eyebrow-s{color:var(--c-muted);font-weight:500}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;flex:none;background:var(--map-nodata)}
.dot.lg{width:12px;height:12px;box-shadow:0 0 0 4px color-mix(in srgb,currentColor 0%,transparent)}
.dot[data-state="NORMAL"],.sw[data-state="NORMAL"]{background:var(--map-normal)}
.dot[data-state="POSSIBLE"],.sw[data-state="POSSIBLE"]{background:var(--map-possible)}
.dot[data-state="CONFIRMED"],.sw[data-state="CONFIRMED"]{background:var(--map-confirmed)}
.dot[data-state="RESTORED"],.sw[data-state="RESTORED"]{background:var(--map-restored)}
.sw{display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--map-nodata)}
.sw.blue{background:var(--c-accent)}
.sw.amber{background:#f59e0b}
.sw.dash{height:0;border-top:2px dashed var(--c-ink);border-radius:0;width:14px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:12px;border:1px solid transparent;font-weight:500;font-size:.9375rem;letter-spacing:-.005em;white-space:nowrap;text-decoration:none;transition:background .2s var(--ease),box-shadow .2s var(--ease),transform .2s var(--ease)}
.btn .ico{width:18px;height:18px}
.btn:active{transform:translateY(1px)}
.btn.lg{min-height:52px;padding:0 22px;border-radius:14px;font-size:1rem}
.btn.primary{background:var(--c-accent);color:#fff;box-shadow:0 1px 2px rgba(27,110,243,.3),inset 0 1px 0 rgba(255,255,255,.18)}
.btn.primary:hover{background:#155fdb}
.btn.primary:disabled{background:var(--c-paper-3);color:var(--c-muted);box-shadow:none;cursor:default}
.btn.dark{background:var(--c-ink);color:#fff}
.btn.dark:hover{background:#23262e}
.btn.secondary{background:var(--c-paper);border-color:var(--c-rule);color:var(--c-ink);box-shadow:var(--sh-1)}
.btn.secondary:hover{border-color:var(--c-rule-2)}
.btn.ghost{background:transparent;color:var(--c-ink)}
.btn.ghost:hover{background:var(--c-paper-3)}
.btn.light{background:#fff;color:var(--c-ink)}
.icon-btn{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:12px;border:0;background:none;color:var(--c-muted);transition:background .2s var(--ease)}
.icon-btn:hover{background:var(--c-paper-3);color:var(--c-ink)}
.card{background:var(--c-paper);border:1px solid var(--c-rule);border-radius:var(--r-l);padding:16px}
.glass{background:var(--glass);-webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);border:1px solid var(--hair);box-shadow:var(--sh-3)}
.tip{position:fixed;z-index:60;left:0;top:0;max-width:260px;padding:8px 10px;border-radius:10px;background:var(--c-ink);color:#fff;font-size:.8125rem;line-height:1.35;pointer-events:none;box-shadow:var(--sh-3)}
.noscript{position:fixed;inset:auto 16px 16px;background:#fff;padding:12px;border-radius:12px;box-shadow:var(--sh-3)}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
`;

// Charts, shared by the app and the landing page.
const CHARTS = `
.plot{width:100%;min-width:0;overflow:hidden}
.chart{display:block;overflow:visible}
.chart .ax{font-size:11px;fill:var(--c-muted);font-feature-settings:"tnum"}
.chart .val{font-size:12px;fill:var(--c-ink-2)}
.chart .strong{fill:var(--c-ink);font-weight:600}
.chart path[data-tip]:hover,.chart rect[data-tip]:hover{opacity:.82}
.legend-inline{display:flex;flex-wrap:wrap;gap:16px;font-size:.75rem;color:var(--c-ink-2);margin-bottom:8px}
.legend-inline span{display:inline-flex;align-items:center;gap:6px}
.ramp{display:flex;align-items:center;gap:3px;font-size:.75rem;color:var(--c-muted);margin-top:12px}
.ramp span{margin:0 6px}
.ramp span:first-child{margin-left:0}
`;

// The app in the browser.
const APP = `
body.sim{overflow:hidden;height:100vh;height:100dvh;display:flex;flex-direction:column;background:var(--c-paper-2)}
.sim-banner{flex:none;display:flex;align-items:center;gap:16px;min-height:36px;padding:4px 16px;background:var(--c-ink);color:rgba(255,255,255,.72);font-size:.8125rem;line-height:1.3;z-index:30}
.sim-banner p{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sim-banner .tag{display:none}
.sim-banner ul{display:flex;gap:4px;list-style:none;margin:0;padding:0}
.sim-banner a{display:inline-flex;align-items:center;min-height:44px;padding:0 8px;color:#fff;font-weight:500;white-space:nowrap}
.app{position:relative;flex:1;min-height:0;overflow:hidden}
.app>.map{position:absolute;inset:0;background:#eef0f2}
.maplibregl-ctrl-attrib{font:400 11px/1.4 var(--font)!important}
.app .maplibregl-ctrl-bottom-right{bottom:72px}
.topbar{position:absolute;z-index:10;top:12px;left:12px;right:12px;pointer-events:none}
.search{position:relative;pointer-events:auto;display:flex;align-items:center;height:52px;padding:0 4px 0 14px;border-radius:16px}
.search-brand{display:flex;align-items:center;min-height:44px;padding-right:12px;margin-right:4px;border-right:1px solid var(--c-rule)}
.search-brand .wordmark{height:18px}
.search input{flex:1;min-width:0;height:100%;border:0;background:none;padding:0 8px;font-size:1rem;outline:none}
.search input::placeholder{color:var(--c-muted)}
.search input::-webkit-search-cancel-button{display:none}
.suggest{position:absolute;top:60px;left:0;right:0;margin:0;padding:6px;list-style:none;border-radius:16px;max-height:60vh;overflow:auto}
.suggest li{display:flex;align-items:center;gap:12px;padding:10px;border-radius:10px;cursor:pointer}
.suggest li:hover{background:rgba(11,13,18,.05)}
.suggest .txt{display:flex;flex-direction:column;min-width:0}
.suggest .txt b{font-weight:500}
.suggest .txt span{color:var(--c-muted);font-size:.75rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.suggest li.none{color:var(--c-muted);cursor:default}
.ico-tile{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:var(--c-paper-3);color:var(--c-ink-2);flex:none}
.legend{position:absolute;z-index:4;right:12px;top:76px;display:none;gap:12px;padding:8px 12px;border-radius:12px;font-size:.75rem;font-weight:500;color:var(--c-ink-2)}
.legend span{display:flex;align-items:center;gap:6px}
.mapctl{position:absolute;z-index:5;right:12px;bottom:260px;display:flex;flex-direction:column;gap:12px;align-items:center;transition:bottom .3s var(--ease)}
.fab{display:grid;place-items:center;width:48px;height:48px;border-radius:16px;color:var(--c-accent)}
.zoom{display:none;flex-direction:column;border-radius:14px;overflow:hidden}
.zoom button{display:grid;place-items:center;width:48px;height:44px;border:0;background:none;color:var(--c-ink-2)}
.zoom button+button{border-top:1px solid var(--c-rule)}
.panel{position:absolute;z-index:7;left:0;right:0;bottom:72px;height:calc(100% - 72px - 76px);border-radius:24px 24px 0 0;display:flex;flex-direction:column;transition:transform .35s var(--ease);transform:translateY(calc(100% - 200px));border-bottom:0}
.grab{flex:none;display:grid;place-items:center;height:28px;border:0;background:none;touch-action:none}
.grab span{width:36px;height:5px;border-radius:3px;background:var(--c-rule-2)}
.panel-body{flex:1;overflow:auto;padding:0 16px 24px;display:flex;flex-direction:column;gap:12px;overscroll-behavior:contain}
.skeleton{padding:8px 4px}
.skeleton-title{font-size:1.25rem;font-weight:600;letter-spacing:-.02em;margin:4px 0}
.place-head{padding:4px 4px 0}
.place-head h2{font-size:1.5rem;line-height:1.2;margin-top:2px}
.status{border-radius:20px;padding:16px;background:var(--c-paper);border:1px solid var(--c-rule);box-shadow:var(--sh-1);display:flex;flex-direction:column;gap:6px;transition:background .3s var(--ease),border-color .3s var(--ease)}
.status-head{display:flex;align-items:center;justify-content:space-between}
.status-word{display:flex;align-items:center;gap:10px;font-size:1.375rem;font-weight:600;letter-spacing:-.02em;line-height:1.25}
.status-sub{color:var(--c-ink-2);font-size:.875rem}
.status[data-state="CONFIRMED"]{background:var(--c-confirmed-container);border-color:transparent}
.status[data-state="CONFIRMED"] .status-word{color:var(--c-on-confirmed-container)}
.status[data-state="POSSIBLE"]{background:var(--c-possible-container);border-color:transparent}
.status[data-state="POSSIBLE"] .status-word{color:var(--c-on-possible-container)}
.status[data-state="RESTORED"]{background:var(--c-restored-container);border-color:transparent}
.status[data-state="RESTORED"] .status-word{color:var(--c-on-restored-container)}
.track{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;list-style:none;margin:8px 0 2px;padding:0;font-size:.6875rem;color:var(--c-muted)}
.track li{display:flex;flex-direction:column;gap:6px}
.track i{height:4px;border-radius:2px;background:rgba(11,13,18,.08);transition:background .3s var(--ease)}
.track li.done{color:var(--c-ink);font-weight:500}
.track li.done i{background:var(--c-ink)}
.row-btns{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px}
.chip-static{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;border-radius:10px;background:rgba(11,13,18,.05);font-size:.75rem;font-weight:500;color:var(--c-ink-2)}
.chip-static .ico{width:16px;height:16px}
.why{padding:12px 16px;border-radius:16px;background:var(--c-paper-3)}
.why .h,.card .h{font-weight:600;font-size:.875rem}
.why ul{margin:6px 0 0;padding-left:18px;font-size:.8125rem;color:var(--c-ink-2)}
.card-row{display:flex;align-items:center;justify-content:space-between;gap:8px}
.link{display:inline-flex;align-items:center;gap:2px;min-height:44px;border:0;background:none;color:var(--c-accent);font-weight:500;font-size:.875rem;padding:0 4px}
.link .ico{width:18px;height:18px}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:4px 0 12px}
.kpis div{display:flex;flex-direction:column}
.kpis b{font-size:1.125rem;font-weight:600;letter-spacing:-.02em;font-feature-settings:"tnum"}
.kpis span{font-size:.75rem;color:var(--c-muted)}
.mini{min-height:64px}
.around{display:flex;flex-wrap:wrap;gap:6px 14px;margin:8px 0 4px;font-size:.875rem;font-weight:500}
.around span{display:inline-flex;align-items:center;gap:6px}
.rail{position:absolute;z-index:9;left:0;right:0;bottom:0;height:72px;display:flex;justify-content:space-around;padding-bottom:env(safe-area-inset-bottom);background:var(--glass);-webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);border-top:1px solid var(--hair)}
.rail button{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:0;background:none;font-size:.75rem;font-weight:500;color:var(--c-muted);transition:color .2s var(--ease)}
.rail .pill{display:grid;place-items:center;width:56px;height:32px;border-radius:12px;transition:background .2s var(--ease)}
.rail button:hover{color:var(--c-ink)}
.rail button[aria-current="page"]{color:var(--c-ink)}
.rail button[aria-current="page"] .pill{background:var(--c-accent-2);color:var(--c-accent)}
.page{position:absolute;z-index:8;inset:0 0 72px 0;overflow:auto;background:var(--c-paper-2)}
.page-in{max-width:1080px;margin:0 auto;padding:24px 16px 40px;display:flex;flex-direction:column;gap:16px}
.page-in.narrow{max-width:640px}
.page-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px;padding:4px 0 8px}
.page-head h1{font-size:2rem;line-height:1.15;letter-spacing:-.03em;margin:2px 0 6px}
.seg{display:inline-flex;padding:3px;border-radius:12px;background:var(--c-paper-3)}
.seg button{min-height:38px;padding:0 14px;border:0;border-radius:9px;background:none;font-size:.8125rem;font-weight:500;color:var(--c-muted)}
.seg button[aria-pressed="true"]{background:#fff;color:var(--c-ink);box-shadow:var(--sh-1)}
.tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.tile{display:flex;flex-direction:column;gap:4px;padding:16px;border-radius:16px;background:var(--c-paper);border:1px solid var(--c-rule)}
.tile span{font-size:.8125rem;font-weight:500;color:var(--c-muted)}
.tile b{font-size:1.625rem;font-weight:600;letter-spacing:-.03em;line-height:1.15;font-feature-settings:"tnum"}
.tile small{font-size:.75rem;color:var(--c-muted)}
.tile[data-tone="below"] small{color:var(--c-on-possible-container)}
.tile[data-tone="met"] small{color:var(--c-on-normal-container)}
.page .card{padding:20px;border-radius:20px;min-width:0}
.card-head{display:flex;flex-direction:column;gap:2px;margin-bottom:12px}
.card-head h2{font-size:1.0625rem}
.two{display:grid;gap:16px}
details{margin-top:12px;font-size:.8125rem}
summary{cursor:pointer;color:var(--c-accent);font-weight:500;min-height:44px;display:flex;align-items:center}
table{width:100%;border-collapse:collapse;font-size:.8125rem;font-feature-settings:"tnum"}
th{text-align:left;font-weight:500;color:var(--c-muted);padding:10px 8px 10px 0;border-bottom:1px solid var(--c-rule)}
td{padding:11px 8px 11px 0;border-bottom:1px solid var(--c-paper-3)}
.log+.btn{margin-top:12px}
.len{display:inline-block;padding:2px 8px;border-radius:7px;background:var(--c-paper-3)}
.len.longest{background:var(--c-confirmed-container);color:var(--c-on-confirmed-container);font-weight:500}
.group{font-size:.8125rem;font-weight:500;color:var(--c-muted);padding:16px 4px 6px}
.list{list-style:none;margin:0;padding:4px;background:var(--c-paper);border:1px solid var(--c-rule);border-radius:16px}
.row{display:flex;align-items:center;gap:14px;width:100%;min-height:60px;padding:8px 12px;border:0;border-radius:12px;background:none;text-align:left;transition:background .2s var(--ease)}
.row:hover{background:var(--c-paper-2)}
.row .txt{flex:1;min-width:0;display:flex;flex-direction:column}
.row .txt b{font-weight:500;font-size:.9375rem}
.row .txt span{color:var(--c-muted);font-size:.8125rem}
.row .lead{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:var(--c-paper-3);color:var(--c-ink-2)}
.row>.ico:last-child{color:var(--c-rule-2)}
.switch{flex:none;position:relative;width:44px;height:26px;border-radius:13px;background:var(--c-rule-2);transition:background .2s var(--ease)}
.switch::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:var(--sh-1);transition:transform .2s var(--ease)}
[aria-checked="true"] .switch{background:var(--c-normal)}
[aria-checked="true"] .switch::after{transform:translateX(18px)}
.empty-state{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;padding:64px 16px}
.empty-state>.ico{width:40px;height:40px;color:var(--c-accent)}
.empty-state h1{font-size:1.5rem}
.empty-state p{color:var(--c-muted);max-width:40ch}
.toast{position:absolute;z-index:40;left:50%;bottom:96px;transform:translate(-50%,12px);max-width:calc(100% - 32px);padding:12px 16px;border-radius:12px;background:var(--c-ink);color:#fff;font-size:.875rem;box-shadow:var(--sh-3);opacity:0;visibility:hidden;transition:opacity .25s var(--ease),transform .25s var(--ease),visibility .25s}
.toast.on{opacity:1;visibility:visible;transform:translate(-50%,0)}
.notif{position:absolute;z-index:41;top:12px;left:12px;right:12px;max-width:420px;margin:0 auto;display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-radius:20px;transform:translateY(calc(-100% - 24px));visibility:hidden;transition:transform .4s var(--ease),visibility .4s}
.notif.on{transform:none;visibility:visible}
.notif-ico{display:grid;place-items:center;width:40px;height:40px;border-radius:11px;background:var(--c-accent);flex:none}
.notif-ico .wordmark{height:9px}
.notif-ico .wordmark .wm{fill:#fff}
.notif div{flex:1;display:flex;flex-direction:column;font-size:.875rem;min-width:0}
.notif b{font-weight:600}
.notif span{color:var(--c-ink-2)}
.notif time{font-size:.75rem;color:var(--c-muted)}
.scrim{position:absolute;z-index:45;inset:0;display:grid;place-items:center;padding:16px;background:rgba(11,13,18,.28);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}
.dialog{width:min(420px,100%);display:flex;flex-direction:column;gap:14px;padding:28px;border-radius:28px;background:var(--c-paper);box-shadow:var(--sh-4)}
.dialog-icon{display:grid;place-items:center;width:52px;height:52px;border-radius:16px;background:var(--c-accent-2);color:var(--c-accent)}
.dialog-icon .ico{width:26px;height:26px}
.dialog h2{font-size:1.5rem;line-height:1.2}
.dialog p{color:var(--c-ink-2);font-size:.9375rem}
.dialog .acts{display:flex;flex-direction:column;gap:8px;margin-top:6px}
.alarm{position:absolute;z-index:46;inset:0;display:grid;place-items:center;padding:16px;background:linear-gradient(160deg,#0b5f69,#0e9fb0)}
.alarm-card{width:min(380px,100%);display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;color:#fff}
.alarm-time{font-size:4rem;font-weight:300;letter-spacing:-.04em;line-height:1;font-feature-settings:"tnum"}
.alarm-card h2{font-size:1.75rem;color:#fff}
.alarm-card p{color:rgba(255,255,255,.85)}
.halo{display:grid;place-items:center;width:84px;height:84px;border-radius:50%;background:rgba(255,255,255,.16);animation:pulse 1.6s var(--ease) infinite}
.halo .ico{width:38px;height:38px}
.alarm .btn{min-height:52px;padding:0 32px;border-radius:26px;margin-top:16px}
@keyframes pulse{50%{transform:scale(1.07);background:rgba(255,255,255,.26)}}
.app.intro .panel,.app.intro .mapctl{visibility:hidden}
.app:not([data-tab="home"]) .topbar,.app:not([data-tab="home"]) .legend,.app:not([data-tab="home"]) .mapctl{display:none}
@media (min-width:600px){.tiles{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (min-width:900px){
  .rail{top:0;bottom:0;right:auto;width:84px;height:auto;flex-direction:column;justify-content:flex-start;gap:8px;padding:16px 0 0;border-top:0;border-right:1px solid var(--hair)}
  .rail button{flex:none;height:68px}
  .topbar{top:16px;left:100px;right:auto;width:400px}
  .panel{left:100px;right:auto;top:84px;bottom:16px;width:400px;height:auto;border-radius:24px;transform:none!important;border-bottom:1px solid var(--hair)}
  .grab{display:none}
  .panel-body{padding:16px}
  .legend{display:flex;top:16px}
  .mapctl{bottom:40px!important;right:16px}
  .zoom{display:flex}
  .app .maplibregl-ctrl-bottom-right{bottom:0}
  .page{inset:0 0 0 84px}
  .page-in{padding:40px 40px 56px}
  .tiles{grid-template-columns:repeat(5,minmax(0,1fr))}
  .two{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  .toast{bottom:32px;left:calc(84px + 432px + (100% - 516px)/2)}
  .notif{left:auto;right:16px;top:16px;margin:0}
}
@media (max-width:899px){.hide-s{display:none}}
@media (max-width:599px){.sim-banner li:first-child{display:none}.sim-banner{gap:8px}}
`;

// The landing page.
const LANDING = `
body.landing{background:var(--c-paper)}
.nav{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.8);-webkit-backdrop-filter:saturate(180%) blur(16px);backdrop-filter:saturate(180%) blur(16px);border-bottom:1px solid var(--hair)}
.nav-in{display:flex;align-items:center;gap:24px;height:68px}
.nav .links{display:none;gap:4px;margin-left:16px}
.nav .links a{display:inline-flex;align-items:center;min-height:44px;padding:0 12px;border-radius:10px;color:var(--c-ink-2);font-size:.9375rem;font-weight:500}
.nav .links a:hover{background:var(--c-paper-3);color:var(--c-ink)}
.nav-cta{display:flex;gap:8px;margin-left:auto}
.hero{position:relative;overflow:hidden;padding:48px 0 32px;background:radial-gradient(1200px 500px at 70% -10%,#eaf1fe 0%,rgba(234,241,254,0) 60%),radial-gradient(800px 400px at 0% 0%,#f3f6fb 0%,rgba(243,246,251,0) 70%)}
.hero-in{display:grid;gap:48px;align-items:center}
.pill-note{display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 12px;border-radius:999px;background:#fff;border:1px solid var(--c-rule);box-shadow:var(--sh-1);font-size:.8125rem;font-weight:500;color:var(--c-ink-2)}
.pill-note span{width:8px;height:8px;border-radius:50%;background:var(--map-normal);box-shadow:0 0 0 3px #e9f7ef}
.hero h1{font-size:clamp(2.5rem,6.2vw,4.25rem);line-height:1.04;letter-spacing:-.04em;margin:20px 0 20px;max-width:15ch}
.lead{font-size:1.125rem;line-height:1.6;color:var(--c-ink-2);max-width:52ch}
.badges{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px}
.badge{position:relative;display:inline-flex;align-items:center;height:56px;border-radius:12px;background:#000;color:#fff;transition:transform .2s var(--ease),box-shadow .2s var(--ease)}
a.badge:hover{transform:translateY(-1px);box-shadow:var(--sh-3)}
.badge-play{background:none;height:56px}
.play-img{height:84px;width:auto;margin:-14px -10px;display:block}
.badge-in{display:flex;align-items:center;gap:10px;padding:0 18px 0 14px;border:1px solid #a6a6a6;border-radius:12px;height:100%}
.badge-in svg{width:26px;height:26px}
.badge-in span{display:flex;flex-direction:column;line-height:1.1}
.badge-in small{font-size:.6875rem;font-weight:500;letter-spacing:.01em;color:#fff}
.badge-in b{font-size:1.25rem;font-weight:600;letter-spacing:-.02em}
.badge.soon{cursor:default}
.badge.soon em{position:absolute;top:-9px;right:-6px;padding:2px 7px;border-radius:999px;background:var(--c-ink);color:#fff;font-style:normal;font-size:.6875rem;font-weight:600;letter-spacing:.02em;box-shadow:var(--sh-1)}
.badge-play.soon em{top:-4px;right:-2px}
.arrow-link{display:inline-flex;align-items:center;gap:4px;min-height:44px;margin-top:16px;font-weight:500;color:var(--c-accent)}
.arrow-link .ico{width:18px;height:18px;transition:transform .2s var(--ease)}
.arrow-link:hover .ico{transform:translateX(3px)}
.arrow-link.light{color:#fff}
.hero-visual{position:relative;display:flex;justify-content:center;padding:8px 0 24px}
.phone{position:relative;width:300px;max-width:78vw;aspect-ratio:9/19.5;border-radius:48px;padding:10px;background:linear-gradient(145deg,#2a2d34,#0b0d12);box-shadow:var(--sh-4),inset 0 0 0 1.5px rgba(255,255,255,.08)}
.phone::before{content:"";position:absolute;z-index:3;top:20px;left:50%;width:84px;height:24px;border-radius:12px;background:#000;transform:translateX(-50%)}
.phone-screen{position:relative;width:100%;height:100%;border-radius:38px;overflow:hidden;background:#dfe9f6}
.phone-screen .map{position:absolute;inset:0}
.ph-search{position:absolute;z-index:2;top:56px;left:12px;right:12px;display:flex;align-items:center;gap:8px;height:40px;padding:0 12px;border-radius:12px;background:rgba(255,255,255,.9);box-shadow:var(--sh-2);font-size:.75rem;color:var(--c-muted)}
.ph-search .wordmark{height:12px;padding-right:8px;border-right:1px solid var(--c-rule)}
.ph-sheet{position:absolute;z-index:2;left:8px;right:8px;bottom:8px;padding:14px 16px 18px;border-radius:24px;background:rgba(255,255,255,.94);box-shadow:var(--sh-3)}
.ph-eyebrow{font-size:.6875rem;color:var(--c-muted);font-weight:500}
.ph-word{display:flex;align-items:center;gap:8px;font-size:1.125rem;font-weight:600;letter-spacing:-.02em;color:var(--c-on-restored-container);margin:2px 0}
.ph-sub{font-size:.75rem;color:var(--c-ink-2)}
.float-card{position:absolute;z-index:4;display:flex;gap:10px;align-items:center;padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.92);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border:1px solid var(--hair);box-shadow:var(--sh-3);font-size:.8125rem}
.fc-notif{top:18%;left:-4%;max-width:270px}
.fc-ico{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:var(--c-accent);flex:none}
.fc-ico .wordmark{height:8px}
.fc-ico .wordmark .wm{fill:#fff}
.fc-notif div{display:flex;flex-direction:column}
.fc-notif b{font-weight:600}
.fc-notif span{color:var(--c-ink-2)}
.fc-notif time{align-self:flex-start;color:var(--c-muted);font-size:.6875rem}
.fc-stat{bottom:14%;right:-2%;flex-direction:column;align-items:flex-start;gap:2px}
.fc-stat span{color:var(--c-muted);font-weight:500}
.fc-stat b{font-size:1.5rem;font-weight:600;letter-spacing:-.03em}
.fc-stat small{color:var(--c-muted)}
.facts{border-top:1px solid var(--c-rule);border-bottom:1px solid var(--c-rule);background:var(--c-paper)}
.facts-in{display:grid;grid-template-columns:repeat(2,1fr)}
.facts-in div{display:flex;flex-direction:column;gap:4px;padding:28px 16px 28px 0}
.facts b{font-size:2.25rem;font-weight:600;letter-spacing:-.04em;line-height:1}
.facts span{color:var(--c-muted);font-size:.875rem;max-width:22ch}
.section{padding:88px 0}
.section.alt{background:var(--c-paper-2)}
.section h2{font-size:clamp(2rem,4vw,2.875rem);line-height:1.08;letter-spacing:-.035em;margin:12px 0 0;max-width:20ch}
.steps{display:grid;gap:16px;margin:48px 0 0;padding:0;list-style:none}
.steps li{position:relative;padding:28px;border-radius:24px;background:var(--c-paper-2);border:1px solid var(--c-rule)}
.step-ico{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:#fff;color:var(--c-accent);box-shadow:var(--sh-2)}
.step-n{position:absolute;top:28px;right:28px;font-size:.8125rem;font-weight:600;color:var(--c-rule-2);font-feature-settings:"tnum"}
.steps h3,.tile-b h3{font-size:1.1875rem;margin:20px 0 8px}
.steps p,.tile-b p{color:var(--c-ink-2);font-size:.9375rem;line-height:1.6}
.bento{display:grid;gap:16px;margin-top:48px}
.tile-b{position:relative;overflow:hidden;padding:28px;border-radius:24px;background:var(--c-paper);border:1px solid var(--c-rule);box-shadow:var(--sh-1)}
.t-ico{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;background:var(--c-accent-2);color:var(--c-accent)}
.b-alarm{background:linear-gradient(160deg,#0b5f69,#0e9fb0);border:0;color:#fff;display:grid;gap:24px}
.b-alarm h3,.b-alarm p{color:#fff}
.b-alarm p{opacity:.85}
.b-alarm .t-ico{background:rgba(255,255,255,.16);color:#fff}
.alarm-demo{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:24px;border-radius:20px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16)}
.ad-time{font-size:3.25rem;font-weight:300;letter-spacing:-.04em;line-height:1;font-feature-settings:"tnum"}
.ad-word{font-weight:600}
.ad-btn{margin-top:10px;padding:10px 24px;border-radius:999px;background:#fff;color:#0b5f69;font-weight:600;font-size:.875rem}
.b-insights{display:grid;gap:20px}
.priv{display:grid;gap:40px;align-items:start}
.checks{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.checks li{display:flex;gap:14px;padding:20px;border-radius:18px;background:var(--c-paper-2);border:1px solid var(--c-rule);color:var(--c-ink-2);line-height:1.55}
.checks .ico{color:var(--c-normal);margin-top:2px}
.checks b{color:var(--c-ink);font-weight:600}
.faq{margin-top:32px;border-top:1px solid var(--c-rule)}
.faq details{margin:0;border-bottom:1px solid var(--c-rule);font-size:1rem}
.faq summary{list-style:none;justify-content:space-between;min-height:68px;color:var(--c-ink);font-weight:500;font-size:1.0625rem}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";font-size:1.5rem;font-weight:300;color:var(--c-muted);transition:transform .2s var(--ease)}
.faq details[open] summary::after{transform:rotate(45deg)}
.faq p{padding:0 0 22px;color:var(--c-ink-2);line-height:1.65;max-width:62ch}
.cta{padding:96px 0;background:radial-gradient(900px 400px at 50% 0%,#1d2a4a 0%,#0b0d12 70%);color:#fff;text-align:center}
.cta-in{display:flex;flex-direction:column;align-items:center}
.cta h2{font-size:clamp(2rem,4.5vw,3.25rem);letter-spacing:-.04em;line-height:1.05;color:#fff}
.cta p{color:rgba(255,255,255,.7);font-size:1.0625rem;margin-top:16px}
.cta .badges{justify-content:center}
.badges.on-dark .badge-in{border-color:rgba(255,255,255,.28)}
.badges.on-dark .badge.soon em{background:#fff;color:var(--c-ink)}
.site-foot{padding:48px 0;border-top:1px solid var(--c-rule);color:var(--c-muted);font-size:.875rem}
.foot-in{display:flex;flex-wrap:wrap;gap:24px 48px;justify-content:space-between}
.foot-in p{margin-top:4px}
.site-foot ul{display:flex;flex-wrap:wrap;gap:4px 24px;list-style:none;margin:0;padding:0}
.site-foot a{display:inline-flex;align-items:center;min-height:44px;color:var(--c-ink-2)}
.site-foot a:hover{color:var(--c-ink)}
.site-foot small{flex-basis:100%;font-size:.75rem;line-height:1.6}
@media (max-width:420px){.nav-cta .ghost{display:none}.fc-notif{left:-2%}.fc-stat{right:0}}
@media (min-width:640px){.facts-in{grid-template-columns:repeat(4,1fr)}.steps{grid-template-columns:repeat(3,1fr)}}
@media (min-width:900px){
  .nav .links{display:flex}
  .hero{padding:72px 0 56px}
  .hero-in{grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr)}
  .bento{grid-template-columns:repeat(6,1fr)}
  .bento .tile-b{grid-column:span 2}
  .bento .b-alarm{grid-column:span 3;grid-template-columns:1fr 1fr;align-items:center}
  .bento .b-insights{grid-column:span 3}
  .priv{grid-template-columns:1fr 1.2fr}
  .section{padding:112px 0}
}
`;

// The public area pages (areas/pages.ts, site/layout.ts).
const AREAS = `
.site-top{border-bottom:1px solid var(--c-rule);background:#fff}
.site-top .container{display:flex;align-items:center;gap:16px;min-height:68px;flex-wrap:wrap}
.site-top nav{display:flex;align-items:center;gap:4px 16px;flex-wrap:wrap;margin-left:auto;font-size:.9375rem}
.site-top nav a:not(.btn){display:inline-flex;align-items:center;min-height:44px;padding:0 4px;color:var(--c-ink-2)}
.site{padding-top:32px;padding-bottom:56px;max-width:860px}
.site h1{font-size:2.25rem;line-height:1.15;letter-spacing:-.03em;margin-bottom:12px}
.site h2{font-size:1.25rem;margin:32px 0 8px}
.site p{margin:8px 0;color:var(--c-ink-2)}
.site .btn{margin:4px 8px 4px 0}
.site .btn:not(.alt){background:var(--c-accent);color:#fff}
.site .btn.alt{border-color:var(--c-rule);color:var(--c-ink);background:#fff}
.site .list{padding:4px 4px 4px 24px;border:0;background:none;list-style:disc}
.site .list li{margin:6px 0}
.site .plain{list-style:none;padding:0}
.site .plain li{padding:12px 0;border-bottom:1px solid var(--c-paper-3)}
.site .note{color:var(--c-muted);font-size:.875rem}
.site .chip{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:8px;background:var(--c-paper-3);font-size:.75rem;font-weight:500;margin-right:6px}
.site .chip[data-state="NORMAL"],.state[data-state="NORMAL"]{background:var(--c-normal-container);color:var(--c-on-normal-container)}
.site .chip[data-state="POSSIBLE"],.state[data-state="POSSIBLE"]{background:var(--c-possible-container);color:var(--c-on-possible-container)}
.site .chip[data-state="CONFIRMED"],.state[data-state="CONFIRMED"]{background:var(--c-confirmed-container);color:var(--c-on-confirmed-container)}
.site .chip[data-state="RESTORED"],.state[data-state="RESTORED"]{background:var(--c-restored-container);color:var(--c-on-restored-container)}
.state{padding:24px;border-radius:20px;background:var(--c-paper-2);margin:16px 0}
.state .label{font-size:1.5rem;font-weight:600;letter-spacing:-.02em;color:inherit;margin:0}
.state .sentence{color:inherit}
.site svg.map{width:100%;height:auto;border-radius:16px;background:var(--c-paper-2)}
`;

export const APP_CSS = `/* Outage Premium (ADR 0054). Colours: core/shared/design/tokens.json. Inter: SIL OFL 1.1. */\n${TOKENS_CSS}${BASE}${CHARTS}${APP}${LANDING}${AREAS}`;
