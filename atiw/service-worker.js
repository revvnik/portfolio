// SPDX-License-Identifier: AGPL-3.0-or-later

const prefix = "atiw-johnny-";
const cacheName = prefix + "v2";
const root = new URL(self.registration.scope);
const shell = new URL("./index.html", root).href;
const assets = new Set([
  "./index.html", "./style.css", "./app.js", "./machine.js", "./diagram.js",
  "./icons.svg", "./johnny.webmanifest", "./icons/app-192.png", "./icons/app-512.png"
].map((path) => new URL(path, root).href));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll([...assets])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith(prefix) && key !== cacheName).map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const launch = request.mode === "navigate" && url.origin === root.origin && url.pathname === root.pathname;
  if (!launch && !assets.has(url.href)) return;
  event.respondWith(load(request, launch ? shell : url.href));
});

async function load(request, cacheKey) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(cacheKey, response.clone());
    return response;
  } catch {
    return (await cache.match(cacheKey)) || Response.error();
  }
}
