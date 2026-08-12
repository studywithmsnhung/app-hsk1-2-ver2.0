/* =====================================================================
   app.js — Ứng dụng học tiếng Trung studywithmsnhung (bản PWA cho học sinh)

   Khác bản web cũ:
     • Không đăng nhập, không mật khẩu, không trang quản trị.
       Học sinh chỉ nhập tên → mọi thứ lưu ngay trong máy (localStorage).
     • 30 bài học của GTCHSK1 và GTCHSK2 (bản 2.0) nằm sẵn trong app,
       không cần tải lên, không cần mạng.
     • Thêm: Ôn tập ngắt quãng (SRS), Tra từ toàn khoá, Mục tiêu ngày + chuỗi ngày.
     • Có nút Xuất / Nhập dữ liệu học tập dạng file .json.
   ===================================================================== */

/* ═══════════════════════ 1. CẤU HÌNH ═══════════════════════ */
window.SWMN_CONFIG = {
  courses: [
    { id: "k1v2", name: "GTCHSK1", edition: "2.0", zh: "标准教程 HSK1", color: "#8B1E28" },
    { id: "k2v2", name: "GTCHSK2", edition: "2.0", zh: "标准教程 HSK2", color: "#A6712F" }
  ]
};

/* ═══════════════════════ 2. TIỆN ÍCH GIAO DIỆN ═══════════════════════ */
(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function el(tag, attrs, html) {
    const n = document.createElement(tag);
    if (attrs)
      for (const k in attrs) {
        if (k === "class") n.className = attrs[k];
        else if (k.startsWith("on") && typeof attrs[k] === "function")
          n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
      }
    if (html != null) n.innerHTML = html;
    return n;
  }

  let toastHost = null;
  function toast(msg, kind, ms) {
    if (!toastHost) {
      toastHost = document.getElementById("toastHost");
      if (!toastHost) {
        toastHost = el("div", { id: "toastHost" });
        document.body.appendChild(toastHost);
      }
    }
    const t = el("div", { class: "toast" + (kind ? " " + kind : "") }, esc(msg));
    toastHost.appendChild(t);
    setTimeout(() => {
      t.style.transition = "opacity .25s, transform .25s";
      t.style.opacity = "0";
      t.style.transform = "translateY(8px)";
      setTimeout(() => t.remove(), 260);
    }, ms || 2600);
  }

  function timeAgo(ms) {
    if (!ms) return "—";
    const d = Date.now() - Number(ms);
    if (d < 60000) return "vừa xong";
    if (d < 3600000) return Math.floor(d / 60000) + " phút trước";
    if (d < 86400000) return Math.floor(d / 3600000) + " giờ trước";
    if (d < 2592000000) return Math.floor(d / 86400000) + " ngày trước";
    return new Date(Number(ms)).toLocaleDateString("vi-VN");
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function confirmBox(opts) {
    return new Promise((resolve) => {
      const wrap = el("div", { class: "modal-wrap" });
      wrap.innerHTML =
        '<div class="modal-back"></div>' +
        '<div class="modal-box" role="dialog" aria-modal="true">' +
        "<h3>" + esc(opts.title || "Xác nhận") + "</h3>" +
        "<p>" + esc(opts.body || "") + "</p>" +
        '<div class="modal-acts">' +
        '<button class="btn btn-ghost" data-no>' + esc(opts.cancel || "Huỷ") + "</button>" +
        '<button class="btn ' + (opts.danger ? "btn-no" : "btn-primary") + '" data-yes>' +
        esc(opts.ok || "Đồng ý") + "</button>" +
        "</div></div>";
      document.body.appendChild(wrap);
      const done = (v) => { wrap.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
      const onKey = (e) => { if (e.key === "Escape") done(false); };
      wrap.querySelector("[data-yes]").onclick = () => done(true);
      wrap.querySelector("[data-no]").onclick = () => done(false);
      wrap.querySelector(".modal-back").onclick = () => done(false);
      document.addEventListener("keydown", onKey);
      setTimeout(() => wrap.querySelector("[data-yes]").focus(), 30);
    });
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol === "file:") return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((e) => {
        console.warn("Service worker chưa đăng ký được:", e);
      });
    });
  }

  window.UI = { $, $$, esc, el, toast, timeAgo, shuffle, confirmBox, registerSW };
})();

