/* ============================================================
   RoofIQ Widget — Production
   Embed: <script src="https://roofiq.io/widget.js" data-key="YOUR_KEY"></script>
   ============================================================ */
(function () {
  'use strict';

  const BASE_URL = 'https://roofiq.io'; // change to your Vercel domain

  /* ── Script tag ── */
  const scriptTag = document.currentScript || document.querySelector('script[data-key]');
  const API_KEY   = scriptTag?.getAttribute('data-key');
  if (!API_KEY) { console.error('[RoofIQ] Missing data-key'); return; }

  const targetId = scriptTag?.getAttribute('data-target');
  let mount = targetId ? document.getElementById(targetId) : null;
  if (!mount) { mount = document.createElement('div'); document.body.appendChild(mount); }

  /* ── Constants ── */
  const SIZES = [
    { id: 'sm', icon: '🏠', label: 'Small',  sub: 'Under 1,200 sq ft',   sq: 14 },
    { id: 'md', icon: '🏡', label: 'Medium', sub: '1,200–1,800 sq ft',   sq: 20 },
    { id: 'lg', icon: '🏘', label: 'Large',  sub: '1,800–2,600 sq ft',   sq: 28 },
    { id: 'xl', icon: '🏗', label: 'XL',     sub: '2,600+ sq ft',         sq: 38 },
  ];
  const PITCHES = [
    { id: 'flat',  label: 'Flat / Low', sub: '1–3 pitch', mult: 1.00,
      svg: `<svg width="52" height="28" viewBox="0 0 52 28"><polyline points="4,22 48,22" stroke="VAR_P" stroke-width="2.5" stroke-linecap="round" fill="none"/><polyline points="4,22 48,17" stroke="VAR_P" stroke-width="2" stroke-linecap="round" fill="none" opacity=".4"/></svg>` },
    { id: 'mid',   label: 'Medium',     sub: '4–7 pitch', mult: 1.18,
      svg: `<svg width="52" height="28" viewBox="0 0 52 28"><polyline points="4,24 26,8 48,24" stroke="VAR_P" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>` },
    { id: 'steep', label: 'Steep',      sub: '8–12 pitch', mult: 1.38,
      svg: `<svg width="52" height="28" viewBox="0 0 52 28"><polyline points="4,26 26,2 48,26" stroke="VAR_P" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>` },
  ];
  const QUALITY = [
    { id: 'good',   label: 'Good',   icon: '🏠', sub: 'Standard materials, licensed & insured',    detail: '25-yr architectural shingles', mult: 1.00, shingle: '25-yr Architectural Shingles' },
    { id: 'better', label: 'Better', icon: '⭐', sub: 'Enhanced protection & lifetime warranty',    detail: 'Lifetime shingles · Established contractor', mult: 1.18, shingle: 'Lifetime Architectural Shingles' },
    { id: 'best',   label: 'Best',   icon: '💎', sub: 'Premium materials & elite craftsmanship',   detail: 'Designer shingles · Top-rated, fully vetted', mult: 1.45, shingle: 'Premium / Designer Shingles' },
  ];
  const ROOF_AGES  = ['Under 10 yrs', '10–20 yrs', '20+ yrs'];
  const STORY_OPTS = ['1 story', '2 stories', '3+ stories'];
  const LABOR = 130, MATERIAL = 160, DUMP = 1500;

  /* ── State ── */
  let CFG = null; // loaded from /api/config
  const S = {
    step: 1, zip: '', city: '', state: '',
    sizeId: '', pitchId: '', qualityId: '',
    result: null, slots: [],
    roofAge: '', stories: '', insuredQ: null,
    name: '', contact: '',
    leadId: null, leadDone: false, bookingDone: false,
    error: '', loading: false,
  };

  /* ── Helpers ── */
  const fmt    = n   => '$' + Math.round(n).toLocaleString('en-US');
  const getS   = ()  => SIZES.find(s => s.id === S.sizeId);
  const getP   = ()  => PITCHES.find(p => p.id === S.pitchId);
  const getQ   = ()  => QUALITY.find(q => q.id === S.qualityId);
  const primary = () => CFG?.primary_color || '#c84b11';

  function calcMonthly(mid) {
    const r = 0.099 / 12, n = 120;
    return Math.round(mid * (r * Math.pow(1+r,n)) / (Math.pow(1+r,n)-1));
  }
  function calc() {
    const q = getQ(), sz = getS(), p = getP();
    const sq   = sz.sq;
    const base = (LABOR * sq + MATERIAL * sq + Math.ceil(sq/20) * DUMP);
    const mid  = base * p.mult * q.mult * (S._regionMult || 1);
    return { low: mid*.88, mid, high: mid*1.14, sq, shingle: q.shingle, monthly: calcMonthly(mid) };
  }
  function pitchSVG(p) { return p.svg.replace(/VAR_P/g, primary()); }
  function fmtSlot(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })
      + ' · ' + d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
  }

  /* ── API calls ── */
  async function api(path, opts = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    return res.json();
  }

  /* ── Styles ── */
  function injectStyles() {
    const id = 'riq-styles';
    if (document.getElementById(id)) return;
    const p = primary(), pd = p; // can darken programmatically if needed
    const el = document.createElement('style');
    el.id = id;
    el.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Zilla+Slab:wght@600;700&family=DM+Sans:wght@400;500;600;700&display=swap');
#riq*{box-sizing:border-box;margin:0;padding:0}
#riq{font-family:'DM Sans',sans-serif;background:#fff;color:#1b2b4b;border-radius:20px;overflow:hidden;max-width:480px;margin:0 auto;border:1px solid #e2e8f0;box-shadow:0 8px 40px rgba(0,0,0,.1)}
#riq .rh{background:${p};padding:18px 20px;display:flex;align-items:center;gap:12px}
#riq .rh img{height:34px;max-width:130px;object-fit:contain;filter:brightness(0)invert(1);flex-shrink:0}
#riq .rh-logo-ph{width:100px;height:32px;border:1.5px dashed rgba(255,255,255,.35);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.4px;flex-shrink:0}
#riq .rh-co{font-family:'Zilla Slab',serif;font-size:16px;font-weight:700;color:#fff}
#riq .rh-tag{font-size:11.5px;color:rgba(255,255,255,.65);margin-top:2px}
#riq .rp{padding:16px 20px 0;display:flex;align-items:center;gap:5px}
#riq .rps{display:flex;flex-direction:column;align-items:center;gap:4px;flex:1}
#riq .rpd{width:26px;height:26px;border-radius:50%;border:2px solid #e2e8f0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#a0aec0;background:#fff;transition:all .25s}
#riq .rpd.active{border-color:${p};background:${p};color:#fff}
#riq .rpd.done{border-color:${p};background:#fef0e8;color:${p}}
#riq .rpl{font-size:8.5px;font-weight:700;color:#a0aec0;text-transform:uppercase;letter-spacing:.4px;text-align:center;white-space:nowrap}
#riq .rpl.active{color:${p}}
#riq .rpln{flex:1;height:2px;background:#e2e8f0;border-radius:2px;margin-bottom:14px;transition:background .3s}
#riq .rpln.done{background:${p}}
#riq .rb{padding:18px 20px 24px}
#riq .rtitle{font-family:'Zilla Slab',serif;font-size:20px;font-weight:700;color:#1b2b4b;margin-bottom:4px;line-height:1.2}
#riq .rsub{font-size:13px;color:#718096;margin-bottom:18px;line-height:1.5}
#riq .rlbl{display:block;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#718096;margin-bottom:7px}
#riq .rzw{margin-bottom:6px}
#riq .rzw input{width:100%;padding:13px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-family:'DM Sans',sans-serif;font-size:18px;font-weight:600;color:#1b2b4b;letter-spacing:2px;outline:none;transition:border-color .15s;-webkit-appearance:none}
#riq .rzw input:focus{border-color:${p}}
#riq .rzw input::placeholder{font-weight:400;letter-spacing:0;color:#cbd5e0;font-size:15px}
#riq .rhint{font-size:11px;color:#a0aec0;margin-bottom:18px;margin-top:5px}
#riq .rg2{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:18px}
#riq .rg3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:18px}
#riq .rtile{padding:13px 11px;border:1.5px solid #e2e8f0;border-radius:10px;cursor:pointer;background:#fff;text-align:left;width:100%;transition:border-color .15s,background .15s;-webkit-tap-highlight-color:transparent;position:relative}
#riq .rtile:active{transform:scale(.97)}
#riq .rtile.sel{border-color:${p};background:#fef0e8;box-shadow:0 0 0 3px rgba(200,75,17,.12)}
#riq .rtile-ck{position:absolute;top:7px;right:7px;width:16px;height:16px;border-radius:50%;background:${p};display:none;align-items:center;justify-content:center;font-size:9px;color:#fff;font-weight:700}
#riq .rtile.sel .rtile-ck{display:flex}
#riq .rtile-icon{font-size:20px;margin-bottom:5px;display:block}
#riq .rtile-name{font-size:13.5px;font-weight:700;color:#1b2b4b}
#riq .rtile.sel .rtile-name{color:${p}}
#riq .rtile-sub{font-size:11px;color:#a0aec0;margin-top:2px;line-height:1.35}
#riq .rtile-ptch{text-align:center}
#riq .rqst{display:flex;flex-direction:column;gap:9px;margin-bottom:18px}
#riq .rqt{padding:13px 14px;border:1.5px solid #e2e8f0;border-radius:10px;cursor:pointer;background:#fff;display:flex;align-items:center;gap:12px;width:100%;transition:border-color .15s,background .15s;-webkit-tap-highlight-color:transparent}
#riq .rqt:active{transform:scale(.99)}
#riq .rqt.sel{border-color:${p};background:#fef0e8;box-shadow:0 0 0 3px rgba(200,75,17,.12)}
#riq .rqi{font-size:20px;flex-shrink:0;width:32px;text-align:center}
#riq .rqtx{flex:1}
#riq .rqn{font-size:14px;font-weight:700;color:#1b2b4b}
#riq .rqt.sel .rqn{color:${p}}
#riq .rqs{font-size:11.5px;color:#718096;margin-top:2px}
#riq .rqd{font-size:11px;color:#a0aec0;margin-top:3px;line-height:1.4}
#riq .rqck{width:19px;height:19px;border-radius:50%;border:1.5px solid #e2e8f0;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;transition:all .15s}
#riq .rqt.sel .rqck{background:${p};border-color:${p}}
#riq .rbtn{width:100%;padding:14px;background:${p};color:#fff;border:none;border-radius:10px;font-family:'DM Sans',sans-serif;font-size:15.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:background .15s,transform .1s;-webkit-tap-highlight-color:transparent}
#riq .rbtn:active{transform:scale(.99)}
#riq .rbtn:disabled{opacity:.5}
#riq .rback{background:none;border:none;font-family:'DM Sans',sans-serif;font-size:12.5px;color:#a0aec0;cursor:pointer;padding:0;margin-bottom:14px;display:inline-flex;align-items:center;gap:4px;transition:color .15s}
#riq .rback:hover{color:${p}}
#riq .rerr{font-size:12.5px;color:#9b2c1a;background:#fef2f0;border:1px solid #fcd5cc;border-radius:8px;padding:9px 12px;margin-top:8px;margin-bottom:4px}
#riq .rspin{width:15px;height:15px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:riq-spin .7s linear infinite;flex-shrink:0}
@keyframes riq-spin{to{transform:rotate(360deg)}}
/* price card */
#riq .rpc{background:linear-gradient(135deg,#1b2b4b 0%,#253554 100%);border-radius:14px;padding:18px 20px;margin-bottom:14px;animation:riq-in .4s ease}
@keyframes riq-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
#riq .rpc-badge{display:inline-block;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:rgba(255,255,255,.55);background:rgba(255,255,255,.08);border-radius:20px;padding:3px 10px;margin-bottom:7px}
#riq .rpc-price{font-family:'Zilla Slab',serif;font-size:36px;font-weight:700;color:#fff;line-height:1;margin-bottom:2px}
#riq .rpc-sub{font-size:11px;color:rgba(255,255,255,.55);margin-bottom:13px}
#riq .rpc-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#riq .rpc-item label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:rgba(255,255,255,.45);display:block;margin-bottom:2px}
#riq .rpc-item span{font-size:12px;font-weight:600;color:rgba(255,255,255,.85)}
/* badges */
#riq .rvb{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
#riq .rvbd{display:flex;align-items:center;gap:5px;background:#ebf5ee;border:1px solid #b2dfcc;border-radius:20px;padding:4px 10px;font-size:11px;font-weight:600;color:#276749}
/* finance */
#riq .rfin{background:#fdf8ec;border:1.5px solid #f6e4a0;border-radius:10px;padding:11px 13px;display:flex;align-items:center;gap:10px;margin-bottom:12px}
#riq .rfin-icon{font-size:18px;flex-shrink:0}
#riq .rfin strong{font-size:13px;font-weight:700;color:#7d5c00;display:block}
#riq .rfin span{font-size:11.5px;color:#a07800}
/* insurance */
#riq .rins{background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:10px;padding:11px 13px;margin-bottom:12px}
#riq .rins-hdr{display:flex;align-items:center;gap:9px;margin-bottom:4px}
#riq .rins-icon{font-size:18px}
#riq .rins strong{font-size:13px;font-weight:700;color:#1e40af}
#riq .rins span{font-size:11.5px;color:#3b82f6}
#riq .rins-yn{display:flex;gap:7px;margin-top:8px}
#riq .rins-yn button{flex:1;padding:7px;border:1.5px solid #bfdbfe;border-radius:8px;background:#fff;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;color:#1e40af;cursor:pointer;transition:background .15s,border-color .15s;-webkit-tap-highlight-color:transparent}
#riq .rins-yn button.sel{background:${p};color:#fff;border-color:${p}}
#riq .rins-note{margin-top:9px;padding:9px 11px;background:${p};border-radius:8px;font-size:11.5px;color:#fff;line-height:1.5;display:none}
#riq .rins-note.show{display:block}
/* qualifiers */
#riq .rqls{display:flex;flex-direction:column;gap:9px;margin-bottom:12px}
#riq .rql{border:1.5px solid #e2e8f0;border-radius:10px;overflow:hidden;transition:border-color .2s}
#riq .rql.open{border-color:${p}}
#riq .rql-hdr{padding:11px 13px;display:flex;align-items:center;gap:10px;cursor:pointer;background:#fff;-webkit-tap-highlight-color:transparent}
#riq .rql-icon{font-size:17px;flex-shrink:0}
#riq .rql-q{font-size:13px;font-weight:700;color:#1b2b4b}
#riq .rql-hint{font-size:11px;color:#a0aec0;margin-top:1px}
#riq .rql-chev{font-size:11px;color:#cbd5e0;margin-left:auto;transition:transform .2s}
#riq .rql.open .rql-chev{transform:rotate(180deg)}
#riq .rql-body{display:none;padding:0 13px 13px}
#riq .rql.open .rql-body{display:block}
#riq .rql-opts{display:flex;gap:7px;flex-wrap:wrap;margin-top:2px}
#riq .rqo{padding:7px 13px;border:1.5px solid #e2e8f0;border-radius:20px;font-size:12.5px;font-weight:600;color:#4a5568;cursor:pointer;background:#fff;transition:border-color .15s,background .15s;-webkit-tap-highlight-color:transparent}
#riq .rqo.sel{border-color:${p};background:#fef0e8;color:${p}}
/* booking */
#riq .rbook{background:#f7f6f3;border-radius:12px;padding:14px;margin-bottom:12px}
#riq .rbook-title{font-family:'Zilla Slab',serif;font-size:16px;font-weight:700;color:#1b2b4b;margin-bottom:3px}
#riq .rbook-sub{font-size:12px;color:#718096;margin-bottom:11px;line-height:1.5}
#riq .rslots{display:flex;flex-direction:column;gap:7px;margin-bottom:10px}
#riq .rslot{padding:10px 13px;border:1.5px solid #e2e8f0;border-radius:9px;cursor:pointer;background:#fff;display:flex;align-items:center;justify-content:space-between;transition:border-color .15s,background .15s;-webkit-tap-highlight-color:transparent}
#riq .rslot:hover{border-color:${p};background:#fef0e8}
#riq .rslot-time{font-size:13px;font-weight:700;color:#1b2b4b}
#riq .rslot-dur{font-size:11px;color:#a0aec0}
#riq .rslot-arr{color:${p};font-size:14px}
/* lead box */
#riq .rlb{background:#f7f6f3;border-radius:12px;padding:14px 14px 12px}
#riq .rlb-title{font-family:'Zilla Slab',serif;font-size:16px;font-weight:700;color:#1b2b4b;margin-bottom:3px}
#riq .rlb-sub{font-size:12px;color:#718096;margin-bottom:11px;line-height:1.5}
#riq .rfields{display:flex;flex-direction:column;gap:8px;margin-bottom:10px}
#riq .rf input{width:100%;padding:12px 13px;border:1.5px solid #e2e8f0;border-radius:9px;font-family:'DM Sans',sans-serif;font-size:14.5px;color:#1b2b4b;outline:none;transition:border-color .15s;background:#fff}
#riq .rf input:focus{border-color:${p}}
#riq .rf input::placeholder{color:#cbd5e0}
#riq .rprivacy{font-size:10.5px;color:#a0aec0;text-align:center;margin-top:8px}
/* success */
#riq .rsuc{text-align:center;padding:18px 10px;animation:riq-in .3s ease}
#riq .rsuc-icon{width:52px;height:52px;background:#fef0e8;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:22px}
#riq .rsuc h3{font-family:'Zilla Slab',serif;font-size:20px;color:#1b2b4b;margin-bottom:6px}
#riq .rsuc p{font-size:12.5px;color:#718096;line-height:1.6}
#riq .rnx{margin-top:14px}
#riq .rnx-ttl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#a0aec0;margin-bottom:10px;text-align:center}
#riq .rnx-row{display:flex;align-items:flex-start;gap:11px;padding:11px 0;border-bottom:1px solid #f0f1f4}
#riq .rnx-row:last-child{border-bottom:none}
#riq .rnx-num{width:24px;height:24px;border-radius:50%;background:${p};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;margin-top:1px}
#riq .rnx-row strong{font-size:13px;font-weight:700;color:#1b2b4b;display:block}
#riq .rnx-row span{font-size:11.5px;color:#718096;margin-top:1px;display:block;line-height:1.4}
/* trial bar */
#riq .rtrial{background:#1b2b4b;padding:7px 18px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
#riq .rtrial span{font-size:11px;color:rgba(255,255,255,.5)}
#riq .rtrial strong{color:#f6c87a}
#riq .rtrial a{font-size:11px;font-weight:700;color:#f6c87a;text-decoration:none;padding:3px 10px;border:1px solid rgba(246,200,122,.4);border-radius:5px}
/* expired */
#riq .rexp{text-align:center;padding:48px 24px}
#riq .rexp h2{font-family:'Zilla Slab',serif;font-size:24px;color:#1b2b4b;margin-bottom:10px}
#riq .rexp p{font-size:14px;color:#718096;line-height:1.6;margin-bottom:20px}
#riq .rexp a{display:inline-block;padding:12px 28px;background:${p};color:#fff;border-radius:10px;font-weight:700;text-decoration:none;font-size:15px}
@media(max-width:420px){#riq .rb,#riq .rh{padding-left:14px;padding-right:14px}#riq .rp{padding-left:12px;padding-right:12px}#riq .rpc-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(el);
  }

  /* ── HTML builders ── */
  function hdr() {
    const logo = CFG?.logo_url
      ? `<img src="${CFG.logo_url}" alt="${CFG.company_name}">`
      : `<div class="rh-logo-ph">Your Logo</div>`;
    return `<div class="rh">${logo}<div><div class="rh-co">${CFG?.company_name||'Roofing Co.'}</div><div class="rh-tag">${CFG?.tagline||'Free Instant Roof Estimate'}</div></div></div>`;
  }

  function prog() {
    const lbls = ['Location','Roof','Quality','Estimate'];
    return `<div class="rp">${lbls.map((l,i)=>{
      const n=i+1,done=S.step>n,active=S.step===n;
      return `<div class="rps"><div class="rpd ${done?'done':active?'active':''}">${done?'✓':n}</div><div class="rpl ${active?'active':''}">${l}</div></div>${i<3?`<div class="rpln${done?' done':''}"></div>`:''}`;
    }).join('')}</div>`;
  }

  function trialBar() {
    if (!CFG || CFG.plan !== 'starter' || CFG.trial_expired) return '';
    const left = CFG.trial_uses_left || 0;
    return `<div class="rtrial"><span>Free trial · <strong>${left} estimate${left===1?'':'s'} remaining</strong></span><a href="https://roofiq.io/#pricing" target="_blank">Upgrade → $297</a></div>`;
  }

  function s1() {
    return `<div class="rb">
      <div class="rtitle">Where's your home?</div>
      <div class="rsub">We use your ZIP to apply local labor and material rates.</div>
      <div class="rzw"><label class="rlbl">ZIP code</label>
        <input type="text" id="riq-zip" value="${S.zip}" placeholder="e.g. 85021" maxlength="5" inputmode="numeric">
      </div>
      <div class="rhint">Pricing varies by region — your ZIP keeps it accurate</div>
      ${S.error?`<div class="rerr">${S.error}</div>`:''}
      <button class="rbtn" id="riq-n1">Continue →</button>
    </div>`;
  }

  function s2() {
    const szT = SIZES.map(s=>`
      <button class="rtile${S.sizeId===s.id?' sel':''}" data-act="size" data-id="${s.id}">
        <div class="rtile-ck">✓</div><span class="rtile-icon">${s.icon}</span>
        <div class="rtile-name">${s.label}</div><div class="rtile-sub">${s.sub}</div>
      </button>`).join('');
    const ptT = PITCHES.map(p=>`
      <button class="rtile rtile-ptch${S.pitchId===p.id?' sel':''}" data-act="pitch" data-id="${p.id}" style="text-align:center">
        <div class="rtile-ck">✓</div>${pitchSVG(p)}
        <div class="rtile-name" style="margin-top:4px">${p.label}</div><div class="rtile-sub">${p.sub}</div>
      </button>`).join('');
    return `<div class="rb">
      <button class="rback" data-act="back">← Back</button>
      <div class="rtitle">Tell us about your roof</div>
      <div class="rsub">Two quick questions — this is where most estimates go wrong.</div>
      <label class="rlbl">Home size</label><div class="rg2">${szT}</div>
      <label class="rlbl">Roof pitch — how steep?</label><div class="rg3">${ptT}</div>
      ${S.error?`<div class="rerr">${S.error}</div>`:''}
      <button class="rbtn" id="riq-n2">Continue →</button>
    </div>`;
  }

  function s3() {
    const qT = QUALITY.map(q=>`
      <button class="rqt${S.qualityId===q.id?' sel':''}" data-act="quality" data-id="${q.id}">
        <div class="rqi">${q.icon}</div>
        <div class="rqtx"><div class="rqn">${q.label}</div><div class="rqs">${q.sub}</div><div class="rqd">${q.detail}</div></div>
        <div class="rqck">${S.qualityId===q.id?'✓':''}</div>
      </button>`).join('');
    return `<div class="rb">
      <button class="rback" data-act="back">← Back</button>
      <div class="rtitle">What level of quality?</div>
      <div class="rsub">Affects shingle grade, warranty, and contractor tier.</div>
      <div class="rqst">${qT}</div>
      ${S.error?`<div class="rerr">${S.error}</div>`:''}
      <button class="rbtn" id="riq-n3" ${S.loading?'disabled':''}>
        ${S.loading?'<div class="rspin"></div> Calculating…':'See My Estimate →'}
      </button>
    </div>`;
  }

  function s4() {
    const r=S.result, q=getQ(), sz=getS(), p=getP();
    const ageO = ROOF_AGES.map(a=>`<button class="rqo${S.roofAge===a?' sel':''}" data-qual="age" data-val="${a}">${a}</button>`).join('');
    const stoO = STORY_OPTS.map(a=>`<button class="rqo${S.stories===a?' sel':''}" data-qual="stories" data-val="${a}">${a}</button>`).join('');
    const loc  = S.city ? `${S.city}, ${S.state}` : `ZIP ${S.zip}`;

    const bookingSection = CFG?.booking_enabled && !S.leadDone ? `
      <div class="rbook">
        <div class="rbook-title">📅 Book your free inspection</div>
        <div class="rbook-sub">Pick a time that works — we'll confirm within minutes.</div>
        <div class="rslots" id="riq-slots">
          ${S.slots.length ? S.slots.slice(0,6).map(sl=>`
            <button class="rslot" data-slot="${sl.slot_start}" data-slotid="${sl.id||''}">
              <span class="rslot-time">${fmtSlot(sl.slot_start)}</span>
              <span class="rslot-dur">2hr inspection</span>
              <span class="rslot-arr">→</span>
            </button>`).join('') : '<div style="font-size:13px;color:#a0aec0">Loading available times…</div>'}
        </div>
      </div>` : '';

    const leadSection = S.leadDone ? submittedHTML() : `
      <div class="rlb">
        <div class="rlb-title">Get your free consultation</div>
        <div class="rlb-sub">We'll reach out within 1 business day — no obligation, no pressure.</div>
        <div class="rfields">
          <div class="rf"><input type="text" id="riq-name" value="${S.name}" placeholder="Your name"></div>
          <div class="rf"><input type="text" id="riq-contact" value="${S.contact}" placeholder="Phone or email"></div>
        </div>
        ${S.error?`<div class="rerr">${S.error}</div>`:''}
        <button class="rbtn" id="riq-submit" ${S.loading?'disabled':''}>
          ${S.loading?'<div class="rspin"></div> Sending…':'Get My Free Consultation →'}
        </button>
        <div class="rprivacy">🔒 We'll never sell your information</div>
      </div>`;

    return `<div class="rb">
      <button class="rback" data-act="back">← Adjust</button>

      <div class="rpc">
        <span class="rpc-badge">Estimated project cost · ${loc}</span>
        <div class="rpc-price">${fmt(r.low)} – ${fmt(r.high)}</div>
        <div class="rpc-sub">Includes labor, materials, dumpster &amp; permit</div>
        <div class="rpc-grid">
          <div class="rpc-item"><label>Home size</label><span>${sz.label} (~${r.sq} sq)</span></div>
          <div class="rpc-item"><label>Roof pitch</label><span>${p.label}</span></div>
          <div class="rpc-item"><label>Quality</label><span>${q.label}</span></div>
          <div class="rpc-item"><label>Shingle</label><span>${r.shingle}</span></div>
        </div>
      </div>

      <div class="rvb">
        <div class="rvbd">✓ ZIP-adjusted</div>
        <div class="rvbd">✓ Pitch-corrected</div>
        <div class="rvbd">✓ All-in estimate</div>
      </div>

      <div class="rfin">
        <div class="rfin-icon">💰</div>
        <div><strong>Finance from ~${fmt(r.monthly)}/mo</strong><span>Ask us about financing options</span></div>
      </div>

      <div class="rins">
        <div class="rins-hdr">
          <div class="rins-icon">☂️</div>
          <div><strong>Storm or hail damage?</strong><br><span>You may qualify for an insurance inspection</span></div>
        </div>
        <div class="rins-yn">
          <button id="ins-yes" class="${S.insuredQ===true?'sel':''}">Yes — possible damage</button>
          <button id="ins-no"  class="${S.insuredQ===false?'sel':''}">No storm damage</button>
        </div>
        <div class="rins-note${S.insuredQ===true?' show':''}">We'll check NOAA weather data for your area and flag your lead for priority follow-up. Actual coverage depends on your policy and adjuster assessment.</div>
      </div>

      <div class="rqls">
        <div class="rql" id="ql-age">
          <div class="rql-hdr" data-toggle="ql-age">
            <div class="rql-icon">📅</div>
            <div><div class="rql-q">How old is your current roof?</div><div class="rql-hint">${S.roofAge||'Helps us prioritize your call'}</div></div>
            <div class="rql-chev">▼</div>
          </div>
          <div class="rql-body"><div class="rql-opts">${ageO}</div></div>
        </div>
        <div class="rql" id="ql-stories">
          <div class="rql-hdr" data-toggle="ql-stories">
            <div class="rql-icon">🏗</div>
            <div><div class="rql-q">How many stories?</div><div class="rql-hint">${S.stories||'Affects scaffolding cost'}</div></div>
            <div class="rql-chev">▼</div>
          </div>
          <div class="rql-body"><div class="rql-opts">${stoO}</div></div>
        </div>
      </div>

      ${bookingSection}
      ${leadSection}
    </div>`;
  }

  function submittedHTML() {
    const first = S.name ? S.name.split(' ')[0] : 'there';
    return `<div class="rsuc">
      <div class="rsuc-icon">✓</div>
      <h3>You're all set, ${first}!</h3>
      <p>We'll reach out within 1 business day.</p>
      <div class="rnx">
        <div class="rnx-ttl">What to expect</div>
        <div class="rnx-row"><div class="rnx-num">1</div><div><strong>Estimate emailed to you</strong><span>Your full estimate PDF is on its way</span></div></div>
        <div class="rnx-row"><div class="rnx-num">2</div><div><strong>We call to confirm details</strong><span>A quick 5-min call — no pressure</span></div></div>
        <div class="rnx-row"><div class="rnx-num">3</div><div><strong>Free on-site inspection</strong><span>We verify and lock in your final quote</span></div></div>
        ${S.insuredQ?`<div class="rnx-row"><div class="rnx-num">🛡</div><div><strong>Insurance review</strong><span>We'll assess damage and advise on next steps</span></div></div>`:''}
      </div>
    </div>`;
  }

  function expiredHTML() {
    return `<div class="rexp">
      <div style="font-size:44px;margin-bottom:14px">⏰</div>
      <h2>Free trial ended</h2>
      <p>Get the full version — unlimited estimates, your branding, and real leads.</p>
      <a href="https://roofiq.io/#pricing" target="_blank">Get RoofIQ — from $297</a>
    </div>`;
  }

  /* ── Render ── */
  function render() {
    if (!CFG) { mount.innerHTML = `<div id="riq"><div class="rb" style="text-align:center;padding:48px;color:#a0aec0">Loading…</div></div>`; return; }
    injectStyles();
    if (CFG.trial_expired) { mount.innerHTML = `<div id="riq">${hdr()}${expiredHTML()}</div>`; return; }
    const body = S.step===1?s1():S.step===2?s2():S.step===3?s3():s4();
    mount.innerHTML = `<div id="riq">${trialBar()}${hdr()}${prog()}${body}</div>`;
    bind();
  }

  /* ── Events ── */
  function bind() {
    const on  = (id,fn)=>{ const e=document.getElementById(id); if(e) e.addEventListener('click',fn); };
    const inp = (id,fn)=>{ const e=document.getElementById(id); if(e) e.addEventListener('input',fn); };

    inp('riq-zip',     e=>{ S.zip=e.target.value; });
    inp('riq-name',    e=>{ S.name=e.target.value; });
    inp('riq-contact', e=>{ S.contact=e.target.value; });

    on('riq-n1', ()=>{
      S.error='';
      if(!S.zip||S.zip.length<5){ S.error='Please enter a valid 5-digit ZIP code.'; render(); return; }
      S.step=2; render();
    });
    on('riq-n2', ()=>{
      S.error='';
      if(!S.sizeId) { S.error='Please select your home size.'; render(); return; }
      if(!S.pitchId){ S.error='Please select your roof pitch.'; render(); return; }
      S.step=3; render();
    });
    on('riq-n3', async ()=>{
      S.error='';
      if(!S.qualityId){ S.error='Please select a quality level.'; render(); return; }
      S.loading=true; render();
      // Decrement trial
      if(CFG.plan==='starter') {
        await api(`/api/config?key=${API_KEY}&action=use`, { method:'POST' }).catch(()=>{});
        CFG.trial_uses_left = Math.max(0, (CFG.trial_uses_left||0) - 1);
      }
      // Regional multiplier
      try {
        const reg = await api(`/api/config?key=${API_KEY}&zip=${S.zip}`);
        S._regionMult = reg.multiplier || 1;
        S.city  = reg.city  || '';
        S.state = reg.state || '';
      } catch(_){ S._regionMult=1; }
      // Log estimate
      api('/api/estimate', { method:'POST', body:{ api_key:API_KEY, zip_code:S.zip, size_id:S.sizeId, pitch_id:S.pitchId, quality_id:S.qualityId }}).catch(()=>{});
      S.result=calc();
      // Load booking slots if enabled
      if(CFG.booking_enabled) {
        try { const r=await api(`/api/slots?key=${API_KEY}`); S.slots=r.slots||[]; } catch(_){ S.slots=[]; }
      }
      S.loading=false; S.step=4; render();
    });

    on('riq-submit', async ()=>{
      S.error='';
      if(!S.name.trim()){ S.error='Please enter your name.'; render(); return; }
      const c=S.contact.trim();
      if(!c||c.length<6){ S.error='Please enter your phone or email.'; render(); return; }
      S.loading=true; render();
      try {
        const isEmail = c.includes('@');
        const res = await api('/api/leads', { method:'POST', body:{
          api_key: API_KEY,
          name: S.name, email: isEmail?c:null, phone: isEmail?null:c,
          zip_code: S.zip, size_id: S.sizeId, pitch_id: S.pitchId, quality_id: S.qualityId,
          squares: S.result?.sq, est_low: S.result?.low, est_mid: S.result?.mid, est_high: S.result?.high,
          shingle_type: S.result?.shingle, monthly_payment: S.result?.monthly,
          roof_age: S.roofAge, stories: S.stories, insurance_flag: S.insuredQ===true,
        }});
        S.leadId = res.lead_id;
        S.leadDone=true;
      } catch(_){ S.error='Could not submit. Please try again.'; }
      S.loading=false; render();
    });

    on('ins-yes', ()=>{ S.insuredQ=true;  render(); });
    on('ins-no',  ()=>{ S.insuredQ=false; render(); });

    // Slot booking
    document.querySelectorAll('#riq .rslot').forEach(el=>{
      el.addEventListener('click', async ()=>{
        const slotStart = el.getAttribute('data-slot');
        const slotId    = el.getAttribute('data-slotid') || null;
        try {
          await api('/api/slots', { method:'POST', body:{ key:API_KEY, slot_id:slotId, slot_start:slotStart, lead_id:S.leadId }});
          el.style.background='#ebf5ee'; el.style.borderColor='#276749';
          el.querySelector('.rslot-arr').textContent='✓';
          el.querySelector('.rslot-time').style.color='#276749';
          S.bookingDone=true;
        } catch(_){}
      });
    });

    document.querySelectorAll('#riq [data-act]').forEach(el=>{
      el.addEventListener('click', ()=>{
        const act=el.getAttribute('data-act'), id=el.getAttribute('data-id');
        if(act==='size')    { S.sizeId=id;    S.error=''; render(); }
        if(act==='pitch')   { S.pitchId=id;   S.error=''; render(); }
        if(act==='quality') { S.qualityId=id; S.error=''; render(); }
        if(act==='back')    { S.step=Math.max(1,S.step-1); S.error=''; render(); }
      });
    });

    document.querySelectorAll('#riq [data-qual]').forEach(el=>{
      el.addEventListener('click', ()=>{
        const qual=el.getAttribute('data-qual'), val=el.getAttribute('data-val');
        if(qual==='age')     S.roofAge=val;
        if(qual==='stories') S.stories=val;
        render();
      });
    });

    document.querySelectorAll('#riq [data-toggle]').forEach(el=>{
      el.addEventListener('click', ()=>{
        const card=document.getElementById(el.getAttribute('data-toggle'));
        if(card) card.classList.toggle('open');
      });
    });
  }

  /* ── Init ── */
  async function init() {
    render(); // show loading
    try {
      CFG = await api(`/api/config?key=${API_KEY}`);
      injectStyles();
    } catch(e) {
      mount.innerHTML=`<div id="riq"><div class="rb" style="padding:24px;font-size:14px;color:#9b2c1a">Widget could not load. Check your API key.</div></div>`;
      return;
    }
    render();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
