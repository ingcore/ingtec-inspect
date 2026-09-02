/* INGTEC BSB – Brandschutzbegehungen
   Version 3: Vollständige Überarbeitung nach dem Fachmeeting. Hierarchie
   bewusst auf Kunde -> Objekt vereinfacht (keine separate Standort-Ebene
   mehr) und auf die bereits bestehenden zentralen Plattformobjekte
   aufgesetzt statt einer eigenen Parallelstruktur:

   - state.customers wird weiterverwendet (bereits durch die Auftrags-/
     Objektverwaltung lazy befüllt) und um Kundendaten erweitert.
   - state.projects ("Objekt" der bestehenden Kunden-/Objektverwaltung)
     wird als das in diesem Fachmeeting geforderte "Objekt" wiederverwendet
     und um BSB-Felder ergänzt (Adresse strukturiert, Objektart, nächste
     Begehung, Ansprechpartner vor Ort). projectClassification()/
     projectStatus() in index.html sind bereits defensiv gegenüber
     fehlenden Feldern, ein von BSB angelegtes Objekt erscheint daher
     unverändert nutzbar in "Kunden & Objekte".
   - Mängel/Begehungen/Berichte bleiben bewusst pro Objekt gespeichert
     (project.bsbFindings/bsbInspections/bsbReports) statt im bestehenden
     state.findings/state.inspections, weil jene Strukturen an eine
     einzelne globale aktive Prüfung (state.activeInspectionId) gebunden
     sind (siehe reports/measures/safety-score) und keine customer_id/
     object_id je Feststellung kennen. Ein Zusammenführen ohne Umbau
     dieser Singleton-Architektur würde bestehende Fachmodule gefährden.
   - Safety-Score: keine zweite Engine, sondern ein zweites, eigenes
     Regelwerk in derselben bestehenden Registry
     (window.INGTEC_SAFETY_SCORE_RULESETS), nach demselben Muster wie
     'INGTEC-SAFETY-2026.1' (Punkte pro Schwere, Grenzwerte -> Klasse A-E).
     Es überschreibt nicht state.safetyScore (das gehört der Prüfungen-
     Singleton-Ansicht), sondern wird pro Objekt in project.bsbSafetyScore
     abgelegt.
   - PDF-Bericht nutzt weiterhin den bestehenden INGTECPdf-Renderer
     (report-pdf.js), der um eine rückwärtskompatible Detailzeilen-Farbe
     ergänzt wurde (für die Schwarz/Rot/Grün-Fristlogik).

   Brandschutzkategorien, Bereiche, Geschoße und Schwereeinstufungen sind
   ausdrücklich konfigurierbare INGTEC-BSB-Startwerte (state.bsbConfig),
   keine abschließende normative Festlegung. */
