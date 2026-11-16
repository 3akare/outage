// One Material 3 stylesheet for every page the Worker serves: landing, the app in the browser (/app/simulate) and the
// public area pages (ADR 0048). Served from the same origin at /app.css, so the CSP needs no inline style.
// Colours, type, shape and spacing come from core/shared/design/tokens.json through tools/tokens/build.mjs, the same
// source as the Android theme. Material 3 roles: https://m3.material.io/styles/color/roles
import { TOKENS_CSS } from './tokens.gen.ts';

const CSS = `
${TOKENS_CSS}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--c-background);color:var(--c-on-surface);font:var(--t-body-large);-webkit-font-smoothing:antialiased}
.space{background:radial-gradient(1200px 600px at 70% -10%,rgba(76,157,255,.16),transparent 60%),radial-gradient(900px 500px at 0% 110%,rgba(46,230,160,.08),transparent 60%),var(--c-space)}
.stars{background-image:radial-gradient(1px 1px at 12% 18%,rgba(255,255,255,.55),transparent),radial-gradient(1px 1px at 72% 34%,rgba(255,255,255,.4),transparent),radial-gradient(1.5px 1.5px at 38% 72%,rgba(255,255,255,.45),transparent),radial-gradient(1px 1px at 86% 82%,rgba(255,255,255,.35),transparent),radial-gradient(1px 1px at 56% 8%,rgba(255,255,255,.4),transparent),radial-gradient(1px 1px at 24% 52%,rgba(255,255,255,.3),transparent),radial-gradient(1.5px 1.5px at 92% 12%,rgba(255,255,255,.5),transparent);background-size:420px 420px}
a{color:var(--c-primary)}
h1,h2,h3,p,figure{margin:0}
[hidden]{display:none!important}
img,svg{display:block}
:focus-visible{outline:3px solid var(--c-primary);outline-offset:2px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

/* Type scale */
.display-l{font:var(--t-display-large);letter-spacing:-.016em}
.display-m{font:var(--t-display-medium);letter-spacing:-.01em}
.display-s{font:var(--t-display-small)}
.headline-l{font:var(--t-headline-large)}
.headline-m{font:var(--t-headline-medium)}
.headline-s{font:var(--t-headline-small)}
.title-l{font:var(--t-title-large)}
.title-m{font:var(--t-title-medium);letter-spacing:.01em}
.title-s{font:var(--t-title-small);letter-spacing:.006em}
.body-l{font:var(--t-body-large)}
.body-m{font:var(--t-body-medium)}
.body-s{font:var(--t-body-small)}
.label-l{font:var(--t-label-large);letter-spacing:.006em}
.label-m{font:var(--t-label-medium);letter-spacing:.03em}
.muted{color:var(--c-on-surface-variant)}

/* Buttons: filled, tonal, outlined, text. Full corner radius, 40 px tall, 48 px touch target. */
.btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:10px 24px;border-radius:var(--r-full);border:0;font:var(--t-label-large);letter-spacing:.006em;text-decoration:none;cursor:pointer;background:var(--c-primary);color:var(--c-on-primary);transition:box-shadow .2s,background-color .2s}
.btn::after{content:"";position:absolute;inset:-4px 0;}
.btn:hover{box-shadow:0 0 0 4px rgba(242,244,255,.08)}
.btn.tonal{background:var(--c-secondary-container);color:var(--c-on-secondary-container)}
.btn.outlined{background:transparent;color:var(--c-primary);border:1px solid var(--c-outline)}
.btn.text{background:transparent;color:var(--c-primary);padding:10px 12px}
.btn.outlined:hover,.btn.text:hover{box-shadow:none;background:color-mix(in srgb,var(--c-primary) 8%,transparent)}
.btn.lg{min-height:56px;padding:16px 28px;font:var(--t-title-medium)}
.btn.block{display:flex;width:100%}
.btn svg{width:18px;height:18px;fill:currentColor;flex:none}
.btn:disabled{background:color-mix(in srgb,var(--c-on-surface) 12%,transparent);color:color-mix(in srgb,var(--c-on-surface) 38%,transparent);box-shadow:none;cursor:default}
.icon-btn{display:inline-grid;place-items:center;width:48px;height:48px;border-radius:50%;border:0;background:transparent;color:var(--c-on-surface-variant);cursor:pointer}
.icon-btn:hover{background:color-mix(in srgb,var(--c-on-surface-variant) 8%,transparent)}
.icon-btn svg,.ico{width:24px;height:24px;fill:currentColor}
.fab{display:inline-grid;place-items:center;width:48px;height:48px;border-radius:50%;border:1px solid rgba(255,255,255,.1);background:rgba(16,22,43,.72);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);color:var(--c-on-surface);cursor:pointer}
.fab svg{width:24px;height:24px;fill:currentColor}

/* Cards */
.card{background:var(--c-surface-container-low);border:1px solid var(--c-outline-variant);border-radius:var(--r-large);padding:16px}
.card.filled{background:var(--c-surface-container-highest);box-shadow:none}
.card.outlined{background:var(--c-surface);border:1px solid var(--c-outline-variant);box-shadow:none}
.card.tonal{background:var(--c-secondary-container);color:var(--c-on-secondary-container);box-shadow:none}
.card>*+*{margin-top:8px}
.stack>*+*{margin-top:12px}

/* Chips */
.chip{display:inline-flex;align-items:center;gap:8px;min-height:32px;padding:6px 12px;border-radius:var(--r-small);border:1px solid var(--c-outline-variant);font:var(--t-label-large);color:var(--c-on-surface-variant);background:transparent;white-space:nowrap}
.chip svg{width:18px;height:18px;fill:currentColor}
.chip.sim{background:var(--c-possible-container);color:var(--c-on-possible-container);border-color:transparent}
.chip.assist{background:var(--c-surface-container-low);border-color:var(--c-outline-variant)}

/* Power state: one colour family per state, the same on every page and on the phone. Never colour alone: every state also has words. */
[data-state=NORMAL]{--st:var(--c-normal);--st-c:var(--c-normal-container);--st-on:var(--c-on-normal-container);--map:var(--map-normal)}
[data-state=POSSIBLE],[data-state=SPOT_ONLY]{--st:var(--c-possible);--st-c:var(--c-possible-container);--st-on:var(--c-on-possible-container);--map:var(--map-possible)}
[data-state=CONFIRMED]{--st:var(--c-confirmed);--st-c:var(--c-confirmed-container);--st-on:var(--c-on-confirmed-container);--map:var(--map-confirmed)}
[data-state=RESTORED]{--st:var(--c-restored);--st-c:var(--c-restored-container);--st-on:var(--c-on-restored-container);--map:var(--map-restored)}
[data-state=NO_DATA],[data-state=NO_COVERAGE],[data-state=UNKNOWN]{--st:var(--c-outline);--st-c:var(--c-surface-container-highest);--st-on:var(--c-on-surface-variant);--map:var(--map-nodata)}
.state-chip{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:4px 12px 4px 8px;border-radius:var(--r-full);background:var(--st-c);color:var(--st-on);font:var(--t-label-large);white-space:nowrap}
.state-chip::before{content:"";width:10px;height:10px;border-radius:50%;background:var(--st)}
.state-card{background:var(--st-c);color:var(--st-on);border-radius:var(--r-extra-large);padding:16px 20px;overflow:hidden}
.state-card .big{font:var(--t-headline-medium);margin-top:4px}
.state-card .sub{opacity:.85}

/* Lists */
.list{list-style:none;margin:0;padding:0}
.li{display:flex;align-items:center;gap:16px;min-height:56px;padding:8px 16px;color:inherit;text-decoration:none;width:100%;background:transparent;border:0;font:inherit;text-align:left;cursor:pointer}
button.li:hover,a.li:hover{background:color-mix(in srgb,var(--c-on-surface) 8%,transparent)}
.li .lead{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--c-secondary-container);color:var(--c-on-secondary-container)}
.li .lead svg{width:24px;height:24px;fill:currentColor}
.li .txt{flex:1;min-width:0}
.li .txt b{display:block;font:var(--t-body-large);font-weight:400}
.li .txt span{display:block;font:var(--t-body-medium);color:var(--c-on-surface-variant)}
.li .trail{flex:none;color:var(--c-on-surface-variant);font:var(--t-label-small)}
.divider{height:1px;background:var(--c-outline-variant);margin:8px 0;border:0}
.group-label{font:var(--t-title-small);color:var(--c-primary);padding:16px 16px 8px}

/* Switch */
.switch{flex:none;position:relative;width:52px;height:32px;border-radius:16px;border:2px solid var(--c-outline);background:var(--c-surface-container-highest);transition:background .2s}
.switch::after{content:"";position:absolute;top:6px;left:6px;width:16px;height:16px;border-radius:50%;background:var(--c-outline);transition:all .2s}
[aria-checked=true] .switch,.switch[aria-checked=true]{background:var(--c-primary);border-color:var(--c-primary)}
[aria-checked=true] .switch::after,.switch[aria-checked=true]::after{left:22px;top:2px;width:24px;height:24px;background:var(--c-on-primary)}

/* Top app bar and brand */
.appbar{display:flex;align-items:center;gap:4px;min-height:64px;padding:8px 4px 8px 16px}
.appbar h1{font:var(--t-title-large);flex:1}
.brand{display:inline-flex;align-items:center;gap:10px;min-height:48px;color:var(--c-on-surface);text-decoration:none;font:500 1.375rem/1.75rem var(--font);letter-spacing:-.01em}
.brand svg{width:32px;height:32px}

/* ---------- Landing ---------- */
.land{max-width:1200px;margin:0 auto;padding:0 24px}
.land-top{position:sticky;top:0;z-index:5;background:rgba(3,5,11,.6);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-bottom:1px solid rgba(255,255,255,.06)}
.land-top .in{max-width:1200px;margin:0 auto;display:flex;align-items:center;gap:8px;min-height:72px;padding:0 24px}
.land-top nav{display:flex;gap:4px;margin-left:auto;align-items:center}
.land-top nav a.link{display:inline-flex;align-items:center;min-height:48px;padding:0 12px;border-radius:var(--r-full);color:var(--c-on-surface-variant);text-decoration:none;font:var(--t-label-large)}
.land-top nav a.link:hover{background:color-mix(in srgb,var(--c-on-surface) 8%,transparent)}
.hero{display:grid;gap:40px;align-items:center;padding:32px 0 56px}
.hero .eyebrow{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px}
.hero h1{font:var(--t-display-medium);letter-spacing:-.02em;text-wrap:balance}
.hero h1 em{font-style:normal;color:var(--c-primary)}
.hero .lead{font:var(--t-title-large);font-weight:400;color:var(--c-on-surface-variant);margin-top:20px;max-width:34ch}
.cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px}
.get{margin-top:20px}
.get p{margin-bottom:8px}
.stores{display:flex;flex-wrap:wrap;gap:8px}
.store{display:inline-flex;align-items:center;gap:12px;min-height:56px;padding:8px 20px 8px 14px;border-radius:var(--r-large);background:var(--c-inverse-surface);color:var(--c-inverse-on-surface);text-decoration:none}
.store svg{width:28px;height:28px;fill:currentColor;flex:none}
.store small{display:block;font:var(--t-label-small);opacity:.8}
.store b{display:block;font:var(--t-title-medium)}
.store:hover{opacity:.92}
.hero-art{position:relative;display:grid;place-items:center;min-height:420px}
.hero-art canvas{width:min(620px,100%);aspect-ratio:1;display:block;touch-action:none;cursor:grab}

.section{padding:56px 0;border-top:1px solid var(--c-outline-variant)}
.section>h2{font:var(--t-headline-large);text-wrap:balance}
.section>p.muted{margin-top:12px;max-width:60ch;font:var(--t-body-large)}
.grid{display:grid;gap:16px;margin-top:32px}
.feat{padding:24px;border-radius:var(--r-extra-large);background:var(--c-surface-container-low);border:1px solid var(--c-outline-variant)}
.feat .ic{display:grid;place-items:center;width:48px;height:48px;border-radius:var(--r-large);background:var(--c-primary-container);color:var(--c-on-primary-container);margin-bottom:16px}
.feat .ic svg{width:24px;height:24px;fill:currentColor}
.feat h3{font:var(--t-title-large);margin-bottom:8px}
.feat p{color:var(--c-on-surface-variant)}
.step-n{display:inline-grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--c-primary);color:var(--c-on-primary);font:var(--t-title-medium);margin-bottom:16px}
.try{display:grid;gap:24px;align-items:center;padding:40px;border-radius:var(--r-extra-large);background:linear-gradient(135deg,#10183a,#0c2e24);border:1px solid rgba(255,255,255,.08)}
.try h2{font:var(--t-headline-medium)}
.try p{margin-top:8px}
.try .btn{justify-self:start}
.privacy{display:grid;gap:12px;margin-top:24px}
.privacy li{display:flex;gap:12px;align-items:flex-start}
.privacy svg{width:24px;height:24px;fill:var(--c-primary);flex:none}
.foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px 24px;padding:32px 0 48px;border-top:1px solid var(--c-outline-variant);color:var(--c-on-surface-variant)}
.foot a{color:inherit;min-height:48px;min-width:48px;justify-content:center;display:inline-flex;align-items:center}
.foot .brand{margin-right:auto}
@media(min-width:840px){.hero{grid-template-columns:1.1fr .9fr;padding:56px 0 80px}.hero h1{font:var(--t-display-large);letter-spacing:-.025em}.grid.three{grid-template-columns:repeat(3,1fr)}.grid.two{grid-template-columns:repeat(2,1fr)}.try{grid-template-columns:1fr auto}.try .btn{justify-self:end}}
@media(max-width:599px){.land-top nav a.link{display:none}.hero h1{font:var(--t-display-small)}}

/* ---------- Phone frame (landing art and the simulation on wide screens) ---------- */
.phone{position:relative;width:360px;max-width:100%;aspect-ratio:9/19.5;border-radius:48px;padding:10px;background:#0a0d18;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 30px 80px -20px rgba(76,157,255,.35),0 24px 48px -8px rgb(0 0 0/.6)}
.phone>.screen{position:relative;width:100%;height:100%;border-radius:34px;overflow:hidden;background:var(--c-surface)}
.phone::before{content:"";position:absolute;z-index:3;top:20px;left:50%;width:22px;height:22px;margin-left:-11px;border-radius:50%;background:#000}

/* ---------- The app (Home map, sheet, Insights, Settings) ---------- */
.app{position:relative;height:100%;display:flex;flex-direction:column;background:var(--c-surface);overflow:hidden}
.app .view{position:relative;flex:1;min-height:0;overflow:auto}
.app .view.map{overflow:hidden}
.statusbar{flex:none;display:flex;justify-content:space-between;align-items:center;height:40px;padding:0 28px;font:var(--t-label-large);color:var(--c-on-surface)}
.statusbar i{display:inline-block;width:18px;height:10px;border:1.5px solid currentColor;border-radius:3px;position:relative}
.statusbar i::after{content:"";position:absolute;inset:1px 4px 1px 1px;background:currentColor;border-radius:1px}
.mapwrap{position:absolute;inset:0;background:radial-gradient(120% 80% at 50% 30%,#0b1430,var(--c-space));overflow:hidden}
.mapwrap canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab}
.search{position:absolute;z-index:2;top:8px;left:12px;right:12px;display:flex;align-items:center;gap:12px;min-height:56px;padding:4px 8px 4px 16px;border-radius:var(--r-extra-large);background:rgba(16,22,43,.72);-webkit-backdrop-filter:blur(18px) saturate(1.4);backdrop-filter:blur(18px) saturate(1.4);border:1px solid rgba(255,255,255,.08)}
.search svg.logo{width:28px;height:28px;flex:none}
.search .q{flex:1;min-width:0;font:var(--t-body-large);color:var(--c-on-surface-variant);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mapctl{position:absolute;z-index:2;right:12px;bottom:calc(44% + 12px);display:flex;flex-direction:column;gap:12px;transition:bottom .35s cubic-bezier(.2,0,0,1)}
.sheet.static{top:56%;max-height:none}
.legend-chip{position:absolute;z-index:2;left:12px;top:76px;display:flex;flex-wrap:wrap;gap:6px;right:12px;pointer-events:none}
.legend-chip .state-chip{background:rgba(16,22,43,.7);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);color:var(--c-on-surface);border:1px solid rgba(255,255,255,.08)}
.legend-chip .state-chip::before{background:var(--map)}
.sheet{position:absolute;z-index:3;left:0;right:0;bottom:0;max-height:calc(100% - 72px);display:flex;flex-direction:column;border-radius:28px 28px 0 0;background:rgba(12,17,34,.86);-webkit-backdrop-filter:blur(22px) saturate(1.4);backdrop-filter:blur(22px) saturate(1.4);border-top:1px solid rgba(255,255,255,.08);transition:transform .35s cubic-bezier(.2,0,0,1)}
.sheet .grab{flex:none;display:grid;place-items:center;height:44px;border:0;background:transparent;cursor:grab;width:100%}
.sheet .grab::before{content:"";width:32px;height:4px;border-radius:2px;background:var(--c-on-surface-variant);opacity:.4}
.sheet .body{overflow:auto;padding:0 16px 16px;overscroll-behavior:contain}
.sheet .body>*+*{margin-top:12px}
.spot-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.spot-head .title-m{color:var(--c-on-surface-variant)}
.meta{display:flex;gap:8px;margin:12px -20px 0;padding:0 20px;overflow-x:auto;scrollbar-width:none}
.meta .chip{min-height:28px;padding:4px 10px;font:var(--t-label-medium);border-color:color-mix(in srgb,currentColor 30%,transparent);color:inherit}
.meta .chip svg{width:16px;height:16px}
.why{border-radius:var(--r-large);background:var(--c-surface-container-highest);padding:16px}
.why h3{font:var(--t-title-small);margin-bottom:8px}
.why ul{margin:0;padding-left:20px;color:var(--c-on-surface-variant)}
.why li+li{margin-top:4px}
.track{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;list-style:none;margin:12px 0 0;padding:0}
.track li{height:4px;border-radius:2px;background:color-mix(in srgb,currentColor 20%,transparent)}
.track li.done{background:currentColor}
.mini-list .li{padding:8px 4px;min-height:48px}
.navbar{flex:none;position:relative;z-index:4;display:flex;height:80px;background:rgba(7,11,22,.92);border-top:1px solid rgba(255,255,255,.06);padding-bottom:env(safe-area-inset-bottom)}
.navbar a,.navbar button{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:0;background:transparent;color:var(--c-on-surface-variant);font:var(--t-label-medium);text-decoration:none;cursor:pointer}
.navbar .pill{display:grid;place-items:center;width:64px;height:32px;border-radius:16px;transition:background .2s}
.navbar svg{width:24px;height:24px;fill:currentColor}
.navbar [aria-current=page]{color:var(--c-on-surface);font-weight:700}
.navbar [aria-current=page] .pill{background:var(--c-secondary-container);color:var(--c-on-secondary-container)}
.page{padding:0 16px 24px}
.page>*+*{margin-top:16px}
.tiles{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.tile{border-radius:var(--r-large);background:var(--c-surface-container);padding:16px}
.tile b{display:block;font:var(--t-headline-small)}
.tile span{font:var(--t-body-medium);color:var(--c-on-surface-variant)}
.ring{display:flex;align-items:center;gap:20px}
.ring svg{width:112px;height:112px;flex:none}
.ring .track-c{fill:none;stroke:var(--c-surface-container-highest);stroke-width:10}
.ring .val-c{fill:none;stroke:var(--c-primary);stroke-width:10;stroke-linecap:round;transform:rotate(-90deg);transform-origin:center}
.ring text{font:var(--t-headline-small);fill:var(--c-on-surface);text-anchor:middle;dominant-baseline:central}
.bars{display:flex;align-items:flex-end;gap:8px;height:140px;padding-top:8px;position:relative}
.bars .b{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end}
.bars .b i{display:block;width:100%;max-width:28px;border-radius:8px 8px 4px 4px;background:var(--c-primary)}
.bars .b.low i{background:color-mix(in srgb,var(--c-primary) 45%,var(--c-surface-container-low))}
.bars .b span{font:var(--t-label-small);color:var(--c-on-surface-variant)}
.bars .promise{position:absolute;left:0;right:0;border-top:2px dashed var(--c-outline);pointer-events:none}
.bars .promise span{position:absolute;right:0;top:-20px;font:var(--t-label-small);color:var(--c-on-surface-variant);background:var(--c-surface-container-low);padding:0 4px}
.snack{position:absolute;z-index:6;left:12px;right:12px;bottom:92px;display:flex;align-items:center;gap:8px;min-height:48px;padding:12px 16px;border-radius:var(--r-small);background:var(--c-inverse-surface);color:var(--c-inverse-on-surface);font:var(--t-body-medium);box-shadow:0 2px 6px rgb(0 0 0/.3);transform:translateY(16px);opacity:0;transition:all .25s;pointer-events:none}
.snack.on{transform:none;opacity:1}
.notif{position:absolute;z-index:7;top:44px;left:8px;right:8px;display:flex;gap:12px;padding:14px 16px;border-radius:var(--r-extra-large);background:var(--c-surface-container-highest);color:var(--c-on-surface);box-shadow:0 4px 12px rgb(0 0 0/.3);transform:translateY(calc(-100% - 64px));visibility:hidden;transition:transform .4s cubic-bezier(.2,0,0,1),visibility 0s .4s}
.notif.on{transform:none;visibility:visible;transition:transform .4s cubic-bezier(.2,0,0,1)}
.notif svg{width:32px;height:32px;flex:none}
.notif b{display:block;font:var(--t-title-small)}
.notif span{display:block;font:var(--t-body-medium);color:var(--c-on-surface-variant)}
.alarm{position:absolute;z-index:8;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px;text-align:center;background:var(--c-primary-container);color:var(--c-on-primary-container)}
.alarm .halo{display:grid;place-items:center;width:160px;height:160px;border-radius:50%;background:color-mix(in srgb,var(--c-primary) 18%,transparent)}
@media(prefers-reduced-motion:no-preference){.alarm .halo{animation:ring 1.4s ease-in-out infinite}}
@keyframes ring{50%{transform:scale(1.08)}}
.alarm .halo svg{width:96px;height:96px}
.alarm h2{font:var(--t-headline-medium)}
.scrim{position:absolute;z-index:10;inset:0;display:grid;place-items:center;padding:24px;background:rgb(0 0 0/.4)}
.perm{max-width:300px;background:var(--c-surface-container-high);border-radius:var(--r-extra-large);padding:24px}
.perm>svg{width:24px;height:24px;fill:var(--c-primary);margin:0 auto 16px}
.perm .title-m{text-align:center;margin-bottom:16px}
.welcome{position:absolute;z-index:9;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:56px 24px 32px;background:linear-gradient(180deg,rgba(3,5,11,0) 0%,rgba(3,5,11,.35) 34%,rgba(3,5,11,.94) 58%);overflow:auto}
.app .search,.app .legend-chip,.app .mapctl,.app .sheet,.app .navbar{transition:opacity .6s .3s}
.app.intro .search,.app.intro .legend-chip,.app.intro .mapctl,.app.intro .sheet,.app.intro .navbar{opacity:0;pointer-events:none}
.welcome .mark svg{width:72px;height:72px}
.welcome h2{font:var(--t-headline-medium);margin-top:16px;letter-spacing:-.01em}
.welcome p{margin-top:12px;color:var(--c-on-surface-variant)}
.welcome .acts{padding-top:24px;display:grid;gap:8px}
.welcome .loc{display:flex;gap:16px;align-items:flex-start;margin-top:24px;padding:16px;border-radius:var(--r-large);background:var(--c-surface-container)}
.welcome .loc svg{width:24px;height:24px;fill:var(--c-primary);flex:none}

/* ---------- Simulation page ---------- */
.sim-banner{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:8px 16px;background:var(--c-possible-container);color:var(--c-on-possible-container);font:var(--t-label-large);text-align:center}
.sim-banner svg{width:18px;height:18px;fill:currentColor}
.judge{max-width:1200px;margin:0 auto;padding:24px;display:grid;gap:32px;justify-items:center}
.guide{max-width:440px;width:100%}
.guide>*+*{margin-top:16px}
.guide h1{font:var(--t-headline-large)}
.guide ol{margin:0;padding:0;list-style:none;display:grid;gap:12px}
.guide ol li{display:flex;gap:12px;align-items:flex-start}
.guide ol .step-n{width:28px;height:28px;margin:0;font:var(--t-label-large);flex:none}
@media(min-width:900px){.judge{grid-template-columns:auto 1fr;align-items:center;justify-items:start;min-height:calc(100dvh - 40px);gap:56px;padding:32px 48px}.judge .phone{height:min(780px,calc(100dvh - 104px));width:auto}}
@media(max-width:899px){body.sim{overflow:hidden}.judge{padding:0;display:block}.judge .phone{width:100%;height:calc(100dvh - 40px);aspect-ratio:auto;border-radius:0;padding:0;background:none;box-shadow:none}.judge .phone::before{display:none}.judge .phone>.screen{border-radius:0}.judge .statusbar{display:none}.guide{display:none}}

/* ---------- Public pages (areas, install, privacy, 404) ---------- */
.site-top{display:flex;align-items:center;gap:8px;min-height:64px;padding:0 16px;max-width:840px;margin:0 auto}
.site-top nav{margin-left:auto;display:flex;gap:4px}
.site-top nav a{display:inline-flex;align-items:center;min-height:48px;padding:0 12px;border-radius:var(--r-full);color:var(--c-on-surface-variant);text-decoration:none;font:var(--t-label-large)}
.site{max-width:840px;margin:0 auto;padding:8px 16px 48px}
.site h1{font:var(--t-headline-large);margin:16px 0}
.site h2{font:var(--t-title-large);margin:32px 0 12px}
.site p,.site li{max-width:68ch}
.site p+p{margin-top:8px}
.site ul.list{padding-left:20px;list-style:disc}
.site ul.list li+li{margin-top:6px}
.site ul.plain{list-style:none;padding:0;margin:0;border-radius:var(--r-large);overflow:hidden;background:var(--c-surface-container-low)}
.site ul.plain li{display:flex;align-items:center;gap:16px;min-height:56px;padding:8px 16px;border-top:1px solid var(--c-outline-variant)}
.site ul.plain li:first-child{border-top:0}
.site .btn{margin:8px 8px 0 0}
.site .btn.alt{background:transparent;color:var(--c-primary);border:1px solid var(--c-outline)}
.site .state{margin:16px 0;padding:20px;border-radius:var(--r-extra-large);background:var(--st-c,var(--c-surface-container-highest));color:var(--st-on,var(--c-on-surface))}
.site .state .label{font:var(--t-headline-small);margin:0 0 4px}
.site .state p{margin:4px 0}
.site .chip{border-color:transparent;background:var(--st-c);color:var(--st-on)}
.site .note{color:var(--c-on-surface-variant);font:var(--t-body-medium)}
.site .banner{border-radius:var(--r-medium);padding:12px 16px;background:var(--c-possible-container);color:var(--c-on-possible-container);font:var(--t-label-large)}
.site svg.map{width:100%;height:auto;max-height:70vh;border-radius:var(--r-large);background:var(--c-surface-container)}
.site svg.map path{fill:var(--map,var(--map-nodata));stroke:var(--c-surface-container);stroke-width:1}
.site svg.map path.none{fill:var(--c-surface-container-highest)}
.site svg.map text{font:600 14px var(--font);fill:var(--c-on-surface);paint-order:stroke;stroke:var(--c-surface-container);stroke-width:3px}
.site-foot{max-width:840px;margin:0 auto;padding:24px 16px 48px;display:flex;flex-wrap:wrap;gap:4px 16px;border-top:1px solid var(--c-outline-variant);color:var(--c-on-surface-variant)}
.site-foot a{color:inherit;min-height:48px;min-width:48px;justify-content:center;display:inline-flex;align-items:center}
`;

export const APP_CSS = CSS.replace(/\n+/g, '\n').trim();
