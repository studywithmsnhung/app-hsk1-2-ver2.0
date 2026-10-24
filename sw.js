/* =====================================================================
   sw.js — Service worker: tải sẵn toàn bộ app để dùng offline.

   ⚠ MỖI LẦN SỬA FILE RỒI UPLOAD LẠI, hãy đổi số CACHE bên dưới
     (v1 → v2 → v3…) thì máy học sinh mới nhận bản mới.
   ===================================================================== */

const CACHE = "swmn-hs-v13";

/* Mọi thứ cần cho app chạy khi không có mạng */
const FILES = [
  "./",
  "index.html",
  "app.js",
  "main.js",
  "lesson-view.js",
  "data-css.js",
  "data-hsk1.js",
  "data-hsk2.js",
  "data-ext-hsk2v2.js",
  "data-hsk1v3.js",
  "data-ext-hsk1v3.js",
  "data-hsk2v3.js",
  "data-ext-hsk2v3.js",
  "data-hsk3v3.js",
  "data-ext-hsk3v3.js",
  "data-ext.js",
  "quiz-game.js",
  "hw-lib.js",
  "hw-data.js",
  "manifest.webmanifest",
  "favicon.png",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      /* Tải thẳng từ máy chủ (bỏ qua bộ nhớ đệm trình duyệt / GitHub Pages, thêm ?v=…)
         để bản mới không bị lẫn file cũ — lỗi khiến bản v9 có máy chỉ hiện tới HSK2. */
      .then((c) => Promise.all(FILES.map((f) =>
        fetch(new Request(f + (f.endsWith("/") ? "" : "?v=" + CACHE), { cache: "reload" }))
          .then((res) => (res && res.ok ? c.put(f, res) : null))
          .catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  /* Font Google: dùng bản đã lưu trước, đồng thời lặng lẽ tải bản mới */
  if (url.hostname.endsWith("googleapis.com") || url.hostname.endsWith("gstatic.com")) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  if (url.origin !== location.origin) return;

  /* File của app: lấy trong máy trước cho nhanh, không có mới ra mạng */
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match("index.html"));
    })
  );
});
