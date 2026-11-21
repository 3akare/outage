// The one stylesheet, served at /app.css (ADR 0054). Outage Daylight: calm and light in the manner of Apple's own apps.
// A soft grey page with white grouped cards, near-black ink, primary actions in ink, Inter for every word, thin round
// icons, colour kept for the four power states. Tokens come from core/shared/design/tokens.json through tokens.gen.ts,
// the same file the Android theme is built from. The spec is docs/design/daylight.md.
import { TOKENS_CSS } from './tokens.gen.ts';

// Hallmark stamp and critique (the first CSS line, as Hallmark's floor asks).
const STAMP = `/* Hallmark · v2.0.0 · custom: Daylight (by request: clean, light, Apple-like, status first) · genre: modern-minimal · posture: restrained · nav: glass bar, mark and name, one ink pill · footer: hairline, mark and links · hero: centred head over the live map stage · signature: the status hero, one giant answer to "is the power on" */
/* Hallmark · critique: one answer per screen; grey page and white cards; ink actions; colour only for power; no eyebrows, no decorative dots, no shadows on cards */
/* Hallmark · answered F7 · grouped white cards on the grey page are the one container by design, as in iOS; roles differ by size, radius and tint */`;

const FONT = `
@font-face{font-family:Inter;src:url(/fonts/inter.woff2) format("woff2");font-weight:100 900;font-style:normal;font-display:swap}
:root{--shadow-float:0 1px 2px rgb(0 0 0/.06),0 8px 28px rgb(0 0 0/.10);--shadow-pop:0 2px 6px rgb(0 0 0/.08),0 24px 60px rgb(0 0 0/.18);--shadow-knob:0 2px 6px rgb(0 0 0/.18);--shadow-hair:0 1px 2px rgb(0 0 0/.06);--shadow-seg:0 1px 3px rgb(0 0 0/.12);--glass:rgb(255 255 255/.78);--scrim:rgb(0 0 0/.32);--ease:cubic-bezier(.2,.8,.2,1)}`;

const BASE = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;overflow-x:clip}
body{margin:0;overflow-x:clip;background:var(--c-paper-2);color:var(--c-ink);font:var(--t-body);letter-spacing:var(--tr-body);font-optical-sizing:auto;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;font-feature-settings:"cv11","ss03"}
h1,h2,h3,p,ul,ol,dl,dd,figure{margin:0}
ul,ol{padding:0;list-style:none}
a{color:var(--c-link);text-decoration:none}
a:hover{text-decoration:underline}
button,input,select{font:inherit;color:inherit;letter-spacing:inherit}
button{cursor:pointer;background:none;border:0;padding:0}
:focus-visible{outline:3px solid var(--c-focus);outline-offset:2px;transition:none}
.ico{width:20px;height:20px;flex:none}
.mark{width:22px;height:22px;flex:none;display:block}
.visually-hidden{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.container{width:100%;max-width:1080px;margin:0 auto;padding:0 20px}
.num{font-variant-numeric:tabular-nums}
.sub{color:var(--c-muted);font:var(--t-subhead);letter-spacing:var(--tr-subhead)}
.tag{display:inline-flex;align-items:center;height:24px;padding:0 8px;border-radius:var(--r-full);background:var(--c-paper-3);color:var(--c-ink-2);font:var(--t-caption);white-space:nowrap}
.brand{display:inline-flex;align-items:center;gap:8px;min-height:44px;color:var(--c-ink);font:var(--t-headline);letter-spacing:-.01em}
.brand:hover{text-decoration:none}
.brand .mark{width:24px;height:24px}
[data-state]{--st:var(--c-muted);--st-bg:var(--c-paper-3);--st-on:var(--c-ink-2);--st-v:var(--map-nodata)}
[data-state="NORMAL"]{--st:var(--c-normal);--st-bg:var(--c-normal-container);--st-on:var(--c-on-normal-container);--st-v:var(--map-normal)}
[data-state="POSSIBLE"]{--st:var(--c-possible);--st-bg:var(--c-possible-container);--st-on:var(--c-on-possible-container);--st-v:var(--map-possible)}
[data-state="CONFIRMED"]{--st:var(--c-confirmed);--st-bg:var(--c-confirmed-container);--st-on:var(--c-on-confirmed-container);--st-v:var(--map-confirmed)}
[data-state="RESTORED"]{--st:var(--c-restored);--st-bg:var(--c-restored-container);--st-on:var(--c-on-restored-container);--st-v:var(--map-restored)}
.word{color:var(--st);font-weight:600}
.sw{display:inline-block;width:12px;height:12px;border-radius:4px;flex:none;background:var(--st-v)}

/* Buttons: ink pills for the one main action, filled grey for the rest, plain link text for the quiet ones. */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 20px;border-radius:var(--r-full);font:var(--t-headline);letter-spacing:var(--tr-headline);text-decoration:none;white-space:nowrap;user-select:none;transition:transform .15s var(--ease),background-color .15s var(--ease),opacity .15s var(--ease);background:var(--c-paper-3);color:var(--c-ink)}
.btn:hover{text-decoration:none;background:var(--c-rule)}
.btn:active{transform:scale(.97)}
.btn[disabled],.btn[aria-disabled="true"],.btn.primary[disabled]{background:var(--c-paper-3);color:var(--c-muted);cursor:not-allowed;transform:none}
.btn.primary{background:var(--c-accent);color:var(--c-accent-ink)}
.btn.primary:hover{background:var(--c-ink-2)}
.btn.text{background:none;color:var(--c-link);padding:0 8px}
.btn.text:hover{background:none;text-decoration:underline}
.btn.lg{min-height:52px;padding:0 28px;font-size:1.0625rem}
.btn.block{width:100%}
.btn .ico{width:18px;height:18px}