/* ═══════════════════════ 3. KHO DỮ LIỆU TRONG MÁY ═══════════════════════ */
(function () {
  "use strict";

  const K = {
    users: "swmn.hs.users",
    cur: "swmn.hs.current",
    prog: (uid) => "swmn.hs.prog." + uid,
    srs: (uid) => "swmn.hs.srs." + uid,
    set: (uid) => "swmn.hs.set." + uid
  };

  const read = (k, fb) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; }
    catch (e) { return fb; }
  };
  const write = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { UI.toast("Máy đã hết chỗ lưu, dữ liệu mới có thể không được ghi.", "err", 4000); return false; }
  };

  const DATA = window.SWMN_DATA || {};
  const CSS = window.SWMN_CSS || {};
  const COURSES = window.SWMN_CONFIG.courses;

  /* ── Danh mục bài học (dựng 1 lần khi mở app) ─────────────────── */
  let metaCache = null;
  function allLessons() {
    const out = [];
    COURSES.forEach((c) => (DATA[c.id] || []).forEach((l) => out.push(l)));
    return out;
  }
  function listLessons() {
    if (metaCache) return metaCache;
    metaCache = allLessons()
      .map((l) => ({
        id: l.id, courseId: l.courseId, order: l.order,
        title: l.title, titleZh: l.titleZh,
        vocabCount: (l.vocab || []).length,
        grammarCount: (l.grammar || []).length,
        hanziCount: (l.hanzi || []).length
      }))
      .sort((a, b) => (a.courseId + "").localeCompare(b.courseId) || a.order - b.order);
    return metaCache;
  }
  function getLesson(id) {
    const l = allLessons().find((x) => x.id === id);
    if (!l) return null;
    /* CSS của các tab "Mục tiêu / Lỗi sai / Tổng hợp" dùng chung một kho
       để không phải lặp lại 30 lần trong file dữ liệu. */
    return l.cssId ? Object.assign({}, l, { extraCss: CSS[l.cssId] || "" }) : l;
  }

  /* ── Bảng tra từ vựng toàn khoá ───────────────────────────────── */
  let vocabIndex = null;
  const noTone = (s) =>
    String(s || "")
      .replace(/[ǖǘǚǜü]/g, "u")   /* ü và các biến thể có dấu */
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/đ/g, "d");

  function vocabAll() {
    if (vocabIndex) return vocabIndex;
    const map = {};
    allLessons().forEach((l) => {
      (l.vocab || []).forEach((v) => {
        if (!v.hanzi || !v.meaning) return;
        const k = v.hanzi;
        if (!map[k]) {
          map[k] = {
            key: k, hanzi: v.hanzi, pinyin: v.pinyin || "", hanviet: v.hanviet || "",
            pos: v.pos || "", meaning: v.meaning, example: v.example || {},
            lessons: []
          };
        }
        map[k].lessons.push({ id: l.id, order: l.order, courseId: l.courseId });
      });
    });
    vocabIndex = Object.keys(map).map((k) => {
      const w = map[k];
      w.q = noTone(w.pinyin) + " " + noTone(w.meaning) + " " + noTone(w.hanviet);
      w.qz = w.q.replace(/\s+/g, "");   /* để gõ "ni men" cũng ra 你们 */
      return w;
    });
    return vocabIndex;
  }

  /* ── Hồ sơ học sinh ───────────────────────────────────────────── */
  const users = () => read(K.users, []);
  const saveUsers = (u) => write(K.users, u);

  function createUser(name) {
    const nm = String(name || "").trim().replace(/\s+/g, " ");
    if (nm.length < 2) throw new Error("Tên cần ít nhất 2 ký tự.");
    if (nm.length > 40) throw new Error("Tên hơi dài, bạn rút ngắn lại nhé.");
    const list = users();
    const dup = list.find((u) => u.name.toLowerCase() === nm.toLowerCase());
    if (dup) return dup;
    const u = { uid: "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: nm, createdAt: Date.now() };
    list.push(u);
    saveUsers(list);
    return u;
  }
  function renameUser(uid, name) {
    const nm = String(name || "").trim().replace(/\s+/g, " ");
    if (nm.length < 2) throw new Error("Tên cần ít nhất 2 ký tự.");
    const list = users();
    const u = list.find((x) => x.uid === uid);
    if (!u) throw new Error("Không tìm thấy hồ sơ.");
    u.name = nm;
    saveUsers(list);
    return u;
  }
  function removeUser(uid) {
    saveUsers(users().filter((u) => u.uid !== uid));
    localStorage.removeItem(K.prog(uid));
    localStorage.removeItem(K.srs(uid));
    localStorage.removeItem(K.set(uid));
    if (read(K.cur, "") === uid) localStorage.removeItem(K.cur);
  }
  const currentUid = () => read(K.cur, "");
  const setCurrent = (uid) => write(K.cur, uid);
  const getUser = (uid) => users().find((u) => u.uid === uid) || null;

  /* ── Cài đặt của từng học sinh ────────────────────────────────── */
  const defaultSettings = () => ({ goalMin: 15, newPerDay: 12 });
  const getSettings = (uid) => Object.assign(defaultSettings(), read(K.set(uid), {}));
  const setSettings = (uid, s) => {
    const merged = Object.assign(getSettings(uid), s || {});
    write(K.set(uid), merged);
    return merged;
  };

  /* ── Số liệu học tập ──────────────────────────────────────────── */
  const getProgress = (uid) => read(K.prog(uid), null);
  const saveProgress = (uid, data) => write(K.prog(uid), data);
  const getSrs = (uid) => read(K.srs(uid), null);
  const saveSrs = (uid, data) => write(K.srs(uid), data);

  window.Store = {
    listLessons, getLesson, vocabAll, noTone,
    users, createUser, renameUser, removeUser, currentUid, setCurrent, getUser,
    getSettings, setSettings,
    getProgress, saveProgress, getSrs, saveSrs,
    keys: K,
    friendlyError: (e) => (e && e.message) || "Có lỗi xảy ra, bạn thử lại nhé."
  };
})();

