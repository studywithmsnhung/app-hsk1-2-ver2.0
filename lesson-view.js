/* =====================================================================
   lesson-view.js — Trình xem một bài học

   Cấu trúc TAB (theo yêu cầu của cô Nhung, chỉ còn 4 tab):
     Từ vựng ─┬ Bảng từ vựng   (màn rộng: bảng 7 cột · màn hẹp: thẻ từng từ)
              ├ Bút thuận      (nét viết + phép cấu tạo chữ + câu chuyện nhớ chữ)
              ├ Game ghép cặp
              └ Từ vựng mở rộng (theo chủ đề + từ học sinh tự thêm)
     Ngữ pháp   (tóm tắt · công thức · 2 ví dụ kèm lý do · bài tập)
     Bài khoá   (Hán tự · pinyin · nghĩa, có nút ẩn/hiện từng lớp)
     Ngữ âm · Hoạt động & Luyện nói · 学习小结   (khi bài có dữ liệu)
     Tổng hợp   (bê nguyên từ file bài giảng gốc của cô)

   Flashcard đã chuyển hẳn sang TAB Flashcard Buddy ở thanh dưới cùng.
   ===================================================================== */

(function () {
  "use strict";

  const { $, esc, el, toast, shuffle } = UI;
  const CFG = window.SWMN_CONFIG || {};

  let host = null;
  let L = null;                 // bài học đang mở
  let hwLoaded = null;          // Promise nạp thư viện bút thuận

  /* Web KHÔNG phát âm thanh: theo yêu cầu của cô Nhung, toàn bộ nút nghe
     và phần đọc bằng giọng máy đã được gỡ bỏ. */

  /* ── Nạp thư viện bút thuận khi cần ──────────────────────────────
     Cả thư viện lẫn dữ liệu nét viết của 393 chữ Hán trong 45 bài đều
     nằm sẵn trong app, nên phần này chạy được cả khi KHÔNG có mạng.   */
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error("offline"));
      document.head.appendChild(s);
    });
  }
  function loadHanziWriter() {
    if (hwLoaded) return hwLoaded;
    hwLoaded = (async () => {
      if (!window.HanziWriter) await loadScript("hw-lib.js");
      if (!window.HW_DATA) await loadScript("hw-data.js");
      return window.HanziWriter;
    })();
    return hwLoaded;
  }

  /* ── Khung trang ─────────────────────────────────────────────── */
  function shell() {
    const course = (CFG.courses || []).find((c) => c.id === L.courseId) || {};
    return (
      '<div class="lv-head"><div class="lv-head-in">' +
      '<button class="lv-back" id="lvBack">← Danh sách bài</button>' +
      '<div class="lv-title"><span class="lv-num">' + esc(L.order || "?") + "</span>" +
      '<div><h2 class="zh">' + esc(L.titleZh || L.title || "") + "</h2>" +
      '<div class="sub">' + esc(L.title || "") + "</div></div></div>" +
      '<span class="lv-course">' + esc(course.name || "") + " · bản " + esc(course.edition || "") + "</span>" +
      "</div></div>" +

      '<div class="tabbar"><div class="tabbar-in" id="lvTabs">' +
      '<button data-p="vocab" class="on">Từ vựng</button>' +
      '<button data-p="grammar">Ngữ pháp</button>' +
      '<button data-p="text">Bài khoá</button>' +
      (L.phon ? '<button data-p="phon">Ngữ âm</button>' : "") +
      (L.activity ? '<button data-p="act">' + (L.activity.speak && L.activity.speak.length ? "Hoạt động &amp; Luyện nói" : "Hoạt động") + "</button>" : "") +
      (L.review ? '<button data-p="rev">学习小结</button>' : "") +
      (L.extra || []).map((x, i) =>
        '<button data-p="x' + i + '">' + esc(x.label || "Phần thêm") + "</button>").join("") +
      "</div></div>" +

      '<div class="wrap">' +
      '<div class="pane on" id="paneVocab"></div>' +
      '<div class="pane" id="paneGrammar"></div>' +
      '<div class="pane" id="paneText"></div>' +
      (L.phon ? '<div class="pane" id="panePhon"></div>' : "") +
      (L.activity ? '<div class="pane" id="paneAct"></div>' : "") +
      (L.review ? '<div class="pane" id="paneRev"></div>' : "") +
      (L.extra || []).map((x, i) => '<div class="pane" id="panex' + i + '"></div>').join("") +
      '<footer class="brand-foot">studywithmsnhung <span>· Be your language partner</span></footer>' +
      "</div>"
    );
  }

  function emptyBox(icon, title, body) {
    return '<div class="empty"><div class="empty-icon zh">' + icon + "</div><h3>" +
      esc(title) + "</h3><p>" + esc(body) + "</p></div>";
  }

  /* ═══════════════ TAB TỪ VỰNG ═══════════════ */

  function buildVocab() {
    const p = $("#paneVocab");
    const V = L.vocab || [];
    if (!V.length && !(L.hanzi || []).length && !(L.vocabExt || []).length) {
      p.innerHTML = emptyBox("词", "Bài này chưa có từ vựng", "Cô Nhung sẽ bổ sung sau nhé.");
      return;
    }

    p.innerHTML =
      '<div class="subbar" id="vSub">' +
      '<button data-s="tbl" class="on">Bảng từ vựng</button>' +
      '<button data-s="hz">Bút thuận &amp; chữ Hán</button>' +
      '<button data-s="mg">Game ghép cặp</button>' +
      '<button data-s="ext">Từ vựng mở rộng</button>' +
      "</div>" +
      '<div class="pane on" id="vTbl"></div>' +
      '<div class="pane" id="vHz"></div>' +
      '<div class="pane" id="vMg"></div>' +
      '<div class="pane" id="vExt"></div>';

    const panes = { tbl: "#vTbl", hz: "#vHz", mg: "#vMg", ext: "#vExt" };
    const built = {};
    p.querySelectorAll("#vSub button").forEach((b) => {
      b.onclick = () => {
        p.querySelectorAll("#vSub button").forEach((x) => x.classList.toggle("on", x === b));
        for (const k in panes) $(panes[k]).classList.toggle("on", k === b.dataset.s);
        if (!built[b.dataset.s]) {
          built[b.dataset.s] = true;
          ({ hz: buildHanzi, mg: buildMatch,
             ext: buildExt }[b.dataset.s] || (() => {}))();
        }
      };
    });

    buildVocabTable();
    built.tbl = true;
  }

  function buildVocabTable() {
    const V = L.vocab || [];
    const box = $("#vTbl");
    if (!V.length) {
      box.innerHTML = emptyBox("词", "Chưa có bảng từ vựng", "Bài này chưa nhập từ vựng.");
      return;
    }
    /* Hai cách trình bày cùng một dữ liệu, CSS tự chọn cái hợp với màn hình:
         • màn rộng (laptop, máy tính bảng nằm ngang) → bảng 7 cột đầy đủ;
         • màn hẹp (điện thoại, máy tính bảng dựng đứng) → mỗi từ một thẻ,
           không phải kéo ngang.                                              */
    let rows = "";
    V.forEach((v, i) => {
      const ex = v.example || {};
      rows +=
        "<tr>" +
        '<td class="c-stt">' + (v.stt || i + 1) + "</td>" +
        '<td class="c-hz"><span class="zh">' + esc(v.hanzi) + "</span></td>" +
        '<td class="c-py">' + esc(v.pinyin || "") + "</td>" +
        '<td class="c-hv">' + esc(v.hanviet || "") + "</td>" +
        '<td class="c-pos">' + esc(v.pos || "") + "</td>" +
        '<td class="c-mean">' + esc(v.meaning || "") +
        (v.comps ? '<span class="c-comps zh">' + esc(v.comps) + "</span>" : "") + "</td>" +
        '<td class="c-ex">' +
        (ex.zh ? '<span class="zh">' + esc(ex.zh) + "</span>" : "") +
        (ex.py ? '<span class="py">' + esc(ex.py) + "</span>" : "") +
        (ex.vi ? '<span class="vi">' + esc(ex.vi) + "</span>" : "") +
        "</td></tr>";
    });

    let cards = "";
    V.forEach((v, i) => {
      const ex = v.example || {};
      cards +=
        '<div class="vcard">' +
        '<div class="vc-head">' +
        '<span class="vc-no">' + (v.stt || i + 1) + "</span>" +
        '<span class="vc-hz zh">' + esc(v.hanzi) + "</span>" +
        '<span class="vc-py">' + esc(v.pinyin || "") +
        (v.hanviet ? '<i>' + esc(v.hanviet) + "</i>" : "") + "</span>" +
        (v.pos ? '<span class="vc-pos">' + esc(v.pos) + "</span>" : "") +
        "</div>" +
        '<div class="vc-mean">' + esc(v.meaning || "") + "</div>" +
        (v.comps ? '<div class="vc-comps zh">' + esc(v.comps) + "</div>" : "") +
        (ex.zh
          ? '<div class="vc-ex"><span class="zh">' + esc(ex.zh) + "</span>" +
            (ex.py ? '<span class="py">' + esc(ex.py) + "</span>" : "") +
            (ex.vi ? '<span class="vi">' + esc(ex.vi) + "</span>" : "") + "</div>"
          : "") +
        "</div>";
    });

    box.innerHTML =
      '<div class="sec-title">Bảng từ vựng · ' + V.length + " từ</div>" +
      '<div class="v-table"><div class="tbl-scroll"><table class="vtbl"><thead><tr>' +
      "<th>STT</th><th>Hán tự</th><th>Pinyin</th><th>Hán Việt</th>" +
      "<th>Từ loại</th><th>Nghĩa</th><th>Ví dụ</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></div></div>" +
      '<div class="v-cards">' + cards + "</div>";
  }

  function buildHanzi() {
    const H = L.hanzi || [];
    const box = $("#vHz");
    if (!H.length) {
      box.innerHTML = emptyBox("笔", "Chưa có phần bút thuận", "Bài này chưa nhập dữ liệu chữ Hán.");
      return;
    }
    /* Mỗi mục có thể là 1 chữ đơn hoặc cả một từ nhiều chữ —
       từ nhiều chữ thì dựng nhiều ô bút thuận, mỗi ô một chữ. */
    const charsOf = (h) => {
      const raw = Array.isArray(h.chars) && h.chars.length ? h.chars : [h.char || ""];
      return raw.join("").split("").filter((c) => /[㐀-鿿]/.test(c));
    };

    let html = '<div class="sec-title">Bút thuận &amp; cách nhớ chữ Hán · ' + H.filter((h) => !h.single).length + " mục</div>" +
      '<div class="hz-grid">';
    const nSingle = H.filter((h) => h.single).length;
    H.forEach((h, i) => {
      const cs = charsOf(h);
      /* Chữ độc thể (GTCHSK1 · khối SINGLE của bài giảng): mục riêng, sau các chữ của từ mới */
      if (h.single && !(H[i - 1] || {}).single)
        html += '</div><div class="sec-title" style="margin-top:20px">Chữ độc thể · ' + nSingle + " chữ</div>" +
          '<div class="hz-grid">';
      html +=
        '<div class="hz-card">' +
        '<div class="hz-top">' +
        '<div class="hz-boxes">' +
        cs.map((c, j) =>
          '<div class="hz-box" id="hw' + i + "_" + j + '"><span class="fallback zh">' + esc(c) + "</span></div>"
        ).join("") +
        "</div>" +
        '<div class="hz-meta">' +
        '<div class="hz-word zh">' + esc(h.char || cs.join("")) + "</div>" +
        '<div class="py">' + esc(h.pinyin || "") + "</div>" +
        '<div class="hv">' + esc(h.hanviet || "") + "</div>" +
        '<div class="row">' +
        (h.strokes ? '<span class="chip">' + esc(h.strokes) + " nét</span>" : "") +
        (h.structure ? '<span class="chip">' + esc(h.structure) + "</span>" : "") +
        "</div>" +
        '<button class="btn btn-soft btn-sm hz-play" data-hw="' + i + '">▶ Xem bút thuận</button>' +
        "</div></div>" +
        (h.parts ? '<div class="hz-parts">Cấu tạo: <span class="zh">' + esc(h.parts) + "</span></div>" : "") +
        (h.single ? '<div class="hz-mean">' + (h.pos ? '<span class="chip">' + esc(h.pos) + "</span>" : "") + esc(h.meaning || "") + "</div>" +
          (h.comps ? '<div class="hz-comps zh">' + esc(h.comps) + "</div>" : "") : "") +
        (h.story ? '<div class="hz-story"><b>' + (h.single ? "Nguồn gốc chữ:" : "Mẹo nhớ:") + "</b> " + esc(h.story) + "</div>" : "") +
        (h.single && h.example ? '<div class="hz-ex"><div class="zh">' + esc(h.example.zh || "") + '</div><div class="py">' +
          esc(h.example.py || "") + '</div><div class="vi">' + esc(h.example.vi || "") + "</div></div>" : "") +
        "</div>";
    });
    box.innerHTML = html + "</div>";

    const writers = {};
    box.querySelectorAll("[data-hw]").forEach((b) => {
      b.onclick = async () => {
        const i = +b.dataset.hw;
        const cs = charsOf(H[i]);
        b.disabled = true;
        b.textContent = "Đang tải…";
        try {
          const HW = await loadHanziWriter();
          cs.forEach((c, j) => {
            const key = i + "_" + j;
            if (!writers[key]) {
              const target = document.getElementById("hw" + key);
              if (!target) return;
              target.innerHTML = "";
              writers[key] = HW.create(target, c, {
                width: 92, height: 92, padding: 6, showOutline: true,
                strokeAnimationSpeed: 1, delayBetweenStrokes: 220,
                strokeColor: "#3A2020", radicalColor: "#8B1E28", outlineColor: "#EBD8D2",
                charDataLoader: (ch, onLoad, onErr) => {
                  const d = (window.HW_DATA || {})[ch];
                  if (d) onLoad(d); else onErr(new Error("no data"));
                }
              });
            }
            setTimeout(() => writers[i + "_" + j].animateCharacter(), j * 900);
          });
          b.textContent = "▶ Xem lại";
        } catch (e) {
          b.textContent = "▶ Xem bút thuận";
          toast("Chưa hiện được nét viết của chữ này.", "", 3400);
        } finally {
          b.disabled = false;
        }
      };
    });
  }

  function buildMatch() {
    /* Ghép bộ 3: Hán tự → Pinyin → Nghĩa. Mỗi lượt dùng TOÀN BỘ từ mới của bài.
       So khớp theo NỘI DUNG ô (không theo vị trí), nên từ trùng chữ / trùng
       pinyin / trùng nghĩa (他-她 tā, 在 hai nghĩa…) vẫn ghép được và lượt
       luôn giải hết được. */
    const V = (L.vocab || []).filter((v) => v.hanzi && v.pinyin && v.meaning);
    const box = $("#vMg");
    if (V.length < 3) {
      box.innerHTML = emptyBox("配", "Chưa đủ từ để chơi", "Cần ít nhất 3 từ có pinyin và nghĩa tiếng Việt.");
      return;
    }
    let left = [], round = 0, selH = null, selP = null, done = 0, wrong = 0, startAt = 0, wrongAtStart = 0;

    const tile = (col, v, cls) =>
      '<button class="mg-tile' + (cls ? " " + cls : "") + '" data-c="' + col + '" data-v="' + esc(v) + '">' + esc(v) + "</button>";

    function newRound() {
      left = V.slice();
      selH = selP = null; done = 0; startAt = Date.now(); wrongAtStart = wrong;
      $("#mgH").innerHTML = shuffle(V).map((v) => tile("h", v.hanzi, "zh")).join("");
      $("#mgP").innerHTML = shuffle(V).map((v) => tile("p", v.pinyin, "py")).join("");
      $("#mgM").innerHTML = shuffle(V).map((v) => tile("m", v.meaning, "")).join("");
      $("#mgDone").textContent = "0";
      $("#mgTotal").textContent = V.length;
      chain();
      bindTiles();
    }

    /* Dòng "Đang nối" trên thanh dính: nhìn được cả khi đã cuộn xuống */
    function chain() {
      const c = $("#mgChain");
      if (!c) return;
      c.innerHTML = selH
        ? '<span class="zh">' + esc(selH.dataset.v) + "</span> → " +
          (selP ? '<span class="py">' + esc(selP.dataset.v) + "</span>" : "<i>pinyin?</i>") +
          " → <i>nghĩa?</i>"
        : "<i>Chọn một chữ Hán</i>";
    }

    const clear = (cls) => box.querySelectorAll(".mg-tile." + cls).forEach((x) => x.classList.remove(cls));
    const shake = (t) => { t.classList.add("no"); setTimeout(() => t.classList.remove("no"), 380); };
    const miss = (t) => { wrong++; $("#mgWrong").textContent = wrong; shake(t); };
    const nudge = (col, msg) => {
      const h = box.querySelector('.mg-head[data-c="' + col + '"]');
      if (h) { h.classList.remove("flash"); void h.offsetWidth; h.classList.add("flash"); }
      toast(msg, "", 1800);
    };

    function bindTiles() {
      box.querySelectorAll(".mg-tile").forEach((t) => {
        t.onclick = () => {
          if (t.classList.contains("done")) return;
          const c = t.dataset.c, v = t.dataset.v;

          if (c === "h") {
            const same = t === selH;
            clear("sel"); clear("link");
            selH = same ? null : t; selP = null;
            if (selH) t.classList.add("sel");
            chain();
            return;
          }

          if (c === "p") {
            if (!selH) return nudge("h", "Chọn chữ Hán trước nhé");
            if (t === selP) return;
            const hz = selH.dataset.v;
            if (left.some((w) => w.hanzi === hz && w.pinyin === v)) {
              clear("link");
              selP = t;
              selH.classList.add("link"); t.classList.add("link");
              chain();
            } else miss(t);
            return;
          }

          /* c === "m" */
          if (!selH) return nudge("h", "Chọn chữ Hán trước nhé");
          if (!selP) return nudge("p", "Nối chữ Hán với pinyin trước nhé");
          const hz = selH.dataset.v, py = selP.dataset.v;
          const i = left.findIndex((w) => w.hanzi === hz && w.pinyin === py && w.meaning === v);
          if (i < 0) return miss(t);
          left.splice(i, 1);
          const trio = [selH, selP, t];
          trio.forEach((x) => { x.classList.remove("sel", "link"); x.classList.add("ok"); });
          setTimeout(() => trio.forEach((x) => { x.classList.remove("ok"); x.classList.add("done"); }), 340);
          selH = selP = null;
          done++;
          $("#mgDone").textContent = done;
          chain();
          if (!left.length) setTimeout(win, 480);
        };
      });
    }

    function win() {
      round++;
      const secs = Math.round((Date.now() - startAt) / 1000);
      const missed = wrong - wrongAtStart;
      logGame("match", {
        right: V.length,
        total: V.length,
        wrong: missed,
        secs: secs,
        xp: 0,
        lessonId: L.id
      });
      $("#mgArea").innerHTML =
        '<div class="mg-win"><div class="ic">🎉</div>' +
        "<h3>Ghép đúng hết rồi!</h3>" +
        "<p>" + V.length + " từ trong " + secs + " giây · sai " + missed + " lần</p>" +
        '<button class="btn btn-primary" id="mgAgain">Chơi lượt nữa</button></div>';
      $("#mgAgain").onclick = () => { paint(); newRound(); };
      $("#mgChain").innerHTML = "";
    }

    function paint() {
      $("#mgArea").innerHTML =
        '<div class="mg-grid">' +
        '<div class="mg-head" data-c="h"><b>1</b> Hán tự</div>' +
        '<div class="mg-head" data-c="p"><b>2</b> Pinyin</div>' +
        '<div class="mg-head" data-c="m"><b>3</b> Nghĩa</div>' +
        '<div class="mg-col" id="mgH"></div><div class="mg-col" id="mgP"></div><div class="mg-col" id="mgM"></div>' +
        "</div>";
    }

    box.innerHTML =
      '<div class="sec-title">Game ghép cặp</div>' +
      '<div class="mg-bar">' +
      '<span class="mg-stat">Đã ghép <b id="mgDone">0</b>/<b id="mgTotal">0</b></span>' +
      '<span class="mg-stat">Sai <b id="mgWrong">0</b></span>' +
      '<span class="mg-chain" id="mgChain"></span>' +
      '<button class="btn btn-soft btn-sm" id="mgNew">Lượt mới</button>' +
      "</div>" +
      '<div id="mgArea"></div>' +
      '<p class="hint" style="margin-top:10px">Nối theo thứ tự: bấm <b>chữ Hán</b> → bấm <b>pinyin</b> đúng → bấm <b>nghĩa</b> đúng. Ghép đủ cả 3 là xong một từ.</p>';

    $("#mgNew").onclick = () => { paint(); newRound(); };
    paint();
    newRound();
  }

  /* Ghi lại kết quả một lượt chơi vào hồ sơ học sinh */
  const logGame = (kind, info) => {
    if (window.Track && Track.game) Track.game(kind, info);
  };

  /* ── Từ vựng mở rộng theo chủ đề + từ do học sinh tự thêm ────── */
  function buildExt() {
    const box = $("#vExt");
    const uid = (window.CurrentUser && CurrentUser.uid) || "";
    const groups = L.vocabExt || [];

    function myList() {
      return uid ? Store.myWords(uid, L.id) : [];
    }

    function itemHtml(it, mine) {
      return '<div class="ext-item' + (mine ? " mine" : "") + '">' +
        (mine ? '<button class="ext-del" data-del="' + esc(it.hanzi) + '" title="Xoá từ này">×</button>' : "") +
        '<div class="hz zh">' + esc(it.hanzi) + "</div>" +
        '<div class="py">' + esc(it.pinyin || "") + "</div>" +
        '<div class="mn">' + esc(it.meaning || "") + "</div></div>";
    }

    function paint() {
      const mine = myList();
      let html =
        '<div class="sec-title">Từ vựng mở rộng theo chủ đề</div>' +
        '<p class="hint" style="margin:-4px 0 14px">Những từ cùng chủ đề với bài này. ' +
        'Bấm "Đưa vào kho ôn tập" là chúng sẽ xuất hiện trong TAB Lịch sử học tập → Ôn tập.</p>';

      if (!groups.length) {
        html += emptyBox("展", "Bài này chưa có từ mở rộng",
          "Bạn vẫn có thể tự thêm từ của mình ở phía dưới.");
      }
      groups.forEach((g, gi) => {
        html +=
          '<div class="ext-block"><div class="ext-head"><span class="dot"></span>' +
          esc(g.topic || "Chủ đề") +
          ((g.items || []).length ? '<button class="ext-add-srs" data-grp="' + gi + '">+ Đưa vào kho ôn tập</button>' : "") +
          "</div>" +
          ((g.items || []).length ? '<div class="ext-grid">' + g.items.map((it) => itemHtml(it, false)).join("") + "</div>" : "") +
          /* bảng phân biệt do cô soạn (vd. 骑 · 坐 · 开 bài 15 GTCHSK1) */
          (g.html ? '<div class="ext-cmp">' + g.html + "</div>" : "") +
          "</div>";
      });

      /* Khối từ tự thêm */
      html +=
        '<div class="ext-block my"><div class="ext-head"><span class="dot"></span>' +
        "Từ của tôi" +
        (mine.length ? ' <span class="ext-n">' + mine.length + " từ</span>" : "") +
        (mine.length ? '<button class="ext-add-srs" data-grp="my">+ Đưa vào kho ôn tập</button>' : "") +
        "</div>" +
        (mine.length
          ? '<div class="ext-grid">' + mine.map((it) => itemHtml(it, true)).join("") + "</div>"
          : '<p class="hint" style="margin:2px 0 12px">Gặp từ hay ngoài sách? Thêm vào đây để học cùng bài này.</p>') +
        '<form class="ext-form" id="myForm">' +
        '<input class="input" id="myHz" placeholder="Chữ Hán *" maxlength="12" required>' +
        '<input class="input" id="myPy" placeholder="Pinyin" maxlength="40">' +
        '<input class="input" id="myMn" placeholder="Nghĩa tiếng Việt *" maxlength="80" required>' +
        '<button class="btn btn-primary btn-sm" type="submit">+ Thêm từ</button>' +
        "</form></div>";

      box.innerHTML = html;

      box.querySelectorAll(".ext-add-srs").forEach((b) => {
        b.onclick = () => {
          const list = b.dataset.grp === "my" ? myList() : (groups[+b.dataset.grp] || {}).items || [];
          const n = window.SRS ? SRS.enrollWords(list, L.id) : 0;
          toast(n ? "Đã thêm " + n + " từ vào kho ôn tập." : "Các từ này đã có trong kho ôn tập rồi.", "ok");
        };
      });

      box.querySelectorAll("[data-del]").forEach((b) => {
        b.onclick = () => {
          Store.removeMyWord(uid, L.id, b.dataset.del);
          paint();
        };
      });

      const form = box.querySelector("#myForm");
      if (form) {
        form.onsubmit = (e) => {
          e.preventDefault();
          if (!uid) { toast("Bạn cần nhập tên ở màn hình đầu tiên đã nhé.", "err"); return; }
          try {
            const w = {
              hanzi: box.querySelector("#myHz").value,
              pinyin: box.querySelector("#myPy").value,
              meaning: box.querySelector("#myMn").value
            };
            Store.addMyWord(uid, L.id, w);
            if (window.SRS) SRS.enrollWords([w], L.id);
            toast("Đã thêm từ và đưa vào kho ôn tập.", "ok");
            paint();
            const f = box.querySelector("#myHz");
            if (f) f.focus();
          } catch (err) {
            toast(err.message, "err", 3200);
          }
        };
      }
    }

    paint();
  }

  /* ═══════════════ TAB NGỮ PHÁP ═══════════════ */

  function buildGrammar() {
    const G = L.grammar || [];
    const p = $("#paneGrammar");
    if (!G.length) {
      p.innerHTML = emptyBox("法", "Bài này chưa có phần ngữ pháp", "Cô Nhung sẽ bổ sung sau nhé.");
      return;
    }
    let html = '<div class="sec-title">Ngữ pháp · ' + G.length + " chủ điểm</div>";
    G.forEach((g, gi) => {
      html +=
        '<div class="gr-card' + (gi === 0 ? " open" : "") + '" data-g="' + gi + '">' +
        '<button class="gr-head"><span class="gr-no">' + (gi + 1) + "</span>" +
        "<h3>" + esc(g.title || "Chủ điểm " + (gi + 1)) + "</h3>" +
        '<span class="gr-arrow">▼</span></button>' +
        '<div class="gr-body">' +
        /* formula / summary / note do chính cô soạn nên giữ nguyên thẻ HTML
           (in đậm, tô màu phần công thức…), không escape. */
        (g.formula ? '<div class="gr-formula zh">' + g.formula + "</div>" : "") +
        (g.summary ? '<div class="gr-sum">' + g.summary + "</div>" : "") +
        (g.note ? '<div class="gr-note">' + (/<(b|strong)[\s>]/i.test(g.note) ? "" : "<b>Lưu ý:</b> ") + g.note + "</div>" : "");

      const ex = g.examples || [];
      if (ex.length) {
        html += '<div class="sec-title" style="font-size:.88rem;margin:16px 0 10px">Ví dụ</div>';
        ex.forEach((e, ei) => {
          html +=
            '<div class="ex-card">' +
            '<span class="ex-no">Ví dụ ' + (ei + 1) + "</span>" +
            '<div class="ex-zh">' + esc(e.zh || "") + "</div>" +
            (e.py ? '<div class="ex-py">' + esc(e.py) + "</div>" : "") +
            (e.vi ? '<div class="ex-vi">' + esc(e.vi) + "</div>" : "") +
            (e.why ? '<div class="ex-why"><b>Vì sao dùng ví dụ này:</b> ' + esc(e.why) + "</div>" : "") +
            "</div>";
        });
      }

      const qs = g.exercises || [];
      if (qs.length) {
        html += '<div class="sec-title" style="font-size:.88rem;margin:18px 0 10px">Bài tập</div>' +
          '<div data-quiz="' + gi + '"></div>';
      }
      html += "</div></div>";
    });
    p.innerHTML = html;

    p.querySelectorAll(".gr-head").forEach((h) => {
      h.onclick = () => h.parentElement.classList.toggle("open");
    });
    p.querySelectorAll("[data-quiz]").forEach((box) => {
      buildQuiz(box, (G[+box.dataset.quiz].exercises) || []);
    });
  }

  const LETTERS = "ABCDEFGH";

  function buildQuiz(box, qs) {
    qs.forEach((q, qi) => {
      const card = el("div", { class: "qz" });
      const qText = String(q.q || "").replace(/_{2,}|\.{3,}/g, '<span class="blank">?</span>');

      if (q.type === "order") {
        card.innerHTML =
          '<div class="qz-q">' + (qi + 1) + ". " + qText + "</div>" +
          '<div class="qz-slot"></div>' +
          '<div class="qz-tokens"></div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="btn btn-primary btn-sm" data-go>Kiểm tra</button>' +
          '<button class="btn btn-ghost btn-sm" data-clear>Xoá</button></div>' +
          '<div class="qz-fb"></div>';
        const slot = card.querySelector(".qz-slot");
        const toks = card.querySelector(".qz-tokens");
        const picked = [];
        shuffle(q.tokens || []).forEach((t, ti) => {
          const b = el("button", { class: "qz-tok" }, esc(t));
          b.onclick = () => {
            b.classList.add("used");
            picked.push({ t, b });
            slot.textContent = picked.map((x) => x.t).join(" ");
          };
          toks.appendChild(b);
        });
        card.querySelector("[data-clear]").onclick = () => {
          picked.splice(0).forEach((x) => x.b.classList.remove("used"));
          slot.textContent = "";
          fb(card, null);
        };
        card.querySelector("[data-go]").onclick = () => {
          const got = picked.map((x) => x.t).join("").replace(/\s/g, "");
          const want = String(q.answer || "").replace(/\s/g, "");
          fb(card, got === want, got === want
            ? (q.explain || "Chuẩn rồi!")
            : "Đáp án đúng: " + q.answer + (q.explain ? " — " + q.explain : ""));
        };
      } else if (q.type === "fillm") {
        /* nhiều chỗ trống: mỗi chỗ một ô gõ nằm ngay trong câu */
        card.innerHTML =
          '<div class="qz-q">' + (qi + 1) + ". " +
          String(q.q || "").replace(/\{\{(\d+)\}\}/g, (m, k) =>
            '<input class="input qz-in" data-k="' + k + '" autocapitalize="off" aria-label="Chỗ trống ' + (+k + 1) + '">') +
          "</div>" +
          '<div class="qz-fill"><button class="btn btn-primary btn-sm" data-go>Kiểm tra</button></div>' +
          '<div class="qz-fb"></div>';
        const norm = (s) => String(s).trim().toLowerCase().replace(/[\s.,!?。，！？]/g, "");
        const ins = [...card.querySelectorAll(".qz-in")];
        const check = () => {
          let all = true;
          ins.forEach((inp) => {
            const ok = (q.blanks[+inp.dataset.k] || []).some((a) => norm(a) === norm(inp.value));
            inp.classList.toggle("ok", ok);
            inp.classList.toggle("no", !ok);
            if (!ok) all = false;
          });
          fb(card, all, all
            ? (q.explain || "Chuẩn rồi!")
            : "Đáp án đúng: " + q.blanks.map((b) => b[0]).join(" · ") + (q.explain ? " — " + q.explain : ""));
        };
        card.querySelector("[data-go]").onclick = check;
        ins.forEach((inp) => { inp.onkeydown = (e) => { if (e.key === "Enter") check(); }; });
      } else if (q.type === "fill") {
        card.innerHTML =
          '<div class="qz-q">' + (qi + 1) + ". " + qText + "</div>" +
          '<div class="qz-fill"><input class="input" placeholder="Gõ đáp án…" autocapitalize="off">' +
          '<button class="btn btn-primary btn-sm" data-go>Kiểm tra</button></div>' +
          '<div class="qz-fb"></div>';
        const inp = card.querySelector("input");
        const check = () => {
          const norm = (s) => String(s).trim().toLowerCase().replace(/[\s.,!?。，！？]/g, "");
          const ok = (Array.isArray(q.answer) ? q.answer : [q.answer]).some(
            (a) => norm(a) === norm(inp.value));
          fb(card, ok, ok
            ? (q.explain || "Chuẩn rồi!")
            : "Đáp án đúng: " + (Array.isArray(q.answer) ? q.answer.join(" / ") : q.answer) +
              (q.explain ? " — " + q.explain : ""));
        };
        card.querySelector("[data-go]").onclick = check;
        inp.onkeydown = (e) => { if (e.key === "Enter") check(); };
      } else {
        card.innerHTML =
          '<div class="qz-q">' + (qi + 1) + ". " + qText + "</div>" +
          '<div class="qz-opts"></div><div class="qz-fb"></div>';
        const opts = card.querySelector(".qz-opts");
        (q.options || []).forEach((o, oi) => {
          const b = el("button", { class: "qz-opt" },
            '<span class="lt">' + LETTERS[oi] + '</span><span class="zh">' + esc(o) + "</span>");
          b.onclick = () => {
            const ok = oi === q.answer;
            opts.querySelectorAll("button").forEach((x, xi) => {
              x.disabled = true;
              if (xi === q.answer) x.classList.add("ok");
              else if (xi === oi) x.classList.add("no");
            });
            fb(card, ok, (ok ? "Chuẩn rồi! " : "Đáp án đúng là " + LETTERS[q.answer] + ". ") + (q.explain || ""));
          };
          opts.appendChild(b);
        });
      }
      box.appendChild(card);
    });
  }

  function fb(card, ok, msg) {
    const n = card.querySelector(".qz-fb");
    if (ok === null) { n.className = "qz-fb"; n.innerHTML = ""; return; }
    n.className = "qz-fb on " + (ok ? "ok" : "no");
    n.innerHTML = "<b>" + (ok ? "✓ Đúng" : "✗ Chưa đúng") + "</b> · " + esc(msg || "");
  }

  /* ═══════════════ TAB BÀI KHOÁ ═══════════════ */

  function buildText() {
    const T = L.text;
    const p = $("#paneText");
    /* Hỗ trợ 2 dạng: text.lines (một đoạn) và text.blocks (nhiều đoạn hội thoại) */
    const blocks = (T && T.blocks && T.blocks.length)
      ? T.blocks
      : [{ lines: (T && T.lines) || [] }];
    const lines = blocks.reduce((a, b) => a.concat(b.lines || []), []);
    if (!lines.length) {
      p.innerHTML = emptyBox("文", "Bài này chưa có bài khoá", "Cô Nhung sẽ bổ sung sau nhé.");
      return;
    }
    const isDialog = lines.some((l) => l.speaker);

    p.innerHTML =
      '<div class="sec-title">' + esc((T && T.title) || "Bài khoá") + "</div>" +
      '<div class="tx-tools">' +
      '<button class="tgl on" data-t="zh"><span class="box"></span>Hán tự</button>' +
      '<button class="tgl on" data-t="py"><span class="box"></span>Pinyin</button>' +
      '<button class="tgl on" data-t="vi"><span class="box"></span>Nghĩa</button>' +
      "</div>" +
      '<div class="' + (isDialog ? "dlg" : "tx-para dlg") + '" id="txBody"></div>' +
      '<p class="hint" style="margin-top:11px">Tắt một lớp để tự kiểm tra trí nhớ. Bấm vào dòng bị mờ để hé xem đáp án.</p>';

    const body = $("#txBody");
    blocks.forEach((blk, bi) => {
      if (blk.titleZh || blk.titleVi) {
        body.appendChild(el("div", { class: "dlg-blk" },
          (blk.icon ? '<span class="ic">' + esc(blk.icon) + "</span>" : "") +
          '<span class="t"><b class="zh">' + esc(blk.titleZh || "") + "</b>" +
          (blk.titleVi ? '<i>' + esc(blk.titleVi) + "</i>" : "") + "</span>" +
          '<span class="no">Đoạn ' + (bi + 1) + "</span>"));
      }
      /* Bài khoá dạng đoạn văn (HSK2 3.0 · 课文四): gộp cả đoạn vào một khung */
      if (blk.para) {
        const ls = blk.lines || [];
        body.appendChild(el("div", { class: "dlg-line dlg-para" },
          (blk.speaker ? '<span class="dlg-sp">' + esc(blk.speaker) + "</span>" : "") +
          '<div class="dlg-body">' +
          /* l.br = sang đoạn mới (HSK3 3.0 · email nhiều đoạn) */
          '<div class="dlg-zh zh">' + ls.map((l, i) => (i && l.br ? "<br>" : "") + esc(l.zh || "")).join("") + "</div>" +
          '<div class="dlg-py">' + ls.map((l, i) => (i && l.br ? "<br>" : i ? " " : "") + esc(l.py || "")).join("") + "</div>" +
          '<div class="dlg-vi">' + ls.map((l, i) => (i && l.br ? "<br>" : i ? " " : "") + esc(l.vi || "")).join("") + "</div>" +
          "</div>"));
        return;
      }
      (blk.lines || []).forEach((l) => {
        if (l.gap) {
          body.appendChild(el("div", { class: "dlg-gap zh" }, esc(l.zh || "……")));
          return;
        }
        body.appendChild(el("div", { class: "dlg-line" },
          (l.speaker ? '<span class="dlg-sp"' + (l.name ? ' title="' + esc(l.name) + '"' : "") + ">" + esc(l.speaker) + "</span>" : "") +
          '<div class="dlg-body">' +
          (l.name ? '<div class="dlg-nm">' + esc(l.name) + "</div>" : "") +
          '<div class="dlg-zh zh">' + esc(l.zh || "") + "</div>" +
          (l.py ? '<div class="dlg-py">' + esc(l.py) + "</div>" : "") +
          (l.vi ? '<div class="dlg-vi">' + esc(l.vi) + "</div>" : "") +
          "</div>"));
      });
    });

    /* hé xem khi bấm vào phần bị làm mờ */
    body.querySelectorAll(".dlg-zh,.dlg-py,.dlg-vi").forEach((n) => {
      n.addEventListener("click", () => n.classList.toggle("peek"));
    });

    p.querySelectorAll(".tgl").forEach((b) => {
      b.onclick = () => {
        const on = b.classList.toggle("on");
        body.classList.toggle("hide-" + b.dataset.t, !on);
        if (on) body.querySelectorAll(".peek").forEach((x) => x.classList.remove("peek"));
      };
    });

  }

  /* ═══════════════ TAB NGỮ ÂM (GTCHSK1 + GTCHSK2 2.0 · lấy từ bài giảng optimize) ═══════════════
     Mỗi mục: nhóm kiến thức · mô tả (Trung + Việt) · sơ đồ trọng âm / ngữ điệu ·
     mẹo cho người Việt · bảng từ luyện đọc (âm tiết nhấn = đỏ đậm, đọc nhẹ = nhạt) ·
     câu luyện đọc (chấm đỏ = đọc nhấn, mũi tên = lên / xuống giọng).            */

  function buildPhon() {
    const P = L.phon || [];
    const p = $("#panePhon");
    const chip = (x) =>
      '<span class="ph-c' + (x.st ? " st" : "") + (x.lt ? " lt" : "") + (x.dn ? " dn" : "") + '">' +
      '<b class="zh">' + esc(x.l || "") + "</b><small>" + esc(x.s || "") + "</small></span>";
    let html =
      '<div class="tx-tools">' +
      '<button class="tgl on" data-t="py"><span class="box"></span>Pinyin</button>' +
      '<button class="tgl on" data-t="vi"><span class="box"></span>Nghĩa</button>' +
      '</div><div id="phBody">';
    let lastGrp = "";
    P.forEach((x) => {
      if (x.grp && x.grp !== lastGrp) {
        lastGrp = x.grp;
        html += '<div class="ph-grp"><b class="zh">' + esc(x.grp) + "</b><span>" + esc(x.grpVi || "") + "</span></div>";
      }
      const join = x.arrow ? '<i class="ph-j">→</i>' : '<i class="ph-j">+</i>';
      html +=
        '<div class="ac-card ph-card">' +
        '<div class="ac-head"><span class="ac-tag">' + esc(x.tag || "Ngữ âm") + "</span>" +
        '<b class="zh">' + esc(x.zh || "") + "</b>" +
        (x.py ? '<span class="ac-mean">' + esc(x.py) + "</span>" : "") + "</div>" +
        (x.vi ? '<div class="ph-vi">' + esc(x.vi) + "</div>" : "") +
        /* GTCHSK1: nội dung dựng sẵn từ bài giảng (mô tả · âm ví dụ · sơ đồ thanh điệu · quy tắc · luyện đọc) */
        (x.html || "") +
        (x.introZh ? '<div class="ph-desc"><div class="zh">' + esc(x.introZh) + '</div><div class="dlg-vi">' + esc(x.introVi || "") + "</div></div>" : "") +
        (x.descZh && x.descZh !== x.introZh ? '<div class="ph-desc"><div class="zh">' + esc(x.descZh) + '</div><div class="dlg-vi">' + esc(x.descVi || "") + "</div></div>" : "") +
        (x.pat ? '<div class="ph-pat">' + x.pat.map(chip).join(join) + "</div>" : "") +
        (x.patRows ? (x.patLbl ? '<div class="ac-bank-h">' + esc(x.patLbl) + "</div>" : "") +
          x.patRows.map((r) => '<div class="ph-pat">' + r.map(chip).join('<i class="ph-j">→</i>') + "</div>").join("") : "") +
        /* mẹo do cô soạn, giữ nguyên thẻ in đậm */
        (x.tip ? '<div class="gr-note"><b>Mẹo:</b> ' + x.tip + "</div>" : "") +
        (x.rows ? '<div class="ph-words">' + x.rows.flat().map((w) =>
          '<div class="ph-w"><b class="zh">' + esc(w.hz) + "</b>" +
          '<div class="ph-syl dlg-py">' + (w.syl || []).map((sy, k) =>
            '<span class="' + (k === w.st ? "st" : "") + ([].concat(w.lt == null ? [] : w.lt).indexOf(k) >= 0 ? " lt" : "") + '">' + esc(sy) + "</span>").join(" ") + "</div>" +
          '<div class="dlg-vi">' + esc(w.vi || "") + "</div></div>").join("") + "</div>" : "") +
        (x.sents ? (x.readLbl ? '<div class="ac-bank-h" style="margin-top:12px">' + esc(x.readLbl) + "</div>" : "") +
          x.sents.map((st) => {
            /* 3 dạng: câu đơn {tone,w} · cặp đối chiếu {pair:[…]} · hội thoại {lines:[{who,w}]} */
            const one = (o) =>
              '<div class="ph-line">' + (o.who ? '<span class="ac-who">' + esc(o.who) + "</span>" : "") +
              '<div class="ac-tx"><div class="ph-sw">' + (o.w || []).map((w) =>
                '<span class="ph-tok' + (w.st ? " st" : "") + '"><i class="dlg-py">' + esc(w.py || "") + "</i><b class=\"zh\">" + esc(w.hz) + "</b></span>").join("") +
              (o.tone ? '<span class="ph-tone ' + (o.tone === "up" ? "up" : "dn") + '">' + (o.tone === "up" ? "↗" : "↘") + "</span>" : "") +
              '</div><div class="dlg-vi">' + esc(o.vi || "") + "</div></div></div>";
            const list = st.lines || st.pair || [st];
            return '<div class="ph-sent">' + list.map(one).join("") + "</div>";
          }).join("") : "") +
        "</div>";
    });
    p.innerHTML = html + "</div>";
    const body = $("#phBody");
    body.querySelectorAll(".dlg-py,.dlg-vi").forEach((n) =>
      n.addEventListener("click", () => n.classList.toggle("peek")));
    /* sơ đồ thanh điệu: bấm để vẽ lại đường nét */
    body.querySelectorAll(".k1-tc").forEach((c) => {
      c.classList.add("play");
      c.addEventListener("click", () => { c.classList.remove("play"); void c.offsetWidth; c.classList.add("play"); });
    });
    p.querySelectorAll(".tgl").forEach((b) => {
      b.onclick = () => {
        const on = b.classList.toggle("on");
        body.classList.toggle("hide-" + b.dataset.t, !on);
        if (on) body.querySelectorAll(".peek").forEach((x) => x.classList.remove("peek"));
      };
    });
  }

  /* ═══════════════ TAB HOẠT ĐỘNG & LUYỆN NÓI (HSK2 3.0) ═══════════════
     Hoạt động 课堂活动: đề bài + mẫu câu gợi ý.
     Luyện nói 口语练习 (bài 5 · 10 · 15): đề kiểu HSKK, đồng hồ đếm ngược
     thời gian chuẩn bị / thời gian nói (không phát âm thanh), khung dàn ý
     kèm câu ví dụ ẩn — bấm để xem.                                        */

  const lineHtml = (o, who) =>
    '<div class="ac-ln">' + (who ? '<span class="ac-who">' + esc(who) + "</span>" : "") +
    '<div class="ac-tx"><div class="dlg-zh zh">' + esc(o.zh || "") + "</div>" +
    (o.py ? '<div class="dlg-py">' + esc(o.py) + "</div>" : "") +
    (o.vi ? '<div class="dlg-vi">' + esc(o.vi) + "</div>" : "") + "</div></div>";

  /* Mẫu câu của hoạt động (bảng ghép câu / câu hỏi đường) */
  function patternHtml(pt) {
    if (!pt) return "";
    if (pt.ask) return '<div class="ac-bank"><div class="ac-bank-h">Mẫu câu hỏi</div>' + lineHtml(pt.ask) + "</div>";
    return '<div class="ac-bank"><div class="ac-bank-h">Mẫu câu</div><div class="ac-pat">' +
      pt.parts.map((x) => x.slot
        ? '<span class="ac-slot">' + esc(x.slot) + "</span>"
        : '<span class="ac-fix"><b class="zh">' + esc(x.zh) + "</b>" + (x.py ? '<i class="dlg-py">' + esc(x.py) + "</i>" : "") + "</span>").join("") +
      "</div>" + (pt.vi ? '<div class="dlg-vi">' + esc(pt.vi) + "</div>" : "") + "</div>";
  }

  const fmtClock = (sec) => Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
  let timers = [];

  function buildActivity() {
    const A = L.activity || {};
    const p = $("#paneAct");
    let html =
      '<div class="tx-tools">' +
      '<button class="tgl on" data-t="py"><span class="box"></span>Pinyin</button>' +
      '<button class="tgl on" data-t="vi"><span class="box"></span>Nghĩa</button>' +
      '</div><div id="actBody">';

    (A.act || []).forEach((a) => {
      html +=
        '<div class="ac-card">' +
        '<div class="ac-head"><span class="ac-tag">' + esc(a.tag || "Hoạt động") + "</span>" +
        '<b class="zh">' + esc(a.zh || "") + "</b>" +
        (a.mean ? '<span class="ac-mean">' + esc(a.mean) + "</span>" : "") + "</div>" +
        '<div class="ac-task">' + lineHtml(a.q) + "</div>" +
        patternHtml(a.pattern) +
        (a.banks || []).map((b) =>
          '<div class="ac-bank"><div class="ac-bank-h">' + esc(b.lbl || "") +
          (b.zh ? ' <span class="zh">' + esc(b.zh) + "</span>" : "") + "</div>" +
          '<div class="ac-chips">' + b.items.map((x) =>
            '<span class="ac-chip"><b class="zh">' + esc(x.zh) + "</b>" +
            '<i class="dlg-py">' + esc(x.py || "") + "</i>" +
            '<i class="dlg-vi">' + esc(x.vi || "") + "</i></span>").join("") +
          "</div></div>").join("") +
        (a.tasks && a.tasks.length
          ? '<div class="ac-bank"><div class="ac-bank-h">Đề luyện (hỏi – chỉ đường)</div><div class="ac-chips">' +
            a.tasks.map((t, ti) => '<span class="ac-chip task"><b class="zh">' + (ti + 1) + ". " + esc(t) + "</b></span>").join("") +
            "</div></div>"
          : "") +
        ((a.items || []).length ? '<div class="sec-title" style="font-size:.86rem;margin:14px 0 9px">Mẫu câu gợi ý</div>' : "") +
        (a.items || []).map((it) =>
          '<div class="ac-item">' +
          (it.lines ? it.lines.map((l) => lineHtml(l, l.who)).join("") : lineHtml(it)) +
          "</div>").join("") +
        "</div>";
    });

    (A.speak || []).forEach((sp, si) => {
      html +=
        '<div class="ac-card sp-card">' +
        '<div class="ac-head"><span class="ac-tag sp">' + esc(sp.tag || "Luyện nói") + "</span>" +
        '<b class="zh">' + esc(sp.zh || "") + "</b>" +
        (sp.mean ? '<span class="ac-mean">' + esc(sp.mean) + "</span>" : "") + "</div>" +
        '<div class="ac-task">' + lineHtml(sp.q) + "</div>" +
        '<div class="sp-timers">' +
        [["prep", "Chuẩn bị", sp.prep || 3], ["talk", "Nói", sp.talk || 2]].map(([k, lb, m]) =>
          '<div class="sp-tm" data-sp="' + si + '" data-k="' + k + '" data-sec="' + m * 60 + '">' +
          '<div class="sp-lb">' + lb + " · " + m + " phút</div>" +
          '<div class="sp-clock">' + fmtClock(m * 60) + "</div>" +
          '<div class="sp-btns"><button class="btn btn-primary btn-sm" data-go>▶ Bắt đầu</button>' +
          '<button class="btn btn-ghost btn-sm" data-reset>↺</button></div></div>').join("") +
        "</div>" +
        '<div class="sec-title" style="font-size:.86rem;margin:16px 0 9px">Dàn ý gợi ý</div>' +
        (sp.frame || []).map((f, fi) =>
          '<div class="sp-fr">' +
          '<span class="sp-lbl zh">' + esc(f.lbl || "") + "</span>" +
          '<div class="sp-fr-body">' + lineHtml(f) +
          (f.ex ? '<button class="sp-exbtn" data-ex="' + si + "_" + fi + '">Xem câu ví dụ</button>' +
            '<div class="sp-ex" id="spx' + si + "_" + fi + '" hidden>' + lineHtml(f.ex) + "</div>" : "") +
          "</div></div>").join("") +
        "</div>";
    });
    p.innerHTML = html + "</div>";

    const body = $("#actBody");
    body.querySelectorAll(".dlg-py,.dlg-vi").forEach((n) =>
      n.addEventListener("click", () => n.classList.toggle("peek")));
    p.querySelectorAll(".tgl").forEach((b) => {
      b.onclick = () => {
        const on = b.classList.toggle("on");
        body.classList.toggle("hide-" + b.dataset.t, !on);
        if (on) body.querySelectorAll(".peek").forEach((x) => x.classList.remove("peek"));
      };
    });
    body.querySelectorAll("[data-ex]").forEach((b) => {
      b.onclick = () => {
        const x = document.getElementById("spx" + b.dataset.ex);
        x.hidden = !x.hidden;
        b.textContent = x.hidden ? "Xem câu ví dụ" : "Ẩn câu ví dụ";
      };
    });

    /* Đồng hồ đếm ngược */
    body.querySelectorAll(".sp-tm").forEach((box) => {
      const total = +box.dataset.sec;
      const clock = box.querySelector(".sp-clock");
      const go = box.querySelector("[data-go]");
      const t = { left: total, id: null };
      timers.push(t);
      const stop = () => { clearInterval(t.id); t.id = null; };
      const paint = () => {
        clock.textContent = fmtClock(t.left);
        box.classList.toggle("run", !!t.id);
        box.classList.toggle("end", t.left === 0);
        go.textContent = t.id ? "❚❚ Tạm dừng" : t.left === 0 ? "▶ Làm lại" : t.left < total ? "▶ Tiếp tục" : "▶ Bắt đầu";
      };
      go.onclick = () => {
        if (t.id) { stop(); paint(); return; }
        if (t.left === 0) t.left = total;
        t.id = setInterval(() => {
          t.left = Math.max(0, t.left - 1);
          if (!t.left) {
            stop();
            toast((box.dataset.k === "prep" ? "Hết giờ chuẩn bị — bắt đầu nói nhé!" : "Hết giờ nói!"), "ok", 3200);
          }
          paint();
        }, 1000);
        paint();
      };
      box.querySelector("[data-reset]").onclick = () => { stop(); t.left = total; paint(); };
    });
  }

  /* ═══════════════ TAB 学习小结 · TỔNG KẾT (bài 3 · 6 · 9 · 12 · 15) ═══════════════ */

  function buildReview() {
    const R = L.review || { rows: [] };
    const p = $("#paneRev");
    const groups = {};
    (R.rows || []).forEach((r) => { (groups[r.l] = groups[r.l] || []).push(r); });
    let html =
      '<div class="sec-title">学习小结 · Tổng kết ngữ pháp bài ' + esc(R.range || "") + "</div>" +
      '<div class="tx-tools">' +
      '<button class="tgl on" data-t="py"><span class="box"></span>Pinyin</button>' +
      '<button class="tgl on" data-t="vi"><span class="box"></span>Nghĩa</button>' +
      '</div><div id="revBody">';
    Object.keys(groups).forEach((l) => {
      html += '<div class="rv-grp"><div class="rv-l">Bài ' + esc(l) + "</div>" +
        groups[l].map((r) =>
          '<div class="rv-row"><div class="rv-pt"><b class="zh">' + esc(r.zh) + "</b>" +
          "<span>" + esc(r.vi || "") + "</span></div>" +
          '<div class="rv-ex">' + (r.ex ? lineHtml(r.ex) : "") + "</div></div>").join("") +
        "</div>";
    });
    p.innerHTML = html + "</div>";
    const body = $("#revBody");
    body.querySelectorAll(".dlg-py,.dlg-vi").forEach((n) =>
      n.addEventListener("click", () => n.classList.toggle("peek")));
    p.querySelectorAll(".tgl").forEach((b) => {
      b.onclick = () => {
        const on = b.classList.toggle("on");
        body.classList.toggle("hide-" + b.dataset.t, !on);
        if (on) body.querySelectorAll(".peek").forEach((x) => x.classList.remove("peek"));
      };
    });
  }

  /* ═══════════════ TAB PHẦN THÊM (giữ nguyên từ file bài giảng gốc) ═══════════════

     Nội dung các tab như “Mục tiêu”, “Phát âm & Chữ Hán”, “Lỗi sai”, “Tổng hợp”
     được bê nguyên văn từ file HTML cô đã soạn. Để CSS của file gốc không phá
     giao diện web (và ngược lại), phần này dựng trong Shadow DOM — một vùng
     cách ly hoàn toàn về kiểu dáng.                                              */

  function buildExtra(i) {
    const x = (L.extra || [])[i];
    const p = $("#panex" + i);
    if (!x || !x.html) {
      p.innerHTML = emptyBox("补", "Phần này chưa có nội dung", "");
      return;
    }
    p.innerHTML = '<div class="sec-title">' + esc(x.label || "") + "</div>";
    const holder = el("div", { class: "extra-host" });
    p.appendChild(holder);
    let root;
    try {
      root = holder.attachShadow({ mode: "open" });
    } catch (e) {
      holder.innerHTML = x.html;
      return;
    }
    root.innerHTML =
      "<style>" +
      ":host{display:block;all:initial}" +
      "*{box-sizing:border-box}" +
      ":host,:host *{font-family:'Be Vietnam Pro',sans-serif;color:#3A2020}" +
      (L.extraCss || "") +
      /* ép nền trong suốt để ăn nhập với trang, và chặn tràn ngang */
      "body,.container,.tab-content{background:transparent!important;max-width:100%!important;padding:0!important;margin:0!important;box-shadow:none!important;border:none!important}" +
      "img,table,pre{max-width:100%}" +
      "</style>" +
      '<div class="container"><div class="tab-content active">' + x.html + "</div></div>";
  }

  /* ═══════════════ Mở / đóng ═══════════════ */

  const LessonView = {
    async open(id) {
      host = document.getElementById("viewLesson");
      host.hidden = false;
      host.innerHTML = '<div style="padding:70px 0"><div class="spinner"></div></div>';
      window.scrollTo(0, 0);
      try {
        L = await Store.getLesson(id);
      } catch (e) {
        L = null;
        toast(Store.friendlyError(e), "err", 4200);
      }
      if (!L) {
        host.innerHTML =
          '<div class="wrap">' + emptyBox("？", "Không mở được bài học này",
            "Bài học có thể đã bị gỡ. Bạn quay lại danh sách nhé.") +
          '<div style="text-align:center"><button class="btn btn-ghost" id="lvBack2">← Về danh sách</button></div></div>';
        document.getElementById("lvBack2").onclick = LessonView.close;
        return;
      }
      if (window.Track) Track.setLesson(L);
      host.innerHTML = shell();
      document.getElementById("lvBack").onclick = LessonView.close;

      const panes = { vocab: "#paneVocab", grammar: "#paneGrammar", text: "#paneText" };
      if (L.phon) panes.phon = "#panePhon";
      if (L.activity) panes.act = "#paneAct";
      if (L.review) panes.rev = "#paneRev";
      (L.extra || []).forEach((x, i) => { panes["x" + i] = "#panex" + i; });
      const built = { vocab: true };
      buildVocab();
      host.querySelectorAll("#lvTabs button").forEach((b) => {
        b.onclick = () => {
          const key = b.dataset.p;
          host.querySelectorAll("#lvTabs button").forEach((x) => x.classList.toggle("on", x === b));
          for (const k in panes) $(panes[k]).classList.toggle("on", k === key);
          if (!built[key]) {
            built[key] = true;
            if (key === "grammar") buildGrammar();
            else if (key === "text") buildText();
            else if (key === "phon") buildPhon();
            else if (key === "act") buildActivity();
            else if (key === "rev") buildReview();
            else if (/^x\d+$/.test(key)) buildExtra(+key.slice(1));
          }
          window.scrollTo({ top: 0, behavior: "smooth" });
        };
      });
      history.replaceState(null, "", "#" + id);
    },

    close() {
      const h = document.getElementById("viewLesson");
      const wasOpen = h && !h.hidden;
      if (window.Track) Track.clearLesson();
      timers.forEach((t) => clearInterval(t.id));
      timers = [];
      if (h) { h.hidden = true; h.innerHTML = ""; }
      L = null;
      history.replaceState(null, "", location.pathname + location.search);
      if (wasOpen) {
        window.scrollTo(0, 0);
        window.dispatchEvent(new CustomEvent("swmn:lesson-closed"));
      }
    },

    current: () => L
  };

  window.LessonView = LessonView;
})();