/* Grouped inset lists, as in iOS Settings. */
.sec{margin:28px 20px 8px;color:var(--c-muted);font:var(--t-footnote);letter-spacing:var(--tr-footnote)}
.sec:first-child{margin-top:8px}
.group{background:var(--c-paper);border-radius:var(--r-l);overflow:hidden}
.group>li{position:relative}
.group>li+li::before{content:"";position:absolute;top:0;right:0;left:16px;height:1px;background:var(--c-rule)}
.group.tiles>li+li::before{left:58px}
.row{display:flex;align-items:center;gap:16px;width:100%;min-height:52px;padding:8px 16px;text-align:left;color:var(--c-ink);transition:background-color .15s var(--ease)}
a.row:hover{text-decoration:none}
button.row:hover,a.row:hover{background:var(--c-paper-2)}
.row .txt{display:flex;flex-direction:column;flex:1;min-width:0}
.row .txt b{font:var(--t-body);letter-spacing:var(--tr-body);font-weight:500}
.row .txt span{color:var(--c-muted);font:var(--t-subhead);letter-spacing:var(--tr-subhead)}
.row .val{color:var(--c-muted);font:var(--t-body);white-space:nowrap}
.row .val.word{color:var(--st);font-weight:600}
.row>.ico:last-child{color:var(--c-rule-2);width:18px;height:18px}
.tile{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;flex:none;color:var(--c-paper);background:var(--c-tile-grey)}
.tile .ico{width:18px;height:18px;stroke-width:2}
.tile.blue{background:var(--c-tile-blue)}.tile.green{background:var(--c-tile-green)}.tile.orange{background:var(--c-tile-orange)}.tile.red{background:var(--c-tile-red)}
.tile.indigo{background:var(--c-tile-indigo)}.tile.teal{background:var(--c-tile-teal)}.tile.pink{background:var(--c-tile-pink)}
.row.danger .txt b{color:var(--c-confirmed)}
.foot{margin:8px 20px 0;color:var(--c-muted);font:var(--t-footnote);letter-spacing:var(--tr-footnote)}
.switch{position:relative;width:51px;height:31px;flex:none;border-radius:var(--r-full);background:var(--c-rule-2);transition:background-color .2s var(--ease)}
.switch::after{content:"";position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:var(--c-paper);box-shadow:var(--shadow-knob);transition:transform .2s var(--ease)}
[aria-checked="true"] .switch{background:var(--c-tile-green)}
[aria-checked="true"] .switch::after{transform:translateX(20px)}