(()=>{
  'use strict';
  if(typeof state==='undefined')return;

  const VERSION='0.3.0-prototype';
  const esc=value=>(typeof escapeHtml==='function'?escapeHtml(String(value??'')):String(value??''));
  const text=value=>String(value??'').trim();
  const arr=value=>Array.isArray(value)?value:[];
  const telHref=value=>text(value).replace(/[^+\d]/g,'');
  const now=()=>new Date().toISOString();
  const viennaToday=()=>{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Vienna',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const get=type=>parts.find(part=>part.type===type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  const actor=()=>{
    const account=typeof activeUserAccount==='function'?activeUserAccount():null;
    return {id:account?.id||'LOCAL-DEMO',name:account?.name||state.user?.name||'Lokale Demo'};
  };
  const dateLabel=value=>{
    const match=text(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match?`${match[3]}.${match[2]}.${match[1]}`:'–';
  };
  const dateTimeLabel=value=>{
    if(!value)return '–';
    const date=new Date(value);
    return Number.isNaN(date.getTime())?'–':new Intl.DateTimeFormat('de-AT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Vienna'}).format(date);
  };
  const addDays=(dateStr,days)=>{
    const d=new Date(dateStr+'T00:00:00');
    d.setDate(d.getDate()+days);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const daysUntil=value=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(text(value)))return null;
    return Math.round((new Date(value+'T00:00:00')-new Date(viennaToday()+'T00:00:00'))/86400000);
  };
  const sameMonth=(value,ref)=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(text(value)))return false;
    return text(value).slice(0,7)===text(ref).slice(0,7);
  };

  /* ---------- Konfigurierbare INGTEC-BSB-Startwerte (REQUIRES_DOMAIN_VALIDATION) ---------- */
  function defaultBsbConfig(){
    return {
      objectTypes:['Betriebsgebäude','Produktionsbetrieb','Lager','Bürogebäude','Beherbergungsbetrieb','Verkaufsstätte','Werkstätte','Wohngebäude','Sondergebäude','Sonstiges'],
      areas:['Allgemein','Außenbereich','Flucht- und Rettungsweg','Stiegenhaus','Produktion','Lager','Büro','Technikbereich','Heizraum','Elektrotechnikraum','Garage','Tiefgarage','Sozialbereich','Verkaufsbereich','Sonstiger Bereich'],
      floors:['Außenbereich','UG 2','UG 1','EG','OG 1','OG 2','OG 3','DG','Dach','Sonstiges'],
      categories:[
        {id:'organisatorisch',label:'Organisatorischer Brandschutz'},
        {id:'fluchtwege',label:'Flucht- und Rettungswege'},
        {id:'abschluesse',label:'Brandschutzabschlüsse'},
        {id:'brandmeldung',label:'Brandmelde- und Alarmierungseinrichtungen'},
        {id:'loeschmittel',label:'Löschmittel und Löschanlagen'},
        {id:'rwa',label:'Rauch- und Wärmeabzug'},
        {id:'beleuchtung',label:'Sicherheits- und Fluchtwegbeleuchtung'},
        {id:'lagerung',label:'Lagerung und Brandlasten'},
        {id:'technik',label:'Technik- und Elektrobereiche'},
        {id:'feuerwehrzugang',label:'Feuerwehrzugang und Einsatzmöglichkeiten'},
        {id:'baulich',label:'Baulicher Brandschutz'},
        {id:'sonstiges',label:'Sonstiger Brandschutzmangel'}
      ],
      severityLevels:[
        {id:'gering',label:'Geringfügig',points:10},
        {id:'mittel',label:'Mittel',points:30},
        {id:'hoch',label:'Hoch',points:60},
        {id:'kritisch',label:'Kritisch',points:120}
      ],
      photoRequired:false
    };
  }
  function ensureConfig(){
    state.bsbConfig=state.bsbConfig&&typeof state.bsbConfig==='object'?state.bsbConfig:defaultBsbConfig();
    const fallback=defaultBsbConfig();
    Object.keys(fallback).forEach(key=>{if(state.bsbConfig[key]===undefined)state.bsbConfig[key]=fallback[key];});
  }
  function addConfigEntry(listKey,value){
    ensureConfig();
    const clean=text(value);
    if(!clean)return;
    const list=state.bsbConfig[listKey];
    if(!list.some(item=>text(typeof item==='object'?item.label:item).toLowerCase()===clean.toLowerCase()))list.push(clean);
    save?.();
  }
  window.bsbAddConfigEntry=function(listKey,inputId){
    const input=document.getElementById(inputId);
    if(!input)return;
    addConfigEntry(listKey,input.value);
    input.value='';
    window.renderAll?.();setActivePage?.('bsb');
  };

  const STATUS_META={
    OPEN:{label:'OFFEN',tone:'black'},
    STILL_OPEN:{label:'NOCH OFFEN',tone:'red'},
    RESOLVED:{label:'BEHOBEN',tone:'green'}
  };
  const STATUS_PDF_COLOR={black:'0.09 0.11 0.14',red:'0.72 0.11 0.11',green:'0.05 0.5 0.2'};

  /* ---------- Safety-Score: zweites Regelwerk in derselben bestehenden Registry ---------- */
  function ensureBsbScoreRuleset(){
    window.INGTEC_SAFETY_SCORE_RULESETS=window.INGTEC_SAFETY_SCORE_RULESETS||{};
    if(window.INGTEC_SAFETY_SCORE_RULESETS['INGTEC-BSB-2026.1'])return window.INGTEC_SAFETY_SCORE_RULESETS['INGTEC-BSB-2026.1'];
    ensureConfig();
    const existing=window.INGTEC_SAFETY_SCORE_RULESETS['INGTEC-SAFETY-2026.1'];
    const ruleset={
      version:'INGTEC-BSB-2026.1',
      maxPoints:existing?.maxPoints||700,
      thresholds:existing?.thresholds?existing.thresholds.map(item=>({...item})):[{max:50,grade:'A'},{max:150,grade:'B'},{max:300,grade:'C'},{max:500,grade:'D'},{max:700,grade:'E'}],
      severityPoints:Object.fromEntries(state.bsbConfig.severityLevels.map(level=>[level.id,level.points]))
    };
    window.INGTEC_SAFETY_SCORE_RULESETS['INGTEC-BSB-2026.1']=ruleset;
    return ruleset;
  }
  function computeObjectSafetyScore(object){
    const ruleset=ensureBsbScoreRuleset();
    const openFindings=arr(object.bsbFindings).filter(f=>f.status!=='RESOLVED');
    const factors=openFindings.map(f=>({label:f.name||f.findingNumber,points:ruleset.severityPoints[f.severity]||0})).filter(f=>f.points).sort((a,b)=>b.points-a.points);
    const riskPoints=Math.min(ruleset.maxPoints,factors.reduce((sum,f)=>sum+f.points,0));
    const grade=(ruleset.thresholds.find(item=>riskPoints<=item.max)||ruleset.thresholds[ruleset.thresholds.length-1]).grade;
    const percent=Math.max(0,Math.round((1-riskPoints/ruleset.maxPoints)*100));
    return {state:'calculated',riskPoints,grade,percent,maxPoints:ruleset.maxPoints,ruleVersion:ruleset.version,factors:factors.slice(0,5),calculatedAt:now()};
  }
  function recalcObjectSafetyScore(object){object.bsbSafetyScore=computeObjectSafetyScore(object);return object.bsbSafetyScore;}

  /* ---------- Kunde: Wiederverwendung von state.customers ---------- */
  function ensureCustomerShape(customer){
    if(typeof customer.contact==='string')customer.contact={name:customer.contact,role:'',phone:'',mobile:'',email:customer.email||''};
    customer.contact=customer.contact&&typeof customer.contact==='object'?customer.contact:{name:'',role:'',phone:'',mobile:'',email:''};
    customer.address=customer.address&&typeof customer.address==='object'&&!Array.isArray(customer.address)?customer.address:{street:'',postalCode:'',city:'',country:'Österreich'};
    customer.notes=Array.isArray(customer.notes)?customer.notes:[];
    if(customer.keyAvailable===undefined)customer.keyAvailable=false;
    customer.keyLabel=customer.keyLabel||'';
    customer.accessNotes=customer.accessNotes||'';
    customer.registrationRequiredAt=customer.registrationRequiredAt||'';
    customer.parkingNotes=customer.parkingNotes||'';
    customer.visitNotes=customer.visitNotes||'';
    customer.internalNote=customer.internalNote||'';
    customer.bsbContact=customer.bsbContact||'';
    customer.bswContact=customer.bswContact||'';
    customer.facilityContact=customer.facilityContact||'';
    customer.createdAt=customer.createdAt||now();
    customer.updatedAt=customer.updatedAt||customer.createdAt;
    customer.history=Array.isArray(customer.history)?customer.history:[];
    return customer;
  }
  function ensureCustomer(name,extra={}){
    state.customers=Array.isArray(state.customers)?state.customers:[];
    const match=state.customers.find(c=>text(c?.name).toLowerCase()===text(name).toLowerCase());
    if(match)return ensureCustomerShape(match);
    const used=new Set(state.customers.map(c=>c?.id));
    let n=state.customers.length+1,id;
    do{id='CUS-'+String(n++).padStart(3,'0');}while(used.has(id));
    const customer=ensureCustomerShape({id,name:text(name),customerNumber:extra.customerNumber||id});
    state.customers.push(customer);
    return customer;
  }
  const customerById=id=>{const c=arr(state.customers).find(item=>item?.id===text(id))||null;return c?ensureCustomerShape(c):null;};
  const allCustomers=()=>arr(state.customers);

  /* ---------- Objekt: Wiederverwendung von state.projects ---------- */
  function ensureFindingShape(finding,object){
    const detectedAt=text(finding?.detectedAt||finding?.createdAt)||now();
    finding= finding&&typeof finding==='object'?finding:{};
    finding.customerId=finding.customerId||object?.customerId||'';
    finding.objectId=finding.objectId||object?.id||'';
    finding.findingNumber=finding.findingNumber||'Mangel';
    finding.name=text(finding.name)||'Mangel';
    finding.description=text(finding.description);
    finding.actualCondition=text(finding.actualCondition);
    finding.targetCondition=text(finding.targetCondition);
    finding.evaluation=text(finding.evaluation);
    finding.locationText=text(finding.locationText);
    finding.measure=text(finding.measure);
    finding.measureOwner=text(finding.measureOwner);
    finding.dueDate=text(finding.dueDate||finding.due);
    finding.photos=arr(finding.photos);
    finding.status=['OPEN','STILL_OPEN','RESOLVED'].includes(finding.status)?finding.status:'OPEN';
    finding.detectedAt=detectedAt;
    finding.createdAt=finding.createdAt||detectedAt;
    finding.updatedAt=finding.updatedAt||finding.createdAt;
    finding.statusHistory=arr(finding.statusHistory);
    if(!finding.statusHistory.length)finding.statusHistory.push({at:detectedAt,by:finding.createdBy||'System',status:finding.status,inspectionId:finding.inspectionId||'',note:'Bestand übernommen'});
    return finding;
  }
  function ensureInspectionShape(inspection,object){
    inspection=inspection&&typeof inspection==='object'?inspection:{};
    inspection.objectId=inspection.objectId||object?.id||'';
    inspection.customerId=inspection.customerId||object?.customerId||'';
    inspection.newFindingIds=arr(inspection.newFindingIds);
    inspection.recheckIds=arr(inspection.recheckIds);
    inspection.lastFindingContext=inspection.lastFindingContext&&typeof inspection.lastFindingContext==='object'?inspection.lastFindingContext:{};
    inspection.status=inspection.status||'COMPLETED';
    inspection.updatedAt=inspection.updatedAt||inspection.startedAt||now();
    return inspection;
  }
  function isBsbObject(project){
    return Boolean(project&&(
      project.bsbActive===true||
      Array.isArray(project.bsbFindings)||
      Array.isArray(project.bsbInspections)||
      Array.isArray(project.bsbReports)
    ));
  }
  function ensureObjectShape(project){
    if(project.bsbActive===undefined)project.bsbActive=true;
    project.objectNumber=project.objectNumber||project.id;
    project.objectType=project.objectType||'Betriebsgebäude';
    if(!project.addressStructured||typeof project.addressStructured!=='object'){
      project.addressStructured={street:'',postalCode:'',city:text(project.address)||'',country:'Österreich'};
    }
    project.onSiteContact=project.onSiteContact&&typeof project.onSiteContact==='object'?project.onSiteContact:{name:'',phone:''};
    project.remark=project.remark||'';
    project.nextInspectionDate=project.nextInspectionDate||'';
    project.bsbFindings=arr(project.bsbFindings).map(finding=>ensureFindingShape(finding,project));
    project.bsbInspections=arr(project.bsbInspections).map(inspection=>ensureInspectionShape(inspection,project));
    project.bsbReports=arr(project.bsbReports);
    project.bsbSafetyScore=project.bsbSafetyScore||null;
    project.createdAt=project.createdAt||now();
    project.updatedAt=project.updatedAt||project.createdAt;
    project.history=Array.isArray(project.history)?project.history:[];
    project.address=formatAddress(project.addressStructured);
    return project;
  }
  function formatAddress(a){return [a.street,[a.postalCode,a.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');}
  function objectsForCustomer(customerId){return arr(state.projects).filter(p=>p.customerId===text(customerId)&&isBsbObject(p)&&p.bsbActive!==false).map(ensureObjectShape);}
  function allBsbObjects(){return arr(state.projects).filter(p=>isBsbObject(p)&&p.bsbActive!==false).map(ensureObjectShape).filter(p=>p.customerId);}
  const objectById=id=>{
    const p=arr(state.projects).find(item=>item?.id===text(id)&&isBsbObject(item))||null;
    return p?ensureObjectShape(p):null;
  };
  function nextObjectId(){const used=new Set(arr(state.projects).map(p=>p.id));let n=arr(state.projects).length+1,id;do{id='OBJ-'+String(n++).padStart(3,'0');}while(used.has(id));return id;}
  function createObject(customer,input){
    if(!window.requirePermission?.('objects','das Anlegen eines Objekts'))return null;
    const id=nextObjectId();
    const object=ensureObjectShape({
      id,name:text(input.name)||'Neues Objekt',client:customer.name,customerId:customer.id,
      objectNumber:text(input.objectNumber)||id,objectType:input.objectType||'Betriebsgebäude',
      addressStructured:{street:text(input.street),postalCode:text(input.postalCode),city:text(input.city),country:text(input.country)||'Österreich'},
      onSiteContact:{name:text(input.contactName),phone:text(input.contactPhone)},remark:text(input.remark),
      nextInspectionDate:'',status:'In Bearbeitung',contact:'',email:''
    });
    state.projects.push(object);
    window.recordAudit?.('BSB-Objekt angelegt',{entityType:'Objekt',entityId:object.id,summary:`${object.name} · ${customer.name}`});
    save?.();
    return object;
  }
  function updateObject(object,input){
    const before={name:object.name,addressStructured:{...object.addressStructured}};
    object.name=text(input.name)||object.name;
    object.objectNumber=text(input.objectNumber)||object.objectNumber;
    object.objectType=input.objectType||object.objectType;
    object.addressStructured={street:text(input.street),postalCode:text(input.postalCode),city:text(input.city),country:text(input.country)||'Österreich'};
    object.address=formatAddress(object.addressStructured);
    object.onSiteContact={name:text(input.contactName),phone:text(input.contactPhone)};
    object.remark=text(input.remark);
    object.nextInspectionDate=text(input.nextInspectionDate);
    object.updatedAt=now();
    object.history.push({at:now(),by:actor().name,label:'Objektdaten aktualisiert'});
    window.recordAudit?.('BSB-Objekt aktualisiert',{entityType:'Objekt',entityId:object.id,summary:`${before.name} → ${object.name}`});
    save?.();
  }

  /* ---------- Kennzahlen ---------- */
  function openFindings(object){return arr(object.bsbFindings).filter(f=>f.status!=='RESOLVED');}
  function overdueFindings(object){return openFindings(object).filter(f=>{const d=daysUntil(f.dueDate);return d!==null&&d<0;});}
  function lastInspection(object){const done=arr(object.bsbInspections).filter(i=>i.status==='COMPLETED').sort((a,b)=>b.date.localeCompare(a.date));return done[0]||null;}
  function customerObjectStats(customerId){
    const objects=objectsForCustomer(customerId);
    return {objectCount:objects.length,openFindings:objects.reduce((sum,o)=>sum+openFindings(o).length,0)};
  }
  function dashboardKpis(){
    const objects=allBsbObjects();
    const today=viennaToday();
    const dueThisMonth=objects.filter(o=>sameMonth(o.nextInspectionDate,today));
    const allFindings=objects.flatMap(o=>o.bsbFindings.map(f=>({...f,objectId:o.id})));
    const open=allFindings.filter(f=>f.status!=='RESOLVED');
    const overdue=open.filter(f=>{const d=daysUntil(f.dueDate);return d!==null&&d<0;});
    return {totalObjects:objects.length,dueThisMonth:dueThisMonth.length,openFindings:open.length,overdueFindings:overdue.length};
  }
  function findInspection(inspectionId){
    for(const object of allBsbObjects()){
      const inspection=object.bsbInspections.find(i=>i.id===inspectionId);
      if(inspection)return {object,inspection};
    }
    return {object:null,inspection:null};
  }
  function nextFindingNumber(object){const numbers=arr(object.bsbFindings).map(f=>Number(String(f.findingNumber).replace(/\D/g,''))||0);return 'M-'+String(Math.max(0,...numbers)+1).padStart(3,'0');}
  function nextInspectionId(){const all=arr(state.projects).flatMap(p=>arr(p.bsbInspections));const numbers=all.map(i=>Number(String(i.id).replace(/\D/g,''))||0);return 'BEG-'+String(Math.max(0,...numbers)+1).padStart(4,'0');}
  function auditBsb(label,summary,entityId){window.recordAudit?.(label,{entityType:'BSB',entityId:entityId||'',summary});}

  /* ---------- Fotos: lokaler Dateitresor + Objekt-URL-Cache für Vorschaubilder ---------- */
  const photoUrlCache=new Map();
  async function hydratePhotoThumbnails(){
    const nodes=[...document.querySelectorAll('#bsb img[data-photo-id]:not([data-hydrated]),.modal-backdrop img[data-photo-id]:not([data-hydrated])')];
    for(const img of nodes){
      img.dataset.hydrated='1';
      const id=img.dataset.photoId;
      if(photoUrlCache.has(id)){img.src=photoUrlCache.get(id);continue;}
      try{
        const record=await window.INGTECPlatform?.getLocalFile?.(id);
        if(record?.blob){const url=URL.createObjectURL(record.blob);photoUrlCache.set(id,url);img.src=url;}
      }catch(error){}
    }
  }
  async function addPhotos(targetArray,files,kind){
    for(const file of [...(files||[])]){
      try{
        const stored=await window.INGTECPlatform?.storeLocalFile?.(file,{kind});
        if(stored)targetArray.push({id:stored.id,name:stored.name,caption:''});
      }catch(error){showToast?.(error.message||'Foto konnte nicht gespeichert werden.',null,null,'error');}
    }
  }
  function bsbRender({full=false}={}){
    const current=document.getElementById('bsb');
    if(!full&&current?.classList.contains('active')){
      const template=document.createElement('template');
      template.innerHTML=page();
      const replacement=template.content.firstElementChild;
      if(replacement){
        replacement.classList.add('active');
        if(current.style.display)replacement.style.display=current.style.display;
        current.replaceWith(replacement);
        setActivePage?.('bsb');
      }
    }else{
      window.renderAll?.();
      setActivePage?.('bsb');
    }
    hydratePhotoThumbnails();
  }

  /* ---------- Begehung ---------- */
  function bsbCurrentActor(){
    const account=typeof activeUserAccount==='function'?activeUserAccount():null;
    return {id:account?.id||'LOCAL-DEMO',name:account?.name||state.user?.name||'Lokale Demo',role:account?.accessRole||state.user?.role||'Mitarbeiter*in'};
  }
  function bsbPermission(permission,label){
    if(typeof window.requirePermission==='function'&&!window.requirePermission(permission,label))return false;
    return true;
  }
  function bsbCanApprove(){
    return Boolean(window.hasRolePermission?.('reportsRelease')||window.hasRolePermission?.('inspection'));
  }
  function bsbSyncQueueEntry(label,entityType,entityId,summary){
    ensureBsbPersistenceState();
    const entry={
      id:'BSB-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),
      at:now(),
      entityType:text(entityType)||'BSB',
      entityId:text(entityId)||'',
      label:text(label)||'BSB-Änderung',
      summary:text(summary||''),
      source:'BSB',
      operation:text(label)||'BSB-Änderung',
      context:{entityType:text(entityType)||'BSB',entityId:text(entityId)||''},
      status:'bereit zur Synchronisierung'
    };
    state.syncQueue.unshift(entry);
    state.syncQueue=state.syncQueue.slice(0,200);
    return entry;
  }
  window.bsbSyncNow=async function(options={}){
    ensureBsbPersistenceState();
    const allEntries=arr(state.syncQueue);
    const bsbEntries=allEntries.filter(entry=>entry?.source==='BSB');
    const otherEntries=allEntries.filter(entry=>entry?.source!=='BSB');
    if(!bsbEntries.length)return {ok:true,queued:0,flushed:0,mode:'empty'};
    if(!window.INGTECPlatform?.flushSyncQueue)return {ok:true,queued:bsbEntries.length,flushed:0,mode:'local'};
    state.syncQueue=bsbEntries;
    try{
      const result=await window.INGTECPlatform.flushSyncQueue({source:'BSB',...options});
      state.syncQueue=[...arr(state.syncQueue),...otherEntries];
      save?.();
      if(!result?.ok)showToast?.(result?.message||'Synchronisierung konnte nicht ausgeführt werden.',null,null,'error');
      return result||{ok:true,queued:bsbEntries.length,flushed:0,mode:'local'};
    }catch(error){
      state.syncQueue=[...arr(state.syncQueue),...otherEntries];
      save?.();
      showToast?.(error.message||'Synchronisierung konnte nicht ausgeführt werden.',null,null,'error');
      return {ok:false,queued:bsbEntries.length,flushed:0,mode:'error',message:error.message};
    }
  };
  function validateInspectionStart(object,prep){
    return object?[]:['Kein Objekt ausgewählt.'];
  }
  function findingTitle(value){
    const clean=text(value).replace(/\s+/g,' ');
    if(!clean)return 'Mangel';
    return (clean.split(/[.!?\n]/)[0]||clean).slice(0,120);
  }
  function validateFindingDraft(input){
    const required=[];
    if(!text(input?.area))required.push('Bereich');
    if(!text(input?.floor))required.push('Geschoß');
    if(!text(input?.category))required.push('Kategorie');
    if(!text(input?.description)&&!text(input?.name))required.push('Mangel');
    return required;
  }
  function bsbCriticalFindingCount(object){
    if(!object)return 0;
    return arr(object.bsbFindings).filter(f=>['OPEN','STILL_OPEN'].includes(f.status)&&['hoch','kritisch'].includes(String(f.severity))).length;
  }
  function ensureBsbPersistenceState(){
    state.auditEvents=Array.isArray(state.auditEvents)?state.auditEvents:[];
    state.syncQueue=Array.isArray(state.syncQueue)?state.syncQueue:[];
    state.bsbLifecycleVersion=state.bsbLifecycleVersion||'2026.08.31';
    return true;
  }
  function validateInspectionCompletion(object,inspection,closingRemark=''){
    const errors=[];
    if(!object||!inspection)errors.push('Begehung oder Objekt nicht gefunden.');
    if(!text(inspection?.date))errors.push('Das Begehungsdatum fehlt.');
    if(!text(inspection?.inspector))errors.push('Der Prüfende fehlt.');
    if(!inspection?.newFindingIds.length&&!inspection?.recheckIds.length&&!text(closingRemark||inspection?.closingRemark))errors.push('Bitte eine allgemeine Bemerkung für die Begehung eintragen.');
    return errors;
  }
  function startInspection(object,prep){
    if(!window.requirePermission?.('inspection','das Starten einer Begehung'))return null;
    const validationErrors=validateInspectionStart(object,prep||{});
    if(validationErrors.length){showToast?.(validationErrors[0],null,null,'error');return null;}
    const running=arr(object.bsbInspections).find(inspection=>inspection.status==='IN_PROGRESS');
    if(running){showToast?.('Für dieses Objekt läuft bereits eine Begehung. Sie wird fortgesetzt.');return running;}
    const actorInfo=bsbCurrentActor();
    const inspection={id:nextInspectionId(),objectId:object.id,customerId:object.customerId,date:prep.date||viennaToday(),
      inspector:prep.inspector||actorInfo.name,participants:text(prep.participants),remark:text(prep.remark),
      status:'IN_PROGRESS',newFindingIds:[],recheckIds:[],startedAt:now(),completedAt:'',closingRemark:'',
      createdBy:actorInfo.name,createdByRole:actorInfo.role,updatedAt:now(),lastFindingContext:{}};
    object.bsbInspections.unshift(inspection);
    bsbSyncQueueEntry('BSB-Begehung gestartet','BSB',inspection.id,`${object.name} · ${inspection.date}`);
    auditBsb('BSB-Begehung gestartet',`${object.name} · ${actorInfo.name} (${actorInfo.role})`,inspection.id);
    save?.();
    return inspection;
  }
  function finishInspection(object,inspection,closingRemark){
    ensureBsbPersistenceState();
    const hasReleasePrivilege=Boolean(window.hasRolePermission?.('reportsRelease'));
    const actorInfo=bsbCurrentActor();
    if(!bsbPermission('inspection','das Abschließen einer Begehung')&&!(hasReleasePrivilege&&bsbPermission('reportsRelease','die Freigabe einer Begehung'))){
      return null;
    }
    const validationErrors=validateInspectionCompletion(object,inspection,closingRemark);
    if(validationErrors.length){
      showToast?.(validationErrors[0],null,null,'error');
      return null;
    }
    inspection.status='COMPLETED';
    inspection.completedAt=now();
    inspection.closingRemark=text(closingRemark);
    inspection.finalizedBy=actorInfo.name;
    inspection.finalizedByRole=actorInfo.role;
    inspection.updatedAt=now();
    inspection.releaseApproved=hasReleasePrivilege;
    inspection.releaseState=hasReleasePrivilege?'RELEASED':'FINALIZED';
    const score=recalcObjectSafetyScore(object);
    inspection.safetyScoreSnapshot={...score};
    const report=createReportSnapshot(object,inspection);
    object.bsbReports.unshift(report);
    report.releaseApproved=hasReleasePrivilege;
    report.releaseState=hasReleasePrivilege?'RELEASED':'FINALIZED';
    report.finalizedBy=actorInfo.name;
    report.finalizedByRole=actorInfo.role;
    bsbSyncQueueEntry('BSB-Begehung finalisiert', 'BSB', inspection.id, `${object.name} · ${score.grade} · ${hasReleasePrivilege?'freigegeben':'finalisiert'}`);
    auditBsb('BSB-Begehung abgeschlossen',`${object.name} · Safety-Score ${score.grade} · Freigegeben durch ${actorInfo.name} (${actorInfo.role})`,inspection.id);
    save?.();
    return report;
  }
  function createReportSnapshot(object,inspection){
    const newFindings=object.bsbFindings.filter(f=>inspection.newFindingIds.includes(f.id));
    const recheckedFindings=object.bsbFindings.filter(f=>inspection.recheckIds.includes(f.id));
    return {
      id:'REP-'+inspection.id,inspectionId:inspection.id,objectId:object.id,customerId:object.customerId,
      date:inspection.date,createdAt:now(),createdBy:actor().name,
      safetyScoreSnapshot:{...inspection.safetyScoreSnapshot},
      newFindingsSnapshot:JSON.parse(JSON.stringify(newFindings)),
      recheckedFindingsSnapshot:JSON.parse(JSON.stringify(recheckedFindings)),
      inspectionSnapshot:JSON.parse(JSON.stringify(inspection)),
      customerSnapshot:JSON.parse(JSON.stringify(customerById(object.customerId)||{})),
      objectSnapshot:JSON.parse(JSON.stringify({id:object.id,name:object.name,objectNumber:object.objectNumber,address:object.address,objectType:object.objectType,onSiteContact:object.onSiteContact,remark:object.remark})),
      participants:inspection.participants,inspector:inspection.inspector,closingRemark:inspection.closingRemark
    };
  }

  /* ---------- Mangel: Erfassung ---------- */
  function createFinding(object,inspection,input){
    if(!window.requirePermission?.('inspection','das Erfassen eines Mangels'))return null;
    ensureConfig();
    const required=validateFindingDraft(input);
    if(required.length){showToast?.(`Bitte ergänzen: ${required.join(', ')}`,null,null,'error');return null;}
    const ruleset=ensureBsbScoreRuleset();
    const detectedAt=now();
    const finding={
      id:'FND-'+object.id+'-'+(object.bsbFindings.length+1),findingNumber:nextFindingNumber(object),
      customerId:object.customerId,objectId:object.id,inspectionId:inspection.id,
      area:input.area,floor:input.floor,locationText:text(input.locationText),category:input.category,
      name:text(input.name)||findingTitle(input.description),description:text(input.description),actualCondition:text(input.actualCondition),targetCondition:text(input.targetCondition),evaluation:text(input.evaluation),
      photos:input.photos||[],measure:text(input.measure),measureOwner:text(input.measureOwner),
      dueDate:text(input.dueDate),
      severity:input.severity||'mittel',scoreImpact:ruleset.severityPoints[input.severity]||ruleset.severityPoints.mittel,
      status:'OPEN',detectedAt,createdAt:detectedAt,createdBy:actor().name,updatedAt:detectedAt,updatedBy:actor().name,closedAt:'',closedBy:'',
      statusHistory:[{at:detectedAt,by:actor().name,status:'OPEN',inspectionId:inspection.id,note:'Mangel festgestellt'}]
    };
    object.bsbFindings.push(finding);
    inspection.newFindingIds.push(finding.id);
    inspection.lastFindingContext={area:finding.area,floor:finding.floor,category:finding.category};
    inspection.updatedAt=now();
    recalcObjectSafetyScore(object);
    bsbSyncQueueEntry('BSB-Mangel erfasst','BSB',finding.id,`${finding.findingNumber} · ${finding.name}`);
    auditBsb('BSB-Mangel erfasst',`${finding.findingNumber} · ${finding.name}`,finding.id);
    save?.();
    return finding;
  }
  function updateFinding(object,finding,input){
    if(!window.requirePermission?.('inspection','das Bearbeiten eines Mangels'))return null;
    ensureConfig();
    const required=validateFindingDraft(input);
    if(required.length){showToast?.(`Bitte ergänzen: ${required.join(', ')}`,null,null,'error');return null;}
    const ruleset=ensureBsbScoreRuleset();
    Object.assign(finding,{
      area:input.area,floor:input.floor,locationText:text(input.locationText),category:input.category,
      name:text(input.name)||finding.name||findingTitle(input.description),description:text(input.description),actualCondition:text(input.actualCondition),targetCondition:text(input.targetCondition),evaluation:text(input.evaluation),
      photos:input.photos||finding.photos,measure:text(input.measure),measureOwner:text(input.measureOwner),
      dueDate:text(input.dueDate),severity:input.severity||finding.severity,scoreImpact:ruleset.severityPoints[input.severity]||finding.scoreImpact
    });
    finding.updatedAt=now();
    finding.updatedBy=actor().name;
    recalcObjectSafetyScore(object);
    bsbSyncQueueEntry('BSB-Mangel bearbeitet','BSB',finding.id,`${finding.findingNumber} · ${finding.name}`);
    auditBsb('BSB-Mangel bearbeitet',`${finding.findingNumber} · ${finding.name}`,finding.id);
    save?.();
    return finding;
  }
  function applyRecheck(object,inspection,finding,result,note,afterPhoto,dueDate=''){
    const status=result==='RESOLVED'?'RESOLVED':'STILL_OPEN';
    finding.status=status;
    if(status==='RESOLVED'){finding.closedAt=now();finding.closedBy=actor().name;}
    if(status==='STILL_OPEN'&&text(dueDate))finding.dueDate=text(dueDate);
    finding.statusHistory.push({at:now(),by:actor().name,status,inspectionId:inspection.id,note:text(note),afterPhoto:afterPhoto||null,dueDate:status==='STILL_OPEN'?finding.dueDate||'':''});
    if(!inspection.recheckIds.includes(finding.id))inspection.recheckIds.push(finding.id);
    finding.updatedAt=now();
    finding.updatedBy=actor().name;
    inspection.updatedAt=now();
    recalcObjectSafetyScore(object);
  }
  window.bsbRecheckFinding=async function(objectId,inspectionId,findingId,result,noteFieldId,photoFieldId,dueFieldId=''){
    const object=objectById(objectId);
    const {inspection}=findInspection(inspectionId);
    const finding=object?.bsbFindings.find(f=>f.id===findingId);
    if(!object||!inspection||!finding||!window.requirePermission?.('inspection','die Nachkontrolle eines Mangels'))return;
    const note=document.getElementById(noteFieldId)?.value||'';
    const file=document.getElementById(photoFieldId)?.files?.[0]||null;
    const dueDate=document.getElementById(dueFieldId)?.value||'';
    let afterPhoto=null;
    if(file){
      try{const stored=await window.INGTECPlatform?.storeLocalFile?.(file,{kind:'BSB-Nachher-Foto'});if(stored)afterPhoto={id:stored.id,name:stored.name,caption:'Nachher'};}
      catch(error){showToast?.(error.message||'Foto konnte nicht gespeichert werden.',null,null,'error');}
    }
    applyRecheck(object,inspection,finding,result,note,afterPhoto,dueDate);
    bsbSyncQueueEntry('BSB-Nachkontrolle','BSB',finding.id,`${finding.findingNumber} · ${STATUS_META[finding.status].label}`);
    auditBsb('BSB-Nachkontrolle',`${finding.findingNumber} · ${STATUS_META[finding.status].label}`,finding.id);
    save?.();
    bsbRender();
    showToast?.(`${finding.findingNumber}: ${STATUS_META[finding.status].label}`);
  };

  /* ---------- Mangel-Formular: Foto → Sprache/Text → Speichern ---------- */
  let findingDraft=null;
  let findingRecognition=null;
  function findingSuggestion(input){
    const source=`${text(input?.description)} ${text(input?.name)}`.toLocaleLowerCase('de-AT');
    const suggestions=[
      {terms:['feuerlöscher','feuerloescher','löschgerät','loeschgeraet'],category:'loeschmittel',measure:'Feuerlöscher durch eine befugte Fachfirma überprüfen und fristgerecht instand setzen lassen.'},
      {terms:['brandschutztür','brandschutztuer','tür schließt','tuer schliesst','türschließer','tuerschliesser'],category:'abschluesse',measure:'Brandschutzabschluss fachgerecht instand setzen und die Selbstschließung prüfen.'},
      {terms:['fluchtweg','rettungsweg','notausgang'],category:'fluchtwege',measure:'Flucht- und Rettungsweg unverzüglich freihalten und dauerhaft organisatorisch sichern.'},
      {terms:['brandmelder','brandmelde','bma','handfeuermelder'],category:'brandmeldung',measure:'Brandmelde- bzw. Alarmierungseinrichtung durch eine befugte Fachfirma prüfen lassen.'},
      {terms:['rauchabzug','rwa'],category:'rwa',measure:'Rauch- und Wärmeabzugsanlage fachgerecht prüfen und die Funktionsfähigkeit wiederherstellen.'},
      {terms:['sicherheitsbeleuchtung','fluchtwegbeleuchtung','notbeleuchtung'],category:'beleuchtung',measure:'Sicherheitsbeleuchtung durch eine befugte Fachfirma prüfen und instand setzen lassen.'}
    ];
    return suggestions.find(suggestion=>suggestion.terms.some(term=>source.includes(term)))||null;
  }
  function openFindingForm(objectId,inspectionId,findingId){
    if(!window.requirePermission?.('inspection',findingId?'das Bearbeiten eines Mangels':'das Erfassen eines Mangels'))return;
    ensureConfig();
    const cfg=state.bsbConfig;
    const existing=findingId?objectById(objectId)?.bsbFindings.find(f=>f.id===findingId):null;
    const inspection=findInspection(inspectionId).inspection;
    const lastContext=inspection?.lastFindingContext||{};
    findingDraft=existing
      ?{objectId,inspectionId,editingId:existing.id,detectedAt:existing.detectedAt||existing.createdAt,area:existing.area,floor:existing.floor,locationText:existing.locationText,category:existing.category,name:existing.name,description:existing.description,actualCondition:existing.actualCondition||'',targetCondition:existing.targetCondition||'',evaluation:existing.evaluation||'',photos:arr(existing.photos).slice(),measure:existing.measure,measureOwner:existing.measureOwner,dueDate:existing.dueDate||'',severity:existing.severity}
      :{objectId,inspectionId,editingId:'',detectedAt:now(),area:lastContext.area||cfg.areas[0],floor:lastContext.floor||cfg.floors[0],locationText:'',category:lastContext.category||cfg.categories[0].id,name:'',description:'',actualCondition:'',targetCondition:'',evaluation:'',photos:[],measure:'',measureOwner:'',dueDate:'',severity:'mittel'};
    renderFindingForm();
  }
  function closeFindingForm(){
    findingRecognition?.stop?.();
    findingRecognition=null;
    findingDraft=null;
    document.getElementById('bsbFindingModal')?.remove();
    if(!document.querySelector('.modal-backdrop'))document.body.style.overflow='';
  }
  window.bsbCloseFindingForm=closeFindingForm;
  window.bsbFindingField=function(field,value){if(findingDraft)findingDraft[field]=value;};
  window.bsbFindingSeverity=function(id){if(!findingDraft)return;findingDraft.severity=id;renderFindingForm();};
  window.bsbFindingAddPhotos=async function(files){if(!findingDraft)return;await addPhotos(findingDraft.photos,files,'BSB-Mangelfoto');renderFindingForm();};
  window.bsbFindingRemovePhoto=function(id){if(!findingDraft)return;findingDraft.photos=findingDraft.photos.filter(p=>p.id!==id);renderFindingForm();};
  window.bsbFindingPhotoCaption=function(id,value){const photo=findingDraft?.photos.find(p=>p.id===id);if(photo)photo.caption=text(value);};
  window.bsbApplyFindingSuggestion=function(){
    if(!findingDraft)return;
    const suggestion=findingSuggestion(findingDraft);
    if(!suggestion){showToast?.('Für diesen Text gibt es noch keinen passenden Vorschlag. Die Maßnahme kann direkt eingegeben werden.');return;}
    findingDraft.category=suggestion.category;
    if(!text(findingDraft.measure))findingDraft.measure=suggestion.measure;
    renderFindingForm();
    showToast?.('Vorschlag übernommen. Bitte fachlich prüfen.');
  };
  window.bsbDictateFinding=function(){
    if(!findingDraft)return;
    const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SpeechRecognition){showToast?.('Spracheingabe wird von diesem Browser nicht unterstützt. Bitte Text eingeben.',null,null,'error');return;}
    if(findingRecognition){findingRecognition.stop();return;}
    const previous=text(findingDraft.description);
    const recognition=new SpeechRecognition();
    findingRecognition=recognition;
    recognition.lang='de-AT';
    recognition.interimResults=true;
    recognition.continuous=false;
    recognition.onresult=event=>{
      const transcript=Array.from(event.results).map(result=>result[0]?.transcript||'').join(' ').trim();
      findingDraft.description=[previous,transcript].filter(Boolean).join(previous&&transcript?' ':'');
      const input=document.querySelector('#bsbFindingModal [data-bsb-field="description"]');
      if(input)input.value=findingDraft.description;
    };
    recognition.onerror=event=>{if(event.error!=='aborted')showToast?.('Diktat konnte nicht übernommen werden: '+event.error,null,null,'error');};
    recognition.onend=()=>{findingRecognition=null;document.querySelector('#bsbFindingModal [data-bsb-dictate]')?.setAttribute('aria-pressed','false');};
    document.querySelector('#bsbFindingModal [data-bsb-dictate]')?.setAttribute('aria-pressed','true');
    recognition.start();
  };
  window.bsbSaveFinding=function(continueWithNext=false){
    if(!findingDraft)return;
    findingDraft.name=text(findingDraft.name)||findingTitle(findingDraft.description);
    ensureConfig();
    if(!findingDraft.photos.length&&state.bsbConfig.photoRequired){showToast?.('Für diesen Mangel ist mindestens ein Foto erforderlich.',null,null,'error');return;}
    const wasEditing=Boolean(findingDraft.editingId);
    const object=objectById(findingDraft.objectId);
    if(!object)return;
    const context={objectId:findingDraft.objectId,inspectionId:findingDraft.inspectionId};
    let finding;
    if(findingDraft.editingId){
      finding=object.bsbFindings.find(f=>f.id===findingDraft.editingId);
      if(!finding||!updateFinding(object,finding,findingDraft))return;
    }else{
      const {inspection}=findInspection(findingDraft.inspectionId);
      if(!inspection)return;
      finding=createFinding(object,inspection,findingDraft);
      if(!finding)return;
    }
    closeFindingForm();
    bsbRender();
    showToast?.(`${finding.findingNumber} wurde lokal gespeichert.`);
    if(continueWithNext&&!wasEditing){
      openFindingForm(context.objectId,context.inspectionId);
      requestAnimationFrame(()=>document.querySelector('#bsbFindingModal [data-bsb-field="description"]')?.focus());
    }
  };
  function renderFindingForm(){
    if(!findingDraft)return;
    let modal=document.getElementById('bsbFindingModal');
    if(!modal){modal=document.createElement('div');modal.id='bsbFindingModal';modal.className='modal-backdrop';modal.addEventListener('mousedown',event=>{if(event.target===modal)closeFindingForm();});document.body.appendChild(modal);}
    modal.innerHTML=findingFormMarkup();
    document.body.style.overflow='hidden';
    modal.querySelectorAll('[data-bsb-field]').forEach(field=>{
      const update=()=>window.bsbFindingField(field.dataset.bsbField,field.value);
      field.addEventListener('input',update);
      field.addEventListener('change',update);
    });
    modal.querySelectorAll('[data-bsb-photo-input]').forEach(input=>input.addEventListener('change',event=>window.bsbFindingAddPhotos(event.target.files)));
    if(typeof enhanceFormControls==='function')enhanceFormControls(modal);
    hydratePhotoThumbnails();
  }
  function findingFormMarkup(){
    ensureConfig();
    const cfg=state.bsbConfig;
    const object=objectById(findingDraft.objectId);
    const showPhotoHint=!findingDraft.photos.length&&state.bsbConfig.photoRequired;
    return `<div class="modal-card bsb-finding-modal" role="dialog" aria-modal="true" aria-labelledby="bsbFindingTitle">
      <div class="modal-head"><div><span class="eyebrow">${esc(object?.name)}</span><h2 id="bsbFindingTitle">${findingDraft.editingId?'Mangel bearbeiten':'Mangel erfassen'}</h2></div><button type="button" class="modal-close" aria-label="Schließen" onclick="bsbCloseFindingForm()">×</button></div>
      <div class="bsb-form-scroll bsb-finding-flow">
        <p class="bsb-detected-line"><span>Automatisch erfasst</span><b>${dateTimeLabel(findingDraft.detectedAt)}</b></p>
        <section class="bsb-capture-section"><h3>1 · Foto</h3>
          <div class="bsb-photo-grid">${findingDraft.photos.map(p=>`<div class="bsb-photo-thumb"><img data-photo-id="${esc(p.id)}" alt=""><button type="button" aria-label="Foto entfernen" onclick="bsbFindingRemovePhoto('${esc(p.id)}')">×</button><input class="bsb-photo-caption" placeholder="Bildbeschreibung" value="${esc(p.caption)}" onchange="bsbFindingPhotoCaption('${esc(p.id)}',this.value)"></div>`).join('')}</div>
          <div class="bsb-photo-actions"><label class="bsb-btn-huge"><input type="file" accept="image/*" capture="environment" multiple data-bsb-photo-input hidden>📷 FOTO AUFNEHMEN</label><label class="bsb-btn-huge secondary"><input type="file" accept="image/*" multiple data-bsb-photo-input hidden>GALERIE</label></div>
          ${showPhotoHint?'<p class="bsb-inline-hint">Für diesen Mangel ist ein Foto erforderlich.</p>':''}
        </section>
        <section class="bsb-capture-section"><h3>2 · Ort</h3><div class="bsb-location-grid">
          <label>Bereich<select data-bsb-field="area">${cfg.areas.map(a=>`<option ${findingDraft.area===a?'selected':''}>${esc(a)}</option>`).join('')}</select></label>
          <label>Geschoß<select data-bsb-field="floor">${cfg.floors.map(f=>`<option ${findingDraft.floor===f?'selected':''}>${esc(f)}</option>`).join('')}</select></label>
          <label class="bsb-wide">Standort <input data-bsb-field="locationText" value="${esc(findingDraft.locationText)}" placeholder="z. B. Stiegenhaus Nord"></label>
        </div></section>
        <section class="bsb-capture-section"><h3>3 · Kategorie</h3><label>Kategorie<select data-bsb-field="category">${cfg.categories.map(c=>`<option value="${esc(c.id)}" ${findingDraft.category===c.id?'selected':''}>${esc(c.label)}</option>`).join('')}</select></label></section>
        <section class="bsb-capture-section"><h3>4 · Mangel</h3><label>Mangel beschreiben<textarea data-bsb-field="description" placeholder="Was ist festgestellt worden?">${esc(findingDraft.description)}</textarea></label><button type="button" class="bsb-dictate-button" data-bsb-dictate aria-pressed="false" onclick="bsbDictateFinding()">🎙 MANGEL DIKTIEREN</button></section>
        <section class="bsb-capture-section"><h3>5 · Maßnahme</h3><label>Erforderliche Maßnahme<textarea data-bsb-field="measure" placeholder="Optional selbst eingeben oder Vorschlag übernehmen">${esc(findingDraft.measure)}</textarea></label><button type="button" class="secondary bsb-suggestion-button" onclick="bsbApplyFindingSuggestion()">VORSCHLAG ÜBERNEHMEN</button><p class="bsb-inline-hint">Vorschläge sind unverbindlich und müssen fachlich geprüft werden.</p></section>
        <details class="bsb-more-fields"><summary>Weitere Angaben</summary><div class="bsb-more-fields-body">
          <label>Kurztitel für Bericht / Liste<input data-bsb-field="name" value="${esc(findingDraft.name)}" placeholder="Wird sonst aus dem Mangeltext erzeugt"></label>
          <label>Istzustand<textarea data-bsb-field="actualCondition" placeholder="Optional: konkrete Feststellung">${esc(findingDraft.actualCondition)}</textarea></label>
          <label>Sollzustand<textarea data-bsb-field="targetCondition" placeholder="Optional: erwarteter Zustand">${esc(findingDraft.targetCondition)}</textarea></label>
          <label>Bewertung / fachliche Einschätzung<textarea data-bsb-field="evaluation" placeholder="Optional">${esc(findingDraft.evaluation)}</textarea></label>
          <label>Frist (optional)<input type="date" data-bsb-field="dueDate" value="${esc(findingDraft.dueDate)}"></label>
          <label>Verantwortlich (optional)<input data-bsb-field="measureOwner" value="${esc(findingDraft.measureOwner)}"></label>
          <div><span class="eyebrow">Einstufung · Safety-Score</span><div class="bsb-class-grid">${cfg.severityLevels.map(level=>`<button type="button" class="bsb-class-card ${findingDraft.severity===level.id?'active':''}" onclick="bsbFindingSeverity('${esc(level.id)}')"><b>${esc(level.label)}</b><span>${level.points} Pkt.</span></button>`).join('')}</div></div>
        </div></details>
      </div>
      <div class="modal-actions bsb-finding-actions"><button type="button" class="secondary" onclick="bsbCloseFindingForm()">Abbrechen</button><button type="button" class="primary bsb-save-btn" onclick="bsbSaveFinding(false)">${findingDraft.editingId?'ÄNDERUNGEN SPEICHERN':'SPEICHERN'}</button>${findingDraft.editingId?'':`<button type="button" class="bsb-save-next" onclick="bsbSaveFinding(true)">SPEICHERN + NÄCHSTER</button>`}</div>
    </div>`;
  }
  function domainNote(label){return `<p class="bsb-domain-note"><b>Fachlich noch offen</b> ${esc(label)}</p>`;}

  /* ---------- Kunden-/Objektformulare ---------- */
  let customerDraft=null;
  window.bsbOpenCustomerForm=function(customerId){
    if(!window.requirePermission?.('objects','das Anlegen bzw. Bearbeiten eines Kunden'))return;
    const existing=customerId?customerById(customerId):null;
    customerDraft=existing?JSON.parse(JSON.stringify(existing)):{id:'',name:'',customerNumber:'',address:{street:'',postalCode:'',city:'',country:'Österreich'},contact:{name:'',role:'',phone:'',mobile:'',email:''},notes:[],keyAvailable:false,keyLabel:'',accessNotes:'',registrationRequiredAt:'',parkingNotes:'',visitNotes:'',internalNote:'',bsbContact:'',bswContact:'',facilityContact:''};
    renderCustomerForm();
  };
  window.bsbCloseCustomerForm=function(){customerDraft=null;document.getElementById('bsbCustomerModal')?.remove();if(!document.querySelector('.modal-backdrop'))document.body.style.overflow='';};
  window.bsbCustomerField=function(path,value){
    const segments=path.split('.');
    let target=customerDraft;
    for(let i=0;i<segments.length-1;i++)target=target[segments[i]];
    target[segments[segments.length-1]]=value;
  };
  window.bsbCustomerToggleKey=function(value){customerDraft.keyAvailable=value==='ja';renderCustomerForm();};
  window.bsbSaveCustomer=function(){
    if(!text(customerDraft.name)){showToast?.('Bitte einen Firmennamen angeben.',null,null,'error');return;}
    const isNewCustomer=!customerDraft.id;
    let customer;
    if(customerDraft.id){
      customer=customerById(customerDraft.id);
      Object.assign(customer,customerDraft);
      customer.updatedAt=now();
      customer.history.push({at:now(),by:actor().name,label:'Kundendaten aktualisiert'});
      window.recordAudit?.('BSB-Kunde aktualisiert',{entityType:'Kunde',entityId:customer.id,summary:customer.name});
    }else{
      customer=ensureCustomerShape({...customerDraft,id:'',customerNumber:text(customerDraft.customerNumber)});
      if(!customer.customerNumber)customer.customerNumber='';
      const created=ensureCustomer(customerDraft.name);
      Object.assign(created,customerDraft,{id:created.id});
      created.customerNumber=text(customerDraft.customerNumber)||created.id;
      created.updatedAt=now();
      window.recordAudit?.('BSB-Kunde angelegt',{entityType:'Kunde',entityId:created.id,summary:created.name});
      customer=created;
    }
    save?.();
    window.bsbCloseCustomerForm();
    navigate(isNewCustomer?{screen:'objects',customerId:customer.id}:{screen:'start'});
    showToast?.(`${customer.name} wurde gespeichert.`);
  };
  function renderCustomerForm(){
    let modal=document.getElementById('bsbCustomerModal');
    if(!modal){modal=document.createElement('div');modal.id='bsbCustomerModal';modal.className='modal-backdrop';modal.addEventListener('mousedown',event=>{if(event.target===modal)window.bsbCloseCustomerForm();});document.body.appendChild(modal);}
    modal.innerHTML=customerFormMarkup();
    document.body.style.overflow='hidden';
    modal.querySelectorAll('[data-bsb-cfield]').forEach(field=>field.addEventListener('input',()=>window.bsbCustomerField(field.dataset.bsbCfield,field.value)));
    if(typeof enhanceFormControls==='function')enhanceFormControls(modal);
  }
  function customerFormMarkup(){
    const d=customerDraft,a=d.address,c=d.contact;
    return `<div class="modal-card bsb-customer-modal" role="dialog" aria-modal="true" aria-labelledby="bsbCustomerTitle"><div class="modal-head"><div><span class="eyebrow">${d.id?'Kunde bearbeiten':'Neuer Kunde'}</span><h2 id="bsbCustomerTitle">${d.id?esc(d.name):'Neuen Kunden anlegen'}</h2></div><button type="button" class="modal-close" aria-label="Schließen" onclick="bsbCloseCustomerForm()">×</button></div>
    <div class="bsb-form-scroll">
      <div class="bsb-form-grid">
        <label>Firmenname *<input data-bsb-cfield="name" value="${esc(d.name)}" required></label>
        <label>Kundennummer<input data-bsb-cfield="customerNumber" value="${esc(d.customerNumber)}"></label>
        <label>Straße<input data-bsb-cfield="address.street" value="${esc(a.street)}"></label>
        <label>PLZ<input data-bsb-cfield="address.postalCode" value="${esc(a.postalCode)}"></label>
        <label>Ort<input data-bsb-cfield="address.city" value="${esc(a.city)}"></label>
        <label>Land<input data-bsb-cfield="address.country" value="${esc(a.country)}"></label>
      </div>
      <h3>Ansprechpartner</h3>
      <div class="bsb-form-grid">
        <label>Name<input data-bsb-cfield="contact.name" value="${esc(c.name)}"></label>
        <label>Funktion<input data-bsb-cfield="contact.role" value="${esc(c.role)}"></label>
        <label>Telefonnummer<input data-bsb-cfield="contact.phone" value="${esc(c.phone)}"></label>
        <label>Mobilnummer<input data-bsb-cfield="contact.mobile" value="${esc(c.mobile)}"></label>
        <label class="bsb-wide">E-Mail-Adresse<input type="email" data-bsb-cfield="contact.email" value="${esc(c.email)}"></label>
      </div>
      <h3>Zutritt &amp; Hinweise</h3>
      <fieldset class="bsb-radio-row"><legend>Schlüssel vorhanden?</legend>
        <label class="bsb-radio"><input type="radio" name="bsbKey" ${d.keyAvailable?'checked':''} onchange="bsbCustomerToggleKey('ja')"> Ja</label>
        <label class="bsb-radio"><input type="radio" name="bsbKey" ${!d.keyAvailable?'checked':''} onchange="bsbCustomerToggleKey('nein')"> Nein</label>
      </fieldset>
      ${d.keyAvailable?`<label>Schlüsselnummer / Bezeichnung<input data-bsb-cfield="keyLabel" value="${esc(d.keyLabel)}"></label>`:''}
      <p class="bsb-domain-note"><b>Hinweis</b> Aus Sicherheitsgründen werden hier nur Bezeichnungen, keine tatsächlichen Zutrittscodes hinterlegt. Ein rollenbasierter Zugriffsschutz für sicherheitskritische Zugangsdaten ist als Ausbaustufe vorgesehen.</p>
      <div class="bsb-form-grid">
        <label class="bsb-wide">Zutritt / Zugangshinweise<input data-bsb-cfield="accessNotes" value="${esc(d.accessNotes)}"></label>
        <label>Anmeldung erforderlich bei<input data-bsb-cfield="registrationRequiredAt" value="${esc(d.registrationRequiredAt)}"></label>
        <label>Parkmöglichkeit / Zufahrt<input data-bsb-cfield="parkingNotes" value="${esc(d.parkingNotes)}"></label>
        <label class="bsb-wide">Besondere Hinweise für Begehungen<input data-bsb-cfield="visitNotes" value="${esc(d.visitNotes)}"></label>
        <label class="bsb-wide">Allgemeine interne Notiz<textarea data-bsb-cfield="internalNote">${esc(d.internalNote)}</textarea></label>
      </div>
      <h3>Weitere Ansprechpartner (optional)</h3>
      <div class="bsb-form-grid">
        <label>BSB beim Kunden<input data-bsb-cfield="bsbContact" value="${esc(d.bsbContact)}"></label>
        <label>BSW beim Kunden<input data-bsb-cfield="bswContact" value="${esc(d.bswContact)}"></label>
        <label>Haustechnik Ansprechpartner<input data-bsb-cfield="facilityContact" value="${esc(d.facilityContact)}"></label>
      </div>
    </div>
    <div class="modal-actions"><button type="button" class="secondary" onclick="bsbCloseCustomerForm()">Abbrechen</button><button type="button" class="primary" onclick="bsbSaveCustomer()">Speichern</button></div>
    </div>`;
  }
  window.bsbCloseCustomerInfo=function(){
    document.getElementById('bsbCustomerInfoModal')?.remove();
    if(!document.querySelector('.modal-backdrop'))document.body.style.overflow='';
  };
  window.bsbOpenCustomerInfo=function(customerId){
    const customer=customerById(customerId);
    if(!customer)return;
    let modal=document.getElementById('bsbCustomerInfoModal');
    if(!modal){modal=document.createElement('div');modal.id='bsbCustomerInfoModal';modal.className='modal-backdrop';modal.addEventListener('mousedown',event=>{if(event.target===modal)modal.remove();});document.body.appendChild(modal);}
    const phone=customer.contact.phone||customer.contact.mobile||'';
    modal.innerHTML=`<div class="modal-card bsb-customer-info" role="dialog" aria-modal="true" aria-labelledby="bsbCustomerInfoTitle"><div class="modal-head"><div><span class="eyebrow">Kundeninformation</span><h2 id="bsbCustomerInfoTitle">${esc(customer.name)}</h2></div><button type="button" class="modal-close" aria-label="Schließen" onclick="bsbCloseCustomerInfo()">×</button></div>
      <div class="bsb-overview-stats">
        <div><span>Ansprechpartner</span><b>${esc(customer.contact.name||'–')}${customer.contact.role?' · '+esc(customer.contact.role):''}</b></div>
        <div><span>Telefon</span><b>${phone?`<a class="bsb-call-link" href="tel:${esc(telHref(phone))}">${esc(phone)}</a>`:'–'}</b></div>
        <div><span>E-Mail</span><b>${esc(customer.contact.email||'–')}</b></div>
        <div><span>Schlüssel vorhanden</span><b>${customer.keyAvailable?'Ja':'Nein'}</b></div>
        ${customer.keyAvailable?`<div><span>Schlüsselnummer</span><b>${esc(customer.keyLabel||'–')}</b></div>`:''}
        <div><span>Zugang</span><b>${esc(customer.accessNotes||'–')}</b></div>
      </div>
      ${customer.visitNotes?`<p class="bsb-domain-note"><b>Zusatzinformation</b> ${esc(customer.visitNotes)}</p>`:''}
      <div class="modal-actions"><button type="button" class="secondary" onclick="bsbCloseCustomerInfo();bsbOpenCustomerForm('${esc(customer.id)}')">BEARBEITEN</button><button type="button" class="primary" onclick="bsbCloseCustomerInfo()">SCHLIESSEN</button></div>
    </div>`;
    document.body.style.overflow='hidden';
  };

  window.bsbCloseObjectInfo=function(){
    document.getElementById('bsbObjectInfoModal')?.remove();
    if(!document.querySelector('.modal-backdrop'))document.body.style.overflow='';
  };
  window.bsbOpenObjectInfo=function(objectId){
    const object=objectById(objectId);
    const customer=customerById(object?.customerId);
    if(!object)return;
    let modal=document.getElementById('bsbObjectInfoModal');
    if(!modal){
      modal=document.createElement('div');
      modal.id='bsbObjectInfoModal';
      modal.className='modal-backdrop';
      modal.addEventListener('mousedown',event=>{if(event.target===modal)window.bsbCloseObjectInfo();});
      document.body.appendChild(modal);
    }
    const phone=object.onSiteContact?.phone||customer?.contact?.phone||customer?.contact?.mobile||'';
    modal.innerHTML=`<div class="modal-card bsb-customer-info" role="dialog" aria-modal="true" aria-labelledby="bsbObjectInfoTitle"><div class="modal-head"><div><span class="eyebrow">Objektinformation</span><h2 id="bsbObjectInfoTitle">${esc(object.name)}</h2></div><button type="button" class="modal-close" aria-label="Schließen" onclick="bsbCloseObjectInfo()">×</button></div>
      <div class="bsb-overview-stats">
        <div><span>Adresse</span><b>${esc(object.address||'–')}</b></div>
        <div><span>Ansprechpartner vor Ort</span><b>${esc(object.onSiteContact?.name||customer?.contact?.name||'–')}</b></div>
        <div><span>Telefon</span><b>${phone?`<a class="bsb-call-link" href="tel:${esc(telHref(phone))}">${esc(phone)}</a>`:'–'}</b></div>
        <div><span>Schlüssel</span><b>${customer?.keyAvailable?esc(customer.keyLabel||'vorhanden'):'nicht hinterlegt'}</b></div>
        <div><span>Zutritt</span><b>${esc(customer?.accessNotes||'–')}</b></div>
        <div><span>Objekthinweis</span><b>${esc(object.remark||customer?.visitNotes||'–')}</b></div>
      </div>
      <div class="modal-actions"><button type="button" class="secondary" onclick="bsbCloseObjectInfo();bsbOpenObjectForm('${esc(object.customerId)}','${esc(object.id)}')">BEARBEITEN</button><button type="button" class="primary" onclick="bsbCloseObjectInfo()">SCHLIESSEN</button></div>
    </div>`;
    document.body.style.overflow='hidden';
  };

  let objectDraft=null;
  window.bsbOpenObjectForm=function(customerId,objectId){
    if(!window.requirePermission?.('objects','das Anlegen bzw. Bearbeiten eines Objekts'))return;
    const existing=objectId?objectById(objectId):null;
    objectDraft=existing?{id:existing.id,customerId,name:existing.name,objectNumber:existing.objectNumber,objectType:existing.objectType,street:existing.addressStructured.street,postalCode:existing.addressStructured.postalCode,city:existing.addressStructured.city,country:existing.addressStructured.country,contactName:existing.onSiteContact.name,contactPhone:existing.onSiteContact.phone,remark:existing.remark,nextInspectionDate:existing.nextInspectionDate}
      :{id:'',customerId,name:'',objectNumber:'',objectType:state.bsbConfig?.objectTypes?.[0]||'Betriebsgebäude',street:'',postalCode:'',city:'',country:'Österreich',contactName:'',contactPhone:'',remark:'',nextInspectionDate:''};
    renderObjectForm();
  };
  window.bsbCloseObjectForm=function(){objectDraft=null;document.getElementById('bsbObjectModal')?.remove();if(!document.querySelector('.modal-backdrop'))document.body.style.overflow='';};
  window.bsbObjectField=function(field,value){objectDraft[field]=value;};
  window.bsbSaveObject=function(){
    if(!text(objectDraft.name)||!text(objectDraft.street)||!text(objectDraft.city)){showToast?.('Bitte Objektname und Adresse (Straße, Ort) angeben.',null,null,'error');return;}
    const customer=customerById(objectDraft.customerId);
    let object;
    if(objectDraft.id){object=objectById(objectDraft.id);updateObject(object,objectDraft);}
    else object=createObject(customer,objectDraft);
    window.bsbCloseObjectForm();
    navigate({screen:'objects',customerId:customer.id});
    showToast?.(`${object.name} wurde gespeichert.`);
  };
  function renderObjectForm(){
    let modal=document.getElementById('bsbObjectModal');
    if(!modal){modal=document.createElement('div');modal.id='bsbObjectModal';modal.className='modal-backdrop';modal.addEventListener('mousedown',event=>{if(event.target===modal)window.bsbCloseObjectForm();});document.body.appendChild(modal);}
    modal.innerHTML=objectFormMarkup();
    document.body.style.overflow='hidden';
    modal.querySelectorAll('[data-bsb-ofield]').forEach(field=>field.addEventListener('input',()=>window.bsbObjectField(field.dataset.bsbOfield,field.value)));
    if(typeof enhanceFormControls==='function')enhanceFormControls(modal);
  }
  function objectFormMarkup(){
    ensureConfig();
    const d=objectDraft;
    return `<div class="modal-card bsb-object-modal" role="dialog" aria-modal="true" aria-labelledby="bsbObjectTitle"><div class="modal-head"><div><span class="eyebrow">${d.id?'Objekt bearbeiten':'Neues Objekt'}</span><h2 id="bsbObjectTitle">${d.id?esc(d.name):'Neues Objekt anlegen'}</h2></div><button type="button" class="modal-close" aria-label="Schließen" onclick="bsbCloseObjectForm()">×</button></div>
    <div class="bsb-form-scroll bsb-form-grid">
      <label class="bsb-wide">Objektname *<input data-bsb-ofield="name" value="${esc(d.name)}" required></label>
      <label>Objektnummer<input data-bsb-ofield="objectNumber" value="${esc(d.objectNumber)}"></label>
      <label>Objektart<select data-bsb-ofield="objectType" onchange="bsbObjectField('objectType',this.value)">${state.bsbConfig.objectTypes.map(t=>`<option ${d.objectType===t?'selected':''}>${esc(t)}</option>`).join('')}</select></label>
      <label class="bsb-wide">Straße *<input data-bsb-ofield="street" value="${esc(d.street)}" required></label>
      <label>PLZ<input data-bsb-ofield="postalCode" value="${esc(d.postalCode)}"></label>
      <label>Ort *<input data-bsb-ofield="city" value="${esc(d.city)}" required></label>
      <label>Land<input data-bsb-ofield="country" value="${esc(d.country)}"></label>
      <label>Ansprechpartner vor Ort<input data-bsb-ofield="contactName" value="${esc(d.contactName)}"></label>
      <label>Telefon<input data-bsb-ofield="contactPhone" value="${esc(d.contactPhone)}"></label>
      <label>Nächste BSB-Begehung<input type="date" data-bsb-ofield="nextInspectionDate" value="${esc(d.nextInspectionDate)}" onchange="bsbObjectField('nextInspectionDate',this.value)"></label>
      <label class="bsb-wide">Bemerkung<textarea data-bsb-ofield="remark">${esc(d.remark)}</textarea></label>
    </div>
    <div class="modal-actions"><button type="button" class="secondary" onclick="bsbCloseObjectForm()">Abbrechen</button><button type="button" class="primary" onclick="bsbSaveObject()">Speichern</button></div>
    </div>`;
  }

  /* ---------- Ansicht / Navigation ---------- */
  const DEFAULT_VIEW={screen:'start',customerId:'',objectId:'',inspectionId:'',findingId:'',reportId:'',objectsFilter:'',findingsScope:'object',findingsStatusFilter:'all',findingsAreaFilter:'',findingsCategoryFilter:'',searchQuery:'',findingsQuery:''};
  const BSB_SCREENS=new Set(['start','objects','allObjects','objectDashboard','prepare','walk','findings','findingsGlobal','findingDetail','finish','reportResult','archive','archiveInspections','archiveInspectionDetail','archiveFindings','archiveFindingDetail','more']);
  let view={...DEFAULT_VIEW};
  const TOP_LEVEL_SCREENS=new Set(['start','allObjects','findingsGlobal','more']);
  function isBsbLocation(){
    const hash=text(location.hash).replace(/^#/,'').replace(/^\/+/, '');
    return hash==='bsb'||/(^|\/)bsb(?:\/|$)/.test(hash);
  }
  function routeViewSnapshot(){
    return {screen:view.screen,customerId:view.customerId,objectId:view.objectId,inspectionId:view.inspectionId,findingId:view.findingId,reportId:view.reportId,objectsFilter:view.objectsFilter,findingsStatusFilter:view.findingsStatusFilter};
  }
  function sanitizeRouteView(candidate){
    if(!candidate||!BSB_SCREENS.has(candidate.screen))return null;
    const next={...DEFAULT_VIEW,...candidate,screen:candidate.screen};
    const needsObject=new Set(['objectDashboard','prepare','walk','findings','findingDetail','finish','reportResult','archive','archiveInspections','archiveInspectionDetail','archiveFindings','archiveFindingDetail']);
    const needsInspection=new Set(['walk','finish','reportResult','archiveInspectionDetail']);
    const needsFinding=new Set(['findingDetail','archiveFindingDetail']);
    const needsReport=new Set(['reportResult']);
    if(needsObject.has(next.screen)){
      const object=arr(state.projects).find(project=>project?.id===text(next.objectId)&&isBsbObject(project));
      if(!object)return null;
      next.customerId=object.customerId||next.customerId||'';
      if(!next.customerId)return null;
      if(needsInspection.has(next.screen)&&!arr(object.bsbInspections).some(inspection=>inspection?.id===text(next.inspectionId)))return null;
      if(needsFinding.has(next.screen)&&!arr(object.bsbFindings).some(finding=>finding?.id===text(next.findingId)))return null;
      if(needsReport.has(next.screen)&&!arr(object.bsbReports).some(report=>report?.id===text(next.reportId)))return null;
    }else if(next.screen==='objects'&&!arr(state.customers).some(customer=>customer?.id===text(next.customerId))){
      return null;
    }
    return next;
  }
  function routeViewFromLocation(){
    if(!isBsbLocation())return null;
    const stored=sanitizeRouteView(history.state?.ingtecBsbView);
    if(stored)return stored;
    try{
      const params=new URL(location.href).searchParams;
      if(!params.has('bsb-screen'))return null;
      return sanitizeRouteView({screen:params.get('bsb-screen'),customerId:params.get('bsb-customer')||'',objectId:params.get('bsb-object')||'',inspectionId:params.get('bsb-inspection')||'',findingId:params.get('bsb-finding')||'',reportId:params.get('bsb-report')||'',objectsFilter:params.get('bsb-filter')||'',findingsStatusFilter:params.get('bsb-status')||'all'});
    }catch(error){return null;}
  }
  function bsbRouteUrl(snapshot){
    const url=new URL(location.href);
    ['bsb-screen','bsb-customer','bsb-object','bsb-inspection','bsb-finding','bsb-report','bsb-filter','bsb-status'].forEach(key=>url.searchParams.delete(key));
    if(snapshot.screen!=='start')url.searchParams.set('bsb-screen',snapshot.screen);
    if(snapshot.customerId)url.searchParams.set('bsb-customer',snapshot.customerId);
    if(snapshot.objectId)url.searchParams.set('bsb-object',snapshot.objectId);
    if(snapshot.inspectionId)url.searchParams.set('bsb-inspection',snapshot.inspectionId);
    if(snapshot.findingId)url.searchParams.set('bsb-finding',snapshot.findingId);
    if(snapshot.reportId)url.searchParams.set('bsb-report',snapshot.reportId);
    if(snapshot.objectsFilter)url.searchParams.set('bsb-filter',snapshot.objectsFilter);
    if(snapshot.findingsStatusFilter&&snapshot.findingsStatusFilter!=='all')url.searchParams.set('bsb-status',snapshot.findingsStatusFilter);
    return url;
  }
  function syncBsbHistory(mode='replace'){
    if(!isBsbLocation())return false;
    const snapshot=routeViewSnapshot();
    try{
      const currentDepth=Number(history.state?.ingtecBsbDepth)||0;
      const depth=mode==='push'?currentDepth+1:currentDepth;
      history[mode==='push'?'pushState':'replaceState']({...history.state,ingtecBsbView:snapshot,ingtecBsbDepth:depth},'',bsbRouteUrl(snapshot).href);
      return true;
    }catch(error){return false;}
  }
  function navigate(patch,{historyMode='push'}={}){
    view={...view,...patch};
    bsbRender();
    syncBsbHistory(historyMode);
  }
  function setBsbScreen(screen){
    const routed=routeViewFromLocation();
    if(routed){view=routed;bsbRender();return true;}
    if(!TOP_LEVEL_SCREENS.has(screen))return false;
    view={...DEFAULT_VIEW,screen};
    bsbRender();
    syncBsbHistory('replace');
    return true;
  }
  function detectionDateMarkup(finding){
    const meta=STATUS_META[finding.status];
    const detected=(finding.detectedAt||finding.createdAt||'').slice(0,10);
    return `<span class="bsb-due tone-${meta.tone}">${dateLabel(detected)}</span> <span class="bsb-status-text tone-${meta.tone}">${meta.label}</span>`;
  }
  function contextHeader(){
    const customer=view.customerId?customerById(view.customerId):null;
    const object=view.objectId?objectById(view.objectId):null;
    if(!customer)return '';
    const crumbs=[{label:'BSB',target:'start'}];
    crumbs.push({label:customer.name,target:'objects',data:customer.id});
    if(object)crumbs.push({label:object.name,target:'objectDashboard',data:object.id});
    return `<nav class="bsb-breadcrumb" aria-label="Objektpfad">${crumbs.map((c,i)=>i===crumbs.length-1?`<span aria-current="page">${esc(c.label)}</span>`:`<button type="button" data-bsb-crumb="${c.target}" data-bsb-crumb-id="${esc(c.data||'')}">${esc(c.label)}</button>`).join('<i aria-hidden="true">›</i>')}</nav>`;
  }
  function bsbBackTarget(){
    const screen=view.screen;
    if(screen==='start'||screen==='')return null;
    if(screen==='objects'||screen==='allObjects')return {screen:'start'};
    if(screen==='objectDashboard')return {screen:'objects',customerId:view.customerId||''};
    if(screen==='prepare'||screen==='walk'||screen==='finish'||screen==='reportResult'||screen==='findings'||screen==='findingDetail'||screen==='findingsGlobal'){
      if(view.objectId)return {screen:'objectDashboard',objectId:view.objectId,customerId:view.customerId||''};
      if(view.customerId)return {screen:'objects',customerId:view.customerId};
      return {screen:'start'};
    }
    if(screen==='archive')return {screen:'objectDashboard',objectId:view.objectId,customerId:view.customerId};
    if(screen==='archiveInspectionDetail')return {screen:'archiveInspections'};
    if(screen==='archiveFindingDetail')return {screen:'archiveFindings'};
    if(screen==='archiveInspections'||screen==='archiveFindings')return {screen:'archive'};
    return {screen:'start'};
  }

  /* ---- Startseite: laufende Arbeit zuerst, Suche darunter ---- */
  function bsbCustomers(){return allCustomers().filter(customer=>objectsForCustomer(customer.id).length);}
  function activeBsbInspection(){
    return allBsbObjects().flatMap(object=>arr(object.bsbInspections).filter(inspection=>inspection.status==='IN_PROGRESS').map(inspection=>({object,inspection}))).sort((a,b)=>String(b.inspection.startedAt||'').localeCompare(String(a.inspection.startedAt||'')))[0]||null;
  }
  function bsbSyncStatus(){
    const pending=arr(state.syncQueue).filter(entry=>entry?.source==='BSB');
    if(pending.some(entry=>String(entry.status||'').toLocaleLowerCase('de-AT').includes('konflikt')))return {kind:'conflict',label:'Konflikt'};
    if(!navigator.onLine)return {kind:'local',label:pending.length?'Lokal gespeichert · Synchronisierung ausstehend':'Lokal gespeichert'};
    if(pending.length)return {kind:'pending',label:`${pending.length} lokale Änderung${pending.length===1?'':'en'} · Synchronisierung ausstehend`};
    return {kind:'synced',label:'Synchronisiert'};
  }
  function syncStatusMarkup(){
    const status=bsbSyncStatus();
    return `<div class="bsb-sync-status is-${status.kind}" role="status"><span>● ${esc(status.label)}</span>${status.kind==='pending'?'<button type="button" onclick="bsbSyncNow().then(()=>window.bsbRefresh?.())">Jetzt synchronisieren</button>':''}</div>`;
  }
  function customerCard(customer){
    const stats=customerObjectStats(customer.id);
    return `<article class="card bsb-pick-card"><div class="bsb-pick-card-head"><h3>${esc(customer.name)}</h3><button type="button" class="bsb-info-btn" aria-label="Kundeninformation zu ${esc(customer.name)}" data-bsb-customer-info="${esc(customer.id)}">ⓘ</button></div><div class="bsb-pick-meta"><span>${stats.objectCount} Objekt${stats.objectCount===1?'':'e'}</span><span>${stats.openFindings} offene Mängel</span></div><button type="button" class="primary bsb-btn-wide" data-bsb-pick-customer="${esc(customer.id)}">OBJEKTE ANSEHEN</button></article>`;
  }
  function bsbSearchEntries(query){
    const needle=text(query).toLocaleLowerCase('de-AT');
    if(!needle)return [];
    const matches=value=>text(value).toLocaleLowerCase('de-AT').includes(needle);
    const results=[];
    bsbCustomers().forEach(customer=>{
      const customerText=[customer.name,customer.customerNumber,customer.contact?.name,customer.contact?.email,formatAddress(customer.address||{})];
      if(customerText.some(matches))results.push({kind:'customer',customer});
    });
    allBsbObjects().forEach(object=>{
      const customer=customerById(object.customerId);
      const objectText=[object.name,object.objectNumber,object.address,customer?.name];
      if(objectText.some(matches))results.push({kind:'object',object,customer});
      arr(object.bsbFindings).forEach(finding=>{
        const category=(state.bsbConfig.categories.find(item=>item.id===finding.category)||{}).label||finding.category;
        const findingText=[finding.findingNumber,finding.name,finding.description,finding.actualCondition,finding.targetCondition,finding.measure,finding.area,finding.floor,finding.locationText,category,object.name,customer?.name];
        if(findingText.some(matches))results.push({kind:'finding',object,customer,finding});
      });
    });
    return results.slice(0,24);
  }
  function bsbSearchResultCard(result){
    if(result.kind==='customer')return customerCard(result.customer);
    if(result.kind==='object')return `<article class="card bsb-search-result"><span class="eyebrow">OBJEKT · ${esc(result.customer?.name||'')}</span><h3>${esc(result.object.name)}</h3><p>${esc(result.object.address)}</p><button type="button" class="primary bsb-btn-wide" data-bsb-open-object="${esc(result.object.id)}">OBJEKT ÖFFNEN</button></article>`;
    return `<article class="card bsb-search-result"><span class="eyebrow">MANGEL · ${esc(result.customer?.name||'')} · ${esc(result.object.name)}</span><h3>${esc(result.finding.findingNumber)} · ${esc(result.finding.name)}</h3><p>${esc(result.finding.area)} · ${esc(result.finding.floor)}${result.finding.locationText?' · '+esc(result.finding.locationText):''}</p><button type="button" class="secondary bsb-btn-wide" data-bsb-open-finding="${esc(result.finding.id)}" data-bsb-open-finding-object="${esc(result.object.id)}">MANGEL ANSEHEN</button></article>`;
  }
  function startScreen(){
    const query=text(view.searchQuery);
    const running=activeBsbInspection();
    const content=query?bsbSearchEntries(query).map(bsbSearchResultCard).join('')||'<p class="bsb-empty">Keine Kunden, Objekte oder Mängel gefunden.</p>':bsbCustomers().map(customerCard).join('')||'<p class="bsb-empty">Noch keine BSB-Objekte vorhanden. Lege zuerst einen Kunden oder ein Objekt an.</p>';
    return `<div class="bsb-start">
      ${syncStatusMarkup()}
      ${running?`<section class="bsb-resume-card"><span class="eyebrow">WEITERARBEITEN</span><h2>Begehung fortsetzen</h2><p><b>${esc(customerById(running.object.customerId)?.name||'')}</b><br>${esc(running.object.name)} · ${dateLabel(running.inspection.date)}<br>${running.inspection.newFindingIds.length} neue Mängel erfasst</p><button type="button" class="bsb-hero-cta" data-bsb-resume-inspection="${esc(running.inspection.id)}">BEGEHUNG FORTSETZEN</button></section>`:''}
      <section class="bsb-customer-section"><div><span class="eyebrow">${query?'Schnelle Suche':'Kunden / Objekte'}</span><h2>${query?'Treffer':'Kunde wählen'}</h2></div><label class="bsb-search"><input type="search" placeholder="Kunde, Objekt, Adresse oder Mangel suchen" value="${esc(query)}" data-bsb-search autocomplete="off"></label><div class="bsb-pick-grid">${content}</div></section>
      <button type="button" class="bsb-btn-wide secondary" onclick="bsbOpenCustomerForm()">+ NEUEN KUNDEN ANLEGEN</button>
    </div>`;
  }

  /* ---- Objekt auswählen ---- */
  function objectCard(object,{showCustomer=false}={}){
    const last=lastInspection(object);
    const overdue=overdueFindings(object).length;
    return `<article class="card bsb-pick-card"><div class="bsb-pick-card-head"><h3>${esc(object.name)}</h3></div>${showCustomer?`<span class="bsb-pick-sub">${esc(customerById(object.customerId)?.name||'')}</span>`:''}<span class="bsb-pick-address">${esc(object.address)}</span><div class="bsb-pick-meta"><span>${openFindings(object).length} offene Mängel${overdue?' · '+overdue+' überfällig':''}</span><span>${last?'letzte Begehung: '+dateLabel(last.date):'noch keine Begehung'}</span></div><button type="button" class="primary bsb-btn-wide" data-bsb-open-object="${esc(object.id)}">OBJEKT ÖFFNEN</button></article>`;
  }
  function objectsScreen(){
    const customer=customerById(view.customerId);
    if(!customer)return '<p class="bsb-empty">Kunde nicht gefunden.</p>';
    const list=objectsForCustomer(customer.id);
    return `<div class="bsb-picker">
      <div class="bsb-customer-title"><div><p class="eyebrow">KUNDE</p><h2>${esc(customer.name)}</h2></div><button type="button" class="bsb-info-btn" aria-label="Kundeninformation zu ${esc(customer.name)}" data-bsb-customer-info="${esc(customer.id)}">ⓘ</button></div>
      <p class="bsb-subquestion">Objekt auswählen</p>
      <div class="bsb-pick-grid">${list.map(o=>objectCard(o)).join('')||'<p class="bsb-empty">Für diesen Kunden ist noch kein Objekt hinterlegt.</p>'}</div>
      <button type="button" class="bsb-btn-wide secondary" onclick="bsbOpenObjectForm('${esc(customer.id)}')">+ NEUES OBJEKT ANLEGEN</button>
    </div>`;
  }
  function allObjectsScreen(){
    const today=viennaToday();
    let list=allBsbObjects();
    if(view.objectsFilter==='dueThisMonth')list=list.filter(o=>sameMonth(o.nextInspectionDate,today));
    return `<div class="bsb-picker">
      <button type="button" class="link" data-bsb-nav="start">‹ Zurück zum Dashboard</button>
      <h2>${view.objectsFilter==='dueThisMonth'?'Diesen Monat fällige Objekte':'Alle Objekte'}</h2>
      <div class="bsb-pick-grid">${list.map(o=>objectCard(o,{showCustomer:true})).join('')||'<p class="bsb-empty">Keine Objekte gefunden.</p>'}</div>
    </div>`;
  }

  /* ---- Objektübersicht ---- */
  function objectDashboardScreen(){
    const object=objectById(view.objectId);
    if(!object)return '<p class="bsb-empty">Objekt nicht gefunden.</p>';
    const customer=customerById(object.customerId);
    const last=lastInspection(object);
    const running=object.bsbInspections.find(i=>i.status==='IN_PROGRESS');
    const open=openFindings(object);
    const overdue=overdueFindings(object);
    return `<div class="bsb-overview bsb-object-dashboard">
      <div class="bsb-object-header"><div><span class="eyebrow">${esc(customer?.name||'Kunde')}</span><h2>${esc(object.name)}</h2><p>${esc(object.address)}</p></div><button type="button" class="bsb-info-btn" aria-label="Objektinformation zu ${esc(object.name)}" data-bsb-object-info="${esc(object.id)}">ⓘ</button></div>
      ${running?`<button type="button" class="bsb-hero-cta" data-bsb-resume-inspection="${esc(running.id)}">BEGEHUNG FORTSETZEN</button>`:`<button type="button" class="bsb-hero-cta" data-bsb-begin-inspection>BEGEHUNG STARTEN</button>`}
      <section class="card bsb-object-section"><div class="bsb-object-section-head"><div><span class="eyebrow">ARBEIT</span><h3>Offene Mängel</h3></div><b class="${overdue.length?'is-alert':''}">${open.length}${overdue.length?` · ${overdue.length} überfällig`:''}</b></div>
        ${open.length?`<div class="bsb-object-finding-preview">${open.slice(0,3).map(f=>`<button type="button" data-bsb-open-finding="${esc(f.id)}" data-bsb-open-finding-object="${esc(object.id)}"><b>${esc(f.findingNumber)}</b><span>${esc(f.name)}</span>${dueDateMarkup(f)}</button>`).join('')}</div>`:'<p class="bsb-empty">Keine offenen Mängel.</p>'}
        ${open.length?`<button type="button" class="secondary bsb-btn-wide" data-bsb-open-findings="${esc(object.id)}">OFFENE MÄNGEL ANSEHEN</button>`:''}
      </section>
      <section class="card bsb-object-section"><div class="bsb-object-section-head"><div><span class="eyebrow">LETZTE BEGEHUNG</span><h3>${last?dateLabel(last.date):'Noch keine Begehung'}</h3></div>${last?.safetyScoreSnapshot?`<b>Score ${esc(last.safetyScoreSnapshot.grade)}</b>`:''}</div><p>${last?`${last.newFindingIds.length} neue Mängel · ${last.recheckIds.length} Nachkontrollen`: 'Beim Start werden vorhandene offene Mängel automatisch für die Folgekontrolle angezeigt.'}</p></section>
      <section class="card bsb-object-section bsb-archive-section"><div class="bsb-object-section-head"><div><span class="eyebrow">DOKUMENTATION</span><h3>Archiv</h3></div></div><p>Vergangene Begehungen und historische Mängel dieses Objekts.</p><button type="button" class="secondary bsb-btn-wide" data-bsb-object-archive="${esc(object.id)}">ARCHIV ÖFFNEN</button></section>
    </div>`;
  }
  function safetyScoreCard(score){
    return `<div class="card bsb-score-card"><span class="eyebrow">Safety-Score</span><div class="bsb-score-value"><strong class="grade-${text(score.grade).toLowerCase()}">${esc(score.grade)}</strong><span>${score.percent}%</span></div><small>Regelwerk ${esc(score.ruleVersion)} · berechnet ${dateTimeLabel(score.calculatedAt)}</small></div>`;
  }

  /* ---- Begehung starten ---- */
  function prepareScreen(){
    const object=objectById(view.objectId);
    const customer=customerById(object.customerId);
    const prep=view.prep||{date:viennaToday(),inspector:actor().name,participants:'',remark:''};
    view.prep=prep;
    return `<div class="bsb-prepare">
      <h2>Begehung starten</h2>
      <div class="bsb-context-stack"><div><span>KUNDE</span><b>${esc(customer.name)}</b></div><div><span>OBJEKT</span><b>${esc(object.name)}</b></div><div><span>ADRESSE</span><b>${esc(object.address)}</b></div></div>
      <div class="bsb-form-grid">
        <label>Datum<input type="date" value="${esc(prep.date)}" onchange="bsbSetPrepField('date',this.value)"></label>
        <label>Prüfer<input value="${esc(prep.inspector)}" onchange="bsbSetPrepField('inspector',this.value)"></label>
        <label class="bsb-wide">Teilnehmer<input value="${esc(prep.participants)}" placeholder="optional" onchange="bsbSetPrepField('participants',this.value)"></label>
        <label class="bsb-wide">Bemerkung<textarea onchange="bsbSetPrepField('remark',this.value)" placeholder="optional">${esc(prep.remark)}</textarea></label>
      </div>
      <button type="button" class="bsb-hero-cta" data-bsb-begin-inspection>BEGEHUNG BEGINNEN</button>
    </div>`;
  }
  window.bsbSetPrepField=function(field,value){view.prep[field]=value;};

  /* ---- Begehungs-Hauptansicht ---- */
  function pendingRecheck(object,inspection){return arr(object.bsbFindings).filter(f=>f.status!=='RESOLVED'&&!(f.statusHistory[f.statusHistory.length-1]?.inspectionId===inspection.id));}
  function reviewedThisInspection(object,inspection){return arr(object.bsbFindings).filter(f=>f.statusHistory.some(h=>h.inspectionId===inspection.id)&&f.createdAt&&f.inspectionId!==inspection.id);}
  function recheckCard(object,inspection,finding){
    const photo=finding.photos[0];
    return `<article class="card bsb-defect-card"><div class="bsb-defect-card-main">${photo?`<img class="bsb-finding-preview-photo" data-photo-id="${esc(photo.id)}" alt="">`:''}<div><div class="bsb-defect-card-head"><b>${esc(finding.findingNumber)}</b></div><h4>${esc(finding.name)}</h4><p>${esc(finding.area)} · ${esc(finding.floor)}${finding.locationText?' · '+esc(finding.locationText):''}</p><div class="bsb-defect-card-meta">${dueDateMarkup(finding)}<br>Mangel festgestellt am: ${detectionDateMarkup(finding)}</div></div></div>
      <div class="card bsb-recheck-inline"><label>Bemerkung zur Nachkontrolle<textarea id="note-${esc(finding.id)}" placeholder="optional"></textarea></label><label>Neue Frist (optional)<input type="date" id="due-${esc(finding.id)}" value="${esc(finding.dueDate||'')}"></label><label class="bsb-photo-cta"><input type="file" accept="image/*" capture="environment" id="photo-${esc(finding.id)}" hidden><span class="bsb-btn-huge">📷 NACHHER-FOTO</span></label><div class="bsb-recheck-buttons"><button type="button" class="tone-ok" onclick="bsbRecheckFinding('${esc(object.id)}','${esc(inspection.id)}','${esc(finding.id)}','RESOLVED','note-${esc(finding.id)}','photo-${esc(finding.id)}','due-${esc(finding.id)}')">BEHOBEN</button><button type="button" class="tone-danger" onclick="bsbRecheckFinding('${esc(object.id)}','${esc(inspection.id)}','${esc(finding.id)}','STILL_OPEN','note-${esc(finding.id)}','photo-${esc(finding.id)}','due-${esc(finding.id)}')">NOCH OFFEN</button></div></div>
    </article>`;
  }
  function newFindingCard(finding){
    return `<article class="card bsb-defect-card" data-bsb-open-finding="${esc(finding.id)}"><div class="bsb-defect-card-head"><b>${esc(finding.findingNumber)}</b></div><h4>${esc(finding.area)} · ${esc(finding.floor)}${finding.locationText?' · '+esc(finding.locationText):''}</h4><p>${esc((state.bsbConfig.categories.find(c=>c.id===finding.category)||{}).label||'')}</p><p><b>${esc(finding.name)}</b></p><div class="bsb-defect-card-meta">Mangel festgestellt am: ${detectionDateMarkup(finding)}</div></article>`;
  }
  function walkScreen(){
    const object=objectById(view.objectId);
    const {inspection}=findInspection(view.inspectionId);
    if(!object||!inspection)return '<p class="bsb-empty">Begehung nicht gefunden.</p>';
    const pending=pendingRecheck(object,inspection);
    const created=object.bsbFindings.filter(f=>inspection.newFindingIds.includes(f.id));
    return `<div class="bsb-walk">
      <div class="bsb-walk-head"><div><span class="eyebrow">${esc(customerById(object.customerId)?.name||'')}</span><b>${esc(object.name)}</b></div><span>Begehung vom ${dateLabel(inspection.date)}</span></div>
      <p class="bsb-inspection-summary"><b>${created.length} neue Mängel</b> · <b>${pending.length} offene Altmängel</b></p>
      <button type="button" class="bsb-fab" data-bsb-add-finding aria-label="Neuen Mangel erfassen">+ MANGEL ERFASSEN</button>
      ${pending.length?`<section><h3>Offene Mängel</h3><div class="bsb-defect-grid">${pending.map(f=>recheckCard(object,inspection,f)).join('')}</div></section>`:''}
      ${created.length?`<section><h3>In dieser Begehung erfasst</h3><div class="bsb-defect-grid">${created.map(newFindingCard).join('')}</div></section>`:''}
      <button type="button" class="bsb-finish-cta" data-bsb-nav="finish">BEGEHUNG ABSCHLIESSEN</button>
    </div>`;
  }
  window.bsbBeginInspection=function(){
    const object=objectById(view.objectId);
    const inspection=startInspection(object,view.prep||{});
    if(inspection){delete view.prep;navigate({screen:'walk',inspectionId:inspection.id});}
  };

  /* ---- Mängelliste (objekt- oder global) ---- */
  function dueDateMarkup(finding){
    const remaining=daysUntil(finding.dueDate);
    if(!finding.dueDate)return '<span class="bsb-due-note">Frist: nicht gesetzt</span>';
    const tone=finding.status==='RESOLVED'?'green':remaining!==null&&remaining<0?'red':'black';
    const suffix=remaining===null?'':remaining<0?` · ${Math.abs(remaining)} T. überfällig`:remaining===0?' · heute fällig':` · noch ${remaining} T.`;
    return `<span class="bsb-due-note tone-${tone}">Frist: ${dateLabel(finding.dueDate)}${suffix}</span>`;
  }
  function findingRow(finding,{showObject=false,archive=false}={}){
    const object=showObject?objectById(finding.objectId):null;
    const category=(state.bsbConfig.categories.find(c=>c.id===finding.category)||{}).label||finding.category;
    const meta=STATUS_META[finding.status];
    const photo=arr(finding.photos)[0];
    return `<article class="card bsb-finding-row" ${archive?`data-bsb-open-archive-finding="${esc(finding.id)}"`:`data-bsb-open-finding="${esc(finding.id)}"`} data-bsb-open-finding-object="${esc(finding.objectId)}">
      ${photo?`<img class="bsb-finding-preview-photo" data-photo-id="${esc(photo.id)}" alt="Foto zu ${esc(finding.findingNumber)}">`:''}
      <div class="bsb-finding-row-main"><div class="bsb-finding-row-head"><b>${esc(finding.findingNumber)}</b>${showObject?`<span>${esc(object?.name)}</span>`:''}</div><h4>${esc(finding.name)}</h4><p>${esc(finding.floor)} · ${esc(finding.area)}${finding.locationText?' · '+esc(finding.locationText):''}</p><p class="bsb-finding-category">${esc(category)}</p></div>
      <div class="bsb-finding-row-status"><span class="bsb-status-text tone-${meta.tone}">${meta.label}</span>${dueDateMarkup(finding)}</div>
      <button type="button" class="secondary">ANSEHEN</button>
    </article>`;
  }
  function findingsScreen(){
    const object=objectById(view.objectId);
    if(!object)return '<p class="bsb-empty">Objekt nicht gefunden.</p>';
    let list=arr(object.bsbFindings);
    if(view.findingsStatusFilter==='open')list=list.filter(f=>f.status!=='RESOLVED');
    else if(view.findingsStatusFilter==='overdue')list=list.filter(f=>f.status!=='RESOLVED'&&daysUntil(f.dueDate)!==null&&daysUntil(f.dueDate)<0);
    else if(view.findingsStatusFilter==='resolved')list=list.filter(f=>f.status==='RESOLVED');
    const needle=text(view.findingsQuery).toLocaleLowerCase('de-AT');
    if(needle)list=list.filter(f=>[f.findingNumber,f.name,f.description,f.area,f.floor,f.locationText,f.measure].some(value=>text(value).toLocaleLowerCase('de-AT').includes(needle)));
    return `<div class="bsb-overview">
      <button type="button" class="link" data-bsb-nav="objectDashboard">‹ Zurück zum Objekt</button>
      <h2>Mängel</h2>
      <label class="bsb-search"><input type="search" placeholder="Mangel suchen" value="${esc(view.findingsQuery||'')}" data-bsb-findings-search autocomplete="off"></label>
      <div class="bsb-filter-row">${[['all','Alle'],['open','Offen'],['overdue','Überfällig'],['resolved','Behoben']].map(([id,label])=>`<button type="button" class="bsb-chip ${view.findingsStatusFilter===id?'active':''}" data-bsb-findings-status="${id}">${label}</button>`).join('')}</div>
      <div class="bsb-finding-list">${list.map(f=>findingRow(f)).join('')||'<p class="bsb-empty">Keine Mängel für diese Auswahl.</p>'}</div>
    </div>`;
  }
  function findingsGlobalScreen(){
    let list=allBsbObjects().flatMap(p=>p.bsbFindings);
    if(view.objectsFilter==='overdue')list=list.filter(f=>f.status!=='RESOLVED'&&daysUntil(f.dueDate)!==null&&daysUntil(f.dueDate)<0);
    else list=list.filter(f=>f.status!=='RESOLVED');
    return `<div class="bsb-overview">
      <button type="button" class="link" data-bsb-nav="start">‹ Zurück zum Dashboard</button>
      <h2>${view.objectsFilter==='overdue'?'Überfällige Mängel':'Offene Mängel'}</h2>
      <div class="bsb-finding-list">${list.map(f=>findingRow(f,{showObject:true})).join('')||'<p class="bsb-empty">Keine Mängel gefunden.</p>'}</div>
    </div>`;
  }
  function moreScreen(){
    const archiveObjects=allBsbObjects().filter(object=>arr(object.bsbReports).length||arr(object.bsbInspections).some(inspection=>inspection.status==='COMPLETED'));
    return `<div class="bsb-more">
      ${syncStatusMarkup()}
      <section class="card bsb-object-section"><div><span class="eyebrow">DOKUMENTATION</span><h3>Objektbezogenes Archiv</h3></div><p>Vergangene Begehungen und Berichte bleiben direkt am jeweiligen Objekt – ohne eine zweite Dokumentenwelt.</p>
        <div class="bsb-more-list">${archiveObjects.map(object=>`<button type="button" data-bsb-object-archive="${esc(object.id)}"><b>${esc(object.name)}</b><span>${arr(object.bsbReports).length} Bericht${arr(object.bsbReports).length===1?'':'e'} · ${esc(customerById(object.customerId)?.name||'')}</span><em>ARCHIV</em></button>`).join('')||'<p class="bsb-empty">Noch keine abgeschlossenen Begehungen.</p>'}</div>
      </section>
      <section class="card bsb-object-section"><div><span class="eyebrow">AUSSENDIENST</span><h3>Offline weiterarbeiten</h3></div><p>Kunden, Objekte, offene Mängel und neue Erfassungen bleiben lokal verfügbar. Die Synchronisation wird erst bei Verbindung fortgesetzt.</p></section>
    </div>`;
  }

  /* ---- Mangeldetail (Live: bearbeitbar · Archiv: ausschließlich lesbar) ---- */
  function findingDetailMarkup(object,finding,{readOnly=false,backScreen='findings'}={}){
    const meta=STATUS_META[finding.status];
    const category=(state.bsbConfig.categories.find(c=>c.id===finding.category)||{}).label||finding.category;
    return `<div class="bsb-overview bsb-defect-detail">
      <button type="button" class="link" data-bsb-nav="${backScreen}" data-bsb-nav-object="${esc(object.id)}">‹ Zurück${readOnly?' zu historischen Mängeln':' zur Mängelliste'}</button>
      <div class="bsb-defect-detail-head"><div>${readOnly?'<p class="eyebrow">READ-ONLY · '+esc(finding.findingNumber)+' · '+esc(object.name)+'</p>':`<p class="eyebrow">${esc(finding.findingNumber)} · ${esc(object.name)}</p>`}<h2>${esc(finding.name)}</h2></div>${readOnly?'':`<button type="button" class="secondary" data-bsb-edit-finding="${esc(object.id)}::${esc(finding.id)}">BEARBEITEN</button>`}</div>
      <p><span class="eyebrow">Istzustand</span><br>${esc(finding.actualCondition||'–')}</p>
      <p><span class="eyebrow">Sollzustand</span><br>${esc(finding.targetCondition||'–')}</p>
      ${finding.evaluation?`<p><span class="eyebrow">Bewertung</span><br>${esc(finding.evaluation)}</p>`:''}
      <p>${esc(finding.description)||'–'}</p>
      <div class="bsb-overview-stats">
        <div><span>Bereich / Geschoß</span><b>${esc(finding.area)} · ${esc(finding.floor)}</b></div>
        <div><span>Standort</span><b>${esc(finding.locationText||'–')}</b></div>
        <div><span>Kategorie</span><b>${esc(category)}</b></div>
        <div><span>Status</span><b class="bsb-status-text tone-${meta.tone}">${meta.label}</b></div>
        <div><span>Mangel festgestellt am</span><b>${detectionDateMarkup(finding)}</b></div>
        ${finding.closedAt?`<div><span>Behoben am</span><b>${dateLabel(finding.closedAt.slice(0,10))}</b></div>`:''}
        <div><span>Maßnahme</span><b>${esc(finding.measure||'–')}</b></div>
      </div>
      ${finding.photos.length?`<div class="bsb-photo-grid">${finding.photos.map(p=>`<div class="bsb-photo-thumb"><img data-photo-id="${esc(p.id)}" alt=""><small>${esc(p.caption)}</small></div>`).join('')}</div>`:''}
      <details class="bsb-history" open><summary>Verlauf</summary>${finding.statusHistory.map(h=>`<p><b class="bsb-status-text tone-${STATUS_META[h.status].tone}">${dateLabel(h.at.slice(0,10))} · ${STATUS_META[h.status].label}</b><small>${esc(h.by)}${h.note?' · '+esc(h.note):''}</small>${h.afterPhoto?`<span class="bsb-photo-thumb"><img data-photo-id="${esc(h.afterPhoto.id)}" alt=""><small>${esc(h.afterPhoto.caption||'Nachher')}</small></span>`:''}</p>`).join('')}</details>
    </div>`;
  }
  function findingDetailScreen(){
    const object=objectById(view.objectId);
    const finding=object?.bsbFindings.find(f=>f.id===view.findingId);
    if(!finding)return '<p class="bsb-empty">Mangel nicht gefunden.</p>';
    return findingDetailMarkup(object,finding,{readOnly:false,backScreen:'findings'});
  }
  function archiveFindingDetailScreen(){
    const object=objectById(view.objectId);
    const finding=object?.bsbFindings.find(f=>f.id===view.findingId);
    if(!finding)return '<p class="bsb-empty">Mangel nicht gefunden.</p>';
    return findingDetailMarkup(object,finding,{readOnly:true,backScreen:'archiveFindings'});
  }

  /* ---- Begehung abschließen ---- */
  function finishScreen(){
    const object=objectById(view.objectId);
    const {inspection}=findInspection(view.inspectionId);
    if(!object||!inspection)return '<p class="bsb-empty">Begehung nicht gefunden.</p>';
    const newFindings=object.bsbFindings.filter(f=>inspection.newFindingIds.includes(f.id));
    const rechecked=object.bsbFindings.filter(f=>inspection.recheckIds.includes(f.id));
    const resolved=rechecked.filter(f=>f.status==='RESOLVED');
    const stillOpen=rechecked.filter(f=>f.status==='STILL_OPEN');
    const preview=computeObjectSafetyScore(object);
    return `<div class="bsb-overview bsb-finish-summary">
      <h2>Begehung abschließen</h2>
      <div class="bsb-context-stack"><div><span>KUNDE</span><b>${esc(customerById(object.customerId)?.name)}</b></div><div><span>OBJEKT</span><b>${esc(object.name)}</b></div><div><span>DATUM</span><b>${dateLabel(inspection.date)}</b></div></div>
      <div class="bsb-summary-counts"><div><b>${newFindings.length}</b><span>Neue Mängel</span></div><div><b>${rechecked.length}</b><span>nachkontrolliert</span></div><div><b>${resolved.length}</b><span>davon behoben</span></div><div><b>${stillOpen.length}</b><span>weiterhin offen</span></div></div>
      ${safetyScoreCard(preview)}
      <label class="bsb-wide">Allgemeine Bemerkung<textarea id="bsbClosingRemark">${esc(inspection.closingRemark)}</textarea></label>
      <button type="button" class="bsb-hero-cta" data-bsb-finish-inspection="${esc(inspection.id)}">BEGEHUNG ABSCHLIESSEN</button>
    </div>`;
  }
  window.bsbFinishInspection=function(inspectionId){
    const {object,inspection}=findInspection(inspectionId);
    const remark=document.getElementById('bsbClosingRemark')?.value||'';
    const report=finishInspection(object,inspection,remark);
    if(!report)return;
    navigate({screen:'reportResult',objectId:object.id,inspectionId:inspection.id,reportId:report.id});
  };

  /* ---- Bericht / PDF ---- */
  function pdfModelForReport(object,customer,report){
    const reportCustomer=report.customerSnapshot?.name?report.customerSnapshot:customer;
    const reportObject=report.objectSnapshot?.name?report.objectSnapshot:object;
    const score=report.safetyScoreSnapshot||{grade:'–',percent:'–',ruleVersion:'nicht berechnet'};
    const findingRows=findings=>findings.map(finding=>{
      const meta=STATUS_META[finding.status]||STATUS_META.OPEN;
      const location=[finding.area,finding.floor,finding.locationText].filter(Boolean).join(' · ');
      return {title:`${finding.findingNumber||'Mangel'} · ${finding.name||findingTitle(finding.description)}`,details:[
        {text:`${location||'Standort nicht dokumentiert'} · festgestellt am ${dateLabel((finding.detectedAt||finding.createdAt||'').slice(0,10))} · ${meta.label}`,color:STATUS_PDF_COLOR[meta.tone]},
        finding.description?`Mangel: ${finding.description}`:'',
        finding.measure?`Maßnahme: ${finding.measure}`:'',
        finding.dueDate?`Frist: ${dateLabel(finding.dueDate)}`:'',
        arr(finding.photos).length?`Fotodokumentation: ${arr(finding.photos).length} Foto${arr(finding.photos).length===1?'':'s'}`:''
      ].filter(Boolean)};
    });
    const groundsRows=[];
    if(arr(report.newFindingsSnapshot).length)groundsRows.push({title:'Neue Mängel',rows:findingRows(arr(report.newFindingsSnapshot))});
    if(arr(report.recheckedFindingsSnapshot).length)groundsRows.push({title:'Nachkontrollierte Mängel',rows:findingRows(arr(report.recheckedFindingsSnapshot))});
    return {
      title:'BSB-Begehungsbericht',subtitle:reportObject.name,
      meta:`${reportCustomer.name} · ${reportObject.address} · Begehung ${dateLabel(report.date)} · Prüfer ${report.inspector}${report.participants?' · Teilnehmer: '+report.participants:''}`,
      score:`SAFETY-SCORE ${score.grade} · ${score.percent}%`,
      note:report.closingRemark||'',
      sections:[
        {title:'Kunde',rows:[{title:reportCustomer.name,details:[reportCustomer.address?formatAddress(reportCustomer.address):'']}]},
        {title:'Objekt',rows:[{title:reportObject.name,details:[reportObject.address,reportObject.objectType]}]},
        ...groundsRows
      ],
      footer:`Bericht ${report.id} · erzeugt ${dateTimeLabel(report.createdAt)} von ${report.createdBy} · Safety-Score-Regelwerk ${score.ruleVersion}`
    };
  }
  const blobDataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error||new Error('Bild konnte nicht gelesen werden.'));reader.readAsDataURL(blob);});
  async function bsbReportPhotoEntries(report){
    const snapshots=[...arr(report.newFindingsSnapshot),...arr(report.recheckedFindingsSnapshot)];
    const photos=snapshots.flatMap(finding=>arr(finding.photos).map(photo=>({finding,photo}))).filter(entry=>entry.photo?.id).slice(0,24);
    const entries=[];
    for(const entry of photos){
      try{
        const record=await window.INGTECPlatform?.getLocalFile?.(entry.photo.id);
        if(record?.blob)entries.push({dataUrl:await blobDataUrl(record.blob),caption:`${entry.finding.findingNumber||'Mangel'} · ${entry.photo.caption||entry.photo.name||'Foto'}`});
      }catch(error){}
    }
    return entries;
  }
  window.bsbDownloadReport=async function(objectId,reportId){
    const object=objectById(objectId);
    const customer=customerById(object?.customerId);
    const report=object?.bsbReports.find(r=>r.id===reportId);
    if(!report)return;
    if(!window.INGTECPdf?.download){showToast?.('Der PDF-Export wird noch geladen. Bitte versuche es gleich noch einmal.',null,null,'error');return;}
    const model=pdfModelForReport(object,customer,report);
    const filename=`BSB_Begehungsbericht_${object.name}_${report.date}`.replace(/[^A-Za-z0-9._-]+/g,'_');
    try{
      const photos=await bsbReportPhotoEntries(report);
      if(photos.length&&window.INGTECPdf.downloadWithImages)await window.INGTECPdf.downloadWithImages({...model,images:photos},filename);
      else window.INGTECPdf.download(model,filename);
    }catch(error){
      console.warn('[INGTEC BSB] PDF-Fotos konnten nicht eingebettet werden.',error);
      window.INGTECPdf.download(model,filename);
    }
    auditBsb('BSB-Bericht als PDF exportiert',`${object.name} · ${report.date}`,report.id);
    showToast?.('Bericht wurde als PDF heruntergeladen.');
  };
  function reportResultScreen(){
    const object=objectById(view.objectId);
    const report=object.bsbReports.find(r=>r.id===view.reportId);
    if(!report)return '<p class="bsb-empty">Bericht nicht gefunden.</p>';
    const releaseLabel=report.releaseApproved?'FREIGEGEBEN':'FINALISIERT';
    return `<div class="bsb-overview bsb-result-screen">
      <h2>Begehung abgeschlossen</h2>
      <p>${dateLabel(report.date)}<br>${esc(object.name)}</p>
      ${safetyScoreCard(report.safetyScoreSnapshot)}
      <p><span class="eyebrow">Freigabe-Status</span><br><strong>${releaseLabel}</strong>${report.finalizedBy?` · ${esc(report.finalizedBy)}`:''}</p>
      <div class="bsb-result-actions">
        <button type="button" class="primary" data-bsb-download-report="${esc(object.id)}::${esc(report.id)}">PDF HERUNTERLADEN</button>
        <button type="button" class="secondary" data-bsb-export-report="${esc(object.id)}::${esc(report.id)}">JSON EXPORT</button>
        <button type="button" class="secondary" data-bsb-nav="objectDashboard">ZUM OBJEKT</button>
      </div>
      ${report?.createdBy?`<p class="eyebrow">Freigabe</p><p>${esc(report.createdBy)} · ${dateTimeLabel(report.createdAt)}</p>`:''}
    </div>`;
  }
  window.bsbExportReportJson=function(objectId,reportId){
    const object=objectById(objectId);
    const report=object?.bsbReports.find(r=>r.id===reportId);
    if(!object||!report){showToast?.('Bericht nicht gefunden.',null,null,'error');return;}
    const payload={
      exportType:'BSB-Begehungsbericht',
      exportedAt:now(),
      objectId:object.id,
      customerId:object.customerId,
      objectName:object.name,
      reportId:report.id,
      date:report.date,
      createdAt:report.createdAt,
      createdBy:report.createdBy,
      releaseApproved:Boolean(report.releaseApproved),
      releaseState:report.releaseState||'FINALIZED',
      findings:[...report.newFindingsSnapshot,...report.recheckedFindingsSnapshot],
      safetyScoreSnapshot:report.safetyScoreSnapshot,
      closingRemark:report.closingRemark||''
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download=`BSB_Bericht_${object.name}_${report.date}.json`.replace(/[^A-Za-z0-9._-]+/g,'_');
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),0);
    bsbSyncQueueEntry('BSB-Bericht exportiert', 'BSB', report.id, `${object.name} · JSON Export`);
    save?.();
    showToast?.('Bericht als JSON exportiert.');
  };
  /* ---- Objektarchiv: read-only, ausschließlich object_id-scoped ---- */
  function recheckOutcomeCounts(object,inspection){
    let resolved=0,stillOpen=0;
    inspection.recheckIds.forEach(id=>{
      const finding=object.bsbFindings.find(f=>f.id===id);
      const entry=finding?.statusHistory.find(h=>h.inspectionId===inspection.id&&h.status!=='OPEN');
      if(entry?.status==='RESOLVED')resolved++;else if(entry?.status==='STILL_OPEN')stillOpen++;
    });
    return {resolved,stillOpen};
  }
  function archiveScreen(){
    const object=objectById(view.objectId);
    const customer=customerById(object?.customerId);
    if(!object||!customer)return '<p class="bsb-empty">Objekt nicht gefunden.</p>';
    return `<div class="bsb-overview">
      <button type="button" class="link" data-bsb-nav="objectDashboard">‹ Zurück zum Objekt</button>
      <p class="eyebrow">ARCHIV</p>
      <h2>${esc(customer.name)}</h2>
      <p>${esc(object.name)}<br>${esc(object.address)}</p>
      <button type="button" class="bsb-action-card is-primary" data-bsb-nav="archiveInspections">VERGANGENE BEGEHUNGEN</button>
      <button type="button" class="bsb-action-card is-primary" data-bsb-nav="archiveFindings">HISTORISCHE MÄNGEL</button>
    </div>`;
  }
  function archiveInspectionsScreen(){
    const object=objectById(view.objectId);
    if(!object)return '<p class="bsb-empty">Objekt nicht gefunden.</p>';
    const list=object.bsbInspections.filter(i=>i.status==='COMPLETED').sort((a,b)=>b.date.localeCompare(a.date));
    return `<div class="bsb-overview">
      <button type="button" class="link" data-bsb-nav="archive">‹ Zurück zum Archiv</button>
      <h2>Vergangene Begehungen</h2>
      <div class="bsb-report-list">${list.map(i=>{
        const outcome=recheckOutcomeCounts(object,i);
        const report=object.bsbReports.find(r=>r.inspectionId===i.id);
        return `<article class="card bsb-report-row"><div><b>${dateLabel(i.date)}</b><span>BSB-Begehung${i.safetyScoreSnapshot?' · Safety-Score '+esc(i.safetyScoreSnapshot.grade):''}</span><span>Neue Mängel: ${i.newFindingIds.length} · Behobene Mängel: ${outcome.resolved}</span></div><div class="bsb-report-row-actions"><button type="button" class="secondary" data-bsb-open-archive-inspection="${esc(i.id)}">ANSEHEN</button>${report?`<button type="button" class="secondary" data-bsb-download-report="${esc(object.id)}::${esc(report.id)}">PDF</button>`:''}</div></article>`;
      }).join('')||'<p class="bsb-empty">Noch keine abgeschlossene Begehung vorhanden.</p>'}</div>
    </div>`;
  }
  function archiveInspectionDetailScreen(){
    const object=objectById(view.objectId);
    const inspection=object?.bsbInspections.find(i=>i.id===view.inspectionId);
    if(!inspection)return '<p class="bsb-empty">Begehung nicht gefunden.</p>';
    const report=object.bsbReports.find(r=>r.inspectionId===inspection.id);
    const snapshotInspection=report?.inspectionSnapshot||inspection;
    const newFindings=report?.newFindingsSnapshot||object.bsbFindings.filter(f=>inspection.newFindingIds.includes(f.id));
    const rechecked=report?.recheckedFindingsSnapshot||object.bsbFindings.filter(f=>inspection.recheckIds.includes(f.id));
    return `<div class="bsb-overview bsb-defect-detail">
      <button type="button" class="link" data-bsb-nav="archiveInspections">‹ Zurück zu vergangenen Begehungen</button>
      <p class="eyebrow">READ-ONLY · ${dateLabel(snapshotInspection.date)}</p>
      <h2>BSB-Begehung</h2>
      <p class="bsb-archive-note">${report?'Gespeicherter Berichts-Snapshot: spätere Änderungen an einem Live-Mangel verändern diese Archivansicht nicht.':'Historische Lesansicht: Für diese ältere Begehung liegt noch kein vollständiger Snapshot vor.'}</p>
      <div class="bsb-overview-stats">
        <div><span>Prüfer</span><b>${esc(snapshotInspection.inspector)}</b></div>
        <div><span>Teilnehmer</span><b>${esc(snapshotInspection.participants||'–')}</b></div>
        <div><span>Neue Mängel</span><b>${newFindings.length}</b></div>
        <div><span>Nachkontrolliert</span><b>${rechecked.length}</b></div>
      </div>
      ${snapshotInspection.safetyScoreSnapshot?safetyScoreCard(snapshotInspection.safetyScoreSnapshot):''}
      ${snapshotInspection.finalizedBy?`<p><span class="eyebrow">Freigegeben durch</span><br>${esc(snapshotInspection.finalizedBy)}${snapshotInspection.finalizedByRole?` · ${esc(snapshotInspection.finalizedByRole)}`:''}</p>`:''}
      ${snapshotInspection.closingRemark?`<p><span class="eyebrow">Allgemeine Bemerkung</span><br>${esc(snapshotInspection.closingRemark)}</p>`:''}
      ${newFindings.length?`<h3>Neue Mängel</h3><div class="bsb-finding-list">${newFindings.map(archiveFindingSnapshotCard).join('')}</div>`:''}
      ${rechecked.length?`<h3>Nachkontrollierte Mängel</h3><div class="bsb-finding-list">${rechecked.map(archiveFindingSnapshotCard).join('')}</div>`:''}
      ${report?`<button type="button" class="secondary bsb-btn-wide" data-bsb-download-report="${esc(object.id)}::${esc(report.id)}">PDF HERUNTERLADEN</button>`:''}
    </div>`;
  }
  function archiveFindingSnapshotCard(finding){
    const meta=STATUS_META[finding.status]||STATUS_META.OPEN;
    const category=(state.bsbConfig.categories.find(item=>item.id===finding.category)||{}).label||finding.category||'–';
    const photo=arr(finding.photos)[0];
    return `<article class="card bsb-archive-finding-card">${photo?`<img class="bsb-finding-preview-photo" data-photo-id="${esc(photo.id)}" alt="">`:''}<div><div class="bsb-finding-row-head"><b>${esc(finding.findingNumber||'Mangel')}</b><span class="bsb-status-text tone-${meta.tone}">${meta.label}</span></div><h4>${esc(finding.name||findingTitle(finding.description))}</h4><p>${esc(finding.floor||'–')} · ${esc(finding.area||'–')}${finding.locationText?' · '+esc(finding.locationText):''}</p>${dueDateMarkup(finding)}<details><summary>Details anzeigen</summary><p>${esc(finding.description||'–')}</p><p><span class="eyebrow">Maßnahme</span><br>${esc(finding.measure||'–')}</p>${finding.actualCondition?`<p><span class="eyebrow">Istzustand</span><br>${esc(finding.actualCondition)}</p>`:''}${finding.targetCondition?`<p><span class="eyebrow">Sollzustand</span><br>${esc(finding.targetCondition)}</p>`:''}<p><span class="eyebrow">Kategorie</span><br>${esc(category)}</p></details></div></article>`;
  }
  function archiveFindingsScreen(){
    const object=objectById(view.objectId);
    if(!object)return '<p class="bsb-empty">Objekt nicht gefunden.</p>';
    const list=object.bsbFindings.slice().sort((a,b)=>(b.detectedAt||b.createdAt).localeCompare(a.detectedAt||a.createdAt));
    return `<div class="bsb-overview">
      <button type="button" class="link" data-bsb-nav="archive">‹ Zurück zum Archiv</button>
      <h2>Historische Mängel</h2>
      <div class="bsb-finding-list">${list.map(f=>findingRow(f,{archive:true})).join('')||'<p class="bsb-empty">Für dieses Objekt sind noch keine Mängel erfasst.</p>'}</div>
    </div>`;
  }

  /* ---------- Demodaten ---------- */
  function seedDemoData(){
    const t=viennaToday();
    const steiner=ensureCustomer('Steiner GmbH',{customerNumber:'K-1042'});
    Object.assign(steiner,{address:{street:'Industriestraße 10',postalCode:'9020',city:'Klagenfurt',country:'Österreich'},contact:{name:'Max Mustermann',role:'Facility Management',phone:'+43 463 123456',mobile:'+43 664 1234567',email:'mustermann@steiner-gmbh.at'},keyAvailable:true,keyLabel:'S-17',accessNotes:'Anmeldung beim Empfang',visitNotes:'Technikräume nur gemeinsam mit Haustechnik zugänglich.'});
    const object1=createObject(steiner,{name:'Betriebsgebäude Klagenfurt',objectNumber:'OBJ-101',objectType:'Betriebsgebäude',street:'Industriestraße 10',postalCode:'9020',city:'Klagenfurt',country:'Österreich',contactName:'Franz Huber',contactPhone:'+43 664 7654321'});
    object1.nextInspectionDate=addDays(t,34);
    seedInspectionHistory(object1,[
      {area:'Garage',floor:'UG 1',locationText:'Stellplatz 5',category:'abschluesse',name:'Brandschutztür verkeilt',description:'Tür zur Tiefgarage mit Holzkeil fixiert.',severity:'hoch',status:'STILL_OPEN'},
      {area:'Flucht- und Rettungsweg',floor:'EG',locationText:'Fluchtweg Ost',category:'fluchtwege',name:'Fluchtweg teilweise verstellt',description:'Kartons im Fluchtwegbereich.',severity:'mittel',status:'OPEN'},
      {area:'Technikbereich',floor:'UG 1',locationText:'Technikraum 02',category:'brandmeldung',name:'Handfeuermelder verstellt',description:'Zugang durch Lagerung erschwert.',severity:'mittel',status:'OPEN'}
    ],'2026-08-12');
    const object2=createObject(steiner,{name:'Lager Klagenfurt',objectNumber:'OBJ-102',objectType:'Lager',street:'Industriestraße 12',postalCode:'9020',city:'Klagenfurt',country:'Österreich'});
    object2.nextInspectionDate=addDays(t,5);
    seedInspectionHistory(object2,[{area:'Lager',floor:'EG',locationText:'Regalreihe 3',category:'lagerung',name:'Sicherheitsabstand unterschritten',description:'Abstand zur Sprinklerdüse zu gering.',severity:'gering',status:'OPEN'}],'2026-08-05');
    const object3=createObject(steiner,{name:'Werkstätte Villach',objectNumber:'OBJ-103',objectType:'Werkstätte',street:'Gewerbestraße 15',postalCode:'9500',city:'Villach',country:'Österreich'});
    object3.nextInspectionDate=addDays(t,60);

    const reinbold=ensureCustomer('Reinbold GmbH');
    Object.assign(reinbold,{customerNumber:reinbold.customerNumber||'K-1001',address:{street:'',postalCode:'9800',city:'Spittal an der Drau',country:'Österreich'}});
    let legacyObject=arr(state.projects).find(p=>p.customerId===reinbold.id&&p.name==='Produktionshalle Nord');
    const object4=legacyObject?ensureObjectShape(legacyObject):createObject(reinbold,{name:'Produktionshalle Nord',objectNumber:'OBJ-201',objectType:'Produktionsbetrieb',street:'',postalCode:'9800',city:'Spittal an der Drau',country:'Österreich'});
    if(!object4.bsbInspections.length){
      object4.nextInspectionDate=addDays(t,45);
      seedInspectionHistory(object4,[{area:'Büro',floor:'OG 1',locationText:'Empfang',category:'loeschmittel',name:'Feuerlöscher Prüfplakette überfällig',description:'Wartungsintervall überschritten.',severity:'gering',status:'OPEN'}],'2026-08-02');
    }

    const pletzer=ensureCustomer('Pletzer Gruppe',{customerNumber:'K-1088'});
    createObject(pletzer,{name:'Bürogebäude Feldkirchen',objectNumber:'OBJ-301',objectType:'Bürogebäude',street:'Hauptplatz 3',postalCode:'9560',city:'Feldkirchen in Kärnten',country:'Österreich'});
  }
  function seedInspectionHistory(object,findingSpecs,inspectionDate){
    const inspection={id:nextInspectionId(),objectId:object.id,customerId:object.customerId,date:inspectionDate,inspector:'M. Šop',participants:'',remark:'',status:'COMPLETED',newFindingIds:[],recheckIds:[],startedAt:inspectionDate+'T09:00:00.000Z',completedAt:inspectionDate+'T10:00:00.000Z',closingRemark:'Erste Begehung.'};
    object.bsbInspections.push(inspection);
    findingSpecs.forEach(spec=>{
      const finding=createFinding(object,inspection,{...spec,measure:spec.measure||'Mangel beheben und Wirksamkeit dokumentieren.',photos:[]});
      if(spec.status==='STILL_OPEN'){
        finding.statusHistory.push({at:addDays(inspectionDate,15)+'T09:00:00.000Z',by:'M. Šop',status:'STILL_OPEN',inspectionId:'BEG-SEED-RECHECK',note:'Bei Nachkontrolle weiterhin vorhanden.'});
        finding.status='STILL_OPEN';
      }
    });
    object.bsbReports.push(createReportSnapshot(object,{...inspection,safetyScoreSnapshot:recalcObjectSafetyScore(object)}));
  }
  function ensure(){
    ensureConfig();
    ensureBsbPersistenceState();
    ensureBsbScoreRuleset();
    const demoRequested=new URL(location.href).searchParams.get('bsb-demo')==='1';
    if(demoRequested&&!state.bsbDemoSeededV4){seedDemoData();state.bsbDemoSeededV4=true;save?.();}
    const objects=arr(state.projects).filter(isBsbObject);
    objects.forEach(ensureObjectShape);
    const customerIds=new Set(objects.map(object=>object.customerId).filter(Boolean));
    arr(state.customers).filter(customer=>customerIds.has(customer.id)).forEach(ensureCustomerShape);
  }

  /* ---------- Seiten-Dispatcher ---------- */
  function page(){
    ensure();
    let body='';
    if(view.screen==='objects')body=objectsScreen();
    else if(view.screen==='allObjects')body=allObjectsScreen();
    else if(view.screen==='objectDashboard')body=objectDashboardScreen();
    else if(view.screen==='prepare')body=prepareScreen();
    else if(view.screen==='walk')body=walkScreen();
    else if(view.screen==='findings')body=findingsScreen();
    else if(view.screen==='findingsGlobal')body=findingsGlobalScreen();
    else if(view.screen==='more')body=moreScreen();
    else if(view.screen==='findingDetail')body=findingDetailScreen();
    else if(view.screen==='finish')body=finishScreen();
    else if(view.screen==='reportResult')body=reportResultScreen();
    else if(view.screen==='archive')body=archiveScreen();
    else if(view.screen==='archiveInspections')body=archiveInspectionsScreen();
    else if(view.screen==='archiveInspectionDetail')body=archiveInspectionDetailScreen();
    else if(view.screen==='archiveFindings')body=archiveFindingsScreen();
    else if(view.screen==='archiveFindingDetail')body=archiveFindingDetailScreen();
    else body=startScreen();
    const back=bsbBackTarget();
    const backButton=back?`<button type="button" class="bsb-back-button" data-bsb-history-back aria-label="Zurück">←</button>`:'';
    return `<section class="page bsb-workspace" id="bsb"><div class="section-head bsb-page-head"><div><span class="eyebrow">BSB</span><h2>Brandschutzbegehungen</h2></div>${backButton}</div>${contextHeader()}${body}</section>`;
  }
  const initialRouteView=routeViewFromLocation();
  if(initialRouteView)view=initialRouteView;
  window.bsb=page;
  window.bsbSetScreen=setBsbScreen;
  window.bsbRefresh=function(){bsbRender();syncBsbHistory('replace');};
  window.bsbOpenContext=function(customerId,objectId){
    if(document.querySelector('.page.active')?.id!=='bsb')window.setPage?.('bsb');
    if(objectId)navigate({screen:'objectDashboard',customerId,objectId,inspectionId:'',findingId:'',reportId:''});
    else navigate({screen:'objects',customerId,objectId:'',inspectionId:'',findingId:'',reportId:''});
  };
  window.addEventListener('popstate',()=>{
    if(!isBsbLocation())return;
    closeFindingForm();
    window.bsbCloseCustomerInfo?.();
    window.bsbCloseObjectInfo?.();
    const routed=routeViewFromLocation();
    view=routed||{...DEFAULT_VIEW};
    bsbRender();
  });

  /* ---------- Ereignisse ---------- */
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;
    const crumb=target.closest('[data-bsb-crumb]');
    if(crumb){event.preventDefault();const target2=crumb.dataset.bsbCrumb,id=crumb.dataset.bsbCrumbId;navigate(target2==='start'?{screen:'start'}:target2==='objects'?{screen:'objects',customerId:id}:{screen:'objectDashboard',objectId:id});return;}
    const historyBack=target.closest('[data-bsb-history-back]');
    if(historyBack){
      event.preventDefault();
      if(Number(history.state?.ingtecBsbDepth)>0){history.back();return;}
      const fallback=bsbBackTarget();
      if(fallback)navigate(fallback,{historyMode:'replace'});
      return;
    }
    const nav=target.closest('[data-bsb-nav]');
    if(nav){
      event.preventDefault();
      const patch={screen:nav.dataset.bsbNav};
      if(nav.dataset.bsbNavObject)patch.objectId=nav.dataset.bsbNavObject;
      if(nav.dataset.bsbNavCustomer)patch.customerId=nav.dataset.bsbNavCustomer;
      if(nav.dataset.bsbNavInspection)patch.inspectionId=nav.dataset.bsbNavInspection;
      if(nav.dataset.bsbNavFinding)patch.findingId=nav.dataset.bsbNavFinding;
      if(nav.dataset.bsbNavReport)patch.reportId=nav.dataset.bsbNavReport;
      navigate(patch);
      return;
    }
    const kpi=target.closest('[data-bsb-kpi]');
    if(kpi){event.preventDefault();navigate({screen:kpi.dataset.bsbKpi,objectsFilter:kpi.dataset.bsbKpiExtra||''});return;}
    const customerInfo=target.closest('[data-bsb-customer-info]');
    if(customerInfo){event.preventDefault();window.bsbOpenCustomerInfo(customerInfo.dataset.bsbCustomerInfo);return;}
    const objectInfo=target.closest('[data-bsb-object-info]');
    if(objectInfo){event.preventDefault();window.bsbOpenObjectInfo(objectInfo.dataset.bsbObjectInfo);return;}
    const pickCustomer=target.closest('[data-bsb-pick-customer]');
    if(pickCustomer){event.preventDefault();navigate({screen:'objects',customerId:pickCustomer.dataset.bsbPickCustomer});return;}
    const openObject=target.closest('[data-bsb-open-object]');
    if(openObject){event.preventDefault();const object=objectById(openObject.dataset.bsbOpenObject);navigate({screen:'objectDashboard',customerId:object.customerId,objectId:object.id});return;}
    const objectArchive=target.closest('[data-bsb-object-archive]');
    if(objectArchive){event.preventDefault();const object=objectById(objectArchive.dataset.bsbObjectArchive);navigate({screen:'archive',customerId:object.customerId,objectId:object.id});return;}
    const openArchiveInspection=target.closest('[data-bsb-open-archive-inspection]');
    if(openArchiveInspection){event.preventDefault();navigate({screen:'archiveInspectionDetail',inspectionId:openArchiveInspection.dataset.bsbOpenArchiveInspection});return;}
    const resumeInspection=target.closest('[data-bsb-resume-inspection]');
    if(resumeInspection){event.preventDefault();navigate({screen:'walk',inspectionId:resumeInspection.dataset.bsbResumeInspection});return;}
    const beginInspection=target.closest('[data-bsb-begin-inspection]');
    if(beginInspection){event.preventDefault();window.bsbBeginInspection();return;}
    const addFinding=target.closest('[data-bsb-add-finding]');
    if(addFinding){event.preventDefault();openFindingForm(view.objectId,view.inspectionId);return;}
    const editFinding=target.closest('[data-bsb-edit-finding]');
    if(editFinding){event.preventDefault();const [objectId,findingId]=editFinding.dataset.bsbEditFinding.split('::');const finding=objectById(objectId)?.bsbFindings.find(f=>f.id===findingId);openFindingForm(objectId,finding?.inspectionId||'',findingId);return;}
    const openFindings=target.closest('[data-bsb-open-findings]');
    if(openFindings){event.preventDefault();navigate({screen:'findings',objectId:openFindings.dataset.bsbOpenFindings,findingsStatusFilter:'all'});return;}
    const openFinding=target.closest('[data-bsb-open-finding]');
    if(openFinding){event.preventDefault();const objId=openFinding.dataset.bsbOpenFindingObject||view.objectId;navigate({screen:'findingDetail',objectId:objId,findingId:openFinding.dataset.bsbOpenFinding});return;}
    const openArchiveFinding=target.closest('[data-bsb-open-archive-finding]');
    if(openArchiveFinding){event.preventDefault();const objId=openArchiveFinding.dataset.bsbOpenFindingObject||view.objectId;navigate({screen:'archiveFindingDetail',objectId:objId,findingId:openArchiveFinding.dataset.bsbOpenArchiveFinding});return;}
    const statusFilter=target.closest('[data-bsb-findings-status]');
    if(statusFilter){event.preventDefault();navigate({findingsStatusFilter:statusFilter.dataset.bsbFindingsStatus},{historyMode:'replace'});return;}
    const finishInspectionBtn=target.closest('[data-bsb-finish-inspection]');
    if(finishInspectionBtn){event.preventDefault();window.bsbFinishInspection(finishInspectionBtn.dataset.bsbFinishInspection);return;}
    const downloadReport=target.closest('[data-bsb-download-report]');
    if(downloadReport){event.preventDefault();const [objectId,reportId]=downloadReport.dataset.bsbDownloadReport.split('::');window.bsbDownloadReport(objectId,reportId);return;}
    const exportReport=target.closest('[data-bsb-export-report]');
    if(exportReport){event.preventDefault();const [objectId,reportId]=exportReport.dataset.bsbExportReport.split('::');window.bsbExportReportJson(objectId,reportId);return;}
  });
  document.addEventListener('change',event=>{
    const areaFilter=event.target.closest?.('[data-bsb-findings-area]');
    if(areaFilter){view.findingsAreaFilter=areaFilter.value;bsbRender();return;}
    const categoryFilter=event.target.closest?.('[data-bsb-findings-category]');
    if(categoryFilter){view.findingsCategoryFilter=categoryFilter.value;bsbRender();return;}
  });
  document.addEventListener('input',event=>{
    const startSearch=event.target.closest?.('[data-bsb-search]');
    const findingsSearch=event.target.closest?.('[data-bsb-findings-search]');
    const search=startSearch||findingsSearch;
    if(!search)return;
    if(startSearch)view.searchQuery=search.value;
    else view.findingsQuery=search.value;
    const caret=search.selectionStart;
    const selector=startSearch?'[data-bsb-search]':'[data-bsb-findings-search]';
    bsbRender();
    setTimeout(()=>{const restored=document.querySelector(selector);if(restored){restored.focus();restored.setSelectionRange(caret,caret);}},0);
  });

  /* ---------- Selbsttests ---------- */
  window.runBsbWorkspaceTests=function(){
    const before=JSON.stringify({auditEvents:arr(state.auditEvents),syncQueue:arr(state.syncQueue),lastSavedAt:state._meta?.lastSavedAt||''});
    const projects=arr(state.projects);
    const bsbObjects=projects.filter(isBsbObject);
    const bsbObjectIds=new Set(bsbObjects.map(object=>text(object.id)).filter(Boolean));
    const report=bsbObjects.flatMap(object=>arr(object.bsbReports).map(item=>({object,item}))).find(Boolean);
    const tests=[
      {name:'BSB nutzt die kanonischen Kunden- und Objektlisten ohne parallele Datenwelt',passed:Array.isArray(state.customers)&&Array.isArray(state.projects)&&!Object.prototype.hasOwnProperty.call(state,'bsbCustomers')&&!Object.prototype.hasOwnProperty.call(state,'bsbObjects')},
      {name:'BSB-Objekte sind explizit markiert; fremde Projekte werden nicht vereinnahmt',passed:bsbObjects.every(isBsbObject)&&projects.filter(project=>!isBsbObject(project)).every(project=>!bsbObjectIds.has(text(project.id)))},
      {name:'Mangelbezug bleibt Kunde → Objekt → Begehung',passed:bsbObjects.every(object=>arr(object.bsbFindings).every(finding=>finding.objectId===object.id&&finding.customerId===object.customerId&&finding.inspectionId))},
      {name:'Statusmodell zeigt Text und semantische Farbe',passed:Object.keys(STATUS_META).sort().join(',')==='OPEN,RESOLVED,STILL_OPEN'&&STATUS_META.STILL_OPEN.tone==='red'&&STATUS_META.RESOLVED.tone==='green'},
      {name:'Die Kurzmaske verlangt nur Ort, Kategorie und Mangeltext',passed:validateFindingDraft({area:'Technikbereich',floor:'EG',category:'technik',description:'Beschriftung fehlt'}).length===0&&validateFindingDraft({area:'',floor:'EG',category:'technik',description:'x'}).includes('Bereich')},
      {name:'Safety-Score nutzt das bestehende Regelwerks-Register',passed:Boolean(window.INGTEC_SAFETY_SCORE_RULESETS?.['INGTEC-BSB-2026.1'])&&!Object.prototype.hasOwnProperty.call(state,'bsbSafetyScore')},
      {name:'Archivberichte enthalten unabhängige Mangel-Snapshots',passed:!report||(Array.isArray(report.item.newFindingsSnapshot)&&Array.isArray(report.item.recheckedFindingsSnapshot)&&report.item.newFindingsSnapshot!==report.object.bsbFindings)},
      {name:'Unvollständige Deep-Links werden nicht gerendert',passed:sanitizeRouteView({screen:'prepare'})===null&&sanitizeRouteView({screen:'walk',objectId:'',inspectionId:''})===null},
      {name:'Schreibende Aktionen bleiben berechtigungsgeschützt',passed:String(createObject).includes('requirePermission')&&String(createFinding).includes('requirePermission')&&String(updateFinding).includes('requirePermission')&&String(startInspection).includes('requirePermission')},
      {name:'Der BSB-Selbsttest verändert weder Audit noch Synchronisationsqueue',passed:before===JSON.stringify({auditEvents:arr(state.auditEvents),syncQueue:arr(state.syncQueue),lastSavedAt:state._meta?.lastSavedAt||''})}
    ];
    return {passed:tests.every(test=>test.passed),tests,nonMutating:true};
  };
  ensure();
  const bsbTests=window.runBsbWorkspaceTests();
  window.__INGTEC_BSB_TESTS__=bsbTests;
  document.documentElement.dataset.bsbTests=bsbTests.passed?'passed':'failed';

  // Die Plattform ergänzt danach noch Kompatibilitätsprojekte. Erst im nächsten
  // Event-Loop wird deshalb die Shell einmal vollständig aufgebaut.
  setTimeout(()=>{
    window.renderAll?.();
    if(location.hash==='#bsb')setActivePage?.('bsb');
  },0);
  const params=new URL(location.href).searchParams;
  if(params.get('bsb-test')==='1'){
    const pre=document.createElement('pre');
    pre.id='bsbTestResults';
    pre.hidden=true;
    pre.textContent=JSON.stringify(bsbTests);
    document.body.appendChild(pre);
  }
})();
