(function(){
  'use strict';
  if(typeof state==='undefined'||typeof questions==='undefined')return;

  const MODEL_VERSION=2;
  const RESULT_OPTIONS=[
    ['fulfilled','✓','Erfüllt','success'],
    ['partial','◐','Teilweise erfüllt','warning'],
    ['failed','!','Nicht erfüllt','danger'],
    ['not_applicable','—','Nicht anwendbar','neutral'],
    ['not_testable','i','Nicht prüfbar','info']
  ];
  const EVIDENCE_OPTIONS=[
    ['checked','Vorhanden und geprüft'],
    ['unverified','Vorhanden, noch ungeprüft'],
    ['pending','Nachweis ausständig'],
    ['missing','Nicht vorhanden']
  ];
  const RULES={
    version:'BMA-PRUEFREGELN-2026.1',
    allowQsException:true,
    defaults:{evidenceRequired:true,findingRequiredOn:['partial','failed'],reasonRequiredOn:['not_applicable','not_testable'],followUpRequiredOn:['not_testable'],findingEvidenceRequired:false},
    questions:Object.fromEntries(questions.map(([id])=>[id,{}]))
  };
  window.INGTEC_INSPECTION_RULES=RULES;
  if(window.INGTEC_SAFETY_SCORE_RULESETS?.['INGTEC-SAFETY-2026.1']){
    window.INGTEC_SAFETY_SCORE_RULESETS['INGTEC-SAFETY-2026.1'].answerPoints.not_applicable=0;
  }

  const esc=value=>typeof escapeHtml==='function'?escapeHtml(String(value==null?'':value)):String(value==null?'':value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const now=()=>new Date().toISOString();
  const activeInspection=()=>typeof window.activeInspection==='function'?window.activeInspection():(state.inspections||[]).find(item=>item?.id===state.activeInspectionId)||state.inspections?.[0]||null;
  const activeProject=()=>{const inspection=activeInspection();return [...(state.projects||[]),...(state.completedProjects||[])].find(item=>item?.id===inspection?.projectId)||state.projects?.[0]||null};
  const activeActorName=()=>typeof activeUserAccount==='function'?(activeUserAccount()?.name||state.user?.name||'Lokaler Benutzer'):(state.user?.name||'Lokaler Benutzer');
  const ruleFor=id=>({...RULES.defaults,...(RULES.questions[id]||{})});
  const resultInfo=value=>RESULT_OPTIONS.find(item=>item[0]===value);
  const evidenceInfo=value=>EVIDENCE_OPTIONS.find(item=>item[0]===value)||EVIDENCE_OPTIONS[1];
  const evidenceAfterResultSelection=(value,current)=>resultInfo(value)?'checked':current;
  const questionById=id=>questions.find(item=>item[0]===id);
  const questionFindings=id=>(state.findings||[]).filter(item=>item?.inspectionId===activeInspection()?.id&&(item.questionId===id||item.checkpoint===id));
  const measureFor=finding=>(state.measures||[]).find(item=>item?.findingId===finding?.id);
  const questionDocuments=id=>{
    const ids=new Set();
    questionFindings(id).forEach(finding=>(finding.evidenceIds||[]).forEach(value=>ids.add(value)));
    return (state.documents||[]).filter(item=>ids.has(item.id)||item.questionId===id);
  };
  const dateTime=value=>{
    const date=new Date(value||Date.now());
    return Number.isNaN(date.getTime())?'–':new Intl.DateTimeFormat('de-AT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);
  };

  function recordChange(id,field,before,after,reason=''){
    if(String(before)===String(after))return;
    window.recordAudit?.('Prüfpunkt geändert',{entityType:'Prüfpunkt',entityId:id,summary:field+': „'+String(before||'leer')+'“ → „'+String(after||'leer')+'“'+(reason?' · Grund: '+reason:'')});
  }

  function ensureModel(){
    state.inspectionEvidence=state.inspectionEvidence&&typeof state.inspectionEvidence==='object'?state.inspectionEvidence:{};
    state.inspectionQuestionMeta=state.inspectionQuestionMeta&&typeof state.inspectionQuestionMeta==='object'?state.inspectionQuestionMeta:{};
    state.inspectionUi=state.inspectionUi&&typeof state.inspectionUi==='object'?state.inspectionUi:{filter:'all',collapsedCompleted:false};
    state.qsExceptions=Array.isArray(state.qsExceptions)?state.qsExceptions:[];
    let changed=false;
    questions.forEach(([id])=>{
      const meta=state.inspectionQuestionMeta[id]=state.inspectionQuestionMeta[id]||{reason:'',followUp:'',migrationReview:false,legacyValue:'',legacySource:'',updatedAt:''};
      if(!state.inspectionEvidence[id]){
        const source=state.source?.[id];
        state.inspectionEvidence[id]=source==='verified'?'checked':source==='prior'?'unverified':source==='red'?'unverified':'unverified';
        if(source)meta.legacySource=source;
        changed=true;
      }
      const answer=state.answers?.[id];
      if(answer==='evidence'||answer==='not_present'){
        meta.migrationReview=true;
        meta.legacyValue=answer;
        meta.migratedAt=meta.migratedAt||now();
        if(answer==='evidence')state.inspectionEvidence[id]='pending';
        state.answers[id]='open';
        changed=true;
      }
    });
    const inspection=activeInspection();
    if(inspection){
      inspection.evidenceStatuses={...state.inspectionEvidence};
      inspection.questionMeta=JSON.parse(JSON.stringify(state.inspectionQuestionMeta));
      inspection.modelVersion=MODEL_VERSION;
      inspection.profileSnapshot=inspection.profileSnapshot||{};
      inspection.profileSnapshot.validationRules=inspection.profileSnapshot.validationRules||JSON.parse(JSON.stringify(RULES));
    }
    if(state.inspectionModelVersion!==MODEL_VERSION){state.inspectionModelVersion=MODEL_VERSION;changed=true}
    if(changed&&typeof save==='function')save();
  }

  function blockersForQuestion(id){
    const result=state.answers?.[id]||'open';
    const evidence=state.inspectionEvidence?.[id]||'unverified';
    const meta=state.inspectionQuestionMeta?.[id]||{};
    const rules=ruleFor(id);
    const findings=questionFindings(id);
    const blockers=[];
    if(!resultInfo(result))blockers.push({id,kind:'result',label:'Prüfergebnis fehlt'});
    if(rules.evidenceRequired&&evidence!=='checked')blockers.push({id,kind:'evidence',label:evidence==='missing'?'Erforderlicher Nachweis fehlt':evidence==='pending'?'Nachweis ist noch ausständig':'Prüfgrundlage/Nachweis ist noch ungeprüft'});
    if(rules.findingRequiredOn.includes(result)&&!findings.length)blockers.push({id,kind:'finding',label:'Erforderliche Feststellung fehlt'});
    if(rules.reasonRequiredOn.includes(result)&&!String(meta.reason||'').trim())blockers.push({id,kind:'reason',label:'Fachliche Begründung fehlt'});
    if(rules.followUpRequiredOn.includes(result)&&!String(meta.followUp||'').trim())blockers.push({id,kind:'followup',label:'Hinweis zur Nachprüfung fehlt'});
    if(meta.migrationReview)blockers.push({id,kind:'migration',label:'Migration fachlich prüfen (Altwert: '+meta.legacyValue+')'});
    findings.forEach(finding=>{
      const measure=measureFor(finding);
      if(!String(finding.actualCondition||finding.description||'').trim())blockers.push({id,kind:'finding-detail',label:finding.id+': Beschreibung des Zustands fehlt'});
      if(!String(finding.basis||'').trim())blockers.push({id,kind:'finding-detail',label:finding.id+': fachliche Grundlage fehlt'});
      if(!String(finding.class||'').trim())blockers.push({id,kind:'finding-detail',label:finding.id+': Risikoeinstufung fehlt'});
      if(!measure||!String(measure.action||'').trim())blockers.push({id,kind:'measure',label:finding.id+': erforderliche Maßnahme fehlt'});
      if(!measure?.ownerId)blockers.push({id,kind:'measure',label:finding.id+': verantwortliche Person fehlt'});
      if(!measure?.due)blockers.push({id,kind:'measure',label:finding.id+': Frist fehlt'});
      if(rules.findingEvidenceRequired&&!(finding.evidenceIds||[]).length)blockers.push({id,kind:'document',label:finding.id+': Pflichtfoto oder Pflichtdokument fehlt'});
    });
    if(result==='fulfilled'&&evidence==='missing')blockers.push({id,kind:'conflict',label:'Widerspruch: erfüllt, aber Nachweis nicht vorhanden'});
    return blockers;
  }
  function allBlockers(){return questions.flatMap(([id])=>blockersForQuestion(id))}
  window.inspectionQualityCheck=()=>({ready:allBlockers().length===0,blockers:allBlockers(),checkedAt:now(),ruleVersion:RULES.version});

  function stats(){
    const evaluated=questions.filter(([id])=>Boolean(resultInfo(state.answers?.[id]))).length;
    const checked=questions.filter(([id])=>state.inspectionEvidence?.[id]==='checked').length;
    const blockers=allBlockers();
    return {evaluated,checked,total:questions.length,blockers,ready:blockers.length===0};
  }
  function chapterStats(chapter){
    const entries=questions.filter(item=>item[1]===chapter);
    const ids=entries.map(item=>item[0]);
    const evaluated=ids.filter(id=>resultInfo(state.answers?.[id])).length;
    const checked=ids.filter(id=>state.inspectionEvidence?.[id]==='checked').length;
    const findings=ids.reduce((sum,id)=>sum+questionFindings(id).length,0);
    const blockers=ids.reduce((sum,id)=>sum+blockersForQuestion(id).length,0);
    const hasFailure=ids.some(id=>state.answers?.[id]==='failed');
    const status=hasFailure?'blocked':blockers?'working':evaluated===ids.length&&checked===ids.length?'ready':evaluated?'working':'idle';
    return {evaluated,checked,total:ids.length,findings,blockers,status};
  }

  function syncCompatibilitySource(id,value){
    state.source=state.source||{};
    state.source[id]=value==='checked'?'verified':value==='unverified'?'prior':'red';
  }
  window.setInspectionEvidence=function(id,value){
    if(!EVIDENCE_OPTIONS.some(item=>item[0]===value)||!window.requirePermission?.('inspection','das Ändern des Nachweisstatus'))return;
    ensureModel();const before=state.inspectionEvidence[id];state.inspectionEvidence[id]=value;syncCompatibilitySource(id,value);
    state.inspectionQuestionMeta[id].updatedAt=now();recordChange(id,'Nachweisstatus',evidenceInfo(before)?.[1],evidenceInfo(value)?.[1]);
    window.recalc?.();
  };
  window.setInspectionResultV2=function(id,value){
    if(!RESULT_OPTIONS.some(item=>item[0]===value)||!window.requirePermission?.('inspection','das Bewerten von Prüfpunkten'))return;
    ensureModel();const before=state.answers[id]||'open',evidenceBefore=state.inspectionEvidence[id]||'unverified',evidenceAfter=evidenceAfterResultSelection(value,evidenceBefore);
    state.answers[id]=value;
    if(evidenceAfter!==evidenceBefore){
      state.inspectionEvidence[id]=evidenceAfter;
      syncCompatibilitySource(id,evidenceAfter);
      recordChange(id,'Nachweisstatus',evidenceInfo(evidenceBefore)?.[1],evidenceInfo(evidenceAfter)?.[1],'automatisch nach der Ergebniswahl');
    }
    state.inspectionQuestionMeta[id].updatedAt=now();recordChange(id,'Prüfergebnis',resultInfo(before)?.[2]||before,resultInfo(value)?.[2]);
    window.recalc?.();
  };
  window.updateInspectionMeta=function(id,field,value){
    if(!['reason','followUp'].includes(field)||!window.requirePermission?.('inspection','das Dokumentieren der Begründung'))return;
    ensureModel();const meta=state.inspectionQuestionMeta[id],before=meta[field]||'';meta[field]=String(value||'').trim();meta.updatedAt=now();recordChange(id,field==='reason'?'Begründung':'Nachprüfung',before,meta[field]);save?.();window.renderAll?.();setActivePage?.('inspection');
  };
  window.resolveInspectionMigration=function(id){
    const meta=state.inspectionQuestionMeta?.[id];if(!meta)return;meta.migrationReview=false;meta.reviewedAt=now();meta.reviewedBy=activeActorName();recordChange(id,'Migrationsprüfung','offen','fachlich geprüft',meta.legacyValue);save?.();window.renderAll?.();setActivePage?.('inspection');
  };

  let pendingFindingQuestion='';
  const baseCreateFinding=window.createFindingRecord;
  if(typeof baseCreateFinding==='function')window.createFindingRecord=function(input){
    const finding=baseCreateFinding.apply(this,arguments);
    if(finding&&pendingFindingQuestion){finding.questionId=pendingFindingQuestion;finding.checkpoint=finding.checkpoint||pendingFindingQuestion;pendingFindingQuestion='';save?.()}
    return finding;
  };
  window.openInspectionFinding=function(id){pendingFindingQuestion=id;window.openFindingDialog?.()};

  window.setInspectionFilter=function(filter){state.inspectionUi.filter=filter;save?.();window.renderAll?.();setActivePage?.('inspection')};
  function questionMatches(id){
    const filter=state.inspectionUi.filter||'all',result=state.answers?.[id]||'open',evidence=state.inspectionEvidence?.[id],findings=questionFindings(id),blockers=blockersForQuestion(id);
    return filter==='all'||filter==='not-started'&&!resultInfo(result)||filter==='unverified'&&evidence==='unverified'||filter==='missing-evidence'&&['pending','missing'].includes(evidence)||filter==='partial'&&result==='partial'||filter==='failed'&&result==='failed'||filter==='findings'&&findings.length||filter==='blockers'&&blockers.length;
  }
  window.nextOpenInspectionQuestion=function(){
    const entry=questions.find(([id])=>blockersForQuestion(id).length)||questions.find(([id])=>!resultInfo(state.answers?.[id]));
    if(!entry){window.showToast?.('Alle Prüfpunkte sind für die QS-Übergabe vollständig.');return}
    document.getElementById('inspection-question-'+entry[0])?.scrollIntoView({behavior:'smooth',block:'center'});
    document.getElementById('inspection-question-'+entry[0])?.focus({preventScroll:true});
  };
  window.jumpToInspectionQuestion=function(id){document.getElementById('inspectionQsModal')?.remove();document.body.style.overflow='';setTimeout(()=>{const card=document.getElementById('inspection-question-'+id);card?.scrollIntoView({behavior:'smooth',block:'center'});card?.focus({preventScroll:true})},40)};
  window.toggleInspectionPanel=function(panel){document.querySelector('#inspection .'+panel)?.classList.toggle('is-open')};

  function filterMarkup(){
    const primary=[['all','Alle','Alle Prüfpunkte'],['not-started','Offen','Nicht begonnene Prüfpunkte'],['blockers','Blocker','Übergabeblocker']];
    const secondary=[['findings','Feststellungen'],['unverified','Ungeprüfte Quellen'],['missing-evidence','Fehlende Nachweise'],['partial','Teilweise erfüllt'],['failed','Nicht erfüllt']];
    const active=state.inspectionUi.filter||'all',button=([id,label,accessibleLabel])=>'<button type="button" class="'+(active===id?'active':'')+'" aria-label="'+esc(accessibleLabel||label)+'" aria-pressed="'+(active===id)+'" onclick="setInspectionFilter(\''+id+'\')">'+label+'</button>';
    return '<div class="inspection-filters" role="toolbar" aria-label="Prüfpunkte filtern">'+primary.map(button).join('')+'<details class="inspection-more-filters"'+(secondary.some(([id])=>id===active)?' open':'')+'><summary>Weitere Filter</summary><div>'+secondary.map(button).join('')+'</div></details><button type="button" class="next-open" aria-label="Nächster offener Prüfpunkt" title="Nächster offener Prüfpunkt" onclick="nextOpenInspectionQuestion()"><span class="next-open-label">Nächster offener Punkt</span><span class="next-open-arrow" aria-hidden="true">→</span></button></div>';
  }
  function progressMarkup(summary){
    const percent=Math.round(summary.evaluated/summary.total*100),evidencePercent=Math.round(summary.checked/summary.total*100);
    return '<section class="inspection-progress" aria-label="Prüfungsfortschritt"><div><span>Fachlich bewertet</span><b>'+summary.evaluated+'/'+summary.total+'</b><div class="progress"><span style="width:'+percent+'%"></span></div></div><div><span>Nachweise geprüft</span><b>'+summary.checked+'/'+summary.total+'</b><div class="progress"><span style="width:'+evidencePercent+'%;background:#d99000"></span></div></div><div class="release-readiness '+(summary.ready?'ready':'blocked')+'"><span>Freigabefähig</span><b>'+(summary.ready?'✓ Ja':'! Nein')+'</b><small>'+(summary.ready?'Keine Übergabeblocker':summary.blockers.length+' offene Prüfkriterien')+'</small></div></section>';
  }
  function chapterNavMarkup(){
    const chapters=[...new Set(questions.map(item=>item[1]))];
    return '<aside class="card chapters inspection-chapters"><div class="inspection-panel-heading"><div><span class="eyebrow">Navigation</span><h3>Prüfkapitel</h3></div><button type="button" class="inspection-panel-toggle" aria-label="Kapitelübersicht ein- oder ausklappen" onclick="toggleInspectionPanel(\'inspection-chapters\')">☰</button></div><div class="inspection-chapter-list">'+chapters.map(chapter=>{const value=chapterStats(chapter),first=questions.find(item=>item[1]===chapter)?.[0],summary='Bewertet '+value.evaluated+' von '+value.total+', Nachweise '+value.checked+' von '+value.total+', Feststellungen '+value.findings+', Blocker '+value.blockers;return '<button type="button" class="inspection-chapter '+value.status+'" aria-label="'+esc(chapter)+': '+esc(summary)+'" title="'+esc(summary)+'" onclick="jumpToInspectionQuestion(\''+first+'\')"><span><b>'+esc(chapter)+'</b><small>Bew. '+value.evaluated+'/'+value.total+' · Nachw. '+value.checked+'/'+value.total+' · F '+value.findings+' · ! '+value.blockers+'</small></span><em>'+(value.status==='ready'?'✓ Bereit':value.status==='blocked'?'! Abweichung':value.status==='working'?'◐ In Arbeit':'○ Offen')+'</em></button>'}).join('')+'</div></aside>';
  }
  function resultButtons(id){return '<div class="inspection-result-options" role="group" aria-label="Prüfergebnis">'+RESULT_OPTIONS.map(([value,icon,label,tone])=>{const active=state.answers?.[id]===value;return '<button type="button" class="result-'+tone+' '+(active?'active':'')+'" aria-pressed="'+active+'" onclick="setInspectionResultV2(\''+id+'\',\''+value+'\')"><span class="inspection-result-icon" aria-hidden="true">'+icon+'</span><b>'+esc(label)+'</b></button>'}).join('')+'</div>'}
  function questionCardMarkup(question,index){
    const [id,chapter,title]=question,result=state.answers?.[id]||'open',evidence=state.inspectionEvidence[id],meta=state.inspectionQuestionMeta[id],findings=questionFindings(id),documents=questionDocuments(id),blockers=blockersForQuestion(id),needsFinding=['partial','failed'].includes(result)&&!findings.length;
    const detailOpen=Boolean(meta.reason||meta.followUp||meta.migrationReview);
    return '<article id="inspection-question-'+id+'" class="inspection-question-card '+(blockers.length?'has-blockers':'is-complete')+'" tabindex="-1" data-question-id="'+id+'"><header><div class="inspection-question-number">'+String(index+1).padStart(2,'0')+'</div><div><span>'+esc(chapter)+'</span><h3>'+esc(title)+'</h3></div><span class="inspection-card-state">'+(blockers.length?blockers.length+' Blocker':'✓ vollständig')+'</span></header><div class="inspection-card-controls"><div><label>Prüfergebnis</label>'+resultButtons(id)+'</div><label class="inspection-evidence-field">Nachweisstatus<select aria-label="Prüfgrundlage und Nachweisstatus" onchange="setInspectionEvidence(\''+id+'\',this.value)">'+EVIDENCE_OPTIONS.map(([value,label])=>'<option value="'+value+'" '+(evidence===value?'selected':'')+'>'+label+'</option>').join('')+'</select></label></div><div class="inspection-card-footer"><div class="inspection-counts"><span>! '+findings.length+' Feststellung'+(findings.length===1?'':'en')+'</span><span>▣ '+documents.length+' Nachweis'+(documents.length===1?'':'e')+'</span></div><button type="button" class="finding-action '+(needsFinding?'required':'')+'" onclick="openInspectionFinding(\''+id+'\')">'+(needsFinding?'! ':'+')+'Feststellung erfassen</button><details '+(detailOpen?'open':'')+'><summary title="Details und Begründung">Details</summary><div class="inspection-detail-fields"><label>Fachliche Begründung<textarea onchange="updateInspectionMeta(\''+id+'\',\'reason\',this.value)" placeholder="Erforderlich bei nicht anwendbar oder nicht prüfbar">'+esc(meta.reason||'')+'</textarea></label><label>Erforderliche Nachprüfung / Hinweis<textarea onchange="updateInspectionMeta(\''+id+'\',\'followUp\',this.value)" placeholder="Weiteres Vorgehen dokumentieren">'+esc(meta.followUp||'')+'</textarea></label>'+(meta.migrationReview?'<div class="migration-warning" role="alert"><b>Migration fachlich prüfen</b><span>Ursprünglicher Altwert: '+esc(meta.legacyValue)+'. Er wurde nicht automatisch als fachliches Ergebnis interpretiert.</span><button type="button" onclick="resolveInspectionMigration(\''+id+'\')">Als fachlich geprüft markieren</button></div>':'')+(blockers.length?'<ul class="question-blockers">'+blockers.map(item=>'<li>'+esc(item.label)+'</li>').join('')+'</ul>':'')+'</div></details></div></article>';
  }

  function scoreMarkup(summary){
    const score=state.safetyScore||{},calculated=score.state==='calculated',inspection=activeInspection(),released=['Technisch freigegeben','Finalisiert'].includes(inspection?.status),maturity=Math.round(summary.checked/summary.total*100),grade=calculated?score.grade:'—';
    const classLabels={A:'Sehr geringes Risiko',B:'Geringes Risiko',C:'Erhöhtes Risiko',D:'Hohes Risiko',E:'Sehr hohes Risiko'};
    const previous=(state.safetyScoreHistory||[]).slice().reverse().find(item=>['Technisch freigegeben','Finalisiert'].includes(item.stage)&&Number.isFinite(Number(item.riskPoints)));
    const comparison=!calculated?'Vergleich erst nach Berechnung verfügbar':!previous?'Keine freigegebene Vorperiode':score.riskPoints===previous.riskPoints?'Unverändert zur Vorperiode':score.riskPoints<previous.riskPoints?'Um '+(previous.riskPoints-score.riskPoints)+' Punkte verbessert':'Um '+(score.riskPoints-previous.riskPoints)+' Punkte erhöht';
    const factors=(score.factors||[]).map(item=>'<li><span>'+esc(item.label)+'</span><b>+'+item.points+'</b></li>').join('')||'<li><span>Noch keine berechenbare Aufschlüsselung</span></li>';
    return '<aside class="card evaluation inspection-live-panel"><div class="inspection-panel-heading"><div><span class="eyebrow">Live-Bewertung</span><h3>Vorläufiger SafetyScore®</h3></div><button type="button" class="inspection-panel-toggle" aria-label="SafetyScore ein- oder ausklappen" onclick="toggleInspectionPanel(\'inspection-live-panel\')">▤</button></div><div class="inspection-live-content"><section class="inspection-score-card '+(calculated?'calculated':'pending')+'"><div class="score-topline"><span class="score-status">'+(released?'Freigegeben':'Vorläufig')+'</span><span>Datenreife '+maturity+' %</span></div><div class="score-number"><strong>'+(calculated?score.riskPoints:'—')+'</strong><span>von '+(score.maxPoints||700)+' Risikopunkten</span></div><div class="score-class"><b>Klasse '+grade+'</b><span>'+(calculated?classLabels[grade]:'Noch nicht berechenbar')+'</span></div><div class="score-maturity"><span style="width:'+maturity+'%"></span></div><details class="inspection-score-details"><summary>Bewertungsdetails</summary><dl><div><dt>Nachweisreife</dt><dd>'+summary.checked+'/'+summary.total+' geprüft</dd></div><div><dt>Vorperiode</dt><dd>'+esc(comparison)+'</dd></div><div><dt>Regelwerk</dt><dd>'+esc(score.ruleVersion||'INGTEC-SAFETY-2026.1')+'</dd></div><div><dt>Berechnungsstand</dt><dd>'+dateTime(score.calculatedAt)+'</dd></div></dl><p class="score-separation-note"><b>Hinweis:</b> Score bleibt vorläufig, solange Nachweise oder QS offen sind.</p><details class="score-breakdown"><summary>Score-Beiträge anzeigen</summary><ul>'+factors+'</ul></details></details></section><section class="inspection-live-metrics"><div><span>Bewertete Prüfpunkte</span><b>'+summary.evaluated+'/'+summary.total+'</b></div><div><span>Offene Maßnahmen</span><b>'+((state.measures||[]).filter(item=>item.inspectionId===inspection?.id&&item.status!=='Geschlossen').length)+'</b></div><div><span>Ungeprüfte Quellen</span><b>'+questions.filter(([id])=>state.inspectionEvidence[id]!=='checked').length+'</b></div><div><span>Übergabeblocker</span><b>'+summary.blockers.length+'</b></div></section></div></aside>';
  }

  function contextMarkup(inspection,project){
    const account=activeActorName(),profile=inspection?.profileSnapshot||{},last=inspection?.updatedAt||state.auditEvents?.[0]?.at||now(),queue=(state.syncQueue||[]).length,sync=queue?'Synchronisation ausständig':'Lokal gespeichert';
    return '<section class="inspection-context" aria-label="Prüfungskontext"><div><span>Prüfungsnummer</span><b>'+esc(inspection?.id||'–')+'</b></div><div><span>Objekt</span><b>'+esc(project?.name||'–')+'</b></div><div><span aria-label="Speicherstand">Stand</span><b>'+esc(sync)+'</b><small>'+dateTime(last)+'</small></div><details class="inspection-context-details"><summary>Weitere Prüfdaten</summary><div><section><span>Profil</span><b>'+esc(profile.code||inspection?.profileCode||'BMA')+' v'+esc(profile.version||inspection?.profileVersion||'1.0')+'</b></section><section><span>Start</span><b>'+dateTime(inspection?.startedAt)+'</b></section><section><span>Prüfer</span><b>'+esc(account)+'</b></section></div></details></section>';
  }

  function inspectionMarkup(){
    ensureModel();const inspection=activeInspection(),project=activeProject(),summary=stats(),visible=questions.filter(([id])=>questionMatches(id));
    return '<section class="page inspection-workspace-v2" id="inspection" data-logic-tests="'+(window.__INGTEC_INSPECTION_TESTS__?.passed?'passed':'not-run')+'"><div class="section-head inspection-head"><div><span class="eyebrow">'+esc(inspection?.id||'BMA-Prüfung')+' · '+esc(project?.client||'Auftraggeber')+'</span><h2>Wiederkehrende BMA-Prüfung</h2><p class="sr-only">Technische Bewertung mit getrenntem Prüfergebnis und Nachweisstatus</p></div><div class="toolbar"><button type="button" onclick="prepareOfflinePackage()">⇩ Offline-Paket erstellen</button><button type="button" onclick="document.getElementById(\'inspectionPlanStage\')?.scrollIntoView({behavior:\'smooth\',block:\'center\'})">⌖ Plan öffnen</button><button class="primary" type="button" onclick="completeInspection()">✓ An QS übergeben</button></div></div>'+contextMarkup(inspection,project)+progressMarkup(summary)+filterMarkup()+'<div class="inspection-layout">'+chapterNavMarkup()+'<main class="inspection-question-list" aria-label="Prüfpunkte">'+(visible.length?visible.map((item,index)=>questionCardMarkup(item,questions.indexOf(item))).join(''):'<div class="card inspection-empty">Keine Prüfpunkte entsprechen diesem Filter.</div>')+'</main>'+scoreMarkup(summary)+'</div>'+window.inspectionPlanMarkup()+'</section>';
  }

  function openQsModal(){
    if(!window.requirePermission?.('inspection','die QS-Übergabe'))return;
    const check=window.inspectionQualityCheck();document.getElementById('inspectionQsModal')?.remove();const modal=document.createElement('div');modal.id='inspectionQsModal';modal.className='modal-backdrop';
    const groups=check.blockers.reduce((map,item)=>{(map[item.id]||(map[item.id]=[])).push(item);return map},{});
    modal.innerHTML='<div class="modal-card inspection-qs-modal" role="dialog" aria-modal="true" aria-labelledby="inspectionQsTitle"><div class="modal-head"><div><span class="eyebrow">Automatische Qualitätsprüfung</span><h2 id="inspectionQsTitle">'+(check.ready?'Bereit zur QS-Übergabe':'QS-Übergabe gesperrt')+'</h2><p>'+(check.ready?'Alle konfigurierten Übergabekriterien sind erfüllt.':check.blockers.length+' Übergabeblocker müssen geprüft werden.')+'</p></div><button class="modal-close" aria-label="Dialog schließen" onclick="closeInspectionQsModal()">×</button></div>'+(check.ready?'<div class="qs-ready">✓ Prüfergebnisse, Nachweise, Feststellungen und Maßnahmen wurden geprüft.</div>':'<div class="qs-blocker-list">'+Object.entries(groups).map(([id,items])=>'<section><div><b>'+esc(questionById(id)?.[2]||id)+'</b><small>'+esc(questionById(id)?.[1]||'Prüfpunkt')+'</small></div><ul>'+items.map(item=>'<li>'+esc(item.label)+'</li>').join('')+'</ul><button type="button" onclick="jumpToInspectionQuestion(\''+id+'\')">Zum Prüfpunkt</button></section>').join('')+'</div>')+(check.ready?'<div class="modal-actions"><button class="secondary" onclick="closeInspectionQsModal()">Abbrechen</button><button class="primary" onclick="confirmInspectionQs()">Verbindlich an QS übergeben</button></div>':(RULES.allowQsException?'<details class="qs-exception"><summary>Fachlich begründete Ausnahme dokumentieren</summary><label>Begründung<textarea id="qsExceptionReason" minlength="20" placeholder="Warum ist die Übergabe trotz der offenen Punkte fachlich vertretbar?"></textarea></label><button type="button" class="danger" onclick="confirmInspectionQsException()">Ausnahme protokollieren und übergeben</button></details>':''))+'</div>';
    modal.addEventListener('click',event=>{if(event.target===modal)window.closeInspectionQsModal()});document.body.appendChild(modal);document.body.style.overflow='hidden';setTimeout(()=>modal.querySelector('.modal-close')?.focus(),50);
  }
  window.closeInspectionQsModal=function(){document.getElementById('inspectionQsModal')?.remove();if(!document.querySelector('.modal-backdrop'))document.body.style.overflow=''};
  function performQs(exceptionReason=''){
    if(!window.requirePermission?.('inspection','die QS-Übergabe'))return;
    const inspection=activeInspection(),check=window.inspectionQualityCheck();if(!inspection)return;
    inspection.status='In QS';inspection.qsTransferredAt=now();inspection.qsTransferredBy=activeActorName();inspection.completedAt=inspection.qsTransferredAt;
    if(exceptionReason){const entry={id:'QSX-'+Date.now(),inspectionId:inspection.id,at:now(),actor:activeActorName(),reason:exceptionReason,openPoints:check.blockers.map(item=>({questionId:item.id,kind:item.kind,label:item.label}))};state.qsExceptions.unshift(entry);window.recordAudit?.('QS-Übergabe mit fachlicher Ausnahme',{entityType:'Prüfung',entityId:inspection.id,summary:'Begründung: '+exceptionReason+' · '+check.blockers.length+' offene Punkte protokolliert.'})}
    else window.recordAudit?.('Prüfung an QS übergeben',{entityType:'Prüfung',entityId:inspection.id,summary:'Automatische Qualitätsprüfung ohne Blocker abgeschlossen; Status „An QS übergeben“.'});
    save?.();window.closeInspectionQsModal();window.renderAll?.();setActivePage?.('inspection');window.showToast?.('Prüfung wurde an die Qualitätssicherung übergeben.');
  }
  window.confirmInspectionQs=function(){const check=window.inspectionQualityCheck();if(!check.ready){openQsModal();return}performQs('')};
  window.confirmInspectionQsException=function(){const value=document.getElementById('qsExceptionReason')?.value.trim()||'';if(value.length<20){window.showToast?.('Bitte eine fachlich nachvollziehbare Begründung mit mindestens 20 Zeichen angeben.',null,null,'error');return}performQs(value)};
  window.completeInspection=openQsModal;

  window.inspection=inspectionMarkup;
  window.runInspectionWorkspaceTests=function(){
    ensureModel();const originalAnswers={...state.answers},originalEvidence={...state.inspectionEvidence},originalMeta=JSON.parse(JSON.stringify(state.inspectionQuestionMeta));
    const results=[];
    try{
      const first=questions[0][0];state.answers[first]='partial';state.inspectionEvidence[first]='checked';state.inspectionQuestionMeta[first].reason='';
      results.push({name:'Teilweise erfüllt erfordert eine Feststellung',passed:blockersForQuestion(first).some(item=>item.kind==='finding')});
      state.answers[first]='not_applicable';results.push({name:'Nicht anwendbar erfordert Begründung',passed:blockersForQuestion(first).some(item=>item.kind==='reason')});
      state.answers[first]='fulfilled';state.inspectionEvidence[first]='pending';results.push({name:'Nachweis ausständig bleibt eigener Blocker',passed:blockersForQuestion(first).some(item=>item.kind==='evidence')});
      state.inspectionEvidence[first]='checked';state.inspectionQuestionMeta[first].migrationReview=true;results.push({name:'Unklare Altwerte sperren die QS-Übergabe bis zur Fachprüfung',passed:blockersForQuestion(first).some(item=>item.kind==='migration')});
      state.inspectionQuestionMeta[first].migrationReview=false;state.answers[first]='open';results.push({name:'Automatische QS-Prüfung liefert direkte Prüfpunkt-Blocker',passed:window.inspectionQualityCheck().blockers.some(item=>item.id===first&&item.kind==='result')});
      results.push({name:'SafetyScore-Regel kennt Nicht anwendbar',passed:Object.prototype.hasOwnProperty.call(window.INGTEC_SAFETY_SCORE_RULESETS?.['INGTEC-SAFETY-2026.1']?.answerPoints||{},'not_applicable')});
      results.push({name:'Prüfergebnis und Nachweisstatus sind getrennt gespeichert',passed:state.answers!==state.inspectionEvidence});
      results.push({name:'Ergebniswahl setzt Nachweis automatisch auf geprüft',passed:evidenceAfterResultSelection('fulfilled','pending')==='checked'&&evidenceAfterResultSelection('not_testable','missing')==='checked'});
      const resultMarkup=resultButtons(first),filterControls=filterMarkup();
      results.push({name:'Prüfergebnis hat sichtbare Symbolmarkierungen',passed:resultMarkup.includes('inspection-result-icon')});
      results.push({name:'Nächster offener Punkt ist sichtbar beschriftet',passed:filterControls.includes('next-open-label')&&filterControls.includes('Nächster offener Punkt')});
      const responsiveContract=typeof window.toggleInspectionPanel==='function'&&Boolean(document.querySelector('link[href*="inspection-workspace.css"]'));
      results.push({name:'Mobile Einklappsteuerung ist vorhanden',passed:responsiveContract});
    }finally{state.answers=originalAnswers;state.inspectionEvidence=originalEvidence;state.inspectionQuestionMeta=originalMeta}
    return {passed:results.every(item=>item.passed),tests:results};
  };

  ensureModel();
  const inspectionSelfTest=window.runInspectionWorkspaceTests();
  window.__INGTEC_INSPECTION_TESTS__=inspectionSelfTest;
  document.documentElement.dataset.inspectionTests=inspectionSelfTest.passed?'passed':'failed';
  window.renderAll?.();
  if(location.hash==='#inspection')setTimeout(()=>setActivePage?.('inspection'),0);
  if(location.hash==='#inspection-qs'||new URL(location.href).searchParams.get('inspection-qs')==='1'){
    const showQsDiagnostic=()=>{window.renderAll?.();setActivePage?.('inspection');openQsModal()};
    setTimeout(showQsDiagnostic,450);
    window.addEventListener('load',()=>setTimeout(showQsDiagnostic,450),{once:true});
  }
  if(new URL(location.href).searchParams.get('inspection-test')==='1'||location.hash==='#inspection-test'){
    const output=document.createElement('pre');output.id='inspectionTestResults';output.hidden=true;output.textContent=JSON.stringify(window.runInspectionWorkspaceTests());document.body.appendChild(output);
  }
})();
