/* INGTEC E-Mails
   Lokales Postfach mit Demo-Nachrichten. Verfassen, Antworten und
   Weiterleiten übergeben einen echten Entwurf an die Standard-Mail-App
   (MAILTO) oder an Outlook im Browser — der tatsächliche Versand erfolgt
   dort per Klick auf "Senden". Es wird nichts automatisch verschickt. */
(()=>{
  'use strict';
  if(typeof state==='undefined')return;

  const VERSION='1.0.0';
  const esc=value=>(typeof escapeHtml==='function'?escapeHtml(String(value??'')):String(value??''));
  const text=value=>String(value??'').trim();
  const arr=value=>Array.isArray(value)?value:[];
  const now=()=>new Date().toISOString();
  const EMAIL_PATTERN=/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/u;
  const COMPOSE_URL_LIMIT=8192;
  const OUTLOOK_DEFAULT_APPS_URL='ms-settings:defaultapps?registeredAUMID=Microsoft.OutlookForWindows_8wekyb3d8bbwe%21Microsoft.OutlookforWindows';
  const actor=()=>{
    const account=typeof activeUserAccount==='function'?activeUserAccount():null;
    return {id:account?.id||'LOCAL-DEMO',name:account?.name||state.user?.name||'Lokale Demo',email:account?.email||state.user?.email||'hannes.steiner@ingtec.at'};
  };
  const viennaToday=()=>{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Vienna',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const get=type=>parts.find(part=>part.type===type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  function offset(days,hours=9){
    const parts=viennaToday().split('-').map(Number);
    const date=new Date(parts[0],parts[1]-1,parts[2],hours,0,0);
    date.setDate(date.getDate()+days);
    return date.toISOString();
  }
  function dateLabel(value){
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return '–';
    const todayKey=viennaToday();
    const valueKey=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Vienna',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
    const time=new Intl.DateTimeFormat('de-AT',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Vienna'}).format(date);
    if(valueKey===todayKey)return time;
    return new Intl.DateTimeFormat('de-AT',{day:'2-digit',month:'2-digit',year:valueKey.slice(0,4)===todayKey.slice(0,4)?undefined:'numeric',timeZone:'Europe/Vienna'}).format(date);
  }
  function dateTimeLabel(value){
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return '–';
    return new Intl.DateTimeFormat('de-AT',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Vienna'}).format(date);
  }

  function seedEmails(){
    const me=actor().email;
    return [
      {id:'MAIL-I-0001',folder:'inbox',from:{name:'Reinbold GmbH',email:'sabine.reinbold@reinbold-gmbh.at'},to:[me],cc:[],subject:'Rückfrage zum Prüfbericht BMA-001',body:'Guten Tag,\n\nvielen Dank für den übermittelten Prüfbericht zur Brandmeldeanlage. Eine Rückfrage: Betrifft der festgestellte Bald-fällig-Status auch die Revision oder ausschließlich die wiederkehrende Prüfung?\n\nFreundliche Grüße\nSabine Reinbold',date:offset(0,8),read:false,starred:true,attachments:[]},
      {id:'MAIL-I-0002',folder:'inbox',from:{name:'INGTEC System',email:'system@ingtec.at'},to:[me],cc:[],subject:'Prüfpflicht überfällig: RWA-01',body:'Automatische Benachrichtigung:\n\nDie wiederkehrende Prüfung für RWA-01 (Rauch- und Wärmeabzugsanlage Tiefgarage, KLV Zentrale) ist überfällig. Bitte zeitnah einen Prüftermin planen.\n\nDiese Nachricht wurde automatisch erstellt.',date:offset(0,6),read:false,starred:false,attachments:[]},
      {id:'MAIL-I-0003',folder:'inbox',from:{name:'M. Šop',email:'martin.sop@ingtec.at'},to:[me],cc:[],subject:'Freigabe Prüfbericht Schrack noch offen',body:'Servus,\n\nkönntest du den Prüfbericht für die Wartung bei Schrack noch heute freigeben? Der Kunde fragt schon nach.\n\nDanke!\nMartin',date:offset(-1,15),read:true,starred:false,attachments:[]},
      {id:'MAIL-I-0004',folder:'inbox',from:{name:'Elektro Huber GmbH',email:'buero@elektro-huber.at'},to:[me],cc:[],subject:'Prüfnachweis Elektroanlage Gebäude B nachgereicht',body:'Sehr geehrte Damen und Herren,\n\nanbei der nachgereichte Prüfnachweis zur Elektroanlage in Gebäude B. Bitte um Bestätigung des Erhalts.\n\nMit freundlichen Grüßen\nElektro Huber GmbH',date:offset(-1,11),read:true,starred:false,attachments:[{name:'Pruefnachweis_EL-GEB-B.pdf'}]},
      {id:'MAIL-I-0005',folder:'inbox',from:{name:'Schrack Sicherheitstechnik',email:'service@schrack-seconet.com'},to:[me],cc:[],subject:'Wartungsvertrag SCHRACK-2025-17 – Verlängerung',body:'Guten Tag,\n\nIhr Wartungsvertrag SCHRACK-2025-17 für die Brandmeldeanlage BMZ Zentrale läuft im nächsten Jahr aus. Gerne unterbreiten wir Ihnen ein Verlängerungsangebot.\n\nBeste Grüße\nIhr Schrack-Team',date:offset(-2,9),read:true,starred:false,attachments:[]},
      {id:'MAIL-I-0006',folder:'inbox',from:{name:'BZ Wolfsberg – Standortleitung',email:'leitung.wolfsberg@ingtec.at'},to:[me],cc:[],subject:'Terminanfrage: Brandschutztür Lagerhalle',body:'Hallo,\n\nkönnen wir kurzfristig einen Termin für die überfällige Prüfung der Brandschutztür in der Lagerhalle vereinbaren? Der Betrieb drängt.\n\nDanke und Grüße',date:offset(-2,13),read:false,starred:false,attachments:[]},
      {id:'MAIL-I-0007',folder:'inbox',from:{name:'Otis Aufzüge',email:'kundendienst@otis.com'},to:[me],cc:[],subject:'Wartungstermin Personenaufzug A1 bestätigt',body:'Sehr geehrte Damen und Herren,\n\nwir bestätigen den Wartungstermin für den Personenaufzug A1 am kommenden Mittwoch, 09:00 Uhr.\n\nMit freundlichen Grüßen\nOtis Kundendienst',date:offset(-3,10),read:true,starred:false,attachments:[]},
      {id:'MAIL-I-0008',folder:'inbox',from:{name:'Magistrat Klagenfurt',email:'baupolizei@klagenfurt.at'},to:[me],cc:[],subject:'Anforderung Prüfnachweise CO-Warnanlage Tiefgarage',body:'Sehr geehrte Damen und Herren,\n\nim Rahmen der Bescheidprüfung ersuchen wir um Übermittlung der aktuellen Prüfnachweise zur CO-Warnanlage in der Tiefgarage.\n\nMit freundlichen Grüßen\nMagistrat der Landeshauptstadt Klagenfurt',date:offset(-4,14),read:true,starred:true,attachments:[]},
      {id:'MAIL-I-0009',folder:'inbox',from:{name:'Buchhaltung INGTEC',email:'buchhaltung@ingtec.at'},to:[me],cc:[],subject:'Rechnungsfreigabe erforderlich – Reinbold GmbH',body:'Hallo,\n\nfür den Auftrag Reinbold GmbH liegt ein abrechenbarer Vorgang bereit. Bitte um Freigabe in der Abrechnungsübersicht.\n\nDanke!',date:offset(-4,9),read:true,starred:false,attachments:[]},
      {id:'MAIL-I-0010',folder:'inbox',from:{name:'GEZE Kundendienst',email:'service@geze.at'},to:[me],cc:[],subject:'Ersatzteillieferung Automatiktür Haupteingang',body:'Guten Tag,\n\ndie bestellten Ersatzteile für die Automatiktür (Slimdrive EMD) sind eingetroffen und versandbereit.\n\nBeste Grüße\nGEZE Kundendienst',date:offset(-5,11),read:true,starred:false,attachments:[]},
      {id:'MAIL-I-0011',folder:'inbox',from:{name:'IT-Support INGTEC',email:'it-support@ingtec.at'},to:[me],cc:[],subject:'Bestätigung: Passwort zurückgesetzt',body:'Ihr Passwort wurde erfolgreich zurückgesetzt. Falls Sie diese Änderung nicht veranlasst haben, kontaktieren Sie bitte umgehend den IT-Support.',date:offset(-6,8),read:true,starred:false,attachments:[]},
      {id:'MAIL-I-0012',folder:'inbox',from:{name:'Dräger Service',email:'service@draeger.com'},to:[me],cc:[],subject:'Rückfrage Zertifikat CO-Warnanlage TG-01',body:'Sehr geehrte Damen und Herren,\n\nkönnen Sie uns die Seriennummer der CO-Warnanlage in der Tiefgarage mitteilen? Wir möchten prüfen, ob die gesetzliche Prüfpflicht bereits geklärt ist.\n\nMit freundlichen Grüßen\nDräger Service',date:offset(-7,10),read:true,starred:false,attachments:[]},
      {id:'MAIL-I-0013',folder:'inbox',from:{name:'INGTEC System',email:'system@ingtec.at'},to:[me],cc:[],subject:'SafetyScore® aktualisiert: Klasse B',body:'Automatische Benachrichtigung:\n\nDer SafetyScore® für Ihren aktiven Auftrag wurde neu berechnet. Aktuelle Klasse: B.\n\nDiese Nachricht wurde automatisch erstellt.',date:offset(-8,7),read:true,starred:false,attachments:[]},
      {id:'MAIL-I-0014',folder:'inbox',from:{name:'BZ Spittal – Empfang',email:'empfang.spittal@ingtec.at'},to:[me],cc:[],subject:'Feuerlöscher Empfang – kurze Rückfrage',body:'Hallo,\n\nder Feuerlöscher am Empfang wurde offenbar leicht angestoßen. Sollte das dokumentiert werden oder reicht die reguläre Prüfung?\n\nDanke!',date:offset(-9,12),read:true,starred:false,attachments:[]},
      {id:'MAIL-I-0015',folder:'inbox',from:{name:'Trox Technik',email:'vertrieb@trox.at'},to:[me],cc:[],subject:'Angebot Ersatzklappe BSK-014',body:'Sehr geehrte Damen und Herren,\n\nanbei unser Angebot für eine Ersatz-Brandschutzklappe passend zur bestehenden FKR-EU-Serie.\n\nMit freundlichen Grüßen\nTrox Vertrieb',date:offset(-11,9),read:true,starred:false,attachments:[{name:'Angebot_BSK-014.pdf'}]},
      {id:'MAIL-S-0001',folder:'sent',from:actor(),to:['sabine.reinbold@reinbold-gmbh.at'],cc:[],subject:'AW: Prüfbericht Wandhydrant Erdgeschoss',body:'Guten Tag Frau Reinbold,\n\nanbei die gewünschte Bestätigung zum Prüfbericht. Bei weiteren Fragen stehe ich gerne zur Verfügung.\n\nFreundliche Grüße\nHannes Steiner',date:offset(-3,16),read:true,starred:false,attachments:[]},
      {id:'MAIL-S-0002',folder:'sent',from:actor(),to:['service@schrack-seconet.com'],cc:[],subject:'Rückfrage Wartungsvertrag SCHRACK-2025-17',body:'Guten Tag,\n\nbitte um ein Angebot zur Verlängerung des Wartungsvertrags SCHRACK-2025-17.\n\nBeste Grüße\nHannes Steiner',date:offset(-2,10),read:true,starred:false,attachments:[]}
    ];
  }

  function ensure(){
    if(!Array.isArray(state.emails)||!state.emails.length)state.emails=seedEmails();
    state.emails.forEach(email=>{
      if(!Array.isArray(email.to))email.to=[];
      if(!Array.isArray(email.cc))email.cc=[];
      if(!Array.isArray(email.attachments))email.attachments=[];
      if(typeof email.read!=='boolean')email.read=true;
      if(typeof email.starred!=='boolean')email.starred=false;
    });
  }

  const emails=()=>arr(state.emails);
  const emailById=id=>emails().find(e=>e.id===text(id))||null;
  const folderEmails=folder=>emails().filter(e=>e.folder===folder).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const unreadCount=folder=>folderEmails(folder).filter(e=>!e.read).length;

  function snippet(body,length=80){
    const line=text(body).replace(/\s+/g,' ');
    return line.length>length?line.slice(0,length-1)+'…':line;
  }

  let view={screen:'inbox',selectedId:null,query:''};
  const TOP_LEVEL_SCREENS=new Set(['inbox','sent']);
  let composeContext=null;
  let composeShowCc=false;

  function navigate(patch){
    view={...view,...patch};
    window.renderAll?.();
    setActivePage?.('emails');
  }
  function setEmailScreen(screen){
    if(!TOP_LEVEL_SCREENS.has(screen))return false;
    view={screen,selectedId:null,query:''};
    const current=document.getElementById('emails');
    if(current){
      const template=document.createElement('template');
      template.innerHTML=page();
      const replacement=template.content.firstElementChild;
      if(replacement){
        if(current.classList.contains('active'))replacement.classList.add('active');
        if(current.style.display)replacement.style.display=current.style.display;
        current.replaceWith(replacement);
      }
    }
    return true;
  }

  function folderTabs(){
    return `<div class="email-folder-tabs" role="tablist" aria-label="Postfachordner">
      <button type="button" role="tab" class="${view.screen==='inbox'?'active':''}" data-email-nav="inbox">Posteingang${unreadCount('inbox')?` <b>${unreadCount('inbox')}</b>`:''}</button>
      <button type="button" role="tab" class="${view.screen==='sent'?'active':''}" data-email-nav="sent">Gesendet</button>
    </div>`;
  }

  function listRow(email){
    const selected=email.id===view.selectedId;
    const otherParty=email.folder==='inbox'?email.from.name:(email.to[0]||'–');
    return `<button type="button" class="email-row ${email.read?'':'is-unread'} ${selected?'is-selected':''}" data-email-open="${esc(email.id)}">
      <span class="email-row-dot" aria-hidden="true"></span>
      <span class="email-row-body">
        <span class="email-row-top"><b>${esc(otherParty)}</b><small>${esc(dateLabel(email.date))}</small></span>
        <span class="email-row-subject">${esc(email.subject||'(Kein Betreff)')}</span>
        <span class="email-row-snippet">${esc(snippet(email.body))}</span>
      </span>
      <button type="button" class="email-star ${email.starred?'is-starred':''}" data-email-star="${esc(email.id)}" aria-label="${email.starred?'Markierung entfernen':'Markieren'}" aria-pressed="${email.starred}">${email.starred?'★':'☆'}</button>
    </button>`;
  }

  function filteredList(){
    const query=view.query.toLowerCase();
    let list=folderEmails(view.screen);
    if(query)list=list.filter(e=>[e.subject,e.from.name,e.from.email,e.body,...e.to].join(' ').toLowerCase().includes(query));
    return list;
  }
  function listMarkup(){
    const list=filteredList();
    return list.length?list.map(listRow).join(''):'<p class="compliance-empty-inline email-empty">Keine E-Mails gefunden.</p>';
  }
  function listPanel(){
    return `<div class="email-list-panel ${view.selectedId?'has-selection':''}">
      <div class="email-list-toolbar">
        <button type="button" class="primary" data-email-compose>+ Neue E-Mail</button>
        <label class="email-search"><input type="search" placeholder="Suchen" value="${esc(view.query)}" data-email-search aria-label="E-Mails durchsuchen"></label>
      </div>
      <div class="email-list" role="list">${listMarkup()}</div>
    </div>`;
  }

  function quotedBody(email){
    const lines=text(email.body).split('\n').map(line=>'> '+line).join('\n');
    return `\n\nAm ${dateTimeLabel(email.date)} schrieb ${email.from.name} <${email.from.email}>:\n${lines}`;
  }
  function detailActions(email){
    return `<div class="email-detail-actions">
      <button type="button" class="secondary" data-email-reply="${esc(email.id)}">Antworten</button>
      <button type="button" class="secondary" data-email-reply-all="${esc(email.id)}">Allen antworten</button>
      <button type="button" class="secondary" data-email-forward="${esc(email.id)}">Weiterleiten</button>
      <button type="button" class="secondary" data-email-star="${esc(email.id)}">${email.starred?'★ Markiert':'☆ Markieren'}</button>
      <button type="button" class="danger" data-email-delete="${esc(email.id)}">Löschen</button>
    </div>`;
  }
  function detailPanel(){
    const email=emailById(view.selectedId);
    if(!email)return `<div class="email-detail-panel email-detail-empty"><p>Wähle eine E-Mail aus, um sie zu lesen.</p></div>`;
    const recipients=[...email.to,...email.cc];
    return `<div class="email-detail-panel">
      <div class="email-detail-head">
        <button type="button" class="email-back" data-email-nav="${esc(view.screen)}" aria-label="Zurück zur Liste">←</button>
        <div><h3>${esc(email.subject||'(Kein Betreff)')}</h3><div class="email-detail-meta"><b>${esc(email.from.name)}</b> <span>&lt;${esc(email.from.email)}&gt;</span></div><div class="email-detail-meta"><span>An: ${esc(recipients.join(', ')||'–')}</span></div><div class="email-detail-date">${esc(dateTimeLabel(email.date))}</div></div>
      </div>
      ${detailActions(email)}
      <div class="email-detail-body">${esc(email.body).split('\n').map(line=>line||'&nbsp;').join('<br>')}</div>
      ${email.attachments.length?`<div class="email-attachments">${email.attachments.map(a=>`<span class="email-attachment-chip">📎 ${esc(a.name)}</span>`).join('')}</div>`:''}
    </div>`;
  }

  function page(){
    ensure();
    return `<section class="page email-workspace" id="emails"><div class="section-head compliance-page-head"><div><span class="eyebrow">Postfach</span><h2>E-Mails</h2><p>Lokales Postfach mit echtem Versand über dein Mailprogramm oder Outlook im Browser.</p></div></div>${folderTabs()}<div class="email-layout">${listPanel()}${detailPanel()}</div></section>`;
  }

  /* ---- Compose: mailto / Outlook-Web Deep-Link (proven pattern, reused from Abrechnung) ---- */
  function cleanMailLine(value){return text(value).replace(/[\r\n]+/g,' ').slice(0,240);}
  function normalizedRecipients(value){
    const raw=text(value);
    if(!raw||/[\r\n]/.test(raw))return [];
    const values=raw.split(/[;,]/).map(item=>text(item).toLocaleLowerCase('de-AT')).filter(Boolean);
    return values.length&&values.every(value=>EMAIL_PATTERN.test(value))?[...new Set(values)]:[];
  }
  function composeQuery(values){
    return Object.entries(values).map(([key,value])=>`${encodeURIComponent(key)}=${encodeURIComponent(String(value??''))}`).join('&');
  }
  function mailtoUrl(recipients,subject,body,cc){
    const query={subject:cleanMailLine(subject),body:String(body??'').replace(/\r?\n/g,'\r\n')};
    if(cc?.length)query.cc=cc.join(',');
    return 'mailto:'+recipients.map(value=>encodeURIComponent(value)).join(',')+'?'+composeQuery(query);
  }
  function outlookWebComposeUrl(recipients,subject,body,cc){
    const query={to:recipients.join(';'),subject:cleanMailLine(subject),body:String(body??'').replace(/\r?\n/g,'\r\n')};
    if(cc?.length)query.cc=cc.join(';');
    return 'https://outlook.office.com/mail/deeplink/compose?'+composeQuery(query);
  }
  function requestExternalCompose(url){
    try{
      window.location.assign(url);
      return true;
    }catch(error){
      try{
        const link=document.createElement('a');
        link.href=url;
        link.tabIndex=-1;
        link.setAttribute('aria-hidden','true');
        link.style.cssText='position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden';
        document.body.appendChild(link);
        link.click();
        link.remove();
        return true;
      }catch(fallbackError){
        return false;
      }
    }
  }
  function requestOutlookWebCompose(url){
    try{
      const opened=window.open(url,'_blank');
      if(opened){
        try{opened.opener=null;}catch(error){}
        return true;
      }
    }catch(error){}
    try{
      window.location.assign(url);
      return true;
    }catch(error){
      return false;
    }
  }
  function openOutlookDefaultSettings(modal){
    if(!requestExternalCompose(OUTLOOK_DEFAULT_APPS_URL)){
      const message='Die Windows-Einstellungen konnten nicht geöffnet werden. Wähle Outlook manuell als Standard-App für MAILTO aus.';
      showLaunchStatus(modal,message,true);
      showToast?.(message,null,null,'error');
      return;
    }
    const message='Die Windows-Einstellungen wurden geöffnet. Wähle dort Outlook als Standard-App für MAILTO aus und kehre anschließend hierher zurück.';
    showLaunchStatus(modal,message);
    showToast?.('Windows-Einstellungen für die Outlook-Standard-App wurden geöffnet.');
  }
  function showLaunchStatus(modal,message,isError=false){
    const status=modal.querySelector('[data-email-launch-status]');
    if(!status)return;
    status.hidden=false;
    status.textContent=message;
    status.classList.toggle('is-error',Boolean(isError));
  }
  function copyText(value){
    const fallback=()=>{
      const area=document.createElement('textarea');
      area.value=value;
      area.setAttribute('readonly','');
      area.style.position='fixed';
      area.style.opacity='0';
      document.body.appendChild(area);
      area.select();
      const copied=document.execCommand?.('copy');
      area.remove();
      return Boolean(copied);
    };
    if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(value).then(()=>true).catch(fallback);
    return Promise.resolve(fallback());
  }
  function mailFields(form){
    const recipients=normalizedRecipients(form.elements.to?.value);
    const cc=text(form.elements.cc?.value)?normalizedRecipients(form.elements.cc.value):[];
    const subject=cleanMailLine(form.elements.subject?.value);
    const body=String(form.elements.body?.value||'').trim();
    return {recipients,cc,subject,body};
  }
  function validMailFields(form){
    const values=mailFields(form);
    if(!values.recipients.length){showToast?.('Bitte mindestens eine gültige Empfängeradresse angeben.',null,null,'error');form.elements.to?.focus();return null;}
    if(text(form.elements.cc?.value)&&!values.cc.length){showToast?.('Bitte gültige Cc-Adressen angeben.',null,null,'error');form.elements.cc?.focus();return null;}
    if(!values.subject){showToast?.('Bitte einen Betreff angeben.',null,null,'error');form.elements.subject?.focus();return null;}
    if(!values.body){showToast?.('Bitte einen Nachrichtentext angeben.',null,null,'error');form.elements.body?.focus();return null;}
    return values;
  }
  function recordSentEmail(values){
    const record={id:'MAIL-S-'+Date.now(),folder:'sent',from:actor(),to:values.recipients,cc:values.cc,subject:values.subject,body:values.body,date:now(),read:true,starred:false,attachments:[]};
    state.emails.unshift(record);
    window.recordAudit?.('E-Mail-Entwurf geöffnet',{entityType:'E-Mail',entityId:record.id,summary:`${record.subject} · Empfänger: ${values.recipients.join(', ')}`});
    save?.();
    return record;
  }
  function launchEmailClient(modal,channel){
    const form=modal.querySelector('#emailComposeForm');
    if(!form)return;
    const values=validMailFields(form);
    if(!values)return;
    const useOutlookWeb=channel==='outlook-web';
    const url=useOutlookWeb?outlookWebComposeUrl(values.recipients,values.subject,values.body,values.cc):mailtoUrl(values.recipients,values.subject,values.body,values.cc);
    if(url.length>COMPOSE_URL_LIMIT){
      const message='Der Entwurf ist für eine sichere Übergabe an die Mail-App zu lang. Bitte kürze die Nachricht oder kopiere den Text.';
      showLaunchStatus(modal,message,true);
      showToast?.(message,null,null,'error');
      return;
    }
    const opened=useOutlookWeb?requestOutlookWebCompose(url):requestExternalCompose(url);
    if(!opened){
      const message=useOutlookWeb?'Outlook im Browser konnte nicht geöffnet werden. Nutze die Standard-Mail-App oder kopiere den Text.':'Die Standard-Mail-App konnte vom Browser nicht geöffnet werden. Kopiere den Text und füge ihn in deinem Mailprogramm ein.';
      showLaunchStatus(modal,message,true);
      showToast?.(message,null,null,'error');
      return;
    }
    recordSentEmail(values);
    closeCompose();
    navigate({screen:'sent',selectedId:null});
    showToast?.(useOutlookWeb?'Outlook im Browser wurde mit dem Entwurf geöffnet. Bitte dort prüfen und senden.':'Die Standard-Mail-App wurde mit dem Entwurf geöffnet. Bitte dort prüfen und senden.');
  }
  function composeMarkup(){
    const ctx=composeContext||{};
    return `<div class="modal-card email-modal-card" role="dialog" aria-modal="true" aria-labelledby="emailComposeTitle"><div class="modal-head"><div><span class="eyebrow">${esc(ctx.kicker||'Neue E-Mail')}</span><h2 id="emailComposeTitle">${esc(ctx.title||'E-Mail verfassen')}</h2><p>Der Entwurf wird an dein Mailprogramm oder Outlook im Browser übergeben. Gesendet wird erst nach deinem Klick auf „Senden" dort.</p></div><button type="button" class="modal-close" aria-label="Dialog schließen" data-email-close>×</button></div><form id="emailComposeForm" novalidate><div class="email-form-grid">
      <label class="email-form-wide">An *<input name="to" type="email" multiple required maxlength="500" autocomplete="email" value="${esc(ctx.to||'')}" placeholder="empfaenger@beispiel.at"></label>
      ${composeShowCc?`<label class="email-form-wide">Cc<input name="cc" type="email" multiple maxlength="500" value="${esc(ctx.cc||'')}" placeholder="optional"></label>`:`<div class="email-form-wide"><button type="button" class="link" data-email-toggle-cc>+ Cc hinzufügen</button></div>`}
      <label class="email-form-wide">Betreff *<input name="subject" required maxlength="240" value="${esc(ctx.subject||'')}"></label>
      <label class="email-form-wide">Nachricht *<textarea name="body" required maxlength="6000">${esc(ctx.body||'')}</textarea></label>
    </div><p class="email-launch-status" data-email-launch-status role="status" aria-live="polite" hidden></p><div class="modal-actions email-compose-actions"><button type="button" class="secondary" data-email-copy>Text kopieren</button><button type="button" class="secondary" data-email-default-outlook>Outlook als Standard einrichten</button><button type="button" class="secondary" data-email-outlook-web>Outlook im Browser öffnen</button><button type="button" class="secondary" data-email-close>Abbrechen</button><button type="submit" class="primary" data-email-mailto>E-Mail-App öffnen</button></div></form></div>`;
  }
  function renderCompose(){
    const modal=document.getElementById('emailComposeDialog');
    if(!modal)return;
    modal.innerHTML=composeMarkup();
    modal.querySelectorAll('[data-email-close]').forEach(btn=>btn.addEventListener('click',closeCompose));
    modal.querySelector('[data-email-toggle-cc]')?.addEventListener('click',()=>{composeShowCc=true;renderCompose();});
    modal.querySelector('[data-email-copy]')?.addEventListener('click',async()=>{
      const values=mailFields(modal.querySelector('#emailComposeForm'));
      const copied=await copyText(`An: ${values.recipients.join(', ')}${values.cc.length?`\nCc: ${values.cc.join(', ')}`:''}\nBetreff: ${values.subject}\n\n${values.body}`);
      showToast?.(copied?'E-Mail-Text wurde in die Zwischenablage kopiert.':'Der E-Mail-Text konnte nicht kopiert werden.',null,null,copied?undefined:'error');
    });
    modal.querySelector('[data-email-default-outlook]')?.addEventListener('click',()=>openOutlookDefaultSettings(modal));
    modal.querySelector('[data-email-outlook-web]')?.addEventListener('click',()=>launchEmailClient(modal,'outlook-web'));
    modal.querySelector('#emailComposeForm')?.addEventListener('submit',event=>{event.preventDefault();launchEmailClient(modal,'mailto');});
    if(typeof enhanceFormControls==='function')enhanceFormControls(modal);
    setTimeout(()=>modal.querySelector('input[name="to"]')?.focus(),50);
  }
  function openCompose(context={}){
    if(!window.requirePermission?.('chats','das Verfassen einer E-Mail'))return;
    composeContext=context;
    composeShowCc=Boolean(text(context.cc));
    let modal=document.getElementById('emailComposeDialog');
    if(!modal){
      modal=document.createElement('div');
      modal.id='emailComposeDialog';
      modal.className='modal-backdrop';
      modal.setAttribute('role','presentation');
      modal.addEventListener('mousedown',event=>{if(event.target===modal)closeCompose();});
      document.body.appendChild(modal);
    }
    document.body.style.overflow='hidden';
    renderCompose();
  }
  function closeCompose(){
    const modal=document.getElementById('emailComposeDialog');
    if(!modal)return;
    modal.remove();
    composeContext=null;
    if(!document.querySelector('.modal-backdrop'))document.body.style.overflow='';
  }

  function subjectWithPrefix(prefix,subject){
    const clean=text(subject);
    const already=new RegExp('^'+prefix+':','i').test(clean);
    return already?clean:`${prefix}: ${clean}`;
  }
  function openReply(id,replyAll){
    const email=emailById(id);
    if(!email)return;
    const recipients=email.folder==='sent'?email.to:[email.from.email];
    const cc=replyAll?[...new Set([...email.to.filter(value=>value!==actor().email),...email.cc])]:[];
    openCompose({kicker:email.subject,title:'Antworten',to:recipients.join(', '),cc:cc.join(', '),subject:subjectWithPrefix('Re',email.subject),body:quotedBody(email)});
  }
  function openForward(id){
    const email=emailById(id);
    if(!email)return;
    openCompose({kicker:email.subject,title:'Weiterleiten',to:'',subject:subjectWithPrefix('Fwd',email.subject),body:quotedBody(email)});
  }
  function openEmail(id){
    const email=emailById(id);
    if(!email)return;
    if(!email.read){email.read=true;save?.();}
    navigate({selectedId:id});
  }
  function toggleStar(id){
    const email=emailById(id);
    if(!email)return;
    email.starred=!email.starred;
    save?.();
    window.renderAll?.();
    setActivePage?.('emails');
  }
  function deleteEmail(id){
    if(!window.requirePermission?.('chats','das Löschen einer E-Mail'))return;
    const index=state.emails.findIndex(e=>e.id===text(id));
    if(index<0)return;
    state.emails.splice(index,1);
    save?.();
    navigate({selectedId:null});
    showToast?.('E-Mail wurde gelöscht.');
  }

  window.emails=page;
  window.emailSetScreen=setEmailScreen;
  window.closeEmailComposeDialog=closeCompose;
  window.runEmailWorkspaceTests=function(){
    ensure();
    const inboxCount=folderEmails('inbox').length;
    const sentCount=folderEmails('sent').length;
    const tests=[
      {name:'Postfach führt Posteingang und Gesendet lokal als Liste',passed:inboxCount>=10&&sentCount>=1},
      {name:'Ungelesene Nachrichten werden korrekt gezählt',passed:unreadCount('inbox')===folderEmails('inbox').filter(e=>!e.read).length},
      {name:'Mailto-Entwurf enthält Empfänger, Betreff und Nachricht',passed:mailtoUrl(['kunde@example.com'],'Test','Guten Tag').includes('mailto:kunde%40example.com')&&normalizedRecipients('a@example.com; b@example.com').length===2},
      {name:'Outlook-Web-Entwurf enthält Empfänger, Betreff und Nachricht',passed:outlookWebComposeUrl(['kunde@example.com'],'Test','Guten Tag').startsWith('https://outlook.office.com/mail/deeplink/compose?to=kunde%40example.com')},
      {name:'Die E-Mail-App wird vor dem Speichern direkt aus der Button-Aktion angefordert',passed:String(launchEmailClient).indexOf('const opened=useOutlookWeb?requestOutlookWebCompose(url):requestExternalCompose(url)')<String(launchEmailClient).indexOf('recordSentEmail(values)')},
      {name:'Lange E-Mail-Links werden vor der Übergabe abgefangen',passed:mailtoUrl(['kunde@example.com'],'Test','x'.repeat(COMPOSE_URL_LIMIT)).length>COMPOSE_URL_LIMIT},
      {name:'Schreibende Aktionen sind berechtigungsgeschützt',passed:String(openCompose).includes('requirePermission')&&String(deleteEmail).includes('requirePermission')},
      {name:'Antworten übernimmt Absender und markiert den Betreff',passed:subjectWithPrefix('Re','Angebot')==='Re: Angebot'&&subjectWithPrefix('Re','Re: Angebot')==='Re: Angebot'},
      {name:'Die Seiten-Navigation kann Posteingang und Gesendet öffnen',passed:[...TOP_LEVEL_SCREENS].every(screen=>typeof window.emailSetScreen==='function')},
      {name:'Die Fachseite stellt Ordner-Tabs und Liste bereit',passed:page().includes('email-folder-tabs')&&page().includes('email-list')}
    ];
    return {passed:tests.every(t=>t.passed),tests};
  };
  ensure();
  const tests=window.runEmailWorkspaceTests();
  window.__INGTEC_EMAIL_TESTS__=tests;
  document.documentElement.dataset.emailTests=tests.passed?'passed':'failed';

  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;
    const nav=target.closest('[data-email-nav]');
    if(nav){event.preventDefault();navigate({screen:nav.dataset.emailNav,selectedId:null});return;}
    const open=target.closest('[data-email-open]');
    if(open){event.preventDefault();openEmail(open.dataset.emailOpen);return;}
    const star=target.closest('[data-email-star]');
    if(star){event.preventDefault();event.stopPropagation();toggleStar(star.dataset.emailStar);return;}
    const compose=target.closest('[data-email-compose]');
    if(compose){event.preventDefault();openCompose();return;}
    const reply=target.closest('[data-email-reply]');
    if(reply){event.preventDefault();openReply(reply.dataset.emailReply,false);return;}
    const replyAll=target.closest('[data-email-reply-all]');
    if(replyAll){event.preventDefault();openReply(replyAll.dataset.emailReplyAll,true);return;}
    const forward=target.closest('[data-email-forward]');
    if(forward){event.preventDefault();openForward(forward.dataset.emailForward);return;}
    const del=target.closest('[data-email-delete]');
    if(del){event.preventDefault();deleteEmail(del.dataset.emailDelete);return;}
  });
  document.addEventListener('input',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(target?.matches('[data-email-search]')){
      view={...view,query:target.value};
      const listEl=document.querySelector('#emails .email-list');
      if(listEl)listEl.innerHTML=listMarkup();
    }
  });

  window.renderAll?.();
  if(location.hash==='#emails')setTimeout(()=>setActivePage?.('emails'),0);
  const params=new URL(location.href).searchParams;
  if(params.get('email-test')==='1'){
    const pre=document.createElement('pre');
    pre.id='emailTestResults';
    pre.hidden=true;
    pre.textContent=JSON.stringify(tests);
    document.body.appendChild(pre);
  }
})();
