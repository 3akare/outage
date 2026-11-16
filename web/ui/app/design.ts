// One stylesheet for every page the Worker serves: the landing page, the app in the browser and the public area pages.
// Built with Hallmark (theme Midnight, ADR 0052). Colours and type come from core/shared/design/tokens.json through
// tools/tokens/build.mjs, the same file the Android theme reads. The stamp below must stay the first lines of /app.css.
import { TOKENS_CSS } from './tokens.gen.ts';

const STAMP = `/* Hallmark · shape: Workbench · genre: atmospheric · theme: Midnight (by request) · redesign: full · job: try
 * hero: Stage, the head on the left and the globe on the right · nav: edge-aligned, a wordmark and one action · footer: a mast, the wordmark over the links · imagery: the product (the globe and the app, live) · signature: the real Earth turning, with Lagos lit by its power state
 * axes: dark/grotesk-sans/cool · posture: committed · contrast: pass · fold: pass · v2.0.0 */
/* Hallmark · pre-emit critique: P4 H4 E4 S5 R4 V4 · weakest: P, a utility page argues little; it leads with the one claim a reader can test, three phones agreeing */
/* Hallmark · answered F15 · the app in the browser is an app screen inside the page; its controls follow the phone, not the page's button pair */`;

const CSS = `
${TOKENS_CSS}
:root{
  --color-paper:var(--c-paper);--color-paper-2:var(--c-paper-2);--color-paper-3:var(--c-paper-3);
  --color-ink:var(--c-ink);--color-ink-2:var(--c-ink-2);--color-muted:var(--c-muted);
  --color-rule:var(--c-rule);--color-rule-2:var(--c-rule-2);
  --color-accent:var(--c-accent);--color-accent-2:var(--c-accent-2);--color-accent-ink:var(--c-accent-ink);--color-focus:var(--c-focus);
  --color-brand:var(--c-brand);
  --font-display:var(--font);--font-body:var(--font);
  --radius-card:0;--radius-pill:0;--rule-hair:1px;
  --shadow-card:0 24px 48px -24px color-mix(in oklab,var(--c-paper) 30%,var(--c-accent-ink));
  --tracking-display:-0.015em;--display-weight:300;--display-stretch:125%;
  --space-3xs:2px;--space-2xs:4px;--space-xs:8px;--space-sm:12px;--space-md:16px;--space-lg:24px;--space-xl:40px;--space-2xl:64px;--space-3xl:96px;--space-4xl:144px;
  --text-xs:0.8125rem;--text-sm:0.875rem;--text-md:1rem;--text-lg:1.25rem;--text-xl:1.5625rem;--text-2xl:1.953rem;
  --text-display-s:clamp(2.25rem,4vw + 0.5rem,3.75rem);--text-display:clamp(2.5rem,4.4vw + 1rem,4.75rem);
  --text-section:clamp(2rem,2.5vw + 1rem,3.25rem);--text-title:clamp(1.25rem,0.75vw + 0.875rem,1.625rem);--text-lead:clamp(1.125rem,0.35vw + 1rem,1.375rem);
  --ease-out:cubic-bezier(0.16,1,0.3,1);--ease-in-out:cubic-bezier(0.65,0,0.35,1);
  --dur-micro:120ms;--dur-short:220ms;--dur-long:420ms;
  --container:1200px;--gutter:64px;--gap-columns:32px;--section-gap:144px;
}
@font-face{font-family:'Mona Sans';src:url('/fonts/mona-sans.woff2') format('woff2');font-weight:200 900;font-stretch:75% 125%;font-style:normal;font-display:swap}

/* Base: the rules the Floor already decided */
*,*::before,*::after{box-sizing:border-box}
html,body{overflow-x:clip}
html{scrollbar-color:var(--color-muted) var(--color-paper);scroll-padding-top:var(--space-3xl);-webkit-text-size-adjust:100%}
body{margin:0;background:var(--color-paper);color:var(--color-ink);font-family:var(--font-body);font-size:var(--text-md);line-height:1.6;-webkit-font-smoothing:antialiased;caret-color:var(--color-accent)}
::selection{background:color-mix(in oklab,var(--color-accent) 22%,transparent);color:var(--color-ink)}
:focus-visible{outline:2px solid var(--color-focus);outline-offset:2px}
a{color:inherit;text-decoration-thickness:1px;text-underline-offset:0.16em}
a:hover{text-decoration-color:var(--color-accent)}
h1,h2,h3{margin:0;font-family:var(--font-display);font-weight:var(--display-weight);font-stretch:var(--display-stretch);font-synthesis:none;letter-spacing:var(--tracking-display);line-height:1.04;overflow-wrap:break-word;min-width:0;text-wrap:balance}
h1{max-width:16ch;font-size:var(--text-display)}h2{max-width:22ch;font-size:var(--text-section)}h3{font-size:var(--text-title);font-weight:500;font-stretch:100%;line-height:1.2;letter-spacing:0}
p{margin:0;text-wrap:pretty}
p:not([class]){max-width:65ch}
.lead{font-size:var(--text-lead);line-height:1.45;max-width:40ch;color:var(--color-ink-2)}
.muted{color:var(--color-muted)}
img,video{max-width:100%;height:auto;display:block}
svg{display:block}
[hidden]{display:none!important}
button,input,select,textarea{font:inherit;color:inherit}
.container{width:100%;max-width:var(--container);margin-inline:auto;padding-inline:var(--gutter)}
.num,.fig{font-variant-numeric:tabular-nums}
.visually-hidden,.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.mark .mk-ring{stroke:var(--color-ink)}.mark .mk-bolt{fill:var(--color-brand);stroke:var(--color-brand)}
@media (max-width:60rem){:root{--gutter:24px;--section-gap:96px}}
@media (max-width:40rem){:root{--gutter:16px;--section-gap:72px;--gap-columns:16px}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:0.01ms!important;animation-iteration-count:1!important;transition-duration:0.01ms!important;scroll-behavior:auto!important}}

/* Controls: the pair, square, 500 */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--space-xs);min-height:48px;padding:var(--space-sm) var(--space-lg);border:var(--rule-hair) solid transparent;border-radius:var(--radius-pill);background:none;color:var(--color-ink);font-weight:500;font-size:var(--text-md);text-decoration:none;cursor:pointer;transition:background-color var(--dur-short) var(--ease-out),border-color var(--dur-short) var(--ease-out),opacity var(--dur-short) var(--ease-out)}
.btn--primary,.btn.primary{background:var(--color-accent);color:var(--color-accent-ink)}
.btn--primary:hover,.btn.primary:hover{background:color-mix(in oklab,var(--color-accent) 88%,var(--color-ink))}
.btn--secondary,.btn.secondary{border-color:var(--color-rule-2)}
.btn--secondary:hover,.btn.secondary:hover{background:var(--color-paper-2)}
.btn:active{opacity:0.82}
.btn:disabled,.btn[aria-disabled=true]{opacity:0.45;cursor:default}
.btn.block{display:flex;width:100%}
.btn svg{width:18px;height:18px;fill:currentColor;flex:none}
.link{color:var(--color-ink-2);text-decoration:none;font-weight:500;font-size:var(--text-sm);min-height:48px;display:inline-flex;align-items:center;padding-inline:var(--space-xs)}
.link:hover{color:var(--color-ink);text-decoration:underline;text-decoration-color:var(--color-accent)}

/* Nav: edge-aligned, a wordmark and one action */
.nav{position:sticky;top:0;z-index:200;background:var(--color-paper);border-bottom:var(--rule-hair) solid var(--color-rule)}
.nav .container{display:flex;align-items:center;gap:var(--space-md);min-height:72px}
.brand{display:inline-flex;align-items:center;gap:var(--space-sm);min-height:48px;color:var(--color-ink);text-decoration:none;font-weight:500;font-stretch:125%;font-size:var(--text-lg);letter-spacing:var(--tracking-display)}
.brand .mark{width:30px;height:30px}
.nav .links{display:flex;gap:var(--space-2xs);margin-left:auto;align-items:center}
@media (max-width:40rem){.nav .links .link{display:none}}

/* Landing */
.hero .container{display:grid;grid-template-columns:minmax(0,6fr) minmax(0,6fr);gap:var(--gap-columns);align-items:center;min-height:min(760px,calc(100svh - 72px));padding-block:var(--space-xl)}
.hero-text{display:grid;gap:var(--space-lg);align-content:center}
.hero .actions{display:flex;flex-wrap:wrap;gap:var(--space-sm)}
.settle{animation:settle var(--dur-long) var(--ease-out) both}
@keyframes settle{from{opacity:0.6}}
.globe-stage{position:relative;aspect-ratio:1;width:100%;max-width:680px;justify-self:end}
.globe-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab}
.globe-stage figcaption{position:absolute;left:0;bottom:0;font-size:var(--text-sm);color:var(--color-muted)}
@media (max-width:60rem){.hero .container{grid-template-columns:minmax(0,1fr);min-height:0}.globe-stage{justify-self:center;max-width:520px}}
.section{padding-block:calc(var(--section-gap) / 2)}
.section .container{display:grid;gap:var(--space-xl)}
.band{background:var(--color-paper-2)}
.split{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:var(--gap-columns);align-items:start}
@media (max-width:60rem){.split{grid-template-columns:minmax(0,1fr)}}
.log{list-style:none;margin:0;padding:0;display:grid;gap:0;border-top:var(--rule-hair) solid var(--color-rule)}
.log li{display:grid;grid-template-columns:minmax(0,9rem) minmax(0,1fr);gap:var(--space-lg);padding-block:var(--space-lg);border-bottom:var(--rule-hair) solid var(--color-rule);align-items:baseline}
.log time{font-weight:300;font-stretch:125%;font-size:var(--text-xl);font-variant-numeric:tabular-nums;color:var(--color-muted)}
.log li[aria-current] time{color:var(--color-ink)}
.log b{display:block;font-weight:500;font-size:var(--text-lg)}
.log span{color:var(--color-muted)}
.meter{height:2px;background:var(--color-rule-2);margin-top:var(--space-sm)}.meter>span{display:block;height:100%;width:var(--w,40%);background:var(--color-accent)}
.statement{display:grid;grid-template-columns:auto minmax(0,1fr);gap:var(--space-xl);align-items:end}
.statement .fig{font-weight:300;font-stretch:125%;letter-spacing:-0.03em;line-height:0.82;font-size:clamp(7rem,16vw,14rem);max-width:none;color:var(--color-ink)}
.statement p:not(.fig){font-size:var(--text-lead);max-width:28ch;color:var(--color-ink-2)}
@media (max-width:40rem){.statement{grid-template-columns:minmax(0,1fr)}}
.rows{list-style:none;margin:0;padding:0;border-top:var(--rule-hair) solid var(--color-rule)}
.rows li{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:var(--gap-columns);padding-block:var(--space-lg);border-bottom:var(--rule-hair) solid var(--color-rule);align-items:baseline}
.rows h3{font-weight:300;font-stretch:125%;font-size:var(--text-xl)}
.rows p{color:var(--color-muted)}
@media (max-width:40rem){.rows li{grid-template-columns:minmax(0,1fr);gap:var(--space-xs)}}
.get{display:grid;gap:var(--space-lg)}
.stores{display:flex;flex-wrap:wrap;gap:var(--space-sm)}
.foot{border-top:var(--rule-hair) solid var(--color-rule);padding-block:var(--space-2xl) var(--space-xl)}
.foot .container{display:grid;gap:var(--space-lg)}
.foot .brand{font-size:var(--text-xl)}
.foot nav{display:flex;flex-wrap:wrap;gap:var(--space-2xs) var(--space-md)}
.foot small{color:var(--color-muted);font-size:var(--text-sm)}

/* Power states: one colour family each, never colour alone (every state also has words) */
[data-state=NORMAL]{--st:var(--c-normal);--st-c:var(--c-normal-container);--st-on:var(--c-on-normal-container);--map:var(--map-normal)}
[data-state=POSSIBLE],[data-state=SPOT_ONLY]{--st:var(--c-possible);--st-c:var(--c-possible-container);--st-on:var(--c-on-possible-container);--map:var(--map-possible)}
[data-state=CONFIRMED]{--st:var(--c-confirmed);--st-c:var(--c-confirmed-container);--st-on:var(--c-on-confirmed-container);--map:var(--map-confirmed)}
[data-state=RESTORED]{--st:var(--c-restored);--st-c:var(--c-restored-container);--st-on:var(--c-on-restored-container);--map:var(--map-restored)}
[data-state=NO_DATA],[data-state=NO_COVERAGE],[data-state=UNKNOWN]{--st:var(--color-muted);--st-c:var(--color-paper-3);--st-on:var(--color-ink-2);--map:var(--map-nodata)}
.state-chip{display:inline-flex;align-items:center;gap:var(--space-xs);min-height:28px;padding:var(--space-2xs) var(--space-sm);background:var(--st-c);color:var(--st-on);font-size:var(--text-sm);font-weight:500;white-space:nowrap}
.state-chip::before{content:"";width:8px;height:8px;background:var(--st)}
.state-card{background:var(--st-c);color:var(--st-on);padding:var(--space-md) var(--space-lg)}
.state-card .big{font-weight:300;font-stretch:125%;font-size:var(--text-2xl);line-height:1.1;margin-top:var(--space-2xs)}
.state-card .sub{color:var(--st-on);opacity:0.86}
.chip{display:inline-flex;align-items:center;gap:var(--space-2xs);min-height:28px;padding:var(--space-2xs) var(--space-sm);border:var(--rule-hair) solid var(--color-rule-2);font-size:var(--text-sm);font-weight:500;color:var(--color-ink-2);white-space:nowrap}
.chip svg{width:16px;height:16px;fill:currentColor}
.chip.sim{border-color:transparent;background:var(--c-possible-container);color:var(--c-on-possible-container)}

/* The app in the browser: an app screen, square, on the night ground */
.title-s{font-size:var(--text-sm);font-weight:500}.title-m{font-size:var(--text-md);font-weight:500}.body-m{font-size:var(--text-sm)}.body-s{font-size:var(--text-xs)}.body-l{font-size:var(--text-md)}.headline-s{font-weight:300;font-stretch:125%;font-size:var(--text-xl)}
.ico{width:24px;height:24px;fill:currentColor}
.judge{max-width:var(--container);margin-inline:auto;padding:var(--space-xl) var(--gutter);display:grid;grid-template-columns:auto minmax(0,1fr);gap:var(--space-2xl);align-items:center;min-height:calc(100svh - 41px)}
.device{width:390px;height:min(820px,calc(100svh - 120px));background:var(--color-paper-2);box-shadow:var(--shadow-card);position:relative;overflow:hidden}
.guide{display:grid;gap:var(--space-lg);max-width:44ch}
.guide h1{font-size:var(--text-display-s)}
.guide ol{margin:0;padding:0;list-style:none;border-top:var(--rule-hair) solid var(--color-rule)}
.guide li{display:grid;grid-template-columns:2rem minmax(0,1fr);gap:var(--space-sm);padding-block:var(--space-sm);border-bottom:var(--rule-hair) solid var(--color-rule);color:var(--color-ink-2)}
.guide li>span:first-child{font-weight:300;font-stretch:125%;color:var(--color-muted);font-variant-numeric:tabular-nums}
.guide .actions{display:flex;flex-wrap:wrap;gap:var(--space-sm)}
.sim-banner{position:sticky;top:0;z-index:300;display:flex;align-items:center;justify-content:center;gap:var(--space-xs);min-height:40px;padding:var(--space-xs) var(--space-md);background:var(--c-possible-container);color:var(--c-on-possible-container);font-size:var(--text-sm);font-weight:500;text-align:center}
.sim-banner svg{width:18px;height:18px;fill:currentColor}
@media (max-width:60rem){body.sim{overflow:hidden}.judge{display:block;padding:0;min-height:0}.device{width:100%;height:calc(100svh - 40px);box-shadow:none}.guide{display:none}}
.app{position:relative;height:100%;display:flex;flex-direction:column;background:var(--color-paper);overflow:hidden}
.app .view{position:relative;flex:1;min-height:0;overflow:auto}
.app .view.map{overflow:hidden}
.statusbar{display:none}
.mapwrap{position:absolute;inset:0;background:var(--color-paper);overflow:hidden}
.mapwrap canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab}
.search{position:absolute;z-index:2;top:var(--space-sm);left:var(--space-sm);right:var(--space-sm);display:flex;align-items:center;gap:var(--space-sm);min-height:56px;padding:var(--space-2xs) var(--space-xs) var(--space-2xs) var(--space-md);background:var(--color-paper-3);box-shadow:var(--shadow-card)}
.search .mark{width:26px;height:26px;flex:none}
.search .q{flex:1;min-width:0;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.legend-chip{position:absolute;z-index:2;left:var(--space-sm);right:var(--space-sm);top:80px;display:flex;flex-wrap:wrap;gap:var(--space-2xs);pointer-events:none}
.legend-chip .state-chip{background:var(--color-paper-3);color:var(--color-ink)}
.legend-chip .state-chip::before{background:var(--map)}
.mapctl{position:absolute;z-index:2;right:var(--space-sm);bottom:calc(44% + var(--space-sm));display:flex;flex-direction:column;gap:var(--space-xs)}
.fab{display:inline-grid;place-items:center;width:48px;height:48px;border:0;background:var(--color-paper-3);color:var(--color-ink);cursor:pointer;box-shadow:var(--shadow-card);transition:background-color var(--dur-short) var(--ease-out)}
.fab:hover{background:var(--color-rule)}
.fab svg{width:22px;height:22px;fill:currentColor}
.sheet{position:absolute;z-index:3;left:0;right:0;bottom:0;max-height:calc(100% - 72px);display:flex;flex-direction:column;background:var(--color-paper-2);border-top:var(--rule-hair) solid var(--color-rule-2);transition:transform var(--dur-long) var(--ease-out)}
.sheet .grab{flex:none;display:grid;place-items:center;height:44px;width:100%;border:0;background:transparent;cursor:grab}
.sheet .grab::before{content:"";width:40px;height:3px;background:var(--color-rule-2)}
.sheet .body{overflow:auto;padding:0 var(--space-md) var(--space-md);overscroll-behavior:contain;display:grid;grid-template-columns:minmax(0,1fr);gap:var(--space-sm)}
.sheet .body>*,.state-card,.page>*{min-width:0}
.spot-head{display:flex;align-items:center;justify-content:space-between;gap:var(--space-xs)}
.meta{display:flex;gap:var(--space-xs);margin-top:var(--space-sm);overflow-x:auto;scrollbar-width:none}
.meta .chip{border-color:color-mix(in oklab,var(--st-on) 30%,transparent);color:var(--st-on)}
.why{background:var(--color-paper-3);padding:var(--space-md)}
.why h3{font-size:var(--text-sm);margin-bottom:var(--space-xs)}
.why ul{margin:0;padding-left:var(--space-md);color:var(--color-muted);font-size:var(--text-sm)}
.track{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-2xs);list-style:none;margin:var(--space-sm) 0 0;padding:0}
.track li{height:2px;background:color-mix(in oklab,var(--st-on) 22%,transparent)}
.track li.done{background:var(--st-on)}
.list{list-style:none;margin:0;padding:0}
.li{display:flex;align-items:center;gap:var(--space-md);min-height:56px;padding:var(--space-xs) var(--space-md);width:100%;background:transparent;border:0;border-bottom:var(--rule-hair) solid var(--color-rule);color:inherit;text-align:left;cursor:pointer;transition:background-color var(--dur-short) var(--ease-out)}
.li:hover{background:var(--color-paper-3)}
.mini-list .li{padding-inline:0}
.li .lead{flex:none;display:grid;place-items:center;width:40px;height:40px;background:var(--color-paper-3);color:var(--color-ink-2)}
.li .lead svg{width:22px;height:22px;fill:currentColor}
.li .txt{flex:1;min-width:0}
.li .txt b{display:block;font-weight:500}
.li .txt span{display:block;font-size:var(--text-sm);color:var(--color-muted)}
.group-label{font-size:var(--text-sm);font-weight:500;color:var(--color-muted);padding:var(--space-lg) var(--space-md) var(--space-xs)}
.switch{flex:none;position:relative;width:44px;height:24px;border:var(--rule-hair) solid var(--color-rule-2);background:var(--color-paper)}
.switch::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;background:var(--color-muted);transition:transform var(--dur-short) var(--ease-out),background-color var(--dur-short) var(--ease-out)}
[aria-checked=true] .switch{border-color:var(--color-accent)}
[aria-checked=true] .switch::after{transform:translateX(20px);background:var(--color-accent)}
.navbar{flex:none;position:relative;z-index:4;display:flex;height:72px;background:var(--color-paper);border-top:var(--rule-hair) solid var(--color-rule)}
.navbar button{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--space-2xs);border:0;background:transparent;color:var(--color-muted);font-size:var(--text-xs);font-weight:500;cursor:pointer}
.navbar .pill{display:grid;place-items:center;width:56px;height:28px}
.navbar svg{width:22px;height:22px;fill:currentColor}
.navbar [aria-current=page]{color:var(--color-ink)}
.navbar [aria-current=page] .pill{background:var(--color-paper-3)}
.appbar{display:flex;align-items:center;gap:var(--space-sm);padding:var(--space-lg) var(--space-md) var(--space-sm)}
.appbar h1{font-size:var(--text-2xl);flex:1}
.page{padding:0 var(--space-md) var(--space-lg);display:grid;grid-template-columns:minmax(0,1fr);gap:var(--space-md)}
.card,.card.filled{background:var(--color-paper-2);padding:var(--space-md);display:grid;gap:var(--space-xs)}
.tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-xs)}
.tile{background:var(--color-paper-2);padding:var(--space-md)}
.tile b{display:block;font-weight:300;font-stretch:125%;font-size:var(--text-xl);font-variant-numeric:tabular-nums}
.tile span{font-size:var(--text-sm);color:var(--color-muted)}
.ring{display:flex;align-items:center;gap:var(--space-lg)}
.ring svg{width:104px;height:104px;flex:none}
.ring .track-c{fill:none;stroke:var(--color-rule-2);stroke-width:6}
.ring .val-c{fill:none;stroke:var(--color-accent);stroke-width:6;transform:rotate(-90deg);transform-origin:center}
.ring text{font-weight:300;font-size:22px;fill:var(--color-ink);text-anchor:middle;dominant-baseline:central}
.bars{display:flex;align-items:flex-end;gap:var(--space-xs);height:140px;padding-top:var(--space-xs);position:relative}
.bars .b{flex:1;display:flex;flex-direction:column;align-items:center;gap:var(--space-2xs);height:100%;justify-content:flex-end}
.bars .b i{display:block;width:100%;max-width:24px;background:var(--color-ink-2)}
.bars .b.low i{background:var(--color-rule-2)}
.bars .b span{font-size:var(--text-xs);color:var(--color-muted)}
.bars .promise{position:absolute;left:0;right:0;border-top:var(--rule-hair) dashed var(--color-accent);pointer-events:none}
.bars .promise span{position:absolute;right:0;top:-20px;font-size:var(--text-xs);color:var(--color-accent);background:var(--color-paper-2);padding:0 var(--space-2xs)}
.snack{position:absolute;z-index:6;left:var(--space-sm);right:var(--space-sm);bottom:84px;min-height:48px;padding:var(--space-sm) var(--space-md);background:var(--color-ink);color:var(--color-paper);font-size:var(--text-sm);opacity:0;transform:translateY(8px);transition:opacity var(--dur-short) var(--ease-out),transform var(--dur-short) var(--ease-out);pointer-events:none}
.snack.on{opacity:1;transform:none}
.notif{position:absolute;z-index:7;top:var(--space-sm);left:var(--space-sm);right:var(--space-sm);display:flex;gap:var(--space-sm);padding:var(--space-md);background:var(--color-paper-3);box-shadow:var(--shadow-card);transform:translateY(calc(-100% - 24px));visibility:hidden;transition:transform var(--dur-long) var(--ease-out),visibility 0s var(--dur-long)}
.notif.on{transform:none;visibility:visible;transition:transform var(--dur-long) var(--ease-out)}
.notif .mark{width:28px;height:28px;flex:none}
.notif b{display:block;font-weight:500}
.notif span{display:block;font-size:var(--text-sm);color:var(--color-muted)}
.alarm{position:absolute;z-index:8;inset:0;display:grid;place-content:center;justify-items:center;gap:var(--space-md);padding:var(--space-xl);text-align:center;background:var(--color-paper)}
.alarm .halo{display:grid;place-items:center;width:120px;height:120px;border:var(--rule-hair) solid var(--color-rule-2)}
.alarm .halo .mark{width:64px;height:64px}
.alarm h2{font-size:var(--text-section)}
.scrim{position:absolute;z-index:10;inset:0;display:grid;place-items:center;padding:var(--space-lg);background:color-mix(in oklab,var(--color-paper) 70%,transparent)}
.perm{max-width:300px;background:var(--color-paper-3);padding:var(--space-lg);display:grid;gap:var(--space-md);box-shadow:var(--shadow-card)}
.perm>svg{width:24px;height:24px;fill:var(--color-accent)}
.perm .stack{display:grid;gap:var(--space-xs)}
.welcome{position:absolute;z-index:9;inset:0;display:flex;flex-direction:column;justify-content:flex-end;gap:var(--space-md);padding:var(--space-xl) var(--space-lg) var(--space-lg);background:linear-gradient(to bottom,transparent 30%,var(--color-paper) 58%);overflow:auto}
.welcome h2{font-size:var(--text-2xl);max-width:14ch}
.welcome p{color:var(--color-ink-2)}
.welcome .loc{display:flex;gap:var(--space-md);padding:var(--space-md);background:var(--color-paper-2)}
.welcome .loc svg{width:22px;height:22px;fill:var(--color-accent);flex:none}
.welcome .acts{display:grid;gap:var(--space-xs)}
.app .search,.app .legend-chip,.app .mapctl,.app .sheet,.app .navbar{transition:opacity var(--dur-long) var(--ease-out)}
.app.intro .search,.app.intro .legend-chip,.app.intro .mapctl,.app.intro .sheet,.app.intro .navbar{opacity:0;pointer-events:none}

/* Public pages: areas, install, privacy, 404 */
.site-top{border-bottom:var(--rule-hair) solid var(--color-rule)}
.site-top .container{display:flex;align-items:center;gap:var(--space-md);min-height:72px}
.site-top nav{margin-left:auto;display:flex;gap:var(--space-2xs)}
.site{padding-block:var(--space-xl) var(--space-2xl)}
.site h1{font-size:var(--text-display-s);margin-block:var(--space-md) var(--space-lg)}
.site h2{font-size:var(--text-xl);margin-block:var(--space-xl) var(--space-sm)}
.site p+p{margin-top:var(--space-xs)}
.site ul.list{padding-left:var(--space-lg);list-style:disc;color:var(--color-ink-2)}
.site ul.plain{list-style:none;padding:0;margin:0;border-top:var(--rule-hair) solid var(--color-rule)}
.site ul.plain li{display:flex;align-items:center;gap:var(--space-md);min-height:56px;padding-block:var(--space-xs);border-bottom:var(--rule-hair) solid var(--color-rule)}
.site .btn{margin:var(--space-xs) var(--space-xs) 0 0;background:var(--color-accent);color:var(--color-accent-ink)}
.site .btn.alt{background:none;color:var(--color-ink);border-color:var(--color-rule-2)}
.site .state{margin-block:var(--space-md);padding:var(--space-lg);background:var(--st-c,var(--color-paper-2));color:var(--st-on,var(--color-ink))}
.site .state .label{font-weight:300;font-stretch:125%;font-size:var(--text-2xl);margin:0 0 var(--space-2xs)}
.site .chip{border-color:transparent;background:var(--st-c);color:var(--st-on)}
.site .note{color:var(--color-muted);font-size:var(--text-sm)}
.site .banner{padding:var(--space-sm) var(--space-md);background:var(--c-possible-container);color:var(--c-on-possible-container);font-weight:500}
.site svg.map{width:100%;height:auto;max-height:70vh;background:var(--color-paper-2)}
.site svg.map path{fill:var(--map,var(--map-nodata));stroke:var(--color-paper);stroke-width:1}
.site svg.map path.none{fill:var(--color-paper-3)}
.site svg.map text{font-weight:500;font-size:14px;fill:var(--color-ink);paint-order:stroke;stroke:var(--color-paper);stroke-width:3px}
.site-foot{border-top:var(--rule-hair) solid var(--color-rule);padding-block:var(--space-lg) var(--space-2xl)}
.site-foot .container{display:flex;flex-wrap:wrap;gap:var(--space-2xs) var(--space-md)}
`;

export const APP_CSS = `${STAMP}\n${CSS.replace(/\n+/g, '\n').trim()}`;