.card{background:var(--c-paper);border-radius:var(--r-l);padding:20px}
.card h2,.card h3{font:var(--t-title-3);letter-spacing:var(--tr-title-3)}
.card .sub{margin-top:4px}

details summary{min-height:44px;display:flex;align-items:center;color:var(--c-link);font:var(--t-subhead);cursor:pointer;list-style:none}
details summary::-webkit-details-marker{display:none}
table{width:100%;border-collapse:collapse;font:var(--t-subhead);font-variant-numeric:tabular-nums}
th{text-align:left;color:var(--c-muted);font:var(--t-footnote);padding:8px 8px 8px 0;border-bottom:1px solid var(--c-rule)}
td{padding:12px 8px 12px 0;border-bottom:1px solid var(--c-rule)}
tr:last-child td{border-bottom:0}
`;

/* ---------------- The website: landing and the plain pages ---------------- */
const SITE = `
.site-top{position:sticky;top:0;z-index:20;background:var(--glass);-webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);border-bottom:1px solid var(--c-rule)}
.site-top .container{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:60px}
.site-top nav{display:flex;align-items:center;gap:4px}
.site-top nav a:not(.btn){display:inline-flex;align-items:center;min-height:44px;padding:0 12px;color:var(--c-ink-2);font:var(--t-subhead)}
.site-top nav a:not(.btn):hover{color:var(--c-ink);text-decoration:none}
.site-top .btn{min-height:44px;padding:0 16px;font-size:.9375rem}
@media (max-width:600px){.site-top nav a.hide-s{display:none}}

/* Landing */
.hero{padding:72px 0 0;text-align:center}
.hero h1{max-width:13ch;margin:0 auto;font:var(--t-display);letter-spacing:var(--tr-display);font-size:clamp(2.75rem,7.4vw,5rem);line-height:1.02;overflow-wrap:break-word;min-width:0;text-wrap:balance}
.hero .lead{max-width:30ch;margin:20px auto 0;color:var(--c-muted);font:var(--t-title-3);font-weight:400;font-size:clamp(1.1875rem,2.2vw,1.4375rem);line-height:1.35;text-wrap:balance}
.hero .actions{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:12px 20px;margin-top:32px}
.stage{position:relative;margin:56px auto 0;max-width:1080px;padding:0 20px}
.stage-in{position:relative;height:clamp(440px,58vw,640px);border-radius:var(--r-xl);overflow:hidden;background:var(--c-paper-3)}
.stage .map{position:absolute;inset:0}
.stage .nowcard{position:absolute;left:24px;bottom:24px;width:min(340px,calc(100% - 48px));z-index:2;box-shadow:var(--shadow-pop)}
.stage .maplegend{position:absolute;right:16px;top:16px;z-index:2}
@media (max-width:600px){.stage{padding:0 12px}.stage-in{height:560px}.stage .nowcard{left:12px;bottom:12px;width:calc(100% - 24px)}.stage .nowcard .status-top{padding:16px 20px 16px}.stage .nowcard .status-word{font-size:2.5rem}.stage .nowcard .status-body{padding:16px 20px 16px}.stage .maplegend{display:none}}

