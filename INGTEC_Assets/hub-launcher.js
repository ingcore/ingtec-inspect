/* INGTEC Hub Launcher
   Eine bewusst leichte Vanilla-Ergaenzung: Der Hub startet vorhandene
   Fachbereiche ueber die bestehenden Routing- und Berechtigungsfunktionen.
   Er besitzt keine eigene Rollenlogik und speichert ausschliesslich persoenliche
   Bedienpraeferenzen, niemals Fach- oder Freigabedaten. */
(() => {
  'use strict';

  const VERSION='2.0.0';
  const registry=window.INGTECAppRegistry;
  if(!registry){
    window.console?.error?.('INGTEC App Registry fehlt; der App Hub wurde nicht gestartet.');
    return;
  }
  const PREFS_PREFIX='ingtecHub.preferences.v1';
  const PREFS_VERSION=4;
  const MAX_FAVORITES=12;
  const MAX_RECENT=6;
  // Der Hub besitzt bewusst keine eigene App-Liste mehr. Alle Einträge stammen
  // aus derselben Registry wie Router, Sidebar und App-Switcher.
  const GROUPS=registry.GROUPS.slice();
  const APPS=registry.hubApps();
  const COMING_SOON=registry.comingSoonApps();
  const APP_BY_ID=new Map(APPS.map(app=>[app.id,app]));
  const COLLAB_AREAS=registry.COLLAB_AREAS;
  let root=null;
  let activeFilter='all';
  let tileDrag=null;
  let keyboardTile=null;
  let tileClickBlock=null;
  const volatileTileOrders=new Map();

  const text=value=>String(value??'').trim();
  const escapeHtml=value=>text(value).replace(/[&<>'"]/g,character=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[character]));
  const unique=(items,limit)=>[...new Set((Array.isArray(items)?items:[]).filter(Boolean))].slice(0,limit);
  const canonicalAppId=value=>{
    try{return text(registry.normalizeAppId(value))||text(value);}catch(error){return text(value);}
  };
  const normalizeAppIds=(items,limit)=>unique((Array.isArray(items)?items:[]).map(canonicalAppId),limit).filter(id=>APP_BY_ID.has(id));
  const initials=value=>text(value).split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'IN';
  const defaultTileOrder=()=>APPS.map(app=>app.id);
  const normalizeTileOrder=items=>{
    const known=new Set(defaultTileOrder());
    const selected=normalizeAppIds(items,APPS.length).filter(id=>known.has(id));
    return [...selected,...defaultTileOrder().filter(id=>!selected.includes(id))];
  };

  function currentState(){
    try{return typeof state==='object'&&state?state:null;}catch(error){return null;}
  }
  function activeAccount(){
    try{return typeof window.activeUserAccount==='function'?window.activeUserAccount():null;}catch(error){return null;}
  }
  function accountRole(account){
    if(!account)return 'Lokale Auswahl';
    try{
      if(account.accessRole&&typeof window.accessRoleInfo==='function')return text(window.accessRoleInfo(account.accessRole)?.label)||text(account.role)||'Lokaler Zugang';
    }catch(error){}
    return text(account.role)||text(account.accessRole)||'Lokaler Zugang';
  }
  function preferenceKey(){
    const account=activeAccount();
    return PREFS_PREFIX+'.'+encodeURIComponent(text(account?.id)||'guest');
  }
  function readPreferences(){
    let saved={};
    const key=preferenceKey();
    try{saved=JSON.parse(window.localStorage?.getItem(preferenceKey())||'{}')||{};}catch(error){saved={};}
    return {
      version:PREFS_VERSION,
      favorites:normalizeAppIds(saved.favorites,MAX_FAVORITES),
      recent:normalizeAppIds(saved.recent,MAX_RECENT),
      tileOrder:normalizeTileOrder(volatileTileOrders.get(key)||saved.tileOrder),
      lastAppId:canonicalAppId(saved.lastAppId)&&APP_BY_ID.has(canonicalAppId(saved.lastAppId))?canonicalAppId(saved.lastAppId):'',
      updatedAt:text(saved.updatedAt)
    };
  }
  function writePreferences(next){
    const normalized={
      version:PREFS_VERSION,
      favorites:normalizeAppIds(next?.favorites,MAX_FAVORITES),
      recent:normalizeAppIds(next?.recent,MAX_RECENT),
      tileOrder:normalizeTileOrder(next?.tileOrder),
      lastAppId:canonicalAppId(next?.lastAppId)&&APP_BY_ID.has(canonicalAppId(next?.lastAppId))?canonicalAppId(next?.lastAppId):'',
      updatedAt:new Date().toISOString()
    };
    const key=preferenceKey();
    let persisted=false;
    try{
      const storage=window.localStorage;
      if(!storage)throw new Error('Lokaler Speicher ist nicht verfügbar.');
      const serialized=JSON.stringify(normalized);
      storage.setItem(key,serialized);
      persisted=storage.getItem(key)===serialized;
    }catch(error){}
    if(persisted)volatileTileOrders.delete(key);else volatileTileOrders.set(key,normalized.tileOrder);
    return {...normalized,persisted};
  }
  function orderedApps(apps,prefs){
    const positions=new Map(normalizeTileOrder(prefs?.tileOrder).map((id,index)=>[id,index]));
    return [...apps].sort((left,right)=>(positions.get(left.id)??Number.MAX_SAFE_INTEGER)-(positions.get(right.id)??Number.MAX_SAFE_INTEGER));
  }
  function hasCustomTileOrder(prefs){return normalizeTileOrder(prefs?.tileOrder).join('|')!==defaultTileOrder().join('|');}
  function customerReleased(){
    const report=currentState()?.report;
    return report?.status==='Finalisiert'&&Boolean(report?.customerReleasedAt);
  }
  function appAvailability(app){
    return registry.appAvailability(app);
  }
  function accessibleApps(){return APPS.filter(app=>appAvailability(app).visible);}
  function appIcon(kind){
    const icons={
      search:'<circle cx="10.5" cy="10.5" r="5.8"/><path d="m15 15 4.2 4.2"/>',
      dashboard:'<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/>',
      orders:'<path d="M5 6.5h14v13H5z"/><path d="M8 3.5h8v4H8zM8 11h8M8 15h5"/>',
      objects:'<path d="M4 20V6l8-3 8 3v14"/><path d="M8 20v-6h8v6M8 9h.01M12 9h.01M16 9h.01"/>',
      inspection:'<circle cx="12" cy="12" r="8.5"/><path d="m8.4 12.1 2.3 2.3 4.9-5"/>',
      findings:'<path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17.2v.1"/>',
      measures:'<path d="M5.5 3.5h13v17h-13z"/><path d="m8.5 8 1.4 1.4L12.5 6.8M8.5 14 9.9 15.4l2.6-2.6M14.5 9h2M14.5 15h2"/>',
      reports:'<path d="M6 3.5h9l3 3V20.5H6z"/><path d="M15 3.5v4h3M9 12h6M9 16h6"/>',
      score:'<path d="M4 19V10M10 19V5M16 19v-7M21 19H3"/><path d="m4 8 5-3 5 3 6-5"/>',
      plan:'<path d="M4 5.5 9 3l6 2.5L20 3v15.5L15 21l-6-2.5-5 2.5z"/><path d="M9 3v15.5M15 5.5V21"/>',
      calendar:'<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01"/>',
      activity:'<path d="M6 9.5a6 6 0 0 1 12 0v4.2l2 3H4l2-3z"/><path d="M10 20h4M12 3.5v1"/>',
      chats:'<path d="M4 5.5h16v11H9l-5 4v-15Z"/><path d="M8 10h8M8 13h5"/>',
      teams:'<circle cx="9" cy="8" r="2.7"/><circle cx="16.5" cy="9.5" r="2.1"/><path d="M3.8 20c.7-3.4 2.6-5.2 5.2-5.2s4.5 1.8 5.2 5.2M14.5 15.5c2.7.1 4.6 1.5 5.3 4.5"/>',
      meetings:'<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M12 12.5v4l2.5 1.5"/>',
      tasks:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 2.5 2.5L16 9"/>',
      files:'<path d="M3.5 7h6l1.8 2H20.5v10.5h-17z"/><path d="M3.5 7V5.5h6l1.8 2"/>',
      web:'<circle cx="12" cy="12" r="8.5"/><path d="M3.8 12h16.4M12 3.5c2.2 2.3 3.2 5.1 3.2 8.5S14.2 18.2 12 20.5c-2.2-2.3-3.2-5.1-3.2-8.5S9.8 5.8 12 3.5Z"/>',
      knowledge:'<path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v17H7.5A3.5 3.5 0 0 0 4 22V5.5Z"/><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H12v17h4.5A3.5 3.5 0 0 1 20 22V5.5Z"/>',
      wiki:'<path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
      documents:'<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9 12h6M9 16h6"/>',
      ai:'<path d="M12 3.5 14 8l4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2z"/><path d="m18.5 15 .8 1.7L21 17.5l-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z"/>',
      quality:'<path d="m12 3 7.5 3v5.2c0 4.6-3 7.7-7.5 9.8-4.5-2.1-7.5-5.2-7.5-9.8V6z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
      profiles:'<circle cx="12" cy="8" r="3"/><path d="M5 20c.8-3.5 3.1-5.3 7-5.3s6.2 1.8 7 5.3"/>',
      settings:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.3 3h-4.6l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4.6l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z"/>',
      contacts:'<circle cx="9" cy="9" r="3"/><path d="M3.8 20c.7-3.1 2.5-4.7 5.2-4.7s4.5 1.6 5.2 4.7M16 8h5M18.5 5.5v5"/>',
      offers:'<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5M8 16h4"/>',
      billing:'<path d="M5 3.5h14v17L16.5 19 14 20.5 11.5 19 9 20.5 5 18z"/><path d="M8 8h8M8 12h6M8 16h4"/>',
      compliance:'<path d="M8 3.5h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21.5H8A1.5 1.5 0 0 1 6.5 20V5A1.5 1.5 0 0 1 8 3.5Z"/><path d="M9.5 3.5h5v2h-5z"/><path d="m8.5 12.5 2 2 4-4.5M8.5 17h6"/>',
      academy:'<path d="m3 9 9-4 9 4-9 4z"/><path d="M6 11.5V16c2.5 2.5 9.5 2.5 12 0v-4.5M21 10v5"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(icons[kind]||icons.dashboard)+'</svg>';
  }
  function knownPages(){
    const pages=new Set(['documents','customer','testprofiles']);
    try{if(Array.isArray(nav))nav.forEach(item=>pages.add(item[0]));}catch(error){}
    return pages;
  }
  const initialNavSignature=(()=>{try{return Array.isArray(nav)?nav.map(item=>item[0]).join('|'):'';}catch(error){return '';}})();

  function buildRoot(){
    if(root)return root;
    root=document.createElement('section');
    root.id='ingtecHub';
    root.className='ingtec-hub';
    root.hidden=true;
    root.tabIndex=-1;
    root.setAttribute('aria-label','INGTEC App-Auswahl');
    root.innerHTML='<div class="ingtec-hub-shell"><header class="ingtec-hub-topbar"><div class="ingtec-hub-brand"><div class="ingtec-hub-mark" aria-hidden="true">I</div><div class="ingtec-hub-brand-copy"><strong>INGTEC</strong><small>APP HUB</small></div></div><label class="ingtec-hub-search"><span class="sr-only">Apps durchsuchen</span>'+appIcon('search')+'<input id="ingtecHubSearch" type="search" autocomplete="off" placeholder="Apps durchsuchen …"></label><div class="ingtec-hub-account" data-hub-account></div></header><main><section class="ingtec-hub-intro"><div><span class="ingtec-hub-eyebrow">Arbeitsumgebung</span><h1 data-hub-welcome>Willkommen zurück, woran arbeiten wir heute</h1><p>Starte genau dort, wo du weiterarbeiten möchtest. Deine Fachbereiche, Rollenrechte und lokalen Arbeitsstände bleiben unverändert erhalten.</p></div><span class="ingtec-hub-status"><i aria-hidden="true"></i>Lokal verfügbar</span></section><section class="ingtec-hub-recent" data-hub-recent hidden></section><div data-hub-content></div><footer class="ingtec-hub-footnote">'+appIcon('quality')+'<span><b>Geschützte Auswahl:</b> Der Hub startet ausschließlich vorhandene Fachbereiche über die bestehende Berechtigungsprüfung. Nicht konfigurierte Integrationen bleiben getrennt und nicht startbar.</span></footer></main></div>';
    document.body.appendChild(root);
    const reorderStatus=document.createElement('div');
    reorderStatus.className='sr-only';
    reorderStatus.dataset.hubReorderStatus='true';
    reorderStatus.setAttribute('role','status');
    reorderStatus.setAttribute('aria-live','polite');
    root.appendChild(reorderStatus);
    root.querySelector('#ingtecHubSearch')?.addEventListener('input',renderHub);
    root.querySelector('#ingtecHubSearch')?.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&event.currentTarget.value){event.currentTarget.value='';renderHub();}
    });
    root.addEventListener('click',event=>{
      if(consumeBlockedTileClick(event))return;
      const control=event.target.closest('[data-hub-action]');
      if(!control)return;
      const id=text(control.dataset.hubApp);
      if(control.dataset.hubAction==='reset-order'){
        resetTileOrder();
        return;
      }
      if(control.dataset.hubAction==='filter'){
        activeFilter=text(control.dataset.hubFilter)||'all';
        renderHub();
        return;
      }
      if(control.dataset.hubAction==='favorite'){
        toggleFavorite(id);
        return;
      }
      if(control.dataset.hubAction==='launch')launch(id);
    });
    root.addEventListener('pointerdown',beginTileDrag);
    root.addEventListener('pointermove',moveTileDrag);
    root.addEventListener('pointerup',finishTileDrag);
    root.addEventListener('pointercancel',cancelTileDrag);
    root.addEventListener('lostpointercapture',cancelTileDrag);
    window.addEventListener('pointerup',finishTileDrag,true);
    window.addEventListener('pointercancel',cancelTileDrag,true);
    window.addEventListener('blur',()=>cancelTileDrag());
    root.addEventListener('keydown',handleTileKeyboard);
    return root;
  }
  function renderAccount(){
    const target=root?.querySelector('[data-hub-account]');
    if(!target)return;
    const account=activeAccount();
    const name=text(account?.name)||'Lokale Auswahl';
    const firstName=text(account?.name).split(/\s+/)[0];
    const welcome=root?.querySelector('[data-hub-welcome]');
    if(welcome)welcome.textContent=firstName?'Willkommen zurück, '+firstName+', woran arbeiten wir heute':'Willkommen zurück, woran arbeiten wir heute';
    target.innerHTML='<div class="ingtec-hub-account-copy"><strong>'+escapeHtml(name)+'</strong><small>'+escapeHtml(accountRole(account))+'</small></div><span class="ingtec-hub-avatar" aria-hidden="true">'+escapeHtml(initials(name))+'</span>';
  }
  function appMatches(app,query){
    const needle=text(query).toLocaleLowerCase('de');
    if(!needle)return true;
    return [app.code,app.name,app.description,app.group].join(' ').toLocaleLowerCase('de').includes(needle);
  }
  function cardMarkup(app,prefs,options={}){
    const availability=appAvailability(app);
    const favorite=prefs.favorites.includes(app.id);
    const locked=!availability.launchable;
    const reorderable=Boolean(options.reorderable&&availability.launchable);
    const stateClass=availability.stateClass||'';
    const action=locked?'disabled aria-disabled="true"':'data-hub-action="launch" data-hub-app="'+escapeHtml(app.id)+'"';
    const position=Math.max(1,Number(options.position)||1);
    const total=Math.max(position,Number(options.total)||position);
    const dragHandle=reorderable?'<button type="button" class="ingtec-hub-drag-handle" data-hub-drag-handle data-hub-app="'+escapeHtml(app.id)+'" aria-pressed="false" aria-label="'+escapeHtml(app.name)+' verschieben, Position '+position+' von '+total+'" title="Kachel verschieben · Pfeiltasten oder Ziehen">'+
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="6" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/></svg></button>':'';
    return '<article class="ingtec-hub-card '+(reorderable?'is-reorderable ':'')+(locked?'is-locked ':'')+stateClass+'" data-hub-order-tile="'+escapeHtml(app.id)+'"'+(reorderable?' data-hub-tile="'+escapeHtml(app.id)+'"':'')+'>'+dragHandle+
      '<button type="button" class="ingtec-hub-favorite" data-hub-action="favorite" data-hub-app="'+escapeHtml(app.id)+'" aria-pressed="'+String(favorite)+'" aria-label="'+escapeHtml(app.name)+' '+(favorite?'nicht mehr':'als')+' favorisieren">'+(favorite?'★':'☆')+'</button>'+
      '<button type="button" class="ingtec-hub-launch" '+action+' aria-label="'+escapeHtml(app.name)+(locked?', derzeit nicht verfügbar':' öffnen')+'">'+
        '<span class="ingtec-hub-card-head"><span class="ingtec-hub-icon">'+appIcon(app.icon)+'</span><span class="ingtec-hub-code">'+escapeHtml(app.code)+'</span></span>'+
        '<h3>'+escapeHtml(app.name)+'</h3><p>'+escapeHtml(app.description)+'</p>'+
        '<span class="ingtec-hub-card-footer"><span class="ingtec-hub-card-state '+(locked?'is-locked':'')+'">'+escapeHtml(availability.reason)+'</span><span class="ingtec-hub-arrow" aria-hidden="true">'+(locked?'—':'→')+'</span></span>'+
      '</button></article>';
  }
  function comingCardMarkup(app){
    return '<article class="ingtec-hub-card is-coming" aria-disabled="true"><button type="button" class="ingtec-hub-launch" disabled aria-label="'+escapeHtml(app.name)+', in Vorbereitung"><span class="ingtec-hub-card-head"><span class="ingtec-hub-icon">'+appIcon(app.icon)+'</span><span class="ingtec-hub-code">'+escapeHtml(app.code)+'</span></span><h3>'+escapeHtml(app.name)+'</h3><p>'+escapeHtml(app.description)+'</p><span class="ingtec-hub-card-footer"><span class="ingtec-hub-card-state is-coming">In Vorbereitung</span><span class="ingtec-hub-arrow" aria-hidden="true">—</span></span></button></article>';
  }
  function sectionMarkup(group,apps,prefs,options={}){
    if(!apps.length)return '';
    const reorderable=Boolean(options.reorderable);
    const sortableApps=reorderable?apps.filter(app=>appAvailability(app).launchable):[];
    let sortablePosition=0;
    return '<section class="ingtec-hub-section"><div class="ingtec-hub-section-head"><div><h2>'+escapeHtml(group.label)+'</h2><p>'+escapeHtml(group.description)+'</p></div><span class="ingtec-hub-count">'+apps.length+'</span></div><div class="ingtec-hub-grid" data-hub-reorder="'+String(reorderable)+'">'+apps.map((app,index)=>{
      const cardReorderable=reorderable&&appAvailability(app).launchable;
      return cardMarkup(app,prefs,{reorderable:cardReorderable,position:cardReorderable?++sortablePosition:index+1,total:cardReorderable?sortableApps.length:apps.length});
    }).join('')+'</div></section>';
  }
  function renderRecent(apps,prefs){
    const recent=root?.querySelector('[data-hub-recent]');
    if(!recent)return;
    const allowed=new Set(apps.map(app=>app.id));
    const entries=prefs.recent.map(id=>APP_BY_ID.get(id)).filter(app=>app&&allowed.has(app.id)&&appAvailability(app).launchable).slice(0,3);
    if(!entries.length){recent.hidden=true;recent.innerHTML='';return;}
    recent.hidden=false;
    recent.innerHTML=entries.map(app=>'<button type="button" class="ingtec-hub-recent-card" data-hub-action="launch" data-hub-app="'+escapeHtml(app.id)+'" aria-label="'+escapeHtml(app.name)+' erneut öffnen"><span class="ingtec-hub-recent-icon">'+appIcon(app.icon)+'</span><span class="ingtec-hub-recent-copy"><b>'+escapeHtml(app.name)+'</b><small>Zuletzt geöffnet · '+escapeHtml(app.code)+'</small></span></button>').join('');
  }
  function renderHub(){
    buildRoot();
    renderAccount();
    const content=root.querySelector('[data-hub-content]');
    const search=root.querySelector('#ingtecHubSearch');
    if(!content)return;
    const query=text(search?.value);
    const prefs=readPreferences();
    const apps=orderedApps(accessibleApps(),prefs);
    if(activeFilter!=='all'&&activeFilter!=='favorites'&&!GROUPS.some(group=>group.id===activeFilter))activeFilter='all';
    renderRecent(apps,prefs);
    const filters=[{id:'all',label:'Alle Apps'},...GROUPS];
    if(prefs.favorites.some(id=>apps.some(app=>app.id===id)))filters.push({id:'favorites',label:'Favoriten'});
    const reorderable=activeFilter==='all'&&!query;
    const reorderHint=reorderable?'Kacheln mit der Maus ziehen; auf Touch-Geräten den Griff verwenden. Mit Pfeiltasten sortieren.':'Für die Sortierung Suche löschen und „Alle Apps“ wählen.';
    const reset=hasCustomTileOrder(prefs)?'<button type="button" class="ingtec-hub-reset-order" data-hub-action="reset-order">Standardreihenfolge</button>':'';
    let output='<div class="ingtec-hub-toolbar"><div class="ingtec-hub-filter-list" role="group" aria-label="App-Bereiche">'+filters.map(filter=>'<button type="button" class="ingtec-hub-filter" data-hub-action="filter" data-hub-filter="'+escapeHtml(filter.id)+'" aria-pressed="'+String(activeFilter===filter.id)+'">'+escapeHtml(filter.label)+'</button>').join('')+'</div><div class="ingtec-hub-toolbar-meta"><small>'+apps.length+' erreichbare '+(apps.length===1?'App':'Apps')+' für dieses Profil</small><small class="ingtec-hub-reorder-hint">'+escapeHtml(reorderHint)+'</small>'+reset+'</div></div>';
    const matches=apps.filter(app=>appMatches(app,query));
    if(activeFilter==='all'){
      output+=sectionMarkup({label:'Meine Apps',description:'Ordne die startbaren Fachbereiche nach deinem persönlichen Arbeitsablauf.'},matches,prefs,{reorderable});
    }else if(activeFilter==='favorites'){
      const favorites=matches.filter(app=>prefs.favorites.includes(app.id));
      output+=sectionMarkup({label:'Favoriten',description:'Deine bevorzugten Fachbereiche.'},favorites,prefs);
    }else{
      GROUPS.filter(group=>activeFilter===group.id).forEach(group=>{
        output+=sectionMarkup(group,matches.filter(app=>app.group===group.id),prefs);
      });
    }
    if(!matches.length)output+='<section class="ingtec-hub-section"><div class="ingtec-hub-empty"><b>Keine passende App gefunden.</b>Ändere den Suchbegriff oder wähle einen anderen Bereich.</div></section>';
    const coming=COMING_SOON.filter(app=>activeFilter==='all'&&appMatches(app,query));
    if(coming.length)output+='<section class="ingtec-hub-section"><div class="ingtec-hub-section-head"><div><h2>Demnächst</h2><p>Diese Ziele sind noch nicht an diese lokale Anwendung angebunden.</p></div></div><div class="ingtec-hub-grid">'+coming.map(comingCardMarkup).join('')+'</div></section>';
    content.innerHTML=output;
  }
  function toggleFavorite(id){
    const app=APP_BY_ID.get(id);
    if(!app||!appAvailability(app).visible)return;
    const prefs=readPreferences();
    const favorites=prefs.favorites.includes(id)?prefs.favorites.filter(item=>item!==id):[id,...prefs.favorites];
    writePreferences({...prefs,favorites});
    renderHub();
  }
  function announceReorder(message){
    const status=root?.querySelector('[data-hub-reorder-status]');
    if(!status)return;
    status.textContent='';
    window.requestAnimationFrame(()=>{status.textContent=message;});
  }
  function draggableCards(grid){return grid?[...grid.querySelectorAll('[data-hub-tile]')]:[];}
  function orderedCards(grid){return grid?[...grid.querySelectorAll('[data-hub-order-tile]')]:[];}
  function tileName(card){return text(card?.querySelector('h3')?.textContent)||'Kachel';}
  function reorderGridFor(card){
    const grid=card?.closest('.ingtec-hub-grid[data-hub-reorder="true"]');
    return grid&&root?.contains(grid)?grid:null;
  }
  function updateTilePositions(grid){
    const cards=draggableCards(grid);
    cards.forEach((card,index)=>{
      const handle=card.querySelector('[data-hub-drag-handle]');
      if(handle)handle.setAttribute('aria-label',tileName(card)+' verschieben, Position '+(index+1)+' von '+cards.length);
    });
  }
  function restoreTileNodes(state){
    if(!state?.grid||!Array.isArray(state.initialNodes))return;
    state.initialNodes.forEach(node=>state.grid.appendChild(node));
    updateTilePositions(state.grid);
  }
  function persistTileGridOrder(grid){
    const visibleIds=orderedCards(grid).map(card=>text(card.dataset.hubOrderTile)).filter(id=>APP_BY_ID.has(id));
    if(!visibleIds.length)return {persisted:false,order:[]};
    const prefs=readPreferences();
    const affected=new Set(visibleIds);
    const replacement=[...visibleIds];
    const tileOrder=normalizeTileOrder(prefs.tileOrder).map(id=>affected.has(id)?replacement.shift():id);
    return writePreferences({...prefs,tileOrder});
  }
  function resetTileOrder(){
    const result=writePreferences({...readPreferences(),tileOrder:defaultTileOrder()});
    announceReorder(result.persisted?'Standardreihenfolge wiederhergestellt.':'Standardreihenfolge nur für diese Sitzung wiederhergestellt.');
    renderHub();
  }
  function cleanPointerDrag(){
    const state=tileDrag;
    if(!state)return;
    state.card?.classList.remove('is-dragging');
    state.dropTarget?.classList.remove('is-drop-target');
    state.ghost?.remove();
    document.body.classList.remove('ingtec-hub-tile-dragging');
    tileDrag=null;
    try{if(state.captureTarget?.hasPointerCapture?.(state.pointerId))state.captureTarget.releasePointerCapture(state.pointerId);}catch(error){}
  }
  function blockTileClick(card){
    tileClickBlock=card;
    window.setTimeout(()=>{if(tileClickBlock===card)tileClickBlock=null;},0);
  }
  function consumeBlockedTileClick(event){
    if(!tileClickBlock)return false;
    const card=event.target.closest?.('[data-hub-tile]');
    if(card!==tileClickBlock)return false;
    tileClickBlock=null;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
  function activatePointerDrag(state,event){
    state.started=true;
    // Pointer Capture erst nach der Drag-Schwelle setzen. Wird es bereits beim
    // einfachen Maus-Klick gesetzt, retargetet Chromium den anschließenden
    // Click auf den Hub-Root statt auf die App-Schaltfläche.
    try{state.captureTarget?.setPointerCapture(state.pointerId);}catch(error){}
    state.card.classList.add('is-dragging');
    const ghost=state.card.cloneNode(true);
    ghost.classList.remove('is-dragging','is-drop-target','is-keyboard-dragging');
    ghost.classList.add('ingtec-hub-tile-drag-ghost');
    ghost.removeAttribute('data-hub-tile');
    ghost.setAttribute('aria-hidden','true');
    ghost.querySelectorAll('button').forEach(button=>button.tabIndex=-1);
    ghost.style.width=state.rect.width+'px';
    ghost.style.height=state.rect.height+'px';
    document.body.appendChild(ghost);
    state.ghost=ghost;
    document.body.classList.add('ingtec-hub-tile-dragging');
    announceReorder(tileName(state.card)+' wird verschoben.');
    positionPointerGhost(state,event);
  }
  function positionPointerGhost(state,event){
    if(!state.ghost)return;
    state.ghost.style.left=(event.clientX-state.offsetX)+'px';
    state.ghost.style.top=(event.clientY-state.offsetY)+'px';
  }
  function pointerBeforeTarget(state,event,target){
    const sourceRect=state.rect||state.card.getBoundingClientRect();
    const targetRect=target.getBoundingClientRect();
    const targetCenterX=targetRect.left+targetRect.width/2;
    const targetCenterY=targetRect.top+targetRect.height/2;
    const sourceCenterY=sourceRect.top+sourceRect.height/2;
    const draggedCenterX=event.clientX-state.offsetX+sourceRect.width/2;
    const draggedCenterY=event.clientY-state.offsetY+sourceRect.height/2;
    const sameRow=Math.abs(sourceCenterY-targetCenterY)<Math.max(8,Math.min(sourceRect.height,targetRect.height)*.45);
    return sameRow?draggedCenterX<targetCenterX:draggedCenterY<targetCenterY;
  }
  function commitTileDrop(state){
    const target=state?.dropTarget;
    if(!state?.grid||!state.card||!target||target===state.card||!state.grid.contains(target)||!state.grid.contains(state.card))return false;
    if(state.dropBefore)target.before(state.card);else target.after(state.card);
    updateTilePositions(state.grid);
    return true;
  }
  function tileAtPointer(state,event){
    const pointed=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-hub-order-tile]');
    if(pointed)return pointed.closest('.ingtec-hub-grid')===state.grid?pointed:null;
    const gridRect=state.grid.getBoundingClientRect();
    const withinGrid=event.clientX>=gridRect.left&&event.clientX<=gridRect.right&&event.clientY>=gridRect.top&&event.clientY<=gridRect.bottom;
    if(!withinGrid)return null;
    return orderedCards(state.grid).filter(card=>card!==state.card).reduce((nearest,card)=>{
      if(!nearest)return card;
      const nearestRect=nearest.getBoundingClientRect();
      const cardRect=card.getBoundingClientRect();
      const nearestDistance=Math.hypot(event.clientX-(nearestRect.left+nearestRect.width/2),event.clientY-(nearestRect.top+nearestRect.height/2));
      const cardDistance=Math.hypot(event.clientX-(cardRect.left+cardRect.width/2),event.clientY-(cardRect.top+cardRect.height/2));
      return cardDistance<nearestDistance?card:nearest;
    },null);
  }
  function beginTileDrag(event){
    const handle=event.target.closest('[data-hub-drag-handle]');
    const launchControl=event.target.closest('.ingtec-hub-launch');
    const card=handle?.closest('[data-hub-tile]')||launchControl?.closest('[data-hub-tile]');
    const canDragCard=!handle&&event.pointerType==='mouse'&&Boolean(launchControl);
    if((!handle&&!canDragCard)||!card||!root?.contains(card)||(event.pointerType==='mouse'&&event.button!==0))return;
    const grid=reorderGridFor(card);
    if(!card||!grid)return;
    if(keyboardTile)cancelKeyboardTile();
    if(tileDrag)cancelTileDrag();
    const rect=card.getBoundingClientRect();
    const captureTarget=root;
    tileDrag={pointerId:event.pointerId,captureTarget,card,grid,rect,originX:event.clientX,originY:event.clientY,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top,started:false,initialNodes:[...grid.children],dropTarget:null,dropBefore:false,ghost:null};
    if(handle)event.preventDefault();
  }
  function moveTileDrag(event){
    const state=tileDrag;
    if(!state||event.pointerId!==state.pointerId)return;
    const moved=Math.hypot(event.clientX-state.originX,event.clientY-state.originY);
    if(!state.started&&moved<7)return;
    if(!state.started)activatePointerDrag(state,event);
    event.preventDefault();
    positionPointerGhost(state,event);
    const target=tileAtPointer(state,event);
    if(!target||target===state.card||target.closest('.ingtec-hub-grid')!==state.grid){
      state.dropTarget?.classList.remove('is-drop-target');
      state.dropTarget=null;
      state.dropBefore=false;
      return;
    }
    state.dropTarget?.classList.remove('is-drop-target');
    state.dropTarget=target;
    state.dropBefore=pointerBeforeTarget(state,event,target);
    target.classList.add('is-drop-target');
  }
  function finishTileDrag(event){
    const state=tileDrag;
    if(!state||event.pointerId!==state.pointerId)return;
    const moved=state.started&&commitTileDrop(state);
    cleanPointerDrag();
    if(!state.started)return;
    blockTileClick(state.card);
    if(!moved){announceReorder(tileName(state.card)+' blieb an seiner bisherigen Position.');return;}
    const result=persistTileGridOrder(state.grid);
    const position=draggableCards(state.grid).indexOf(state.card)+1;
    announceReorder(tileName(state.card)+' ist jetzt an Position '+position+'. '+(result.persisted?'Reihenfolge gespeichert.':'Reihenfolge gilt nur für diese Sitzung.'));
  }
  function cancelTileDrag(event){
    const state=tileDrag;
    if(!state||event?.pointerId&&event.pointerId!==state.pointerId)return;
    if(state.started){restoreTileNodes(state);announceReorder('Verschieben abgebrochen.');}
    cleanPointerDrag();
  }
  function startKeyboardTile(handle){
    const card=handle.closest('[data-hub-tile]');
    const grid=reorderGridFor(card);
    if(!card||!grid)return false;
    if(tileDrag)cancelTileDrag();
    if(keyboardTile&&keyboardTile.handle!==handle)cancelKeyboardTile();
    keyboardTile={handle,card,grid,initialNodes:[...grid.children]};
    card.classList.add('is-keyboard-dragging');
    handle.setAttribute('aria-pressed','true');
    announceReorder(tileName(card)+' aufgenommen. Mit den Pfeiltasten verschieben, mit Eingabe ablegen oder Escape abbrechen.');
    return true;
  }
  function finishKeyboardTile(save=true){
    const state=keyboardTile;
    if(!state)return;
    if(save){
      const result=persistTileGridOrder(state.grid);
      const position=draggableCards(state.grid).indexOf(state.card)+1;
      announceReorder(tileName(state.card)+' ist jetzt an Position '+position+'. '+(result.persisted?'Reihenfolge gespeichert.':'Reihenfolge gilt nur für diese Sitzung.'));
    }
    state.card.classList.remove('is-keyboard-dragging');
    state.handle.setAttribute('aria-pressed','false');
    keyboardTile=null;
  }
  function cancelKeyboardTile(){
    const state=keyboardTile;
    if(!state)return;
    restoreTileNodes(state);
    state.card.classList.remove('is-keyboard-dragging');
    state.handle.setAttribute('aria-pressed','false');
    keyboardTile=null;
    announceReorder('Verschieben abgebrochen.');
  }
  function moveKeyboardTile(direction){
    const state=keyboardTile;
    if(!state)return;
    const cards=draggableCards(state.grid);
    const current=cards.indexOf(state.card);
    let destination=current;
    if(direction==='start')destination=0;
    else if(direction==='end')destination=cards.length-1;
    else destination=Math.max(0,Math.min(cards.length-1,current+direction));
    if(destination===current)return;
    const target=cards[destination];
    if(destination<current)target.before(state.card);else target.after(state.card);
    updateTilePositions(state.grid);
    announceReorder(tileName(state.card)+' an Position '+(destination+1)+' von '+cards.length+'.');
  }
  function handleTileKeyboard(event){
    const handle=event.target.closest('[data-hub-drag-handle]');
    if(!handle||!root?.contains(handle))return;
    const isCurrent=keyboardTile?.handle===handle;
    if([' ','Enter'].includes(event.key)){
      event.preventDefault();event.stopPropagation();
      if(isCurrent)finishKeyboardTile(true);else startKeyboardTile(handle);
      return;
    }
    if(event.key==='Escape'&&isCurrent){event.preventDefault();event.stopPropagation();cancelKeyboardTile();return;}
    if(!isCurrent)return;
    const directions={ArrowLeft:-1,ArrowUp:-1,ArrowRight:1,ArrowDown:1,Home:'start',End:'end'};
    if(!(event.key in directions))return;
    event.preventDefault();event.stopPropagation();
    moveKeyboardTile(directions[event.key]);
  }
  function setHubUrl(open,replace){
    const url=new URL(window.location.href);
    if(open)url.searchParams.set('hub','1');else url.searchParams.delete('hub');
    const method=replace?'replaceState':'pushState';
    try{window.history[method]({ingtecHub:Boolean(open)},'',url.href);}catch(error){}
  }
  function isHubRequested(){
    const url=new URL(window.location.href);
    if(url.searchParams.get('hub')==='1')return true;
    const target=text(window.location.hash).replace(/^#/,'').replace(/^\/+/,'');
    if(target==='hub'||target==='apps')return true;
    if(url.searchParams.get('qa')==='1'||[...url.searchParams.keys()].some(key=>/test|diagnostic/i.test(key)))return false;
    return !target||target==='dashboard';
  }
  function collaborationAreaFromUrl(){
    try{
      const area=text(new URL(window.location.href).searchParams.get('collab'));
      return COLLAB_AREAS.has(area)?area:'';
    }catch(error){return '';}
  }
  function collaborationAppForArea(area){
    const app=registry.appFor('teamarbeit');
    const navigation=registry.collaborationNavigationForArea(area);
    return app&&navigation?{...app,name:navigation.label,collabArea:navigation.collabArea}:null;
  }
  function syncLaunchTitle(app){
    if(!app?.collabArea||text(window.location.hash).replace(/^#/,'')!=='chats')return;
    const title=document.getElementById('pageTitle');
    if(title)title.textContent=app.name;
  }
  function blockingDialogOpen(){return Boolean(document.querySelector('.modal-backdrop,.measure-drawer-backdrop'));}
  function appShell(){return document.querySelector('.app');}
  function isOpen(){return Boolean(root&&!root.hidden);}
  function openHub(options={}){
    buildRoot();
    if(blockingDialogOpen()){
      window.showToast?.('Schließe zuerst den geöffneten Dialog, bevor du zu den Apps wechselst.',null,null,'error');
      return false;
    }
    renderHub();
    const app=appShell();
    if(app){app.hidden=true;app.setAttribute('aria-hidden','true');}
    root.hidden=false;
    root.removeAttribute('aria-hidden');
    document.body.classList.add('ingtec-hub-open');
    if(options.history!==false)setHubUrl(true,Boolean(options.replace));
    window.requestAnimationFrame(()=>root.querySelector('#ingtecHubSearch')?.focus({preventScroll:true}));
    return true;
  }
  function closeHub(options={}){
    if(!root)return;
    root.hidden=true;
    root.setAttribute('aria-hidden','true');
    const app=appShell();
    if(app){app.hidden=false;app.removeAttribute('aria-hidden');}
    document.body.classList.remove('ingtec-hub-open');
    if(options.history!==false)setHubUrl(false,Boolean(options.replace));
  }
  function afterLaunch(app){
    if(app.afterOpen==='inspection-plan'){
      window.setTimeout(()=>document.getElementById('inspectionPlanStage')?.scrollIntoView({behavior:'smooth',block:'center'}),180);
    }
    if(app.afterOpen==='ingmind'&&typeof window.openIngMindAssistant==='function')window.setTimeout(()=>window.openIngMindAssistant(),120);
  }
  function prepareLaunch(app){
    if(!app.collabArea)return;
    const selectArea=()=>{
      if(typeof window.collabSetArea!=='function')return false;
      window.collabSetArea(app.collabArea);
      return true;
    };
    // Die Collaboration Suite bleibt eine gemeinsame Daten- und Berechtigungsgrenze.
    // Jede Hub-Kachel setzt nur ihren eigenen Startbereich, bevor die bestehende
    // Chats-Route geoeffnet wird.
    if(!selectArea())window.setTimeout(selectArea,0);
  }
  function launch(id){
    const app=APP_BY_ID.get(id);
    if(!app)return false;
    const availability=appAvailability(app);
    if(!availability.launchable){window.showToast?.(availability.reason,null,null,'error');return false;}
    const prefs=readPreferences();
    writePreferences({...prefs,recent:[id,...prefs.recent.filter(item=>item!==id)],lastAppId:id});
    closeHub({history:false});
    if(typeof window.INGTECAppShell?.navigate==='function'){
      return Boolean(window.INGTECAppShell.navigate(app,registry.defaultNavigation(app)?.id,{history:true,focus:true}));
    }
    const url=new URL(window.location.href);
    url.searchParams.delete('hub');
    if(app.collabArea)url.searchParams.set('collab',app.collabArea);else url.searchParams.delete('collab');
    url.hash=app.page;
    try{window.history.pushState({ingtecHubApp:id},'',url.href);}catch(error){}
    prepareLaunch(app);
    if(typeof window.setPage==='function')window.setPage(app.page);
    if(!knownPages().has(app.page))return false;
    window.requestAnimationFrame(()=>{
      if(app.collabArea)syncLaunchTitle(app);
      else if(!navPage(app.page)){
        const title=document.getElementById('pageTitle');
        if(title)title.textContent=app.name;
      }
      afterLaunch(app);
    });
    return true;
  }
  function navPage(page){
    try{return Array.isArray(nav)&&nav.some(item=>item[0]===page);}catch(error){return false;}
  }
  function mountReturnButton(){
    const header=document.querySelector('.app>main>header');
    if(!header||header.querySelector('#ingtecHubReturn'))return;
    const button=document.createElement('button');
    button.id='ingtecHubReturn';
    button.type='button';
    button.className='hub-return-button';
    button.title='Apps wechseln';
    button.setAttribute('aria-label','Apps wechseln');
    button.innerHTML=appIcon('dashboard')+'<span class="hub-return-label">Apps</span>';
    button.addEventListener('click',()=>openHub());
    const mobileSearch=header.querySelector('#workspaceMobileSearch');
    if(mobileSearch)header.insertBefore(button,mobileSearch);else header.prepend(button);
  }
  function runHubTests(){
    const pages=knownPages();
    const currentSignature=(()=>{try{return Array.isArray(nav)?nav.map(item=>item[0]).join('|'):'';}catch(error){return '';}})();
    const collaborationAreas=[...COLLAB_AREAS];
    const teamwork=registry.appFor('teamarbeit');
    const collaborationNavigation=teamwork?.navigation?.filter(item=>item.collabArea)||[];
    const normalizedOrder=normalizeTileOrder(['orders','unbekannt','orders']);
    const hostileOrder=normalizeTileOrder([...Array(APPS.length+4).fill('unbekannt'),'orders']);
    const rectCard=(left,top,width=100,height=200)=>({getBoundingClientRect:()=>({left,top,width,height})});
    const pointerState=(left,top,width=100,height=200)=>({card:rectCard(left,top,width,height),rect:{left,top,width,height},offsetX:width/2,offsetY:height/2});
    const horizontalDrop=!pointerBeforeTarget(pointerState(0,0),{clientX:180,clientY:100},rectCard(120,0))&&pointerBeforeTarget(pointerState(120,0),{clientX:40,clientY:100},rectCard(0,0));
    const verticalDrop=!pointerBeforeTarget(pointerState(0,0),{clientX:50,clientY:340},rectCard(0,220))&&pointerBeforeTarget(pointerState(0,220),{clientX:50,clientY:60},rectCard(0,0));
    const reorderFixture=document.createElement('div');
    reorderFixture.innerHTML='<article data-hub-tile="one"></article><article data-hub-tile="two"></article><article data-hub-tile="three"></article>';
    const fixtureCards=draggableCards(reorderFixture);
    const committedDrop=commitTileDrop({grid:reorderFixture,card:fixtureCards[0],dropTarget:fixtureCards[1],dropBefore:false});
    const committedOrder=draggableCards(reorderFixture).map(card=>card.dataset.hubTile).join('|');
    const lockedSlotFixture=document.createElement('div');
    lockedSlotFixture.innerHTML='<article data-hub-tile="one" data-hub-order-tile="one"></article><article data-hub-order-tile="locked"></article><article data-hub-tile="two" data-hub-order-tile="two"></article>';
    const lockedSlotDrop=commitTileDrop({grid:lockedSlotFixture,card:lockedSlotFixture.querySelector('[data-hub-tile="one"]'),dropTarget:lockedSlotFixture.querySelector('[data-hub-order-tile="locked"]'),dropBefore:false});
    const lockedSlotOrder=orderedCards(lockedSlotFixture).map(card=>card.dataset.hubOrderTile).join('|');
    const tests=[
      {name:'Hub-Startauswahl ist eingebunden',passed:Boolean(document.getElementById('ingtecHub')&&typeof window.openIngtecHub==='function')},
      {name:'Hub-Registry verweist nur auf vorhandene App-Ziele',passed:APPS.every(app=>pages.has(app.page))},
      {name:'Hub und Shell verwenden dieselbe zentrale App-Registry',passed:APPS.every(app=>registry.appFor(app.id)===app)},
      {name:'Teamarbeit bündelt alle sechs Collaboration-Bereiche',passed:collaborationNavigation.length===collaborationAreas.length&&collaborationAreas.every(area=>collaborationNavigation.filter(item=>item.collabArea===area&&item.page==='chats').length===1)},
      {name:'Teamarbeit besitzt einen stabilen Startkontext je Bereich',passed:collaborationNavigation.every(item=>COLLAB_AREAS.has(item.collabArea)&&registry.routeFor(teamwork,item.id).includes('/app/teamarbeit/'))},
      {name:'Prüfungen, Befundungen und Maßnahmen bleiben als Fach-Apps registriert',passed:['pruefungen','befundungen','massnahmen'].every(id=>APP_BY_ID.has(id))},
      {name:'Die bestehende Fachseitenliste bleibt als Kompatibilitätsschicht erhalten',passed:Boolean(initialNavSignature)&&currentSignature===initialNavSignature},
      {name:'Hub-Präferenzen bleiben vom Fachdatensatz getrennt',passed:preferenceKey().startsWith(PREFS_PREFIX+'.')&&!preferenceKey().includes('ingtecEnterprise')},
      {name:'Persönliche Kachelreihenfolge wird sicher normalisiert',passed:normalizedOrder[0]==='auftraege'&&hostileOrder[0]==='auftraege'&&normalizedOrder.length===APPS.length&&new Set(normalizedOrder).size===APPS.length},
      {name:'Kachel-Sortierung hat einen zugänglichen Griff',passed:cardMarkup(APPS[0],readPreferences(),{reorderable:true,position:1,total:APPS.length}).includes('data-hub-drag-handle')},
      {name:'Kachel-Sortierung erhält sichtbare Sperr-Slots',passed:cardMarkup(APPS[0],readPreferences(),{reorderable:true,position:1,total:APPS.length}).includes('data-hub-order-tile')},
      {name:'Kachel-Sortierung erkennt Rasterrichtungen unabhängig vom Griff',passed:horizontalDrop&&verticalDrop},
      {name:'Kachel-Drop wird erst beim Loslassen ins Raster geschrieben',passed:committedDrop&&committedOrder==='two|one|three'},
      {name:'Sichtbare Sperr-Slots bleiben als Rasterposition nutzbar',passed:lockedSlotDrop&&lockedSlotOrder==='locked|one|two'},
      {name:'Einfacher Kachel-Klick bleibt vom Dragging getrennt',passed:!String(beginTileDrag).includes('setPointerCapture')&&String(activatePointerDrag).includes('setPointerCapture')},
      {name:'Kundenportal bleibt bis zur Kundenfreigabe gesperrt',passed:APP_BY_ID.get('kundenportal')?.requiresCustomerRelease===true},
      {name:'Rücksprung zur App-Auswahl ist verfügbar',passed:Boolean(document.getElementById('ingtecHubReturn'))}
    ];
    return {passed:tests.every(test=>test.passed),tests,runAt:new Date().toISOString()};
  }

  buildRoot();
  mountReturnButton();
  const baseRender=window.renderAll;
  if(typeof baseRender==='function')window.renderAll=function(){
    const result=baseRender.apply(this,arguments);
    mountReturnButton();
    if(isOpen())renderHub();
    return result;
  };
  window.addEventListener('popstate',event=>{
    if(isHubRequested())openHub({history:false});
    else {
      closeHub({history:false});
      const routed=registry.resolve(window.location);
      // Der App-Shell-Router hat diesen Kontext bereits angewendet. Der Hub
      // darf eine kanonische /app-Route nicht wieder als alte Seiten-ID lesen.
      if(routed.kind==='app')return;
      const target=text(window.location.hash).replace(/^#/,'');
      const app=APP_BY_ID.get(text(event.state?.ingtecHubApp));
      const collaborationApp=collaborationAppForArea(collaborationAreaFromUrl())||(app?.collabArea?app:null);
      if(target==='chats')prepareLaunch(collaborationApp||{collabArea:collaborationAreaFromUrl()});
      if(target&&target!=='hub'&&typeof window.setPage==='function')window.setPage(target);
      if(collaborationApp)window.requestAnimationFrame(()=>syncLaunchTitle(collaborationApp));
    }
  });
  window.addEventListener('hashchange',()=>{
    if(isHubRequested())openHub({history:false});
    else {
      if(isOpen())closeHub({history:false});
      if(registry.resolve(window.location).kind==='app')return;
      if(text(window.location.hash).replace(/^#/,'')==='chats'){
        const collaborationApp=collaborationAppForArea(collaborationAreaFromUrl());
        prepareLaunch(collaborationApp||{collabArea:collaborationAreaFromUrl()});
        if(collaborationApp)window.requestAnimationFrame(()=>syncLaunchTitle(collaborationApp));
      }
    }
  });
  document.addEventListener('keydown',event=>{
    if(!isOpen())return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
      event.preventDefault();
      root.querySelector('#ingtecHubSearch')?.focus();
    }
  });
  window.INGTECHub={
    VERSION,apps:APPS.slice(),open:openHub,close:closeHub,launch,runTests:runHubTests,
    getPreferences:readPreferences,savePreferences:writePreferences
  };
  window.openIngtecHub=openHub;
  window.openIngtecHubApp=launch;
  window.__INGTEC_HUB_TESTS__=runHubTests();
  if(isHubRequested())openHub({replace:true});
  else if(text(window.location.hash).replace(/^#/,'')==='chats'){
    const collaborationApp=collaborationAppForArea(collaborationAreaFromUrl());
    prepareLaunch(collaborationApp||{collabArea:collaborationAreaFromUrl()});
    if(collaborationApp)window.requestAnimationFrame(()=>syncLaunchTitle(collaborationApp));
  }
})();
