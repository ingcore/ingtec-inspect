/* INGTEC App Registry
   Die Registry beschreibt Fach-Apps einmalig. Hub, Router, Sidebar und
   Switcher lesen daraus dieselben Definitionen; Fachdaten bleiben weiterhin
   in den vorhandenen Bereichen und Services. */
(() => {
  'use strict';

  const VERSION='1.1.0';
  const GROUPS=[
    {id:'work',label:'Arbeit & Prüfung',description:'Operative Arbeit vom Auftrag bis zur Freigabe.'},
    {id:'planning',label:'Planung & Zusammenarbeit',description:'Termine, Zusammenarbeit und freigegebene Kundensicht.'},
    {id:'knowledge',label:'Wissen & Dokumente',description:'Vorlagen, Akte und kontrollierte Wissensunterstützung.'},
    {id:'quality',label:'Qualität & Verwaltung',description:'Qualitätssicherung und Systemverwaltung.'}
  ];
  const COLLAB_AREAS=new Set(['activity','chats','teams','meetings','tasks','files']);

  const APPS=[
    {
      id:'arbeitsplatz',code:'APP-00',slug:'arbeitsplatz',name:'Arbeitsplatz',
      description:'Persönliches Cockpit mit aktuellen Vorgängen und Prioritäten.',
      icon:'dashboard',page:'dashboard',group:'work',navigation:[
        {id:'overview',label:'Übersicht',page:'dashboard',icon:'dashboard',path:''}
      ],legacyIds:['inspect']
    },
    {
      id:'auftraege',code:'APP-01',slug:'auftraege',name:'Aufträge',
      description:'Aufträge anlegen, zuordnen und vorbereiten.',
      icon:'orders',page:'orders',group:'work',navigation:[
        {id:'overview',label:'Auftragsübersicht',page:'orders',icon:'orders',path:''}
      ],legacyIds:['orders']
    },
    {
      id:'pruefungen',code:'APP-02',slug:'pruefungen',name:'Prüfungen',
      description:'Prüfungen bearbeiten, planen und fachlich abschließen.',
      icon:'inspection',page:'inspection',group:'work',navigation:[
        {id:'overview',label:'Übersicht',page:'inspection',icon:'inspection',path:''},
        {id:'mine',label:'Meine Prüfungen',page:'inspection',icon:'inspection',path:'meine'},
        {id:'all',label:'Alle Prüfungen',page:'inspection',icon:'inspection',path:'alle'},
        {id:'planning',label:'Prüfplanung',page:'inspection',icon:'plan',path:'planung',afterOpen:'inspection-plan'},
        {id:'findings',label:'Befundungen',page:'findings',icon:'findings',path:'befundungen'},
        {id:'measures',label:'Maßnahmen',page:'measures',icon:'measures',path:'massnahmen'},
        {id:'documents',label:'Dokumente',page:'documents',icon:'documents',path:'dokumente'},
        {id:'reports',label:'Berichte & Freigaben',page:'reports',icon:'reports',path:'berichte'}
      ],legacyIds:['inspections','plan']
    },
    {
      id:'kunden-objekte',code:'APP-03',slug:'kunden-objekte',name:'Kunden & Objekte',
      description:'Kunden-, Objekt- und Anlagendaten verwalten.',
      icon:'objects',page:'master',group:'work',navigation:[
        {id:'overview',label:'Kunden & Objekte',page:'master',icon:'objects',path:''}
      ],legacyIds:['objects']
    },
    {
      id:'befundungen',code:'APP-04',slug:'befundungen',name:'Befundungen',
      description:'Abweichungen erfassen, bewerten und nachverfolgen.',
      icon:'findings',page:'findings',group:'work',navigation:[
        {id:'overview',label:'Befundungen',page:'findings',icon:'findings',path:''},
        {id:'measures',label:'Verknüpfte Maßnahmen',page:'measures',icon:'measures',path:'massnahmen'}
      ],legacyIds:['findings']
    },
    {
      id:'massnahmen',code:'APP-04A',slug:'massnahmen',name:'Maßnahmen',
      description:'Verantwortlichkeiten, Fristen und Nachweise steuern.',
      icon:'measures',page:'measures',group:'work',navigation:[
        {id:'overview',label:'Maßnahmen',page:'measures',icon:'measures',path:''},
        {id:'findings',label:'Befundungen',page:'findings',icon:'findings',path:'befundungen'}
      ],legacyIds:['measures']
    },
    {
      id:'berichte',code:'APP-05',slug:'berichte',name:'Berichte & Ergebnisse',
      description:'QS, technische Freigabe und Berichtsausgabe.',
      icon:'reports',page:'reports',group:'work',navigation:[
        {id:'overview',label:'Berichte & Freigaben',page:'reports',icon:'reports',path:''}
      ],legacyIds:['reports','quality']
    },
    {
      id:'safety-score',code:'APP-06',slug:'safety-score',name:'SafetyScore®',
      description:'Risikoindikatoren, Wissen und Ergebnisübersicht.',
      icon:'score',page:'intelligence',group:'work',navigation:[
        {id:'overview',label:'Safety Intelligence',page:'intelligence',icon:'score',path:''}
      ],legacyIds:['score']
    },
    {
      id:'termine',code:'APP-10',slug:'termine',name:'Termine & Planung',
      description:'Prüftermine und wiederkehrende Einsatzplanung.',
      icon:'calendar',page:'calendar',group:'planning',navigation:[
        {id:'overview',label:'Termine & Planung',page:'calendar',icon:'calendar',path:''}
      ],legacyIds:['calendar']
    },
    {
      id:'teamarbeit',code:'APP-12',slug:'teamarbeit',name:'Teamarbeit',
      description:'Aktivität, Chats, Teams, Besprechungen, Aufgaben und Dateien.',
      icon:'chats',page:'chats',group:'planning',navigation:[
        {id:'activity',label:'Aktivität',page:'chats',icon:'activity',path:'aktivitaet',collabArea:'activity'},
        {id:'chats',label:'Chats',page:'chats',icon:'chats',path:'chats',collabArea:'chats'},
        {id:'teams',label:'Teams & Kanäle',page:'chats',icon:'teams',path:'teams',collabArea:'teams'},
        {id:'meetings',label:'Besprechungen',page:'chats',icon:'meetings',path:'besprechungen',collabArea:'meetings'},
        {id:'tasks',label:'Aufgaben',page:'chats',icon:'tasks',path:'aufgaben',collabArea:'tasks'},
        {id:'files',label:'Dateien',page:'chats',icon:'files',path:'dateien',collabArea:'files'}
      ],legacyIds:['chats','collaboration-activity','teams','meetings','tasks','files']
    },
    {
      id:'kundenportal',code:'APP-13',slug:'kundenportal',name:'Kundenportal',
      description:'Ausschließlich explizit freigegebene Kundensicht.',
      icon:'web',page:'customer',group:'planning',requiresCustomerRelease:true,navigation:[
        {id:'overview',label:'Kundenportal',page:'customer',icon:'web',path:''}
      ],legacyIds:['customer']
    },
    {
      id:'wissen',code:'APP-14',slug:'wissen',name:'Wissen – INGMIND',
      description:'Freigegebene Wissensbausteine, Quellen und Fachassistenz.',
      icon:'knowledge',page:'knowledge',group:'knowledge',navigation:[
        {id:'overview',label:'Übersicht',page:'knowledge',icon:'knowledge',path:''},
        {id:'ingmind',label:'INGMIND',page:'knowledge',icon:'ai',path:'ingmind',afterOpen:'ingmind'},
        {id:'templates',label:'Prüfkataloge & Vorlagen',page:'testprofiles',icon:'wiki',path:'vorlagen'},
        {id:'documents',label:'Dokumente',page:'documents',icon:'documents',path:'dokumente'}
      ],legacyIds:['knowledge','assist','templates']
    },
    {
      id:'dokumente',code:'APP-17',slug:'dokumente',name:'Dokumentenakte',
      description:'Pläne, Nachweise und freigegebene Dokumente.',
      icon:'documents',page:'documents',group:'knowledge',navigation:[
        {id:'overview',label:'Dokumentenakte',page:'documents',icon:'documents',path:''}
      ],legacyIds:['documents']
    },
    {
      id:'verwaltung',code:'APP-24',slug:'verwaltung',name:'Administration',
      description:'Rollen, Vorlagen, Profile und Integrationen verwalten.',
      icon:'settings',page:'settings',group:'quality',adminOnly:true,navigation:[
        {id:'overview',label:'Einstellungen',page:'settings',icon:'settings',path:''},
        {id:'profiles',label:'Benutzer & Rollen',page:'profiles',icon:'profiles',path:'profile'},
        {id:'templates',label:'Prüfkataloge & Vorlagen',page:'testprofiles',icon:'wiki',path:'vorlagen'}
      ],legacyIds:['administration','profiles']
    },
    {
      id:'crm',code:'APP-08',slug:'crm',name:'CRM & Kontakte',
      description:'Integration noch nicht konfiguriert.',icon:'contacts',group:'planning',
      enabled:false,navigation:[]
    },
    {
      id:'angebote',code:'APP-09',slug:'angebote',name:'Angebote & Verträge',
      description:'Integration noch nicht konfiguriert.',icon:'offers',group:'planning',
      enabled:false,navigation:[]
    },
    {
      id:'abrechnung',code:'APP-11',slug:'abrechnung',name:'Abrechnung',
      description:'Lokale Abrechnungsvorbereitung, offene Vorgänge und Zahlungseingänge im Blick.',
      icon:'billing',page:'billing',group:'quality',navigation:[
        {id:'overview',label:'Abrechnung',page:'billing',icon:'billing',path:''}
      ],legacyIds:['billing','invoices']
    },
    {
      id:'academy',code:'APP-19',slug:'academy',name:'INGTEC Academy',
      description:'Fachmodul in Vorbereitung.',icon:'academy',group:'knowledge',
      enabled:false,navigation:[]
    }
  ].map(app=>Object.freeze({
    enabled:true,
    ...app,
    route:'/app/'+app.slug,
    navigation:Object.freeze((app.navigation||[]).map(item=>Object.freeze({
      icon:app.icon,
      ...item,
      route:'/app/'+app.slug+(item.path?'/'+item.path:'')
    })))
  }));

  const APP_BY_ID=new Map(APPS.map(app=>[app.id,app]));
  const APP_BY_SLUG=new Map(APPS.map(app=>[app.slug,app]));
  const LEGACY_APP_IDS=new Map();
  APPS.forEach(app=>(app.legacyIds||[]).forEach(id=>LEGACY_APP_IDS.set(id,app.id)));

  const text=value=>String(value??'').trim();
  const canAccessPage=page=>{
    try{return typeof window.canAccessPage!=='function'||Boolean(window.canAccessPage(page));}
    catch(error){return false;}
  };
  const customerReleased=()=>{
    try{
      const report=window.state?.report;
      return report?.status==='Finalisiert'&&Boolean(report?.customerReleasedAt);
    }catch(error){return false;}
  };
  const canManageAdministration=()=>{
    try{return typeof window.canManageAdministration!=='function'||Boolean(window.canManageAdministration());}
    catch(error){return false;}
  };
  const appFor=value=>{
    if(!value)return null;
    if(typeof value==='object'&&value.id)return APP_BY_ID.get(value.id)||null;
    const key=text(value);
    return APP_BY_ID.get(key)||APP_BY_SLUG.get(key)||APP_BY_ID.get(LEGACY_APP_IDS.get(key))||null;
  };
  const defaultNavigation=app=>app?.navigation?.[0]||null;
  const navigationFor=(app,value)=>{
    const target=appFor(app);
    if(!target)return null;
    const key=text(value);
    return target.navigation.find(item=>item.id===key||item.path===key||item.route===key)||defaultNavigation(target);
  };
  const navigationAvailability=(app,item)=>{
    if(!item)return {visible:false,launchable:false,reason:'Nicht verfügbar.'};
    if(!canAccessPage(item.page))return {visible:false,launchable:false,reason:'Für deine Rolle nicht freigeschaltet.'};
    return {visible:true,launchable:true,reason:'Bereit'};
  };
  const appAvailability=value=>{
    const app=appFor(value);
    if(!app||app.enabled===false)return {visible:true,launchable:false,reason:'Dieses Fachmodul befindet sich in Vorbereitung.',stateClass:'is-soon'};
    if(app.adminOnly&&!canManageAdministration())return {visible:false,launchable:false,reason:'Nur für die Administration verfügbar.'};
    const navigation=app.navigation.filter(item=>navigationAvailability(app,item).visible);
    if(!navigation.length)return {visible:false,launchable:false,reason:'Für deine Rolle nicht freigeschaltet.'};
    if(app.requiresCustomerRelease&&!customerReleased())return {visible:true,launchable:false,reason:'Kundenfreigabe ausständig.',stateClass:'is-locked',navigation};
    return {visible:true,launchable:true,reason:'Bereit',navigation};
  };
  const accessibleApps=()=>APPS.filter(app=>app.enabled!==false&&appAvailability(app).visible);
  const routeFor=(appValue,navigationValue)=>{
    const app=appFor(appValue);
    const item=navigationFor(app,navigationValue);
    return item?'#'+item.route:'#/apps';
  };
  const context=(appValue,navigationValue,extra={})=>{
    const app=appFor(appValue);
    const item=navigationFor(app,navigationValue);
    return app&&item?{kind:'app',app,item,route:item.route,hash:'#'+item.route,...extra}:null;
  };
  const defaultContextForPage=(page,currentContext)=>{
    const current=currentContext?.app?appFor(currentContext.app):null;
    const currentItem=current?.navigation.find(item=>item.page===page&&navigationAvailability(current,item).visible);
    if(currentItem)return context(current,currentItem.id);
    const candidates=APPS.filter(app=>app.enabled!==false).flatMap(app=>app.navigation.filter(item=>item.page===page).map(item=>({app,item})));
    if(!candidates.length)return null;
    const preferred={
      dashboard:'arbeitsplatz',orders:'auftraege',calendar:'termine',master:'kunden-objekte',
      inspection:'pruefungen',findings:'pruefungen',measures:'pruefungen',reports:'berichte',
      intelligence:'safety-score',knowledge:'wissen',chats:'teamarbeit',documents:'dokumente',
      customer:'kundenportal',billing:'abrechnung',settings:'verwaltung',profiles:'verwaltung',testprofiles:'wissen'
    }[page];
    const chosen=candidates.find(candidate=>candidate.app.id===preferred)||candidates[0];
    return context(chosen.app,chosen.item.id);
  };
  const collaborationNavigationForArea=area=>{
    const app=APP_BY_ID.get('teamarbeit');
    return app?.navigation.find(item=>item.collabArea===area)||defaultNavigation(app);
  };
  const resolve=(locationLike=window.location)=>{
    const hash=text(locationLike?.hash||'').replace(/^#/,'');
    const clean=hash.replace(/^\/+/,'').replace(/\/+$/,'');
    if(!clean||clean==='apps'||clean==='hub'||clean==='dashboard')return {kind:'hub',route:'/apps',hash:'#/apps'};
    const parts=clean.split('/').filter(Boolean);
    if(parts[0]==='app'){
      const app=APP_BY_SLUG.get(parts[1]);
      if(!app)return {kind:'invalid',route:'/apps',hash:'#/apps'};
      const requestedPath=parts.slice(2).join('/');
      const item=app.navigation.find(navItem=>navItem.path===requestedPath)||defaultNavigation(app);
      return item?context(app,item.id,{canonical:requestedPath===item.path}):{kind:'invalid',route:'/apps',hash:'#/apps'};
    }
    const legacyPage=parts[0];
    if(legacyPage==='chats'){
      let area='';
      try{area=text(new URL(locationLike?.href||window.location.href).searchParams.get('collab'));}catch(error){}
      const item=collaborationNavigationForArea(COLLAB_AREAS.has(area)?area:'chats');
      return context('teamarbeit',item?.id,{legacy:true});
    }
    const legacy=defaultContextForPage(legacyPage);
    return legacy?{...legacy,legacy:true}:{kind:'invalid',route:'/apps',hash:'#/apps'};
  };
  const normalizeAppId=value=>{
    const app=appFor(value);
    return app?.id||'';
  };
  const hubApps=()=>APPS.filter(app=>app.enabled!==false);
  const comingSoonApps=()=>APPS.filter(app=>app.enabled===false);
  const runTests=()=>{
    const inspection=resolve({hash:'#/app/pruefungen/befundungen',href:window.location.href});
    const teamwork=resolve({hash:'#/app/teamarbeit/aufgaben',href:window.location.href});
    const legacy=resolve({hash:'#inspection',href:window.location.href});
    const tests=[
      {name:'Alle aktiven Apps besitzen einen eindeutigen Slug',passed:hubApps().every(app=>APP_BY_SLUG.get(app.slug)===app)},
      {name:'Prüfungen besitzt die fachliche Seitennavigation',passed:inspection?.app?.id==='pruefungen'&&inspection?.item?.page==='findings'},
      {name:'Teamarbeit mappt Aufgaben auf den bestehenden Collaboration-Bereich',passed:teamwork?.app?.id==='teamarbeit'&&teamwork?.item?.collabArea==='tasks'},
      {name:'Bestehende Prüfungslinks werden in den App-Kontext überführt',passed:legacy?.app?.id==='pruefungen'},
      {name:'Abrechnung ist als eigene Fach-App aktiviert',passed:appFor('abrechnung')?.enabled!==false&&appFor('abrechnung')?.navigation?.[0]?.page==='billing'},
      {name:'Weitere geplante Fachmodule bleiben registriert',passed:comingSoonApps().length>=3}
    ];
    return {passed:tests.every(test=>test.passed),tests,runAt:new Date().toISOString()};
  };

  window.INGTECAppRegistry=Object.freeze({
    VERSION,GROUPS:Object.freeze(GROUPS.slice()),APPS:Object.freeze(APPS.slice()),COLLAB_AREAS,
    apps:()=>APPS.slice(),hubApps,comingSoonApps,appFor,navigationFor,defaultNavigation,
    appAvailability,navigationAvailability,accessibleApps,routeFor,context,resolve,
    defaultContextForPage,collaborationNavigationForArea,normalizeAppId,runTests
  });
  window.__INGTEC_APP_REGISTRY_TESTS__=runTests();
})();
