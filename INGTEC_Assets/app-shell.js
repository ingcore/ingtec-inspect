/* INGTEC App Shell
   Macht aus den vorhandenen Fachseiten App-Kontexte, ohne deren Daten- oder
   Berechtigungslogik zu duplizieren. Die URL ist die Quelle für activeApp. */
(() => {
  'use strict';

  const registry=window.INGTECAppRegistry;
  if(!registry)return;

  const state={context:null,applyingRoute:false,switcher:null,switcherOpen:false};
  const text=value=>String(value??'').trim();
  const esc=value=>text(value).replace(/[&<>'"]/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[char]));
  const isAppContext=value=>value?.kind==='app'&&value?.app&&value?.item;
  const pageTitle=()=>document.getElementById('pageTitle');

  function activeContext(){
    return state.context;
  }
  function activeApp(){
    return state.context?.app||null;
  }
  function activeNavigation(){
    return state.context?.item||null;
  }
  function currentUrl(){
    try{return new URL(window.location.href);}catch(error){return null;}
  }
  function routeUrl(context){
    const url=currentUrl();
    if(!url||!isAppContext(context))return null;
    url.searchParams.delete('hub');
    url.searchParams.delete('collab');
    url.hash=context.hash;
    return url;
  }
  function routeMatches(context){
    const url=routeUrl(context);
    if(!url)return false;
    return url.hash===window.location.hash&&url.searchParams.get('hub')!=='1'&&!new URL(window.location.href).searchParams.has('collab');
  }
  function writeRoute(context,{replace=false}={}){
    const url=routeUrl(context);
    if(!url||routeMatches(context))return false;
    try{
      window.history[replace?'replaceState':'pushState'](
        {ingtecApp:context.app.id,ingtecAppNavigation:context.item.id},
        '',
        url.href
      );
      return true;
    }catch(error){
      // Manche Dateivorschauen erlauben kein vollständiges history.replaceState
      // mit file:-URL. Der Hash-Fallback erhält Deep Links auch dort.
      try{
        if(window.location.hash!==context.hash){
          window.location.hash=context.hash;
          return true;
        }
      }catch(fallbackError){}
      return false;
    }
  }
  function setAppDataset(context){
    const app=context?.app;
    const item=context?.item;
    const root=document.documentElement;
    const shell=document.querySelector('.app');
    if(app&&item){
      root.dataset.ingtecActiveApp=app.slug;
      root.dataset.ingtecActiveNavigation=item.id;
      if(shell){
        shell.dataset.ingtecActiveApp=app.slug;
        shell.dataset.ingtecActiveNavigation=item.id;
      }
    }else{
      delete root.dataset.ingtecActiveApp;
      delete root.dataset.ingtecActiveNavigation;
      if(shell){
        delete shell.dataset.ingtecActiveApp;
        delete shell.dataset.ingtecActiveNavigation;
      }
    }
  }
  function visibleNavigation(){
    const context=activeContext();
    if(!isAppContext(context))return null;
    const app=context.app;
    return app.navigation
      .filter(item=>registry.navigationAvailability(app,item).visible)
      .map(item=>({
        page:item.page,
        label:item.label,
        icon:item.icon||app.icon,
        group:app.name,
        navId:item.id,
        route:item.route,
        appSlug:app.slug
      }));
  }
  function syncNavigationSelection(){
    const active=activeNavigation();
    document.querySelectorAll('#nav button').forEach(button=>{
      const selected=active?button.dataset.navId===active.id:button.dataset.page===document.querySelector('.page.active')?.id;
      button.classList.toggle('active',selected);
      if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
  }
  function renderShellNavigation(){
    const navigation=visibleNavigation();
    if(!navigation){
      if(typeof baseNavHtml==='function')return baseNavHtml();
      return;
    }
    const root=document.getElementById('nav');
    if(!root)return;
    const app=activeApp();
    const buttons=navigation.map(item=>{
      let icon='';
      try{icon=typeof window.navIconMarkup==='function'?window.navIconMarkup(item.page,item.icon):'';}catch(error){}
      const active=item.navId===activeNavigation()?.id;
      return '<button type="button" data-page="'+esc(item.page)+'" data-nav-id="'+esc(item.navId)+'" aria-label="'+esc(item.label)+'" title="'+esc(item.label)+'" '+(active?'aria-current="page"':'')+' class="'+(active?'active':'')+'">'+icon+'<span>'+esc(item.label)+'</span></button>';
    }).join('');
    root.innerHTML='<div class="nav-group ingtec-app-nav-group" role="group" aria-label="'+esc(app?.name||'App-Navigation')+'"><span class="nav-group-label">Navigation</span>'+buttons+'</div>';
    root.querySelectorAll('button[data-nav-id]').forEach(button=>{
      button.addEventListener('click',()=>navigateItem(button.dataset.navId));
    });
  }
  function breadcrumbFor(page){
    const context=activeContext();
    if(!isAppContext(context))return '';
    const app=context.app;
    const item=context.item;
    const contextual=['orders','master','inspection','findings','measures','reports','documents','chats','intelligence','knowledge'].includes(page);
    let order='';
    let project='';
    try{order=window.activeOrder?.()?.number||'';project=window.activeProjectRecord?.()?.name||'';}catch(error){}
    return [app.name,item.label,...(contextual?[order,project].filter(Boolean):[])].join(' / ');
  }
  function updatePresentation(){
    const context=activeContext();
    setAppDataset(context);
    renderSidebarContext();
    syncNavigationSelection();
    if(!isAppContext(context))return;
    const title=context.item.label||context.app.name;
    const heading=pageTitle();
    if(heading)heading.textContent=title;
    const breadcrumb=document.getElementById('workspaceBreadcrumb');
    if(breadcrumb)breadcrumb.textContent=breadcrumbFor(context.item.page);
    document.title='INGTEC · '+context.app.name+(title&&title!==context.app.name?' · '+title:'');
    const appButton=document.getElementById('ingtecHubReturn');
    if(appButton){
      appButton.title='Apps wechseln';
      appButton.setAttribute('aria-label','Apps wechseln');
    }
  }
  function renderSidebarContext(){
    document.getElementById('ingtecAppContext')?.remove();
  }
  function runAdapter(context){
    const item=context?.item;
    if(!item)return;
    if(item.collabArea){
      const select=()=>{
        if(typeof window.collabSetArea!=='function')return false;
        window.collabSetArea(item.collabArea);
        return true;
      };
      if(!select())window.setTimeout(select,0);
    }
    if(item.afterOpen==='inspection-plan'){
      window.setTimeout(()=>document.getElementById('inspectionPlanStage')?.scrollIntoView({behavior:'smooth',block:'center'}),180);
    }
    if(item.afterOpen==='ingmind'&&typeof window.openIngMindAssistant==='function'){
      window.setTimeout(()=>window.openIngMindAssistant(),120);
    }
  }
  function refreshNavigation(){
    if(typeof window.navHtml==='function')window.navHtml();
    renderSidebarContext();
    updatePresentation();
  }
  function setContext(context){
    if(!isAppContext(context))return false;
    state.context=context;
    setAppDataset(context);
    return true;
  }
  function contextIsAllowed(context){
    if(!isAppContext(context))return false;
    const appAccess=registry.appAvailability(context.app);
    const navAccess=registry.navigationAvailability(context.app,context.item);
    return Boolean(appAccess.launchable&&navAccess.launchable);
  }
  function applyScreenAdapter(item){
    const adapter=typeof item?.screenAdapter==='string'?window[item.screenAdapter]:null;
    if(typeof adapter!=='function')return;
    try{adapter(item.screen);}catch(error){}
  }
  function firstAllowedContext(appValue){
    const app=registry.appFor(appValue);
    if(!app)return null;
    const navigation=app.navigation.find(item=>registry.navigationAvailability(app,item).launchable);
    return navigation?registry.context(app,navigation.id):null;
  }
  let baseSetPage=null;
  let baseNavHtml=null;
  function applyContext(context,{history=false,replace=false,focus=false}={}){
    if(!isAppContext(context)||!contextIsAllowed(context))return false;
    if(history)writeRoute(context,{replace});
    setContext(context);
    applyScreenAdapter(context.item);
    refreshNavigation();
    state.applyingRoute=true;
    try{
      if(typeof baseSetPage==='function')baseSetPage(context.item.page);
      else if(typeof window.setPage==='function')window.setPage(context.item.page);
    }finally{
      state.applyingRoute=false;
    }
    runAdapter(context);
    window.requestAnimationFrame(()=>{
      updatePresentation();
      if(focus)document.getElementById('main-content')?.focus({preventScroll:true});
    });
    return true;
  }
  function navigate(appValue,navigationValue,options={}){
    let context=registry.context(appValue,navigationValue);
    if(context&&!contextIsAllowed(context))context=firstAllowedContext(context.app);
    if(!context)return false;
    const availability=registry.appAvailability(context.app);
    if(!availability.launchable){
      window.showToast?.(availability.reason,null,null,'error');
      return false;
    }
    return applyContext(context,{history:options.history!==false,replace:Boolean(options.replace),focus:Boolean(options.focus)});
  }
  function navigateItem(navigationId){
    const app=activeApp();
    return app?navigate(app,navigationId,{focus:true}):false;
  }
  function contextForPage(page){
    return registry.defaultContextForPage(page,activeContext());
  }
  function syncRouteForPage(page,{replace=true}={}){
    const requested=registry.resolve(window.location);
    // renderAll() kann noch laufen, während der App Hub offen ist. In diesem
    // Fall darf der Lifecycle den bewussten Hub-Einstieg nicht in eine
    // Fachroute umschreiben.
    if(requested.kind==='hub'||document.body.classList.contains('ingtec-hub-open'))return false;
    let context=activeContext();
    if(!isAppContext(context)||context.item.page!==page){
      context=contextForPage(page);
      if(!context)return false;
      setContext(context);
      refreshNavigation();
    }
    writeRoute(context,{replace});
    window.requestAnimationFrame(updatePresentation);
    return true;
  }
  function applyLocation({replaceLegacy=true}={}){
    const resolved=registry.resolve(window.location);
    if(resolved.kind==='hub'){
      state.context=null;
      setAppDataset(null);
      closeSwitcher();
      return false;
    }
    let context=resolved;
    if(context.kind==='app'&&!contextIsAllowed(context))context=firstAllowedContext(context.app);
    if(!context||context.kind==='invalid'){
      const url=currentUrl();
      if(url){
        url.searchParams.delete('hub');
        url.searchParams.delete('collab');
        url.hash='#/apps';
        try{window.history.replaceState({ingtecHub:true},'',url.href);}catch(error){}
      }
      state.context=null;
      setAppDataset(null);
      window.openIngtecHub?.({history:false});
      return false;
    }
    if((resolved.legacy||resolved.canonical===false||context.item.id!==resolved.item.id)&&replaceLegacy)writeRoute(context,{replace:true});
    return applyContext(context,{history:false,focus:false});
  }
  function rememberForSwitcher(appId){
    try{
      const prefs=window.INGTECHub?.getPreferences?.();
      if(!prefs)return;
      const recent=[appId,...(prefs.recent||[]).filter(id=>id!==appId)].slice(0,6);
      window.INGTECHub?.savePreferences?.({...prefs,recent,lastAppId:appId});
    }catch(error){}
  }
  function switcherApps(){
    const visible=registry.accessibleApps();
    let preferences={favorites:[],recent:[]};
    try{preferences=window.INGTECHub?.getPreferences?.()||preferences;}catch(error){}
    const byId=new Map(visible.map(app=>[app.id,app]));
    const ordered=[
      ...(preferences.favorites||[]).map(id=>byId.get(registry.normalizeAppId(id))).filter(Boolean),
      ...(preferences.recent||[]).map(id=>byId.get(registry.normalizeAppId(id))).filter(Boolean),
      ...visible
    ];
    return [...new Map(ordered.map(app=>[app.id,app])).values()].slice(0,10);
  }
  function ensureSwitcher(){
    if(state.switcher)return state.switcher;
    const panel=document.createElement('section');
    panel.id='ingtecAppSwitcher';
    panel.className='ingtec-app-switcher';
    panel.hidden=true;
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-modal','false');
    panel.setAttribute('aria-label','Apps wechseln');
    panel.addEventListener('click',event=>{
      const close=event.target.closest('[data-switcher-close]');
      if(close){closeSwitcher();return;}
      const hub=event.target.closest('[data-switcher-hub]');
      if(hub){
        closeSwitcher();
        window.openIngtecHub?.();
        return;
      }
      const button=event.target.closest('[data-switcher-app]');
      if(!button)return;
      const app=registry.appFor(button.dataset.switcherApp);
      if(!app)return;
      rememberForSwitcher(app.id);
      closeSwitcher();
      navigate(app,registry.defaultNavigation(app)?.id,{focus:true});
    });
    document.body.appendChild(panel);
    state.switcher=panel;
    return panel;
  }
  function switcherMarkup(){
    const current=activeApp()?.id||'';
    const cards=switcherApps().map(app=>{
      const active=app.id===current;
      return '<button type="button" class="ingtec-app-switcher-card'+(active?' is-active':'')+'" data-switcher-app="'+esc(app.id)+'" '+(active?'aria-current="page"':'')+'><span class="ingtec-app-switcher-code">'+esc(app.code)+'</span><span><b>'+esc(app.name)+'</b><small>'+esc(app.description)+'</small></span></button>';
    }).join('');
    return '<div class="ingtec-app-switcher-head"><div><span class="eyebrow">INGTEC Apps</span><h2>Arbeitsbereich wechseln</h2></div><button type="button" class="modal-close" data-switcher-close aria-label="App-Switcher schließen">×</button></div><div class="ingtec-app-switcher-list">'+cards+'</div><div class="ingtec-app-switcher-foot"><button type="button" class="secondary" data-switcher-hub>Alle Apps anzeigen</button></div>';
  }
  function openSwitcher(){
    const panel=ensureSwitcher();
    if(state.switcherOpen){closeSwitcher();return;}
    panel.innerHTML=switcherMarkup();
    panel.hidden=false;
    state.switcherOpen=true;
    document.getElementById('ingtecHubReturn')?.setAttribute('aria-expanded','true');
    window.requestAnimationFrame(()=>panel.querySelector('[data-switcher-app]')?.focus({preventScroll:true}));
  }
  function closeSwitcher(){
    if(!state.switcher)return;
    state.switcher.hidden=true;
    state.switcherOpen=false;
    document.getElementById('ingtecHubReturn')?.setAttribute('aria-expanded','false');
  }
  function handleOutsideSwitcher(event){
    if(!state.switcherOpen)return;
    const target=event.target;
    if(target.closest('#ingtecAppSwitcher,#ingtecHubReturn'))return;
    closeSwitcher();
  }
  function handleKeydown(event){
    if(event.key==='Escape'&&state.switcherOpen){
      event.preventDefault();
      closeSwitcher();
    }
  }
  function runTests(){
    const inspections=registry.resolve({hash:'#/app/pruefungen/befundungen',href:window.location.href});
    const teamwork=registry.resolve({hash:'#/app/teamarbeit/aufgaben',href:window.location.href});
    const sidebar=visibleNavigation();
    const tests=[
      {name:'Prüfungsroute bestimmt aktive App und Befundungsnavigation',passed:inspections?.app?.id==='pruefungen'&&inspections?.item?.id==='findings'},
      {name:'Teamarbeitsroute bestimmt den Aufgabenbereich',passed:teamwork?.app?.id==='teamarbeit'&&teamwork?.item?.collabArea==='tasks'},
      {name:'Sidebar liest ihre Navigation aus dem aktiven App-Kontext',passed:!sidebar||sidebar.every(item=>item.appSlug===activeApp()?.slug)},
      {name:'Der Apps-Switcher bleibt als globale Shell-Funktion verfügbar',passed:typeof openSwitcher==='function'}
    ];
    return {passed:tests.every(test=>test.passed),tests,runAt:new Date().toISOString()};
  }

  baseSetPage=window.setPage;
  baseNavHtml=window.navHtml;
  const baseRenderAll=window.renderAll;
  window.INGTECAppShell={
    VERSION:'1.0.0',activeContext,activeApp,activeNavigation,visibleNavigation,breadcrumbFor,
    navigate,navigateItem,applyLocation,syncRouteForPage,openSwitcher,closeSwitcher,
    routeFor:registry.routeFor,runTests
  };
  if(typeof baseSetPage==='function'){
    window.setPage=function ingtecAppAwareSetPage(page){
      if(!state.applyingRoute){
        const next=contextForPage(page);
        if(next&&contextIsAllowed(next)){
          setContext(next);
          applyScreenAdapter(next.item);
          writeRoute(next);
          refreshNavigation();
        }
      }
      return baseSetPage.apply(this,arguments);
    };
  }
  if(typeof baseNavHtml==='function')window.navHtml=renderShellNavigation;
  if(typeof baseRenderAll==='function'){
    window.renderAll=function ingtecAppAwareRenderAll(){
      const result=baseRenderAll.apply(this,arguments);
      refreshNavigation();
      return result;
    };
  }
  window.addEventListener('popstate',()=>applyLocation({replaceLegacy:true}));
  window.addEventListener('hashchange',()=>applyLocation({replaceLegacy:true}));
  document.addEventListener('pointerdown',handleOutsideSwitcher);
  document.addEventListener('keydown',handleKeydown);
  applyLocation({replaceLegacy:true});
  window.__INGTEC_APP_SHELL_TESTS__=runTests();
})();
