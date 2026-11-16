// The one stylesheet, served at /app.css (ADR 0053). Outage Light: a white map app in the manner of Google Maps. The street
// map fills the screen; a search box, filter chips and round controls float on it with soft shadows; a side panel on a
// computer, a bottom sheet on a phone. System font, white surfaces, one blue, the four power colours. Colours come from
// core/shared/design/tokens.json through tokens.gen.ts, the same file the Android theme is built from.
import { TOKENS_CSS } from './tokens.gen.ts';

const BASE = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:var(--c-paper);color:var(--c-ink);font:400 1rem/1.5 var(--font);-webkit-font-smoothing:antialiased}
h1,h2,h3,p{margin:0}
a{color:var(--c-accent);text-decoration:none}
a:hover{text-decoration:underline}
button,input,select{font:inherit;color:inherit}
button{cursor:pointer}
:focus-visible{outline:2px solid var(--c-focus);outline-offset:2px}
.ico{width:20px;height:20px;fill:currentColor;flex:none}
.visually-hidden{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.container{max-width:1160px;margin:0 auto;padding:0 20px}
.sub{color:var(--c-muted);font-size:.875rem}
.tag{display:inline-flex;align-items:center;padding:0 8px;height:20px;border-radius:10px;background:var(--c-paper-3);color:var(--c-ink-2);font-size:.75rem;font-weight:500;vertical-align:middle}
.wordmark{height:22px;width:auto;display:block}
.wordmark .wm{fill:var(--c-accent)}
.brand{display:inline-flex;align-items:center;min-height:44px;color:var(--c-ink)}
.brand .wordmark{height:26px}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;flex:none;background:var(--map-nodata)}
.dot[data-state="NORMAL"],.sw[data-state="NORMAL"]{background:var(--map-normal)}
.dot[data-state="POSSIBLE"],.sw[data-state="POSSIBLE"]{background:var(--map-possible)}
.dot[data-state="CONFIRMED"],.sw[data-state="CONFIRMED"]{background:var(--map-confirmed)}
.dot[data-state="RESTORED"],.sw[data-state="RESTORED"]{background:var(--map-restored)}
.sw{display:inline-block;width:12px;height:12px;border-radius:3px;background:var(--map-nodata);opacity:.85}
.sw.blue{background:var(--c-accent)}
.sw.amber{background:var(--c-possible)}
.sw.dash{height:0;border-top:2px dashed var(--c-ink);border-radius:0;width:16px;opacity:1}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 20px;border-radius:20px;border:1px solid transparent;font-weight:500;font-size:.875rem;letter-spacing:.01em;text-decoration:none;white-space:nowrap}
.btn:hover{text-decoration:none}
.btn .ico{width:18px;height:18px}
.btn.primary{background:var(--c-accent);color:var(--c-accent-ink)}
.btn.primary:hover{background:#185ed1;box-shadow:0 1px 3px rgba(60,64,67,.3)}
.btn.primary:disabled{background:var(--c-paper-3);color:var(--c-muted);box-shadow:none;cursor:default}
.btn.tonal{background:var(--c-accent-2);color:#0b57d0}
.btn.tonal:hover{background:#d3e3fd}
.btn.tonal[aria-pressed="true"]{background:#0b57d0;color:#fff}
.btn.outline{border-color:var(--c-rule-2);color:#0b57d0;background:var(--c-paper)}
.btn.outline:hover{background:#f6f9fe}
.btn.text{color:#0b57d0;background:none}
.btn.text:hover{background:var(--c-accent-2)}
.btn.lg{min-height:48px;padding:0 24px;border-radius:24px;font-size:1rem}
.icon-btn{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:50%;border:0;background:none;color:var(--c-muted)}
.icon-btn:hover{background:var(--c-paper-2)}
.card{background:var(--c-paper);border:1px solid var(--c-rule);border-radius:var(--r-l);padding:16px}
.card.flat{border:0;background:var(--c-paper-2)}
.foot{color:var(--c-muted);font-size:.75rem;line-height:1.4;padding:8px 4px}
.noscript{position:fixed;inset:auto 16px 16px;background:#fff;padding:12px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.2)}
`;

// The app in the browser: map, floating search and chips, panel or sheet, rail or bottom bar.
const APP = `
body.sim{overflow:hidden;height:100vh;height:100dvh;display:flex;flex-direction:column}
.sim-banner{flex:none;display:flex;align-items:center;gap:8px;min-height:32px;padding:4px 16px;background:#202124;color:#e8eaed;font-size:.8125rem;line-height:1.3;z-index:30}
.sim-banner .ico{width:16px;height:16px;color:#8ab4f8}
.sim-banner p{margin:0;flex:1}
.sim-banner ul{display:flex;gap:12px;list-style:none;margin:0;padding:0}
.sim-banner a{color:#8ab4f8;white-space:nowrap}
.hide-s{color:#bdc1c6}
.app{position:relative;flex:1;min-height:0;overflow:hidden}
.app>.map,.mapcard>.map{position:absolute;inset:0;background:#e8eaed}
.maplibregl-ctrl-attrib{font:400 11px/1.4 var(--font)}
.app .maplibregl-ctrl-bottom-right{bottom:64px}
.topbar{position:absolute;z-index:10;top:12px;left:12px;right:12px;display:flex;flex-direction:column;gap:10px;pointer-events:none}
.search{position:relative;pointer-events:auto;display:flex;align-items:center;height:48px;padding:0 6px 0 16px;background:var(--c-paper);border-radius:24px;box-shadow:0 2px 4px rgba(0,0,0,.2),0 -1px 0 rgba(0,0,0,.02)}
.search-brand{display:flex;padding-right:12px;margin-right:4px;border-right:1px solid var(--c-rule)}
.search-brand .wordmark{height:18px}
.search input{flex:1;min-width:0;height:100%;border:0;background:none;padding:0 8px;font-size:1rem;outline:none}
.search input::placeholder{color:var(--c-muted)}
.search input::-webkit-search-cancel-button{display:none}
.search-ico{display:grid;place-items:center;width:40px;color:var(--c-muted)}
.suggest{position:absolute;top:52px;left:0;right:0;margin:0;padding:8px 0;list-style:none;background:var(--c-paper);border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,.18);max-height:60vh;overflow:auto}
.suggest li{display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer}
.suggest li:hover{background:var(--c-paper-2)}
.suggest li span{margin-left:auto;color:var(--c-muted);font-size:.8125rem}
.suggest li.none{color:var(--c-muted);cursor:default}
.chips{pointer-events:auto;display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:2px}
.chips::-webkit-scrollbar{display:none}
.chip{flex:none;display:inline-flex;align-items:center;height:44px;padding:0;border:0;background:none}
.chip-in{display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 14px 0 12px;border-radius:16px;background:var(--c-paper);box-shadow:0 1px 3px rgba(0,0,0,.25);font-size:.875rem;font-weight:500;color:var(--c-ink-2)}
.chip:hover .chip-in{background:var(--c-paper-2)}
.chip[aria-pressed="true"] .chip-in{background:#c2e7ff;color:#001d35}
.legend{position:absolute;z-index:4;left:12px;top:120px;display:flex;flex-direction:column;gap:6px;padding:10px 12px;background:rgba(255,255,255,.94);border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.2);font-size:.75rem;font-weight:500;color:var(--c-ink-2)}
.legend span{display:flex;align-items:center;gap:8px}
.mapctl{position:absolute;z-index:5;right:12px;bottom:240px;display:flex;flex-direction:column;gap:12px;align-items:center;transition:bottom .25s}
.fab{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;border:0;background:var(--c-paper);color:var(--c-accent);box-shadow:0 1px 4px rgba(0,0,0,.3)}
.fab:hover{background:var(--c-paper-2)}
.zoom{display:none;flex-direction:column;background:var(--c-paper);border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.3);overflow:hidden}
.zoom button{display:grid;place-items:center;width:44px;height:44px;border:0;background:none;color:var(--c-ink-2)}
.zoom button+button{border-top:1px solid var(--c-rule)}
.zoom button:hover{background:var(--c-paper-2)}
.panel{position:absolute;z-index:7;left:0;right:0;bottom:64px;height:calc(100% - 64px - 72px);background:var(--c-paper);border-radius:28px 28px 0 0;box-shadow:0 -2px 10px rgba(0,0,0,.15);display:flex;flex-direction:column;transition:transform .3s cubic-bezier(.2,0,0,1);transform:translateY(calc(100% - 180px))}
.grab{flex:none;display:grid;place-items:center;height:28px;border:0;background:none;touch-action:none}
.grab span{width:32px;height:4px;border-radius:2px;background:var(--c-rule-2)}
.panel-body{flex:1;overflow:auto;padding:0 16px 24px;display:flex;flex-direction:column;gap:12px;overscroll-behavior:contain}
.sec{font-size:.875rem;font-weight:500;color:var(--c-ink-2);padding:8px 4px 0}
.rows{list-style:none;margin:0;padding:0}
.rows.card{padding:4px 0}
.row{display:flex;align-items:center;gap:14px;width:100%;min-height:56px;padding:8px 12px;border:0;border-radius:12px;background:none;text-align:left}
.row:hover{background:var(--c-paper-2)}
.row .txt{flex:1;min-width:0;display:flex;flex-direction:column}
.row .txt b{font-weight:500;font-size:.9375rem}
.row .txt b small{font-weight:500;font-size:.6875rem;color:var(--c-accent);margin-left:6px;text-transform:uppercase;letter-spacing:.04em}
.row .txt span{color:var(--c-muted);font-size:.8125rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row .lead{display:grid;place-items:center;width:24px;color:var(--c-muted)}
.row>.ico:last-child{color:var(--c-muted)}
.st{flex:none;font-size:.75rem;font-weight:500;padding:2px 10px;border-radius:10px;background:var(--c-paper-3);color:var(--c-ink-2)}
.st[data-state="NORMAL"]{background:var(--c-normal-container);color:var(--c-on-normal-container)}
.st[data-state="POSSIBLE"]{background:var(--c-possible-container);color:var(--c-on-possible-container)}
.st[data-state="CONFIRMED"]{background:var(--c-confirmed-container);color:var(--c-on-confirmed-container)}
.st[data-state="RESTORED"]{background:var(--c-restored-container);color:var(--c-on-restored-container)}
.empty{color:var(--c-muted);padding:12px}
.spot{display:flex;flex-direction:column;gap:6px;border-radius:20px}
.spot .over{display:flex;align-items:center;gap:6px;font-size:.8125rem;font-weight:500;color:var(--c-muted)}
.spot .over .ico{width:16px;height:16px;color:var(--c-accent)}
.spot .over .tag{margin-left:auto}
.spot .big{display:flex;align-items:center;gap:10px;font-size:1.5rem;line-height:1.25;font-weight:400}
.spot .big .dot{width:14px;height:14px}
.spot[data-state="CONFIRMED"]{background:var(--c-confirmed-container);border-color:transparent}
.spot[data-state="CONFIRMED"] .big{color:var(--c-on-confirmed-container)}
.spot[data-state="POSSIBLE"]{background:var(--c-possible-container);border-color:transparent}
.spot[data-state="POSSIBLE"] .big{color:var(--c-on-possible-container)}
.spot[data-state="RESTORED"]{background:var(--c-restored-container);border-color:transparent}
.spot[data-state="RESTORED"] .big{color:var(--c-on-restored-container)}
.spot .btn{margin-top:8px;align-self:flex-start}
.track{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;list-style:none;margin:8px 0 0;padding:0;font-size:.6875rem;color:var(--c-muted)}
.track li{display:flex;flex-direction:column;gap:4px}
.track i{height:4px;border-radius:2px;background:var(--c-rule)}
.track li.done{color:var(--c-ink-2);font-weight:500}
.track li.done i{background:var(--c-ink-2)}
.metas{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
.meta{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--c-rule);background:var(--c-paper);font-size:.75rem;font-weight:500;color:var(--c-ink-2)}
.meta .ico{width:16px;height:16px;color:var(--c-muted)}
.why .h,.card .h{font-weight:500;font-size:.9375rem}
.why ul{margin:6px 0 0;padding-left:18px;font-size:.8125rem;color:var(--c-ink-2)}
.row-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.link{display:inline-flex;align-items:center;gap:2px;border:0;background:none;color:#0b57d0;font-weight:500;font-size:.875rem;padding:4px}
.link .ico{width:18px;height:18px}
.kpi{font-size:.8125rem;color:var(--c-muted);margin:4px 0 6px}
.kpi b{font-size:1.125rem;color:var(--c-ink);font-weight:500}
.mini{min-height:64px}
.area-head{display:flex;gap:8px;align-items:flex-start}
.area-head h2{font-size:1.375rem;font-weight:400;line-height:1.3}
.area-head .sub{display:flex;align-items:center;gap:8px}
.split4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.cnt{display:flex;flex-direction:column;align-items:center;padding:10px 4px;border-radius:12px;background:var(--c-paper-2)}
.cnt b{font-size:1.25rem;font-weight:500}
.cnt span{font-size:.75rem;color:var(--c-muted)}
.cnt[data-state="CONFIRMED"]{background:var(--c-confirmed-container)}
.cnt[data-state="POSSIBLE"]{background:var(--c-possible-container)}
.cnt[data-state="RESTORED"]{background:var(--c-restored-container)}
.cnt[data-state="NORMAL"]{background:var(--c-normal-container)}
.btns{display:flex;gap:8px;flex-wrap:wrap}
.facts{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;margin:10px 0 0}
.facts div{display:flex;flex-direction:column}
.facts dt{font-size:.75rem;color:var(--c-muted)}
.facts dd{margin:0;font-size:1.0625rem;font-weight:500}
.rail{position:absolute;z-index:9;left:0;right:0;bottom:0;height:64px;display:flex;justify-content:space-around;background:var(--c-paper);border-top:1px solid var(--c-rule)}
.rail button{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:0;background:none;font-size:.75rem;font-weight:500;color:var(--c-ink-2)}
.rail .pill{display:grid;place-items:center;width:56px;height:30px;border-radius:15px}
.rail button:hover .pill{background:var(--c-paper-2)}
.rail button[aria-current="page"]{color:#001d35}
.rail button[aria-current="page"] .pill{background:#c2e7ff}
.page{position:absolute;z-index:8;inset:0 0 64px 0;overflow:auto;background:var(--c-paper-2)}
.page-in{max-width:1080px;margin:0 auto;padding:20px 16px 32px;display:flex;flex-direction:column;gap:16px}
.page-in.narrow{max-width:640px}
.page-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px}
.page-head h1{font-size:1.75rem;font-weight:400;line-height:1.25}
.select{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 12px;border-radius:20px;background:var(--c-paper);border:1px solid var(--c-rule-2);color:var(--c-muted)}
.select select{border:0;background:none;font-weight:500;color:var(--c-ink);padding:0 4px;outline:none}
.tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.tile{display:flex;flex-direction:column;gap:2px;padding:14px 16px;border-radius:16px;background:var(--c-paper);border:1px solid var(--c-rule)}
.tile b{font-size:1.5rem;font-weight:400;line-height:1.2}
.tile span{font-size:.8125rem;font-weight:500;color:var(--c-ink-2)}
.tile small{font-size:.75rem;color:var(--c-muted)}
.tile[data-tone="below"] small{color:var(--c-on-possible-container)}
.tile[data-tone="met"] small{color:var(--c-on-normal-container)}
.page .card{padding:16px 16px 12px;min-width:0}
.card-head{display:flex;flex-direction:column;gap:2px;margin-bottom:10px}
.card-head.row{flex-direction:row;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:10px;min-height:0;padding:0}
.card-head.row:hover{background:none}
.card-head h2{font-size:1.0625rem;font-weight:500}
.two{display:grid;gap:16px}
.plot{width:100%;min-width:0;overflow:hidden}
.chart{display:block;overflow:visible}
.chart .ax{font-size:11px;fill:var(--c-muted)}
.chart .nm{font-size:13px;fill:var(--c-ink-2)}
.chart .val{font-size:12px;fill:var(--c-ink-2)}
.chart .strong{fill:var(--c-ink);font-weight:500}
.chart path[data-tip]:hover,.chart rect[data-tip]:hover{opacity:.8}
.legend-inline{display:flex;flex-wrap:wrap;gap:14px;font-size:.75rem;color:var(--c-ink-2);margin-bottom:8px}
.legend-inline span{display:inline-flex;align-items:center;gap:6px}
.ramp{display:flex;align-items:center;gap:3px;font-size:.75rem;color:var(--c-muted);margin-top:8px}
.ramp span{margin:0 6px}
.ramp span:first-child{margin-left:0}
.seg{display:inline-flex;border:1px solid var(--c-rule-2);border-radius:18px;overflow:hidden}
.seg button{height:34px;padding:0 14px;border:0;background:none;font-size:.8125rem;font-weight:500;color:var(--c-ink-2)}
.seg button+button{border-left:1px solid var(--c-rule-2)}
.seg button[aria-pressed="true"]{background:#c2e7ff;color:#001d35}
details{margin-top:8px;font-size:.8125rem}
summary{cursor:pointer;color:#0b57d0;font-weight:500;padding:4px 0}
table{width:100%;border-collapse:collapse;font-size:.8125rem}
th{text-align:left;font-weight:500;color:var(--c-muted);padding:8px 8px 8px 0;border-bottom:1px solid var(--c-rule)}
td{padding:9px 8px 9px 0;border-bottom:1px solid var(--c-paper-3);font-variant-numeric:tabular-nums}
.log+.btn{margin-top:12px}
.len{display:inline-block;padding:1px 8px;border-radius:8px;background:var(--c-paper-2)}
.len.longest{background:var(--c-confirmed-container);color:var(--c-on-confirmed-container);font-weight:500}
.tip{position:fixed;z-index:50;left:0;top:0;max-width:260px;padding:8px 10px;border-radius:8px;background:#202124;color:#fff;font-size:.8125rem;line-height:1.35;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,.3)}
.switch{flex:none;position:relative;width:36px;height:20px;border-radius:10px;background:var(--c-rule-2);transition:background .15s}
.switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:transform .15s}
[aria-checked="true"] .switch{background:var(--c-accent)}
[aria-checked="true"] .switch::after{transform:translateX(16px)}
.toast{position:absolute;z-index:40;left:50%;bottom:80px;transform:translate(-50%,20px);max-width:calc(100% - 32px);padding:12px 16px;border-radius:8px;background:#202124;color:#e8eaed;font-size:.875rem;box-shadow:0 2px 8px rgba(0,0,0,.3);opacity:0;visibility:hidden;transition:opacity .2s,transform .2s,visibility .2s}
.toast.on{opacity:1;visibility:visible;transform:translate(-50%,0)}
.notif{position:absolute;z-index:41;top:12px;left:12px;right:12px;max-width:440px;margin:0 auto;display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-radius:20px;background:var(--c-paper);box-shadow:0 4px 16px rgba(0,0,0,.25);transform:translateY(-140%);visibility:hidden;transition:transform .35s cubic-bezier(.2,0,0,1),visibility .35s}
.notif.on{transform:none;visibility:visible}
.notif-ico{display:grid;place-items:center;width:40px;height:40px;border-radius:10px;background:var(--c-accent);flex:none}
.notif-ico .wordmark{height:9px}
.notif-ico .wordmark .wm{fill:#fff}
.notif div{display:flex;flex-direction:column;font-size:.875rem}
.notif b{font-weight:500}
.notif span{color:var(--c-muted)}
.scrim{position:absolute;z-index:45;inset:0;display:grid;place-items:center;padding:16px;background:rgba(32,33,36,.32)}
.dialog{width:min(400px,100%);display:flex;flex-direction:column;gap:14px;padding:24px;border-radius:28px;background:var(--c-paper);box-shadow:0 8px 28px rgba(0,0,0,.28)}
.dialog h2{font-size:1.5rem;font-weight:400;line-height:1.3}
.dialog .wm .wordmark{height:28px}
.dialog p{color:var(--c-ink-2);font-size:.9375rem}
.dialog .note{display:flex;gap:12px;padding:12px;border-radius:12px;background:var(--c-paper-2)}
.dialog .note .ico{color:var(--c-accent)}
.dialog .note p{font-size:.8125rem}
.dialog .acts{display:flex;flex-direction:column;gap:8px;margin-top:4px}
.dialog .acts .btn{min-height:44px;border-radius:22px}
.perm{align-items:center;text-align:center}
.perm>.ico{width:28px;height:28px;color:var(--c-accent)}
.perm .h{font-size:1.125rem;font-weight:400;color:var(--c-ink)}
.perm .stack{display:flex;flex-direction:column;gap:8px;width:100%}
.perm .btn{width:100%;min-height:44px;border-radius:22px}
.perm .sub{font-size:.75rem}
.alarm{position:absolute;z-index:46;inset:0;display:grid;place-items:center;padding:16px;background:rgba(0,131,143,.94)}
.alarm-card{width:min(380px,100%);display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;color:#fff}
.alarm-card h2{font-size:2rem;font-weight:400}
.alarm-card .sub{color:#e0f4f5}
.halo{display:grid;place-items:center;width:96px;height:96px;border-radius:50%;background:rgba(255,255,255,.18);animation:pulse 1.4s ease-in-out infinite}
.halo .ico{width:44px;height:44px}
.alarm .btn.primary{background:#fff;color:#005b63;min-height:52px;padding:0 32px;border-radius:26px;margin-top:12px}
@keyframes pulse{50%{transform:scale(1.08);background:rgba(255,255,255,.3)}}
.app.intro .panel,.app.intro .mapctl,.app.intro .legend{visibility:hidden}
@media (min-width:600px){.tiles{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (min-width:900px){
  .rail{top:0;bottom:0;right:auto;width:80px;height:auto;flex-direction:column;justify-content:flex-start;gap:12px;padding-top:16px;border-top:0;border-right:1px solid var(--c-rule)}
  .rail button{flex:none;height:64px}
  .panel{left:80px;right:auto;top:0;bottom:0;width:408px;height:auto;border-radius:0;box-shadow:2px 0 8px rgba(0,0,0,.12);transform:none!important}
  .grab{display:none}
  .panel-body{padding:76px 16px 24px}
  .topbar{top:12px;left:92px;right:76px;flex-direction:row;align-items:center;gap:12px}
  .search{flex:none;width:384px}
  .legend{left:auto;right:12px;top:auto;bottom:196px}
  .mapctl{bottom:40px!important}
  .zoom{display:flex}
  .app .maplibregl-ctrl-bottom-right{bottom:0}
  .page{inset:0 0 0 80px}
  .page-in{padding:28px 32px 40px}
  .tiles{grid-template-columns:repeat(5,minmax(0,1fr))}
  .two{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  .toast{bottom:24px;left:calc(488px + (100% - 488px) / 2)}
  .notif{left:auto;right:16px;margin:0}
}
@media (max-width:899px){.hide-s{display:none}.legend{display:none}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

// The landing page.
const LANDING = `
.nav{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.96);border-bottom:1px solid var(--c-rule)}
.nav .container{display:flex;align-items:center;gap:16px;height:64px}
.nav .links{display:flex;align-items:center;gap:4px;margin-left:auto}
.nav .links a:not(.btn){display:inline-flex;align-items:center;min-height:44px;padding:0 12px;border-radius:18px;color:var(--c-ink-2);font-size:.875rem;font-weight:500}
.nav .links a:not(.btn):hover{background:var(--c-paper-2);text-decoration:none}
.hero{padding:40px 0 24px}
.hero .container{display:grid;gap:28px}
.hero h1{font-size:clamp(2.25rem,5.5vw,3.6rem);line-height:1.08;font-weight:400;letter-spacing:-.02em;max-width:15ch}
.hero .lead{font-size:1.125rem;color:var(--c-ink-2);max-width:46ch;margin-top:16px}
.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}
.mapcard{position:relative;height:min(62vh,520px);min-height:360px;border-radius:28px;overflow:hidden;border:1px solid var(--c-rule);box-shadow:0 1px 3px rgba(60,64,67,.15)}
.mapcard .float{position:absolute;z-index:3;left:12px;top:12px;right:12px;display:flex;flex-wrap:wrap;gap:8px;pointer-events:none}
.mapcard .pillbox{display:inline-flex;align-items:center;gap:10px;height:40px;padding:0 16px;background:#fff;border-radius:20px;box-shadow:0 1px 4px rgba(0,0,0,.25);font-size:.875rem;font-weight:500}
.mapcard .pillbox .wordmark{height:16px}
.mapcard .legend{top:12px;bottom:auto;left:auto;right:12px;flex-direction:row;flex-wrap:wrap;display:flex}
.section{padding:56px 0}
.section.alt{background:var(--c-paper-2)}
.section h2{font-size:clamp(1.75rem,3.5vw,2.5rem);font-weight:400;line-height:1.15;letter-spacing:-.01em;max-width:24ch}
.section .lead{color:var(--c-ink-2);font-size:1.0625rem;margin-top:12px;max-width:60ch}
.steps{display:grid;gap:16px;margin-top:32px;list-style:none;padding:0;counter-reset:s}
.steps li{padding:20px;border-radius:20px;background:var(--c-paper);border:1px solid var(--c-rule)}
.steps li::before{counter-increment:s;content:counter(s);display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--c-accent-2);color:#0b57d0;font-weight:500;margin-bottom:12px}
.steps h3,.feat h3{font-size:1.0625rem;font-weight:500}
.steps p,.feat p{color:var(--c-ink-2);font-size:.9375rem;margin-top:6px}
.steps time{display:block;font-size:.75rem;color:var(--c-muted);font-variant-numeric:tabular-nums;margin-top:10px}
.feats{display:grid;gap:16px;margin-top:32px;list-style:none;padding:0}
.feat{display:flex;gap:16px;padding:20px;border-radius:20px;background:var(--c-paper);border:1px solid var(--c-rule)}
.feat .ico-wrap{display:grid;place-items:center;flex:none;width:44px;height:44px;border-radius:12px;background:var(--c-accent-2);color:#0b57d0}
.preview{display:grid;gap:16px;margin-top:28px}
.preview .card{padding:20px;min-width:0}
.preview h3{font-size:1.0625rem;font-weight:500}
.stores{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}
.store{display:inline-flex;align-items:center;gap:12px;min-height:56px;padding:8px 22px 8px 16px;border-radius:16px;background:#202124;color:#fff}
.store:hover{background:#3c4043;text-decoration:none}
.store .ico{width:26px;height:26px}
.store span{display:flex;flex-direction:column;line-height:1.2}
.store small{font-size:.6875rem;color:#bdc1c6}
.store b{font-weight:500;font-size:1rem}
.get .muted{color:var(--c-muted);font-size:.875rem;margin-top:16px}
@media (max-width:599px){.nav .links a:not(.btn){display:none}.mapcard .legend{top:64px;right:auto;left:12px}}
@media (min-width:900px){
  .hero{padding:56px 0 32px}
  .hero .container{grid-template-columns:minmax(0,5fr) minmax(0,7fr);align-items:center;gap:40px}
  .steps{grid-template-columns:repeat(4,1fr)}
  .feats{grid-template-columns:1fr 1fr}
  .preview{grid-template-columns:minmax(0,3fr) minmax(0,2fr)}
}
`;

// The public area pages (areas/pages.ts, site/layout.ts).
const AREAS = `
.site-top{border-bottom:1px solid var(--c-rule);background:#fff}
.site-top .container{display:flex;align-items:center;gap:16px;min-height:64px;flex-wrap:wrap}
.site-top nav{display:flex;align-items:center;gap:4px 16px;flex-wrap:wrap;margin-left:auto;font-size:.875rem}
.site-top nav a:not(.btn){display:inline-flex;align-items:center;min-height:44px;padding:0 4px}
.site{padding-top:24px;padding-bottom:48px;max-width:860px}
.site h1{font-size:2rem;font-weight:400;line-height:1.2;margin-bottom:12px}
.site h2{font-size:1.25rem;font-weight:500;margin:28px 0 8px}
.site p{margin:8px 0;color:var(--c-ink-2)}
.site .btn{margin:4px 8px 4px 0}
.site .btn:not(.alt){background:var(--c-accent);color:#fff}
.site .btn.alt{border-color:var(--c-rule-2);color:#0b57d0;background:#fff}
.site .list{padding-left:20px}
.site .list li{margin:6px 0}
.site .plain{list-style:none;padding:0}
.site .plain li{padding:10px 0;border-bottom:1px solid var(--c-paper-3)}
.site .note{color:var(--c-muted);font-size:.875rem}
.site .chip{height:24px;padding:0 10px;box-shadow:none;background:var(--c-paper-3);font-size:.75rem;margin-right:6px}
.site .chip[data-state="NORMAL"],.state[data-state="NORMAL"]{background:var(--c-normal-container);color:var(--c-on-normal-container)}
.site .chip[data-state="POSSIBLE"],.state[data-state="POSSIBLE"]{background:var(--c-possible-container);color:var(--c-on-possible-container)}
.site .chip[data-state="CONFIRMED"],.state[data-state="CONFIRMED"]{background:var(--c-confirmed-container);color:var(--c-on-confirmed-container)}
.site .chip[data-state="RESTORED"],.state[data-state="RESTORED"]{background:var(--c-restored-container);color:var(--c-on-restored-container)}
.state{padding:20px;border-radius:20px;background:var(--c-paper-2);margin:16px 0}
.state .label{font-size:1.5rem;color:inherit;margin:0}
.state .sentence{color:inherit}
.site svg.map{width:100%;height:auto;border-radius:16px;background:var(--c-paper-2)}
.site-foot{border-top:1px solid var(--c-rule);padding:28px 0;color:var(--c-muted);font-size:.8125rem}
.site-foot .container{display:flex;flex-wrap:wrap;gap:12px 24px;align-items:center}
.site-foot a{color:var(--c-ink-2)}
.site-foot ul{display:flex;flex-wrap:wrap;gap:4px 18px;list-style:none;margin:0;padding:0}
.site-foot small{flex-basis:100%;line-height:1.5;font-size:.75rem}
`;

export const APP_CSS = `/* Outage Light (ADR 0053). Colours: core/shared/design/tokens.json. */\n${TOKENS_CSS}${BASE}${APP}${LANDING}${AREAS}`;