.section{padding:112px 0 0}
.section:last-of-type{padding-bottom:112px}
.section h2{max-width:20ch;font:var(--t-large-title);letter-spacing:var(--tr-large-title);font-size:clamp(2rem,4.4vw,3rem);line-height:1.08;text-wrap:balance;overflow-wrap:break-word;min-width:0}
.section .lead{max-width:46ch;margin-top:16px;color:var(--c-muted);font:var(--t-title-3);font-weight:400;line-height:1.4}
.timeline{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:48px}
.timeline li{background:var(--c-paper);border-radius:var(--r-l);padding:24px 20px 28px}
.timeline time{display:block;font:var(--t-title-1);letter-spacing:var(--tr-title-1);font-variant-numeric:tabular-nums}
.timeline li[data-state] time{color:var(--st)}
.timeline h3{margin-top:28px;font:var(--t-headline)}
.timeline p{margin-top:8px;color:var(--c-muted);font:var(--t-subhead)}
@media (max-width:860px){.timeline{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:480px){.timeline{grid-template-columns:minmax(0,1fr)}}
.bento{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin-top:48px}
.bento>li{background:var(--c-paper);border-radius:var(--r-l);padding:28px;display:flex;flex-direction:column;gap:12px;grid-column:span 3}
.bento h3{font:var(--t-title-2);letter-spacing:var(--tr-title-2)}
.bento p{color:var(--c-muted);font:var(--t-callout)}
.bento .tile{width:44px;height:44px;border-radius:12px}
.bento .tile .ico{width:24px;height:24px}
@media (max-width:860px){.bento>li{grid-column:span 6}}
.facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:48px}
.facts li{background:var(--c-paper);border-radius:var(--r-l);padding:24px}
.facts b{display:block;font:var(--t-title-3)}
.facts span{display:block;margin-top:8px;color:var(--c-muted);font:var(--t-subhead)}
@media (max-width:760px){.facts{grid-template-columns:minmax(0,1fr)}}
.get{text-align:center}
.get h2,.get .lead{margin-left:auto;margin-right:auto}
.stores{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-top:32px}
.store{display:inline-flex;align-items:center;gap:12px;min-height:56px;padding:0 24px 0 16px;border-radius:var(--r-m);background:var(--c-accent);color:var(--c-accent-ink);text-align:left;transition:transform .15s var(--ease),background-color .15s var(--ease)}
.store:hover{text-decoration:none;background:var(--c-ink-2)}
.store:active{transform:scale(.98)}
.store .ico{width:24px;height:24px}
.store small{display:block;font:var(--t-caption);opacity:.8}
.store b{display:block;font:var(--t-headline)}
.get .muted{margin-top:24px;color:var(--c-muted);font:var(--t-subhead)}
.site-foot{border-top:1px solid var(--c-rule);padding:32px 0 48px;color:var(--c-muted);font:var(--t-footnote)}
.site-foot .container{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px 32px}
.site-foot ul{display:flex;flex-wrap:wrap;gap:0 4px}
.site-foot li a{display:inline-flex;align-items:center;min-height:44px;padding:0 8px;color:var(--c-ink-2)}
.site-foot small{flex-basis:100%;font:var(--t-footnote)}

/* Plain pages: one readable column on the grey page. */
.site{max-width:720px;padding-top:48px;padding-bottom:80px}
.site h1{font:var(--t-large-title);letter-spacing:var(--tr-large-title);font-size:clamp(2rem,5vw,2.75rem);line-height:1.1;text-wrap:balance;overflow-wrap:break-word;min-width:0}
.site h1+p{margin-top:12px;color:var(--c-muted);font:var(--t-title-3);font-weight:400}
.site h2{margin:48px 0 12px;font:var(--t-title-2);letter-spacing:var(--tr-title-2)}
.site p{margin-top:12px;color:var(--c-ink-2)}
.site .list,.site ol,.site .plain{background:var(--c-paper);border-radius:var(--r-l);padding:4px 0}
.site .list li,.site ol li,.site .plain li{position:relative;padding:16px 20px;color:var(--c-ink-2)}
.site .list li+li::before,.site ol li+li::before,.site .plain li+li::before{content:"";position:absolute;top:0;left:20px;right:0;height:1px;background:var(--c-rule)}
.site ol{counter-reset:n}
.site ol li{counter-increment:n;padding-left:52px}
.site ol li::after{content:counter(n);position:absolute;left:20px;top:14px;color:var(--c-muted);font-weight:600;font-variant-numeric:tabular-nums}
.site .note{color:var(--c-muted);font:var(--t-footnote)}
.site .actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}
.site code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.8125rem;word-break:break-all}
.chip{display:inline-flex;align-items:center;height:26px;padding:0 8px;border-radius:var(--r-full);background:var(--st-bg);color:var(--st-on);font:var(--t-footnote);font-weight:600}
.chip[data-state="SPOT_ONLY"]{background:var(--c-paper-3);color:var(--c-ink-2)}
svg.map{display:block;width:100%;height:auto;margin-top:28px;background:var(--c-paper);border-radius:var(--r-l)}
svg.map path{fill:var(--st-v);fill-opacity:.55;stroke:var(--c-paper);stroke-width:1}
svg.map path.grid{fill:none;stroke:var(--c-ink);stroke-opacity:.35;stroke-width:.3}
svg.map path.none{fill:var(--c-paper-3);fill-opacity:1}
svg.map text{font:var(--t-caption);fill:var(--c-ink-2)}
`;

/* ---------------- The app in the browser ---------------- */
const APP = `
body.sim{height:100dvh;display:flex;flex-direction:column;overflow:hidden;background:var(--c-paper-2)}
.sim-banner{flex:none;display:flex;align-items:center;gap:8px;min-height:44px;padding:4px 12px 4px 16px;background:var(--c-ink);color:var(--c-paper);font:var(--t-footnote);z-index:40}
.sim-banner .ico{width:16px;height:16px}
.sim-banner p{flex:1;min-width:0}
.sim-banner ul{display:flex;gap:2px}
.sim-banner a{display:inline-flex;align-items:center;min-height:44px;padding:0 8px;color:var(--c-paper);font-weight:600}
@media (max-width:700px){.sim-banner .hide-s{display:none}.sim-banner a.hide-s{display:none}}

