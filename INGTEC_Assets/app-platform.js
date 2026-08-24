(()=>{
  'use strict';

  const VERSION='2.3.0';
  const SCHEMA_VERSION=3;
  const STORAGE_KEY='ingtecEnterprise';
  const BACKUP_KEY='ingtecEnterprise.backup';
  const CHECKPOINT_KEY='ingtecEnterprise.checkpoint';
  const QUARANTINE_KEY='ingtecEnterprise.quarantine';
  const FILE_DB_NAME='ingtec-platform-files';
  const FILE_STORE='files';
  const MAX_LOCAL_BYTES=4.5*1024*1024;
  const ARRAY_KEYS=['orders','projects','completedProjects','inspections','findings','measures','documents','invoices','calendarEvents','auditLog','safetyScoreHistory','profiles','userAccounts','customAccessRoles'];
  const ALLOWED_INSPECTION_STATES=['Vorbereitung','In Bearbeitung','In QS','Technisch freigegeben','Finalisiert'];
  const BLOCKED_FILE_EXTENSIONS=new Set(['html','htm','svg','js','mjs','cjs','exe','dll','bat','cmd','ps1','sh','jar','msi']);
  const ALLOWED_FILE_EXTENSIONS=new Set(['pdf','jpg','jpeg','png','webp','heic','doc','docx','xls','xlsx','csv','txt','msg','eml','dwg','dxf']);
  const EXPECTED_MIME_TYPES={
    pdf:new Set(['application/pdf']),
    jpg:new Set(['image/jpeg']),jpeg:new Set(['image/jpeg']),png:new Set(['image/png']),webp:new Set(['image/webp']),heic:new Set(['image/heic','image/heif']),
    doc:new Set(['application/msword']),docx:new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
    xls:new Set(['application/vnd.ms-excel']),xlsx:new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
    csv:new Set(['text/csv','application/csv']),txt:new Set(['text/plain']),msg:new Set(['application/vnd.ms-outlook']),eml:new Set(['message/rfc822'])
  };
  const MAX_FILE_BYTES=25*1024*1024;
  const MAX_IMAGE_BYTES=12*1024*1024;
  let lastStorageNotice=0;
  let lastFocus=null;

  const isObject=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
  const asArray=value=>Array.isArray(value)?value:[];
  const cleanText=value=>String(value??'').trim();
  const now=()=>new Date().toISOString();
  const bytes=value=>new Blob([value]).size;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const newFileId=()=>{
    const suffix=window.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now().toString(36);
    return 'FILE-'+suffix;
  };
  const notify=(message,type)=>{
    if(typeof window.showToast==='function')window.showToast(message,null,null,type);
    else console[type==='error'?'error':'info']('[INGTEC]',message);
  };
  const currentState=()=>typeof state!=='undefined'&&isObject(state)?state:null;
  const storageAvailable=()=>{
    try{const key='__ingtec_storage_probe__';localStorage.setItem(key,'1');localStorage.removeItem(key);return true}catch(error){return false}
  };
  const parseStored=raw=>{try{return {ok:true,value:JSON.parse(raw)}}catch(error){return {ok:false,error}}};
  const entityId=item=>cleanText(item?.id||item?.number||item?.name);

  function duplicateIds(values){
    const seen=new Set(),duplicates=new Set();
    asArray(values).forEach(item=>{const id=entityId(item);if(!id)return;if(seen.has(id))duplicates.add(id);seen.add(id);});
    return [...duplicates];
  }

  function validateState(candidate=currentState()){
    const errors=[],warnings=[];
    if(!isObject(candidate))return {ok:false,errors:['Der Anwendungszustand ist kein Objekt.'],warnings,checkedAt:now()};
    ARRAY_KEYS.forEach(key=>{if(candidate[key]!=null&&!Array.isArray(candidate[key]))errors.push(key+' muss eine Liste sein.');});
    ['orders','projects','completedProjects','inspections','findings','measures','documents','invoices'].forEach(key=>{
      const duplicates=duplicateIds(candidate[key]);
      if(duplicates.length)errors.push(key+': doppelte Kennungen '+duplicates.join(', '));
    });
    const projects=[...asArray(candidate.projects),...asArray(candidate.completedProjects)];
    const projectIds=new Set(projects.map(entityId).filter(Boolean));
    const orderIds=new Set(asArray(candidate.orders).map(entityId).filter(Boolean));
    const inspectionIds=new Set(asArray(candidate.inspections).map(entityId).filter(Boolean));
    const findingIds=new Set(asArray(candidate.findings).map(entityId).filter(Boolean));
    asArray(candidate.inspections).forEach(item=>{
      if(item?.projectId&&!projectIds.has(cleanText(item.projectId)))warnings.push('Prüfung '+entityId(item)+' verweist auf ein fehlendes Objekt.');
      if(item?.orderId&&!orderIds.has(cleanText(item.orderId)))warnings.push('Prüfung '+entityId(item)+' verweist auf einen fehlenden Auftrag.');
      if(item?.status&&!ALLOWED_INSPECTION_STATES.includes(cleanText(item.status)))warnings.push('Prüfung '+entityId(item)+' hat den unbekannten Status „'+cleanText(item.status)+'“.');
    });
    asArray(candidate.findings).forEach(item=>{if(item?.inspectionId&&!inspectionIds.has(cleanText(item.inspectionId)))warnings.push('Feststellung '+entityId(item)+' verweist auf eine fehlende Prüfung.');});
    asArray(candidate.measures).forEach(item=>{if(item?.findingId&&!findingIds.has(cleanText(item.findingId)))warnings.push('Maßnahme '+entityId(item)+' verweist auf eine fehlende Feststellung.');});
    asArray(candidate.documents).forEach(item=>{
      if(item?.projectId&&!projectIds.has(cleanText(item.projectId)))warnings.push('Dokument '+entityId(item)+' verweist auf ein fehlendes Objekt.');
      if(item?.inspectionId&&!inspectionIds.has(cleanText(item.inspectionId)))warnings.push('Dokument '+entityId(item)+' verweist auf eine fehlende Prüfung.');
    });
    const report=candidate.report;
    if(report?.status==='Finalisiert'&&!report.customerReleasedAt)warnings.push('Finalisierter Bericht hat keinen Zeitpunkt der Kundenfreigabe.');
    return {ok:errors.length===0,errors,warnings:[...new Set(warnings)].slice(0,100),checkedAt:now()};
  }

  function repairState(candidate=currentState()){
    if(!isObject(candidate))return {changed:false,changes:[]};
    const changes=[];
    ARRAY_KEYS.forEach(key=>{if(!Array.isArray(candidate[key])){candidate[key]=[];changes.push(key+' initialisiert');}});
    if(!isObject(candidate._meta)){candidate._meta={};changes.push('Metadaten initialisiert');}
    candidate._meta.schemaVersion=SCHEMA_VERSION;
    candidate._meta.platformVersion=VERSION;
    const projects=[...candidate.projects,...candidate.completedProjects];
    const projectById=new Map(projects.map(project=>[cleanText(project?.id),project]));
    const orderById=new Map(candidate.orders.map(order=>[cleanText(order?.id),order]));
    projects.forEach(project=>{
      const order=orderById.get(cleanText(project?.orderId));
      if(order&&!asArray(order.projectIds).includes(project.id)){order.projectIds=[...asArray(order.projectIds),project.id];changes.push('Objekt '+project.id+' mit Auftrag verknüpft');}
    });
    candidate.inspections.forEach(inspection=>{
      const project=projectById.get(cleanText(inspection?.projectId));
      if(project?.orderId&&!inspection.orderId){inspection.orderId=project.orderId;changes.push('Auftragsbezug für Prüfung '+entityId(inspection)+' ergänzt');}
      const order=orderById.get(cleanText(inspection?.orderId));
      if(order&&!asArray(order.inspectionIds).includes(inspection.id)){order.inspectionIds=[...asArray(order.inspectionIds),inspection.id];changes.push('Prüfung '+inspection.id+' mit Auftrag verknüpft');}
    });
    ['findings','measures','documents','calendarEvents'].forEach(key=>candidate[key].forEach(item=>{
      const project=projectById.get(cleanText(item?.projectId));
      if(project?.orderId&&!item.orderId){item.orderId=project.orderId;changes.push('Auftragsbezug für '+key+' ergänzt');}
    }));
    candidate.findings.forEach(finding=>{
      if(!finding?.planPosition)return;
      ['x','y'].forEach(axis=>{const value=Number(finding.planPosition[axis]);const bounded=Math.max(0,Math.min(100,Number.isFinite(value)?value:0));if(value!==bounded){finding.planPosition[axis]=bounded;changes.push('Planposition begrenzt');}});
    });
    candidate._meta.lastRepairAt=changes.length?now():candidate._meta.lastRepairAt||'';
    return {changed:changes.length>0,changes:[...new Set(changes)]};
  }

  function safeSave(){
    const candidate=currentState();
    if(!candidate||!storageAvailable())return false;
    try{
      repairState(candidate);
      candidate._meta.lastSavedAt=now();
      const report=validateState(candidate);
      if(!report.ok)throw new Error(report.errors.join(' '));
      const serialized=JSON.stringify(candidate);
      if(bytes(serialized)>MAX_LOCAL_BYTES)throw new Error('Der lokale Datenstand überschreitet das sichere Speicherlimit von 4,5 MB. Große Dateien bitte in der Dokumentenablage speichern.');
      const previous=localStorage.getItem(STORAGE_KEY);
      if(previous){const parsed=parseStored(previous);if(parsed.ok&&validateState(parsed.value).ok)localStorage.setItem(BACKUP_KEY,previous);}
      localStorage.setItem(CHECKPOINT_KEY,serialized);
      localStorage.setItem(STORAGE_KEY,serialized);
      localStorage.removeItem(CHECKPOINT_KEY);
      window.dispatchEvent(new CustomEvent('ingtec:state-saved',{detail:{at:candidate._meta.lastSavedAt,bytes:bytes(serialized)}}));
      return true;
    }catch(error){
      console.error('[INGTEC] Speichern fehlgeschlagen',error);
      if(Date.now()-lastStorageNotice>4000){lastStorageNotice=Date.now();notify('Speichern fehlgeschlagen: '+error.message,'error');}
      return false;
    }
  }

  function quarantineCorruptStorage(){
    if(!storageAvailable())return;
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw)return;
    const parsed=parseStored(raw);
    if(parsed.ok)return;
    try{localStorage.setItem(QUARANTINE_KEY,JSON.stringify({capturedAt:now(),raw:raw.slice(0,250000)}));}catch(error){}
  }

  function restoreBackup(){
    if(!storageAvailable())return false;
    const raw=localStorage.getItem(BACKUP_KEY);
    const parsed=raw?parseStored(raw):{ok:false};
    if(!parsed.ok||!validateState(parsed.value).ok){notify('Es ist kein gültiger Wiederherstellungspunkt vorhanden.','error');return false;}
    if(!window.confirm('Den letzten gültigen Datenstand wiederherstellen? Der aktuelle Stand wird vorher als Checkpoint gesichert.'))return false;
    const current=localStorage.getItem(STORAGE_KEY);
    if(current)localStorage.setItem(CHECKPOINT_KEY,current);
    localStorage.setItem(STORAGE_KEY,raw);
    location.reload();
    return true;
  }

  function exportBackup(){
    const candidate=currentState();
    if(!candidate)return false;
    const payload={format:'INGTEC Inspect Backup',schemaVersion:SCHEMA_VERSION,exportedAt:now(),state:clone(candidate)};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download='INGTEC-Inspect-Backup-'+new Date().toISOString().slice(0,10)+'.json';link.rel='noopener';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),0);
    return true;
  }

  function validateFile(file){
    if(!file)return {ok:false,message:'Keine Datei ausgewählt.'};
    const extension=cleanText(file.name).split('.').pop().toLowerCase();
    if(BLOCKED_FILE_EXTENSIONS.has(extension))return {ok:false,message:'Der Dateityp .'+extension+' ist aus Sicherheitsgründen nicht erlaubt.'};
    if(!ALLOWED_FILE_EXTENSIONS.has(extension))return {ok:false,message:'Der Dateityp .'+(extension||'ohne Endung')+' ist für die Dokumentenakte nicht freigegeben.'};
    const suppliedMime=cleanText(file.type).toLowerCase();
    const expectedMime=EXPECTED_MIME_TYPES[extension];
    if(suppliedMime&&suppliedMime!=='application/octet-stream'&&expectedMime&&!expectedMime.has(suppliedMime))return {ok:false,message:'Dateiendung und MIME-Typ passen nicht zusammen. Bitte die Originaldatei auswählen.'};
    const limit=cleanText(file.type).startsWith('image/')?MAX_IMAGE_BYTES:MAX_FILE_BYTES;
    if(Number(file.size)>limit)return {ok:false,message:'Die Datei ist zu groß. Erlaubt sind '+Math.round(limit/1024/1024)+' MB.'};
    if(!cleanText(file.name)||cleanText(file.name).length>180)return {ok:false,message:'Der Dateiname fehlt oder ist zu lang.'};
    return {ok:true};
  }

  function openFileDatabase(){
    if(!window.indexedDB)return Promise.reject(new Error('IndexedDB ist in diesem Browser nicht verfügbar.'));
    return new Promise((resolve,reject)=>{
      const request=window.indexedDB.open(FILE_DB_NAME,1);
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(FILE_STORE))db.createObjectStore(FILE_STORE,{keyPath:'id'});};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('Lokaler Dateispeicher konnte nicht geöffnet werden.'));
    });
  }

  async function storeLocalFile(file,context={}){
    const result=validateFile(file);if(!result.ok)throw new Error(result.message);
    const record={id:newFileId(),blob:file,name:cleanText(file.name).slice(0,180),mimeType:cleanText(file.type).toLowerCase(),size:Number(file.size)||0,storedAt:now(),context:cleanText(context.kind||'Dokument').slice(0,60)};
    const db=await openFileDatabase();
    try{return await new Promise((resolve,reject)=>{const transaction=db.transaction(FILE_STORE,'readwrite');transaction.objectStore(FILE_STORE).put(record);transaction.oncomplete=()=>resolve({...record,blob:undefined});transaction.onerror=()=>reject(transaction.error||new Error('Datei konnte nicht lokal gespeichert werden.'));});}finally{db.close();}
  }

  async function getLocalFile(id){
    if(!cleanText(id))return null;
    const db=await openFileDatabase();
    try{return await new Promise((resolve,reject)=>{const transaction=db.transaction(FILE_STORE,'readonly');const request=transaction.objectStore(FILE_STORE).get(cleanText(id));request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error||new Error('Datei konnte nicht gelesen werden.'));});}finally{db.close();}
  }

  function safeUrl(value,{allowBlob=false,allowLocal=false}={}){
    try{
      const url=new URL(String(value),location.href);
      if(url.protocol==='https:'||(allowBlob&&url.protocol==='blob:')||(allowLocal&&['http:','file:'].includes(url.protocol)))return url.href;
    }catch(error){}
    return '';
  }

  // Die Maßnahmenmigration V4 trennt Bearbeitung, Nachweis und Wirksamkeit.
  // Einige ältere Shell-Ansichten lesen noch die V3-Felder. Diese geerbte,
  // schreibgeschützte Projektion hält sie lesbar, ohne Altwerte wieder im
  // Datensatz oder in JSON-Backups zu persistieren.
  const measureCompatibilityPrototype=Object.create(Object.prototype);
  function v4MeasureView(measure){
    const api=window.INGTECMeasureState;
    return api?.isV4?.(measure)?api.view(measure):null;
  }
  function evidenceDocumentIds(measure){
    return asArray(currentState()?.measureEvidences)
      .filter(item=>item?.measureId===measure?.id)
      .map(item=>cleanText(item.documentId||item.storageRef||item.id))
      .filter(Boolean);
  }
  Object.defineProperties(measureCompatibilityPrototype,{
    status:{enumerable:false,get(){return v4MeasureView(this)?.overall||'Offen';},set(){}},
    ownerId:{enumerable:false,get(){return v4MeasureView(this)?.ownerId||'';},set(){}},
    ownerName:{enumerable:false,get(){return v4MeasureView(this)?.ownerName||'';},set(){}},
    action:{enumerable:false,get(){return cleanText(this.title||this.description);},set(){}},
    evidenceIds:{enumerable:false,get(){return evidenceDocumentIds(this);},set(){}}
  });
  function attachMeasureCompatibility(measure){
    if(!v4MeasureView(measure))return false;
    // V4 ist der einzige Schreibbestand. Eventuell aus einem alten Shell-Render
    // zurückgebliebene V3-Eigenschaften werden deshalb nicht weitergespeichert.
    ['status','ownerId','ownerName','action','evidenceIds'].forEach(key=>{
      if(Object.prototype.hasOwnProperty.call(measure,key))delete measure[key];
    });
    if(Object.getPrototypeOf(measure)===Object.prototype)Object.setPrototypeOf(measure,measureCompatibilityPrototype);
    return true;
  }
  function applyMeasureReadModelCompatibility(){
    asArray(currentState()?.measures).forEach(attachMeasureCompatibility);
  }

  function transitionAllowed(from,to){
    const transitions=window.INGTEC_STATUS_TRANSITIONS||{};
    return asArray(transitions[cleanText(from)]).includes(cleanText(to));
  }

  function runtimeReport(){
    const stateReport=validateState();
    return {
      ok:stateReport.ok,
      version:VERSION,
      schemaVersion:SCHEMA_VERSION,
      storage:storageAvailable()?'verfügbar':'nicht verfügbar',
      serviceWorker:'serviceWorker' in navigator?(navigator.serviceWorker.controller?'aktiv':'verfügbar'):'nicht unterstützt',
      network:navigator.onLine?'online':'offline',
      errors:stateReport.errors,
      warnings:stateReport.warnings,
      checkedAt:now()
    };
  }

  function enhanceRuntimeUi(){
    document.documentElement.dataset.network=navigator.onLine?'online':'offline';
    const settings=document.getElementById('settings');
    if(settings&&!settings.querySelector('[data-platform-health]')){
      const report=runtimeReport();
      const card=document.createElement('section');
      card.className='card platform-health-card';card.dataset.platformHealth='true';
      card.innerHTML='<div><span class="eyebrow">Systemzustand</span><h3>Lokale Datenintegrität</h3><p>Version '+VERSION+' · Schema '+SCHEMA_VERSION+' · '+(report.ok?'keine kritischen Datenfehler':report.errors.length+' kritische Datenfehler')+' · '+report.warnings.length+' Hinweise</p></div><span class="platform-health-state '+(report.ok?'is-ok':'is-error')+'">'+(report.ok?'Bereit':'Prüfen')+'</span><div class="platform-health-actions"><button type="button" class="secondary" onclick="INGTECPlatform.showDiagnostics()">Diagnose</button><button type="button" class="secondary" onclick="INGTECPlatform.exportBackup()">Backup exportieren</button><button type="button" class="secondary" onclick="INGTECPlatform.restoreBackup()">Letzten Stand wiederherstellen</button></div>';
      settings.appendChild(card);
    }
  }

  function showDiagnostics(){
    const report=runtimeReport();
    const details=[...report.errors.map(item=>'Fehler: '+item),...report.warnings.map(item=>'Hinweis: '+item)];
    notify(report.ok?(details.length?'Datenprüfung abgeschlossen: '+details.slice(0,3).join(' · '):'Datenprüfung abgeschlossen: keine Inkonsistenzen gefunden.'):'Datenprüfung fehlgeschlagen: '+details.slice(0,3).join(' · '),report.ok?null:'error');
    return report;
  }

  function installModalFocusManagement(){
    const focusable='button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{
      if(!(node instanceof HTMLElement))return;
      const modal=node.matches('.modal-backdrop')?node:node.querySelector('.modal-backdrop');
      if(!modal)return;
      lastFocus=document.activeElement;
      requestAnimationFrame(()=>modal.querySelector(focusable)?.focus());
    })));
    observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('keydown',event=>{
      const modal=[...document.querySelectorAll('.modal-backdrop')].at(-1);
      if(!modal)return;
      if(event.key==='Escape'){const close=modal.querySelector('.modal-close,[data-modal-close]');if(close){event.preventDefault();close.click();setTimeout(()=>lastFocus?.focus?.(),0);}return;}
      if(event.key!=='Tab')return;
      const controls=[...modal.querySelectorAll(focusable)].filter(item=>item.offsetParent!==null);
      if(!controls.length)return;
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
  }

  function runSelfTests(){
    const valid={orders:[{id:'O1',projectIds:['P1'],inspectionIds:['I1']}],projects:[{id:'P1',orderId:'O1'}],completedProjects:[],inspections:[{id:'I1',projectId:'P1',orderId:'O1',status:'In Bearbeitung'}],findings:[{id:'F1',inspectionId:'I1'}],measures:[{id:'M1',findingId:'F1'}],documents:[],calendarEvents:[],auditLog:[],safetyScoreHistory:[],profiles:[],userAccounts:[],customAccessRoles:[]};
    const duplicate=clone(valid);duplicate.findings.push({id:'F1'});
    const repairable=clone(valid);delete repairable.orders[0].projectIds;delete repairable.inspections[0].orderId;
    const repaired=repairState(repairable);
    const v4Projection={id:'M-V4-TEST',modelVersion:4,title:'V4-Status',processingStatus:'In Bearbeitung',evidenceStatus:'Kein Nachweis vorhanden',effectivenessStatus:'Prüfung ausständig',owner:{refId:'USR-TEST',name:'Testperson'}};
    attachMeasureCompatibility(v4Projection);
    const tests=[
      {name:'Gültige Prozesskette wird akzeptiert',passed:validateState(valid).ok},
      {name:'Doppelte Fachkennungen werden abgelehnt',passed:!validateState(duplicate).ok},
      {name:'Ableitbare Beziehungen werden repariert',passed:repaired.changed&&repairable.inspections[0].orderId==='O1'&&repairable.orders[0].projectIds.includes('P1')},
      {name:'Unsichere URLs werden blockiert',passed:!safeUrl('javascript:alert(1)')},
      {name:'HTTPS-URLs werden akzeptiert',passed:safeUrl('https://example.com/a')==='https://example.com/a'},
      {name:'Aktive Inhalte werden als Upload blockiert',passed:!validateFile({name:'payload.html',size:100,type:'text/html'}).ok},
      {name:'Manipulierter MIME-Typ wird als Upload blockiert',passed:!validateFile({name:'bericht.pdf',size:100,type:'text/html'}).ok},
      {name:'Normale PDF-Datei wird akzeptiert',passed:validateFile({name:'bericht.pdf',size:100,type:'application/pdf'}).ok},
      {name:'Statussprünge sind nicht erlaubt',passed:!transitionAllowed('Vorbereitung','Finalisiert')},
      {name:'V4-Maßnahmen bleiben ohne persistierten Altstatus lesbar',passed:v4Projection.status==='In Bearbeitung'&&!Object.prototype.hasOwnProperty.call(v4Projection,'status')&&!JSON.stringify(v4Projection).includes('"status"')}
    ];
    return {passed:tests.every(test=>test.passed),tests,runAt:now()};
  }

  function runAllTests(){
    const suites=[
      ['Plattform',window.__INGTEC_PLATFORM_TESTS__],
      ['Arbeitsplatz',window.__INGTEC_DAILY_TESTS__],
      ['Prüfung',window.__INGTEC_INSPECTION_TESTS__],
      ['Feststellungen',window.__INGTEC_FINDING_TESTS__],
      ['Maßnahmen',window.__INGTEC_MEASURE_TESTS__],
      ['Termine',window.__INGTEC_CALENDAR_TESTS__],
      ['Abrechnung',window.__INGTEC_BILLING_TESTS__],
      ['Hub',window.__INGTEC_HUB_TESTS__],
      ['Zusammenarbeit',window.__INGTEC_COLLABORATION_TESTS__]
    ];
    try{if(typeof window.runWorkspaceContractTests==='function')suites.push(['Vertrag',window.runWorkspaceContractTests()]);}catch(error){suites.push(['Vertrag',{passed:false,tests:[{name:error.message,passed:false}]}]);}
    const tests=suites.flatMap(([suite,result])=>asArray(result?.tests).map(test=>({suite,name:test.name,passed:Boolean(test.passed)})));
    tests.push({suite:'Shell',name:'Alle Fach-Stylesheets geladen',passed:['inspection-workspace.css','finding-workspace.css','measure-workspace.css','billing-workspace.css','daily-workspace.css','collaboration-suite.css','app-platform.css','calendar-zoom-timeline.css'].every(name=>[...document.styleSheets].some(sheet=>cleanText(sheet.href).includes(name)))});
    tests.push({suite:'Shell',name:'Hub-Startauswahl vollständig geladen',passed:Boolean(window.INGTECHub)&&[...document.styleSheets].some(sheet=>cleanText(sheet.href).includes('hub-launcher.css'))});
    tests.push({suite:'Shell',name:'Manifest ist verknüpft',passed:Boolean(document.querySelector('link[rel="manifest"]'))});
    tests.push({suite:'Shell',name:'INGTEC-Hauptfarbe bleibt erhalten',passed:getComputedStyle(document.documentElement).getPropertyValue('--ing').trim().toUpperCase()==='#9DC31A'});
    return {passed:tests.every(test=>test.passed),passedCount:tests.filter(test=>test.passed).length,total:tests.length,tests,runAt:now()};
  }

  quarantineCorruptStorage();
  const repaired=repairState();
  applyMeasureReadModelCompatibility();
  const originalSave=typeof window.save==='function'?window.save:null;
  window.save=safeSave;
  window.INGTECPlatform={VERSION,SCHEMA_VERSION,validateState,repairState,safeSave,restoreBackup,exportBackup,validateFile,storeLocalFile,getLocalFile,safeUrl,transitionAllowed,runtimeReport,showDiagnostics,measureView:v4MeasureView,applyMeasureReadModelCompatibility,originalSave};
  document.addEventListener('change',event=>{
    const input=event.target;
    if(!(input instanceof HTMLInputElement)||input.type!=='file'||!input.files?.length)return;
    for(const file of input.files){const result=validateFile(file);if(!result.ok){event.preventDefault();event.stopImmediatePropagation();input.value='';notify(result.message,'error');return;}}
  },true);
  window.addEventListener('error',event=>{console.error('[INGTEC runtime]',event.error||event.message);document.documentElement.dataset.runtimeError='true';});
  window.addEventListener('unhandledrejection',event=>{console.error('[INGTEC promise]',event.reason);document.documentElement.dataset.runtimeError='true';});
  window.addEventListener('online',()=>{enhanceRuntimeUi();notify('Verbindung wiederhergestellt. Lokale Änderungen können synchronisiert werden.');});
  window.addEventListener('offline',()=>{enhanceRuntimeUi();notify('Offline-Modus aktiv. Änderungen werden weiterhin lokal gespeichert.');});
  installModalFocusManagement();
  if(repaired.changed)safeSave();
  const baseRender=window.renderAll;
  if(typeof baseRender==='function')window.renderAll=function(){applyMeasureReadModelCompatibility();const result=baseRender.apply(this,arguments);applyMeasureReadModelCompatibility();enhanceRuntimeUi();return result;};
  enhanceRuntimeUi();
  const selfTests=runSelfTests();
  window.__INGTEC_PLATFORM_TESTS__=selfTests;
  window.runINGTECTests=runAllTests;
  document.documentElement.dataset.platformTests=selfTests.passed?'passed':'failed';
  if(new URL(location.href).searchParams.get('qa')==='1')setTimeout(()=>{
    const result=runAllTests();
    window.__INGTEC_ALL_TESTS__=result;
    document.documentElement.dataset.allTests=result.passed?'passed':'failed';
    document.title=(result.passed?'PASS ':'FAIL ')+result.passedCount+'/'+result.total+' · INGTEC Inspect QA';
    const panel=document.createElement('section');panel.className='platform-qa-panel';panel.setAttribute('aria-label','Testergebnis');
    panel.innerHTML='<b>'+(result.passed?'✓ Alle Tests bestanden':'! Tests fehlgeschlagen')+'</b><span>'+result.passedCount+' von '+result.total+' Prüfungen</span>'+(result.passed?'':'<small>'+result.tests.filter(test=>!test.passed).slice(0,5).map(test=>test.suite+': '+test.name).join('<br>')+'</small>');
    document.body.appendChild(panel);
  },800);
  if(location.protocol!=='file:'&&'serviceWorker' in navigator){
    navigator.serviceWorker.register('./service-worker.js')
      .then(()=>navigator.serviceWorker.ready)
      .then(()=>{document.documentElement.dataset.serviceWorker='ready';})
      .catch(error=>{document.documentElement.dataset.serviceWorker='failed';console.warn('[INGTEC] Service Worker nicht registriert',error);});
  }
})();
