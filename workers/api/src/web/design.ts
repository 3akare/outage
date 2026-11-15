// One stylesheet for the landing page and the app replica (ux-redesign task 2, ADR 0027 and 0028).
// Served from the same origin at /app.css, so the CSP needs no inline style for these pages.
// Tokens below follow ADR 0028. The generated tokens.css from tools/tokens is a later task; until then these are the source.

const TOKENS_DARK =
  '--bg:#0f141b;--raised:#171e27;--raised2:#1e2733;--line:#2b3340;--text:#eef2f6;--muted:#9aa7b5;--accent:#fff;' +
  '--normal:#3ddc97;--possible:#ffc857;--confirmed:#ff5a5f;--restored:#5ab0ff;--nodata:#3a4554;--primary:#3ddc97;--on-primary:#06210f;';
const TOKENS_LIGHT =
  '--bg:#f3f6f9;--raised:#fff;--raised2:#eaeff4;--line:#d5dde6;--text:#11181f;--muted:#4f5c69;--accent:#11181f;' +
  '--normal:#13935a;--possible:#b87900;--confirmed:#d03238;--restored:#2575c9;--nodata:#aab6c3;--primary:#0f7a4a;--on-primary:#fff;';

const CSS = `
:root{${TOKENS_DARK}color-scheme:dark}
@media(prefers-color-scheme:light){:root{${TOKENS_LIGHT}color-scheme:light}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
a{color:inherit}
h1,h2,h3,p{margin:0}
[hidden]{display:none!important}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 24px;border-radius:999px;background:var(--primary);color:var(--on-primary);font:600 16px/1 inherit;text-decoration:none;border:2px solid var(--primary);cursor:pointer}
.btn.alt{background:transparent;color:var(--text);border-color:var(--line)}
.btn.alt:hover{border-color:var(--muted)}
.btn:focus-visible,.dock a:focus-visible,.hx:focus-visible,a:focus-visible,button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.muted{color:var(--muted)}
.chip{display:inline-flex;align-items:center;gap:8px;min-height:28px;padding:0 12px;border-radius:999px;border:2px solid var(--c,var(--nodata));font-weight:600;font-size:16px;line-height:1}
.chip i{width:12px;height:12px;border-radius:3px;background:var(--c,var(--nodata));display:inline-block}
[data-state=NORMAL]{--c:var(--normal)}[data-state=POSSIBLE]{--c:var(--possible)}[data-state=CONFIRMED]{--c:var(--confirmed)}[data-state=RESTORED]{--c:var(--restored)}[data-state=NO_DATA]{--c:var(--nodata)}

/* Landing */
.land{max-width:1080px;margin:0 auto;padding:16px 20px 48px}
.land .nav{display:flex;align-items:center;justify-content:space-between;min-height:56px}
.brand{min-height:44px;display:inline-flex;align-items:center;gap:8px;font-weight:800;font-size:20px;text-decoration:none}
.brand svg{width:28px;height:28px}
.nav a.link{min-height:44px;display:inline-flex;align-items:center;padding:0 8px;text-decoration:none;color:var(--muted);font-weight:600}
.hero{display:grid;gap:24px;padding:24px 0 16px;align-items:center}
.hero h1{font-size:40px;line-height:1.1;letter-spacing:-.02em;font-weight:800}
.hero p.lead{font-size:20px;line-height:1.4;color:var(--muted);margin-top:16px}
.cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}
.hero-art{background:var(--raised);border:1px solid var(--line);border-radius:16px;padding:16px}
.hero-art svg{width:100%;height:auto;display:block;max-height:320px}
.steps{display:grid;gap:16px;margin:40px 0 0;padding:0;list-style:none}
.steps li{background:var(--raised);border:1px solid var(--line);border-radius:16px;padding:20px}
.steps .n{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--primary);color:var(--on-primary);font-weight:800;margin-bottom:12px}
.steps h3{font-size:20px;margin-bottom:4px}
.steps p{color:var(--muted)}
.privacy-line{margin-top:32px;padding:16px 20px;border-radius:16px;border:1px dashed var(--line);color:var(--muted)}
.foot{margin-top:32px;display:flex;flex-wrap:wrap;gap:4px 16px;color:var(--muted)}
.foot a{min-height:44px;display:inline-flex;align-items:center}
@media(min-width:900px){.hero{grid-template-columns:1.1fr 1fr;gap:48px;padding-top:48px}.hero h1{font-size:56px}.steps{grid-template-columns:repeat(3,1fr)}}

/* App shell */
.shell{min-height:100dvh}
.top{display:flex;align-items:center;justify-content:space-between;padding:16px 16px 0;max-width:960px;margin:0 auto}
.live{display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:16px}
.live b{width:8px;height:8px;border-radius:50%;background:var(--normal);display:inline-block}
.content{max-width:960px;margin:0 auto;padding:12px 16px 112px}
.content h1{font-size:28px;line-height:1.2;margin:8px 0 16px;letter-spacing:-.01em}
.content h2{font-size:20px;margin:24px 0 12px}
.card{background:var(--raised);border:1px solid var(--line);border-radius:16px;padding:16px}
.card+.card{margin-top:16px}
.mapcard{padding:8px}
.mapbox{position:relative}
svg.hex{display:block;width:100%;height:auto;max-height:46dvh}
.hx{stroke:var(--bg);stroke-width:1.5;vector-effect:non-scaling-stroke;fill:var(--raised2);cursor:pointer}
.hx[data-state=NO_DATA]{fill:var(--raised2);stroke:var(--nodata)}
.hx[data-state=NORMAL]{fill:var(--normal)}
.hx[data-state=POSSIBLE]{fill:url(#p-possible)}
.hx[data-state=CONFIRMED]{fill:url(#p-confirmed)}
.hx[data-state=RESTORED]{fill:var(--restored);fill-opacity:.35;stroke:var(--restored);stroke-width:2}
.hx.sel{stroke:var(--accent);stroke-width:3}
.pp-bg{fill:var(--raised2)}.pp-possible{fill:var(--possible)}.pp-confirmed{fill:var(--confirmed)}
.lbl{font:700 20px system-ui,sans-serif;fill:var(--text);text-anchor:middle;paint-order:stroke;stroke:var(--bg);stroke-width:6px;stroke-linejoin:round;pointer-events:none}
.legend{display:flex;flex-wrap:wrap;gap:8px 16px;padding:12px 8px 4px;margin:0;list-style:none;color:var(--muted)}
.legend li{display:inline-flex;align-items:center;gap:8px;min-height:28px}
.sw{width:16px;height:16px;border-radius:4px;border:2px solid var(--c);background:var(--c);display:inline-block}
.sw[data-state=POSSIBLE]{background:repeating-linear-gradient(45deg,var(--c) 0 3px,transparent 3px 6px)}
.sw[data-state=CONFIRMED]{background:radial-gradient(var(--c) 35%,transparent 40%) 0 0/6px 6px}
.sw[data-state=RESTORED]{background:color-mix(in srgb,var(--c) 35%,transparent)}
.sw[data-state=NO_DATA]{background:transparent}
.sheet{margin-top:12px;padding:16px;border-radius:16px;background:var(--raised2);border-left:6px solid var(--c,var(--nodata))}
.sheet h3{font-size:20px;margin:4px 0}
.sheet p+p{margin-top:4px}
.empty{padding:24px;text-align:center}
.empty h2{margin:0 0 8px;font-size:20px}
.empty p{color:var(--muted)}
.empty .cta{justify-content:center}
.feed{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.feed a,.feed .row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:56px;padding:8px 16px;border-radius:12px;background:var(--raised);border:1px solid var(--line);text-decoration:none;width:100%;color:inherit;font:inherit;text-align:left}
.feed button.row{cursor:pointer}
.feed .name{font-weight:600}
.feed .sub{display:block;color:var(--muted);font-weight:400}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.tile{background:var(--raised);border:1px solid var(--line);border-radius:12px;padding:12px}
.tile b{display:block;font-size:28px;line-height:1.1}
.tile span{color:var(--muted)}
.bars{display:grid;gap:12px;margin:0;padding:0;list-style:none}
.bars li{display:grid;grid-template-columns:110px 1fr auto;gap:12px;align-items:center}
.bars .track{height:12px;border-radius:6px;background:var(--raised2);overflow:hidden}
.bars .fill{display:block;height:100%;background:var(--confirmed);border-radius:6px}
.real{display:inline-flex;align-items:center;gap:8px;min-height:28px;padding:0 12px;border-radius:999px;background:var(--raised2);color:var(--muted);font-weight:600}
.list{margin:0;padding-left:20px;color:var(--muted)}
.list li+li{margin-top:8px}
.setting{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}
.setting:first-of-type{border-top:0}
.setting p.muted{max-width:46ch}
.tag{white-space:nowrap;color:var(--muted);font-weight:600}
.home-grid{display:grid;gap:16px}

/* Dock: bottom on a phone, left rail on a laptop */
.dock{position:fixed;left:0;right:0;bottom:0;z-index:5;display:flex;background:var(--raised);border-top:1px solid var(--line);padding-bottom:env(safe-area-inset-bottom)}
.dock a{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:60px;color:var(--muted);text-decoration:none;font-size:14px;font-weight:600}
.dock svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.dock a[aria-current=page]{color:var(--text)}
.dock a[aria-current=page] svg{stroke:var(--primary)}
@media(min-width:900px){
.shell{padding-left:104px}
.dock{top:0;right:auto;width:104px;flex-direction:column;justify-content:flex-start;gap:8px;padding:24px 8px;border-top:0;border-right:1px solid var(--line)}
.dock a{flex:0 0 auto;min-height:72px;border-radius:12px}
.dock a[aria-current=page]{background:var(--raised2)}
.content{padding:16px 32px 48px}
.top{padding:24px 32px 0}
.home-grid{grid-template-columns:minmax(0,1.5fr) minmax(300px,1fr);align-items:start;gap:24px}
.tiles{gap:16px}
svg.hex{max-height:62dvh}
}
@media(prefers-reduced-motion:no-preference){.btn,.hx{transition:opacity .15s}.btn:hover{opacity:.9}}
`;

export const APP_CSS = CSS.replace(/\n+/g, '\n').trim();