.app{position:relative;flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;grid-template-areas:"main" "bar"}
.screen{grid-area:main;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.screen[hidden]{display:none}
.screen-in{max-width:640px;margin:0 auto;padding:20px 20px 40px}
.screen-in.wide{max-width:1040px}
.mapwrap{grid-area:main;position:relative;min-height:0}
.app:not([data-tab="map"]) .mapwrap{visibility:hidden;pointer-events:none}
.app:not([data-tab="map"]) .mapwrap .maplibregl-control-container{display:none}
.mapwrap .map{position:absolute;inset:0}
.app.intro .screen,.app.intro .mapwrap{visibility:hidden}

/* Tab bar: phone at the bottom, computer on the left. */
.rail{grid-area:bar;display:grid;grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);padding:4px max(8px,env(safe-area-inset-right)) calc(4px + env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));background:var(--glass);-webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);border-top:1px solid var(--c-rule);z-index:30}
.rail .rail-brand{display:none}
.rail button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:52px;color:var(--c-muted);font:var(--t-caption);transition:color .15s var(--ease)}
.rail button .ico{width:24px;height:24px}
.rail button[aria-current="page"]{color:var(--c-ink)}
.rail button[aria-current="page"] .ico{stroke-width:2.25}
.rail button:active .ico{transform:scale(.92)}

@media (min-width:900px){
  .app{grid-template-columns:232px minmax(0,1fr);grid-template-rows:minmax(0,1fr);grid-template-areas:"bar main"}
  .app[data-tab="now"]{grid-template-columns:232px 440px minmax(0,1fr);grid-template-areas:"bar main map"}
  .app[data-tab="now"] .mapwrap{grid-area:map;visibility:visible;pointer-events:auto}
  .app[data-tab="now"] .mapwrap .maplibregl-control-container{display:block}
  .app[data-tab="now"] .mapwrap .search,.app[data-tab="now"] .mapwrap .sheet{display:none}
  .app[data-tab="now"] #now{border-right:1px solid var(--c-rule)}
  .app[data-tab="now"] #now .screen-in{padding:28px 24px 40px}
  .rail{grid-template-columns:none;grid-auto-flow:row;grid-auto-columns:auto;grid-auto-rows:min-content;align-content:start;gap:2px;padding:20px 12px;border-top:0;border-right:1px solid var(--c-rule);background:var(--c-paper-2);-webkit-backdrop-filter:none;backdrop-filter:none}
  .rail .rail-brand{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 12px;margin-bottom:16px;color:var(--c-ink);font:var(--t-headline)}
  .rail .rail-brand .mark{width:24px;height:24px}
  .rail button{flex-direction:row;justify-content:flex-start;gap:12px;min-height:44px;padding:0 12px;border-radius:var(--r-s);font:var(--t-body);font-weight:500;color:var(--c-ink-2)}
  .rail button .ico{width:22px;height:22px}
  .rail button:hover{background:var(--c-paper-3)}
  .rail button[aria-current="page"]{background:var(--c-paper);color:var(--c-ink);box-shadow:var(--shadow-hair)}
  .screen-in{padding:40px 40px 64px}
}

