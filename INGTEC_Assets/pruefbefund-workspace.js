/* INGTEC PrüfBefund OnePage
   MVP-Prototyp: versionierte Rechts-/Regelwerksengine, Legal Applicability Engine,
   Prüfworkflow (Anlage -> Prüfart -> Grundlagen -> Checkliste -> Mängel -> Ergebnis -> Freigabe)
   und einseitiger A4-Prüfbefund gemäß AM-VO §§ 6-11. Alle Daten sind lokale Demodaten. */
(()=>{
  'use strict';
  if(typeof state==='undefined')return;

  const VERSION='1.0.0';
  const esc=value=>(typeof escapeHtml==='function'?escapeHtml(String(value??'')):String(value??''));
  const text=value=>String(value??'').trim();
  const arr=value=>Array.isArray(value)?value:[];
  const now=()=>new Date().toISOString();
  const viennaToday=()=>{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Vienna',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const get=type=>parts.find(part=>part.type===type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  const actor=()=>{
    const account=typeof activeUserAccount==='function'?activeUserAccount():null;
    return {id:account?.id||'LOCAL-DEMO',name:account?.name||state.user?.name||'Lokale Demo',email:account?.email||state.user?.email||''};
  };
  const dateLabel=value=>{
    const match=text(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match?`${match[3]}.${match[2]}.${match[1]}`:'–';
  };
  const addMonths=(dateStr,months)=>{
    const d=new Date(dateStr+'T00:00:00');
    d.setMonth(d.getMonth()+months);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const endOfYear=(dateStr,yearsAhead)=>{
    const d=new Date(dateStr+'T00:00:00');
    return `${d.getFullYear()+yearsAhead}-12-31`;
  };
  const minDate=(a,b)=>!a?b:!b?a:a<=b?a:b;
  const hashString=value=>{
    let h=5381;
    const s=String(value);
    for(let i=0;i<s.length;i++)h=((h*33)^s.charCodeAt(i))>>>0;
    return 'PB-'+h.toString(16).toUpperCase().padStart(8,'0');
  };

  /* ---------- Stammdaten: Anlagenfamilien, technische Schemata, Checklisten ---------- */
  const FAMILY_LABEL={
    TOR_TUER:'Türen & Tore',FAHRZEUGHEBEBUEHNE:'Fahrzeughebebühne',KRAN:'Kran',
    BRANDSCHUTZTUER:'Brandschutztür / -tor',STAPLER:'Flurförderzeug'
  };
  const ATTRIBUTE_SCHEMA={
    TOR_TUER:[['breite','Breite','m'],['hoehe','Höhe','m'],['torblattflaeche','Torblattfläche','m²'],['torblattmasse','Torblattmasse','kg'],['antrieb','Antriebsart'],['herstellerAntrieb','Hersteller Antrieb'],['steuerungsart','Steuerungsart'],['sicherheitseinrichtungen','Sicherheitseinrichtungen'],['notbetaetigung','Notbetätigung'],['nutzerklassifizierung','Nutzerklassifizierung (EN 12453)']],
    FAHRZEUGHEBEBUEHNE:[['tragfaehigkeit','Tragfähigkeit','kg'],['hubhoehe','Hubhöhe','mm'],['bauart','Bauart'],['antrieb','Antrieb'],['gleichlaufsicherung','Gleichlaufsicherung'],['verriegelung','Verriegelung'],['notabsenkung','Notabsenkung'],['ueberlastsicherung','Überlastsicherung'],['pruefast','Prüflast','kg']],
    KRAN:[['tragfaehigkeit','Tragfähigkeit','kg'],['ausladung','Ausladung','m'],['lastmoment','Lastmoment','tm'],['hubwerk','Hubwerk'],['tragmittel','Tragmittel'],['lastaufnahmemittel','Lastaufnahmemittel'],['endbegrenzung','Endbegrenzungen'],['pruefast','Prüflast','kg']],
    BRANDSCHUTZTUER:[['breite','Breite','m'],['hoehe','Höhe','m'],['antrieb','Antriebsart'],['feuerwiderstandsklasse','Feuerwiderstandsklasse'],['feststellanlage','Feststellanlage'],['schliessmechanismus','Selbstschließmechanismus']],
    STAPLER:[['tragfaehigkeit','Tragfähigkeit','kg'],['lastschwerpunkt','Lastschwerpunkt','mm'],['hubhoehe','Hubhöhe','mm'],['masttyp','Masttyp'],['energieart','Energieart'],['fahrerplatz','Fahrerplatz'],['lastaufnahmemittel','Lastaufnahmemittel']]
  };
  const FAMILY_TECH_ITEMS={
    TOR_TUER:[['t-tor-1','Sicherheitseinrichtungen (Lichtschranke/Kontaktleiste) wirksam'],['t-tor-2','Notbetätigung funktionsfähig']],
    FAHRZEUGHEBEBUEHNE:[['t-fhb-1','Gleichlaufsicherung funktionsfähig'],['t-fhb-2','Überlastsicherung/Endschalter wirksam'],['t-fhb-3','Prüflast durchgeführt']],
    KRAN:[['t-kran-1','Endbegrenzungen funktionsfähig'],['t-kran-2','Trag- und Lastaufnahmemittel ohne erkennbare Schäden']],
    BRANDSCHUTZTUER:[['t-bst-1','Selbstschließmechanismus wirksam'],['t-bst-2','Feststellanlage löst bestimmungsgemäß aus (soweit vorhanden)']],
    STAPLER:[['t-sta-1','Lastaufnahmemittel ohne erkennbare Schäden'],['t-sta-2','Bremsen und Lenkung funktionsfähig']]
  };
  const CHECKLIST_AMVO7=[
    ['c7-1','Ordnungsgemäßer Zustand, Montage und Stabilität'],
    ['c7-2','Steuer- und Kontrolleinrichtungen'],
    ['c7-3','Funktionsprüfung mit und ohne Belastung (soweit erforderlich)'],
    ['c7-4','Sicherheitsfunktionen bei vorhersehbaren Störungen und Fehlbedienungen'],
    ['c7-5','Sichere Zu- und Abfuhr von Stoffen und Energien'],
    ['c7-6','Maßnahmen für verbleibende Restrisiken'],
    ['c7-7','Eignung des Hebearbeitsmittels bei Arbeitskörben (soweit zutreffend)']
  ];
  const CHECKLIST_AMVO8=[
    ['c8-1','Verschleißbehaftete Komponenten'],
    ['c8-2','Einstellung sicherheitsrelevanter Bauteile und Sicherheitseinrichtungen'],
    ['c8-3','Funktionsprüfung sicherheitsrelevanter Bauteile und Einrichtungen'],
    ['c8-4','Eignung des Hebearbeitsmittels bei Arbeitskörben (soweit zutreffend)']
  ];
  const CHECKLIST_RESULT_OPTIONS=[['OK','OK','ok'],['MANGEL','Mangel','danger'],['N_A','N.A.','muted'],['NICHT_PRUEFBAR','Nicht prüfbar','muted']];

  /* ---------- Versionierte Rechts-/Regelwerksengine ---------- */
  const LEGAL_RULES=[
    {rule_id:'AMVO-7',title:'Arbeitsmittelverordnung',reference:'§ 7 AM-VO',valid_from:'2000-05-01',valid_to:null,source:'BGBl. II Nr. 164/2000 idgF',rule_type:'Verordnung',binding_reason:'gesetzlich',reviewed_by:'INGTEC Fachbereich Recht',reviewed_at:'2026-01-10',version:'1.0'},
    {rule_id:'AMVO-8',title:'Arbeitsmittelverordnung',reference:'§ 8 AM-VO',valid_from:'2000-05-01',valid_to:'2025-12-31',source:'BGBl. II Nr. 164/2000 (Fassung bis 2025)',rule_type:'Verordnung',binding_reason:'gesetzlich',reviewed_by:'INGTEC Fachbereich Recht',reviewed_at:'2024-11-02',version:'1.0'},
    {rule_id:'AMVO-8',title:'Arbeitsmittelverordnung',reference:'§ 8 AM-VO',valid_from:'2026-01-01',valid_to:null,source:'BGBl. II Nr. 164/2000 idgF',rule_type:'Verordnung',binding_reason:'gesetzlich',reviewed_by:'INGTEC Fachbereich Recht',reviewed_at:'2026-01-10',version:'2.0'},
    {rule_id:'AMVO-6',title:'Arbeitsmittelverordnung',reference:'§ 6 AM-VO',valid_from:'2000-05-01',valid_to:null,source:'BGBl. II Nr. 164/2000 idgF',rule_type:'Verordnung',binding_reason:'gesetzlich',reviewed_by:'INGTEC Fachbereich Recht',reviewed_at:'2026-01-10',version:'1.0'},
    {rule_id:'TRVB-151S',title:'TRVB 151 S – Rauch- und Brandschutzabschlüsse',reference:'TRVB 151 S',valid_from:'2019-01-01',valid_to:null,source:'Österreichischer Brandschutzverband',rule_type:'TRVB',binding_reason:'Stand der Technik',reviewed_by:'INGTEC Fachbereich Brandschutz',reviewed_at:'2025-06-01',version:'2019'}
  ];
  function resolveLegalRule(ruleId,dateStr){
    const date=text(dateStr)||viennaToday();
    const candidates=LEGAL_RULES.filter(rule=>rule.rule_id===ruleId&&rule.valid_from<=date&&(!rule.valid_to||date<=rule.valid_to));
    return candidates.sort((a,b)=>b.valid_from.localeCompare(a.valid_from))[0]||null;
  }
  function legalGroundsFor(report){
    const ids=report.inspectionType==='ABNAHME_AMVO_7'?['AMVO-7','AMVO-6']:['AMVO-8','AMVO-6'];
    return ids.map(id=>resolveLegalRule(id,report.date)).filter(Boolean);
  }

  /* ---------- Legal Applicability Engine (Anlagenart != Prüfpflicht) ---------- */
  function poweredProfile(asset,label){
    const powered=asset.attrs?.antrieb&&text(asset.attrs.antrieb).toLowerCase()!=='manuell';
    return powered
      ?{amvo7:'YES',amvo8:'YES',reason:`${label} unterliegt § 7 und § 8 AM-VO.`}
      :{amvo7:'NO',amvo8:'NO',reason:'Nicht kraftbetrieben – aus der Bauart allein ergibt sich keine AM-VO-Prüfpflicht nach § 7/§ 8.'};
  }
  function legalProfile(asset){
    switch(asset.family){
      case 'TOR_TUER':return poweredProfile(asset,'Das kraftbetriebene Tor/die kraftbetriebene Tür');
      case 'FAHRZEUGHEBEBUEHNE':return {amvo7:'YES',amvo8:'YES',reason:'Fahrzeughebebühnen sind in § 7 und § 8 AM-VO ausdrücklich erfasst.'};
      case 'KRAN':return {amvo7:'REVIEW',amvo8:'YES',reason:'Bei Kranen bestehen hinsichtlich einzelner Kranarten Differenzierungen (§ 7 AM-VO) – die Abnahmepflicht ist je Kranart gesondert zu prüfen.'};
      case 'BRANDSCHUTZTUER':return poweredProfile(asset,'Der kraftbetriebene Brandschutzabschluss');
      case 'STAPLER':return {amvo7:'NO',amvo8:'YES',reason:'Ein gewöhnlicher selbstfahrender Stapler begründet allein keine Abnahmeprüfpflicht nach § 7 AM-VO.'};
      default:return {amvo7:'REVIEW',amvo8:'REVIEW',reason:'Für diese Anlagenfamilie ist kein Standard-Rechtsprofil hinterlegt.'};
    }
  }
  function plausibility(asset,inspectionType){
    const profile=legalProfile(asset);
    return inspectionType==='ABNAHME_AMVO_7'?profile.amvo7:profile.amvo8;
  }

  /* ---------- Fuhrpark (Demodaten) ---------- */
  function seedFleet(){
    return [
      {id:'TOR-01',family:'TOR_TUER',bauart:'Sektionaltor',name:'Sektionaltor Halle 1',customer:'Musterkunde GmbH',site:'Werk Villach',location:'Halle 1, Tor Ost',inventoryNumber:'INV-TT-0142',manufacturer:'Hörmann',model:'SPU 67',serialNumber:'HM-22314',yearBuilt:2019,commissioning:'2019-04-02',attrs:{breite:'4.0',hoehe:'4.5',torblattflaeche:'18',torblattmasse:'420',antrieb:'elektromechanisch',herstellerAntrieb:'Hörmann',steuerungsart:'Totmann + Lichtschranke',sicherheitseinrichtungen:'Lichtschranke, Kontaktleiste',notbetaetigung:'Kettennotentriegelung',nutzerklassifizierung:'geschult, nicht öffentlich'}},
      {id:'TOR-02',family:'TOR_TUER',bauart:'Drehtor',name:'Drehtor Innenhof',customer:'Musterkunde GmbH',site:'Werk Villach',location:'Innenhof',inventoryNumber:'INV-TT-0098',manufacturer:'Mabu',model:'Standard',serialNumber:'MB-1187',yearBuilt:2011,commissioning:'2011-06-01',attrs:{breite:'3.2',hoehe:'2.0',antrieb:'manuell',sicherheitseinrichtungen:'–'}},
      {id:'FHB-01',family:'FAHRZEUGHEBEBUEHNE',bauart:'Vier-Säulen-Hebebühne',name:'Vier-Säulen-Hebebühne Werkstatt',customer:'Musterkunde GmbH',site:'Werk Villach',location:'Werkstatt, Bühne 2',inventoryNumber:'INV-FHB-0021',manufacturer:'Nussbaum',model:'SL 4.30',serialNumber:'NB-55210',yearBuilt:2020,commissioning:'2020-02-15',attrs:{tragfaehigkeit:'4000',hubhoehe:'1900',bauart:'Vier-Säulen',antrieb:'elektrohydraulisch',gleichlaufsicherung:'mechanisch',verriegelung:'automatisch, alle 20 cm',notabsenkung:'vorhanden',ueberlastsicherung:'vorhanden',pruefast:'4000'}},
      {id:'KRAN-01',family:'KRAN',bauart:'Brückenkran',name:'Brückenkran Halle 2',customer:'Musterkunde GmbH',site:'Werk Villach',location:'Halle 2',inventoryNumber:'INV-KR-0007',manufacturer:'Demag',model:'DR-Pro',serialNumber:'DM-77120',yearBuilt:2015,commissioning:'2015-09-10',attrs:{tragfaehigkeit:'5000',ausladung:'18',lastmoment:'90',hubwerk:'Seilzug, elektrisch',tragmittel:'Drahtseil',lastaufnahmemittel:'Lasthaken mit Sicherheitsfalle',endbegrenzung:'Endschalter Hub/Fahrt',pruefast:'6250'}},
      {id:'BST-01',family:'BRANDSCHUTZTUER',bauart:'Brandschutztor T30',name:'Brandschutztor Lager (angetrieben)',customer:'Musterkunde GmbH',site:'Werk Villach',location:'Lager, Durchfahrt',inventoryNumber:'INV-BST-0033',manufacturer:'Hörmann',model:'T30-1 Automatik',serialNumber:'HM-90341',yearBuilt:2021,commissioning:'2021-03-20',attrs:{breite:'3.0',hoehe:'3.2',antrieb:'elektrisch',feuerwiderstandsklasse:'T30',feststellanlage:'Rauchmelder-gesteuert',schliessmechanismus:'automatisch bei Rauchauslösung'}},
      {id:'BST-02',family:'BRANDSCHUTZTUER',bauart:'Brandschutztür T30',name:'Brandschutztür Treppenhaus',customer:'Musterkunde GmbH',site:'Werk Villach',location:'Treppenhaus 2. OG',inventoryNumber:'INV-BST-0018',manufacturer:'Hörmann',model:'T30-1',serialNumber:'HM-44120',yearBuilt:2016,commissioning:'2016-05-11',attrs:{breite:'1.1',hoehe:'2.1',antrieb:'manuell',feuerwiderstandsklasse:'T30',feststellanlage:'–',schliessmechanismus:'Türschließer (mechanisch)'}},
      {id:'STA-01',family:'STAPLER',bauart:'Gabelstapler',name:'Gabelstapler Lager',customer:'Musterkunde GmbH',site:'Werk Villach',location:'Lager',inventoryNumber:'INV-ST-0056',manufacturer:'Linde',model:'H25',serialNumber:'LD-33210',yearBuilt:2018,commissioning:'2018-08-01',attrs:{tragfaehigkeit:'2500',lastschwerpunkt:'500',hubhoehe:'4500',masttyp:'Triplex',energieart:'Diesel',fahrerplatz:'sitzend',lastaufnahmemittel:'Standardgabel'}}
    ];
  }
  const assets=()=>arr(state.pbFleet);
  const assetById=id=>assets().find(a=>a.id===text(id))||null;

  /* ---------- Prüfbefunde: Modell, Gates, Textengine ---------- */
  const STATUS_META={
    DRAFT:{label:'Entwurf',tone:'draft'},COMPLETED:{label:'Prüfung abgeschlossen',tone:'progress'},
    RELEASED:{label:'Technisch freigegeben',tone:'progress'},SIGNED:{label:'Signiert',tone:'progress'},
    FINAL:{label:'Final',tone:'final'},SUPERSEDED:{label:'Ersetzt',tone:'muted'}
  };
  const STATUS_ORDER=['DRAFT','COMPLETED','RELEASED','SIGNED','FINAL'];
  const STATUS_ACTION={COMPLETED:'Prüfung abschließen',RELEASED:'Technisch freigeben',SIGNED:'Signieren',FINAL:'Finalisieren'};
  const RESULT_META={
    NO_DEFECTS:{label:'Keine Mängel',badge:'KEINE MÄNGEL',tone:'ok'},
    DEFECTS_USE_ALLOWED_6_3:{label:'Mängel – Weiterbenützung gemäß § 6 Abs. 3',badge:'MÄNGEL FESTGESTELLT – WEITERBENÜTZUNG ZULÄSSIG UNTER BEDINGUNGEN',tone:'warn'},
    DEFECTS_USE_PROHIBITED:{label:'Mängel – keine Weiterbenützung',badge:'MÄNGEL FESTGESTELLT – WEITERBENÜTZUNG NICHT ZULÄSSIG',tone:'danger'},
    NOT_ASSESSABLE:{label:'Nicht beurteilbar',badge:'NICHT BEURTEILBAR',tone:'muted'}
  };

  function checklistItemsFor(report){
    const legal=(report.inspectionType==='ABNAHME_AMVO_7'?CHECKLIST_AMVO7:CHECKLIST_AMVO8).map(([id,label])=>[id,label,report.inspectionType==='ABNAHME_AMVO_7'?'legal7':'legal8']);
    const asset=assetById(report.assetId);
    const tech=(asset?FAMILY_TECH_ITEMS[asset.family]:[])||[];
    return [...legal,...tech.map(([id,label])=>[id,label,'technical'])];
  }
  function ensureReportShape(report){
    report.checklist=report.checklist&&typeof report.checklist==='object'?report.checklist:{};
    checklistItemsFor(report).forEach(([id])=>{if(!report.checklist[id])report.checklist[id]={result:'',remark:''};});
    report.findings=arr(report.findings);
    report.findingSeq=report.findingSeq||report.findings.length;
    report.continuedUse=report.continuedUse&&typeof report.continuedUse==='object'?report.continuedUse:{reason:'',conditions:'',deadline:'',affectedFindingIds:[],employeeInfoConfirmed:null};
    report.continuedUse.affectedFindingIds=arr(report.continuedUse.affectedFindingIds);
    report.additionalGrounds=arr(report.additionalGrounds);
    report.signOff=report.signOff&&typeof report.signOff==='object'?report.signOff:{signed:false,name:'',qualification:'',signedAt:''};
    report.applicabilityOverride=report.applicabilityOverride&&typeof report.applicabilityOverride==='object'?report.applicabilityOverride:{used:false,reason:''};
    report.inspector=report.inspector&&typeof report.inspector==='object'?report.inspector:{name:'',qualification:'',company:'INGTEC GmbH',address:''};
    return report;
  }
  function resultAvailability(report){
    const hasFindings=report.findings.length>0;
    const isAcceptance=report.inspectionType==='ABNAHME_AMVO_7';
    return {
      NO_DEFECTS:{enabled:!hasFindings,reason:hasFindings?'Es sind Mängel erfasst – „Keine Mängel“ ist nicht wählbar.':''},
      DEFECTS_USE_PROHIBITED:{enabled:hasFindings,reason:hasFindings?'':'Ohne erfasste Mängel nicht erforderlich.'},
      DEFECTS_USE_ALLOWED_6_3:{enabled:hasFindings&&!isAcceptance,reason:isAcceptance?'Bei einer Abnahmeprüfung gemäß § 7 AM-VO ist § 6 Abs. 3 AM-VO nicht wählbar.':!hasFindings?'Nur wählbar, wenn Mängel erfasst wurden.':''},
      NOT_ASSESSABLE:{enabled:true,reason:''}
    };
  }
  function computeDueDates(lastDate){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(text(lastDate)))return {planned:'',legalMax:''};
    const planned=addMonths(lastDate,12);
    const legalMax=minDate(addMonths(lastDate,15),endOfYear(lastDate,1));
    return {planned,legalMax};
  }
  function contentBlockers(report){
    const blockers=[];
    if(!text(report.inspector?.name))blockers.push({kind:'inspector',label:'Prüfer fehlt (§ 11 AM-VO)'});
    if(!/^\d{4}-\d{2}-\d{2}$/.test(text(report.date)))blockers.push({kind:'date',label:'Prüfdatum fehlt'});
    const openItems=checklistItemsFor(report).filter(([id])=>!report.checklist[id]?.result);
    if(openItems.length)blockers.push({kind:'checklist',label:`${openItems.length} Prüfinhalt(e) ohne Ergebnis`});
    if(!report.result)blockers.push({kind:'result',label:report.findings.length?'Mängel erfasst, aber kein Benützungsentscheid getroffen':'Ergebnisentscheidung fehlt'});
    if(report.result==='NO_DEFECTS'&&report.findings.length)blockers.push({kind:'conflict',label:'Widerspruch: „Keine Mängel“, aber Mängel erfasst'});
    if(report.result==='DEFECTS_USE_ALLOWED_6_3'){
      if(report.inspectionType==='ABNAHME_AMVO_7')blockers.push({kind:'conflict',label:'§ 6 Abs. 3 AM-VO ist bei einer Abnahmeprüfung unzulässig'});
      if(!report.findings.length)blockers.push({kind:'conflict',label:'§ 6 Abs. 3 AM-VO ohne erfasste Mängel unzulässig'});
      if(!text(report.continuedUse.conditions))blockers.push({kind:'conditions',label:'Bedingungen der Weiterbenützung fehlen'});
      if(!text(report.continuedUse.deadline))blockers.push({kind:'deadline',label:'Spätester Behebungstermin fehlt'});
      if(!report.continuedUse.affectedFindingIds.length)blockers.push({kind:'affected',label:'Betroffene Mängel nicht zugeordnet'});
    }
    if(report.result==='NOT_ASSESSABLE'&&!text(report.notAssessableReason))blockers.push({kind:'reason',label:'Begründung für „nicht beurteilbar“ fehlt'});
    return blockers;
  }
  function contentWarnings(report){
    const warnings=[];
    report.additionalGrounds.forEach(ground=>{
      if(!text(ground.edition))warnings.push({kind:'norm-version',label:`${ground.title||'Zusätzliche Grundlage'}: keine Ausgabe/Version angegeben`});
      if(!text(ground.reason))warnings.push({kind:'norm-scope',label:`${ground.title||'Zusätzliche Grundlage'}: keine Zuordnung zur Anlagenart – Fachfreigabe erforderlich`});
    });
    return warnings;
  }
  function employeeInfoMissing(report){return report.result==='DEFECTS_USE_ALLOWED_6_3'&&!report.continuedUse.employeeInfoConfirmed;}
  function blockersForTransition(report,target){
    const blockers=contentBlockers(report);
    if(target==='FINAL'&&employeeInfoMissing(report))blockers.push({kind:'employee-info',label:'Information der Arbeitnehmer:innen gemäß § 6 Abs. 3 Z 2 AM-VO noch nicht bestätigt.'});
    return blockers;
  }
  function reportGate(report){
    const blockers=contentBlockers(report);
    const warnings=contentWarnings(report);
    const needsEmployeeInfo=employeeInfoMissing(report);
    if(needsEmployeeInfo)warnings.push({kind:'employee-info',label:'Information der Arbeitnehmer:innen gemäß § 6 Abs. 3 Z 2 AM-VO noch nicht bestätigt – Befund kann nicht final freigegeben werden.'});
    return {blockers,warnings,finalGreen:blockers.length===0&&!needsEmployeeInfo};
  }

  /* ---------- Verbindliche Textengine (1:1 aus PRD Abschnitt 9) ---------- */
  function reportHeaderTitle(report){return report.inspectionType==='ABNAHME_AMVO_7'?'Abnahmeprüfung gemäß § 7 AM-VO':'Wiederkehrende Prüfung gemäß § 8 AM-VO';}
  function reportMainText(report){
    const isAcceptance=report.inspectionType==='ABNAHME_AMVO_7';
    const dateStr=dateLabel(report.date);
    if(!report.result)return 'Ergebnisentscheidung noch ausständig.';
    if(report.result==='NO_DEFECTS'){
      return isAcceptance
        ?`Am ${dateStr} wurde das oben angeführte Arbeitsmittel einer Abnahmeprüfung gemäß § 7 AM-VO unterzogen. Die Prüfung erfolgte unter Berücksichtigung der für das Arbeitsmittel einschlägigen Prüfinhalte gemäß § 7 Abs. 2 AM-VO sowie der angeführten zusätzlichen Prüfgrundlagen. Bei der Prüfung wurden keine Mängel festgestellt. Aus dem Ergebnis des festgestellten Prüfumfanges ergeben sich keine Einwände gegen die Benützung des Arbeitsmittels.`
        :`Am ${dateStr} wurde das oben angeführte Arbeitsmittel einer wiederkehrenden Prüfung gemäß § 8 AM-VO unterzogen. Die Prüfung erfolgte unter Berücksichtigung der für das Arbeitsmittel einschlägigen Prüfinhalte gemäß § 8 Abs. 2 AM-VO sowie der angeführten zusätzlichen Prüfgrundlagen. Bei der Prüfung wurden keine Mängel festgestellt. Aus dem Ergebnis des festgestellten Prüfumfanges ergeben sich keine Einwände gegen die weitere Benützung des Arbeitsmittels.`;
    }
    if(report.result==='DEFECTS_USE_PROHIBITED'){
      return isAcceptance
        ?'Bei der Prüfung wurden die nachstehend angeführten Mängel festgestellt. Das Arbeitsmittel darf gemäß § 6 Abs. 2 AM-VO erst nach Behebung der festgestellten Mängel benutzt werden.'
        :'Bei der Prüfung wurden Mängel festgestellt. Gemäß § 6 Abs. 2 AM-VO darf das Arbeitsmittel erst nach Behebung der festgestellten Mängel wieder benutzt werden. Eine Weiterbenützung vor Mängelbehebung wird im Rahmen dieses Prüfbefundes nicht bestätigt.';
    }
    if(report.result==='DEFECTS_USE_ALLOWED_6_3'){
      return `Bei der Prüfung wurden Mängel festgestellt. Der Prüfer hält gemäß § 6 Abs. 3 Z 1 AM-VO schriftlich fest, dass das Arbeitsmittel unter den nachstehend angeführten Bedingungen bereits vor vollständiger Mängelbehebung weiter benutzt werden darf. Die betroffenen Arbeitnehmer:innen sind gemäß § 6 Abs. 3 Z 2 AM-VO über die festgestellten Mängel zu informieren. Bedingungen der Weiterbenützung: ${text(report.continuedUse.conditions)||'–'}`;
    }
    return `Am ${dateStr} konnte das oben angeführte Arbeitsmittel im Rahmen der vorgesehenen Prüfung nicht vollständig beurteilt werden. Begründung: ${text(report.notAssessableReason)||'–'}. Aus dieser Prüfung ergibt sich keine positive Aussage zur (Weiter-)Benützung des Arbeitsmittels.`;
  }

  /* ---------- Zustand & Mutatoren ---------- */
  function ensure(){
    if(!Array.isArray(state.pbFleet)||!state.pbFleet.length)state.pbFleet=seedFleet();
    if(!Array.isArray(state.pbReports))state.pbReports=seedReports();
    state.pbReports.forEach(ensureReportShape);
    state.pbSeq=state.pbSeq||state.pbReports.length;
  }
  function seedReports(){
    const base=id=>ensureReportShape({
      id,version:1,supersedes:'',supersededBy:'',assetId:'',inspectionType:'WIEDERKEHREND_AMVO_8',date:viennaToday(),
      inspector:{name:'',qualification:'',company:'INGTEC GmbH',address:'9500 Villach, Musterstraße 1'},
      applicabilityOverride:{used:false,reason:''},additionalGrounds:[],checklist:{},findings:[],findingSeq:0,
      result:'',continuedUse:{reason:'',conditions:'',deadline:'',affectedFindingIds:[],employeeInfoConfirmed:null},notAssessableReason:'',
      signOff:{signed:false,name:'',qualification:'',signedAt:''},
      status:'DRAFT',createdAt:now(),createdBy:'M. Šop',releasedAt:'',releasedBy:'',signedAt:'',signedBy:'',finalizedAt:'',finalizedBy:'',
      checklistVersion:'PB-CHECKLIST-2026.1',templateVersion:'PB-ONEPAGE-1.0',finalDocumentHash:''
    });
    const r1=base('PB-2026-0001');
    Object.assign(r1,{assetId:'TOR-01',inspectionType:'WIEDERKEHREND_AMVO_8',date:'2026-06-12',status:'FINAL',result:'NO_DEFECTS',createdBy:'M. Šop',releasedAt:'2026-06-13T09:00:00.000Z',releasedBy:'M. Šop',signedAt:'2026-06-13T09:10:00.000Z',signedBy:'M. Šop',finalizedAt:'2026-06-13T09:15:00.000Z',finalizedBy:'M. Šop'});
    r1.inspector={name:'M. Šop',qualification:'Fachkundige Person gem. AM-VO',company:'INGTEC GmbH',address:'9500 Villach, Musterstraße 1'};
    r1.signOff={signed:true,name:'M. Šop',qualification:'Fachkundige Person gem. AM-VO',signedAt:'2026-06-13T09:10:00.000Z'};
    checklistItemsFor(r1).forEach(([id])=>r1.checklist[id]={result:'OK',remark:''});
    r1.finalDocumentHash=hashString(JSON.stringify({id:r1.id,date:r1.date,result:r1.result}));

    const r2=base('PB-2026-0002');
    Object.assign(r2,{assetId:'FHB-01',inspectionType:'ABNAHME_AMVO_7',date:viennaToday(),status:'DRAFT',createdBy:'M. Šop'});
    r2.inspector={name:'M. Šop',qualification:'Fachkundige Person gem. AM-VO',company:'INGTEC GmbH',address:'9500 Villach, Musterstraße 1'};
    const r2items=checklistItemsFor(r2);
    r2items.forEach(([id],index)=>{r2.checklist[id]={result:index<r2items.length-2?'OK':'',remark:''};});

    const r3=base('PB-2026-0003');
    Object.assign(r3,{assetId:'BST-01',inspectionType:'WIEDERKEHREND_AMVO_8',date:'2026-08-05',status:'SIGNED',createdBy:'M. Šop',releasedAt:'2026-08-06T08:00:00.000Z',releasedBy:'M. Šop',signedAt:'2026-08-06T08:20:00.000Z',signedBy:'M. Šop'});
    r3.inspector={name:'M. Šop',qualification:'Fachkundige Person gem. AM-VO',company:'INGTEC GmbH',address:'9500 Villach, Musterstraße 1'};
    r3.signOff={signed:true,name:'M. Šop',qualification:'Fachkundige Person gem. AM-VO',signedAt:'2026-08-06T08:20:00.000Z'};
    r3.additionalGrounds=[{category:'technical',title:'TRVB 151 S',edition:'2019',reason:'kraftbetriebener Brandschutzabschluss',bindingReason:'Stand der Technik'}];
    checklistItemsFor(r3).forEach(([id])=>r3.checklist[id]={result:'OK',remark:''});
    r3.checklist['t-bst-1']={result:'MANGEL',remark:'Türblatt schließt nicht selbsttätig vollständig'};
    r3.findings=[{id:'M-01',seq:1,description:'Selbstschließmechanismus schließt das Türblatt nicht vollständig',component:'Türschließer',basis:'TRVB 151 S Pkt. 6',classification:'erheblich',measure:'Türschließer nachjustieren/tauschen',deadline:'2026-09-15',status:'offen',relevantForUse:true,deciderNote:'Weiterbenützung unter Auflage vertretbar, tägliche Sichtkontrolle durch Betreiber'}];
    r3.findingSeq=1;
    r3.result='DEFECTS_USE_ALLOWED_6_3';
    r3.continuedUse={reason:'Rauchmeldergesteuerte Auslösung funktioniert; nur die manuelle Nachlaufschließung ist betroffen.',conditions:'Tägliche Sichtkontrolle durch den Betreiber bis zur Instandsetzung; Durchfahrt bleibt für Rettungswege freizuhalten.',deadline:'2026-09-15',affectedFindingIds:['M-01'],employeeInfoConfirmed:null};

    const r4=base('PB-2026-0004');
    Object.assign(r4,{assetId:'KRAN-01',inspectionType:'ABNAHME_AMVO_7',date:'2026-07-20',status:'RELEASED',createdBy:'M. Šop',releasedAt:'2026-07-21T10:00:00.000Z',releasedBy:'M. Šop'});
    r4.inspector={name:'M. Šop',qualification:'Fachkundige Person gem. AM-VO',company:'INGTEC GmbH',address:'9500 Villach, Musterstraße 1'};
    r4.applicabilityOverride={used:true,reason:'Kranart Brückenkran laut Herstellerfreigabe und Auslegung des Fachbereichs abnahmepflichtig gemäß § 7 AM-VO, siehe Gutachten INGTEC-G-2026-014.'};
    checklistItemsFor(r4).forEach(([id])=>r4.checklist[id]={result:'OK',remark:''});
    r4.checklist['c7-4']={result:'MANGEL',remark:'Notendschalter Hubwerk löst verzögert aus'};
    r4.findings=[{id:'M-01',seq:1,description:'Notendschalter des Hubwerks löst mit spürbarer Verzögerung aus',component:'Hubwerk / Endschalter',basis:'§ 7 Abs. 2 Z 4 AM-VO',classification:'schwerwiegend',measure:'Endschalter tauschen und Funktionsprüfung wiederholen',deadline:'2026-08-10',status:'offen',relevantForUse:false,deciderNote:'Keine Weiterbenützung bis Instandsetzung – Abnahmeprüfung, § 6 Abs. 3 nicht zulässig.'}];
    r4.findingSeq=1;
    r4.result='DEFECTS_USE_PROHIBITED';
    return [r1,r2,r3,r4];
  }
  const reportById=id=>arr(state.pbReports).find(r=>r.id===text(id))||null;
  const canEdit=report=>!['FINAL','SUPERSEDED'].includes(report.status);
  function guardEditable(report){
    if(!canEdit(report)){showToast?.('Dieser Prüfbefund ist final und kann nicht mehr geändert werden. Bitte eine neue Version anlegen.',null,null,'error');return false;}
    return true;
  }
  function nextReportId(){state.pbSeq=(state.pbSeq||0)+1;return `PB-${new Date(viennaToday()).getFullYear()}-${String(state.pbSeq).padStart(4,'0')}`;}

  function createReport(assetId,inspectionType,overrideReason){
    if(!window.requirePermission?.('inspection','das Anlegen eines Prüfbefundes'))return null;
    const asset=assetById(assetId);
    if(!asset)return null;
    const level=plausibility(asset,inspectionType);
    if(level!=='YES'&&!text(overrideReason)){showToast?.('Für diese Anlagenkonfiguration ist die gewählte Prüfart nicht als Standardprüfpflicht hinterlegt. Fachliche Freigabe erforderlich.',null,null,'error');return null;}
    const report=ensureReportShape({
      id:nextReportId(),version:1,supersedes:'',supersededBy:'',assetId,inspectionType,date:viennaToday(),
      inspector:{name:actor().name,qualification:'Fachkundige Person gem. AM-VO',company:'INGTEC GmbH',address:'9500 Villach, Musterstraße 1'},
      applicabilityOverride:{used:level!=='YES',reason:level!=='YES'?text(overrideReason):''},
      additionalGrounds:[],checklist:{},findings:[],findingSeq:0,result:'',
      continuedUse:{reason:'',conditions:'',deadline:'',affectedFindingIds:[],employeeInfoConfirmed:null},notAssessableReason:'',
      signOff:{signed:false,name:'',qualification:'',signedAt:''},
      status:'DRAFT',createdAt:now(),createdBy:actor().name,releasedAt:'',releasedBy:'',signedAt:'',signedBy:'',finalizedAt:'',finalizedBy:'',
      checklistVersion:'PB-CHECKLIST-2026.1',templateVersion:'PB-ONEPAGE-1.0',finalDocumentHash:''
    });
    state.pbReports.unshift(report);
    if(report.applicabilityOverride.used)window.recordAudit?.('Fachliche Freigabe: Prüfart-Override',{entityType:'Prüfbefund',entityId:report.id,summary:`${asset.id} · ${inspectionType} trotz nicht-standardmäßiger Prüfpflicht: ${report.applicabilityOverride.reason}`});
    window.recordAudit?.('Prüfbefund angelegt',{entityType:'Prüfbefund',entityId:report.id,summary:`${asset.id} · ${inspectionType==='ABNAHME_AMVO_7'?'Abnahmeprüfung § 7':'Wiederkehrende Prüfung § 8'}`});
    save?.();
    return report;
  }
  window.setPbChecklistResult=function(reportId,itemId,value){
    const report=reportById(reportId);
    if(!report||!guardEditable(report)||!window.requirePermission?.('inspection','das Bewerten von Prüfpunkten'))return;
    report.checklist[itemId]=report.checklist[itemId]||{result:'',remark:''};
    report.checklist[itemId].result=value;
    save?.();window.renderAll?.();setActivePage?.('pruefbefund');
  };
  window.setPbChecklistRemark=function(reportId,itemId,value){
    const report=reportById(reportId);
    if(!report||!guardEditable(report))return;
    report.checklist[itemId]=report.checklist[itemId]||{result:'',remark:''};
    report.checklist[itemId].remark=text(value);
    save?.();
  };
  window.setPbResult=function(reportId,code){
    const report=reportById(reportId);
    if(!report||!guardEditable(report)||!window.requirePermission?.('inspection','die Ergebnisentscheidung'))return;
    const availability=resultAvailability(report);
    if(!availability[code]?.enabled){showToast?.(availability[code]?.reason||'Dieses Ergebnis ist für diese Prüfung nicht zulässig.',null,null,'error');return;}
    report.result=code;
    save?.();window.renderAll?.();setActivePage?.('pruefbefund');
  };
  window.updatePbField=function(reportId,path,value){
    const report=reportById(reportId);
    if(!report||!guardEditable(report))return;
    const segments=path.split('.');
    let target=report;
    for(let i=0;i<segments.length-1;i++)target=target[segments[i]]=target[segments[i]]||{};
    target[segments[segments.length-1]]=value;
    save?.();
  };
  window.confirmPbEmployeeInfo=function(reportId,by,role){
    const report=reportById(reportId);
    if(!report||!guardEditable(report)||!window.requirePermission?.('inspection','die Betreiberbestätigung'))return;
    if(!text(by)){showToast?.('Bitte Name/Funktion der bestätigenden Person angeben.',null,null,'error');return;}
    report.continuedUse.employeeInfoConfirmed={by:text(by),role:text(role),at:now()};
    window.recordAudit?.('Information der Arbeitnehmer:innen bestätigt',{entityType:'Prüfbefund',entityId:report.id,summary:`§ 6 Abs. 3 Z 2 AM-VO · bestätigt durch ${text(by)}`});
    save?.();window.renderAll?.();setActivePage?.('pruefbefund');
  };
  window.addPbFinding=function(reportId,input){
    const report=reportById(reportId);
    if(!report||!guardEditable(report)||!window.requirePermission?.('inspection','das Erfassen einer Feststellung'))return;
    report.findingSeq=(report.findingSeq||0)+1;
    const finding={id:'M-'+String(report.findingSeq).padStart(2,'0'),seq:report.findingSeq,description:text(input.description),component:text(input.component),basis:text(input.basis),classification:input.classification||'gering',measure:text(input.measure),deadline:text(input.deadline),status:'offen',relevantForUse:Boolean(input.relevantForUse),deciderNote:text(input.deciderNote)};
    report.findings.push(finding);
    window.recordAudit?.('Mangel erfasst',{entityType:'Prüfbefund',entityId:report.id,summary:`${finding.id}: ${finding.description}`});
    save?.();window.renderAll?.();setActivePage?.('pruefbefund');
  };
  window.removePbFinding=function(reportId,findingId){
    const report=reportById(reportId);
    if(!report||!guardEditable(report))return;
    report.findings=report.findings.filter(f=>f.id!==findingId);
    report.continuedUse.affectedFindingIds=report.continuedUse.affectedFindingIds.filter(id=>id!==findingId);
    save?.();window.renderAll?.();setActivePage?.('pruefbefund');
  };
  window.pbAttemptAdvance=function(reportId){
    const report=reportById(reportId);
    if(!report)return;
    const target=STATUS_ORDER[STATUS_ORDER.indexOf(report.status)+1];
    if(!target)return;
    openAdvanceModal(report,target);
  };
  function commitAdvance(report,target,extra){
    const before=report.status;
    report.status=target;
    if(target==='RELEASED'){report.releasedAt=now();report.releasedBy=actor().name;}
    if(target==='SIGNED'){report.signOff={signed:true,name:extra?.name||actor().name,qualification:extra?.qualification||report.inspector.qualification,signedAt:now()};report.signedAt=now();report.signedBy=report.signOff.name;}
    if(target==='FINAL'){report.finalizedAt=now();report.finalizedBy=actor().name;report.finalDocumentHash=hashString(JSON.stringify({id:report.id,version:report.version,date:report.date,result:report.result,checklist:report.checklist,findings:report.findings}));}
    window.recordAudit?.('Prüfbefund-Status geändert',{entityType:'Prüfbefund',entityId:report.id,summary:`${STATUS_META[before]?.label} → ${STATUS_META[target]?.label}`});
    save?.();window.renderAll?.();setActivePage?.('pruefbefund');
    showToast?.(`Prüfbefund ${report.id}: ${STATUS_META[target]?.label}.`);
  }
  window.reviseReport=function(reportId){
    const old=reportById(reportId);
    if(!old||old.status!=='FINAL'||!window.requirePermission?.('inspection','das Anlegen einer neuen Version'))return;
    const clone=ensureReportShape(JSON.parse(JSON.stringify(old)));
    clone.id=nextReportId();clone.version=(old.version||1)+1;clone.supersedes=old.id;clone.supersededBy='';
    clone.status='DRAFT';clone.result='';clone.findings=[];clone.findingSeq=0;clone.checklist={};
    clone.continuedUse={reason:'',conditions:'',deadline:'',affectedFindingIds:[],employeeInfoConfirmed:null};
    clone.signOff={signed:false,name:'',qualification:'',signedAt:''};
    clone.createdAt=now();clone.createdBy=actor().name;clone.releasedAt='';clone.releasedBy='';clone.signedAt='';clone.signedBy='';clone.finalizedAt='';clone.finalizedBy='';clone.finalDocumentHash='';
    old.status='SUPERSEDED';old.supersededBy=clone.id;
    state.pbReports.unshift(clone);
    window.recordAudit?.('Neue Prüfbefund-Version angelegt',{entityType:'Prüfbefund',entityId:clone.id,summary:`ersetzt ${old.id} (Version ${clone.version})`});
    save?.();
    navigate({screen:'editor',reportId:clone.id,tab:'stamm'});
  };

  /* ---------- Fälligkeitshinweis nach § 8 (AC-12) ---------- */
  function dueInfoFor(report){
    if(report.inspectionType!=='WIEDERKEHREND_AMVO_8'||!report.date)return null;
    return computeDueDates(report.date);
  }

  /* ---------- OnePage-Modell (Bereich A-H) ---------- */
  function onePageSections(report){
    const asset=assetById(report.assetId);
    const gate=reportGate(report);
    const legal=legalGroundsFor(report);
    const schema=asset?ATTRIBUTE_SCHEMA[asset.family]||[]:[];
    const techFields=schema.filter(([key])=>text(asset?.attrs?.[key])).map(([key,label,unit])=>`${label}: ${text(asset.attrs[key])}${unit?' '+unit:''}`);
    const due=dueInfoFor(report);
    return {asset,gate,legal,techFields,due,resultMeta:RESULT_META[report.result]||null};
  }
  function onePagePdfModel(report){
    const {asset,legal,techFields,due}=onePageSections(report);
    const groundsLines=[...legal.map(rule=>`${rule.reference} (${rule.title}, Fassung ${rule.version}, gültig ab ${dateLabel(rule.valid_from)})`),...report.additionalGrounds.map(g=>`${g.title||'Zusätzliche Grundlage'}${g.edition?' · Ausgabe '+g.edition:''} – ${g.reason||'ohne Zuordnung'}`)];
    const findingsRows=report.findings.slice(0,3).map(f=>({title:`${f.id} · ${f.classification.toUpperCase()}`,details:[f.description,`Maßnahme: ${f.measure||'–'} · Frist: ${dateLabel(f.deadline)}`]}));
    if(report.findings.length>3)findingsRows.push({title:'Weitere Mängel',details:[`Es wurden ${report.findings.length} Mängel festgestellt. Einzelheiten siehe Anlage M-01 zum Prüfbefund.`]});
    const sections=[
      {title:'Prüfgegenstand',intro:`${asset?.name||'–'} · Inv.-Nr. ${asset?.inventoryNumber||'–'}`,rows:[{title:[asset?.manufacturer,asset?.model].filter(Boolean).join(' ')||'–',details:techFields}]},
      {title:'Prüfung',rows:[{title:`Prüfdatum ${dateLabel(report.date)} · ${reportHeaderTitle(report)}`,details:[...groundsLines,due?`Nächste Prüfung geplant bis ${dateLabel(due.planned)} · spätester zulässiger Termin ${dateLabel(due.legalMax)}`:'']}]},
      {title:'Mängel',rows:findingsRows.length?findingsRows:[{title:'Keine Mängel festgestellt',details:[]}]},
      {title:'Prüfer',rows:[{title:report.inspector.name||'–',details:[report.inspector.qualification,`Prüfstelle: ${report.inspector.company}`,report.inspector.address,`Freigabedatum: ${report.releasedAt?dateLabel(report.releasedAt.slice(0,10)):'–'}`]}]}
    ];
    return {
      title:'PRÜFBEFUND',subtitle:reportHeaderTitle(report),
      meta:`${asset?.customer||''} · ${asset?.site||''} · Prüfbefund ${report.id} (Version ${report.version}) · INGTEC GmbH`,
      score:(RESULT_META[report.result]?.badge)||'ERGEBNIS AUSSTÄNDIG',
      note:reportMainText(report),
      sections,
      footer:`Prüfinhalte gemäß ${report.inspectionType==='ABNAHME_AMVO_7'?'§ 7 Abs. 2 AM-VO':'§ 8 Abs. 2 AM-VO'} · Checklistenversion ${report.checklistVersion} · Rechtsregelversion ${legal.map(r=>r.version).join('/')||'–'} · Templateversion ${report.templateVersion} · Dokument-Hash ${report.finalDocumentHash||'wird bei Finalisierung vergeben'}`
    };
  }
  window.downloadPbReport=function(reportId){
    const report=reportById(reportId);
    if(!report)return;
    if(!window.INGTECPdf?.download){showToast?.('Der PDF-Export wird noch geladen. Bitte versuche es gleich noch einmal.',null,null,'error');return;}
    const model=onePagePdfModel(report);
    const stem=`INGTEC_Pruefbefund_${report.id}`.replace(/[^A-Za-z0-9._-]+/g,'_');
    window.INGTECPdf.download(model,stem);
    window.recordAudit?.('Prüfbefund als PDF exportiert',{entityType:'Prüfbefund',entityId:report.id,summary:'Einseitiger Prüfbefund lokal exportiert.'});
    showToast?.('Prüfbefund wurde als PDF heruntergeladen.');
  };

  /* ---------- Ansicht / Navigation ---------- */
  let view={screen:'list',reportId:null,tab:'stamm',pickerAssetId:'',pickerType:'',pickerOverrideReason:''};
  const TOP_LEVEL_SCREENS=new Set(['list','new']);
  function navigate(patch){view={...view,...patch};window.renderAll?.();setActivePage?.('pruefbefund');}
  function setPbScreen(screen){
    if(!TOP_LEVEL_SCREENS.has(screen))return false;
    view={screen,reportId:null,tab:'stamm',pickerAssetId:'',pickerType:'',pickerOverrideReason:''};
    const current=document.getElementById('pruefbefund');
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
  function statusBadge(status){const meta=STATUS_META[status]||STATUS_META.DRAFT;return `<span class="pb-status tone-${meta.tone}">${esc(meta.label)}</span>`;}
  function resultBadge(code){const meta=RESULT_META[code];return meta?`<span class="pb-result-chip tone-${meta.tone}">${esc(meta.label)}</span>`:'<span class="pb-result-chip tone-muted">Ausständig</span>';}

  function listScreen(){
    const reports=arr(state.pbReports);
    const rows=reports.map(report=>{
      const asset=assetById(report.assetId);
      return `<article class="card pb-list-row" data-pb-open="${esc(report.id)}"><div class="pb-list-main"><b>${esc(report.id)}</b><span>${esc(asset?.name||report.assetId)}</span></div><div class="pb-list-meta"><span>${esc(reportHeaderTitle(report))}</span><span>${dateLabel(report.date)}</span></div>${statusBadge(report.status)}${resultBadge(report.result)}<button type="button" class="secondary" data-pb-open="${esc(report.id)}">Öffnen</button></article>`;
    }).join('');
    return `<div class="pb-list-screen">
      <div class="section-head pb-section-head"><div><span class="eyebrow">INGTEC PrüfBefund</span><h3>Alle Prüfbefunde</h3><p>${reports.length} Prüfbefund${reports.length===1?'':'e'}</p></div><button type="button" class="primary" data-pb-nav="new">+ Neuer Prüfbefund</button></div>
      <div class="pb-list">${rows||'<p class="pb-empty">Noch keine Prüfbefunde angelegt.</p>'}</div>
    </div>`;
  }

  function pickerScreen(){
    const list=assets();
    const selected=assetById(view.pickerAssetId);
    const type=view.pickerType;
    const level=selected&&type?plausibility(selected,type):null;
    const profile=selected?legalProfile(selected):null;
    return `<div class="pb-new-screen">
      <div class="section-head pb-section-head"><div><span class="eyebrow">Neuer Prüfbefund</span><h3>Schritt 1 · Arbeitsmittel wählen</h3></div><button type="button" class="secondary" data-pb-nav="list">Abbrechen</button></div>
      <div class="pb-asset-grid">${list.map(asset=>{
        const p=legalProfile(asset);
        return `<article class="card pb-asset-pick ${view.pickerAssetId===asset.id?'is-selected':''}" data-pb-pick-asset="${esc(asset.id)}"><b>${esc(asset.id)}</b><h4>${esc(asset.name)}</h4><span>${esc(FAMILY_LABEL[asset.family]||asset.family)} · ${esc(asset.bauart)}</span><div class="pb-profile-chips"><em class="chip-${p.amvo7.toLowerCase()}">§7 ${p.amvo7==='YES'?'✓':p.amvo7==='REVIEW'?'! prüfen':'–'}</em><em class="chip-${p.amvo8.toLowerCase()}">§8 ${p.amvo8==='YES'?'✓':p.amvo8==='REVIEW'?'! prüfen':'–'}</em></div></article>`;
      }).join('')}</div>
      ${selected?`<div class="card pb-type-card"><h3>Schritt 2 · Prüfart bestimmen</h3><p class="pb-profile-note">${esc(profile.reason)}</p><div class="pb-type-options">
        <button type="button" class="pb-type-btn ${type==='ABNAHME_AMVO_7'?'active':''}" data-pb-pick-type="ABNAHME_AMVO_7">Abnahmeprüfung gemäß § 7 AM-VO</button>
        <button type="button" class="pb-type-btn ${type==='WIEDERKEHREND_AMVO_8'?'active':''}" data-pb-pick-type="WIEDERKEHREND_AMVO_8">Wiederkehrende Prüfung gemäß § 8 AM-VO</button>
      </div>
      ${type&&level!=='YES'?`<div class="pb-plausibility-warning" role="alert"><b>Für diese Anlagenkonfiguration ist die gewählte Prüfart nicht als Standardprüfpflicht hinterlegt. Fachliche Freigabe erforderlich.</b><label>Begründung der fachlichen Freigabe<textarea id="pbOverrideReason" minlength="10" placeholder="Warum ist diese Prüfart fachlich vertretbar?">${esc(view.pickerOverrideReason)}</textarea></label></div>`:''}
      ${type?`<div class="pb-type-actions"><button type="button" class="primary" data-pb-create="1">Prüfbefund anlegen</button></div>`:''}
      </div>`:''}
    </div>`;
  }

  function checklistTab(report){
    const items=checklistItemsFor(report);
    const groupLabel={legal7:'Gesetzliche Mindestprüfinhalte § 7 Abs. 2 AM-VO',legal8:'Gesetzliche Mindestprüfinhalte § 8 Abs. 2 AM-VO',technical:'Anlagenspezifische Prüfpunkte'};
    const groups=[...new Set(items.map(i=>i[2]))];
    const editable=canEdit(report);
    return `<div class="pb-tab-panel">${groups.map(group=>`<section class="pb-checklist-group"><h4>${esc(groupLabel[group]||group)}</h4>${items.filter(i=>i[2]===group).map(([id,label])=>{
      const entry=report.checklist[id]||{result:'',remark:''};
      return `<article class="card pb-checklist-item"><div class="pb-checklist-head"><span>${esc(label)}</span></div><div class="pb-checklist-options" role="group">${CHECKLIST_RESULT_OPTIONS.map(([value,optLabel,tone])=>`<button type="button" ${editable?'':'disabled'} class="pb-result-btn tone-${tone} ${entry.result===value?'active':''}" data-pb-checklist-result="${esc(report.id)}::${esc(id)}::${value}">${esc(optLabel)}</button>`).join('')}</div><textarea ${editable?'':'disabled'} class="pb-checklist-remark" placeholder="Bemerkung" data-pb-checklist-remark="${esc(report.id)}::${esc(id)}">${esc(entry.remark)}</textarea></article>`;
    }).join('')}</section>`).join('')}</div>`;
  }
  function grundlageTab(report){
    const legal=legalGroundsFor(report);
    return `<div class="pb-tab-panel pb-grid-2">
      <div class="card"><h4>Rechtsgrundlagen</h4>${legal.map(rule=>`<div class="pb-meta-line"><span>${esc(rule.reference)}</span><b>${esc(rule.title)} · v${esc(rule.version)}</b></div><div class="pb-meta-line"><span>Gültig ab</span><b>${dateLabel(rule.valid_from)}${rule.valid_to?' bis '+dateLabel(rule.valid_to):''}</b></div>`).join('')}${report.applicabilityOverride.used?`<div class="pb-override-note"><b>Fachliche Freigabe (Override)</b><p>${esc(report.applicabilityOverride.reason)}</p></div>`:''}</div>
      <div class="card"><h4>Technische Regelwerke / Herstellergrundlagen</h4>${report.additionalGrounds.length?report.additionalGrounds.map(g=>`<div class="pb-meta-line"><span>${esc(g.category)}</span><b>${esc(g.title)}${g.edition?' · '+esc(g.edition):''}</b></div><div class="pb-meta-line"><span>Anwendungsgrund</span><b>${esc(g.reason||'–')}</b></div>`).join(''):'<p class="pb-empty">Keine zusätzlichen technischen Grundlagen hinterlegt.</p>'}</div>
    </div>`;
  }
  function stammTab(report){
    const asset=assetById(report.assetId);
    const schema=asset?ATTRIBUTE_SCHEMA[asset.family]||[]:[];
    const editable=canEdit(report);
    return `<div class="pb-tab-panel pb-grid-2">
      <div class="card"><h4>Eigentümer / Standort</h4><div class="pb-meta-line"><span>Kunde</span><b>${esc(asset?.customer)}</b></div><div class="pb-meta-line"><span>Standort</span><b>${esc(asset?.site)} · ${esc(asset?.location)}</b></div><div class="pb-meta-line"><span>Inventarnummer</span><b>${esc(asset?.inventoryNumber)}</b></div><div class="pb-meta-line"><span>Anlage</span><b>${esc(asset?.name)} (${esc(asset?.id)})</b></div><div class="pb-meta-line"><span>Hersteller / Type</span><b>${esc([asset?.manufacturer,asset?.model].filter(Boolean).join(' '))}</b></div><div class="pb-meta-line"><span>Baujahr</span><b>${esc(asset?.yearBuilt)}</b></div>${schema.filter(([key])=>text(asset?.attrs?.[key])).map(([key,label,unit])=>`<div class="pb-meta-line"><span>${esc(label)}</span><b>${esc(asset.attrs[key])}${unit?' '+esc(unit):''}</b></div>`).join('')}</div>
      <div class="card"><h4>Prüfung</h4><label>Prüfdatum<input type="date" value="${esc(report.date)}" ${editable?'':'disabled'} onchange="updatePbField('${esc(report.id)}','date',this.value);window.renderAll?.();setActivePage?.('pruefbefund')"></label><label>Prüfer<input value="${esc(report.inspector.name)}" ${editable?'':'disabled'} onchange="updatePbField('${esc(report.id)}','inspector.name',this.value)"></label><label>Qualifikation<input value="${esc(report.inspector.qualification)}" ${editable?'':'disabled'} onchange="updatePbField('${esc(report.id)}','inspector.qualification',this.value)"></label><div class="pb-meta-line"><span>Prüfstelle</span><b>${esc(report.inspector.company)}</b></div><div class="pb-meta-line"><span>Prüfart</span><b>${esc(reportHeaderTitle(report))}</b></div>${dueInfoFor(report)?`<div class="pb-meta-line"><span>Nächste Prüfung geplant</span><b>${dateLabel(dueInfoFor(report).planned)}</b></div><div class="pb-meta-line"><span>Spätester zulässiger Termin</span><b>${dateLabel(dueInfoFor(report).legalMax)}</b></div>`:''}</div>
    </div>`;
  }
  function maengelTab(report){
    const editable=canEdit(report);
    return `<div class="pb-tab-panel">
      ${editable?'<button type="button" class="secondary" data-pb-add-finding="'+esc(report.id)+'">+ Mangel erfassen</button>':''}
      ${report.findings.length?report.findings.map(f=>`<article class="card pb-finding-card"><div class="pb-finding-head"><b>${esc(f.id)}</b><span class="pb-class-tag tone-${esc(f.classification)}">${esc(f.classification.toUpperCase())}</span>${editable?`<button type="button" class="link" data-pb-remove-finding="${esc(report.id)}::${esc(f.id)}">Entfernen</button>`:''}</div><p>${esc(f.description)}</p><div class="pb-meta-line"><span>Bauteil/Ort</span><b>${esc(f.component)}</b></div><div class="pb-meta-line"><span>Grundlage</span><b>${esc(f.basis)}</b></div><div class="pb-meta-line"><span>Maßnahme</span><b>${esc(f.measure)}</b></div><div class="pb-meta-line"><span>Frist</span><b>${dateLabel(f.deadline)}</b></div><div class="pb-meta-line"><span>Relevant für Weiterbenützung</span><b>${f.relevantForUse?'Ja':'Nein'}</b></div><div class="pb-meta-line"><span>Entscheidung des Prüfers</span><b>${esc(f.deciderNote||'–')}</b></div></article>`).join(''):'<p class="pb-empty">Keine Mängel erfasst.</p>'}
    </div>`;
  }
  function ergebnisTab(report){
    const availability=resultAvailability(report);
    const editable=canEdit(report);
    const cu=report.continuedUse;
    return `<div class="pb-tab-panel">
      <div class="pb-result-options" role="radiogroup">${Object.entries(RESULT_META).map(([code,meta])=>`<button type="button" class="pb-result-option tone-${meta.tone} ${report.result===code?'active':''}" ${editable&&availability[code].enabled?'':'disabled'} title="${esc(availability[code].reason)}" data-pb-set-result="${esc(report.id)}::${code}">${esc(meta.label)}${!availability[code].enabled&&availability[code].reason?`<small>${esc(availability[code].reason)}</small>`:''}</button>`).join('')}</div>
      ${report.result==='NOT_ASSESSABLE'?`<label class="pb-wide">Begründung<textarea ${editable?'':'disabled'} onchange="updatePbField('${esc(report.id)}','notAssessableReason',this.value)">${esc(report.notAssessableReason)}</textarea></label>`:''}
      ${report.result==='DEFECTS_USE_ALLOWED_6_3'?`<div class="card pb-continued-use">
        <h4>Weiterbenützung gemäß § 6 Abs. 3 AM-VO</h4>
        <label>Begründung des Prüfers<textarea ${editable?'':'disabled'} onchange="updatePbField('${esc(report.id)}','continuedUse.reason',this.value)">${esc(cu.reason)}</textarea></label>
        <label>Bedingungen/Einschränkungen<textarea ${editable?'':'disabled'} onchange="updatePbField('${esc(report.id)}','continuedUse.conditions',this.value)">${esc(cu.conditions)}</textarea></label>
        <label>Spätester Behebungstermin<input type="date" value="${esc(cu.deadline)}" ${editable?'':'disabled'} onchange="updatePbField('${esc(report.id)}','continuedUse.deadline',this.value)"></label>
        <fieldset><legend>Betroffene Mängel</legend>${report.findings.map(f=>`<label class="pb-checkbox"><input type="checkbox" ${cu.affectedFindingIds.includes(f.id)?'checked':''} ${editable?'':'disabled'} onchange="pbToggleAffected('${esc(report.id)}','${esc(f.id)}',this.checked)"> ${esc(f.id)} · ${esc(f.description)}</label>`).join('')||'<p class="pb-empty">Keine Mängel erfasst.</p>'}</fieldset>
        <div class="pb-employee-info ${cu.employeeInfoConfirmed?'is-confirmed':''}"><b>Information der Arbeitnehmer:innen (§ 6 Abs. 3 Z 2 AM-VO)</b>${cu.employeeInfoConfirmed?`<p>Bestätigt durch ${esc(cu.employeeInfoConfirmed.by)}${cu.employeeInfoConfirmed.role?', '+esc(cu.employeeInfoConfirmed.role):''} am ${dateLabel(cu.employeeInfoConfirmed.at.slice(0,10))}.</p>`:editable?`<form data-pb-confirm-employee="${esc(report.id)}"><input name="by" placeholder="Name/Funktion" required><input name="role" placeholder="Rolle (optional)"><button type="submit" class="secondary">Bestätigen</button></form>`:'<p>Noch nicht bestätigt.</p>'}</div>
      </div>`:''}
    </div>`;
  }
  function onePageHtml(report){
    const {asset,legal,techFields,due,resultMeta}=onePageSections(report);
    const visibleFindings=report.findings.slice(0,3);
    return `<div class="pb-onepage">
      <header class="pb-onepage-head"><div><b>${esc(asset?.customer)}</b><span>${esc(asset?.site)} · ${esc(asset?.location)}</span></div><div class="pb-onepage-head-right"><b>INGTEC GmbH</b><span>Prüfbefund ${esc(report.id)} · Version ${report.version}</span><span>Prüfdatum ${dateLabel(report.date)}</span></div></header>
      <h2 class="pb-onepage-title">PRÜFBEFUND</h2><h3 class="pb-onepage-subtitle">${esc(reportHeaderTitle(report))}</h3>
      <section class="pb-onepage-grid">
        <div><h4>Prüfgegenstand</h4><div class="pb-meta-line"><span>Anlage</span><b>${esc(asset?.name)}</b></div><div class="pb-meta-line"><span>Inv.-Nr.</span><b>${esc(asset?.inventoryNumber)}</b></div><div class="pb-meta-line"><span>Hersteller/Type</span><b>${esc([asset?.manufacturer,asset?.model].filter(Boolean).join(' '))}</b></div>${techFields.slice(0,4).map(line=>{const [l,v]=line.split(': ');return `<div class="pb-meta-line"><span>${esc(l)}</span><b>${esc(v)}</b></div>`;}).join('')}</div>
        <div><h4>Prüfung</h4><div class="pb-meta-line"><span>Prüfart</span><b>${esc(reportHeaderTitle(report))}</b></div>${legal.map(r=>`<div class="pb-meta-line"><span>Grundlage</span><b>${esc(r.reference)} · v${esc(r.version)}</b></div>`).join('')}${due?`<div class="pb-meta-line"><span>Nächste Prüfung</span><b>bis ${dateLabel(due.planned)}</b></div>`:''}</div>
      </section>
      <section class="pb-onepage-result tone-${resultMeta?.tone||'muted'}">${esc(resultMeta?.badge||'ERGEBNIS AUSSTÄNDIG')}</section>
      <p class="pb-onepage-text">${esc(reportMainText(report))}</p>
      ${report.findings.length?`<section class="pb-onepage-findings"><h4>Mängel</h4>${visibleFindings.map(f=>`<div>${esc(f.id)} · ${esc(f.description)} — ${esc(f.measure)} (Frist ${dateLabel(f.deadline)})</div>`).join('')}${report.findings.length>3?`<div>Es wurden ${report.findings.length} Mängel festgestellt. Einzelheiten siehe Anlage M-01 zum Prüfbefund.</div>`:''}</section>`:''}
      <footer class="pb-onepage-footer"><div><b>${esc(report.inspector.name)}</b><span>${esc(report.inspector.qualification)}</span><span>${esc(report.inspector.company)} · ${esc(report.inspector.address)}</span></div><div><span>${report.signOff.signed?'Unterschrieben am '+dateLabel(report.signOff.signedAt.slice(0,10)):'Unterschrift ausständig'}</span><span>Freigabedatum: ${report.releasedAt?dateLabel(report.releasedAt.slice(0,10)):'–'}</span></div></footer>
      <p class="pb-onepage-fine">Prüfinhalte gemäß ${report.inspectionType==='ABNAHME_AMVO_7'?'§ 7 Abs. 2 AM-VO':'§ 8 Abs. 2 AM-VO'} · Checklistenversion ${esc(report.checklistVersion)} · Rechtsregelversion ${esc(legal.map(r=>r.version).join('/'))} · Templateversion ${esc(report.templateVersion)}${report.finalDocumentHash?' · Dokument-Hash '+esc(report.finalDocumentHash):''}</p>
    </div>`;
  }
  function vorschauTab(report){
    const gate=reportGate(report);
    const target=STATUS_ORDER[STATUS_ORDER.indexOf(report.status)+1];
    const transitionBlockers=target?blockersForTransition(report,target):gate.blockers;
    return `<div class="pb-tab-panel">
      <div class="pb-gate-summary ${gate.blockers.length?'has-blockers':'is-ready'}">
        <b>${gate.blockers.length?gate.blockers.length+' Übergabeblocker':'Bereit zur Freigabe'}</b>
        ${gate.blockers.length?`<ul>${gate.blockers.map(b=>`<li>${esc(b.label)}</li>`).join('')}</ul>`:''}
        ${gate.warnings.length?`<ul class="pb-gate-warnings">${gate.warnings.map(w=>`<li>${esc(w.label)}</li>`).join('')}</ul>`:''}
      </div>
      <div class="pb-onepage-frame">${onePageHtml(report)}</div>
      <div class="pb-vorschau-actions">
        <button type="button" class="secondary" data-pb-download="${esc(report.id)}">PDF erzeugen</button>
        ${target&&canEdit(report)?`<button type="button" class="primary" data-pb-advance="${esc(report.id)}" ${transitionBlockers.length?'disabled':''}>${esc(STATUS_ACTION[target]||'Weiter')}</button>`:''}
        ${report.status==='FINAL'?'<button type="button" class="secondary" data-pb-revise="'+esc(report.id)+'">Neue Version anlegen</button>':''}
      </div>
    </div>`;
  }
  function editorScreen(){
    const report=reportById(view.reportId);
    if(!report)return '<p class="pb-empty">Prüfbefund nicht gefunden.</p>';
    const asset=assetById(report.assetId);
    const tabs=[['stamm','Grunddaten'],['grundlage','Grundlagen'],['checkliste','Checkliste'],['maengel','Mängel'],['ergebnis','Ergebnis'],['vorschau','Vorschau & Freigabe']];
    const bodies={stamm:stammTab,grundlage:grundlageTab,checkliste:checklistTab,maengel:maengelTab,ergebnis:ergebnisTab,vorschau:vorschauTab};
    const tab=view.tab||'stamm';
    return `<div class="pb-editor">
      <header class="pb-editor-head"><div><span class="eyebrow">${esc(asset?.name)} · ${esc(report.id)}</span><h2>${esc(reportHeaderTitle(report))}</h2></div>${statusBadge(report.status)}<button type="button" class="secondary" data-pb-nav="list">Zur Liste</button></header>
      <div class="pb-tabs" role="tablist">${tabs.map(([id,label])=>`<button type="button" role="tab" class="${tab===id?'active':''}" data-pb-tab="${id}" aria-selected="${tab===id}">${esc(label)}</button>`).join('')}</div>
      ${(bodies[tab]||stammTab)(report)}
    </div>`;
  }

  function advanceModalMarkup(report,target,blockers,warnings){
    const needsSignOff=target==='SIGNED';
    return `<div class="modal-card pb-advance-modal" role="dialog" aria-modal="true" aria-labelledby="pbAdvanceTitle"><div class="modal-head"><div><span class="eyebrow">${esc(report.id)}</span><h2 id="pbAdvanceTitle">${esc(STATUS_ACTION[target]||'Status ändern')}</h2></div><button type="button" class="modal-close" aria-label="Schließen" data-pb-close-advance>×</button></div>
      ${blockers.length?`<div class="pb-gate-summary has-blockers"><b>${blockers.length} Übergabeblocker</b><ul>${blockers.map(b=>`<li>${esc(b.label)}</li>`).join('')}</ul></div>`:'<p class="pb-gate-ok">Alle Pflichtangaben sind vollständig.</p>'}
      ${warnings.length?`<ul class="pb-gate-warnings">${warnings.map(w=>`<li>${esc(w.label)}</li>`).join('')}</ul>`:''}
      ${needsSignOff&&!blockers.length?`<form id="pbSignOffForm"><label>Name der unterzeichnenden Person<input name="name" required value="${esc(report.inspector.name)}"></label><label>Qualifikation<input name="qualification" required value="${esc(report.inspector.qualification)}"></label></form>`:''}
      <div class="modal-actions"><button type="button" class="secondary" data-pb-close-advance>Abbrechen</button><button type="button" class="primary" ${blockers.length?'disabled':''} data-pb-confirm-advance="${esc(report.id)}::${target}">Bestätigen</button></div>
    </div>`;
  }
  function openAdvanceModal(report,target){
    const blockers=blockersForTransition(report,target);
    const warnings=contentWarnings(report);
    let modal=document.getElementById('pbAdvanceModal');
    if(!modal){modal=document.createElement('div');modal.id='pbAdvanceModal';modal.className='modal-backdrop';modal.addEventListener('mousedown',event=>{if(event.target===modal)closeAdvanceModal();});document.body.appendChild(modal);}
    modal.innerHTML=advanceModalMarkup(report,target,blockers,warnings);
    document.body.style.overflow='hidden';
  }
  function closeAdvanceModal(){document.getElementById('pbAdvanceModal')?.remove();if(!document.querySelector('.modal-backdrop'))document.body.style.overflow='';}
  window.pbToggleAffected=function(reportId,findingId,checked){
    const report=reportById(reportId);
    if(!report||!guardEditable(report))return;
    const set=new Set(report.continuedUse.affectedFindingIds);
    checked?set.add(findingId):set.delete(findingId);
    report.continuedUse.affectedFindingIds=[...set];
    save?.();
  };

  function findingDialogMarkup(reportId){
    return `<div class="modal-card pb-finding-modal" role="dialog" aria-modal="true" aria-labelledby="pbFindingTitle"><div class="modal-head"><div><span class="eyebrow">Mangel erfassen</span><h2 id="pbFindingTitle">Neue Feststellung</h2></div><button type="button" class="modal-close" aria-label="Schließen" data-pb-close-finding>×</button></div>
      <form id="pbFindingForm" data-pb-report="${esc(reportId)}"><label>Beschreibung<textarea name="description" required></textarea></label><label>Bauteil/Ort<input name="component"></label><label>Technische Grundlage<input name="basis"></label><label>Einstufung<select name="classification"><option value="gering">gering</option><option value="erheblich">erheblich</option><option value="schwerwiegend">schwerwiegend</option></select></label><label>Maßnahme<input name="measure"></label><label>Frist<input type="date" name="deadline"></label><label class="pb-checkbox"><input type="checkbox" name="relevantForUse"> relevant für Weiterbenützung</label><label>Entscheidung des Prüfers<textarea name="deciderNote"></textarea></label>
      <div class="modal-actions"><button type="button" class="secondary" data-pb-close-finding>Abbrechen</button><button type="submit" class="primary">Mangel speichern</button></div></form>
    </div>`;
  }
  function openFindingDialog(reportId){
    let modal=document.getElementById('pbFindingDialog');
    if(!modal){modal=document.createElement('div');modal.id='pbFindingDialog';modal.className='modal-backdrop';modal.addEventListener('mousedown',event=>{if(event.target===modal)closeFindingDialog();});document.body.appendChild(modal);}
    modal.innerHTML=findingDialogMarkup(reportId);
    modal.querySelectorAll('[data-pb-close-finding]').forEach(btn=>btn.addEventListener('click',closeFindingDialog));
    modal.querySelector('#pbFindingForm')?.addEventListener('submit',event=>{
      event.preventDefault();
      const form=event.currentTarget;
      const input={description:form.elements.description.value,component:form.elements.component.value,basis:form.elements.basis.value,classification:form.elements.classification.value,measure:form.elements.measure.value,deadline:form.elements.deadline.value,relevantForUse:form.elements.relevantForUse.checked,deciderNote:form.elements.deciderNote.value};
      if(!text(input.description)){showToast?.('Bitte eine Beschreibung angeben.',null,null,'error');return;}
      window.addPbFinding(form.dataset.pbReport,input);
      closeFindingDialog();
    });
    if(typeof enhanceFormControls==='function')enhanceFormControls(modal);
    document.body.style.overflow='hidden';
  }
  function closeFindingDialog(){document.getElementById('pbFindingDialog')?.remove();if(!document.querySelector('.modal-backdrop'))document.body.style.overflow='';}

  function page(){
    ensure();
    let body='';
    if(view.screen==='new')body=pickerScreen();
    else if(view.screen==='editor')body=editorScreen();
    else body=listScreen();
    return `<section class="page pruefbefund-workspace" id="pruefbefund"><div class="section-head pb-page-head"><div><span class="eyebrow">INGTEC PrüfBefund</span><h2>Prüfbefunde</h2><p>Abnahme- und wiederkehrende Prüfungen als rechtssicherer Einseitenbefund.</p></div></div>${body}</section>`;
  }
  window.pruefbefund=page;
  window.pruefbefundSetScreen=setPbScreen;

  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;
    const navBtn=target.closest('[data-pb-nav]');
    if(navBtn){event.preventDefault();navigate({screen:navBtn.dataset.pbNav,pickerAssetId:'',pickerType:''});return;}
    const openBtn=target.closest('[data-pb-open]');
    if(openBtn){event.preventDefault();navigate({screen:'editor',reportId:openBtn.dataset.pbOpen,tab:'stamm'});return;}
    const tabBtn=target.closest('[data-pb-tab]');
    if(tabBtn){event.preventDefault();navigate({tab:tabBtn.dataset.pbTab});return;}
    const pickAsset=target.closest('[data-pb-pick-asset]');
    if(pickAsset){event.preventDefault();view={...view,pickerAssetId:pickAsset.dataset.pbPickAsset,pickerType:''};window.renderAll?.();setActivePage?.('pruefbefund');return;}
    const pickType=target.closest('[data-pb-pick-type]');
    if(pickType){event.preventDefault();view={...view,pickerType:pickType.dataset.pbPickType};window.renderAll?.();setActivePage?.('pruefbefund');return;}
    const createBtn=target.closest('[data-pb-create]');
    if(createBtn){
      event.preventDefault();
      const reasonField=document.getElementById('pbOverrideReason');
      const reason=reasonField?reasonField.value:'';
      if(reasonField&&text(reason).length<10){showToast?.('Bitte eine fachlich nachvollziehbare Begründung mit mindestens 10 Zeichen angeben.',null,null,'error');return;}
      const report=createReport(view.pickerAssetId,view.pickerType,reason);
      if(report)navigate({screen:'editor',reportId:report.id,tab:'stamm'});
      return;
    }
    const checklistResult=target.closest('[data-pb-checklist-result]');
    if(checklistResult){event.preventDefault();const [reportId,itemId,value]=checklistResult.dataset.pbChecklistResult.split('::');window.setPbChecklistResult(reportId,itemId,value);return;}
    const setResultBtn=target.closest('[data-pb-set-result]');
    if(setResultBtn&&!setResultBtn.disabled){event.preventDefault();const [reportId,code]=setResultBtn.dataset.pbSetResult.split('::');window.setPbResult(reportId,code);return;}
    const addFindingBtn=target.closest('[data-pb-add-finding]');
    if(addFindingBtn){event.preventDefault();openFindingDialog(addFindingBtn.dataset.pbAddFinding);return;}
    const removeFindingBtn=target.closest('[data-pb-remove-finding]');
    if(removeFindingBtn){event.preventDefault();const [reportId,findingId]=removeFindingBtn.dataset.pbRemoveFinding.split('::');window.removePbFinding(reportId,findingId);return;}
    const advanceBtn=target.closest('[data-pb-advance]');
    if(advanceBtn&&!advanceBtn.disabled){event.preventDefault();window.pbAttemptAdvance(advanceBtn.dataset.pbAdvance);return;}
    const closeAdvanceBtn=target.closest('[data-pb-close-advance]');
    if(closeAdvanceBtn){event.preventDefault();closeAdvanceModal();return;}
    const confirmAdvanceBtn=target.closest('[data-pb-confirm-advance]');
    if(confirmAdvanceBtn){
      event.preventDefault();
      const [reportId,targetStatus]=confirmAdvanceBtn.dataset.pbConfirmAdvance.split('::');
      const report=reportById(reportId);
      let extra=null;
      if(targetStatus==='SIGNED'){
        const form=document.getElementById('pbSignOffForm');
        if(form&&!form.reportValidity()){return;}
        extra=form?{name:form.elements.name.value,qualification:form.elements.qualification.value}:null;
      }
      commitAdvance(report,targetStatus,extra);
      closeAdvanceModal();
      return;
    }
    const downloadBtn=target.closest('[data-pb-download]');
    if(downloadBtn){event.preventDefault();window.downloadPbReport(downloadBtn.dataset.pbDownload);return;}
    const reviseBtn=target.closest('[data-pb-revise]');
    if(reviseBtn){event.preventDefault();window.reviseReport(reviseBtn.dataset.pbRevise);return;}
  });
  document.addEventListener('submit',event=>{
    const form=event.target instanceof Element?event.target.closest('[data-pb-confirm-employee]'):null;
    if(!form)return;
    event.preventDefault();
    window.confirmPbEmployeeInfo(form.dataset.pbConfirmEmployee,form.elements.by.value,form.elements.role.value);
  });
  document.addEventListener('change',event=>{
    const remarkField=event.target instanceof Element?event.target.closest('[data-pb-checklist-remark]'):null;
    if(!remarkField)return;
    const [reportId,itemId]=remarkField.dataset.pbChecklistRemark.split('::');
    window.setPbChecklistRemark(reportId,itemId,remarkField.value);
  });

  /* ---------- Selbsttests ---------- */
  window.runPruefbefundWorkspaceTests=function(){
    ensure();
    const doorPowered=assetById('TOR-01'),doorManual=assetById('TOR-02'),kran=assetById('KRAN-01'),fhb=assetById('FHB-01'),stapler=assetById('STA-01');
    const r7=ensureReportShape({id:'TEST-7',version:1,assetId:'FHB-01',inspectionType:'ABNAHME_AMVO_7',date:viennaToday(),findings:[{id:'M-01',classification:'gering'}],checklist:{},continuedUse:{affectedFindingIds:[]}});
    const r8NoFindings=ensureReportShape({id:'TEST-8A',version:1,assetId:'BST-01',inspectionType:'WIEDERKEHREND_AMVO_8',date:viennaToday(),findings:[],checklist:{},continuedUse:{affectedFindingIds:[]}});
    const r8Findings=ensureReportShape({id:'TEST-8B',version:1,assetId:'BST-01',inspectionType:'WIEDERKEHREND_AMVO_8',date:viennaToday(),findings:[{id:'M-01',classification:'gering'}],checklist:{},continuedUse:{affectedFindingIds:['M-01'],conditions:'x',deadline:'2026-09-01'},result:'DEFECTS_USE_ALLOWED_6_3'});
    const due=computeDueDates('2026-01-10');
    const pdfModelManyFindings=onePagePdfModel(Object.assign(ensureReportShape({id:'TEST-MANY',assetId:'BST-01',inspectionType:'WIEDERKEHREND_AMVO_8',date:viennaToday(),checklist:{},continuedUse:{affectedFindingIds:[]}}),{findings:[1,2,3,4].map((n,i)=>({id:'M-0'+(i+1),description:'x',classification:'gering',measure:'x',deadline:'2026-09-01'}))}));
    const tests=[
      {name:'Fuhrpark deckt mehrere Anlagenfamilien ab',passed:new Set(assets().map(a=>a.family)).size>=5},
      {name:'Kraftbetriebenes Tor erhält § 7 und § 8 (Legal Applicability Engine)',passed:doorPowered&&legalProfile(doorPowered).amvo7==='YES'&&legalProfile(doorPowered).amvo8==='YES'},
      {name:'Manuelles Tor erhält keine automatische AM-VO-Pflicht',passed:doorManual&&legalProfile(doorManual).amvo7==='NO'&&legalProfile(doorManual).amvo8==='NO'},
      {name:'Kran erfordert differenzierte Prüfung nach Kranart (§ 7 = REVIEW)',passed:kran&&legalProfile(kran).amvo7==='REVIEW'},
      {name:'Stapler hat keine generelle Abnahmeprüfpflicht',passed:stapler&&legalProfile(stapler).amvo7==='NO'&&legalProfile(stapler).amvo8==='YES'},
      {name:'§ 6 Abs. 3 ist bei Abnahmeprüfung nicht wählbar (AC-04)',passed:resultAvailability(r7).DEFECTS_USE_ALLOWED_6_3.enabled===false},
      {name:'§ 6 Abs. 3 ist ohne Mängel nicht wählbar',passed:resultAvailability(r8NoFindings).DEFECTS_USE_ALLOWED_6_3.enabled===false},
      {name:'§ 6 Abs. 3 ohne bestätigte Arbeitnehmer-Information blockiert Final (nicht final grün)',passed:employeeInfoMissing(r8Findings)===true&&reportGate(r8Findings).finalGreen===false},
      {name:'Fälligkeit: geplanter Termin +12 Monate, spätester Termin ≤ 15 Monate und ≤ Jahresende Folgejahr (AC-12)',passed:due.planned==='2027-01-10'&&due.legalMax<='2027-04-10'&&due.legalMax<='2027-12-31'},
      {name:'OnePage-PDF-Modell begrenzt Mängel auf 3 + Anlagenverweis (AC-10)',passed:pdfModelManyFindings.sections.find(s=>s.title==='Mängel').rows.some(r=>/Anlage M-01/.test(r.details.join(' ')))},
      {name:'Anlagenspezifisches Feld erscheint nicht bei fachfremder Anlagenfamilie (AC-07)',passed:!ATTRIBUTE_SCHEMA.TOR_TUER.some(([key])=>key==='pruefast')&&ATTRIBUTE_SCHEMA.FAHRZEUGHEBEBUEHNE.some(([key])=>key==='pruefast')},
      {name:'Kopf- und Haupttext werden aus derselben Prüfart abgeleitet (kein Mischbefund möglich)',passed:reportHeaderTitle({inspectionType:'ABNAHME_AMVO_7'})!==reportHeaderTitle({inspectionType:'WIEDERKEHREND_AMVO_8'})&&reportMainText({inspectionType:'ABNAHME_AMVO_7',result:'NO_DEFECTS',date:viennaToday()}).includes('Abnahmeprüfung')},
      {name:'Rechtsregel wird versioniert nach Prüfdatum aufgelöst',passed:resolveLegalRule('AMVO-8','2024-01-01').version==='1.0'&&resolveLegalRule('AMVO-8','2026-03-01').version==='2.0'},
      {name:'Schreibende Aktionen sind berechtigungsgeschützt',passed:String(createReport).includes('requirePermission')&&String(window.setPbResult).includes('requirePermission')}
    ];
    return {passed:tests.every(t=>t.passed),tests};
  };
  ensure();
  const pbTests=window.runPruefbefundWorkspaceTests();
  window.__INGTEC_PRUEFBEFUND_TESTS__=pbTests;
  document.documentElement.dataset.pruefbefundTests=pbTests.passed?'passed':'failed';

  window.renderAll?.();
  if(location.hash==='#pruefbefund')setTimeout(()=>setActivePage?.('pruefbefund'),0);
  const params=new URL(location.href).searchParams;
  if(params.get('pruefbefund-test')==='1'){
    const pre=document.createElement('pre');
    pre.id='pruefbefundTestResults';
    pre.hidden=true;
    pre.textContent=JSON.stringify(pbTests);
    document.body.appendChild(pre);
  }
})();
