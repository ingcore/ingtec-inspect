/* INGTEC Abrechnung
   Lokale Vorbereitung von Abrechnungsvorgängen. Es werden keine Rechnungen
   gebucht und keine Daten an Odoo oder eine Finanzbuchhaltung übertragen. */
(()=>{
  'use strict';
  if(typeof state==='undefined')return;

  const VERSION='1.4.0';
  const STATUSES=['Entwurf','Freigegeben','Versendet','Teilbezahlt','Bezahlt','Storniert'];
  const EMAIL_PATTERN=/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/u;
  const COMPOSE_URL_LIMIT=8192;
  const OUTLOOK_DEFAULT_APPS_URL='ms-settings:defaultapps?registeredAUMID=Microsoft.OutlookForWindows_8wekyb3d8bbwe%21Microsoft.OutlookforWindows';
  const esc=value=>(typeof escapeHtml==='function'?escapeHtml(String(value??'')):String(value??''));
  const text=value=>String(value??'').trim();
  const arr=value=>Array.isArray(value)?value:[];
  const clone=value=>JSON.parse(JSON.stringify(value));
  const now=()=>new Date().toISOString();
  const viennaToday=()=>{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Vienna',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const get=type=>parts.find(part=>part.type===type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  const futureDate=days=>{
    const date=new Date();
    date.setDate(date.getDate()+days);
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Vienna',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    const get=type=>parts.find(part=>part.type===type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  const actor=()=>{
    const account=typeof activeUserAccount==='function'?activeUserAccount():null;
    return {id:account?.id||'LOCAL-DEMO',name:account?.name||state.user?.name||'Lokale Demo',email:account?.email||state.user?.email||''};
  };
  const money=value=>new Intl.NumberFormat('de-AT',{style:'currency',currency:'EUR'}).format(Number(value)||0);
  const dateLabel=value=>{
    const match=text(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match?`${match[3]}.${match[2]}.${match[1]}`:'–';
  };
  const allProjects=()=>[...arr(state.projects),...arr(state.completedProjects)];
  const orders=()=>arr(state.orders);
  const invoices=()=>arr(state.invoices);
  const invoiceById=id=>invoices().find(item=>item?.id===text(id))||null;
  const orderById=id=>orders().find(item=>item?.id===text(id))||null;
  const projectForOrder=order=>{
    if(!order)return null;
    return allProjects().find(project=>project?.orderId===order.id)
      ||allProjects().find(project=>arr(order.projectIds).includes(project?.id))||null;
  };
  const customerForOrder=order=>{
    const project=projectForOrder(order);
    return arr(state.customers).find(customer=>customer?.id===project?.customerId)
      ||arr(state.customers).find(customer=>text(customer?.name)===text(project?.client||order?.customerName))||null;
  };
  const orderLabel=order=>{
    const project=projectForOrder(order);
    return [order?.number,order?.customerName||order?.title,project?.name].filter(Boolean).join(' · ')||'Auftrag ohne Bezeichnung';
  };
  const statusTone=status=>({Entwurf:'neutral',Freigegeben:'info',Versendet:'warning',Teilbezahlt:'warning',Bezahlt:'success',Storniert:'muted'}[status]||'neutral');
  const isOpen=invoice=>['Freigegeben','Versendet','Teilbezahlt'].includes(invoice?.status);
  const isOverdue=invoice=>isOpen(invoice)&&/^\d{4}-\d{2}-\d{2}$/.test(text(invoice?.dueDate))&&invoice.dueDate<viennaToday();
  const currentYear=()=>viennaToday().slice(0,4);

  function ensure(){
    if(!Array.isArray(state.invoices))state.invoices=[];
    state.invoices.forEach(invoice=>{
      if(!invoice||typeof invoice!=='object')return;
      if(!STATUSES.includes(invoice.status))invoice.status='Entwurf';
      if(!Number.isFinite(Number(invoice.amount))||Number(invoice.amount)<0)invoice.amount=0;
      if(typeof invoice.recipientEmail!=='string')invoice.recipientEmail='';
      if(!Array.isArray(invoice.emailHistory))invoice.emailHistory=[];
    });
  }
  function nextNumber(){
    const prefix=`ABR-${currentYear()}-`;
    const highest=Math.max(0,...invoices()
      .filter(item=>text(item?.number).startsWith(prefix))
      .map(item=>Number(text(item.number).slice(prefix.length))||0));
    return prefix+String(highest+1).padStart(3,'0');
  }
  function nextId(){
    const used=new Set(invoices().map(item=>text(item?.id)));
    let number=Math.max(0,...[...used].map(id=>Number(id.match(/(\d+)$/)?.[1])||0))+1;
    let id='';
    do{id=`ABR-${String(number++).padStart(4,'0')}`;}while(used.has(id));
    return id;
  }
  function summary(){
    const all=invoices();
    const open=all.filter(isOpen);
    return {
      drafts:all.filter(item=>item.status==='Entwurf').length,
      open:open.length,
      overdue:open.filter(isOverdue).length,
      paid:all.filter(item=>item.status==='Bezahlt').reduce((sum,item)=>sum+(Number(item.amount)||0),0),
      openValue:open.reduce((sum,item)=>sum+(Number(item.amount)||0),0)
    };
  }
  function invoiceTitle(invoice){
    const order=orderById(invoice?.orderId);
    return text(invoice?.title)||order?.title||order?.customerName||'Abrechnungsvorgang';
  }
  function emailRecipient(invoice){
    const order=orderById(invoice?.orderId),project=projectForOrder(order),customer=customerForOrder(order);
    return text(invoice?.recipientEmail)||text(project?.email)||text(customer?.email);
  }
  function emailContact(invoice){
    const order=orderById(invoice?.orderId),project=projectForOrder(order),customer=customerForOrder(order);
    return text(project?.contact)||text(customer?.contact)||text(order?.customerName)||text(project?.client);
  }
  function normalizedRecipients(value){
    const raw=text(value);
    if(!raw||/[\r\n]/.test(raw))return [];
    const values=raw.split(/[;,]/).map(item=>text(item).toLocaleLowerCase('de-AT')).filter(Boolean);
    return values.length&&values.every(value=>EMAIL_PATTERN.test(value))?[...new Set(values)]:[];
  }
  function cleanMailLine(value){return text(value).replace(/[\r\n]+/g,' ').slice(0,240);}
  function composeQuery(values){
    return Object.entries(values).map(([key,value])=>`${encodeURIComponent(key)}=${encodeURIComponent(String(value??''))}`).join('&');
  }
  function mailtoUrl(recipients,subject,body){
    return 'mailto:'+recipients.map(value=>encodeURIComponent(value)).join(',')+'?'+composeQuery({subject:cleanMailLine(subject),body:String(body??'').replace(/\r?\n/g,'\r\n')});
  }
  function outlookWebComposeUrl(recipients,subject,body){
    // Der Web-Deep-Link wird von Outlook im Browser als echter Entwurf
    // verarbeitet. Der direkte Desktop-Protokollaufruf hat für New Outlook
    // keinen verlässlichen Vertrag für Empfänger, Betreff und Nachricht.
    return 'https://outlook.office.com/mail/deeplink/compose?'+composeQuery({to:recipients.join(';'),subject:cleanMailLine(subject),body:String(body??'').replace(/\r?\n/g,'\r\n')});
  }
  function requestExternalCompose(url){
    try{
      // Die Protokollübergabe muss direkt innerhalb des Klicks erfolgen, damit
      // Browser den externen Outlook- bzw. Mail-App-Aufruf nicht blockieren.
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
      // Der neue Tab wird direkt aus dem Button-Klick geöffnet. Dadurch kann
      // Outlook Web den Empfänger, Betreff und Nachrichtentext übernehmen.
      const opened=window.open(url,'_blank');
      if(opened){
        try{opened.opener=null;}catch(error){}
        return true;
      }
    }catch(error){}
    try{
      // Falls ein Browser neue Tabs sperrt, bleibt der Versand dennoch
      // möglich: Outlook Web wird im aktuellen Tab geöffnet.
      window.location.assign(url);
      return true;
    }catch(error){
      return false;
    }
  }
  function openOutlookDefaultSettings(modal){
    if(!requestExternalCompose(OUTLOOK_DEFAULT_APPS_URL)){
      const message='Die Windows-Einstellungen konnten nicht geöffnet werden. Wähle Outlook manuell als Standard-App für MAILTO aus.';
      showEmailLaunchStatus(modal,message,true);
      showToast?.(message,null,null,'error');
      return;
    }
    const message='Die Windows-Einstellungen wurden geöffnet. Wähle dort Outlook als Standard-App für MAILTO aus und kehre anschließend hierher zurück.';
    showEmailLaunchStatus(modal,message);
    showToast?.('Windows-Einstellungen für die Outlook-Standard-App wurden geöffnet.');
  }
  function emailDraft(invoice){
    const order=orderById(invoice?.orderId),project=projectForOrder(order),contact=emailContact(invoice),sender=actor();
    const customer=order?.customerName||project?.client||'Ihr Unternehmen';
    const subject=`Abrechnung · ${invoice?.number||invoice?.id||'Vorgang'} · ${customer}`;
    const greeting=contact?`Guten Tag ${contact},`:'Guten Tag,';
    const lines=[
      greeting,
      '',
      `zu ${invoiceTitle(invoice)} wurde der Abrechnungsvorgang ${invoice?.number||invoice?.id||''} vorbereitet.`,
      '',
      `Auftrag: ${order?.number||'–'}${project?.name?` · ${project.name}`:''}`,
      `Leistung: ${invoiceTitle(invoice)}`,
      `Nettobetrag: ${money(invoice?.amount)}`,
      `Fällig am: ${dateLabel(invoice?.dueDate)}`,
      '',
      'Bei Fragen stehen wir gerne zur Verfügung.',
      '',
      'Freundliche Grüße',
      sender.name,
      sender.email
    ];
    if(!sender.email)lines.pop();
    return {to:emailRecipient(invoice),subject,body:lines.join('\n')};
  }
  function audit(action,invoice,before,after){
    const order=orderById(invoice?.orderId);
    const project=projectForOrder(order);
    window.recordAudit?.(action,{
      entityType:'Abrechnung',entityId:invoice?.id||'',orderId:invoice?.orderId||'',projectId:project?.id||'',
      summary:`${invoice?.number||invoice?.id||'Vorgang'} · ${before||'–'} → ${after||'–'}`
    });
  }
  function actionFor(invoice){
    const action={
      Entwurf:['Freigeben','Freigegeben'],
      Freigegeben:['Als versendet markieren','Versendet'],
      Versendet:['Als bezahlt markieren','Bezahlt'],
      Teilbezahlt:['Als bezahlt markieren','Bezahlt']
    }[invoice?.status];
    return action?{label:action[0],status:action[1]}:null;
  }
  function rowMarkup(invoice){
    const order=orderById(invoice.orderId);
    const project=projectForOrder(order);
    const action=actionFor(invoice);
    const overdue=isOverdue(invoice);
    return `<tr class="${overdue?'is-overdue':''}">
      <td data-label="Vorgang"><b>${esc(invoice.number||invoice.id)}</b><small>${esc(invoice.reference||'Lokale Vorbereitung')}</small></td>
      <td data-label="Auftrag"><b>${esc(order?.customerName||order?.title||'Nicht zugeordnet')}</b><small>${esc(project?.name||order?.number||'Kein Objekt hinterlegt')}</small></td>
      <td data-label="Leistung">${esc(invoiceTitle(invoice))}</td>
      <td data-label="Betrag" class="billing-money">${money(invoice.amount)}</td>
      <td data-label="Fällig"><span class="billing-due ${overdue?'is-overdue':''}">${dateLabel(invoice.dueDate)}</span></td>
      <td data-label="Status"><span class="billing-status tone-${statusTone(invoice.status)}">${esc(invoice.status)}</span></td>
      <td data-label="Aktionen" class="billing-row-actions"><button type="button" class="link" data-billing-open="${esc(invoice.id)}">Bearbeiten</button><button type="button" class="secondary" data-billing-email="${esc(invoice.id)}">E-Mail verfassen</button>${action?`<button type="button" class="secondary" data-billing-status="${esc(invoice.id)}" data-billing-next="${esc(action.status)}">${esc(action.label)}</button>`:''}</td>
    </tr>`;
  }
  function emptyMarkup(){
    return `<div class="billing-empty"><span aria-hidden="true">▤</span><div><h3>Noch keine Abrechnungsvorgänge</h3><p>Lege für einen vorhandenen Auftrag eine lokale Abrechnungsvorbereitung an. Die Daten bleiben in diesem Arbeitsstand und werden nicht an Odoo übertragen.</p><button type="button" class="primary" data-billing-create>Abrechnung vorbereiten</button></div></div>`;
  }
  function page(){
    ensure();
    const stats=summary();
    const items=[...invoices()].sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')));
    return `<section class="page billing-workspace" id="billing"><div class="section-head billing-page-head"><div><span class="eyebrow">Kaufmännischer Arbeitsstand</span><h2>Abrechnung</h2><p>Abrechnungsvorgänge, Fälligkeiten und Zahlungseingänge im Überblick.</p></div><button type="button" class="primary" data-billing-create>+ Abrechnung vorbereiten</button></div><p class="billing-local-note"><b>Lokal vorbereitet:</b> Diese Ansicht verwaltet Abrechnungsvorgänge im Browser. Eine Odoo- oder Finanzbuchhaltungs-Synchronisierung ist nicht verbunden.</p><section class="billing-summary" aria-label="Abrechnungskennzahlen"><article class="card billing-metric"><small>Entwürfe</small><strong>${stats.drafts}</strong><span>noch nicht freigegeben</span></article><article class="card billing-metric"><small>Offene Vorgänge</small><strong>${stats.open}</strong><span>${money(stats.openValue)} ausständig</span></article><article class="card billing-metric ${stats.overdue?'is-alert':''}"><small>Überfällig</small><strong>${stats.overdue}</strong><span>${stats.overdue?'Fälligkeiten prüfen':'keine überfälligen Vorgänge'}</span></article><article class="card billing-metric"><small>Bezahlt</small><strong>${money(stats.paid)}</strong><span>lokal als bezahlt markiert</span></article></section><section class="card billing-list-card"><div class="billing-list-head"><div><span class="eyebrow">Vorgänge</span><h3>Abrechnungsübersicht</h3></div><span>${items.length} ${items.length===1?'Vorgang':'Vorgänge'}</span></div>${items.length?`<div class="billing-table-wrap"><table class="billing-table"><thead><tr><th>Vorgang</th><th>Auftrag</th><th>Leistung</th><th>Betrag</th><th>Fällig</th><th>Status</th><th>Aktionen</th></tr></thead><tbody>${items.map(rowMarkup).join('')}</tbody></table></div>`:emptyMarkup()}</section></section>`;
  }
  function closeDialog(){
    const modal=document.getElementById('billingDialog');
    if(!modal)return;
    modal.classList.add('is-closing');
    setTimeout(()=>{
      modal.remove();
      if(!document.querySelector('.modal-backdrop'))document.body.style.overflow='';
    },typeof reduceMotion!=='undefined'&&reduceMotion?0:170);
  }
  function closeEmailDialog(){
    const modal=document.getElementById('billingEmailDialog');
    if(!modal)return;
    modal.classList.add('is-closing');
    setTimeout(()=>{
      modal.remove();
      if(!document.querySelector('.modal-backdrop'))document.body.style.overflow='';
    },typeof reduceMotion!=='undefined'&&reduceMotion?0:170);
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
    const subject=cleanMailLine(form.elements.subject?.value);
    const body=String(form.elements.body?.value||'').trim();
    return {recipients,subject,body};
  }
  function validMailFields(form){
    const values=mailFields(form);
    if(!values.recipients.length){showToast?.('Bitte mindestens eine gültige Empfängeradresse angeben.',null,null,'error');form.elements.to?.focus();return null;}
    if(!values.subject){showToast?.('Bitte einen Betreff angeben.',null,null,'error');form.elements.subject?.focus();return null;}
    if(!values.body){showToast?.('Bitte einen Nachrichtentext angeben.',null,null,'error');form.elements.body?.focus();return null;}
    return values;
  }
  function showEmailLaunchStatus(modal,message,isError=false){
    const status=modal.querySelector('[data-billing-email-launch-status]');
    if(!status)return;
    status.hidden=false;
    status.textContent=message;
    status.classList.toggle('is-error',Boolean(isError));
  }
  function recordEmailLaunch(invoice,values,channel){
    const openedAt=now();
    const transport=channel==='outlook-web'?'Outlook im Browser':'Standard-Mail-App';
    const record={
      id:'MAIL-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),
      to:values.recipients,
      subject:values.subject,
      body:values.body,
      openedAt,
      openedBy:actor(),
      transport,
      status:channel==='outlook-web'?'Outlook-Web-Entwurf angefordert':'An Standard-Mail-App übergeben'
    };
    invoice.recipientEmail=values.recipients.join(', ');
    invoice.emailHistory.unshift(record);
    invoice.updatedAt=openedAt;
    invoice.updatedBy=record.openedBy;
    window.recordAudit?.('Öffnen eines E-Mail-Entwurfs angefordert',{
      entityType:'Abrechnung',entityId:invoice.id,orderId:invoice.orderId||'',
      summary:`${invoice.number||invoice.id} · ${transport} · Empfänger: ${values.recipients.join(', ')}`
    });
    save?.();
  }
  function launchEmailClient(modal,invoice,channel){
    const form=modal.querySelector('#billingEmailForm');
    if(!form)return;
    const values=validMailFields(form);
    if(!values)return;
    const useOutlookWeb=channel==='outlook-web';
    const url=useOutlookWeb?outlookWebComposeUrl(values.recipients,values.subject,values.body):mailtoUrl(values.recipients,values.subject,values.body);
    const label=useOutlookWeb?'Outlook im Browser':'die Standard-Mail-App';
    if(url.length>COMPOSE_URL_LIMIT){
      const message='Der Entwurf ist für eine sichere Übergabe an die Mail-App zu lang. Bitte kürze die Nachricht oder kopiere den Text.';
      showEmailLaunchStatus(modal,message,true);
      showToast?.(message,null,null,'error');
      return;
    }
    // Dieser Aufruf steht bewusst vor Speichern oder Rendern: Der Browser
    // erkennt ihn so weiterhin als direkte Aktion des Klicks auf den Button.
    const opened=useOutlookWeb?requestOutlookWebCompose(url):requestExternalCompose(url);
    if(!opened){
      const message=useOutlookWeb?'Outlook im Browser konnte nicht geöffnet werden. Nutze die Standard-Mail-App oder kopiere den Text.':'Die Standard-Mail-App konnte vom Browser nicht geöffnet werden. Kopiere den Text und füge ihn in deinem Mailprogramm ein.';
      showEmailLaunchStatus(modal,message,true);
      showToast?.(message,null,null,'error');
      return;
    }
    recordEmailLaunch(invoice,values,useOutlookWeb?'outlook-web':'mailto');
    showEmailLaunchStatus(modal,useOutlookWeb?'Outlook im Browser wurde mit dem vorbefüllten Entwurf geöffnet. Prüfe ihn dort und klicke selbst auf „Senden“.':'Der Entwurf wurde an die in Windows eingestellte Standard-Mail-App übergeben. Ist Outlook für MAILTO als Standard eingerichtet, prüfe ihn dort und klicke selbst auf „Senden“.');
    const action=modal.querySelector(useOutlookWeb?'[data-billing-email-outlook-web]':'[data-billing-email-mailto]');
    if(action)action.textContent=useOutlookWeb?'Outlook erneut im Browser öffnen':'E-Mail-App erneut öffnen';
    showToast?.(useOutlookWeb?'Outlook im Browser wurde mit dem Entwurf geöffnet. Bitte dort prüfen und senden.':`${label} wurde mit dem Entwurf angefordert. Bitte dort prüfen und senden.`);
  }
  function openEmailDialog(id){
    if(!window.requirePermission?.('reports','das Verfassen einer Abrechnungs-E-Mail'))return;
    ensure();
    const invoice=invoiceById(id);
    if(!invoice||document.getElementById('billingEmailDialog'))return;
    const draft=emailDraft(invoice);
    const modal=document.createElement('div');
    modal.id='billingEmailDialog';
    modal.className='modal-backdrop';
    modal.setAttribute('role','presentation');
    modal.innerHTML=`<div class="modal-card billing-modal-card billing-email-modal-card" role="dialog" aria-modal="true" aria-labelledby="billingEmailDialogTitle"><div class="modal-head"><div><span class="eyebrow">${esc(invoice.number||invoice.id)} · E-Mail</span><h2 id="billingEmailDialogTitle">E-Mail verfassen</h2><p>Empfänger, Betreff und Text können vor dem Öffnen des Mailprogramms angepasst werden.</p></div><button type="button" class="modal-close" aria-label="Dialog schließen" data-billing-email-close>×</button></div><form id="billingEmailForm" novalidate><div class="billing-form-grid"><label class="billing-form-wide">An *<input name="to" type="email" multiple required maxlength="500" autocomplete="email" value="${esc(draft.to)}" placeholder="kunde@beispiel.at"></label><label class="billing-form-wide">Betreff *<input name="subject" required maxlength="240" value="${esc(draft.subject)}"></label><label class="billing-form-wide">Nachricht *<textarea name="body" required maxlength="4500">${esc(draft.body)}</textarea></label></div><p class="billing-email-note"><b>E-Mail-App öffnen:</b> Übergibt den Entwurf an die in Windows für <code>MAILTO</code> eingestellte Standard-Mail-App. Damit Outlook Empfänger, Betreff und Nachricht übernimmt, wähle einmal „Outlook als Standard einrichten“. Alternativ erstellt „Outlook im Browser öffnen“ einen vorbefüllten Web-Entwurf. Der Versand erfolgt erst nach deinem Klick auf „Senden“ in Outlook; Anhänge können nicht über einen E-Mail-Link übertragen werden.</p><p class="billing-email-launch-status" data-billing-email-launch-status role="status" aria-live="polite" hidden></p><div class="modal-actions billing-email-actions"><button type="button" class="secondary" data-billing-email-copy>Text kopieren</button><button type="button" class="secondary" data-billing-email-default-outlook>Outlook als Standard einrichten</button><button type="button" class="secondary" data-billing-email-outlook-web>Outlook im Browser öffnen</button><button type="button" class="secondary" data-billing-email-close>Abbrechen</button><button type="submit" class="primary" data-billing-email-mailto>E-Mail-App öffnen</button></div></form></div>`;
    modal.addEventListener('click',event=>{if(event.target===modal)closeEmailDialog();});
    document.body.appendChild(modal);
    document.body.style.overflow='hidden';
    modal.querySelectorAll('[data-billing-email-close]').forEach(button=>button.addEventListener('click',closeEmailDialog));
    modal.querySelector('[data-billing-email-copy]')?.addEventListener('click',async()=>{
      const values=mailFields(modal.querySelector('#billingEmailForm'));
      const copied=await copyText(`An: ${values.recipients.join(', ')}\nBetreff: ${values.subject}\n\n${values.body}`);
      showToast?.(copied?'E-Mail-Text wurde in die Zwischenablage kopiert.':'Der E-Mail-Text konnte nicht kopiert werden.',null,null,copied?undefined:'error');
    });
    modal.querySelector('[data-billing-email-default-outlook]')?.addEventListener('click',()=>openOutlookDefaultSettings(modal));
    modal.querySelector('[data-billing-email-outlook-web]')?.addEventListener('click',()=>launchEmailClient(modal,invoice,'outlook-web'));
    modal.querySelector('#billingEmailForm')?.addEventListener('submit',event=>{
      event.preventDefault();
      launchEmailClient(modal,invoice,'mailto');
    });
    if(typeof enhanceFormControls==='function')enhanceFormControls(modal);
    setTimeout(()=>modal.querySelector('input[name="to"]')?.focus(),50);
  }
  function saveFromForm(form,id=''){
    if(!window.requirePermission?.('reports','die Abrechnungsvorbereitung'))return;
    const orderId=text(form.elements.orderId?.value);
    const title=text(form.elements.title?.value);
    const dueDate=text(form.elements.dueDate?.value);
    const amount=Number(String(form.elements.amount?.value||'').replace(',','.'));
    const status=text(form.elements.status?.value);
    const order=orderById(orderId);
    if(!order){showToast?.('Bitte einen vorhandenen Auftrag auswählen.',null,null,'error');return;}
    if(!title){showToast?.('Bitte eine Leistung oder Abrechnungsbezeichnung angeben.',null,null,'error');form.elements.title?.focus();return;}
    if(!Number.isFinite(amount)||amount<=0){showToast?.('Bitte einen Nettobetrag größer als 0 eingeben.',null,null,'error');form.elements.amount?.focus();return;}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)){showToast?.('Bitte ein gültiges Fälligkeitsdatum angeben.',null,null,'error');form.elements.dueDate?.focus();return;}
    if(!STATUSES.includes(status)){showToast?.('Der gewählte Status ist ungültig.',null,null,'error');return;}
    const existing=invoiceById(id),before=existing?clone(existing):null;
    const values={orderId,title,amount,dueDate,status,reference:text(form.elements.reference?.value),notes:text(form.elements.notes?.value),updatedAt:now(),updatedBy:actor()};
    let saved=existing;
    if(existing){Object.assign(existing,values);}else{
      saved={id:nextId(),number:nextNumber(),createdAt:now(),createdBy:actor(),...values};
      state.invoices.push(saved);
    }
    audit(existing?'Abrechnungsvorgang aktualisiert':'Abrechnungsvorgang angelegt',saved,before?.status||'neu',saved.status);
    save?.();
    closeDialog();
    window.renderAll?.();
    setActivePage?.('billing');
    showToast?.(`${saved.number} wurde ${existing?'aktualisiert':'lokal vorbereitet'}.`);
  }
  function openDialog(id=''){
    if(!window.requirePermission?.('reports','die Abrechnungsvorbereitung'))return;
    ensure();
    const existing=id?invoiceById(id):null;
    if(id&&!existing)return;
    if(!existing&&!orders().length){showToast?.('Lege zuerst einen Auftrag an, bevor du eine Abrechnung vorbereitest.',null,null,'error');return;}
    if(document.getElementById('billingDialog'))return;
    const defaultOrder=orders().find(order=>order.id===state.workspace?.activeOrderId)||orders()[0];
    const invoice=existing||{orderId:defaultOrder?.id||'',title:defaultOrder?.title||'',amount:'',dueDate:futureDate(30),status:'Entwurf',reference:'',notes:''};
    const modal=document.createElement('div');
    modal.id='billingDialog';
    modal.className='modal-backdrop';
    modal.setAttribute('role','presentation');
    const orderOptions=orders().map(order=>`<option value="${esc(order.id)}" ${order.id===invoice.orderId?'selected':''}>${esc(orderLabel(order))}</option>`).join('');
    modal.innerHTML=`<div class="modal-card billing-modal-card" role="dialog" aria-modal="true" aria-labelledby="billingDialogTitle"><div class="modal-head"><div><span class="eyebrow">Lokale Abrechnungsvorbereitung</span><h2 id="billingDialogTitle">${existing?'Abrechnungsvorgang bearbeiten':'Abrechnung vorbereiten'}</h2><p>Der Vorgang bleibt lokal gespeichert und wird nicht als Rechnung gebucht oder extern übermittelt.</p></div><button type="button" class="modal-close" aria-label="Dialog schließen" data-billing-close>×</button></div><form id="billingForm" novalidate><div class="billing-form-grid"><label>Auftrag<select name="orderId" required data-native-select>${orderOptions}</select></label><label>Referenz<input name="reference" maxlength="100" value="${esc(invoice.reference||'')}" placeholder="z. B. Kunden- oder interne Referenz"></label><label class="billing-form-wide">Leistung / Abrechnungsbezeichnung<input name="title" required maxlength="180" value="${esc(invoice.title||'')}" placeholder="z. B. Wiederkehrende BMA-Prüfung 2026"></label><label>Nettobetrag in EUR<input name="amount" required min="0.01" step="0.01" inputmode="decimal" type="number" value="${Number.isFinite(Number(invoice.amount))&&Number(invoice.amount)>0?String(invoice.amount):''}" placeholder="0,00"></label><label>Fällig am<input name="dueDate" required type="date" value="${esc(invoice.dueDate||futureDate(30))}"></label><label>Status<select name="status" data-native-select>${STATUSES.map(status=>`<option value="${esc(status)}" ${status===invoice.status?'selected':''}>${esc(status)}</option>`).join('')}</select></label><label class="billing-form-wide">Interne Notiz<textarea name="notes" maxlength="1200" placeholder="Optional: Leistungsumfang, Abstimmung oder Hinweis">${esc(invoice.notes||'')}</textarea></label></div><p class="billing-form-note"><b>Hinweis:</b> Das ist eine lokale Arbeitsvorbereitung. Keine Rechnung, Buchung, Steuerberechnung oder Odoo-Synchronisierung wird ausgelöst.</p><div class="modal-actions"><button type="button" class="secondary" data-billing-close>Abbrechen</button><button type="submit" class="primary">${existing?'Änderungen speichern':'Vorgang anlegen'}</button></div></form></div>`;
    modal.addEventListener('click',event=>{if(event.target===modal)closeDialog();});
    document.body.appendChild(modal);
    document.body.style.overflow='hidden';
    modal.querySelectorAll('[data-billing-close]').forEach(button=>button.addEventListener('click',closeDialog));
    modal.querySelector('#billingForm')?.addEventListener('submit',event=>{event.preventDefault();saveFromForm(event.currentTarget,existing?.id||'');});
    if(typeof enhanceFormControls==='function')enhanceFormControls(modal);
    setTimeout(()=>modal.querySelector('select[name="orderId"]')?.focus(),50);
  }
  function updateStatus(id,status){
    if(!window.requirePermission?.('reports','das Aktualisieren eines Abrechnungsvorgangs'))return;
    const invoice=invoiceById(id);
    if(!invoice||!STATUSES.includes(status)||status===invoice.status)return;
    const before=invoice.status;
    invoice.status=status;
    invoice.updatedAt=now();
    invoice.updatedBy=actor();
    audit('Status eines Abrechnungsvorgangs geändert',invoice,before,status);
    save?.();
    window.renderAll?.();
    setActivePage?.('billing');
    showToast?.(`${invoice.number} ist jetzt „${status}“.`);
  }

  window.billing=page;
  window.openBillingDialog=openDialog;
  window.closeBillingDialog=closeDialog;
  window.openBillingEmailDialog=openEmailDialog;
  window.closeBillingEmailDialog=closeEmailDialog;
  window.updateBillingStatus=updateStatus;
  window.runBillingWorkspaceTests=function(){
    ensure();
    const original=state.invoices;
    state.invoices=[{id:'ABR-0001',number:`ABR-${currentYear()}-001`,orderId:'',title:'Testvorgang',amount:1250,status:'Versendet',dueDate:'2000-01-01'}];
    const stats=summary();
    const results=[
      {name:'Abrechnungsvorgänge werden lokal als Liste geführt',passed:Array.isArray(state.invoices)},
      {name:'Laufende Nummer wird aus dem aktuellen Jahr gebildet',passed:nextNumber()===`ABR-${currentYear()}-002`},
      {name:'Offene und überfällige Vorgänge werden getrennt erkannt',passed:stats.open===1&&stats.overdue===1},
      {name:'Schreibende Aktionen sind berechtigungsgeschützt',passed:String(openDialog).includes('requirePermission')&&String(updateStatus).includes('requirePermission')},
      {name:'Mailto-Entwurf enthält Empfänger, Betreff und Nachricht',passed:mailtoUrl(['kunde@example.com'],'Abrechnung','Guten Tag').includes('mailto:kunde%40example.com')&&normalizedRecipients('kunde@example.com; zweite@example.com').length===2},
      {name:'Outlook-Web-Entwurf enthält Empfänger, Betreff und Nachricht',passed:outlookWebComposeUrl(['kunde@example.com'],'Abrechnung','Guten Tag').startsWith('https://outlook.office.com/mail/deeplink/compose?to=kunde%40example.com&subject=Abrechnung&body=Guten%20Tag')},
      {name:'Outlook Web ist als vorbefüllter Browser-Fallback verfügbar',passed:outlookWebComposeUrl(['kunde@example.com'],'Abrechnung','Guten Tag').startsWith('https://outlook.office.com/')&&String(launchEmailClient).includes('requestOutlookWebCompose(url)')},
      {name:'Die Windows-Standard-App-Einstellung für New Outlook ist direkt erreichbar',passed:OUTLOOK_DEFAULT_APPS_URL==='ms-settings:defaultapps?registeredAUMID=Microsoft.OutlookForWindows_8wekyb3d8bbwe%21Microsoft.OutlookforWindows'&&String(openOutlookDefaultSettings).includes('requestExternalCompose(OUTLOOK_DEFAULT_APPS_URL)')},
      {name:'Die E-Mail-App wird über MAILTO vor dem Speichern direkt aus der Button-Aktion angefordert',passed:String(openEmailDialog).includes("launchEmailClient(modal,invoice,'mailto')")&&String(launchEmailClient).indexOf('const opened=useOutlookWeb?requestOutlookWebCompose(url):requestExternalCompose(url)')<String(launchEmailClient).indexOf('recordEmailLaunch(invoice')},
      {name:'Lange E-Mail-Links werden vor der Übergabe abgefangen',passed:COMPOSE_URL_LIMIT>1000&&mailtoUrl(['kunde@example.com'],'Abrechnung','x'.repeat(COMPOSE_URL_LIMIT)).length>COMPOSE_URL_LIMIT},
      {name:'Die Fachseite stellt eine responsive Übersicht bereit',passed:page().includes('billing-table')}
    ];
    state.invoices=original;
    return {passed:results.every(item=>item.passed),tests:results};
  };
  ensure();
  const tests=window.runBillingWorkspaceTests();
  window.__INGTEC_BILLING_TESTS__=tests;
  document.documentElement.dataset.billingTests=tests.passed?'passed':'failed';
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    const create=target?.closest('[data-billing-create]');
    if(create){event.preventDefault();openDialog();return;}
    const open=target?.closest('[data-billing-open]');
    if(open){event.preventDefault();openDialog(open.dataset.billingOpen);return;}
    const status=target?.closest('[data-billing-status]');
    if(status){event.preventDefault();updateStatus(status.dataset.billingStatus,status.dataset.billingNext);}
    const email=target?.closest('[data-billing-email]');
    if(email){event.preventDefault();openEmailDialog(email.dataset.billingEmail);}
  });
  window.renderAll?.();
  if(location.hash==='#billing')setTimeout(()=>setActivePage?.('billing'),0);
  const params=new URL(location.href).searchParams;
  if(params.get('billing-test')==='1'){
    const pre=document.createElement('pre');
    pre.id='billingTestResults';
    pre.hidden=true;
    pre.textContent=JSON.stringify(tests);
    document.body.appendChild(pre);
  }
})();
