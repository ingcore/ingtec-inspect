const CACHE_VERSION='ingtec-inspect-v2.5.38';
const APP_SHELL=[
  './',
  './index.html',
  './manifest.webmanifest',
  './INGTEC_Assets/app-platform.css',
  './INGTEC_Assets/app-platform.js',
  './INGTEC_Assets/app-registry.js',
  './INGTEC_Assets/app-shell.css',
  './INGTEC_Assets/app-shell.js',
  './INGTEC_Assets/hub-launcher.css',
  './INGTEC_Assets/hub-launcher.js',
  './INGTEC_Assets/calendar-zoom-timeline.css',
  './INGTEC_Assets/calendar-zoom-timeline.js',
  './INGTEC_Assets/collaboration-suite.css',
  './INGTEC_Assets/collaboration-suite.js',
  './INGTEC_Assets/daily-workspace.css',
  './INGTEC_Assets/daily-workspace.js',
  './INGTEC_Assets/finding-workspace.css',
  './INGTEC_Assets/finding-modal.css',
  './INGTEC_Assets/finding-workspace.js',
  './INGTEC_Assets/inspection-workspace.css',
  './INGTEC_Assets/inspection-workspace.js',
  './INGTEC_Assets/measure-workspace.css',
  './INGTEC_Assets/measure-workspace.js',
  './INGTEC_Assets/billing-workspace.css',
  './INGTEC_Assets/billing-workspace.js',
  './INGTEC_Assets/report-pdf.js',
  './INGTEC_Assets/ingtec-logo-light.svg',
  './INGTEC_Assets/ingtec-logo-dark.svg'
];
const APP_SHELL_PATHS=new Set(APP_SHELL.map(path=>new URL(path,self.location).pathname));
const APP_ENTRY_PATHS=new Set(['./','./index.html'].map(path=>new URL(path,self.location).pathname));

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_VERSION).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('ingtec-inspect-')&&key!==CACHE_VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    if(!APP_ENTRY_PATHS.has(url.pathname))return;
    event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(CACHE_VERSION).then(cache=>cache.put('./index.html',copy));return response;}).catch(()=>caches.match('./index.html')));
    return;
  }
  // Nur unveränderliche App-Shell-Dateien dürfen offline persistiert werden.
  // API-, Download- und personenbezogene Dokumentantworten bleiben außerhalb
  // des Cache und unterliegen damit ausschließlich den Serverregeln.
  if(!APP_SHELL_PATHS.has(url.pathname))return;
  // Versionierte Asset-URLs (zum Beispiel ?v=...) muessen offline weiterhin
  // die passende vorgecachte App-Shell-Datei aufloesen.
  const cachedAsset=caches.match(request,{ignoreSearch:true});
  event.respondWith(cachedAsset.then(cached=>cached||fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE_VERSION).then(cache=>cache.put(request,copy));}return response;})));
});
