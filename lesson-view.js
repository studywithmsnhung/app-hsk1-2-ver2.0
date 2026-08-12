/* =====================================================================
   lesson-view.js — Trình xem một bài học

   Cấu trúc TAB:
     Từ vựng ─┬ Bảng từ vựng   (STT · Hán tự · Pinyin · Hán Việt · Từ loại · Nghĩa · Ví dụ)
              ├ Bút thuận      (nét viết + phép cấu tạo chữ + câu chuyện nhớ chữ)
              ├ Flashcard
              ├ Ghép cặp
              └ Mở rộng
     Ngữ pháp   (tóm tắt · công thức · 2 ví dụ kèm lý do · bài tập)
     Bài khoá   (Hán tự · pinyin · nghĩa, có nút ẩn/hiện từng lớp)
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
     Cả thư viện lẫn dữ liệu nét viết của 348 chữ Hán trong 30 bài đều
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
      (L.extra || []).map((x, i) =>
        '<button data-p="x' + i + '">' + esc(x.label || "Phần thêm") + "</button>").join("") +
      "</div></div>" +

      '<div class="wrap">' +
      '<div class="pane on" id="paneVocab"></div>' +
      '<div class="pane" id="paneGrammar"></div>' +
      '<div class="pane" id="paneText"></div>' +
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
      '<button data-s="fc">Flashcard</button>' +
      '<button data-s="mg">Game ghép cặp</button>' +
      '<button data-s="ext">Từ vựng mở rộng</button>' +
      "</div>" +
      '<div class="pane on" id="vTbl"></div>' +
      '<div class="pane" id="vHz"></div>' +
      '<div class="pane" id="vFc"></div>' +
      '<div class="pane" id="vMg"></div>' +
      '<div class="pane" id="vExt"></div>';

    const panes = { tbl: "#vTbl", hz: "#vHz", fc: "#vFc", mg: "#vMg", ext: "#vExt" };
    const built = {};
    p.querySelectorAll("#vSub button").forEach((b) => {
      b.onclick = () => {
        p.querySelectorAll("#vSub button").forEach((x) => x.classList.toggle("on", x === b));
        for (const k in panes) $(panes[k]).classList.toggle("on", k === b.dataset.s);
        if (!built[b.dataset.s]) {
          built[b.dataset.s] = true;
          ({ hz: buildHanzi, fc: buildFlashcard, mg: buildMatch,
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
    box.innerHTML =
      '<div class="sec-title">Bảng từ vựng · ' + V.length + " từ</div>" +
      '<div class="tbl-scroll"><table class="vtbl"><thead><tr>' +
      "<th>STT</th><th>Hán tự</th><th>Pinyin</th><th>Hán Việt</th>" +
      "<th>Từ loại</th><th>Nghĩa</th><th>Ví dụ</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
      '<p class="hint" style="margin-top:9px">Kéo ngang bảng để xem đủ 7 cột.</p>';
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

    let html = '<div class="sec-title">Bút thuận &amp; cách nhớ chữ Hán · ' + H.length + " mục</div>" +
      '<div class="hz-grid">';
    H.forEach((h, i) => {
      const cs = charsOf(h);
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
        (h.story ? '<div class="hz-story"><b>Mẹo nhớ:</b> ' + esc(h.story) + "</div>" : "") +
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

  function buildFlashcard() {
    const V = (L.vocab || []).filter((v) => v.hanzi);
    const box = $("#vFc");
    if (!V.length) {
      box.innerHTML = emptyBox("卡", "Chưa có thẻ nào", "Bài này chưa nhập từ vựng.");
      return;
    }
    let deck = shuffle(V), i = 0;

    box.innerHTML =
      '<div class="sec-title">Flashcard · ' + V.length + " thẻ</div>" +
      '<div class="fc-stage">' +
      '<div class="fc-prog"><i id="fcProg"></i></div>' +
      '<div class="fc-card" id="fcCard"><div class="fc-inner">' +
      '<div class="fc-face fc-front"><div class="big zh" id="fcZh"></div>' +
      '<div class="tip">Bấm vào thẻ để lật</div></div>' +
      '<div class="fc-face fc-back" id="fcBack"></div>' +
      "</div></div>" +
      '<div class="fc-bar">' +
      '<button class="btn btn-ghost btn-sm" id="fcPrev">← Trước</button>' +
      '<span class="fc-count" id="fcCount"></span>' +
      '<button class="btn btn-primary btn-sm" id="fcNext">Sau →</button>' +
      "</div>" +
      '<div class="fc-bar">' +
      '<button class="btn btn-soft btn-sm" id="fcShuffle">🔀 Trộn lại</button>' +
      "</div></div>";

    const card = $("#fcCard");
    function draw() {
      const v = deck[i];
      card.classList.remove("flip");
      $("#fcZh").textContent = v.hanzi;
      const ex = v.example || {};
      $("#fcBack").innerHTML =
        '<div class="py">' + esc(v.pinyin || "") + "</div>" +
        (v.hanviet ? '<div class="hv">' + esc(v.hanviet) + "</div>" : "") +
        (v.pos ? '<div class="pos">' + esc(v.pos) + "</div>" : "") +
        '<div class="mean">' + esc(v.meaning || "") + "</div>" +
        (ex.zh ? '<div class="ex zh">' + esc(ex.zh) + "</div>" : "");
      $("#fcCount").textContent = i + 1 + " / " + deck.length;
      $("#fcProg").style.width = ((i + 1) / deck.length) * 100 + "%";
    }
    card.onclick = () => card.classList.toggle("flip");
    $("#fcNext").onclick = () => { i = (i + 1) % deck.length; draw(); };
    $("#fcPrev").onclick = () => { i = (i - 1 + deck.length) % deck.length; draw(); };
    $("#fcShuffle").onclick = () => { deck = shuffle(V); i = 0; draw(); toast("Đã trộn lại bộ thẻ", "ok"); };
    draw();
  }

  function buildMatch() {
    const V = (L.vocab || []).filter((v) => v.hanzi && v.meaning);
    const box = $("#vMg");
    if (V.length < 3) {
      box.innerHTML = emptyBox("配", "Chưa đủ từ để chơi", "Cần ít nhất 3 từ có nghĩa tiếng Việt.");
      return;
    }
    const SIZE = 6;
    let pool = [], round = 0, sel = null, done = 0, wrong = 0, startAt = 0, wrongAtStart = 0;

    function newRound() {
      pool = shuffle(V).slice(0, Math.min(SIZE, V.length));
      sel = null; done = 0; startAt = Date.now(); wrongAtStart = wrong;
      const left = shuffle(pool), right = shuffle(pool);
      $("#mgL").innerHTML = left
        .map((v) => '<button class="mg-tile zh" data-k="' + esc(v.hanzi) + '" data-side="l">' + esc(v.hanzi) + "</button>")
        .join("");
      $("#mgR").innerHTML = right
        .map((v) => '<button class="mg-tile" data-k="' + esc(v.hanzi) + '" data-side="r">' + esc(v.meaning) + "</button>")
        .join("");
      $("#mgDone").textContent = "0";
      $("#mgTotal").textContent = pool.length;
      bindTiles();
    }

    function bindTiles() {
      box.querySelectorAll(".mg-tile").forEach((t) => {
        t.onclick = () => {
          if (t.classList.contains("done")) return;
          if (!sel) {
            box.querySelectorAll(".mg-tile.sel").forEach((x) => x.classList.remove("sel"));
            t.classList.add("sel");
            sel = t;
            return;
          }
          if (sel === t) { t.classList.remove("sel"); sel = null; return; }
          if (sel.dataset.side === t.dataset.side) {
            box.querySelectorAll(".mg-tile.sel").forEach((x) => x.classList.remove("sel"));
            t.classList.add("sel");
            sel = t;
            return;
          }
          const a = sel, b = t;
          if (a.dataset.k === b.dataset.k) {
            [a, b].forEach((x) => { x.classList.remove("sel"); x.classList.add("ok"); });
            setTimeout(() => [a, b].forEach((x) => { x.classList.remove("ok"); x.classList.add("done"); }), 340);
            done++;
            $("#mgDone").textContent = done;
            if (done === pool.length) setTimeout(win, 480);
          } else {
            [a, b].forEach((x) => { x.classList.remove("sel"); x.classList.add("no"); });
            wrong++;
            $("#mgWrong").textContent = wrong;
            setTimeout(() => [a, b].forEach((x) => x.classList.remove("no")), 380);
          }
          sel = null;
        };
      });
    }

    function win() {
      round++;
      const secs = Math.round((Date.now() - startAt) / 1000);
      const missed = wrong - wrongAtStart;
      logGame("match", {
        right: pool.length,
        total: pool.length,
        wrong: missed,
        secs: secs,
        xp: 0,
        lessonId: L.id
      });
      $("#mgArea").innerHTML =
        '<div class="mg-win"><div class="ic">🎉</div>' +
        "<h3>Ghép đúng hết rồi!</h3>" +
        "<p>" + pool.length + " cặp trong " + secs + " giây · sai " + missed + " lần</p>" +
        '<button class="btn btn-primary" id="mgAgain">Chơi lượt nữa</button></div>';
      $("#mgAgain").onclick = () => { paint(); newRound(); };
    }

    function paint() {
      $("#mgArea").innerHTML =
        '<div class="mg-grid"><div class="mg-col" id="mgL"></div><div class="mg-col" id="mgR"></div></div>';
    }

    box.innerHTML =
      '<div class="sec-title">Game ghép cặp</div>' +
      '<div class="mg-bar">' +
      '<span class="mg-stat">Đã ghép <b id="mgDone">0</b>/<b id="mgTotal">0</b></span>' +
      '<span class="mg-stat">Sai <b id="mgWrong">0</b></span>' +
      '<span style="flex:1"></span>' +
      '<button class="btn btn-soft btn-sm" id="mgNew">Lượt mới</button>' +
      "</div>" +
      '<div id="mgArea"></div>' +
      '<p class="hint" style="margin-top:10px">Bấm một chữ Hán bên trái rồi bấm nghĩa đúng bên phải.</p>';

    $("#mgNew").onclick = () => { paint(); newRound(); };
    paint();
    newRound();
  }

  /* Ghi lại kết quả một lượt chơi vào hồ sơ học sinh */
  const logGame = (kind, info) => {
    if (window.Track && Track.game) Track.game(kind, info);
  };

  function buildExt() {
    const E = L.vocabExt || [];
    const box = $("#vExt");
    if (!E.length) {
      box.innerHTML = emptyBox("展", "Chưa có từ vựng mở rộng", "Phần này dành cho các từ cùng chủ đề với bài.");
      return;
    }
    let html = '<div class="sec-title">Từ vựng mở rộng theo chủ đề</div>';
    E.forEach((g) => {
      html +=
        '<div class="ext-block"><div class="ext-head"><span class="dot"></span>' +
        esc(g.topic || "Chủ đề") + "</div><div class=\"ext-grid\">" +
        (g.items || [])
          .map((it) =>
            '<div class="ext-item"><div class="hz zh">' + esc(it.hanzi) + "</div>" +
            '<div class="py">' + esc(it.pinyin || "") + "</div>" +
            '<div class="mn">' + esc(it.meaning || "") + "</div></div>")
          .join("") +
        "</div></div>";
    });
    box.innerHTML = html;
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
      (blk.lines || []).forEach((l) => {
        body.appendChild(el("div", { class: "dlg-line" },
          (l.speaker ? '<span class="dlg-sp">' + esc(l.speaker) + "</span>" : "") +
          '<div class="dlg-body">' +
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
