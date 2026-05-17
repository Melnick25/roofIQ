/* ============================================================
   Roof Price Widget — FREE TRIAL VERSION
   - 25 estimates, 14-day expiry, tracked in localStorage
   - Placeholder branding ("Your Logo Here")
   - Shows upgrade banner after every estimate
   - Zero Supabase dependency — works on any site immediately

   Embed:
   <script src="https://your-app.vercel.app/widget-trial.js"
           data-company="ABC Roofing"
           data-upgrade-url="https://yoursite.com/buy"
           data-target="my-div">  (data-target optional)
   </script>
   ============================================================ */

(function () {
  'use strict';

  const TRIAL_LIMIT   = 25;
  const TRIAL_DAYS    = 14;
  const STORAGE_KEY   = 'rwt_v1';

  /* ── Script tag attributes ── */
  /* Try multiple strategies to find our script tag reliably */
  const scriptTag = (function() {
    if (document.currentScript) return document.currentScript;
    const byUrl = document.querySelector('script[src*="widget-trial"]');
    if (byUrl) return byUrl;
    const byKey = document.querySelector('script[data-upgrade-url]');
    if (byKey) return byKey;
    const byCompany = document.querySelector('script[data-company]');
    if (byCompany) return byCompany;
    return null;
  })();

  const COMPANY_NAME  = scriptTag?.getAttribute('data-company')     || 'Your Company Name';
  const UPGRADE_URL   = scriptTag?.getAttribute('data-upgrade-url') || 'mailto:growth@ardeablue.io?subject=I\'m interested in RoofIQ&body=Hi, I tried the RoofIQ estimator and I\'m interested in adding it to my website.%0D%0A%0D%0AMy company name is: %0D%0AMy website is: %0D%0AMy phone number is: %0D%0AThe best time to reach me is: ';
  const PRIMARY_COLOR = scriptTag?.getAttribute('data-color')       || '#1a56db';
  const targetId      = scriptTag?.getAttribute('data-target');

  /* ── Mount point ── */
  let mountEl = targetId ? document.getElementById(targetId) : null;
  if (!mountEl) { mountEl = document.createElement('div'); document.body.appendChild(mountEl); }

  /* ── Trial state (persisted in localStorage) ── */
  function loadTrial() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
  }

  function saveTrial(t) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(t)); } catch (_) {}
  }

  function initTrial() {
    let t = loadTrial();
    if (!t) {
      t = { startDate: Date.now(), usesLeft: TRIAL_LIMIT };
      saveTrial(t);
    }
    return t;
  }

  function trialStatus() {
    const t     = initTrial();
    const days  = Math.floor((Date.now() - t.startDate) / 86400000);
    const expired = days >= TRIAL_DAYS || t.usesLeft <= 0;
    return { usesLeft: t.usesLeft, daysLeft: Math.max(0, TRIAL_DAYS - days), expired };
  }

  function consumeUse() {
    const t = initTrial();
    t.usesLeft = Math.max(0, t.usesLeft - 1);
    saveTrial(t);
    return t.usesLeft;
  }

  /* ── Pricing data ── */
  // Base rates (per square): labor $130, materials+accessories $160
  // Dumpster/permit: $1,500 per 20 squares
  // Tier multipliers reflect quality/overhead level — apply to full base cost
  // Range: mid price ±8%

  const LABOR_PER_SQ    = 130;
  const MATERIAL_PER_SQ = 160;
  const DUMPSTER_PER_20 = 1500;

  const TIERS = [
    { id: 't1', name: 'Budget',       sub: 'Entry-level contractor',    mult: 1.20 },
    { id: 't2', name: 'Standard',     sub: 'Small local contractor',    mult: 1.35 },
    { id: 't3', name: 'Mid-level',    sub: 'Established contractor',    mult: 1.60 },
    { id: 't4', name: 'Professional', sub: 'Licensed, insured, proven', mult: 2.50 },
    { id: 't5', name: 'Premium',      sub: 'Elite craftsmanship',       mult: 2.80 },
  ];

  const SHINGLES = {
    t1: { name: '3-Tab Shingles',                  desc: 'Economy option, 20-25yr lifespan' },
    t2: { name: 'Baseline Architectural Shingles', desc: 'Dimensional look, 25-30yr lifespan' },
    t3: { name: 'Lifetime Architectural Shingles', desc: 'Enhanced durability, lifetime warranty' },
    t4: { name: 'Premium Architectural Shingles',  desc: 'Superior protection, lifetime warranty' },
    t5: { name: 'Luxury Roof Options',             desc: 'Designer styles, premium materials' },
  };

  /* ── State ── */
  const S = {
    address: '', zip: '', mode: 'squares',
    squares: '', length: '', width: '', pitch: '4',
    tierId: '',
    result: null, loading: false,
    leadName: '', leadEmail: '', leadPhone: '',
    leadDone: false, error: '',
  };

  /* ── Styles ── */
  function injectStyles() {
    if (document.getElementById('rwt-styles')) return;
    const el = document.createElement('style');
    el.id = 'rwt-styles';
    const pd = PRIMARY_COLOR;
    el.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap');
:root{--rp:${pd};--rpd:color-mix(in srgb,${pd} 78%,black);--rb:#f8f9fb;--rs:#fff;--rbo:#e2e5ea;--rt:#1a1d23;--rm:#6b7280;--rr:10px;--rf:'Barlow',sans-serif;--rfc:'Barlow Condensed',sans-serif;}
#rwt *{box-sizing:border-box;margin:0;padding:0;}
#rwt{font-family:var(--rf);background:var(--rb);color:var(--rt);border-radius:16px;overflow:hidden;max-width:720px;margin:0 auto;border:1px solid var(--rbo);box-shadow:0 4px 32px rgba(0,0,0,.07);}

/* trial banner */
#rwt .rwt-trial-bar{background:#1a1d23;color:#fff;padding:9px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
#rwt .rwt-trial-bar span{font-size:12px;opacity:.8;}
#rwt .rwt-trial-bar strong{font-size:12px;color:#fbbf24;}
#rwt .rwt-trial-bar a{font-size:12px;font-weight:700;color:#fbbf24;text-decoration:none;padding:4px 12px;border:1px solid #fbbf24;border-radius:6px;white-space:nowrap;transition:background .15s;}
#rwt .rwt-trial-bar a:hover{background:rgba(251,191,36,.15);}

/* header */
#rwt .rwt-hdr{background:var(--rp);padding:26px 30px 22px;display:flex;align-items:center;gap:16px;}
#rwt .rwt-logo-placeholder{width:120px;height:40px;border:2px dashed rgba(255,255,255,.4);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:rgba(255,255,255,.5);letter-spacing:.3px;text-transform:uppercase;flex-shrink:0;}
#rwt .rwt-hdr-text{flex:1;}
#rwt .rwt-co-name{font-family:var(--rfc);font-size:22px;font-weight:700;color:#fff;letter-spacing:.5px;}
#rwt .rwt-tagline{font-size:13px;color:rgba(255,255,255,.7);margin-top:2px;font-weight:500;}

/* body */
#rwt .rwt-body{padding:26px 30px;}

/* labels */
#rwt .rwt-lbl{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--rm);margin-bottom:7px;}

/* inputs */
#rwt input[type=text],#rwt input[type=number],#rwt select{width:100%;padding:11px 13px;border:1.5px solid var(--rbo);border-radius:var(--rr);font-family:var(--rf);font-size:15px;color:var(--rt);background:var(--rs);transition:border-color .15s;outline:none;appearance:none;}
#rwt input:focus,#rwt select:focus{border-color:var(--rp);}
#rwt .rwt-hint{font-size:12px;color:var(--rm);margin-top:4px;}

/* grids */
#rwt .rwt-r2{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:18px;}
#rwt .rwt-r3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:18px;}
#rwt .rwt-f{margin-bottom:18px;}

/* mode toggle */
#rwt .rwt-tog{display:flex;background:var(--rbo);border-radius:var(--rr);padding:3px;gap:3px;margin-bottom:18px;}
#rwt .rwt-tog button{flex:1;padding:8px 10px;border:none;border-radius:8px;font-family:var(--rf);font-size:13px;font-weight:600;cursor:pointer;background:transparent;color:var(--rm);transition:background .15s,color .15s;}
#rwt .rwt-tog button.on{background:var(--rs);color:var(--rp);box-shadow:0 1px 4px rgba(0,0,0,.1);}

/* tiles */
#rwt .rwt-tiles2{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:18px;}
#rwt .rwt-tiles3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin-bottom:18px;}
#rwt .rwt-tile{padding:11px 13px;border:1.5px solid var(--rbo);border-radius:var(--rr);cursor:pointer;background:var(--rs);transition:border-color .15s,background .15s;text-align:left;width:100%;}
#rwt .rwt-tile:hover{border-color:var(--rp);}
#rwt .rwt-tile.sel{border-color:var(--rp);background:color-mix(in srgb,var(--rp) 7%,white);}
#rwt .rwt-tile-n{font-size:14px;font-weight:600;color:var(--rt);}
#rwt .rwt-tile.sel .rwt-tile-n{color:var(--rp);}
#rwt .rwt-tile-s{font-size:12px;color:var(--rm);margin-top:2px;line-height:1.4;}
#rwt .rwt-shingle-display{margin-bottom:18px;}
#rwt .rwt-shingle-pill{background:color-mix(in srgb,var(--rp) 8%,white);border:1.5px solid var(--rp);border-radius:var(--rr);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;animation:rwt-in .25s ease;}
#rwt .rwt-shingle-name{font-size:15px;font-weight:700;color:var(--rp);}
#rwt .rwt-shingle-desc{font-size:12px;color:var(--rm);text-align:right;}

/* CTA */
#rwt .rwt-btn{width:100%;padding:14px;background:var(--rp);color:#fff;border:none;border-radius:var(--rr);font-family:var(--rfc);font-size:18px;font-weight:700;letter-spacing:.4px;cursor:pointer;transition:background .15s,transform .1s;text-transform:uppercase;}
#rwt .rwt-btn:hover{background:var(--rpd);}
#rwt .rwt-btn:active{transform:scale(.99);}
#rwt .rwt-btn:disabled{opacity:.5;cursor:not-allowed;}

/* result */
#rwt .rwt-result{background:var(--rs);border:1.5px solid var(--rp);border-radius:12px;padding:22px;margin-top:22px;animation:rwt-in .3s ease;}
@keyframes rwt-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
#rwt .rwt-res-ttl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--rm);margin-bottom:3px;}
#rwt .rwt-price{font-family:var(--rfc);font-size:46px;font-weight:700;color:var(--rp);line-height:1;margin-bottom:3px;}
#rwt .rwt-price-sub{font-size:13px;color:var(--rm);margin-bottom:18px;}
#rwt .rwt-res-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;}
#rwt .rwt-ri label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--rm);display:block;margin-bottom:2px;}
#rwt .rwt-ri span{font-size:14px;font-weight:600;color:var(--rt);}
#rwt .rwt-note{font-size:12px;color:var(--rm);background:var(--rb);border-radius:8px;padding:10px 13px;line-height:1.5;margin-bottom:18px;}

/* upgrade nudge in result */
#rwt .rwt-upgrade-nudge{background:#fffbeb;border:1.5px solid #f59e0b;border-radius:10px;padding:14px 16px;margin-bottom:18px;display:flex;align-items:center;gap:14px;}
#rwt .rwt-upgrade-nudge .rwt-un-icon{font-size:22px;flex-shrink:0;}
#rwt .rwt-upgrade-nudge p{font-size:13px;color:#92400e;line-height:1.5;flex:1;}
#rwt .rwt-upgrade-nudge a{font-size:13px;font-weight:700;color:#b45309;text-decoration:none;white-space:nowrap;padding:6px 14px;border:1.5px solid #f59e0b;border-radius:7px;background:#fff;transition:background .15s;}
#rwt .rwt-upgrade-nudge a:hover{background:#fef3c7;}

/* lead form */
#rwt .rwt-lead-title{font-family:var(--rfc);font-size:18px;font-weight:700;color:var(--rt);margin-bottom:12px;}
#rwt .rwt-lf2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;}
#rwt .rwt-lf2 .rwt-span2{grid-column:1/-1;}

/* success */
#rwt .rwt-success{text-align:center;padding:24px 16px;animation:rwt-in .3s ease;}
#rwt .rwt-sicon{width:48px;height:48px;background:color-mix(in srgb,var(--rp) 12%,white);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:22px;}
#rwt .rwt-success h3{font-family:var(--rfc);font-size:22px;font-weight:700;color:var(--rt);margin-bottom:6px;}
#rwt .rwt-success p{font-size:14px;color:var(--rm);line-height:1.6;}

/* error */
#rwt .rwt-err{font-size:13px;color:#c0392b;background:#fdf0ee;border-radius:8px;padding:10px 13px;margin-top:10px;}

/* spinner */
#rwt .rwt-spin{display:inline-block;width:15px;height:15px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:rwt-spin .7s linear infinite;margin-right:7px;vertical-align:middle;}
@keyframes rwt-spin{to{transform:rotate(360deg)}}

/* expired wall */
#rwt .rwt-expired{text-align:center;padding:48px 28px;}
#rwt .rwt-expired h2{font-family:var(--rfc);font-size:26px;font-weight:700;color:var(--rt);margin-bottom:10px;}
#rwt .rwt-expired p{font-size:14px;color:var(--rm);line-height:1.6;max-width:380px;margin:0 auto 22px;}
#rwt .rwt-expired a{display:inline-block;padding:13px 32px;background:var(--rp);color:#fff;border-radius:var(--rr);font-family:var(--rfc);font-size:17px;font-weight:700;text-decoration:none;letter-spacing:.4px;text-transform:uppercase;transition:background .15s;}
#rwt .rwt-expired a:hover{background:var(--rpd);}

@media(max-width:520px){
  #rwt .rwt-body,#rwt .rwt-hdr{padding:18px 16px;}
  #rwt .rwt-r2,#rwt .rwt-r3,#rwt .rwt-tiles3,#rwt .rwt-lf2{grid-template-columns:1fr;}
  #rwt .rwt-tiles2{grid-template-columns:1fr;}
  #rwt .rwt-res-grid{grid-template-columns:1fr;}
}
    `;
    document.head.appendChild(el);
  }

  /* ── Helpers ── */
  function calcSq() {
    if (S.mode === 'squares') return parseFloat(S.squares) || 0;
    const l = parseFloat(S.length) || 0, w = parseFloat(S.width) || 0, p = parseFloat(S.pitch) || 4;
    return (l * w * Math.sqrt(1 + Math.pow(p / 12, 2))) / 100;
  }

  function fmt(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

  /* ── Calculate ── */
  function calculate() {
    S.error = '';
    if (!S.tierId) { S.error = 'Please select an installer quality level.'; render(); return; }
    const sq = calcSq();
    if (sq <= 0) { S.error = 'Please enter valid roof dimensions.'; render(); return; }

    const status = trialStatus();
    if (status.expired) { render(); return; }

    const tier    = TIERS.find(t => t.id === S.tierId);
    const shingle = SHINGLES[S.tierId];

    const labor    = LABOR_PER_SQ * sq;
    const material = MATERIAL_PER_SQ * sq;
    const dumpster = Math.ceil(sq / 20) * DUMPSTER_PER_20;
    const mid      = (labor + material + dumpster) * tier.mult;
    const low      = mid * 0.92;
    const high     = mid * 1.08;

    const usesLeft = consumeUse();

    S.result = {
      low, mid, high,
      squares: sq,
      usesLeft,
      tierName:    tier.name,
      shingleName: shingle.name,
      shingleDesc: shingle.desc,
    };
    render();
  }

  /* ── Submit lead (just logs locally for trial) ── */
  function submitLead() {
    S.error = '';
    if (!S.leadName || !S.leadEmail) { S.error = 'Please enter your name and email.'; render(); return; }
    // In trial mode we just show success — no backend
    S.leadDone = true;
    render();
  }

  /* ── Render ── */
  function render() {
    const status = trialStatus();
    injectStyles();

    let body;
    if (status.expired) {
      body = expiredHTML();
    } else {
      body = formHTML(status);
    }

    mountEl.innerHTML = `<div id="rwt">${trialBarHTML(status)}${headerHTML()}${body}</div>`;
    attachEvents();
  }

  function trialBarHTML(status) {
    if (status.expired) return '';
    const urgency = status.usesLeft <= 5
      ? `<strong>⚠ Only ${status.usesLeft} estimate${status.usesLeft === 1 ? '' : 's'} left!</strong>`
      : `<strong>${status.usesLeft} estimates remaining</strong>`;
    return `
      <div class="rwt-trial-bar">
        <span>🔓 Free Trial &nbsp;·&nbsp; ${urgency} &nbsp;·&nbsp; ${status.daysLeft} day${status.daysLeft === 1 ? '' : 's'} left</span>
        <a href="mailto:growth@ardeablue.io?subject=I'm interested in RoofIQ&body=Hi, I tried the RoofIQ estimator and I'm interested in adding it to my website.%0D%0A%0D%0AMy company name is: %0D%0AMy website is: %0D%0AMy phone number is: %0D%0AThe best time to reach me is: " target="_blank">Get RoofIQ — $497 today</a>
      </div>`;
  }

  function headerHTML() {
    return `
      <div class="rwt-hdr">
        <div class="rwt-logo-placeholder">Your Logo Here</div>
        <div class="rwt-hdr-text">
          <div class="rwt-co-name">${COMPANY_NAME}</div>
          <div class="rwt-tagline">Get your instant roof estimate</div>
        </div>
      </div>`;
  }

  function expiredHTML() {
    return `
      <div class="rwt-body">
        <div class="rwt-expired">
          <div style="font-size:48px;margin-bottom:16px;">⏰</div>
          <h2>Your free trial has ended</h2>
          <p>You've used all your free estimates. Unlock the full version to get unlimited estimates, your own branding, and lead notifications — for a one-time fee.</p>
          <div style="margin-bottom:12px;">
            <span style="font-family:'Barlow Condensed',sans-serif;font-size:32px;font-weight:700;color:var(--rp);">97</span>
            <span style="font-size:18px;color:var(--rm);text-decoration:line-through;margin-left:10px;">$595</span>
          </div>
          <a href="mailto:growth@ardeablue.io?subject=I'm interested in RoofIQ&body=Hi, I tried the RoofIQ estimator and I'm interested in adding it to my website.%0D%0A%0D%0AMy company name is: %0D%0AMy website is: %0D%0AMy phone number is: %0D%0AThe best time to reach me is: " target="_blank">Get RoofIQ — $497 today</a>
        </div>
      </div>`;
  }

  function formHTML(status) {
    const tierTiles = TIERS.map(t => `
      <button class="rwt-tile${t.id === S.tierId ? ' sel' : ''}" data-act="tier" data-id="${t.id}">
        <div class="rwt-tile-n">${t.name}</div>
        <div class="rwt-tile-s">${t.sub}</div>
      </button>`).join('');

    const selectedShingle = S.tierId ? SHINGLES[S.tierId] : null;

    const sizeSection = S.mode === 'squares'
      ? `<div class="rwt-f">
           <label class="rwt-lbl">Number of squares</label>
           <input type="number" id="rwt-sq" value="${S.squares}" placeholder="20" min="0" step="0.1">
           <div class="rwt-hint">1 square = 100 sq ft</div>
         </div>`
      : `<div class="rwt-r3">
           <div><label class="rwt-lbl">Length (ft)</label><input type="number" id="rwt-len" value="${S.length}" placeholder="50" min="0"></div>
           <div><label class="rwt-lbl">Width (ft)</label><input type="number" id="rwt-wid" value="${S.width}" placeholder="40" min="0"></div>
           <div><label class="rwt-lbl">Pitch</label>
             <select id="rwt-pitch">${['2','4','6','8','10','12'].map(v=>`<option value="${v}"${v===S.pitch?' selected':''}>${v}:12</option>`).join('')}</select>
           </div>
         </div>`;

    const resultSection = S.result ? `
      <div class="rwt-result">
        <div class="rwt-res-ttl">Estimated project cost</div>
        <div class="rwt-price">${fmt(S.result.low)} – ${fmt(S.result.high)}</div>
        <div class="rwt-price-sub">Includes labor, materials, dumpster &amp; permit</div>
        <div class="rwt-res-grid">
          <div class="rwt-ri"><label>Roof size</label><span>${S.result.squares.toFixed(1)} sq (${Math.round(S.result.squares*100).toLocaleString()} sq ft)</span></div>
          <div class="rwt-ri"><label>Typical midpoint</label><span>${fmt(S.result.mid)}</span></div>
          <div class="rwt-ri"><label>Installer tier</label><span>${S.result.tierName}</span></div>
          <div class="rwt-ri"><label>Shingle type</label><span>${S.result.shingleName}</span></div>
        </div>
        <div class="rwt-note">This estimate is based on current market rates for labor, materials, and project costs. Final pricing varies based on roof complexity, access, and contractor availability.</div>

        <div class="rwt-upgrade-nudge">
          <div class="rwt-un-icon">⭐</div>
          <p>Like this tool? Get RoofIQ with your logo, unlimited estimates, and instant lead alerts.</p>
          <div style="margin-bottom:6px;">
            <span style="font-size:18px;font-weight:700;color:#92400e;">97</span>
            <span style="font-size:14px;color:#b45309;text-decoration:line-through;margin-left:8px;">$595</span>
            <span style="font-size:11px;font-weight:700;color:#b45309;margin-left:8px;text-transform:uppercase;letter-spacing:.4px;">Launch price</span>
          </div>
          <a href="mailto:growth@ardeablue.io?subject=I'm interested in RoofIQ&body=Hi, I tried the RoofIQ estimator and I'm interested in adding it to my website.%0D%0A%0D%0AMy company name is: %0D%0AMy website is: %0D%0AMy phone number is: %0D%0AThe best time to reach me is: " target="_blank">Get RoofIQ — $497 today</a>
        </div>

        ${S.leadDone ? `
          <div class="rwt-success">
            <div class="rwt-sicon">✓</div>
            <h3>We'll be in touch!</h3>
            <p>A roofing specialist will reach out within 1 business day.</p>
          </div>
        ` : `
          <div class="rwt-lead-title">Get a free consultation</div>
          <div class="rwt-lf2">
            <div class="rwt-span2"><label class="rwt-lbl">Your name</label><input type="text" id="rwt-lname" value="${S.leadName}" placeholder="Jane Smith"></div>
            <div><label class="rwt-lbl">Email</label><input type="text" id="rwt-lemail" value="${S.leadEmail}" placeholder="jane@email.com"></div>
            <div><label class="rwt-lbl">Phone (optional)</label><input type="text" id="rwt-lphone" value="${S.leadPhone}" placeholder="(555) 000-0000"></div>
          </div>
          <button class="rwt-btn" id="rwt-lead-btn">Connect me with a roofer</button>
        `}
      </div>` : '';

    const errorHTML = S.error ? `<div class="rwt-err">${S.error}</div>` : '';

    return `
      <div class="rwt-body">
        <div class="rwt-r2">
          <div><label class="rwt-lbl">Property address</label><input type="text" id="rwt-addr" value="${S.address}" placeholder="123 Main St, City, State"></div>
          <div><label class="rwt-lbl">ZIP code</label><input type="text" id="rwt-zip" value="${S.zip}" placeholder="12345" maxlength="5"><div class="rwt-hint">For regional pricing</div></div>
        </div>

        <label class="rwt-lbl">How to calculate roof size?</label>
        <div class="rwt-tog">
          <button data-act="mode-sq" class="${S.mode==='squares'?'on':''}">Enter squares directly</button>
          <button data-act="mode-dim" class="${S.mode==='dimensions'?'on':''}">Calculate from dimensions</button>
        </div>

        ${sizeSection}

        <label class="rwt-lbl">Installer quality level</label>
        <div class="rwt-tiles2">${tierTiles}</div>

        ${selectedShingle ? `
        <div class="rwt-shingle-display">
          <label class="rwt-lbl">Shingle type</label>
          <div class="rwt-shingle-pill">
            <div class="rwt-shingle-name">${selectedShingle.name}</div>
            <div class="rwt-shingle-desc">${selectedShingle.desc}</div>
          </div>
        </div>` : ''}

        ${errorHTML}

        <button class="rwt-btn" id="rwt-calc-btn" ${S.loading?'disabled':''}>
          ${S.loading?'<span class="rwt-spin"></span>Calculating…':'Get my instant estimate'}
        </button>

        ${resultSection}
      </div>`;
  }

  /* ── Events ── */
  function attachEvents() {
    const get = id => document.getElementById(id);
    const val = id => { const e = get(id); return e ? e.value : ''; };
    const on  = (id, ev, fn) => { const e = get(id); if (e) e.addEventListener(ev, fn); };

    on('rwt-addr',    'input',  () => S.address = val('rwt-addr'));
    on('rwt-zip',     'input',  () => S.zip = val('rwt-zip'));
    on('rwt-sq',      'input',  () => S.squares = val('rwt-sq'));
    on('rwt-len',     'input',  () => S.length = val('rwt-len'));
    on('rwt-wid',     'input',  () => S.width = val('rwt-wid'));
    on('rwt-pitch',   'change', () => S.pitch = val('rwt-pitch'));
    on('rwt-lname',   'input',  () => S.leadName = val('rwt-lname'));
    on('rwt-lemail',  'input',  () => S.leadEmail = val('rwt-lemail'));
    on('rwt-lphone',  'input',  () => S.leadPhone = val('rwt-lphone'));
    on('rwt-calc-btn','click',  calculate);
    on('rwt-lead-btn','click',  submitLead);

    document.querySelectorAll('#rwt [data-act]').forEach(el => {
      el.addEventListener('click', () => {
        const act = el.getAttribute('data-act');
        const id  = el.getAttribute('data-id');
        if (act === 'mode-sq')  { S.mode = 'squares';     S.result = null; render(); }
        if (act === 'mode-dim') { S.mode = 'dimensions';  S.result = null; render(); }
        if (act === 'tier')     { S.tierId = id; render(); }
        if (act === 'mfr')      { S.mfrId  = id; render(); }
      });
    });
  }

  /* ── Boot ── */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();

})();
