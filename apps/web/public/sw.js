// 오제로의 거울 — 푸시 안테나 (블럭 8-1)
// 서버가 보낸 저녁 질문 푸시를 받아 알림으로 보여주고, 누르면 /today 로 연다.
// 알림은 두 종류뿐 (지시서 5번) — 재촉·마케팅·축하 알림은 만들지 않는다.
self.addEventListener("push", (event) => {
  let data = { title: "오제로의 거울", body: "오늘의 기록 시간이 열렸어요.", url: "/today" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // 형식이 달라도 기본 문구로 보여준다
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag || "ozero-evening", // 같은 태그면 중복 알림이 쌓이지 않는다
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/today";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