/* Screen titles, as an iOS large title. */
.head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:8px 4px 20px}
.head h1{font:var(--t-large-title);letter-spacing:var(--tr-large-title);overflow-wrap:break-word;min-width:0}
.head .over{color:var(--c-muted);font:var(--t-subhead);margin-bottom:2px}
.head .tag{margin-bottom:8px}

/* The status hero: the one answer. */
#maprow{margin-top:28px}
#maprow .row .txt{flex:1}
.track{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin-top:16px}
.track li{color:var(--c-muted);font:var(--t-caption)}
.track li::before{content:"";display:block;height:6px;margin-bottom:8px;border-radius:3px;background:var(--c-paper-3);transition:background-color .4s var(--ease)}
.track li.done{color:var(--c-ink)}
.track li.done::before{background:var(--st-v)}
.why{margin-top:12px}
.why ul{margin-top:8px;display:grid;gap:8px}
.why li{color:var(--c-ink-2);font:var(--t-subhead)}
.why h2{font:var(--t-headline)}
.weekbars{padding:4px 16px 16px}
.weekbars .mini{min-height:72px}

/* The map tab: floating search, legend, controls and the area sheet. */
.search{position:absolute;top:12px;left:12px;right:12px;z-index:5;max-width:420px}
.search-box{display:flex;align-items:center;gap:8px;height:52px;padding:0 8px 0 16px;border-radius:var(--r-full);background:var(--c-paper);box-shadow:var(--shadow-float)}
.search-box .mark{width:22px;height:22px;color:var(--c-ink)}
.search input{flex:1;min-width:0;height:100%;border:0;background:none;outline:none;font:var(--t-body);color:var(--c-ink)}
.search input::placeholder{color:var(--c-muted)}
.search input::-webkit-search-cancel-button{display:none}
.icon-btn{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;color:var(--c-ink-2);flex:none;transition:background-color .15s var(--ease)}
.icon-btn:hover{background:var(--c-paper-2)}
.icon-btn[hidden]{display:none}
.suggest{margin-top:8px;border-radius:var(--r-l);background:var(--c-paper);box-shadow:var(--shadow-float);overflow:hidden}
.suggest[hidden]{display:none}
.suggest{max-height:50vh;overflow-y:auto}
.suggest li{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:52px;padding:0 16px;cursor:pointer}
.suggest li+li{border-top:1px solid var(--c-rule)}
.suggest li:hover{background:var(--c-paper-2)}
.suggest li b{font-weight:500}
.suggest li.none{color:var(--c-muted);cursor:default;font:var(--t-subhead)}
.maplegend{display:flex;gap:12px;padding:8px 16px;border-radius:var(--r-full);background:var(--c-paper);box-shadow:var(--shadow-float);font:var(--t-caption);color:var(--c-ink-2)}
.maplegend span{display:inline-flex;align-items:center;gap:8px}
.mapwrap .maplegend{position:absolute;left:12px;bottom:16px;z-index:4}
.mapctl{position:absolute;right:12px;bottom:16px;z-index:4;display:flex;flex-direction:column;gap:8px}
.fab{display:grid;place-items:center;width:48px;height:48px;border-radius:50%;background:var(--c-paper);color:var(--c-ink);box-shadow:var(--shadow-float);transition:transform .15s var(--ease)}
.fab:active{transform:scale(.94)}
.zoom{display:flex;flex-direction:column;border-radius:var(--r-full);background:var(--c-paper);box-shadow:var(--shadow-float);overflow:hidden}
.zoom button{display:grid;place-items:center;width:48px;height:46px;color:var(--c-ink)}
.zoom button+button{border-top:1px solid var(--c-rule)}
.zoom button:hover,.fab:hover{background:var(--c-paper-2)}
.sheet{position:absolute;left:0;right:0;bottom:0;z-index:6;max-height:72%;overflow-y:auto;overscroll-behavior:contain;padding:8px 20px 24px;border-radius:var(--r-xl) var(--r-xl) 0 0;background:var(--c-paper-2);box-shadow:var(--shadow-pop);transition:transform .3s var(--ease)}
.sheet[hidden]{display:block;transform:translateY(105%);visibility:hidden}
.sheet .grab{display:block;width:100%;height:24px;margin:0 0 4px}
.sheet .grab span{display:block;width:36px;height:5px;margin:0 auto;border-radius:3px;background:var(--c-rule-2)}
@media (min-width:900px){
  .sheet{left:16px;right:auto;top:80px;bottom:16px;width:400px;max-height:none;border-radius:var(--r-xl)}
  .sheet .grab{display:none}
  .search{top:16px;left:16px}
}
.area-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:4px 4px 16px}
.area-head h2{font:var(--t-title-1);letter-spacing:var(--tr-title-1);overflow-wrap:break-word;min-width:0}
.area-head .sub{margin-top:4px}
.area-head .icon-btn{background:var(--c-paper-3)}
.counts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.counts div{padding:16px 12px;border-radius:var(--r-m);background:var(--c-paper);text-align:left}
.counts b{display:block;color:var(--st);font:var(--t-title-1);font-variant-numeric:tabular-nums}
.counts span{color:var(--c-muted);font:var(--t-footnote)}
.btns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
.btns .btn{width:100%}
.btn[aria-pressed="true"]{background:var(--c-accent);color:var(--c-accent-ink)}

