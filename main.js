/* =====================================================================
   main.js — Màn hình và điều hướng của app học sinh
   ===================================================================== */
(function () {
  "use strict";

  const { $, esc, el, toast, confirmBox, registerSW, shuffle } = UI;
  const COURSES = window.SWMN_CONFIG.courses;

  let me = null;                       // hồ sơ học sinh đang dùng
  let settings = { goalMin: 15, newPerDay: 12 };
  let lessonsMeta = [];
  let activeCourse = localStorage.getItem("swmn.hs.course") || COURSES[0].id;

  /* ══════════════ Điều khiển màn hình ══════════════ */
  function showScreen(id) {
    ["screenName", "screenApp"].forEach((s) =>
      document.getElementById(s).classList.toggle("on", s === id));
    window.scrollTo(0, 0);
  }

  const VIEWS = ["viewBuddy", "viewHome", "viewHistory"];
  let currentView = "viewHome";

  function go(view) {
    if (window.LessonView) LessonView.close();
    if (currentView === "viewBuddy" && view !== "viewBuddy") {
      const b = document.getElementById("buddyBody");
      if (b) b.dispatchEvent(new CustomEvent("swmn:unmount"));
    }
    currentView = view;
    VIEWS.forEach((v) => { document.getElementById(v).hidden = v !== view; });
    document.querySelectorAll("#navbar button").forEach((b) =>
      b.classList.toggle("on", b.dataset.v === view));
    window.scrollTo(0, 0);
    paintNavDot();
    if (view === "viewHome") renderHome();
    if (view === "viewHistory") renderHistory();
    if (view === "viewBuddy") renderBuddy();
  }
  window.AppGo = go;

  /* ══════════════ Màn hình nhập tên ══════════════ */
  function renderNameScreen() {
    const list = Store.users();
    const box = $("#nameProfiles");
    if (!list.length) { box.innerHTML = ""; box.hidden = true; }
    else {
      box.hidden = false;
      box.innerHTML = '<p class="np-lb">Đã học trên máy này</p>' +
        '<div class="np-list">' +
        list.map((u) =>
          '<button class="np-item" data-uid="' + esc(u.uid) + '">' +
          '<span class="np-ava">' + esc(initial(u.name)) + "</span>" +
          '<span class="np-nm">' + esc(u.name) + "</span>" +
          '<span class="np-go">Vào học →</span></button>').join("") +
        "</div>";
      box.querySelectorAll(".np-item").forEach((b) => {
        b.onclick = () => signIn(b.dataset.uid);
      });
    }
  }

  /* Chấm đỏ trên nút "Lịch sử học tập" — số từ tới hạn hôm nay */
  function paintNavDot() {
    const btn = document.querySelector('#navbar button[data-v="viewHistory"]');
    if (!btn || !me) return;
    const n = SRS.stats().dueNow;
    let dot = btn.querySelector(".nv-dot");
    if (!n) { if (dot) dot.remove(); return; }
    if (!dot) { dot = el("span", { class: "nv-dot" }); btn.appendChild(dot); }
    dot.textContent = n > 99 ? "99+" : n;
  }

  const initial = (nm) => ((String(nm).trim().split(/\s+/).pop() || "?")[0] || "?").toUpperCase();

  $("#formName").addEventListener("submit", (e) => {
    e.preventDefault();
    const msg = $("#nameMsg");
    msg.textContent = "";
    try {
      const u = Store.createUser($("#nameInput").value);
      $("#nameInput").value = "";
      signIn(u.uid);
    } catch (err) {
      msg.textContent = err.message;
    }
  });

  function signIn(uid) {
    const u = Store.getUser(uid);
    if (!u) return;
    me = u;
    window.CurrentUser = u;      /* lesson-view.js cần biết ai đang học */
    Store.setCurrent(uid);
    settings = Store.getSettings(uid);
    SRS.load(uid);
    Track.start(u);
    $("#userNm").textContent = u.name;
    $("#userAva").textContent = initial(u.name);
    $("#menuName").textContent = u.name;
    showScreen("screenApp");
    go("viewHome");
  }

  function signOut() {
    Track.flush();
    Track.stop();
    me = null;
    window.CurrentUser = null;
    localStorage.removeItem(Store.keys.cur);
    renderNameScreen();
    showScreen("screenName");
  }

  /* ══════════════ Trang chủ ══════════════ */
  function goalRing(pct, center, sub) {
    const r = 34, c = 2 * Math.PI * r;
    const off = c * (1 - Math.min(1, pct));
    return '<div class="ring-wrap"><svg viewBox="0 0 80 80" class="ring">' +
      '<circle cx="40" cy="40" r="' + r + '" class="ring-bg"></circle>' +
      '<circle cx="40" cy="40" r="' + r + '" class="ring-fg" stroke-dasharray="' + c.toFixed(1) +
      '" stroke-dashoffset="' + off.toFixed(1) + '"></circle></svg>' +
      '<div class="ring-txt"><b>' + center + "</b><i>" + sub + "</i></div></div>";
  }

  function renderHome() {
    const g = Track.get();
    const today = (g.days || {})[Track.dayKey()] || 0;
    const mins = Math.round(today / 60000);
    const goal = settings.goalMin || 15;
    const pct = goal ? mins / goal : 0;
    const st = SRS.stats();
    const done = mins >= goal;

    $("#homeHello").innerHTML = "Chào <b>" + esc(me.name) + "</b>!";
    $("#homeGoal").innerHTML =
      '<div class="goal-card">' +
      goalRing(pct, mins + "′", "/ " + goal + "′") +
      '<div class="goal-info">' +
      "<h3>" + (done ? "Xong mục tiêu hôm nay! 🎉" : "Mục tiêu hôm nay") + "</h3>" +
      "<p>" + (done
        ? "Bạn đã học " + Track.fmtDur(today) + " hôm nay. Học thêm cũng được nhé."
        : "Học đủ <b>" + goal + " phút</b> mỗi ngày để giữ chuỗi. Còn " +
          Math.max(0, goal - mins) + " phút nữa.") + "</p>" +
      '<div class="goal-chips">' +
      '<span class="gchip fire">🔥 ' + (g.streak || 0) + " ngày liên tiếp</span>" +
      '<span class="gchip">⭐ ' + (g.xp || 0) + " XP</span>" +
      '<span class="gchip">📘 ' + st.learned + " / " + st.total + " từ đã học</span>" +
      "</div></div></div>" +
      (st.dueNow || st.newLeft
        ? '<button class="due-bar" id="dueBar"><span class="db-ic">🧠</span>' +
          '<span class="db-t"><b>' + (st.dueNow ? st.dueNow + " từ cần ôn hôm nay" : "Sẵn sàng học từ mới") + "</b>" +
          "<i>" + (st.dueNow ? "Ôn ngay để không quên" : st.newLeft + " từ mới đang chờ trong kho ôn tập") + "</i></span>" +
          '<span class="db-go">Ôn tập →</span></button>'
        : "");
    const db = $("#dueBar");
    if (db) db.onclick = () => { histTab = "review"; go("viewHistory"); };

    renderCourses();
    renderLessons();
  }

  function renderCourses() {
    const strip = $("#courseStrip");
    strip.innerHTML = "";
    COURSES.forEach((c) => {
      const n = lessonsMeta.filter((l) => l.courseId === c.id).length;
      const b = el("button", { class: "course-pill" + (c.id === activeCourse ? " on" : "") },
        esc(c.name) + ' <span class="ed">' + esc(c.edition) + "</span>" +
        (n ? ' <span class="ed">' + n + " bài</span>" : ""));
      b.onclick = () => {
        activeCourse = c.id;
        localStorage.setItem("swmn.hs.course", c.id);
        renderCourses(); renderLessons();
      };
      strip.appendChild(b);
    });
  }

  function renderLessons() {
    const grid = $("#lessonGrid");
    const g = Track.get();
    const list = lessonsMeta.filter((l) => l.courseId === activeCourse);
    grid.innerHTML = "";
    list.forEach((l) => {
      const rec = (g.lessons || {})[l.id] || {};
      const opened = !!rec.opened || rec.ms > 0;
      const card = el("button", { class: "lesson-card" + (opened ? " seen" : "") },
        '<div class="lc-top">' +
        '<span class="lc-num">' + esc(l.order || "?") + "</span>" +
        '<span class="lc-tt"><span class="lc-zh zh">' + esc(l.titleZh || l.title || "") + "</span>" +
        '<span class="lc-vi">' + esc(l.title || "") + "</span></span>" +
        (opened ? '<span class="lc-tick">✓</span>' : "") + "</div>" +
        '<div class="lc-meta">' +
        '<span class="chip">' + (l.vocabCount || 0) + " từ vựng</span>" +
        '<span class="chip">' + (l.grammarCount || 0) + " ngữ pháp</span>" +
        (rec.ms ? '<span class="chip gold">' + Track.fmtDur(rec.ms) + "</span>" : "") +
        "</div>");
      card.onclick = () => openLesson(l.id);
      grid.appendChild(card);
    });
  }

  function openLesson(id) {
    VIEWS.forEach((v) => { document.getElementById(v).hidden = true; });
    LessonView.open(id).then(() => {
      const L = LessonView.current();
      if (L) {
        const n = SRS.enroll(L);
        if (n) toast("Đã thêm " + n + " từ của bài này vào kho ôn tập.", "ok", 2600);
      }
    });
  }

  /* Quay lại từ trang bài học */
  window.addEventListener("swmn:lesson-closed", () => {
    document.getElementById(currentView).hidden = false;
    if (currentView === "viewHome") renderHome();
  });

  /* ══════════════ Lịch sử học tập (Ôn tập + Thành tích) ══════════════ */
  let histTab = "review";

  function renderHistory() {
    document.querySelectorAll("#histSeg button").forEach((b) =>
      b.classList.toggle("on", b.dataset.h === histTab));
    $("#reviewBody").hidden = histTab !== "review";
    $("#statsBody").hidden = histTab !== "stats";
    if (histTab === "review") renderReview();
    else renderStats();
  }

  document.querySelectorAll("#histSeg button").forEach((b) => {
    b.onclick = () => {
      histTab = b.dataset.h;
      if (histTab !== "review") session = null;
      renderHistory();
      window.scrollTo(0, 0);
    };
  });

  /* ══════════════ Ôn tập ngắt quãng ══════════════ */
  let session = null;

  function renderReview() {
    const st = SRS.stats();
    const box = $("#reviewBody");
    paintNavDot();
    if (session) return;
    if (!st.total) {
      box.innerHTML =
        '<div class="empty"><div class="empty-icon zh">复</div><h3>Kho ôn tập còn trống</h3>' +
        "<p>Bạn mở một bài học bất kỳ, toàn bộ từ vựng của bài đó sẽ tự vào đây.</p>" +
        '<button class="btn btn-primary" style="margin-top:14px" id="rvGoHome">Chọn bài học</button></div>';
      $("#rvGoHome").onclick = () => go("viewHome");
      return;
    }
    const q = SRS.queue(settings.newPerDay);
    const n = q.due.length + q.fresh.length;
    box.innerHTML =
      '<div class="rv-tiles">' +
      '<div class="rv-tile"><p class="l">Cần ôn hôm nay</p><p class="v">' + q.due.length + "</p></div>" +
      '<div class="rv-tile"><p class="l">Từ mới hôm nay</p><p class="v">' + q.fresh.length + "</p></div>" +
      '<div class="rv-tile"><p class="l">Đã thuộc</p><p class="v">' + st.mastered + "</p></div>" +
      '<div class="rv-tile"><p class="l">Tổng trong kho</p><p class="v">' + st.total + "</p></div>" +
      "</div>" +
      (n
        ? '<div class="rv-start"><div class="rv-start-ic zh">复</div>' +
          "<h3>" + n + " từ cho lượt ôn này</h3>" +
          "<p>Nhìn chữ Hán, tự nhớ nghĩa trong đầu rồi bấm lật thẻ để đối chiếu. " +
          "App sẽ tự hẹn ngày gặp lại từng từ.</p>" +
          '<button class="btn btn-primary" id="rvStart">Bắt đầu ôn</button></div>'
        : '<div class="rv-start done"><div class="rv-start-ic">✅</div>' +
          "<h3>Hôm nay ôn xong rồi!</h3>" +
          "<p>Bạn đã ôn " + st.doneToday + " lượt hôm nay. Ngày mai quay lại nhé — " +
          "hoặc mở thêm bài mới để nạp thêm từ vào kho.</p>" +
          '<button class="btn btn-ghost" id="rvExtra">Ôn thêm 10 từ bất kỳ</button></div>') +
      '<div class="rv-note">Kho ôn tập gộp từ của <b>tất cả các bài bạn đã mở</b>, ' +
      "không chỉ bài đang học — nhờ vậy từ cũ không bị rơi rụng.</div>";
    if ($("#rvStart")) $("#rvStart").onclick = () => startSession(q.due.concat(q.fresh));
    if ($("#rvExtra")) $("#rvExtra").onclick = () => {
      const all = Object.keys(SRS.all().cards);
      const byKey = {};
      Store.vocabAll().forEach((w) => (byKey[w.key] = w));
      const pick = shuffle(all).slice(0, 10).map((k) => ({ w: byKey[k], c: SRS.card(k) })).filter((x) => x.w);
      if (!pick.length) return;
      startSession(pick, true);
    };
  }

  function startSession(items, extra) {
    session = { list: shuffle(items), i: 0, right: 0, wrong: 0, extra: !!extra, startAt: Date.now() };
    drawCard();
  }

  function drawCard() {
    const box = $("#reviewBody");
    const s = session;
    if (s.i >= s.list.length) return finishSession();
    const it = s.list[s.i], w = it.w;
    const ex = w.example || {};
    const lesson = (w.lessons || [])[0] || {};
    const cs = COURSES.find((c) => c.id === lesson.courseId) || {};
    box.innerHTML =
      '<div class="rv-run">' +
      '<div class="rv-bar"><i style="width:' + ((s.i / s.list.length) * 100).toFixed(1) + '%"></i></div>' +
      '<div class="rv-top"><span>' + (s.i + 1) + " / " + s.list.length + "</span>" +
      '<span class="rv-src">' + esc(cs.name || "") + (lesson.order ? " · Bài " + lesson.order : "") + "</span>" +
      '<button class="rv-quit" id="rvQuit">Dừng</button></div>' +
      '<div class="rv-card" id="rvCard"><div class="rv-face">' +
      '<div class="rv-hz zh">' + esc(w.hanzi) + "</div>" +
      '<div class="rv-hint" id="rvHint">Bấm để xem nghĩa</div>' +
      '<div class="rv-back" id="rvBack" hidden>' +
      '<div class="py">' + esc(w.pinyin) + "</div>" +
      (w.hanviet ? '<div class="hv">' + esc(w.hanviet) + "</div>" : "") +
      '<div class="mean">' + esc(w.meaning) + "</div>" +
      (ex.zh ? '<div class="ex zh">' + esc(ex.zh) + "</div>" : "") +
      (ex.vi ? '<div class="exvi">' + esc(ex.vi) + "</div>" : "") +
      "</div></div></div>" +
      '<div class="rv-acts" id="rvActs" hidden>' +
      '<button class="rv-b no" data-g="0"><b>Quên rồi</b><i>gặp lại ngay</i></button>' +
      '<button class="rv-b mid" data-g="1"><b>Mơ hồ</b><i>mai gặp lại</i></button>' +
      '<button class="rv-b ok" data-g="2"><b>Nhớ rõ</b><i>' + nextLabel(it.c) + "</i></button>" +
      "</div></div>";

    let flipped = false;
    const flip = () => {
      if (flipped) return;
      flipped = true;
      $("#rvBack").hidden = false;
      $("#rvHint").hidden = true;
      $("#rvActs").hidden = false;
    };
    $("#rvCard").onclick = flip;
    $("#rvQuit").onclick = () => finishSession(true);
    box.querySelectorAll(".rv-b").forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const grade = +b.dataset.g;
        SRS.answer(w.key, grade);
        if (grade === 2) { s.right++; Track.addXp(5); }
        else if (grade === 0) { s.wrong++; s.list.push(it); }
        s.i++;
        drawCard();
      };
    });
  }

  function nextLabel(c) {
    const STEPS = [1, 1, 2, 4, 8, 16, 32, 64];
    const b = Math.min(7, ((c && c.b) || 0) + 1);
    const d = STEPS[b];
    return d === 1 ? "mai gặp lại" : d + " ngày nữa";
  }

  function finishSession(quit) {
    const s = session;
    session = null;
    const total = s.right + s.wrong;
    if (total) {
      Track.game("srs", { right: s.right, total: total, wrong: s.wrong, xp: 10, label: "Ôn tập ngắt quãng" });
    }
    if (!quit && total) {
      const box = $("#reviewBody");
      box.innerHTML =
        '<div class="rv-start done"><div class="rv-start-ic">🎉</div>' +
        "<h3>Xong lượt ôn!</h3>" +
        "<p>Nhớ rõ <b>" + s.right + "</b> từ · cần ôn lại <b>" + s.wrong + "</b> từ · " +
        Math.round((Date.now() - s.startAt) / 60000) + " phút.</p>" +
        '<button class="btn btn-primary" id="rvAgain">Về trang ôn tập</button></div>';
      $("#rvAgain").onclick = renderReview;
      return;
    }
    renderReview();
  }

  /* ══════════════ Tra từ vựng — nằm ngay trong TAB Học ══════════════ */
  (function initSearch() {
    const inp = $("#searchInput");
    let timer = null;
    inp.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => doSearch(inp.value), 120);
    });
    $("#searchClear").onclick = () => { inp.value = ""; doSearch(""); inp.focus(); };
  })();

  function doSearch(q) {
    const box = $("#searchBody");
    const all = Store.vocabAll();
    const term = String(q || "").trim();
    /* Không gõ gì thì trả trang về danh sách bài học */
    $("#searchClear").hidden = !term;
    $("#homeLessons").hidden = !!term;
    box.hidden = !term;
    if (!term) { box.innerHTML = ""; return; }
    const nq = Store.noTone(term);
    const nqz = nq.replace(/\s+/g, "");
    const isZh = /[㐀-鿿]/.test(term);
    const match = (w, s) => {
      const sz = s.replace(/\s+/g, "");
      return w.hanzi.indexOf(s) >= 0 || w.q.indexOf(s) >= 0 || (sz && w.qz.indexOf(sz) >= 0);
    };
    let hit = all.filter((w) => (isZh ? w.hanzi.indexOf(term) >= 0 : match(w, nq)));
    hit.sort((a, b) => {
      const sa = (isZh ? a.hanzi : Store.noTone(a.pinyin)).indexOf(isZh ? term : nq);
      const sb = (isZh ? b.hanzi : Store.noTone(b.pinyin)).indexOf(isZh ? term : nq);
      return (sa < 0 ? 9 : sa) - (sb < 0 ? 9 : sb) || a.hanzi.length - b.hanzi.length;
    });
    /* Gõ nhiều âm tiết (vd "ni hao") thì ngoài từ khớp trọn, xếp thêm
       các từ khớp từng âm tiết một ở phía sau. */
    if (!isZh && /\s/.test(nq)) {
      const seen = {};
      hit.forEach((w) => (seen[w.key] = 1));
      nq.split(/\s+/).filter(Boolean).forEach((tk) => {
        all.forEach((w) => {
          if (!seen[w.key] && (Store.noTone(w.pinyin).split(/\s+/)[0] === tk || w.qz.indexOf(tk) === 0)) {
            seen[w.key] = 1;
            hit.push(w);
          }
        });
      });
    }
    if (!hit.length) {
      box.innerHTML = '<div class="empty"><div class="empty-icon zh">查</div>' +
        "<h3>Không tìm thấy từ nào</h3><p>Thử gõ ít ký tự hơn, hoặc gõ nghĩa tiếng Việt nhé.</p></div>";
      return;
    }
    box.innerHTML = '<div class="sr-info">Tìm thấy <b>' + hit.length + "</b> từ</div>" +
      '<div class="sr-list">' + hit.slice(0, 120).map((w) => {
        const cd = SRS.card(w.key);
        const ls = (w.lessons || []).map((x) => {
          const c = COURSES.find((y) => y.id === x.courseId) || {};
          return '<button class="sr-les" data-id="' + esc(x.id) + '">' +
            esc(c.name || "") + " · Bài " + esc(x.order) + "</button>";
        }).join("");
        const ex = w.example || {};
        return '<div class="sr-item">' +
          '<div class="sr-hz zh">' + esc(w.hanzi) + "</div>" +
          '<div class="sr-mid"><div class="sr-py">' + esc(w.pinyin) +
          (w.hanviet ? ' <span class="sr-hv">' + esc(w.hanviet) + "</span>" : "") +
          (w.pos ? ' <span class="sr-pos">' + esc(w.pos) + "</span>" : "") + "</div>" +
          '<div class="sr-mn">' + esc(w.meaning) + "</div>" +
          (ex.zh ? '<div class="sr-ex zh">' + esc(ex.zh) + '<i class="vi">' + esc(ex.vi || "") + "</i></div>" : "") +
          '<div class="sr-tags">' + ls +
          (cd && cd.seen ? '<span class="sr-srs">' + (cd.b >= 5 ? "đã thuộc" : "đang ôn · bậc " + cd.b) + "</span>" : "") +
          "</div></div></div>";
      }).join("") + "</div>" +
      (hit.length > 120 ? '<p class="hint" style="text-align:center">Chỉ hiện 120 từ đầu — gõ thêm để thu hẹp.</p>' : "");
    box.querySelectorAll(".sr-les").forEach((b) => { b.onclick = () => openLesson(b.dataset.id); });
  }

  /* ══════════════ Flashcard Buddy ══════════════
     Trắc nghiệm nghĩa cho bất kỳ bộ từ nào: chọn giáo trình → chọn một bài
     hoặc "Toàn bộ giáo trình". Lựa chọn được nhớ lại cho lần sau.          */
  let buddyCourse = localStorage.getItem("swmn.hs.bdCourse") || COURSES[0].id;
  let buddyPick = localStorage.getItem("swmn.hs.bdPick") || "__all__";
  let buddyInited = false;

  function buddyVocab(courseId, pick) {
    const metas = lessonsMeta.filter((m) => m.courseId === courseId);
    const ids = pick === "__all__" ? metas.map((m) => m.id) : [pick];
    const out = [];
    ids.forEach((id) => {
      const l = Store.getLesson(id);
      if (l) out.push(...(l.vocab || []));
    });
    return out;
  }

  function buddyLabel(courseId, pick) {
    const c = COURSES.find((x) => x.id === courseId) || {};
    if (pick === "__all__") return "toàn bộ " + (c.name || "");
    const m = lessonsMeta.find((x) => x.id === pick) || {};
    return (c.name || "") + " · bài " + (m.order || "") + " " + (m.titleZh || "");
  }

  function renderBuddy() {
    if (!COURSES.some((c) => c.id === buddyCourse)) buddyCourse = COURSES[0].id;

    /* Thanh chọn giáo trình */
    const seg = $("#buddyCourses");
    seg.innerHTML = COURSES.map((c) =>
      '<button data-c="' + esc(c.id) + '"' + (c.id === buddyCourse ? ' class="on"' : "") + ">" +
      "<b>" + esc(c.name) + "</b><small>bản " + esc(c.edition) + "</small></button>").join("");
    seg.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        buddyCourse = b.dataset.c;
        buddyPick = "__all__";
        localStorage.setItem("swmn.hs.bdCourse", buddyCourse);
        localStorage.setItem("swmn.hs.bdPick", buddyPick);
        renderBuddy();
      };
    });

    /* Danh sách bài để kéo chọn */
    const metas = lessonsMeta.filter((m) => m.courseId === buddyCourse);
    if (!metas.some((m) => m.id === buddyPick)) buddyPick = "__all__";
    const totalWords = metas.reduce((a, m) => a + (m.vocabCount || 0), 0);
    const sel = $("#buddyPick");
    sel.innerHTML =
      '<option value="__all__"' + (buddyPick === "__all__" ? " selected" : "") + ">" +
      "★ Toàn bộ giáo trình · " + metas.length + " bài · " + totalWords + " từ</option>" +
      metas.map((m) =>
        '<option value="' + esc(m.id) + '"' + (m.id === buddyPick ? " selected" : "") + ">" +
        "Bài " + esc(m.order) + " · " + esc(m.titleZh || m.title || "") +
        " · " + (m.vocabCount || 0) + " từ</option>").join("");

    if (!buddyInited) {
      buddyInited = true;
      sel.addEventListener("change", () => {
        buddyPick = sel.value;
        localStorage.setItem("swmn.hs.bdPick", buddyPick);
        mountBuddy();
      });
    }
    mountBuddy();
  }

  function mountBuddy() {
    const box = $("#buddyBody");
    box.dispatchEvent(new CustomEvent("swmn:unmount"));   /* huỷ hẹn giờ của lượt cũ */
    QuizGame.mount(box, {
      vocab: buddyVocab(buddyCourse, buddyPick),
      label: buddyLabel(buddyCourse, buddyPick),
      lessonId: buddyPick === "__all__" ? "" : buddyPick,
      titleZh: buddyPick === "__all__"
        ? ""
        : ((lessonsMeta.find((x) => x.id === buddyPick) || {}).titleZh || "")
    });
  }

  /* ══════════════ Thành tích ══════════════ */
  function renderStats() {
    const box = $("#statsBody");
    const g = Track.get();
    const days = Track.lastDays(g, 7);
    const week = days.reduce((a, b) => a + b.ms, 0);
    const today = days[days.length - 1].ms;
    const max = Math.max(1, ...days.map((d) => d.ms));
    const st = SRS.stats();

    const chart = days.map((d, i) => {
      const h = Math.round((d.ms / max) * 100);
      const isToday = i === days.length - 1;
      return '<div class="st-bar-col' + (isToday ? " is-today" : "") + '">' +
        '<div class="st-bar-space"><div class="st-bar' +
        (d.ms ? (isToday ? " today" : "") : " zero") + '" style="height:' + (d.ms ? Math.max(h, 4) : 3) + '%">' +
        (d.ms ? '<span class="st-bar-v">' + Track.fmtDurShort(d.ms) + "</span>" : "") +
        "</div></div>" +
        '<div class="st-bar-lb"><b>' + esc(d.label) + "</b>" + esc(d.date) + "</div></div>";
    }).join("");

    const les = Object.keys(g.lessons || {})
      .map((id) => Object.assign({ id }, g.lessons[id]))
      .filter((l) => l.ms > 0).sort((a, b) => b.ms - a.ms).slice(0, 8);
    const lesHtml = les.length
      ? '<div class="st-rows">' + les.map((l) => {
          const meta = lessonsMeta.find((m) => m.id === l.id) || {};
          return '<div class="st-row"><div class="nm"><span class="zh">' +
            esc(meta.titleZh || l.title || l.id) + "</span>" +
            (meta.title ? "<small>" + esc(meta.title) + "</small>" : "") +
            '</div><span class="vv">' + esc(Track.fmtDur(l.ms)) + "</span></div>";
        }).join("") + "</div>"
      : '<p class="hint">Bạn mở một bài học lên là ở đây bắt đầu có số liệu.</p>';

    const games = (g.games || []).slice(-10).reverse();
    const gHtml = games.length
      ? '<div class="st-rows">' + games.map((x) => {
          const ok = x.total ? Math.round((x.right / x.total) * 100) : 0;
          const det = x.kind === "match"
            ? x.total + " từ · " + x.secs + " giây · sai " + x.wrong + " lần"
            : "Đúng " + x.right + "/" + x.total + (x.wrong ? " · sai " + x.wrong : "") + (x.xp ? " · +" + x.xp + " XP" : "");
          return '<div class="st-row"><div class="nm">' + esc(Track.kindLabel(x.kind)) +
            "<small>" + esc(det) + " · " + esc(UI.timeAgo(x.t)) + "</small></div>" +
            '<span class="st-badge' + (ok >= 80 ? " g" : "") + '">' + ok + "%</span></div>";
        }).join("") + "</div>"
      : '<p class="hint">Chơi xong một lượt Trắc nghiệm nghĩa, Ghép cặp hoặc Ôn tập là hiện ở đây.</p>';

    box.innerHTML =
      '<div class="st-tiles">' +
      '<div class="st-tile"><p class="l">Tổng thời gian học</p><p class="v">' + esc(Track.fmtDur(g.totalMs)) + '</p><p class="s">từ khi bắt đầu</p></div>' +
      '<div class="st-tile"><p class="l">7 ngày qua</p><p class="v">' + esc(Track.fmtDur(week)) + '</p><p class="s">hôm nay ' + esc(Track.fmtDur(today)) + "</p></div>" +
      '<div class="st-tile gold"><p class="l">Chuỗi ngày học</p><p class="v">' + (g.streak || 0) + ' ngày</p><p class="s">học đều mỗi ngày để giữ chuỗi</p></div>' +
      '<div class="st-tile"><p class="l">Điểm kinh nghiệm</p><p class="v">' + (g.xp || 0) + " XP</p><p class=\"s\">" + ((g.games || []).length) + " lượt chơi</p></div>" +
      '<div class="st-tile"><p class="l">Từ đã học</p><p class="v">' + st.learned + " / " + st.total + '</p><p class="s">' + st.mastered + " từ đã thuộc</p></div>" +
      '<div class="st-tile"><p class="l">Bài đã mở</p><p class="v">' + les.length + " / " + lessonsMeta.length + '</p><p class="s">trong cả 2 giáo trình</p></div>' +
      "</div>" +
      '<div class="st-card"><h3>7 ngày gần nhất</h3><p class="sub">Số phút thật sự ngồi học — rời máy quá 2 phút là đồng hồ tự dừng.</p>' +
      '<div class="st-chart">' + chart + "</div></div>" +
      '<div class="st-card"><h3>Giờ học theo bài</h3><p class="sub">Bài nào bạn dành nhiều thời gian nhất.</p>' + lesHtml + "</div>" +
      '<div class="st-card"><h3>Lượt chơi gần nhất</h3><p class="sub">Kết quả các trò chơi và lượt ôn tập.</p>' + gHtml + "</div>" +

      '<div class="st-card"><h3>Cài đặt</h3><p class="sub">Chỉnh cho vừa sức mình.</p>' +
      '<div class="set-row"><label for="setGoal">Mục tiêu mỗi ngày</label>' +
      '<select id="setGoal" class="input">' +
      [5, 10, 15, 20, 30, 45, 60].map((n) =>
        '<option value="' + n + '"' + (n === settings.goalMin ? " selected" : "") + ">" + n + " phút</option>").join("") +
      "</select></div>" +
      '<div class="set-row"><label for="setNew">Số từ mới mỗi ngày khi ôn tập</label>' +
      '<select id="setNew" class="input">' +
      [5, 8, 12, 20, 30, 50].map((n) =>
        '<option value="' + n + '"' + (n === settings.newPerDay ? " selected" : "") + ">" + n + " từ</option>").join("") +
      "</select></div></div>" +

      '<div class="st-card"><h3>Sao lưu & chuyển máy</h3>' +
      '<p class="sub">Xuất ra một file .json chứa toàn bộ tiến độ của bạn. Gửi file này cho cô Nhung, ' +
      "hoặc nhập lại trên máy khác để học tiếp đúng chỗ đang dở.</p>" +
      '<div class="set-acts">' +
      '<button class="btn btn-primary btn-sm" id="btnExport">⬇ Xuất dữ liệu</button>' +
      '<button class="btn btn-ghost btn-sm" id="btnImport">⬆ Nhập dữ liệu</button>' +
      '<input type="file" id="fileImport" accept=".json,application/json" hidden>' +
      "</div></div>";

    $("#setGoal").onchange = (e) => {
      settings = Store.setSettings(me.uid, { goalMin: +e.target.value });
      toast("Đã đặt mục tiêu " + settings.goalMin + " phút mỗi ngày.", "ok");
    };
    $("#setNew").onchange = (e) => {
      settings = Store.setSettings(me.uid, { newPerDay: +e.target.value });
      toast("Mỗi ngày sẽ học tối đa " + settings.newPerDay + " từ mới.", "ok");
    };
    $("#btnExport").onclick = doExport;
    $("#btnImport").onclick = () => $("#fileImport").click();
    $("#fileImport").onchange = doImport;
  }

  /* ══════════════ Xuất / nhập dữ liệu ══════════════ */
  function doExport() {
    Track.flush();
    const payload = {
      app: "studywithmsnhung-hocsinh",
      version: 1,
      exportedAt: new Date().toISOString(),
      name: me.name,
      progress: Track.get(),
      srs: SRS.all(),
      settings: settings
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const safe = me.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-");
    a.href = URL.createObjectURL(blob);
    a.download = "tiendo-" + safe + "-" + new Date().toLocaleDateString("sv-SE") + ".json";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast("Đã xuất file tiến độ.", "ok");
  }

  function doImport(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    const rd = new FileReader();
    rd.onload = async () => {
      let d;
      try { d = JSON.parse(rd.result); }
      catch (err) { toast("File không đọc được — cần đúng file .json đã xuất từ app.", "err", 4000); return; }
      if (!d || d.app !== "studywithmsnhung-hocsinh") {
        toast("Đây không phải file tiến độ của app này.", "err", 4000);
        return;
      }
      const ok = await confirmBox({
        title: "Nhập dữ liệu của " + (d.name || "?") + "?",
        body: "Toàn bộ tiến độ hiện tại của " + me.name + " trên máy này sẽ bị thay bằng dữ liệu trong file.",
        ok: "Nhập vào", danger: true
      });
      if (!ok) return;
      Track.set(d.progress || {});
      SRS.set(d.srs || {});
      if (d.settings) settings = Store.setSettings(me.uid, d.settings);
      toast("Đã nhập xong dữ liệu.", "ok");
      renderStats();
    };
    rd.readAsText(f);
  }

  /* ══════════════ Menu người dùng ══════════════ */
  const userMenu = $("#userMenu");
  $("#userBtn").onclick = (e) => { e.stopPropagation(); userMenu.classList.toggle("on"); };
  document.addEventListener("click", () => userMenu.classList.remove("on"));
  userMenu.onclick = (e) => e.stopPropagation();

  $("#menuRename").onclick = async () => {
    userMenu.classList.remove("on");
    const nm = prompt("Đổi tên hiển thị:", me.name);
    if (nm == null) return;
    try {
      me = Store.renameUser(me.uid, nm);
      $("#userNm").textContent = me.name;
      $("#userAva").textContent = initial(me.name);
      $("#menuName").textContent = me.name;
      renderHome();
      toast("Đã đổi tên.", "ok");
    } catch (err) { toast(err.message, "err"); }
  };
  $("#menuSwitch").onclick = () => { userMenu.classList.remove("on"); signOut(); };
  $("#menuReset").onclick = async () => {
    userMenu.classList.remove("on");
    const ok = await confirmBox({
      title: "Xoá hồ sơ " + me.name + "?",
      body: "Toàn bộ giờ học, XP và kho ôn tập của bạn trên máy này sẽ mất và không lấy lại được.",
      ok: "Xoá hồ sơ", danger: true
    });
    if (!ok) return;
    const uid = me.uid;
    Track.stop();
    Store.removeUser(uid);
    me = null;
    window.CurrentUser = null;
    renderNameScreen();
    showScreen("screenName");
  };

  /* ══════════════ Cài app lên máy ══════════════ */
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $("#menuInstall").hidden = false;
    if (!localStorage.getItem("swmn.hs.installNo")) $("#installBar").classList.add("on");
  });
  async function doInstall() {
    $("#installBar").classList.remove("on");
    userMenu.classList.remove("on");
    if (!deferredPrompt) {
      toast("Trên iPhone/iPad: bấm nút Chia sẻ ⤴ trong Safari rồi chọn “Thêm vào MH chính”.", "", 5600);
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $("#menuInstall").hidden = true;
  }
  $("#installBtn").onclick = doInstall;
  $("#menuInstall").onclick = doInstall;
  $("#installNo").onclick = () => {
    $("#installBar").classList.remove("on");
    localStorage.setItem("swmn.hs.installNo", "1");
  };

  /* ══════════════ Thanh điều hướng dưới ══════════════ */
  document.querySelectorAll("#navbar button").forEach((b) => {
    b.onclick = () => go(b.dataset.v);
  });

  /* ══════════════ Khởi động ══════════════ */
  lessonsMeta = Store.listLessons();
  if (!COURSES.some((c) => c.id === activeCourse)) activeCourse = COURSES[0].id;

  const savedUid = Store.currentUid();
  if (savedUid && Store.getUser(savedUid)) signIn(savedUid);
  else { renderNameScreen(); showScreen("screenName"); }

  Track.onChange(() => {
    if (currentView === "viewHome" && !document.getElementById("viewHome").hidden) {
      /* cập nhật nhẹ vòng tròn mục tiêu, không dựng lại cả trang */
      const g = Track.get();
      const mins = Math.round(((g.days || {})[Track.dayKey()] || 0) / 60000);
      const t = document.querySelector("#homeGoal .ring-txt b");
      if (t && t.textContent !== mins + "′") renderHome();
    }
  });

  registerSW();
})();