/* ═══════════════════════ 4. THEO DÕI GIỜ HỌC & ĐIỂM ═══════════════════════
   Đồng hồ chỉ chạy khi app đang mở và đang hiện trên màn hình.
   Ngồi không đụng gì quá 2 phút thì tự dừng, chạm lại là chạy tiếp.       */
(function () {
  "use strict";

  const TICK_MS = 5000, IDLE_MS = 120000, SAVE_MS = 15000;
  const MAX_GAMES = 60, MAX_DAYS = 400;

  const todayKey = (d) => new Date(d || Date.now()).toLocaleDateString("sv-SE");

  function emptyProgress() {
    return { totalMs: 0, days: {}, lessons: {}, games: [], xp: 0, streak: 0, lastDay: "", firstAt: 0, lastAt: 0 };
  }

  let profile = null, data = emptyProgress(), loaded = false;
  let lesson = null, lastActive = Date.now(), dirty = false;
  let tickTimer = null, saveTimer = null;
  const listeners = [];

  ["pointerdown", "keydown", "wheel", "touchstart", "scroll", "mousemove"].forEach((ev) =>
    window.addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true })
  );

  const isActive = () => document.visibilityState === "visible" && Date.now() - lastActive < IDLE_MS;

  function tick() {
    if (!loaded || !isActive()) return;
    const day = todayKey();
    data.totalMs += TICK_MS;
    data.days[day] = (data.days[day] || 0) + TICK_MS;
    data.lastAt = Date.now();
    if (!data.firstAt) data.firstAt = Date.now();
    if (lesson && lesson.id) {
      const rec = data.lessons[lesson.id] || (data.lessons[lesson.id] = { ms: 0 });
      rec.ms += TICK_MS;
      rec.title = lesson.title || rec.title || "";
      rec.courseId = lesson.courseId || rec.courseId || "";
      rec.last = Date.now();
    }
    bumpStreak();
    dirty = true;
    notify();
  }

  function bumpStreak() {
    const today = todayKey();
    if (data.lastDay === today) return false;
    const yest = todayKey(Date.now() - 86400000);
    data.streak = data.lastDay === yest ? (data.streak || 0) + 1 : 1;
    data.lastDay = today;
    return true;
  }

  function save(force) {
    if (!loaded || !profile) return;
    if (!force && !dirty) return;
    trim();
    Store.saveProgress(profile.uid, data);
    dirty = false;
  }

  function trim() {
    const keys = Object.keys(data.days).sort();
    if (keys.length > MAX_DAYS) keys.slice(0, keys.length - MAX_DAYS).forEach((k) => delete data.days[k]);
    if (data.games.length > MAX_GAMES) data.games = data.games.slice(-MAX_GAMES);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") save(false);
    else lastActive = Date.now();
  });
  window.addEventListener("pagehide", () => save(false));

  function notify() { listeners.forEach((cb) => { try { cb(data); } catch (e) { console.error(e); } }); }

  const Track = {
    start(prof) {
      if (!prof || !prof.uid) return;
      Track.stop();
      profile = prof;
      data = Object.assign(emptyProgress(), Store.getProgress(prof.uid) || {});
      loaded = true;
      lastActive = Date.now();
      if (bumpStreak()) dirty = true;   /* mở app hôm nay là đã tính 1 ngày */
      if (!data.firstAt) { data.firstAt = Date.now(); dirty = true; }
      save(false);
      notify();
      tickTimer = setInterval(tick, TICK_MS);
      saveTimer = setInterval(() => save(false), SAVE_MS);
    },
    stop() {
      save(false);
      clearInterval(tickTimer); clearInterval(saveTimer);
      tickTimer = saveTimer = null;
      profile = null; loaded = false; data = emptyProgress(); lesson = null; dirty = false;
    },
    setLesson(l) {
      save(false);
      lesson = l ? { id: l.id, title: l.titleZh || l.title || "", courseId: l.courseId || "" } : null;
      if (l && l.id) {
        const rec = data.lessons[l.id] || (data.lessons[l.id] = { ms: 0 });
        rec.opened = (rec.opened || 0) + 1;
        rec.last = Date.now();
        rec.title = l.titleZh || l.title || "";
        rec.courseId = l.courseId || "";
        dirty = true;
      }
    },
    clearLesson() { Track.setLesson(null); },
    game(kind, info) {
      if (!loaded) return;
      const rec = {
        t: Date.now(), kind: kind,
        lessonId: (lesson && lesson.id) || (info && info.lessonId) || "",
        title: (info && info.label) || (lesson && lesson.title) || "",
        right: Number(info && info.right) || 0,
        total: Number(info && info.total) || 0,
        wrong: Number(info && info.wrong) || 0,
        secs: Number(info && info.secs) || 0,
        xp: Number(info && info.xp) || 0
      };
      data.games.push(rec);
      data.xp = (data.xp || 0) + rec.xp;
      data.lastAt = rec.t;
      bumpStreak();
      dirty = true;
      notify();
      save(true);
    },
    addXp(n) {
      if (!loaded) return;
      data.xp = (data.xp || 0) + (Number(n) || 0);
      dirty = true;
      notify();
    },
    get: () => data,
    set(newData) { data = Object.assign(emptyProgress(), newData || {}); dirty = true; save(true); notify(); },
    ready: () => loaded,
    onChange(cb) {
      listeners.push(cb);
      if (loaded) cb(data);
      return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
    },
    flush: () => save(true),
    fmtDur(ms) {
      const n = Number(ms) || 0;
      if (n <= 0) return "0 phút";
      const m = Math.round(n / 60000);
      if (m < 1) return "dưới 1 phút";
      if (m < 60) return m + " phút";
      const h = Math.floor(m / 60), r = m % 60;
      return h + " giờ" + (r ? " " + r + " phút" : "");
    },
    fmtDurShort(ms) {
      const m = Math.round((Number(ms) || 0) / 60000);
      if (m < 60) return m + "′";
      return Math.floor(m / 60) + "h" + String(m % 60).padStart(2, "0");
    },
    dayKey: todayKey,
    lastDays(prog, n) {
      const out = [];
      for (let i = n - 1; i >= 0; i--) {
        const t = Date.now() - i * 86400000;
        const k = todayKey(t), d = new Date(t);
        out.push({
          day: k,
          label: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][d.getDay()],
          date: d.getDate() + "/" + (d.getMonth() + 1),
          ms: ((prog && prog.days) || {})[k] || 0
        });
      }
      return out;
    },
    kindLabel: (k) => (k === "match" ? "Ghép cặp" : k === "quiz" ? "Trắc nghiệm nghĩa" : k === "srs" ? "Ôn tập" : k)
  };

  window.Track = Track;
})();

