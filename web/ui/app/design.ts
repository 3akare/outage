// One Material 3 stylesheet for every page the Worker serves: landing, the app in the browser (/app/simulate) and the
// public area pages (ADR 0048). Served from the same origin at /app.css, so the CSP needs no inline style.
// Colours, type, shape and spacing come from core/shared/design/tokens.json through tools/tokens/build.mjs, the same
// source as the Android theme. Material 3 roles: https://m3.material.io/styles/color/roles
import { TOKENS_CSS } from './tokens.gen.ts';

const CSS = `
${TOKENS_CSS}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--md-sys-color-surface);color:var(--md-sys-color-on-surface);font:var(--md-sys-typescale-body-large)}
a{color:var(--md-sys-color-primary)}
h1,h2,h3,p,figure{margin:0}
[hidden]{display:none!important}
img,svg{display:block}
:focus-visible{outline:3px solid var(--md-sys-color-primary);outline-offset:2px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

/* Type scale */
.display-l{font:var(--md-sys-typescale-display-large);letter-spacing:-.016em}
.display-m{font:var(--md-sys-typescale-display-medium);letter-spacing:-.01em}
.display-s{font:var(--md-sys-typescale-display-small)}
.headline-l{font:var(--md-sys-typescale-headline-large)}
.headline-m{font:var(--md-sys-typescale-headline-medium)}
.headline-s{font:var(--md-sys-typescale-headline-small)}
.title-l{font:var(--md-sys-typescale-title-large)}
.title-m{font:var(--md-sys-typescale-title-medium);letter-spacing:.01em}
.title-s{font:var(--md-sys-typescale-title-small);letter-spacing:.006em}
.body-l{font:var(--md-sys-typescale-body-large)}
.body-m{font:var(--md-sys-typescale-body-medium)}
.body-s{font:var(--md-sys-typescale-body-small)}
.label-l{font:var(--md-sys-typescale-label-large);letter-spacing:.006em}
.label-m{font:var(--md-sys-typescale-label-medium);letter-spacing:.03em}
.muted{color:var(--md-sys-color-on-surface-variant)}

/* Buttons: filled, tonal, outlined, text. Full corner radius, 40 px tall, 48 px touch target. */
.btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:10px 24px;border-radius:var(--md-sys-shape-corner-full);border:0;font:var(--md-sys-typescale-label-large);letter-spacing:.006em;text-decoration:none;cursor:pointer;background:var(--md-sys-color-primary);color:var(--md-sys-color-on-primary);transition:box-shadow .2s,background-color .2s}
.btn::after{content:"";position:absolute;inset:-4px 0;}
.btn:hover{box-shadow:0 1px 2px rgb(0 0 0/.3),0 1px 3px 1px rgb(0 0 0/.15)}
.btn.tonal{background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container)}
.btn.outlined{background:transparent;color:var(--md-sys-color-primary);border:1px solid var(--md-sys-color-outline)}
.btn.text{background:transparent;color:var(--md-sys-color-primary);padding:10px 12px}
.btn.outlined:hover,.btn.text:hover{box-shadow:none;background:color-mix(in srgb,var(--md-sys-color-primary) 8%,transparent)}
.btn.lg{min-height:56px;padding:16px 28px;font:var(--md-sys-typescale-title-medium)}
.btn.block{display:flex;width:100%}
.btn svg{width:18px;height:18px;fill:currentColor;flex:none}
.btn:disabled{background:color-mix(in srgb,var(--md-sys-color-on-surface) 12%,transparent);color:color-mix(in srgb,var(--md-sys-color-on-surface) 38%,transparent);box-shadow:none;cursor:default}
.icon-btn{display:inline-grid;place-items:center;width:48px;height:48px;border-radius:50%;border:0;background:transparent;color:var(--md-sys-color-on-surface-variant);cursor:pointer}
.icon-btn:hover{background:color-mix(in srgb,var(--md-sys-color-on-surface-variant) 8%,transparent)}
.icon-btn svg,.ico{width:24px;height:24px;fill:currentColor}
.fab{display:inline-grid;place-items:center;width:48px;height:48px;border-radius:var(--md-sys-shape-corner-large);border:0;background:var(--md-sys-color-surface-container-high);color:var(--md-sys-color-on-surface);box-shadow:0 1px 3px rgb(0 0 0/.3),0 4px 8px 3px rgb(0 0 0/.15);cursor:pointer}
.fab svg{width:24px;height:24px;fill:currentColor}

/* Cards */
.card{background:var(--md-sys-color-surface-container-low);border-radius:var(--md-sys-shape-corner-medium);padding:16px;box-shadow:0 1px 2px rgb(0 0 0/.3),0 1px 3px 1px rgb(0 0 0/.15)}
.card.filled{background:var(--md-sys-color-surface-container-highest);box-shadow:none}
.card.outlined{background:var(--md-sys-color-surface);border:1px solid var(--md-sys-color-outline-variant);box-shadow:none}
.card.tonal{background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container);box-shadow:none}
.card>*+*{margin-top:8px}
.stack>*+*{margin-top:12px}

/* Chips */
.chip{display:inline-flex;align-items:center;gap:8px;min-height:32px;padding:6px 12px;border-radius:var(--md-sys-shape-corner-small);border:1px solid var(--md-sys-color-outline-variant);font:var(--md-sys-typescale-label-large);color:var(--md-sys-color-on-surface-variant);background:transparent;white-space:nowrap}
.chip svg{width:18px;height:18px;fill:currentColor}
.chip.sim{background:var(--md-sys-color-possible-container);color:var(--md-sys-color-on-possible-container);border-color:transparent}
.chip.assist{background:var(--md-sys-color-surface-container-low);border-color:var(--md-sys-color-outline-variant)}

/* Power state: one colour family per state, the same on every page and on the phone. Never colour alone: every state also has words. */
[data-state=NORMAL]{--st:var(--md-sys-color-normal);--st-c:var(--md-sys-color-normal-container);--st-on:var(--md-sys-color-on-normal-container);--map:var(--md-map-normal)}
[data-state=POSSIBLE],[data-state=SPOT_ONLY]{--st:var(--md-sys-color-possible);--st-c:var(--md-sys-color-possible-container);--st-on:var(--md-sys-color-on-possible-container);--map:var(--md-map-possible)}
[data-state=CONFIRMED]{--st:var(--md-sys-color-confirmed);--st-c:var(--md-sys-color-confirmed-container);--st-on:var(--md-sys-color-on-confirmed-container);--map:var(--md-map-confirmed)}
[data-state=RESTORED]{--st:var(--md-sys-color-restored);--st-c:var(--md-sys-color-restored-container);--st-on:var(--md-sys-color-on-restored-container);--map:var(--md-map-restored)}
[data-state=NO_DATA],[data-state=NO_COVERAGE],[data-state=UNKNOWN]{--st:var(--md-sys-color-outline);--st-c:var(--md-sys-color-surface-container-highest);--st-on:var(--md-sys-color-on-surface-variant);--map:var(--md-map-nodata)}
.state-chip{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:4px 12px 4px 8px;border-radius:var(--md-sys-shape-corner-full);background:var(--st-c);color:var(--st-on);font:var(--md-sys-typescale-label-large);white-space:nowrap}
.state-chip::before{content:"";width:10px;height:10px;border-radius:50%;background:var(--st)}
.state-card{background:var(--st-c);color:var(--st-on);border-radius:var(--md-sys-shape-corner-extra-large);padding:16px 20px;overflow:hidden}
.state-card .big{font:var(--md-sys-typescale-headline-medium);margin-top:4px}
.state-card .sub{opacity:.85}

/* Lists */
.list{list-style:none;margin:0;padding:0}
.li{display:flex;align-items:center;gap:16px;min-height:56px;padding:8px 16px;color:inherit;text-decoration:none;width:100%;background:transparent;border:0;font:inherit;text-align:left;cursor:pointer}
button.li:hover,a.li:hover{background:color-mix(in srgb,var(--md-sys-color-on-surface) 8%,transparent)}
.li .lead{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container)}
.li .lead svg{width:24px;height:24px;fill:currentColor}
.li .txt{flex:1;min-width:0}
.li .txt b{display:block;font:var(--md-sys-typescale-body-large);font-weight:400}
.li .txt span{display:block;font:var(--md-sys-typescale-body-medium);color:var(--md-sys-color-on-surface-variant)}
.li .trail{flex:none;color:var(--md-sys-color-on-surface-variant);font:var(--md-sys-typescale-label-small)}
.divider{height:1px;background:var(--md-sys-color-outline-variant);margin:8px 0;border:0}
.group-label{font:var(--md-sys-typescale-title-small);color:var(--md-sys-color-primary);padding:16px 16px 8px}

/* Switch */
.switch{flex:none;position:relative;width:52px;height:32px;border-radius:16px;border:2px solid var(--md-sys-color-outline);background:var(--md-sys-color-surface-container-highest);transition:background .2s}
.switch::after{content:"";position:absolute;top:6px;left:6px;width:16px;height:16px;border-radius:50%;background:var(--md-sys-color-outline);transition:all .2s}
[aria-checked=true] .switch,.switch[aria-checked=true]{background:var(--md-sys-color-primary);border-color:var(--md-sys-color-primary)}
[aria-checked=true] .switch::after,.switch[aria-checked=true]::after{left:22px;top:2px;width:24px;height:24px;background:var(--md-sys-color-on-primary)}

/* Top app bar and brand */
.appbar{display:flex;align-items:center;gap:4px;min-height:64px;padding:8px 4px 8px 16px}
.appbar h1{font:var(--md-sys-typescale-title-large);flex:1}
.brand{display:inline-flex;align-items:center;gap:10px;min-height:48px;color:var(--md-sys-color-on-surface);text-decoration:none;font:500 1.375rem/1.75rem var(--md-font);letter-spacing:-.01em}
.brand svg{width:32px;height:32px}

/* ---------- Landing ---------- */
.land{max-width:1200px;margin:0 auto;padding:0 24px}
.land-top{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--md-sys-color-surface) 88%,transparent);backdrop-filter:blur(12px)}
.land-top .in{max-width:1200px;margin:0 auto;display:flex;align-items:center;gap:8px;min-height:72px;padding:0 24px}
.land-top nav{display:flex;gap:4px;margin-left:auto;align-items:center}
.land-top nav a.link{display:inline-flex;align-items:center;min-height:48px;padding:0 12px;border-radius:var(--md-sys-shape-corner-full);color:var(--md-sys-color-on-surface-variant);text-decoration:none;font:var(--md-sys-typescale-label-large)}
.land-top nav a.link:hover{background:color-mix(in srgb,var(--md-sys-color-on-surface) 8%,transparent)}
.hero{display:grid;gap:40px;align-items:center;padding:32px 0 56px}
.hero .eyebrow{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px}
.hero h1{font:var(--md-sys-typescale-display-medium);letter-spacing:-.02em;text-wrap:balance}
.hero h1 em{font-style:normal;color:var(--md-sys-color-primary)}
.hero .lead{font:var(--md-sys-typescale-title-large);font-weight:400;color:var(--md-sys-color-on-surface-variant);margin-top:20px;max-width:34ch}
.cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px}
.get{margin-top:20px}
.get p{margin-bottom:8px}
.stores{display:flex;flex-wrap:wrap;gap:8px}
.store{display:inline-flex;align-items:center;gap:12px;min-height:56px;padding:8px 20px 8px 14px;border-radius:var(--md-sys-shape-corner-large);background:var(--md-sys-color-inverse-surface);color:var(--md-sys-color-inverse-on-surface);text-decoration:none}
.store svg{width:28px;height:28px;fill:currentColor;flex:none}
.store small{display:block;font:var(--md-sys-typescale-label-small);opacity:.8}
.store b{display:block;font:var(--md-sys-typescale-title-medium)}
.store:hover{opacity:.92}
.hero-art{position:relative;display:grid;place-items:center;padding:24px 0}
.hero-art::before{content:"";position:absolute;inset:8% 4%;border-radius:48px;background:radial-gradient(closest-side,var(--md-sys-color-primary-container),transparent)}
.section{padding:56px 0;border-top:1px solid var(--md-sys-color-outline-variant)}
.section>h2{font:var(--md-sys-typescale-headline-large);text-wrap:balance}
.section>p.muted{margin-top:12px;max-width:60ch;font:var(--md-sys-typescale-body-large)}
.grid{display:grid;gap:16px;margin-top:32px}
.feat{padding:24px;border-radius:var(--md-sys-shape-corner-extra-large);background:var(--md-sys-color-surface-container-low)}
.feat .ic{display:grid;place-items:center;width:48px;height:48px;border-radius:var(--md-sys-shape-corner-large);background:var(--md-sys-color-primary-container);color:var(--md-sys-color-on-primary-container);margin-bottom:16px}
.feat .ic svg{width:24px;height:24px;fill:currentColor}
.feat h3{font:var(--md-sys-typescale-title-large);margin-bottom:8px}
.feat p{color:var(--md-sys-color-on-surface-variant)}
.step-n{display:inline-grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--md-sys-color-primary);color:var(--md-sys-color-on-primary);font:var(--md-sys-typescale-title-medium);margin-bottom:16px}
.try{display:grid;gap:24px;align-items:center;padding:40px;border-radius:var(--md-sys-shape-corner-extra-large);background:var(--md-sys-color-primary-container);color:var(--md-sys-color-on-primary-container)}
.try h2{font:var(--md-sys-typescale-headline-medium)}
.try p{margin-top:8px}
.try .btn{justify-self:start}
.privacy{display:grid;gap:12px;margin-top:24px}
.privacy li{display:flex;gap:12px;align-items:flex-start}
.privacy svg{width:24px;height:24px;fill:var(--md-sys-color-primary);flex:none}
.foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px 24px;padding:32px 0 48px;border-top:1px solid var(--md-sys-color-outline-variant);color:var(--md-sys-color-on-surface-variant)}
.foot a{color:inherit;min-height:48px;min-width:48px;justify-content:center;display:inline-flex;align-items:center}
.foot .brand{margin-right:auto}
@media(min-width:840px){.hero{grid-template-columns:1.1fr .9fr;padding:56px 0 80px}.hero h1{font:var(--md-sys-typescale-display-large);letter-spacing:-.025em}.grid.three{grid-template-columns:repeat(3,1fr)}.grid.two{grid-template-columns:repeat(2,1fr)}.try{grid-template-columns:1fr auto}.try .btn{justify-self:end}}
@media(max-width:599px){.land-top nav a.link{display:none}.hero h1{font:var(--md-sys-typescale-display-small)}}

/* ---------- Phone frame (landing art and the simulation on wide screens) ---------- */
.phone{position:relative;width:360px;max-width:100%;aspect-ratio:9/19.5;border-radius:44px;padding:10px;background:#1b1b1f;box-shadow:0 2px 6px rgb(0 0 0/.3),0 24px 48px -8px rgb(0 0 0/.35)}
.phone>.screen{position:relative;width:100%;height:100%;border-radius:34px;overflow:hidden;background:var(--md-sys-color-surface)}
.phone::before{content:"";position:absolute;z-index:3;top:20px;left:50%;width:22px;height:22px;margin-left:-11px;border-radius:50%;background:#000}

/* ---------- The app (Home map, sheet, Insights, Settings) ---------- */
.app{position:relative;height:100%;display:flex;flex-direction:column;background:var(--md-sys-color-surface);overflow:hidden}
.app .view{position:relative;flex:1;min-height:0;overflow:auto}
.app .view.map{overflow:hidden}
.statusbar{flex:none;display:flex;justify-content:space-between;align-items:center;height:40px;padding:0 28px;font:var(--md-sys-typescale-label-large);color:var(--md-sys-color-on-surface)}
.statusbar i{display:inline-block;width:18px;height:10px;border:1.5px solid currentColor;border-radius:3px;position:relative}
.statusbar i::after{content:"";position:absolute;inset:1px 4px 1px 1px;background:currentColor;border-radius:1px}
.mapwrap{position:absolute;inset:0;background:var(--md-sys-color-surface-container);touch-action:none}
.mapwrap svg{width:100%;height:100%}
.hx{fill:var(--map);stroke:var(--md-sys-color-surface-container);stroke-width:3;vector-effect:non-scaling-stroke;cursor:pointer;transition:fill .5s}
.hx[data-state=NORMAL]{fill:color-mix(in srgb,var(--md-map-normal) 62%,var(--md-sys-color-surface-container))}
.hx[data-state=NO_DATA]{fill:var(--md-sys-color-surface-container-highest);stroke:var(--md-sys-color-outline-variant);stroke-dasharray:4 3}
.hx[data-state=POSSIBLE]{fill:url(#p-possible)}
.hx[data-state=CONFIRMED]{fill:url(#p-confirmed)}
.hx[data-state=RESTORED]{fill:color-mix(in srgb,var(--md-map-restored) 40%,var(--md-sys-color-surface-container));stroke:var(--md-map-restored)}
.hx.sel{stroke:var(--md-sys-color-on-surface);stroke-width:3;stroke-dasharray:6 4}
.hx.spot{stroke:var(--md-sys-color-on-surface);stroke-width:4}
.pp-bg-possible{fill:color-mix(in srgb,var(--md-map-possible) 45%,var(--md-sys-color-surface-container))}.pp-possible{fill:var(--md-map-possible)}
.pp-bg-confirmed{fill:var(--md-map-confirmed)}.pp-confirmed{fill:color-mix(in srgb,var(--md-map-confirmed) 55%,#000)}
.pulse{fill:none;stroke:var(--md-map-confirmed);stroke-width:3;vector-effect:non-scaling-stroke;pointer-events:none;opacity:0}
@media(prefers-reduced-motion:no-preference){.pulse.on{animation:pulse 1.9s cubic-bezier(.05,.7,.1,1) infinite}}
@keyframes pulse{0%{opacity:.7;stroke-width:2}100%{opacity:0;stroke-width:14}}
.lbl{font:600 19px var(--md-font);fill:var(--md-sys-color-on-surface);text-anchor:middle;dominant-baseline:middle;paint-order:stroke;stroke:var(--md-sys-color-surface-container);stroke-width:5px;stroke-linejoin:round;pointer-events:none}
.me{fill:var(--md-sys-color-primary);stroke:#fff;stroke-width:3;vector-effect:non-scaling-stroke}
.me-halo{fill:var(--md-sys-color-primary);opacity:.18}
.search{position:absolute;z-index:2;top:8px;left:12px;right:12px;display:flex;align-items:center;gap:12px;min-height:56px;padding:4px 8px 4px 16px;border-radius:var(--md-sys-shape-corner-extra-large);background:var(--md-sys-color-surface-container-high);box-shadow:0 1px 3px rgb(0 0 0/.3),0 4px 8px 3px rgb(0 0 0/.15)}
.search svg.logo{width:28px;height:28px;flex:none}
.search .q{flex:1;min-width:0;font:var(--md-sys-typescale-body-large);color:var(--md-sys-color-on-surface-variant);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mapctl{position:absolute;z-index:2;right:12px;bottom:calc(44% + 12px);display:flex;flex-direction:column;gap:12px;transition:bottom .35s cubic-bezier(.2,0,0,1)}
.sheet.static{top:56%;max-height:none}
.legend-chip{position:absolute;z-index:2;left:12px;top:76px;display:flex;flex-wrap:wrap;gap:6px;right:12px;pointer-events:none}
.legend-chip .state-chip{background:var(--md-sys-color-surface-container-high);color:var(--md-sys-color-on-surface);box-shadow:0 1px 2px rgb(0 0 0/.25)}
.legend-chip .state-chip::before{background:var(--map)}
.sheet{position:absolute;z-index:3;left:0;right:0;bottom:0;max-height:calc(100% - 72px);display:flex;flex-direction:column;border-radius:28px 28px 0 0;background:var(--md-sys-color-surface-container-low);box-shadow:0 -1px 3px rgb(0 0 0/.2),0 -4px 12px rgb(0 0 0/.12);transition:transform .35s cubic-bezier(.2,0,0,1)}
.sheet .grab{flex:none;display:grid;place-items:center;height:44px;border:0;background:transparent;cursor:grab;width:100%}
.sheet .grab::before{content:"";width:32px;height:4px;border-radius:2px;background:var(--md-sys-color-on-surface-variant);opacity:.4}
.sheet .body{overflow:auto;padding:0 16px 16px;overscroll-behavior:contain}
.sheet .body>*+*{margin-top:12px}
.spot-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.spot-head .title-m{color:var(--md-sys-color-on-surface-variant)}
.meta{display:flex;gap:8px;margin:12px -20px 0;padding:0 20px;overflow-x:auto;scrollbar-width:none}
.meta .chip{min-height:28px;padding:4px 10px;font:var(--md-sys-typescale-label-medium);border-color:color-mix(in srgb,currentColor 30%,transparent);color:inherit}
.meta .chip svg{width:16px;height:16px}
.why{border-radius:var(--md-sys-shape-corner-large);background:var(--md-sys-color-surface-container-highest);padding:16px}
.why h3{font:var(--md-sys-typescale-title-small);margin-bottom:8px}
.why ul{margin:0;padding-left:20px;color:var(--md-sys-color-on-surface-variant)}
.why li+li{margin-top:4px}
.track{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;list-style:none;margin:12px 0 0;padding:0}
.track li{height:4px;border-radius:2px;background:color-mix(in srgb,currentColor 20%,transparent)}
.track li.done{background:currentColor}
.mini-list .li{padding:8px 4px;min-height:48px}
.navbar{flex:none;position:relative;z-index:4;display:flex;height:80px;background:var(--md-sys-color-surface-container);padding-bottom:env(safe-area-inset-bottom)}
.navbar a,.navbar button{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:0;background:transparent;color:var(--md-sys-color-on-surface-variant);font:var(--md-sys-typescale-label-medium);text-decoration:none;cursor:pointer}
.navbar .pill{display:grid;place-items:center;width:64px;height:32px;border-radius:16px;transition:background .2s}
.navbar svg{width:24px;height:24px;fill:currentColor}
.navbar [aria-current=page]{color:var(--md-sys-color-on-surface);font-weight:700}
.navbar [aria-current=page] .pill{background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container)}
.page{padding:0 16px 24px}
.page>*+*{margin-top:16px}
.tiles{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.tile{border-radius:var(--md-sys-shape-corner-large);background:var(--md-sys-color-surface-container);padding:16px}
.tile b{display:block;font:var(--md-sys-typescale-headline-small)}
.tile span{font:var(--md-sys-typescale-body-medium);color:var(--md-sys-color-on-surface-variant)}
.ring{display:flex;align-items:center;gap:20px}
.ring svg{width:112px;height:112px;flex:none}
.ring .track-c{fill:none;stroke:var(--md-sys-color-surface-container-highest);stroke-width:10}
.ring .val-c{fill:none;stroke:var(--md-sys-color-primary);stroke-width:10;stroke-linecap:round;transform:rotate(-90deg);transform-origin:center}
.ring text{font:var(--md-sys-typescale-headline-small);fill:var(--md-sys-color-on-surface);text-anchor:middle;dominant-baseline:central}
.bars{display:flex;align-items:flex-end;gap:8px;height:140px;padding-top:8px;position:relative}
.bars .b{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end}
.bars .b i{display:block;width:100%;max-width:28px;border-radius:8px 8px 4px 4px;background:var(--md-sys-color-primary)}
.bars .b.low i{background:color-mix(in srgb,var(--md-sys-color-primary) 45%,var(--md-sys-color-surface-container-low))}
.bars .b span{font:var(--md-sys-typescale-label-small);color:var(--md-sys-color-on-surface-variant)}
.bars .promise{position:absolute;left:0;right:0;border-top:2px dashed var(--md-sys-color-outline);pointer-events:none}
.bars .promise span{position:absolute;right:0;top:-20px;font:var(--md-sys-typescale-label-small);color:var(--md-sys-color-on-surface-variant);background:var(--md-sys-color-surface-container-low);padding:0 4px}
.snack{position:absolute;z-index:6;left:12px;right:12px;bottom:92px;display:flex;align-items:center;gap:8px;min-height:48px;padding:12px 16px;border-radius:var(--md-sys-shape-corner-extra-small);background:var(--md-sys-color-inverse-surface);color:var(--md-sys-color-inverse-on-surface);font:var(--md-sys-typescale-body-medium);box-shadow:0 2px 6px rgb(0 0 0/.3);transform:translateY(16px);opacity:0;transition:all .25s;pointer-events:none}
.snack.on{transform:none;opacity:1}
.notif{position:absolute;z-index:7;top:44px;left:8px;right:8px;display:flex;gap:12px;padding:14px 16px;border-radius:var(--md-sys-shape-corner-extra-large);background:var(--md-sys-color-surface-container-highest);color:var(--md-sys-color-on-surface);box-shadow:0 4px 12px rgb(0 0 0/.3);transform:translateY(calc(-100% - 64px));visibility:hidden;transition:transform .4s cubic-bezier(.2,0,0,1),visibility 0s .4s}
.notif.on{transform:none;visibility:visible;transition:transform .4s cubic-bezier(.2,0,0,1)}
.notif svg{width:32px;height:32px;flex:none}
.notif b{display:block;font:var(--md-sys-typescale-title-small)}
.notif span{display:block;font:var(--md-sys-typescale-body-medium);color:var(--md-sys-color-on-surface-variant)}
.alarm{position:absolute;z-index:8;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px;text-align:center;background:var(--md-sys-color-primary-container);color:var(--md-sys-color-on-primary-container)}
.alarm .halo{display:grid;place-items:center;width:160px;height:160px;border-radius:50%;background:color-mix(in srgb,var(--md-sys-color-primary) 18%,transparent)}
@media(prefers-reduced-motion:no-preference){.alarm .halo{animation:ring 1.4s ease-in-out infinite}}
@keyframes ring{50%{transform:scale(1.08)}}
.alarm .halo svg{width:96px;height:96px}
.alarm h2{font:var(--md-sys-typescale-headline-medium)}
.scrim{position:absolute;z-index:10;inset:0;display:grid;place-items:center;padding:24px;background:rgb(0 0 0/.4)}
.perm{max-width:300px;background:var(--md-sys-color-surface-container-high);border-radius:var(--md-sys-shape-corner-extra-large);padding:24px}
.perm>svg{width:24px;height:24px;fill:var(--md-sys-color-primary);margin:0 auto 16px}
.perm .title-m{text-align:center;margin-bottom:16px}
.bgx{fill:none;stroke:var(--md-sys-color-outline-variant);stroke-width:1;opacity:.55;vector-effect:non-scaling-stroke}
.welcome{position:absolute;z-index:9;inset:0;display:flex;flex-direction:column;padding:56px 24px 32px;background:var(--md-sys-color-surface);overflow:auto}
.welcome .mark svg{width:96px;height:96px}
.welcome h2{font:var(--md-sys-typescale-headline-medium);margin-top:32px}
.welcome p{margin-top:12px;color:var(--md-sys-color-on-surface-variant)}
.welcome .acts{margin-top:auto;padding-top:24px;display:grid;gap:8px}
.welcome .loc{display:flex;gap:16px;align-items:flex-start;margin-top:24px;padding:16px;border-radius:var(--md-sys-shape-corner-large);background:var(--md-sys-color-surface-container)}
.welcome .loc svg{width:24px;height:24px;fill:var(--md-sys-color-primary);flex:none}

/* ---------- Simulation page ---------- */
.sim-banner{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:8px 16px;background:var(--md-sys-color-possible-container);color:var(--md-sys-color-on-possible-container);font:var(--md-sys-typescale-label-large);text-align:center}
.sim-banner svg{width:18px;height:18px;fill:currentColor}
.judge{max-width:1200px;margin:0 auto;padding:24px;display:grid;gap:32px;justify-items:center}
.guide{max-width:440px;width:100%}
.guide>*+*{margin-top:16px}
.guide h1{font:var(--md-sys-typescale-headline-large)}
.guide ol{margin:0;padding:0;list-style:none;display:grid;gap:12px}
.guide ol li{display:flex;gap:12px;align-items:flex-start}
.guide ol .step-n{width:28px;height:28px;margin:0;font:var(--md-sys-typescale-label-large);flex:none}
@media(min-width:900px){.judge{grid-template-columns:auto 1fr;align-items:center;justify-items:start;min-height:calc(100dvh - 40px);gap:56px;padding:32px 48px}.judge .phone{height:min(780px,calc(100dvh - 104px));width:auto}}
@media(max-width:899px){body.sim{overflow:hidden}.judge{padding:0;display:block}.judge .phone{width:100%;height:calc(100dvh - 40px);aspect-ratio:auto;border-radius:0;padding:0;background:none;box-shadow:none}.judge .phone::before{display:none}.judge .phone>.screen{border-radius:0}.judge .statusbar{display:none}.guide{display:none}}

/* ---------- Public pages (areas, install, privacy, 404) ---------- */
.site-top{display:flex;align-items:center;gap:8px;min-height:64px;padding:0 16px;max-width:840px;margin:0 auto}
.site-top nav{margin-left:auto;display:flex;gap:4px}
.site-top nav a{display:inline-flex;align-items:center;min-height:48px;padding:0 12px;border-radius:var(--md-sys-shape-corner-full);color:var(--md-sys-color-on-surface-variant);text-decoration:none;font:var(--md-sys-typescale-label-large)}
.site{max-width:840px;margin:0 auto;padding:8px 16px 48px}
.site h1{font:var(--md-sys-typescale-headline-large);margin:16px 0}
.site h2{font:var(--md-sys-typescale-title-large);margin:32px 0 12px}
.site p,.site li{max-width:68ch}
.site p+p{margin-top:8px}
.site ul.list{padding-left:20px;list-style:disc}
.site ul.list li+li{margin-top:6px}
.site ul.plain{list-style:none;padding:0;margin:0;border-radius:var(--md-sys-shape-corner-large);overflow:hidden;background:var(--md-sys-color-surface-container-low)}
.site ul.plain li{display:flex;align-items:center;gap:16px;min-height:56px;padding:8px 16px;border-top:1px solid var(--md-sys-color-outline-variant)}
.site ul.plain li:first-child{border-top:0}
.site .btn{margin:8px 8px 0 0}
.site .btn.alt{background:transparent;color:var(--md-sys-color-primary);border:1px solid var(--md-sys-color-outline)}
.site .state{margin:16px 0;padding:20px;border-radius:var(--md-sys-shape-corner-extra-large);background:var(--st-c,var(--md-sys-color-surface-container-highest));color:var(--st-on,var(--md-sys-color-on-surface))}
.site .state .label{font:var(--md-sys-typescale-headline-small);margin:0 0 4px}
.site .state p{margin:4px 0}
.site .chip{border-color:transparent;background:var(--st-c);color:var(--st-on)}
.site .note{color:var(--md-sys-color-on-surface-variant);font:var(--md-sys-typescale-body-medium)}
.site .banner{border-radius:var(--md-sys-shape-corner-medium);padding:12px 16px;background:var(--md-sys-color-possible-container);color:var(--md-sys-color-on-possible-container);font:var(--md-sys-typescale-label-large)}
.site svg.map{width:100%;height:auto;max-height:70vh;border-radius:var(--md-sys-shape-corner-large);background:var(--md-sys-color-surface-container)}
.site svg.map path{fill:var(--map,var(--md-map-nodata));stroke:var(--md-sys-color-surface-container);stroke-width:1}
.site svg.map path.none{fill:var(--md-sys-color-surface-container-highest)}
.site svg.map text{font:600 14px var(--md-font);fill:var(--md-sys-color-on-surface);paint-order:stroke;stroke:var(--md-sys-color-surface-container);stroke-width:3px}
.site-foot{max-width:840px;margin:0 auto;padding:24px 16px 48px;display:flex;flex-wrap:wrap;gap:4px 16px;border-top:1px solid var(--md-sys-color-outline-variant);color:var(--md-sys-color-on-surface-variant)}
.site-foot a{color:inherit;min-height:48px;min-width:48px;justify-content:center;display:inline-flex;align-items:center}
`;

export const APP_CSS = CSS.replace(/\n+/g, '\n').trim();