/* The place picker on the Now tab: local government, ward, block. */
.picker{display:grid;gap:12px}
.picker .field{display:grid;gap:4px}
.picker .field span{color:var(--c-muted);font:var(--t-footnote)}
.picker select{width:100%;min-height:44px;padding:0 12px;border:0;border-radius:var(--r-s);background:var(--c-paper-3);color:var(--c-ink);font:var(--t-body)}
.picker select:disabled{opacity:.5}
.picker .btn{margin-top:4px}

.cards{display:grid;gap:12px;margin-top:12px}
@media (min-width:1100px){.cards.two{grid-template-columns:repeat(2,minmax(0,1fr))}}
.card .btn{margin-top:12px}

/* Floating messages */
.toast{position:absolute;left:50%;bottom:calc(84px + env(safe-area-inset-bottom));z-index:50;max-width:min(420px,calc(100% - 32px));padding:12px 16px;border-radius:var(--r-m);background:var(--c-ink);color:var(--c-paper);font:var(--t-subhead);opacity:0;transform:translate(-50%,8px);pointer-events:none;transition:opacity .2s var(--ease),transform .2s var(--ease)}
.toast.on{opacity:1;transform:translate(-50%,0)}
@media (min-width:900px){.toast{bottom:24px;left:calc(50% + 116px)}}
.notif{position:absolute;top:10px;left:50%;z-index:55;display:flex;gap:12px;align-items:flex-start;width:min(420px,calc(100% - 20px));padding:16px 16px;border-radius:var(--r-l);background:var(--glass);-webkit-backdrop-filter:saturate(180%) blur(24px);backdrop-filter:saturate(180%) blur(24px);box-shadow:var(--shadow-pop);display:none;transform:translateX(-50%)}
.notif.on{display:flex;animation:drop .25s var(--ease)}
.notif-ico{display:grid;place-items:center;width:38px;height:38px;border-radius:9px;background:var(--c-brand);color:var(--c-paper);flex:none}
.notif-ico .mark{width:22px;height:22px}
.notif b{display:block;font:var(--t-headline)}
.notif span#notifb{display:block;color:var(--c-ink-2);font:var(--t-subhead)}

