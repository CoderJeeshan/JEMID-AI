/* JEN Auth: one login and signup gate for every JEN app (local mode).
   - Accounts are saved in this browser (same storage as JEN Mail), and only username@jen4u.com is possible.
   - Add ONE line inside the <head> of each app's index.html, before its other scripts:
         <script src="../jen-auth.js"></script>
   - Run all apps from one folder through one local address (see README.txt) so they share the login.
   This is a convenience gate for your own laptop, not real security. */
(function () {
  "use strict";

  /* ---------- per-account storage ----------
     Every app keeps its content (chats, tasks, notes, settings...) separately for each logged-in
     JEN account, like ChatGPT or Claude. This runs before the app's own scripts, so apps need no changes.
     Shared keys below stay global. The first account that logs in after this update receives the
     content that already existed in this browser. */
  var EXCL = {
    "jen-users": 1,
    "jen-session": 1,
    "jen-accounts": 1,
    "jen-theme": 1,
    "jen-mails": 1,
    "jen-orgs": 1,
    "jen-legacy-owner": 1,
    "jen-team-msgs": 1,
    "jen-team-hidden": 1,
    "jen-team-typing": 1,
    "jenchat-shared": 1,
    "jen-chat-merged": 1,
  };
  var LS = window.localStorage,
    SP = Storage.prototype;
  var _g = SP.getItem,
    _s = SP.setItem,
    _r = SP.removeItem,
    _k = SP.key,
    _c = SP.clear;
  var _len = Object.getOwnPropertyDescriptor(SP, "length").get;

  /* JEN Chat fix: requests, messages and groups must be ONE shared store for all accounts.
     Earlier they were saved per account, so a request never reached the other person.
     One time: merge every per-account copy into the shared key "jenchat-shared". */
  (function () {
    try {
      if (_g.call(LS, "jen-chat-merged") === "1") return;
      var n = _len.call(LS), keys = [], i, k, base;
      for (i = 0; i < n; i++) {
        k = _k.call(LS, i);
        if (k && /^jen-u:.*:jenchat-shared$/.test(k)) keys.push(k);
      }
      try { base = JSON.parse(_g.call(LS, "jenchat-shared") || "{}"); } catch (e) { base = {}; }
      if (!base || typeof base !== "object") base = {};
      base.reqs = base.reqs || []; base.msgs = base.msgs || [];
      base.groups = base.groups || []; base.last = base.last || {};
      var rank = { pending: 1, blocked: 2, accepted: 3 };
      keys.forEach(function (key) {
        var d;
        try { d = JSON.parse(_g.call(LS, key) || "{}"); } catch (e) { return; }
        (d.reqs || []).forEach(function (r) {
          var j = -1;
          base.reqs.forEach(function (x, idx) {
            if (j < 0 && (x.id === r.id || (x.from === r.from && x.to === r.to) || (x.from === r.to && x.to === r.from))) j = idx;
          });
          if (j < 0) base.reqs.push(r);
          else if ((rank[r.status] || 0) > (rank[base.reqs[j].status] || 0)) base.reqs[j] = r;
        });
        (d.msgs || []).forEach(function (m) {
          if (!base.msgs.some(function (x) { return x.id === m.id; })) base.msgs.push(m);
        });
        (d.groups || []).forEach(function (g) {
          if (!base.groups.some(function (x) { return x.id === g.id; })) base.groups.push(g);
        });
        Object.keys(d.last || {}).forEach(function (u) {
          if (!base.last[u] || d.last[u] > base.last[u]) base.last[u] = d.last[u];
        });
      });
      base.msgs.sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
      _s.call(LS, "jenchat-shared", JSON.stringify(base));
      _s.call(LS, "jen-chat-merged", "1");
    } catch (e) {}
  })();
  function isLS(o) {
    return o === LS;
  }
  function shared(k) {
    return EXCL[k] === 1 || k.indexOf("jen-hub-") === 0;
  }
  function who() {
    try {
      return _g.call(LS, "jen-session") || "";
    } catch (e) {
      return "";
    }
  }
  function pre() {
    return "jen-u:" + (who() || "_") + ":";
  }
  function isOwner() {
    var e = who();
    return !!e && _g.call(LS, "jen-legacy-owner") === e;
  }
  function legacyMine() {
    var e = who();
    if (!e) return false;
    var o = _g.call(LS, "jen-legacy-owner");
    if (!o) {
      try {
        _s.call(LS, "jen-legacy-owner", e);
      } catch (x) {
        return false;
      }
      return true;
    }
    return o === e;
  }
  SP.getItem = function (k) {
    k = String(k);
    if (!isLS(this) || shared(k)) return _g.call(this, k);
    var v = _g.call(this, pre() + k);
    if (v === null && legacyMine()) {
      var old = _g.call(this, k);
      if (old !== null) {
        try {
          _s.call(this, pre() + k, old);
          _r.call(this, k);
        } catch (x) {}
        return old;
      }
    }
    return v;
  };
  SP.setItem = function (k, v) {
    k = String(k);
    return !isLS(this) || shared(k)
      ? _s.call(this, k, v)
      : _s.call(this, pre() + k, v);
  };
  SP.removeItem = function (k) {
    k = String(k);
    if (!isLS(this) || shared(k)) return _r.call(this, k);
    _r.call(this, pre() + k);
    if (isOwner()) _r.call(this, k);
  };
  SP.clear = function () {
    if (!isLS(this)) return _c.call(this);
    var p = pre(),
      n = _len.call(LS),
      del = [],
      i,
      kk;
    for (i = 0; i < n; i++) {
      kk = _k.call(LS, i);
      if (kk && kk.indexOf(p) === 0) del.push(kk);
    }
    del.forEach(function (x) {
      _r.call(LS, x);
    });
  };
  var KU = "jen-users",
    KS = "jen-session",
    KT = "jen-theme",
    DOM = "@jen4u.com";
  var root = document.documentElement;
  var me = document.currentScript,
    NOCHIP = !!(me && me.getAttribute("data-chip") === "off");
  var embedded = false;
  try {
    embedded = window.top !== window.self;
  } catch (e) {
    embedded = true;
  }

  function jget(k, d) {
    try {
      var v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch (e) {
      return d;
    }
  }
  function users() {
    var u = jget(KU, {});
    return u && typeof u === "object" ? u : {};
  }
  function sess() {
    try {
      return localStorage.getItem(KS) || "";
    } catch (e) {
      return "";
    }
  }
  function ok() {
    var s = sess();
    return !!(s && users()[s]);
  }
  function hs(s) {
    var h = 5381;
    for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) | 0;
    return String(h);
  }
  function rec(e) {
    var r = users()[e];
    return r && typeof r === "object" ? r : { pw: r };
  }
  function theme() {
    try {
      return localStorage.getItem(KT) === "light" ? "light" : "dark";
    } catch (e) {
      return "dark";
    }
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  if (!ok()) root.classList.add("jen-locked");

  var vars =
    "--bg:#0c0e18;--panel:#131626;--ink:#eef0fa;--mute:#8c92ad;--line:#232842;--acc:#8b7bff;--acc2:#ff6fae;--danger:#ff7a8a;";
  var varsL =
    "--bg:#f5f4fb;--panel:#fff;--ink:#16152a;--mute:#6b6a85;--line:#e4e2f2;--acc:#5b45f0;--acc2:#e0408a;--danger:#d03a4f;";
  var css =
    "html.jen-locked{overflow:hidden!important}" +
    "html.jen-locked body>*:not(#jen-gate):not(#jen-chip):not(#jen-menu){visibility:hidden!important}" +
    "#jen-gate,#jen-chip,#jen-menu,#jen-dlg,#jen-toast{" +
    vars +
    'font:15px/1.5 "Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);box-sizing:border-box}' +
    "#jen-gate[data-jt=light],#jen-chip[data-jt=light],#jen-menu[data-jt=light],#jen-dlg[data-jt=light],#jen-toast[data-jt=light]{" +
    varsL +
    "}" +
    "#jen-gate *{box-sizing:border-box}#jen-gate [hidden]{display:none!important}" +
    "#jen-gate{position:fixed;inset:0;z-index:2147483000;overflow:auto;display:grid;place-items:center;padding:20px;background:radial-gradient(900px 500px at 10% 0%,rgba(139,123,255,.2),transparent 60%),radial-gradient(700px 500px at 100% 100%,rgba(255,111,174,.16),transparent 60%),var(--bg)}" +
    ".jg-card{width:100%;max-width:400px;margin:auto;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:28px;box-shadow:0 12px 36px rgba(0,0,0,.35)}" +
    ".jg-logo{font-weight:700;font-size:20px;letter-spacing:-.02em}" +
    ".jg-grad{background:linear-gradient(135deg,var(--acc),var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent}" +
    ".jg-card h1{margin:8px 0 4px;font-size:24px;letter-spacing:-.02em}.jg-card p{margin:0 0 16px;color:var(--mute)}" +
    ".jg-f{display:block;margin-bottom:12px}.jg-f>span{display:block;font-size:13px;color:var(--mute);margin-bottom:4px}" +
    ".jg-f input,.jg-f select{width:100%;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:8px;padding:9px 11px;font:inherit}" +
    ".jg-f input:focus,.jg-f select:focus,.jg-suf:focus-within{border-color:var(--acc);outline:0}" +
    ".jg-suf{display:flex;align-items:center;border:1px solid var(--line);background:var(--bg);border-radius:8px}" +
    ".jg-suf input{border:0;background:none;flex:1;min-width:0}.jg-suf i{font-style:normal;color:var(--mute);padding-right:11px}" +
    ".jg-pw{position:relative}.jg-pw input{padding-right:44px}" +
    ".jg-eye{position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:0;color:var(--mute);padding:6px;display:grid;cursor:pointer;border-radius:8px}" +
    ".jg-eye:hover{color:var(--ink)}.jg-eye .sl{display:none}.jg-eye.on{color:var(--acc)}.jg-eye.on .sl{display:inline}" +
    ".jg-dob{display:grid;grid-template-columns:1fr 1.5fr 1fr;gap:8px}.jg-dob select,.jg-dob input{min-width:0}" +
    ".jg-msg{min-height:20px;color:var(--danger);font-size:13px;margin-bottom:8px}" +
    ".jg-btn{width:100%;border:0;border-radius:10px;padding:11px;font:inherit;font-weight:600;color:#fff;cursor:pointer;background:linear-gradient(135deg,var(--acc),var(--acc2)) 0 0/160% 100%;transition:background-position .45s,transform .12s}" +
    ".jg-btn:hover{background-position:100% 0}.jg-btn:active{transform:scale(.97)}" +
    ".jg-link{display:block;margin-top:14px;background:none;border:0;color:var(--acc);cursor:pointer;font:inherit;padding:0}" +
    "#jen-chip{position:fixed;right:14px;top:14px;width:38px;height:38px;border-radius:50%;border:0;z-index:2147482000;background:linear-gradient(135deg,var(--acc),var(--acc2)) center/cover no-repeat;color:#fff;font:700 15px/38px sans-serif;text-align:center;padding:0;cursor:pointer;box-shadow:0 0 0 2px var(--panel),0 6px 18px rgba(0,0,0,.35)}" +
    "@media(prefers-reduced-motion:no-preference){.jg-card{animation:jgr .5s cubic-bezier(.2,.8,.2,1)}#jen-menu{animation:jgr .2s ease}@keyframes jgr{from{opacity:0;transform:translateY(14px) scale(.98)}}}";
  css +=
    "#jen-dlg *{box-sizing:border-box}#jen-dlg [hidden]{display:none!important}#jen-menu{position:fixed;z-index:2147482001;width:270px;max-width:calc(100vw - 16px);background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:8px;box-shadow:0 16px 44px rgba(0,0,0,.4)}.jg-acc{display:flex;align-items:center;gap:10px;width:100%;background:none;border:0;border-radius:10px;padding:8px;text-align:left;color:var(--ink);font:inherit;cursor:pointer}.jg-acc:hover,.jg-item:hover{background:rgba(139,123,255,.12)}.jg-acc.cur{background:rgba(139,123,255,.18)}.jg-pt{flex:1;min-width:0}.jg-pt b,.jg-pt i{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.jg-pt i{font-style:normal;color:var(--mute);font-size:12px}.jg-acc em{font-style:normal;color:var(--acc);font-weight:700}#jen-menu hr,#jen-dlg hr{border:0;border-top:1px solid var(--line);margin:8px 0}.jg-item{display:block;width:100%;text-align:left;background:none;border:0;border-radius:10px;padding:10px;color:var(--ink);font:inherit;cursor:pointer}.jg-av{width:36px;height:36px;border-radius:50%;flex:none;display:grid;place-items:center;color:#fff;font-weight:600;background:linear-gradient(135deg,var(--acc),var(--acc2)) center/cover no-repeat}.jg-av.sm{width:32px;height:32px;font-size:13px}.jg-av.big{width:60px;height:60px;font-size:22px}#jen-dlg{position:fixed;inset:0;z-index:2147482100;display:grid;place-items:center;padding:16px;overflow:auto;background:rgba(10,8,30,.55)}#jen-dlg .jg-card{max-width:430px}.jg-bar{display:flex;gap:8px;justify-content:flex-end}.jg-sec,.jg-pri{border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:8px;padding:8px 14px;font:inherit;cursor:pointer}.jg-sec:hover{border-color:var(--mute)}.jg-sec.bad{color:var(--danger)}.jg-sec:disabled{opacity:.45;cursor:default}.jg-pri{border-color:transparent;color:#fff;font-weight:600;background:linear-gradient(135deg,var(--acc),var(--acc2))}.jg-ph{display:flex;gap:14px;align-items:center;margin-bottom:14px}.jg-ph b,.jg-ph small{display:block;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.jg-ph small{color:var(--mute);font-size:13px}.jg-prow{display:flex;gap:8px;margin-bottom:6px}.jg-prow .jg-sec{flex:1}.jg-srow{display:flex;justify-content:space-between;align-items:center;margin:16px 0}.jg-seg{display:flex;gap:6px}.jg-seg .on{background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff;border-color:transparent}#jen-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:9px 16px;border-radius:8px;z-index:2147483100}";
  css +=
    ".jg-alt{width:100%;margin-top:10px;border:1px solid var(--line);background:none;color:var(--ink);border-radius:10px;padding:10px;font:inherit;cursor:pointer}.jg-alt:hover{border-color:var(--acc)}.jg-jl{margin-top:10px;border:1px solid var(--line);border-radius:12px;padding:6px;max-height:240px;overflow:auto}";
  css +=
    ".jg-type{margin-bottom:6px}.jg-tb{display:block;width:100%;text-align:left;margin-bottom:10px;padding:14px;border:1px solid var(--line);background:none;color:var(--ink);border-radius:12px;font:inherit;cursor:pointer}.jg-tb:hover{border-color:var(--acc)}.jg-tb b{display:block}.jg-tb small{display:block;color:var(--mute);margin-top:2px}.jg-dmw{display:flex;align-items:center;flex:1.3;min-width:0;color:var(--mute)}.jg-dmw b{font-weight:400}";
  css +=
    ".jg-ch{display:block;width:100%;text-align:left;margin-bottom:10px;padding:14px;border:1px solid var(--line);background:none;color:var(--ink);border-radius:12px;font:inherit;cursor:pointer}.jg-ch:hover{border-color:var(--acc)}.jg-ch b{display:block}.jg-ch small{display:block;color:var(--mute);margin-top:2px}.jg-suf #jg-u{flex:1;min-width:0}.jg-dmw{flex:2!important}.jg-dmw b{padding-right:2px}.jg-suf .jg-dmw input{padding:9px 2px}.jg-dot{display:inline-block;width:7px;height:7px;margin-left:7px;border-radius:50%;background:var(--acc);vertical-align:middle}";
  var st = document.createElement("style");
  st.id = "jen-auth-css";
  st.textContent = css;
  (document.head || root).appendChild(st);

  var EYE =
    '<button type="button" class="jg-eye" data-e="%" aria-label="Show password"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/><path class="sl" d="M3 3l18 18"/></svg></button>';
  var MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  var gate,
    mode = "in",
    acct = "personal",
    bdom = "regular";
  function okDomain(d) {
    return /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(
      d,
    );
  }
  function okAddress(a) {
    var p = a.split("@");
    return p.length === 2 && /^[a-z0-9._]{3,30}$/.test(p[0]) && okDomain(p[1]);
  }
  function $(id) {
    return document.getElementById("jg-" + id);
  }
  /* a work or business account: flagged at signup, or any address that is not @jen4u.com */
  function isBiz(r, e) {
    return !!(
      (r && (r.kind === "biz" || r.acct === "biz")) ||
      !/@jen4u\.com$/i.test(e || "")
    );
  }
  function orgs() {
    var o = jget("jen-orgs", {});
    return o && typeof o === "object" ? o : {};
  }

  function readDob(p) {
    p = p || "";
    var d = +$(p + "dd").value,
      m = +$(p + "dm").value,
      y = $(p + "dy").value;
    if (!d || !m || y.length !== 4)
      return {
        ok: false,
        msg: "Choose your full date of birth (day, month and a 4-digit year).",
      };
    var Y = +y,
      dt = new Date(Y, m - 1, d);
    if (
      Y < 1900 ||
      dt.getFullYear() !== Y ||
      dt.getMonth() !== m - 1 ||
      dt.getDate() !== d
    )
      return { ok: false, msg: "That date of birth is not valid." };
    var t = new Date();
    if (dt > t)
      return { ok: false, msg: "Date of birth cannot be in the future." };
    var age = t.getFullYear() - Y;
    if (t < new Date(t.getFullYear(), m - 1, d)) age--;
    if (age < 13)
      return { ok: false, msg: "You must be at least 13 years old." };
    return {
      ok: true,
      value:
        Y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"),
    };
  }

  function setMode(m) {
    mode = m;
    var up = m === "up",
      pick = m === "pick",
      dom = m === "dom",
      org = m === "org",
      oc = m === "ocreate",
      oj = m === "ojoin",
      pg = pick || dom || org || oc || oj,
      biz = up && acct === "biz",
      custom = bdom === "custom";
    $("h").textContent = oc
      ? "Create an organization"
      : oj
        ? "Join an organization"
        : org
          ? "Your organization"
          : up || pick || dom
            ? "Create your account"
            : "Log in";
    $("s").textContent = pick
      ? "How will you use JEN?"
      : dom
        ? "Choose the domain for your work address."
        : org
          ? "Join an existing organization, or create a new one."
          : oc
            ? "Members need the 6-digit code to join, so keep it safe."
            : oj
              ? "Enter the organization username and its 6-digit secret PIN."
              : up
                ? biz && custom
                  ? "Use your own domain, like hello@yourcompany.com."
                  : "Pick a username. Your address will end in @jen4u.com."
                : "Use your JEN address to continue.";
    $("b").textContent = oc
      ? "Create organization"
      : oj
        ? "Join organization"
        : biz
          ? "Next"
          : up
            ? "Create account"
            : "Log in";
    $("sw").textContent =
      up || pick
        ? "Already have an account? Log in"
        : "New here? Create an account";
    $("sw").hidden = dom || org || oc || oj;
    $("bk").hidden = !(dom || biz || oc || oj || org);
    $("p").autocomplete = up ? "new-password" : "current-password";
    $("f")
      .querySelectorAll(":scope > .jg-f")
      .forEach(function (e) {
        e.hidden = pg || (e.classList.contains("jg-up") && !up);
      });
    $("t").hidden = !pick;
    $("dp").hidden = !dom;
    $("op").hidden = !org;
    $("oc").hidden = !oc;
    $("oj").hidden = !oj;
    $("b").hidden = pick || dom || org;
    $("j").hidden = up || pg;
    $("jl").hidden = true;
    $("ul").textContent = up
      ? biz
        ? "Work address"
        : "Username"
      : "Username or address";
    $("dmw").hidden = !(biz && custom);
    $("tld").hidden = $("dom").value.indexOf(".") > -1;
    $("sfx").hidden =
      (biz && custom) || (!up && $("u").value.indexOf("@") > -1);
    $("m").textContent = "";
  }

  function build() {
    gate = document.createElement("div");
    gate.id = "jen-gate";
    gate.setAttribute("data-jt", theme());
    gate.innerHTML =
      '<form class="jg-card" id="jg-f" novalidate>' +
      '<div class="jg-logo">JEN <span class="jg-grad">Ecosystem</span></div>' +
      '<h1 id="jg-h"></h1><p id="jg-s"></p>' +
      '<div class="jg-type" id="jg-t" hidden><button type="button" class="jg-tb" data-k="personal"><b>For personal use</b><small>Your address ends in @jen4u.com</small></button><button type="button" class="jg-tb" data-k="biz"><b>For work &amp; business</b><small>Sign up with your own domain</small></button></div>' +
      '<div class="jg-type" id="jg-dp" hidden><button type="button" class="jg-ch" data-d="regular"><b>Use regular domain</b><small>Your address ends in @jen4u.com</small></button><button type="button" class="jg-ch" data-d="custom"><b>Use custom domain</b><small>Use your own, like support@yourcompany.com</small></button></div>' +
      '<div class="jg-type" id="jg-op" hidden><button type="button" class="jg-ch" data-o="join"><b>Join an organization</b><small>Enter the organization username and 6-digit secret PIN</small></button><button type="button" class="jg-ch" data-o="create"><b>Create an organization</b><small>Set up a new organization for your team</small></button></div>' +
      '<label class="jg-f jg-up" hidden><span>Full name</span><input id="jg-n" autocomplete="name"></label>' +
      '<div class="jg-f jg-up" hidden><span>Date of birth</span><div class="jg-dob"><select id="jg-dd" aria-label="Day"></select><select id="jg-dm" aria-label="Month"></select><input id="jg-dy" inputmode="numeric" maxlength="4" placeholder="Year" aria-label="Year" autocomplete="off"></div></div>' +
      '<label class="jg-f jg-up" hidden><span>Gender</span><select id="jg-g"></select></label>' +
      '<label class="jg-f"><span id="jg-ul">Username or address</span><div class="jg-suf"><input id="jg-u" autocomplete="username" autocapitalize="off"><i id="jg-sfx">@jen4u.com</i><span class="jg-dmw" id="jg-dmw" hidden><b>@</b><input id="jg-dom" autocomplete="off" autocapitalize="off" placeholder="yourcompany"><i id="jg-tld">.com</i></span></div></label>' +
      '<label class="jg-f"><span>Password</span><div class="jg-pw"><input id="jg-p" type="password">' +
      EYE.replace("%", "p") +
      "</div></label>" +
      '<label class="jg-f jg-up" hidden><span>Confirm password</span><div class="jg-pw"><input id="jg-p2" type="password" autocomplete="new-password">' +
      EYE.replace("%", "p2") +
      "</div></label>" +
      '<div id="jg-oc" hidden>' +
      '<label class="jg-f"><span>Organization name</span><input id="jg-on" autocomplete="off" maxlength="60"></label>' +
      '<label class="jg-f"><span>Organization username</span><input id="jg-ou" autocomplete="off" autocapitalize="off" maxlength="30" placeholder="small letters and numbers only"></label>' +
      '<label class="jg-f"><span>Organization password</span><div class="jg-pw"><input id="jg-op1" type="password" autocomplete="new-password">' +
      EYE.replace("%", "op1") +
      "</div></label>" +
      '<label class="jg-f"><span>Confirm password</span><div class="jg-pw"><input id="jg-op2" type="password" autocomplete="new-password">' +
      EYE.replace("%", "op2") +
      "</div></label>" +
      '<label class="jg-f"><span>6-digit code</span><div class="jg-pw"><input id="jg-ocd" type="password" inputmode="numeric" maxlength="6" autocomplete="off">' +
      EYE.replace("%", "ocd") +
      "</div></label>" +
      "</div>" +
      '<div id="jg-oj" hidden>' +
      '<label class="jg-f"><span>Organization username</span><input id="jg-ju" autocomplete="off" autocapitalize="off" maxlength="30"></label>' +
      '<label class="jg-f"><span>6-digit secret PIN</span><div class="jg-pw"><input id="jg-jp" type="password" inputmode="numeric" maxlength="6" autocomplete="off">' +
      EYE.replace("%", "jp") +
      "</div></label>" +
      "</div>" +
      '<div class="jg-msg" id="jg-m" role="alert"></div>' +
      '<button class="jg-btn" id="jg-b"></button>' +
      '<button type="button" class="jg-alt" id="jg-j">Login with JEN</button><div class="jg-jl" id="jg-jl" hidden></div>' +
      '<button type="button" class="jg-link" id="jg-sw"></button>' +
      '<button type="button" class="jg-link" id="jg-bk" hidden>Back</button>' +
      '<button type="button" class="jg-link" id="jg-c" hidden>Cancel and go back</button></form>';
    document.body.appendChild(gate);
    function fill(id, first, items) {
      $(id).innerHTML =
        '<option value="">' +
        first +
        "</option>" +
        items
          .map(function (i) {
            return '<option value="' + i[0] + '">' + i[1] + "</option>";
          })
          .join("");
    }
    fill(
      "dd",
      "Day",
      Array.from({ length: 31 }, function (_, i) {
        return [i + 1, i + 1];
      }),
    );
    fill(
      "dm",
      "Month",
      MONTHS.map(function (t, i) {
        return [i + 1, t];
      }),
    );
    fill("g", "Select gender", [
      ["male", "Male"],
      ["female", "Female"],
      ["other", "Other"],
      ["none", "Prefer not to say"],
    ]);
    $("dy").addEventListener("input", function (e) {
      e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
    });
    gate.querySelectorAll("[data-e]").forEach(function (b) {
      b.onclick = function (e) {
        e.preventDefault();
        var i = $(b.dataset.e),
          show = i.type === "password";
        i.type = show ? "text" : "password";
        b.classList.toggle("on", show);
        b.setAttribute("aria-label", show ? "Hide password" : "Show password");
      };
    });
    $("sw").onclick = function () {
      setMode(mode === "in" ? "pick" : "in");
    };
    $("f").onsubmit = submit;
    acct = "personal";
    bdom = "regular";
    gate.querySelectorAll(".jg-tb").forEach(function (b) {
      b.onclick = function () {
        acct = b.dataset.k;
        if (acct === "biz") setMode("dom");
        else {
          setMode("up");
          $("n").focus();
        }
      };
    });
    gate.querySelectorAll("[data-d]").forEach(function (b) {
      b.onclick = function () {
        bdom = b.dataset.d;
        setMode("up");
        $("n").focus();
      };
    });
    gate.querySelectorAll("[data-o]").forEach(function (b) {
      b.onclick = function () {
        var j = b.dataset.o === "join";
        setMode(j ? "ojoin" : "ocreate");
        $(j ? "ju" : "on").focus();
      };
    });
    $("bk").onclick = function () {
      setMode(
        { up: "dom", dom: "pick", org: "up", ocreate: "org", ojoin: "org" }[
          mode
        ] || "in",
      );
    };
    ["ou", "ju"].forEach(function (id) {
      $(id).addEventListener("input", function (e) {
        e.target.value = e.target.value
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 30);
      });
    });
    ["ocd", "jp"].forEach(function (id) {
      $(id).addEventListener("input", function (e) {
        e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
      });
    });
    $("dom").addEventListener("input", function () {
      $("tld").hidden = $("dom").value.indexOf(".") > -1;
    });
    $("u").addEventListener("input", function () {
      if (mode === "in") $("sfx").hidden = $("u").value.indexOf("@") > -1;
    });
    $("c").onclick = function () {
      if (gate) {
        gate.remove();
        gate = null;
      }
    };
    /* Login with JEN: every JEN account saved in this browser, one click to enter */
    $("j").onclick = function () {
      var box = $("jl");
      if (!box.hidden) {
        box.hidden = true;
        return;
      }
      var all = users(),
        keys = Object.keys(all);
      box.innerHTML = keys.length
        ? keys
            .map(function (e) {
              var r = rec(e),
                bg = r.avatar
                  ? " style=\"background-image:url('" + r.avatar + "')\""
                  : "";
              return (
                '<button type="button" class="jg-acc" data-pick="' +
                esc(e) +
                '"><span class="jg-av sm"' +
                bg +
                ">" +
                (r.avatar ? "" : esc(ini(r.name || e))) +
                '</span><span class="jg-pt"><b>' +
                esc(r.name || e.split("@")[0]) +
                "</b><i>" +
                esc(e) +
                "</i></span></button>"
              );
            })
            .join("")
        : '<p style="margin:8px;color:var(--mute)">No JEN accounts in this browser yet.</p>';
      box.hidden = false;
    };
    $("jl").onclick = function (e) {
      var b = e.target.closest("[data-pick]");
      if (b && users()[b.dataset.pick]) done(b.dataset.pick);
    };
    setMode("in");
    $("u").focus();
  }

  function submit(e) {
    e.preventDefault();
    var all = users();
    function err(t) {
      $("m").textContent = t;
    }
    if (mode === "in") {
      var raw0 = $("u").value.trim().toLowerCase(),
        p0 = $("p").value;
      var em = raw0.indexOf("@") > -1 ? raw0 : raw0 + DOM;
      if (!okAddress(em))
        return err(
          "Enter your username, or your full address like hello@yourcompany.com.",
        );
      if (p0.length < 6) return err("Password needs at least 6 characters.");
      if (!all[em] || rec(em).pw !== hs(p0))
        return err("Wrong username or password.");
      return done(em);
    }
    /* signup: read and check the account part */
    var raw = $("u").value.trim().toLowerCase(),
      p = $("p").value,
      email;
    if (!/^[a-z0-9._]{3,30}$/.test(raw))
      return err(
        "Username needs 3 to 30 letters, numbers, dots or underscores.",
      );
    if (acct === "biz" && bdom === "custom") {
      var dm = $("dom").value.trim().toLowerCase().replace(/^@/, "");
      if (dm.indexOf(".") < 0) dm += ".com";
      if (!okDomain(dm))
        return err("Enter a valid domain, like yourcompany.com.");
      email = raw + "@" + dm;
    } else email = raw + DOM;
    if (p.length < 6) return err("Password needs at least 6 characters.");
    var name = $("n").value.trim();
    if (name.length < 2) return err("Enter your full name.");
    var d = readDob();
    if (!d.ok) return err(d.msg);
    if (!$("g").value) return err("Choose your gender.");
    if (p !== $("p2").value) return err("The two passwords do not match.");
    if (all[email]) return err("That username is taken. Try another one.");
    /* work accounts continue to the organization step; the account is created at the end */
    if (mode === "up" && acct === "biz") return setMode("org");
    var og = orgs(),
      key,
      mk = "member",
      rec2;
    if (mode === "ocreate") {
      var on = $("on").value.trim(),
        ou = $("ou").value,
        o1 = $("op1").value,
        code = $("ocd").value;
      if (on.length < 2)
        return err("Enter the organization name (at least 2 characters).");
      if (!/^[a-z0-9]{3,30}$/.test(ou))
        return err(
          "Organization username needs 3 to 30 small letters or numbers.",
        );
      if (o1.length < 6)
        return err("Organization password needs at least 6 characters.");
      if (o1 !== $("op2").value)
        return err("The two organization passwords do not match.");
      if (!/^\d{6}$/.test(code))
        return err("The code must be exactly 6 digits.");
      if (og[ou])
        return err("That organization username is taken. Try another one.");
      key = ou;
      mk = "owner";
      rec2 = {
        name: on,
        pw: hs(o1),
        code: hs(code),
        members: [],
        fails: 0,
        until: 0,
      };
    } else if (mode === "ojoin") {
      var ju = $("ju").value,
        pin = $("jp").value;
      if (!/^[a-z0-9]{3,30}$/.test(ju))
        return err("Enter the organization username.");
      if (!/^\d{6}$/.test(pin))
        return err("The secret PIN must be exactly 6 digits.");
      var g = og[ju];
      if (!g) return err("Wrong organization username or PIN.");
      if (g.until > Date.now())
        return err("Too many wrong tries. Try again in 10 minutes.");
      if (g.code !== hs(pin)) {
        g.fails++;
        if (g.fails >= 5) {
          g.fails = 0;
          g.until = Date.now() + 10 * 60000;
        }
        save("jen-orgs", og);
        return err("Wrong organization username or PIN.");
      }
      g.fails = 0;
      key = ju;
      rec2 = g;
    }
    all[email] = {
      pw: hs(p),
      name: name,
      dob: d.value,
      gender: $("g").value,
      avatar: "",
      kind: acct,
      acct: acct === "biz" ? "biz" : "",
    };
    if (key) {
      rec2.members = (rec2.members || []).filter(function (x) {
        return x.email !== email;
      });
      rec2.members.push({ email: email, role: mk });
      og[key] = rec2;
    }
    try {
      localStorage.setItem(KU, JSON.stringify(all));
      if (key) localStorage.setItem("jen-orgs", JSON.stringify(og));
    } catch (x) {
      return err("Could not save the account in this browser.");
    }
    done(email);
  }

  function done(email) {
    try {
      localStorage.setItem(KS, email);
    } catch (x) {}
    remember(email);
    location.reload(); /* reload so the app loads this account's own content */
  }

  /* ---------- account menu, profile, settings, passwords ---------- */
  var KA = "jen-accounts",
    KM = "jen-mails",
    H = {},
    menu = null,
    dlg = null,
    tt = null;
  function save(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch (e) {
      return false;
    }
  }
  function getT() {
    return H.getTheme ? H.getTheme() : theme();
  }
  function setT(t) {
    try {
      localStorage.setItem(KT, t);
    } catch (e) {}
    if (H.setTheme) H.setTheme(t);
    document.querySelectorAll("[data-jt]").forEach(function (e) {
      e.setAttribute("data-jt", t);
    });
  }
  function ini(n) {
    return ((n || "?").trim()[0] || "?").toUpperCase();
  }
  function announce() {
    try {
      window.dispatchEvent(
        new CustomEvent("jen-auth", { detail: { email: sess() } }),
      );
    } catch (x) {}
  }
  function toast(t) {
    if (tt) tt.remove();
    var x = (tt = document.createElement("div"));
    x.id = "jen-toast";
    x.setAttribute("data-jt", getT());
    x.textContent = t;
    document.body.appendChild(x);
    setTimeout(function () {
      x.remove();
    }, 2800);
  }
  function remember(email) {
    var r = rec(email),
      l = jget(KA, []),
      i = l.findIndex(function (a) {
        return a.email === email;
      });
    var o = {
      email: email,
      name: r.name || "",
      avatar: r.avatar || "",
      access_token: "",
      refresh_token: "",
    };
    if (i < 0) l.push(o);
    else l[i] = o;
    save(KA, l);
  }
  function update(email, patch) {
    var all = users(),
      r = all[email];
    if (!r || typeof r !== "object") r = { pw: r };
    Object.keys(patch).forEach(function (k) {
      r[k] = patch[k];
    });
    all[email] = r;
    if (!save(KU, all)) {
      toast("Browser storage is full.");
      return false;
    }
    remember(email);
    announce();
    return true;
  }
  function logout(email) {
    save(
      KA,
      jget(KA, []).filter(function (a) {
        return a.email !== email;
      }),
    );
    try {
      localStorage.removeItem(KS);
    } catch (x) {}
    location.reload();
  }
  function paintAv(el, r, email) {
    el.style.backgroundImage = r.avatar
      ? "url(" + JSON.stringify(r.avatar) + ")"
      : "";
    el.textContent = r.avatar ? "" : ini(r.name || email);
  }
  function fillSel(id, first, items) {
    $(id).innerHTML =
      '<option value="">' +
      first +
      "</option>" +
      items
        .map(function (i) {
          return '<option value="' + i[0] + '">' + i[1] + "</option>";
        })
        .join("");
  }
  function pwf(id, label, ac) {
    return (
      '<label class="jg-f"><span>' +
      label +
      '</span><div class="jg-pw"><input id="jg-' +
      id +
      '" type="password" autocomplete="' +
      ac +
      '">' +
      EYE.replace("%", id) +
      "</div></label>"
    );
  }
  function wireEyes(root2) {
    root2.querySelectorAll("[data-e]").forEach(function (b) {
      b.onclick = function (e) {
        e.preventDefault();
        var i = $(b.dataset.e),
          show = i.type === "password";
        i.type = show ? "text" : "password";
        b.classList.toggle("on", show);
        b.setAttribute("aria-label", show ? "Hide password" : "Show password");
      };
    });
  }
  function toSquare(file) {
    return new Promise(function (res, bad) {
      var img = new Image(),
        url = URL.createObjectURL(file);
      img.onload = function () {
        var n = 256,
          c = document.createElement("canvas"),
          m = Math.min(img.width, img.height);
        c.width = c.height = n;
        c.getContext("2d").drawImage(
          img,
          (img.width - m) / 2,
          (img.height - m) / 2,
          m,
          m,
          0,
          0,
          n,
          n,
        );
        URL.revokeObjectURL(url);
        res(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = function () {
        bad();
      };
      img.src = url;
    });
  }
  function closeMenu() {
    if (menu) {
      menu.remove();
      menu = null;
    }
  }
  function closeDlg() {
    if (dlg) {
      dlg.remove();
      dlg = null;
    }
  }
  function modal(html) {
    closeMenu();
    closeDlg();
    dlg = document.createElement("div");
    dlg.id = "jen-dlg";
    dlg.setAttribute("data-jt", getT());
    dlg.innerHTML = '<div class="jg-card">' + html + "</div>";
    dlg.onclick = function (e) {
      if (e.target === dlg) closeDlg();
    };
    document.body.appendChild(dlg);
    wireEyes(dlg);
  }

  function manage() {
    var email = sess(),
      r = rec(email);
    modal(
      '<h1 style="font-size:20px">Manage profile</h1>' +
        '<label class="jg-f"><span>Full name</span><input id="jg-xn" autocomplete="name"></label>' +
        '<div class="jg-f"><span>Date of birth</span><div class="jg-dob"><select id="jg-xdd" aria-label="Day"></select><select id="jg-xdm" aria-label="Month"></select><input id="jg-xdy" inputmode="numeric" maxlength="4" placeholder="Year" aria-label="Year" autocomplete="off"></div></div>' +
        '<label class="jg-f"><span>Gender</span><select id="jg-xg"></select></label>' +
        '<label class="jg-f"><span>Your address (cannot be changed)</span><input id="jg-xa" disabled></label>' +
        '<div class="jg-msg" id="jg-xm" role="alert"></div><div class="jg-bar"><button class="jg-sec" id="jg-xc">Cancel</button><button class="jg-pri" id="jg-xs">Save changes</button></div>',
    );
    fillSel(
      "xdd",
      "Day",
      Array.from({ length: 31 }, function (_, i) {
        return [i + 1, i + 1];
      }),
    );
    fillSel(
      "xdm",
      "Month",
      MONTHS.map(function (t, i) {
        return [i + 1, t];
      }),
    );
    fillSel("xg", "Select gender", [
      ["male", "Male"],
      ["female", "Female"],
      ["other", "Other"],
      ["none", "Prefer not to say"],
    ]);
    var p = (r.dob || "").split("-");
    $("xn").value = r.name || "";
    $("xdy").value = p[0] || "";
    $("xdm").value = p[1] ? +p[1] : "";
    $("xdd").value = p[2] ? +p[2] : "";
    $("xg").value = r.gender || "";
    $("xa").value = email;
    $("xdy").addEventListener("input", function (e) {
      e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
    });
    $("xc").onclick = closeDlg;
    $("xs").onclick = function () {
      var n = $("xn").value.trim();
      function err(t) {
        $("xm").textContent = t;
      }
      if (n.length < 2) return err("Enter your full name.");
      var d = readDob("x");
      if (!d.ok) return err(d.msg);
      if (!$("xg").value) return err("Choose your gender.");
      if (update(email, { name: n, dob: d.value, gender: $("xg").value })) {
        closeDlg();
        toast("Profile updated");
      }
    };
  }

  function changePw() {
    var email = sess();
    modal(
      '<h1 style="font-size:20px">Change password</h1>' +
        pwf("co", "Current password", "current-password") +
        pwf("cn", "New password", "new-password") +
        pwf("cc", "Confirm new password", "new-password") +
        '<div class="jg-msg" id="jg-cm" role="alert"></div><div class="jg-bar"><button class="jg-sec" id="jg-cx">Cancel</button><button class="jg-pri" id="jg-cs">Update password</button></div>',
    );
    $("co").focus();
    $("cx").onclick = closeDlg;
    $("cs").onclick = function () {
      var o = $("co").value,
        n = $("cn").value,
        c = $("cc").value;
      function err(t) {
        $("cm").textContent = t;
      }
      if (!o) return err("Enter your current password.");
      if (n.length < 6) return err("New password needs at least 6 characters.");
      if (n === o)
        return err("The new password must be different from the old one.");
      if (n !== c) return err("The two new passwords do not match.");
      if (rec(email).pw !== hs(o))
        return err("Your current password is incorrect.");
      if (update(email, { pw: hs(n) })) {
        closeDlg();
        toast("Password changed");
      }
    };
  }

  function delAccount() {
    var email = sess();
    modal(
      '<h1 style="font-size:20px">Delete account</h1><p>Deleting your account is permanent. Enter your current password to continue.</p>' +
        pwf("ko", "Current password", "current-password") +
        '<div class="jg-msg" id="jg-km" role="alert"></div><div class="jg-bar"><button class="jg-sec" id="jg-kx">Cancel</button><button class="jg-sec bad" id="jg-kg">Continue</button></div>',
    );
    $("ko").focus();
    $("kx").onclick = closeDlg;
    $("kg").onclick = function () {
      if (!$("ko").value)
        return ($("km").textContent = "Enter your current password.");
      if (rec(email).pw !== hs($("ko").value))
        return ($("km").textContent = "Your current password is incorrect.");
      if (
        !confirm(
          "Delete " + email + " and all of its mail? This cannot be undone.",
        )
      )
        return;
      var all = users();
      delete all[email];
      save(KU, all);
      var og = orgs();
      Object.keys(og).forEach(function (k) {
        og[k].members = (og[k].members || []).filter(function (x) {
          return x.email !== email;
        });
      });
      save("jen-orgs", og);
      save(
        KM,
        (jget(KM, []) || []).filter(function (m) {
          return m.owner !== email;
        }),
      );
      logout(email);
    };
  }

  function settings() {
    var email = sess(),
      r = rec(email);
    modal(
      '<h1 style="font-size:20px">Settings</h1>' +
        '<div class="jg-ph"><div class="jg-av big" id="jg-sav"></div><div><b>' +
        esc(r.name || email.split("@")[0]) +
        "</b><small>" +
        esc(email) +
        "</small></div></div>" +
        '<div class="jg-prow"><button class="jg-sec" id="jg-sph">Change photo</button><button class="jg-sec" id="jg-srm">Remove photo</button></div>' +
        '<input type="file" id="jg-sf" accept="image/*" hidden>' +
        '<div class="jg-srow"><span>Theme</span><div class="jg-seg"><button class="jg-sec" data-t="dark">Dark</button><button class="jg-sec" data-t="light">Light</button></div></div>' +
        '<div class="jg-srow"><span>Password</span><button class="jg-sec" id="jg-spw">Change password</button></div><hr>' +
        '<div class="jg-bar" style="justify-content:space-between"><button class="jg-sec bad" id="jg-sdel">Delete account</button><span style="display:flex;gap:8px"><button class="jg-sec" id="jg-sout">Log out</button><button class="jg-pri" id="jg-sdone">Done</button></span></div>',
    );
    function av() {
      var cur = rec(email);
      paintAv($("sav"), cur, email);
      $("srm").disabled = !cur.avatar;
    }
    function mark() {
      dlg.querySelectorAll("[data-t]").forEach(function (x) {
        x.classList.toggle("on", x.dataset.t === getT());
      });
    }
    av();
    mark();
    dlg.querySelectorAll("[data-t]").forEach(function (b) {
      b.onclick = function () {
        setT(b.dataset.t);
        mark();
      };
    });
    $("sph").onclick = function () {
      $("sf").click();
    };
    $("sf").onchange = function (e) {
      var f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      if (!/^image\//.test(f.type)) return toast("Choose an image file.");
      if (f.size > 8 * 1024 * 1024)
        return toast("Image is too large. Use one under 8 MB.");
      toSquare(f).then(
        function (d) {
          if (update(email, { avatar: d })) {
            av();
            toast("Photo updated");
          }
        },
        function () {
          toast("Could not read that image.");
        },
      );
    };
    $("srm").onclick = function () {
      if (update(email, { avatar: "" })) {
        av();
        toast("Photo removed");
      }
    };
    $("spw").onclick = changePw;
    $("sdel").onclick = delAccount;
    $("sout").onclick = function () {
      if (confirm("Log out of " + email + "?")) logout(email);
    };
    $("sdone").onclick = closeDlg;
  }

  function switchTo(email) {
    try {
      localStorage.setItem(KS, email);
    } catch (x) {}
    remember(email);
    location.reload();
  }
  function addAccount() {
    closeMenu();
    closeDlg();
    if (gate) return;
    build();
    $("c").hidden = false;
  }
  function openMenu(anchor) {
    if (menu) return closeMenu();
    closeDlg();
    var email = sess();
    if (!email) return;
    remember(email);
    var list = Object.keys(users()).map(function (e) {
      return { email: e };
    }); /* every JEN account in this browser */
    menu = document.createElement("div");
    menu.id = "jen-menu";
    menu.setAttribute("data-jt", getT());
    menu.innerHTML =
      list
        .map(function (a) {
          var r = rec(a.email),
            bg = r.avatar
              ? " style=\"background-image:url('" + r.avatar + "')\""
              : "";
          return (
            '<button type="button" class="jg-acc' +
            (a.email === email ? " cur" : "") +
            '" data-acc="' +
            esc(a.email) +
            '"><span class="jg-av sm"' +
            bg +
            ">" +
            (r.avatar ? "" : esc(ini(r.name || a.email))) +
            '</span><span class="jg-pt"><b>' +
            esc(r.name || a.email.split("@")[0]) +
            (isBiz(r, a.email)
              ? '<span class="jg-dot" title="Work or business account" aria-label="Work or business account"></span>'
              : "") +
            "</b><i>" +
            esc(a.email) +
            "</i></span>" +
            (a.email === email ? "<em>\u2713</em>" : "") +
            "</button>"
          );
        })
        .join("") +
      '<hr><button type="button" class="jg-item" data-a="add">Add new account</button><button type="button" class="jg-item" data-a="manage">Manage profile</button><button type="button" class="jg-item" data-a="settings">Settings</button>';
    var rc = anchor.getBoundingClientRect();
    menu.style.left =
      Math.max(8, Math.min(rc.left, window.innerWidth - 278)) + "px";
    if (rc.top < window.innerHeight / 2) menu.style.top = rc.bottom + 8 + "px";
    else menu.style.bottom = window.innerHeight - rc.top + 8 + "px";
    menu.onclick = function (e) {
      e.stopPropagation();
      var b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.acc) {
        if (b.dataset.acc !== sess()) switchTo(b.dataset.acc);
        else closeMenu();
      } else if (b.dataset.a === "add") addAccount();
      else if (b.dataset.a === "manage") manage();
      else if (b.dataset.a === "settings") settings();
    };
    document.body.appendChild(menu);
  }
  document.addEventListener("click", closeMenu);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeMenu();
      closeDlg();
    }
  });

  function chip() {
    if (document.getElementById("jen-chip")) return;
    var b = document.createElement("button");
    b.id = "jen-chip";
    b.setAttribute("data-jt", getT());
    b.setAttribute("aria-label", "Account");
    document.body.appendChild(b);
    function paint() {
      var e = sess();
      paintAv(b, rec(e), e);
    }
    paint();
    window.addEventListener("jen-auth", paint);
    b.onclick = function (e) {
      e.stopPropagation();
      openMenu(b);
    };
  }

  /* small API so an app can show the logged-in user and open the account menu itself */
  window.JENAuth = {
    user: function () {
      if (!ok()) return null;
      var e = sess(),
        r = rec(e);
      return {
        email: e,
        username: e.split("@")[0],
        name: r.name || e.split("@")[0],
        avatar: r.avatar || "",
      };
    },
    logout: function () {
      logout(sess());
    },
    openMenu: openMenu,
    hooks: function (h) {
      H = h || {};
    },
  };

  function mount() {
    if (!ok()) {
      if (!gate) build();
    } else {
      remember(sess());
      if (!embedded && !NOCHIP) chip();
    }
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mount);
  else mount();
  /* logging out in another tab locks this one too */
  window.addEventListener("storage", function (e) {
    if (e.key === KS) location.reload();
  });
})();