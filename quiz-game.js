/* =====================================================================
   quiz-game.js — Trò chơi "chọn nghĩa đúng" dùng cho TAB Flashcard Buddy

   Trước đây phần này nằm bên trong từng bài học (TAB Từ vựng → Trắc nghiệm
   nghĩa). Nay tách riêng thành một trình chơi dùng chung: đưa vào bộ từ nào
   thì chơi bộ đó — một bài, hay gộp cả giáo trình.

   Cách dùng:  QuizGame.mount(hộpChứa, { vocab: [...], label: "...", lessonId: "" })

   Có XP · combo · chuỗi ngày, và KHÔNG hiện pinyin dưới chữ Hán
   (học sinh phải tự nhớ cách đọc).
   ===================================================================== */

(function () {
  "use strict";

  const { esc, el, shuffle } = UI;

  /* Thời gian chờ trước khi tự chuyển câu (mili giây) */
  const AUTO_OK = 1100;   // trả lời đúng
  const AUTO_NO = 2600;   // trả lời sai — cần thời gian đọc đáp án đúng

  const XP_PER_CORRECT = 20;
  const XP_PER_LESSON = 80;
  const XP_MAX = 480;

  const xpFallback = { xp: 0, streak: 0 };
  const progOf = () => (window.Track && Track.ready && Track.ready() ? Track.get() : xpFallback);
  const addXp = (n) => {
    if (window.Track && Track.ready && Track.ready()) Track.addXp(n);
    else xpFallback.xp += n;
  };
  const logGame = (kind, info) => { if (window.Track && Track.game) Track.game(kind, info); };

  /* Số câu mỗi lượt: ít nhất 8, nhiều nhất 20 */
  const calcTotal = (list) => Math.min(20, Math.max(8, list.length * 2));

  /* Bỏ từ trùng (cùng chữ Hán + cùng nghĩa) khi gộp nhiều bài */
  function dedupe(list) {
    const seen = {};
    return list.filter((v) => {
      const k = v.hanzi + "|" + v.meaning;
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    });
  }

  function mascotOf(list, titleZh) {
    const src = titleZh || (list[0] && list[0].hanzi) || "汉";
    return src.replace(/[^㐀-鿿]/g, "")[0] || "汉";
  }

  function mount(box, opts) {
    opts = opts || {};
    const V0 = dedupe((opts.vocab || []).filter((v) => v.hanzi && v.meaning));

    if (V0.length < 4) {
      box.innerHTML =
        '<div class="empty"><div class="empty-icon zh">测</div>' +
        "<h3>Chưa đủ từ để chơi</h3>" +
        "<p>Cần ít nhất 4 từ có nghĩa tiếng Việt thì mới đủ 4 đáp án cho mỗi câu.</p></div>";
      return;
    }

    const V = V0;
    const srcLabel = opts.label || "bộ từ này";
    const TOTAL = calcTotal(V);
    let deck = [], i = 0, picked = null, isRight = false, combo = 1, right = 0, wrong = 0;
    let autoTimer = null;

    function newDeck() {
      const pool = [];
      while (pool.length < TOTAL) pool.push(...shuffle(V));
      deck = pool.slice(0, TOTAL).map((item) => {
        const others = shuffle(
          V.map((x) => x.meaning).filter((m, k, a) => m !== item.meaning && a.indexOf(m) === k)
        ).slice(0, 3);
        return {
          term: item.hanzi,
          correct: item.meaning,
          choices: shuffle([item.meaning, ...others])
        };
      });
    }

    box.innerHTML =
      '<div class="sec-title" id="qgTitle">Chọn nghĩa đúng · ' + TOTAL + " câu · " + esc(srcLabel) + "</div>" +
      '<div class="qg">' +

      '<div class="qg-head">' +
      '<div class="qg-xp"><div class="qg-xp-row">' +
      '<span>Điểm kinh nghiệm</span><span id="qgXpTxt">0 / ' + XP_MAX + " XP</span>" +
      '</div><div class="qg-xp-track"><div class="qg-xp-bar" id="qgXpBar"></div></div></div>' +
      '<div class="qg-streak" title="Số ngày học liên tiếp">' +
      '<span class="qg-flame"></span><span id="qgStreak">0</span></div>' +
      "</div>" +

      '<div class="qg-lesson"><div>' +
      '<p class="brand">studywithmsnhung</p>' +
      '<p class="prompt">Chọn nghĩa đúng</p></div>' +
      '<div class="qg-mascot-wrap"><div class="qg-mascot zh" id="qgMascot">' +
      esc(mascotOf(V, opts.titleZh)) + "</div></div></div>" +

      '<div class="qg-panel">' +
      '<div class="qg-top">' +
      '<span class="qg-combo"><span class="qg-spark"></span><span id="qgCombo">Combo x1</span></span>' +
      '<span style="flex:1"></span>' +
      '<span class="qg-progress" id="qgProg">1 / ' + TOTAL + "</span>" +
      "</div>" +

      '<div class="qg-card" id="qgCard">' +
      '<p class="lbl">Từ mới</p>' +
      '<div class="qg-term zh" id="qgTerm"></div>' +
      "</div>" +

      '<div class="qg-answers" id="qgAns"></div>' +
      '<div class="qg-fb" id="qgFb" aria-live="polite"></div>' +
      '<div class="qg-auto" id="qgAuto"><i></i></div>' +
      "</div></div>" +

      '<div class="qg-reward" id="qgReward"><div class="qg-reward-box">' +
      '<div class="qg-confetti" id="qgConf"></div>' +
      '<div class="qg-trophy">🏆</div>' +
      '<h3 id="qgRwTitle">Tuyệt vời!</h3>' +
      '<p id="qgRwMsg"></p>' +
      '<div class="qg-stats">' +
      '<div class="qg-stat s1"><p class="l">Điểm</p><p class="v" id="qgRwScore">0</p></div>' +
      '<div class="qg-stat s2"><p class="l">XP</p><p class="v" id="qgRwXp">+0</p></div>' +
      '<div class="qg-stat s3"><p class="l">Chuỗi ngày</p><p class="v" id="qgRwStreak">0</p></div>' +
      "</div>" +
      '<div class="qg-reward-acts">' +
      '<button class="btn btn-ghost" id="qgClose">Đóng</button>' +
      '<button class="btn btn-primary" id="qgAgain">Chơi lượt nữa</button>' +
      "</div></div></div>";

    const q = (id) => box.querySelector("#" + id);

    function paintXp() {
      const prog = progOf();
      const xp = prog.xp || 0;
      q("qgXpTxt").textContent = Math.min(xp, XP_MAX) + " / " + XP_MAX + " XP";
      q("qgXpBar").style.width = Math.min(100, (xp / XP_MAX) * 100) + "%";
      q("qgStreak").textContent = prog.streak || 0;
    }

    function clearFb() {
      const n = q("qgFb");
      n.className = "qg-fb";
      n.innerHTML = "";
    }

    function draw() {
      picked = null; isRight = false;
      clearTimeout(autoTimer);
      q("qgAuto").classList.remove("on");
      clearFb();
      const c = deck[i];
      const t = q("qgTerm");
      t.textContent = c.term;
      t.classList.toggle("small", c.term.length > 3);
      q("qgProg").textContent = i + 1 + " / " + deck.length;

      const ans = q("qgAns");
      ans.innerHTML = "";
      c.choices.forEach((ch) => {
        const b = el("button", { class: "qg-opt" },
          '<span class="txt">' + esc(ch) + '</span><span class="qg-mark"></span>');
        b.onclick = () => choose(b, ch, c);
        ans.appendChild(b);
      });
    }

    function choose(btn, ch, card) {
      if (picked) return;
      picked = ch;
      isRight = ch === card.correct;

      btn.classList.add(isRight ? "ok" : "no", isRight ? "qg-pop" : "qg-wiggle");
      const ans = q("qgAns");
      [...ans.children].forEach((n) => {
        n.disabled = true;
        if (!isRight && n.querySelector(".txt").textContent === card.correct) n.classList.add("ok");
      });

      if (!isRight) combo = 1;
      q("qgCombo").textContent = "Combo x" + combo;

      const fb = q("qgFb");
      fb.className = "qg-fb on " + (isRight ? "ok" : "no");
      fb.innerHTML =
        '<div class="qg-fb-row"><span class="qg-fb-ic"></span><div>' +
        '<p class="qg-fb-t">' + (isRight ? "Chính xác!" : "Chưa đúng") + "</p>" +
        '<p class="qg-fb-d">Bạn chọn: <b>' + esc(ch) + "</b></p>" +
        (isRight ? "" : '<p class="qg-fb-d">Đáp án đúng: <b>' + esc(card.correct) + "</b></p>") +
        '<p class="qg-fb-d zh">' + esc(card.term) + "</p>" +
        "</div></div>";

      /* Tự chuyển sang câu tiếp theo — đúng thì đi nhanh, sai thì để lâu hơn
         một chút cho học sinh kịp đọc đáp án đúng. */
      const wait = isRight ? AUTO_OK : AUTO_NO;
      const bar = q("qgAuto");
      bar.style.setProperty("--dur", wait + "ms");
      bar.classList.add("on");
      clearTimeout(autoTimer);
      autoTimer = setTimeout(next, wait);
    }

    function confetti() {
      const host = q("qgConf");
      const colors = ["#8B1E28", "#D9A875", "#A6712F", "#FBEAE6", "#3F8F5F"];
      host.innerHTML = "";
      for (let k = 0; k < 32; k++) {
        const s = el("i");
        s.style.left = Math.random() * 100 + "%";
        s.style.top = Math.random() * 18 + "%";
        s.style.background = colors[k % colors.length];
        s.style.animationDelay = Math.random() * 0.45 + "s";
        host.appendChild(s);
      }
    }

    function finish() {
      const before = progOf().streak || 0;
      logGame("quiz", {
        right: right, total: deck.length, wrong: wrong,
        xp: XP_PER_LESSON, label: srcLabel, lessonId: opts.lessonId || ""
      });
      const prog = progOf();
      if (!window.Track) prog.xp = (prog.xp || 0) + XP_PER_LESSON;
      const gained = (prog.streak || 0) > before;
      paintXp();
      q("qgRwTitle").textContent = right === deck.length ? "Hoàn hảo!" : "Tuyệt vời!";
      q("qgRwMsg").textContent =
        "Bạn đúng " + right + "/" + deck.length + " câu của " + srcLabel +
        ". Cộng thêm " + XP_PER_LESSON + " XP." + (gained ? " Chuỗi ngày học vừa dài thêm 1!" : "");
      q("qgRwScore").textContent = right + "/" + deck.length;
      q("qgRwXp").textContent = "+" + (right * XP_PER_CORRECT + XP_PER_LESSON);
      q("qgRwStreak").textContent = prog.streak || 1;
      confetti();
      q("qgReward").classList.add("on");
    }

    function next() {
      clearTimeout(autoTimer);
      q("qgAuto").classList.remove("on");
      if (!picked) return;
      if (isRight) { right++; combo++; addXp(XP_PER_CORRECT); paintXp(); }
      else wrong++;
      i++;
      const card = q("qgCard");
      card.classList.add("qg-pop");
      setTimeout(() => card.classList.remove("qg-pop"), 360);
      if (i >= deck.length) return finish();
      q("qgCombo").textContent = "Combo x" + combo;
      draw();
    }

    function restart() {
      clearTimeout(autoTimer);
      i = 0; combo = 1; right = 0; wrong = 0; picked = null;
      q("qgCombo").textContent = "Combo x1";
      q("qgReward").classList.remove("on");
      newDeck();
      draw();
    }

    q("qgAgain").onclick = restart;
    q("qgClose").onclick = () => q("qgReward").classList.remove("on");
    /* Không muốn chờ hết thanh thời gian thì bấm vào ô câu hỏi để đi tiếp ngay */
    q("qgCard").onclick = () => { if (picked) next(); };
    /* Rời khỏi TAB thì huỷ hẹn giờ, tránh nhảy câu khi không ai xem */
    box.addEventListener("swmn:unmount", () => clearTimeout(autoTimer));

    paintXp();
    newDeck();
    draw();
  }

  window.QuizGame = { mount, dedupe };
})();
