const CACHE_VERSION='ingtec-inspect-v2.5.50';
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
  './INGTEC_Assets/compliance-workspace.css',
  './INGTEC_Assets/compliance-workspace.js',
  './INGTEC_Assets/bsb-workspace.css',
  './INGTEC_Assets/bsb-workspace.js',
  './INGTEC_Assets/email-workspace.css',
  './INGTEC_Assets/email-workspace.js',
  './INGTEC_Assets/report-pdf.js',
  './INGTEC_Assets/ingtec-logo-light.svg',
  './INGTEC_Assets/ingtec-logo-dark.svg'
];
const APP_SHELL_PATHS=new Set(APP_SHELL.map(path=>new URL(path,self.location).pathname));
const APP_ENTRY_PATHS=new Set(['./','./index.html'].map(path=>new URL(path,self.location).pathname));

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_VERSION).then(async cache=>{
    await Promise.all(APP_SHELL.map(async path=>{
      const request=new Request(new URL(path,self.location).href,{cache:'reload'});
      const response=await fetch(request);
      if(!response.ok)throw new Error(`Unable to precache ${path}: ${response.status}`);
      await cache.put(request,response);
    }));
  }).then(()=>self.skipWaiting()));
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
  // Versionierte Asset-URLs brauchen eigene Cache-Eintraege, damit ein neuer
  // Build nicht versehentlich eine aeltere Datei mit demselben Pfad erhaelt.
  const cachedAsset=caches.match(request);
  event.respondWith(cachedAsset.then(cached=>cached||fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE_VERSION).then(cache=>cache.put(request,copy));}return response;})));
});