/* ═══════════════════════ 5. ÔN TẬP NGẮT QUÃNG (SRS) ═══════════════════════

   Nguyên tắc: từ nào sắp quên thì hiện lại. Mỗi từ có một "bậc" từ 0 đến 7,
   trả lời "Nhớ rõ" thì lên bậc và lâu sau mới gặp lại, "Quên" thì về bậc 0.

     bậc:      0    1    2    3    4    5    6    7
     gặp lại:  hôm nay  1    2    4    8   16   32   64  (ngày)

   Từ vựng của một bài được đưa vào kho ôn tập ngay khi học sinh mở bài đó.
   ========================================================================= */
(function () {
  "use strict";

  const STEPS = [0, 1, 2, 4, 8, 16, 32, 64];
  const DAY = 86400000;
  const dayNum = (t) => Math.floor((new Date(t || Date.now()).setHours(0, 0, 0, 0)) / DAY);

  let uid = null;
  let db = { cards: {}, new: {}, log: {} };

  function load(u) {
    uid = u;
    db = Object.assign({ cards: {}, new: {}, log: {} }, Store.getSrs(u) || {});
    db.cards = db.cards || {};
    db.new = db.new || {};
  }
  const save = () => { if (uid) Store.saveSrs(uid, db); };

  /* Đưa toàn bộ từ của một bài vào kho ôn tập */
  function enroll(lesson) {
    if (!lesson) return 0;
    let n = 0;
    (lesson.vocab || []).forEach((v) => {
      if (!v.hanzi || !v.meaning) return;
      if (!db.cards[v.hanzi]) {
        db.cards[v.hanzi] = { b: 0, d: dayNum(), seen: 0, lid: lesson.id };
        n++;
      }
    });
    if (n) save();
    return n;
  }

  const todayStr = () => new Date().toLocaleDateString("sv-SE");

  function newToday() { return db.new[todayStr()] || 0; }

  /* Hàng chờ hôm nay: các từ đã tới hạn + tối đa N từ mới */
  function queue(limitNew) {
    const today = dayNum();
    const words = Store.vocabAll();
    const byKey = {};
    words.forEach((w) => (byKey[w.key] = w));

    const due = [], fresh = [];
    Object.keys(db.cards).forEach((k) => {
      const c = db.cards[k], w = byKey[k];
      if (!w) return;
      if (c.seen) { if (c.d <= today) due.push({ w, c }); }
      else fresh.push({ w, c });
    });
    due.sort((a, b) => a.c.d - b.c.d || a.c.b - b.c.b);
    const room = Math.max(0, (limitNew == null ? 12 : limitNew) - newToday());
    return { due, fresh: fresh.slice(0, room), freshTotal: fresh.length };
  }

  /* grade: 0 = quên · 1 = mơ hồ · 2 = nhớ rõ */
  function answer(key, grade) {
    const c = db.cards[key] || (db.cards[key] = { b: 0, d: dayNum(), seen: 0 });
    const wasNew = !c.seen;
    if (grade === 2) c.b = Math.min(STEPS.length - 1, (c.b || 0) + 1);
    else if (grade === 1) c.b = Math.max(0, (c.b || 0));
    else c.b = 0;
    c.seen = (c.seen || 0) + 1;
    c.last = Date.now();
    c.d = dayNum() + (grade === 0 ? 0 : grade === 1 ? 1 : STEPS[c.b]);
    if (grade === 2 && c.b === 0) c.d = dayNum() + 1;
    if (wasNew) {
      const t = todayStr();
      db.new[t] = (db.new[t] || 0) + 1;
    }
    const t2 = todayStr();
    db.log[t2] = (db.log[t2] || 0) + 1;
    save();
    return c;
  }

  function stats() {
    const today = dayNum();
    let learned = 0, mastered = 0, dueNow = 0, total = 0;
    Object.keys(db.cards).forEach((k) => {
      const c = db.cards[k];
      total++;
      if (c.seen) learned++;
      if ((c.b || 0) >= 5) mastered++;
      if (c.seen && c.d <= today) dueNow++;
    });
    return { total, learned, mastered, dueNow, newLeft: total - learned, doneToday: db.log[todayStr()] || 0 };
  }

  window.SRS = {
    load, save, enroll, queue, answer, stats,
    all: () => db,
    set(newDb) { db = Object.assign({ cards: {}, new: {}, log: {} }, newDb || {}); save(); },
    card: (k) => db.cards[k] || null
  };
})();