/* Dialogs: first run, the location prompt, the Light Alarm. */
.scrim{position:absolute;inset:0;z-index:70;display:grid;place-items:end center;padding:12px;background:var(--scrim);animation:fade .25s var(--ease)}
@media (min-width:600px){.scrim{place-items:center}}
.dialog{width:min(420px,100%);max-height:100%;overflow-y:auto;padding:28px 24px 20px;border-radius:var(--r-xl);background:var(--c-paper);box-shadow:var(--shadow-pop);animation:rise .3s var(--ease)}
.dialog .appicon{display:grid;place-items:center;width:64px;height:64px;border-radius:15px;background:var(--c-brand);color:var(--c-paper)}
.dialog .appicon .mark{width:36px;height:36px}
.dialog h2{margin-top:20px;font:var(--t-title-1);letter-spacing:var(--tr-title-1)}
.dialog>p{margin-top:8px;color:var(--c-ink-2);font:var(--t-callout)}
.dialog .note{display:flex;gap:12px;align-items:flex-start;margin-top:20px;padding:16px;border-radius:var(--r-m);background:var(--c-paper-2);color:var(--c-ink-2);font:var(--t-subhead)}
.dialog .note .ico{margin-top:1px;color:var(--c-muted)}
.dialog .acts{display:grid;gap:8px;margin-top:24px}
.dialog .acts .btn{width:100%}
.dialog.perm{text-align:center}
.dialog.perm>.ico{width:28px;height:28px;color:var(--c-ink-2);margin:0 auto}
.dialog.perm .h{margin-top:12px;font:var(--t-headline)}
.dialog.perm .sub{margin-top:12px}
.alarm{position:absolute;inset:0;z-index:80;display:grid;place-items:center;padding:24px;background:var(--c-restored-container);text-align:center}
.alarm-card{animation:rise .35s var(--ease)}
.alarm-card{max-width:420px}
.alarm .halo{display:grid;place-items:center;width:96px;height:96px;margin:0 auto;border-radius:50%;background:var(--map-restored);color:var(--c-paper);animation:pulse 1.6s var(--ease) infinite}
.alarm .halo .ico{width:44px;height:44px}
.alarm h2{margin-top:28px;color:var(--c-on-restored-container);font:var(--t-display);letter-spacing:var(--tr-display);font-size:clamp(2.75rem,10vw,4rem);line-height:1}
.alarm p{margin-top:12px;color:var(--c-on-restored-container);font:var(--t-title-3);font-weight:400}
.alarm p.sub{font:var(--t-subhead);color:var(--c-ink-2)}
.alarm .btn{margin-top:32px;min-width:220px}
.noscript{padding:16px 20px;font:var(--t-subhead)}
@keyframes fade{from{opacity:0}}
@keyframes drop{from{opacity:0;transform:translate(-50%,-16px)}}
@keyframes rise{from{opacity:0;transform:translateY(16px)}}
@keyframes pulse{50%{transform:scale(1.08)}}

/* MapLibre's own controls, quietened. */
.maplibregl-ctrl-attrib{font:var(--t-caption)!important;background:var(--glass)!important;border-radius:var(--r-full)!important}
.maplibregl-ctrl-bottom-right{bottom:76px!important}
.stage .maplibregl-ctrl-bottom-right,.app[data-tab="now"] .maplibregl-ctrl-bottom-right{bottom:0!important}
`;

const MOTION = `
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}
}`;

export const APP_CSS = `${STAMP}\n${TOKENS_CSS}${FONT}${BASE}${SITE}${APP}${MOTION}`.replace(/\n\s*/g, '\n');

/**
 * A short fingerprint of the stylesheet text (FNV-1a, 32 bits, in base 36). Every page links `/app.css?v=<this>`, so a
 * changed stylesheet is a new address and no browser or service worker can keep showing the old one. This is what
 * left some phones with an old, off-centre tab bar after a deploy (docs/session-notes.md, 2026-11-22).
 */
export const CSS_VERSION = (() => {
  let h = 0x811c9dc5;
  for (let i = 0; i < APP_CSS.length; i++) h = Math.imul(h ^ APP_CSS.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
})();
export const APP_CSS_HREF = `/app.css?v=${CSS_VERSION}`;
