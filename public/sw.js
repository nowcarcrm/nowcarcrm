self.addEventListener("push", function (event) {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.message || "새로운 알림이 있습니다",
    icon: "/images/nowcar-logo.svg",
    badge: "/images/nowcar-logo.svg",
    tag: data.id || "default",
    data: { url: data.url || "/" },
    vibrate: [200, 100, 200],
    requireInteraction: true,
  };

  event.waitUntil(self.registration.showNotification(data.title || "나우카 CRM", options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if (client.url.includes("localhost:3000") && "focus" in client) {
          client.focus();
          if ("navigate" in client) return client.navigate(url);
          return client;
        }
      }
      return clients.openWindow(url);
    })
  );
});
