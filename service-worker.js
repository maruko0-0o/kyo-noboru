const CACHE_NAME="kyo-noboru-v15";
const APP_SHELL=["./","./index.html","./manifest.webmanifest","./icon.svg","./icon-180.png","./icon-192.png","./icon-512.png","./climbing-mascot-actions-cutout-v2.png","./effort-gym-warm.png","./effort-gym-routes.png","./effort-gym-sage.png"];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener("message",event=>{
  if(event.data?.type==="SKIP_WAITING")self.skipWaiting();
});

self.addEventListener("push",event=>{
  const payload=event.data?.json()||{};
  event.waitUntil(self.registration.showNotification(payload.title||"今日、登る？",{
    body:payload.body||"共享日历有新的行程动态。",
    icon:"./icon-192.png",
    badge:"./icon-180.png",
    tag:payload.tag||"climb-calendar-update",
    renotify:false,
    data:{url:payload.url||"./"}
  }));
});

self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||"./",self.location.origin).href;
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(windows=>{
    const existing=windows.find(client=>client.url.startsWith(self.location.origin));
    return existing?existing.focus():clients.openWindow(target);
  }));
});

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  if(event.request.mode==="navigate"){
    event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put("./index.html",copy));return response}).catch(()=>caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
