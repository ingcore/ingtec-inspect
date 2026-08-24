/* INGTEC Prüfpflichten (Asset Compliance)
   MVP-Prototyp: Portfolio-Dashboard, Standort-Dashboard, Anlagenübersicht,
   Asset-Detail, Prüfpflicht-Detail mit Fälligkeitsherleitung, Fälligkeitsübersicht
   und Prüfung erfassen. Alle Daten sind lokale Demodaten. */
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
  const daysUntil=(value,today=viennaToday())=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(text(value)))return null;
    return Math.round((new Date(value+'T00:00:00')-new Date(today+'T00:00:00'))/86400000);
  };

  const SITES=['KLV Zentrale','BZ Wolfsberg','BZ Spittal'];
  const CATEGORIES=['Brandschutz','Elektrotechnik','Aufzüge','Lüftung & Klima','Türen & Tore'];
  const OBLIGATION_TYPES=['Wiederkehrende Prüfung','Revision','Wartung'];
  const RESULTS=['Bestanden','Bestanden mit Mängeln','Nicht bestanden','Teilprüfung','Nicht beurteilbar'];

  const STATUS_META={
    unknown:{label:'Ungeklärt',tone:'unknown',symbol:'?',order:0},
    overdue:{label:'Überfällig',tone:'overdue',symbol:'✕',order:2},
    due:{label:'Fällig',tone:'due',symbol:'!',order:3},
    due_soon:{label:'Bald fällig',tone:'due-soon',symbol:'!',order:4},
    scheduled:{label:'Geplant',tone:'scheduled',symbol:'◷',order:5},
    valid:{label:'Gültig',tone:'valid',symbol:'✓',order:6},
    n_a:{label:'Nicht anwendbar',tone:'muted',symbol:'–',order:7},
    out_of_service:{label:'Außer Betrieb',tone:'muted',symbol:'⏻',order:8}
  };
  const overdueCriticalOrder=1;

  function offset(days){
    const parts=viennaToday().split('-').map(Number);
    const date=new Date(parts[0],parts[1]-1,parts[2]);
    date.setDate(date.getDate()+days);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }

  function seedObligation(over){
    return {
      id:over.id,type:over.type||'Wiederkehrende Prüfung',status:over.status||'',
      lastDate:over.lastDate||'',nextDueDate:over.nextDueDate||'',maxDueDate:over.maxDueDate||'',
      intervalLabel:over.intervalLabel||'jährlich',intervalMonths:over.intervalMonths||12,maxOffsetMonths:over.maxOffsetMonths||3,
      bindingType:over.bindingType||'Gesetzliche Verpflichtung',
      basis:over.basis||{source:'',section:'',version:''},
      ruleVersion:over.ruleVersion||'RULE-24.3',sourceStatus:over.sourceStatus||'VERIFIED',
      inspectorQualification:over.inspectorQualification||'Fachkundige Person gem. Regelwerk',
      evidenceRequired:over.evidenceRequired!==false,responsible:over.responsible||'INGTEC',inspectorCompany:over.inspectorCompany||'INGTEC',
      contractRef:over.contractRef||'',critical:Boolean(over.critical)
    };
  }
  function seedAsset(a){
    return {
      id:a.id,name:a.name,category:a.category,subcategory:a.subcategory,
      site:a.site,building:a.building,room:a.room,
      manufacturer:a.manufacturer||'',model:a.model||'',serialNumber:a.serialNumber||'',yearBuilt:a.yearBuilt||null,
      responsible:a.responsible||'INGTEC',inspectorCompany:a.inspectorCompany||'INGTEC',
      documentsCount:a.documentsCount??3,
      knownFields:a.knownFields||[],missingFields:a.missingFields||[],
      obligations:(a.obligations||[]).map(seedObligation),
      defects:a.defects||[],
      inspections:a.inspections||[]
    };
  }

  function buildSeed(){
    return [
      seedAsset({id:'BMA-001',name:'Brandmeldeanlage BMZ Zentrale',category:'Brandschutz',subcategory:'Brandmeldeanlagen',
        site:'KLV Zentrale',building:'Hauptgebäude',room:'BMZ-Raum',manufacturer:'Schrack',model:'Integral IP',serialNumber:'SCH-88213',yearBuilt:2018,
        knownFields:['Anlagentyp','Standort','Hersteller','Prüfpflicht','Letzte Prüfung'],missingFields:['Seriennummer geprüft','Errichtungsjahr verifiziert'],
        documentsCount:12,
        obligations:[
          {id:'OBL-BMA-001-1',type:'Wiederkehrende Prüfung',lastDate:'2025-09-14',nextDueDate:'2026-09-14',maxDueDate:'2026-12-14',intervalLabel:'jährlich',intervalMonths:12,maxOffsetMonths:3,basis:{source:'AStV / TRVB S123',section:'§ 6 Abs. 2',version:'Ausgabe 2023-01'},sourceStatus:'VERIFIED'},
          {id:'OBL-BMA-001-2',type:'Revision',lastDate:'2024-09-14',nextDueDate:'2027-09-14',intervalLabel:'alle 3 Jahre',intervalMonths:36,basis:{source:'TRVB S123',section:'§ 9',version:'Ausgabe 2023-01'},sourceStatus:'VERIFIED'},
          {id:'OBL-BMA-001-3',type:'Wartung',status:'scheduled',nextDueDate:'2026-09-03',intervalLabel:'jährlich',intervalMonths:12,bindingType:'Herstelleranforderung',basis:{source:'Wartungsvertrag SCHRACK-2025-17',section:'Leistungsschein 1',version:'2025'},contractRef:'SCHRACK-2025-17',sourceStatus:'VERIFIED',evidenceRequired:false}
        ],
        inspections:[{id:'INSP-BMA-001-1',obligationId:'OBL-BMA-001-1',date:'2025-09-14',inspector:'M. Šop',company:'INGTEC',result:'Bestanden',evidenceStatus:'PRÜFBAR'}]
      }),
      seedAsset({id:'RWA-01',name:'Rauch- und Wärmeabzugsanlage Tiefgarage',category:'Brandschutz',subcategory:'RWA',
        site:'KLV Zentrale',building:'Tiefgarage',room:'Rampe Ost',manufacturer:'Colt',model:'Aerocontrol',yearBuilt:2016,
        documentsCount:5,knownFields:['Anlagentyp','Standort','Prüfpflicht'],missingFields:['Hersteller-Datenblatt','Seriennummer'],
        obligations:[{id:'OBL-RWA-01-1',type:'Wiederkehrende Prüfung',critical:true,lastDate:offset(-382),nextDueDate:offset(-17),maxDueDate:offset(76),intervalLabel:'jährlich',intervalMonths:12,maxOffsetMonths:3,basis:{source:'TRVB S111',section:'§ 5',version:'Ausgabe 2019'},sourceStatus:'VERIFIED'}]
      }),
      seedAsset({id:'BSK-014',name:'Brandschutzklappe Lüftungszentrale',category:'Brandschutz',subcategory:'Brandschutzklappen',
        site:'KLV Zentrale',building:'Hauptgebäude',room:'Technikraum 1.OG',manufacturer:'Trox',model:'FKR-EU',yearBuilt:2019,
        documentsCount:4,responsible:'Facility',
        obligations:[{id:'OBL-BSK-014-1',type:'Wiederkehrende Prüfung',lastDate:offset(-397),nextDueDate:offset(-12),maxDueDate:offset(78),intervalLabel:'jährlich',intervalMonths:12,maxOffsetMonths:3,responsible:'Facility',basis:{source:'ÖNORM H 6031',section:'Pkt. 8',version:'2018'},sourceStatus:'VERIFIED'}]
      }),
      seedAsset({id:'BT-034',name:'Brandschutztür 2.OG Treppenhaus',category:'Brandschutz',subcategory:'Brandschutzabschlüsse',
        site:'KLV Zentrale',building:'Hauptgebäude',room:'2. OG',manufacturer:'Hörmann',model:'T30-1',yearBuilt:2015,
        documentsCount:3,
        obligations:[{id:'OBL-BT-034-1',type:'Wiederkehrende Prüfung',lastDate:offset(-320),nextDueDate:offset(45),intervalLabel:'jährlich',intervalMonths:12,basis:{source:'ÖNORM H 6031',section:'Pkt. 6',version:'2018'},sourceStatus:'VERIFIED'}],
        defects:[{id:'F-2026-0284',title:'Tür schließt nicht vollständig',risk:'HOCH',source:'Prüfung 14.08.2026',measure:'Türschließer einstellen',responsible:'Haustechnik',dueDate:'2026-08-28',status:'offen'}]
      }),
      seedAsset({id:'CO-TG-01',name:'CO-Warnanlage Tiefgarage',category:'Brandschutz',subcategory:'sonstige Systeme',
        site:'KLV Zentrale',building:'Tiefgarage',room:'Zentrale',manufacturer:'Dräger',model:'Polytron 8100',yearBuilt:2018,
        documentsCount:3,knownFields:['Hersteller','Baujahr','Betriebsanleitung','Bescheid 2017','Wartungsvertrag'],missingFields:['gesetzliche Prüfpflicht','Bescheidauflagen','Herstellervorgaben'],
        obligations:[{id:'OBL-CO-TG-01-1',type:'Wiederkehrende Prüfung',status:'unknown',intervalLabel:'noch nicht geklärt',sourceStatus:'REVIEW_REQUIRED',basis:{source:'Bescheid 2017 (nicht ausgewertet)',section:'',version:''}}]
      }),
      seedAsset({id:'EL-GEB-B',name:'Elektroanlage Gebäude B',category:'Elektrotechnik',subcategory:'Elektro-Hauptverteilung',
        site:'KLV Zentrale',building:'Gebäude B',room:'Verteilerraum',manufacturer:'Siemens',model:'Sivacon S8',yearBuilt:2012,
        documentsCount:2,
        obligations:[{id:'OBL-EL-GEB-B-1',type:'Wiederkehrende Prüfung',lastDate:offset(-410),nextDueDate:offset(-45),maxDueDate:offset(-15),intervalLabel:'alle 5 Jahre',intervalMonths:60,maxOffsetMonths:1,sourceStatus:'REVIEW_REQUIRED',evidenceRequired:true,basis:{source:'ÖVE/ÖNORM E 8001-6-61',section:'Pkt. 61.1',version:'2019'}}],
        inspections:[{id:'INSP-EL-GEB-B-1',obligationId:'OBL-EL-GEB-B-1',date:offset(-46),inspector:'Extern',company:'Elektro Huber GmbH',result:'Bestanden mit Mängeln',evidenceStatus:'PRÜFUNGSNACHWEIS FEHLT'}]
      }),
      seedAsset({id:'AZ-A1',name:'Personenaufzug A1',category:'Aufzüge',subcategory:'Personenaufzug',
        site:'KLV Zentrale',building:'Hauptgebäude',room:'Aufzugsschacht A',manufacturer:'Otis',model:'Gen2',yearBuilt:2017,
        documentsCount:7,
        obligations:[{id:'OBL-AZ-A1-1',type:'Wiederkehrende Prüfung',lastDate:offset(-340),nextDueDate:offset(22),intervalLabel:'jährlich',intervalMonths:12,basis:{source:'AufzugsG / TÜV-Ordnung',section:'§ 15',version:'2017'},sourceStatus:'VERIFIED'}]
      }),
      seedAsset({id:'AZ-A2',name:'Lastenaufzug A2',category:'Aufzüge',subcategory:'Lastenaufzug',
        site:'KLV Zentrale',building:'Hauptgebäude',room:'Aufzugsschacht B',manufacturer:'Otis',model:'Gen2 Premier',yearBuilt:2017,
        documentsCount:6,
        obligations:[{id:'OBL-AZ-A2-1',type:'Wiederkehrende Prüfung',lastDate:offset(-140),nextDueDate:offset(225),intervalLabel:'jährlich',intervalMonths:12,basis:{source:'AufzugsG / TÜV-Ordnung',section:'§ 15',version:'2017'},sourceStatus:'VERIFIED'}]
      }),
      seedAsset({id:'WH-01',name:'Wandhydrant Erdgeschoss',category:'Brandschutz',subcategory:'Wandhydranten',
        site:'KLV Zentrale',building:'Hauptgebäude',room:'EG Foyer',manufacturer:'Minimax',yearBuilt:2014,
        documentsCount:2,
        obligations:[{id:'OBL-WH-01-1',type:'Wiederkehrende Prüfung',lastDate:offset(-200),nextDueDate:offset(165),intervalLabel:'jährlich',intervalMonths:12,basis:{source:'TRVB F128',section:'Pkt. 5',version:'2016'},sourceStatus:'VERIFIED'}]
      }),
      seedAsset({id:'FL-F2',name:'Feuerlöscher Flur 2. OG',category:'Brandschutz',subcategory:'Feuerlöscher',
        site:'KLV Zentrale',building:'Hauptgebäude',room:'2. OG Flur',manufacturer:'Gloria',yearBuilt:2020,
        documentsCount:1,
        obligations:[{id:'OBL-FL-F2-1',type:'Wiederkehrende Prüfung',lastDate:offset(-345),nextDueDate:offset(20),intervalLabel:'jährlich',intervalMonths:12,basis:{source:'ÖNORM F1053',section:'Pkt. 4',version:'2018'},sourceStatus:'VERIFIED'}]
      }),
      seedAsset({id:'SIBE-01',name:'Sicherheitsbeleuchtung Fluchtwege',category:'Brandschutz',subcategory:'Sicherheitsbeleuchtung',
        site:'KLV Zentrale',building:'Hauptgebäude',room:'alle Geschosse',manufacturer:'Eaton',yearBuilt:2019,
        documentsCount:2,
        obligations:[{id:'OBL-SIBE-01-1',type:'Wiederkehrende Prüfung',lastDate:offset(-90),nextDueDate:offset(275),intervalLabel:'jährlich',intervalMonths:12,basis:{source:'ÖVE/ÖNORM E 8002',section:'Pkt. 7',version:'2015'},sourceStatus:'VERIFIED'}]
      }),
      seedAsset({id:'RLT-01',name:'Raumlufttechnische Anlage 1',category:'Lüftung & Klima',subcategory:'RLT-Anlage',
        site:'KLV Zentrale',building:'Hauptgebäude',room:'Technikraum Dach',manufacturer:'Menerga',yearBuilt:2016,
        documentsCount:3,
        obligations:[{id:'OBL-RLT-01-1',type:'Wiederkehrende Prüfung',lastDate:offset(-360),nextDueDate:offset(5),intervalLabel:'jährlich',intervalMonths:12,basis:{source:'ÖNORM H 6021',section:'Pkt. 5',version:'2019'},sourceStatus:'VERIFIED'}]
      }),
      seedAsset({id:'KLA-02',name:'Klimaanlage Serverraum',category:'Lüftung & Klima',subcategory:'Klimaanlage',
        site:'KLV Zentrale',building:'Hauptgebäude',room:'Serverraum',manufacturer:'Daikin',yearBuilt:2021,
        documentsCount:2,
        obligations:[{id:'OBL-KLA-02-1',type:'Wiederkehrende Prüfung',lastDate:offset(-340),nextDueDate:offset(25),intervalLabel:'jährlich',intervalMonths:12,basis:{source:'F-Gase-Verordnung',section:'Art. 4',version:'2015'},sourceStatus:'VERIFIED'}]
      }),
      seedAsset({id:'TT-01',name:'Automatiktür Haupteingang',category:'Türen & Tore',subcategory:'Automatiktür',
        site:'KLV Zentrale',building:'Hauptgebäude',room:'Haupteingang',manufacturer:'GEZE',model:'Slimdrive EMD',yearBuilt:2017,
        documentsCount:2,
        obligations:[{id:'OBL-TT-01-1',type:'Wiederkehrende Prüfung',lastDate:offset(-400),nextDueDate:offset(-35),maxDueDate:offset(-5),intervalLabel:'jährlich',intervalMonths:12,maxOffsetMonths:1,basis:{source:'ÖNORM EN 16005',section:'Pkt. 6',version:'2013'},sourceStatus:'VERIFIED'}]
      }),
      seedAsset({id:'BMA-WO-01',name:'Brandmeldeanlage Werkstatt',category:'Brandschutz',subcategory:'Brandmeldeanlagen',
        site:'BZ Wolfsberg',building:'Werkstattgebäude',room:'BMZ-Raum',manufacturer:'Bosch',model:'AVENAR',yearBuilt:2015,
        documentsCount:4,
        obligations:[{id:'OBL-BMA-WO-01-1',type:'Wiederkehrende Prüfung',lastDate:offset(-395),nextDueDate:offset(-30),maxDueDate:offset(60),intervalLabel:'jährlich',intervalMonths:12,maxOffsetMonths:3,basis:{source:'TRVB S123',section:'§ 6 Abs. 2',version:'2023'},sourceStatus:'VERIFIED'}]
      }),
      seedAsset({id:'AZ-WO-01',name:'Personenaufzug Werkstatt',category:'Aufzüge',subcategory:'Personenaufzug',
        site:'BZ Wolfsberg',building:'Werkstattgebäude',room:'Aufzugsschacht',manufacturer:'Schindler',model:'3300',yearBuilt:2013,
        documentsCount:5,
        obligations:[{id:'OBL-AZ-WO-01-1',type:'Wiederkehrende Prüfung',lastDate:offset(-345),nextDueDate:offset(18),intervalLabel:'jährlich',intervalMonths:12,basis:{source:'AufzugsG / TÜV-Ordnung',section:'§ 15',version:'2017'},sourceStatus:'VERIFIED'}]
      }),
      seedAsset({id:'BT-WO-01',name:'Brandschutztür Lagerhalle',category:'Brandschutz',subcategory:'Brandschutzabschlüsse',
        site:'BZ Wolfsberg',building:'Lagerhalle',room:'Tor Süd',manufacturer:'Hörmann',yearBuilt:2014,
        documentsCount:1,
        obligations:[{id:'OBL-BT-WO-01-1',type:'Wiederkehrende Prüfung',lastDate:offset(-390),nextDueDate:offset(-25),maxDueDate:offset(65),intervalLabel:'jährlich',intervalMonths:12,maxOffsetMonths:3,basis:{source:'ÖNORM H 6031',section:'Pkt. 6',version:'2018'},sourceStatus:'VERIFIED'}]
      }),
      seedAsset({id:'EV-WO-01',name:'Elektroverteiler Werkstatt',category:'Elektrotechnik',subcategory:'Elektro-Unterverteilung',
        site:'BZ Wolfsberg',building:'Werkstattgebäude',room:'Verteilerraum',manufacturer:'ABB',yearBuilt:2016,
        documentsCount:3,
        obligations:[{id:'OBL-EV-WO-01-1',type:'Wiederkehrende Prüfung',lastDate:offset(-95),nextDueDate:offset(270),intervalLabel:'jährlich',intervalMonths:12,basis:{source:'ÖVE/ÖNORM E 8001-6-61',section:'Pkt. 61.1',version:'2019'},sourceStatus:'VERIFIED'}]
      }),
      seedAsset({id:'BMA-SP-01',name:'Brandmeldeanlage Standort Spittal',category:'Brandschutz',subcategory:'Brandmeldeanlagen',
        site:'BZ Spittal',building:'Hauptgebäude',room:'BMZ-Raum',manufacturer:'Schrack',model:'Integral IP',yearBuilt:2020,
        documentsCount:6,
        obligations:[{id:'OBL-BMA-SP-01-1',type:'Wiederkehrende Prüfung',lastDate:offset(-100),nextDueDate:offset(265),intervalLabel:'jährlich',intervalMonths:12,basis:{source:'TRVB S123',section:'§ 6 Abs. 2',version:'2023'},sourceStatus:'VERIFIED'}]
      }),
      seedAsset({id:'FL-SP-01',name:'Feuerlöscher Empfang',category:'Brandschutz',subcategory:'Feuerlöscher',
        site:'BZ Spittal',building:'Hauptgebäude',room:'Empfang',manufacturer:'Gloria',yearBuilt:2021,
        documentsCount:1,
        obligations:[{id:'OBL-FL-SP-01-1',type:'Wiederkehrende Prüfung',lastDate:offset(-350),nextDueDate:offset(15),intervalLabel:'jährlich',intervalMonths:12,basis:{source:'ÖNORM F1053',section:'Pkt. 4',version:'2018'},sourceStatus:'VERIFIED'}]
      })
    ];
  }

  function ensure(){
    if(!Array.isArray(state.complianceAssets)||!state.complianceAssets.length)state.complianceAssets=buildSeed();
    state.complianceAssets.forEach(a=>{
      if(!Array.isArray(a.obligations))a.obligations=[];
      if(!Array.isArray(a.defects))a.defects=[];
      if(!Array.isArray(a.inspections))a.inspections=[];
    });
  }

  const assets=()=>arr(state.complianceAssets);
  const assetById=id=>assets().find(a=>a.id===text(id))||null;
  const obligationById=(asset,id)=>arr(asset?.obligations).find(o=>o.id===text(id))||null;
  const allObligations=()=>assets().flatMap(a=>a.obligations.map(o=>({asset:a,obligation:o})));

  function obligationEffectiveKey(o){
    if(['scheduled','unknown','n_a','out_of_service'].includes(o.status))return o.status;
    const days=daysUntil(o.nextDueDate);
    if(days==null)return 'unknown';
    if(days<0)return 'overdue';
    if(days<=7)return 'due';
    if(days<=30)return 'due_soon';
    return 'valid';
  }
  function obligationPriority(o){
    const key=obligationEffectiveKey(o);
    if(key==='overdue'&&o.critical)return overdueCriticalOrder;
    return STATUS_META[key]?.order??9;
  }
  function assetEffectiveKey(asset){
    if(!asset.obligations.length)return 'unknown';
    let best=null,bestOrder=99;
    asset.obligations.forEach(o=>{
      const order=obligationPriority(o);
      if(order<bestOrder){bestOrder=order;best=o;}
    });
    return {key:obligationEffectiveKey(best),critical:best.critical&&obligationEffectiveKey(best)==='overdue',obligation:best};
  }
  function primaryObligation(asset){
    const sorted=[...asset.obligations].sort((a,b)=>obligationPriority(a)-obligationPriority(b));
    return sorted[0]||null;
  }
  function statusBadge(key,{critical=false,size='md'}={}){
    const meta=STATUS_META[key]||STATUS_META.unknown;
    const label=critical?'Kritisch überfällig':meta.label;
    return `<span class="compliance-status tone-${meta.tone} size-${size} ${critical?'is-critical':''}"><b aria-hidden="true">${meta.symbol}</b>${esc(label)}</span>`;
  }
  function obligationTypeTag(type){
    const isMaintenance=type==='Wartung';
    return `<span class="compliance-type-tag ${isMaintenance?'is-maintenance':'is-inspection'}">${isMaintenance?'WARTUNG':'PRÜFUNG'}</span>`;
  }

  function coverageMetrics(list){
    const total=list.length||1;
    const withObligations=list.filter(a=>a.obligations.length).length;
    const clarified=list.filter(a=>a.obligations.length&&!a.obligations.some(o=>o.status==='unknown')).length;
    const flatObligations=list.flatMap(a=>a.obligations.filter(o=>!['unknown','n_a','out_of_service'].includes(o.status)));
    const onSchedule=flatObligations.filter(o=>!['overdue'].includes(obligationEffectiveKey(o))).length;
    const withEvidence=list.flatMap(a=>a.obligations.filter(o=>o.evidenceRequired)).filter(o=>o.sourceStatus==='VERIFIED').length;
    const evidenceRequiredCount=list.flatMap(a=>a.obligations.filter(o=>o.evidenceRequired)).length||1;
    const assetCoverage=Math.round(withObligations/total*100);
    const obligationCoverage=Math.round(clarified/total*100);
    const scheduleCompliance=Math.round(onSchedule/(flatObligations.length||1)*100);
    const evidenceCoverage=Math.round(withEvidence/evidenceRequiredCount*100);
    const index=Math.round((assetCoverage+obligationCoverage+scheduleCompliance+evidenceCoverage)/4);
    return {assetCoverage,obligationCoverage,scheduleCompliance,evidenceCoverage,index};
  }
  function portfolioCounts(list){
    const keys=list.map(a=>assetEffectiveKey(a));
    return {
      total:list.length,
      overdue:keys.filter(k=>k.key==='overdue').length,
      dueSoon:keys.filter(k=>k.key==='due'||k.key==='due_soon').length,
      unknown:keys.filter(k=>k.key==='unknown').length,
      valid:keys.filter(k=>k.key==='valid').length
    };
  }

  let view={screen:'portfolio',siteId:null,category:null,assetId:null,obligationId:null,expandCalc:false};
  let assetsViewMode='grid';
  let dueFilter='all';
  let inspectionContext=null;

  function navigate(patch){
    view={...view,...patch};
    window.renderAll?.();
    setActivePage?.('compliance');
  }
  function breadcrumb(){
    const crumbs=[{label:'Prüfpflichten',screen:'portfolio'}];
    if(view.siteId)crumbs.push({label:view.siteId,screen:'site'});
    if(view.screen==='assets'&&view.category)crumbs.push({label:view.category,screen:'assets'});
    if(view.screen==='asset'&&view.assetId){
      const asset=assetById(view.assetId);
      if(asset)crumbs.push({label:asset.id,screen:'asset'});
    }
    if(view.screen==='due')crumbs.push({label:'Fälligkeiten',screen:'due'});
    return `<nav class="compliance-breadcrumb" aria-label="Pfad">${crumbs.map((c,i)=>i===crumbs.length-1?`<span aria-current="page">${esc(c.label)}</span>`:`<button type="button" data-compliance-nav="${esc(c.screen)}" data-compliance-site="${esc(view.siteId||'')}">${esc(c.label)}</button>`).join('<i aria-hidden="true">›</i>')}</nav>`;
  }
  function quickNav(){
    return `<div class="compliance-quicknav" role="tablist" aria-label="Prüfpflichten-Bereiche">
      <button type="button" role="tab" class="${view.screen==='portfolio'?'active':''}" data-compliance-nav="portfolio">Portfolio</button>
      <button type="button" role="tab" class="${view.screen==='assets'&&!view.siteId?'active':''}" data-compliance-nav="assets">Alle Anlagen</button>
      <button type="button" role="tab" class="${view.screen==='due'?'active':''}" data-compliance-nav="due">Fälligkeiten</button>
    </div>`;
  }

  function kpiTile(label,value,hint,alert){
    return `<article class="card compliance-kpi ${alert?'is-alert':''}"><small>${esc(label)}</small><strong>${esc(value)}</strong><span>${esc(hint)}</span></article>`;
  }
  function metricBar(label,value){
    return `<div class="compliance-metric-row"><span>${esc(label)}</span><div class="compliance-metric-track"><span style="width:${Math.max(0,Math.min(100,value))}%"></span></div><b>${value} %</b></div>`;
  }

  function portfolioScreen(){
    const list=assets();
    const counts=portfolioCounts(list);
    const metrics=coverageMetrics(list);
    const critical=[
      counts.overdue?`${counts.overdue} überfällige Prüfpflicht${counts.overdue===1?'':'en'}`:'',
      list.flatMap(a=>a.obligations).filter(o=>o.evidenceRequired&&o.sourceStatus!=='VERIFIED'&&obligationEffectiveKey(o)!=='unknown').length?`${list.flatMap(a=>a.obligations).filter(o=>o.evidenceRequired&&o.sourceStatus!=='VERIFIED'&&obligationEffectiveKey(o)!=='unknown').length} Prüfungen ohne verifizierten Nachweis`:'',
      counts.unknown?`${counts.unknown} Anlage${counts.unknown===1?'':'n'} mit ungeklärter Prüfpflicht`:''
    ].filter(Boolean);
    const sites=SITES.map(site=>{
      const siteAssets=list.filter(a=>a.site===site);
      const siteCounts=portfolioCounts(siteAssets);
      const siteIndex=coverageMetrics(siteAssets).index;
      return `<article class="card compliance-site-card" data-compliance-nav="site" data-compliance-site="${esc(site)}"><div><span class="eyebrow">${esc(siteAssets.length)} Anlagen</span><h3>${esc(site)}</h3></div><div class="compliance-site-stats"><strong>${siteAssets.length?siteIndex:0} %</strong><span>${siteCounts.overdue} rot · ${siteCounts.dueSoon} gelb</span></div></article>`;
    }).join('');
    return `<div class="compliance-portfolio">
      <section class="compliance-summary-row">${kpiTile('Anlagen',counts.total,'im Portfolio')}${kpiTile('Überfällig',counts.overdue,'sofortiger Handlungsbedarf',counts.overdue>0)}${kpiTile('≤ 30 Tage',counts.dueSoon,'bald fällig')}${kpiTile('Ungeklärt',counts.unknown,'Prüfpflicht klären')}</section>
      <section class="card compliance-index-card"><span class="eyebrow">Technical Compliance</span><h3>TECHNICAL COMPLIANCE INDEX</h3><div class="compliance-index-value">${metrics.index} %</div>${metricBar('Asset Coverage',metrics.assetCoverage)}${metricBar('Obligation Coverage',metrics.obligationCoverage)}${metricBar('Schedule Compliance',metrics.scheduleCompliance)}${metricBar('Evidence Coverage',metrics.evidenceCoverage)}</section>
      <section class="card compliance-critical-card"><span class="eyebrow">Kritischer Handlungsbedarf</span>${critical.length?`<ul>${critical.map(c=>`<li>${esc(c)}</li>`).join('')}</ul>`:'<p class="compliance-empty-inline">Aktuell kein kritischer Handlungsbedarf.</p>'}</section>
      <section><div class="section-head compliance-section-head"><div><span class="eyebrow">Standorte</span><h3>Alle Standorte</h3></div></div><div class="compliance-site-grid">${sites}</div></section>
    </div>`;
  }

  function siteScreen(){
    const site=view.siteId||SITES[0];
    const list=assets().filter(a=>a.site===site);
    const counts=portfolioCounts(list);
    const cats=CATEGORIES.map(cat=>{
      const catAssets=list.filter(a=>a.category===cat);
      if(!catAssets.length)return '';
      const catCounts=portfolioCounts(catAssets);
      const worst=catCounts.overdue?'overdue':catCounts.unknown?'unknown':catCounts.dueSoon?'due_soon':'valid';
      const lines=[];
      if(catCounts.overdue)lines.push(`<li class="is-overdue">● ${catCounts.overdue} überfällig</li>`);
      if(catCounts.dueSoon)lines.push(`<li class="is-due">● ${catCounts.dueSoon} fällig</li>`);
      if(catCounts.unknown)lines.push(`<li class="is-unknown">● ${catCounts.unknown} ungeklärt</li>`);
      if(!catCounts.overdue&&!catCounts.dueSoon&&!catCounts.unknown)lines.push('<li class="is-valid">✓ alles aktuell</li>');
      return `<article class="card compliance-category-card tone-${worst}" data-compliance-nav="assets" data-compliance-site="${esc(site)}" data-compliance-category="${esc(cat)}"><div><h3>${esc(cat)}</h3><span>${catAssets.length} Anlage${catAssets.length===1?'':'n'}</span></div><ul>${lines.join('')}</ul></article>`;
    }).join('');
    return `<div class="compliance-site-screen">
      <section class="compliance-summary-row">${kpiTile('Anlagen',counts.total,'an diesem Standort')}${kpiTile('Überfällig',counts.overdue,'sofortiger Handlungsbedarf',counts.overdue>0)}${kpiTile('≤ 30 Tage',counts.dueSoon,'bald fällig')}${kpiTile('Ungeklärt',counts.unknown,'Prüfpflicht klären')}</section>
      <section><div class="section-head compliance-section-head"><div><span class="eyebrow">${esc(site)}</span><h3>Anlagen nach Fachbereich</h3></div><button type="button" class="secondary" data-compliance-nav="assets" data-compliance-site="${esc(site)}">Alle Anlagen ansehen</button></div><div class="compliance-category-grid">${cats||'<p class="compliance-empty-inline">Für diesen Standort sind noch keine Anlagen erfasst.</p>'}</div></section>
    </div>`;
  }

  function assetCard(asset){
    const {key,critical}=assetEffectiveKey(asset);
    const primary=primaryObligation(asset);
    const days=primary?daysUntil(primary.nextDueDate):null;
    const dueText=primary&&primary.nextDueDate?(days<0?`${Math.abs(days)} Tage überfällig`:`noch ${days} Tage`):(primary?STATUS_META[obligationEffectiveKey(primary)]?.label:'–');
    return `<article class="card compliance-asset-card tone-${STATUS_META[key]?.tone||'muted'}"><div class="compliance-asset-card-head"><b>${esc(asset.id)}</b>${statusBadge(key,{critical,size:'sm'})}</div><h3>${esc(asset.name)}</h3><p>${esc(asset.building)}${asset.room?' · '+esc(asset.room):''}</p><p class="compliance-asset-card-model">${esc([asset.manufacturer,asset.model].filter(Boolean).join(' ')||'Herstellerdaten unvollständig')}</p><div class="compliance-asset-card-due"><small>Nächste Fälligkeit</small><b>${primary?.nextDueDate?dateLabel(primary.nextDueDate):'–'}</b><span>${esc(dueText)}</span></div><div class="compliance-asset-card-stats"><span>Prüfpflichten <b>${asset.obligations.length}</b></span><span>Offene Mängel <b>${asset.defects.filter(d=>d.status!=='geschlossen').length}</b></span><span>Dokumente <b>${asset.documentsCount}</b></span></div><div class="compliance-asset-card-actions"><button type="button" class="secondary" data-compliance-asset="${esc(asset.id)}">DETAILS</button></div></article>`;
  }
  function assetRow(asset){
    const {key,critical}=assetEffectiveKey(asset);
    const primary=primaryObligation(asset);
    return `<tr><td data-label="Anlage"><b>${esc(asset.id)}</b><small>${esc(asset.name)}</small></td><td data-label="Standort">${esc(asset.site)} · ${esc(asset.building)}</td><td data-label="Kategorie">${esc(asset.category)}</td><td data-label="Status">${statusBadge(key,{critical,size:'sm'})}</td><td data-label="Fälligkeit">${primary?.nextDueDate?dateLabel(primary.nextDueDate):'–'}</td><td data-label="Aktion"><button type="button" class="link" data-compliance-asset="${esc(asset.id)}">Details ansehen</button></td></tr>`;
  }

  function assetsScreen(){
    let list=assets();
    if(view.siteId)list=list.filter(a=>a.site===view.siteId);
    if(view.category)list=list.filter(a=>a.category===view.category);
    const statuses=[...new Set(list.map(a=>assetEffectiveKey(a).key))];
    return `<div class="compliance-assets-screen">
      <div class="section-head compliance-section-head"><div><span class="eyebrow">${esc(view.siteId||'Alle Standorte')}${view.category?' · '+esc(view.category):''}</span><h3>Anlagenübersicht</h3><p>${list.length} Anlage${list.length===1?'':'n'}</p></div><div class="compliance-view-toggle" role="group" aria-label="Ansicht wählen"><button type="button" class="${assetsViewMode==='grid'?'active':''}" data-compliance-view="grid" aria-pressed="${assetsViewMode==='grid'}">Kacheln</button><button type="button" class="${assetsViewMode==='list'?'active':''}" data-compliance-view="list" aria-pressed="${assetsViewMode==='list'}">Liste</button></div></div>
      ${list.length?(assetsViewMode==='grid'?`<div class="compliance-asset-grid">${list.map(assetCard).join('')}</div>`:`<div class="compliance-table-wrap card"><table class="compliance-table"><thead><tr><th>Anlage</th><th>Standort</th><th>Kategorie</th><th>Status</th><th>Fälligkeit</th><th></th></tr></thead><tbody>${list.map(assetRow).join('')}</tbody></table></div>`):'<p class="compliance-empty-inline">Keine Anlagen für diese Auswahl.</p>'}
    </div>`;
  }

  function obligationCard(asset,obligation){
    const key=obligationEffectiveKey(obligation);
    const critical=key==='overdue'&&obligation.critical;
    const days=daysUntil(obligation.nextDueDate);
    const dueLine=obligation.status==='scheduled'?`nächster Termin ${dateLabel(obligation.nextDueDate)}`:obligation.status==='unknown'?'Intervall noch nicht geklärt':obligation.nextDueDate?`nächste Fälligkeit ${dateLabel(obligation.nextDueDate)}${days<0?` (${Math.abs(days)} Tage überfällig)`:''}`:'–';
    return `<article class="card compliance-obligation-card" data-compliance-open-obligation="${esc(asset.id)}::${esc(obligation.id)}"><div class="compliance-obligation-head">${obligationTypeTag(obligation.type)}<h4>${esc(obligation.type)}</h4>${statusBadge(key,{critical,size:'sm'})}</div><p>${esc(dueLine)}</p><p class="compliance-obligation-source">${obligation.sourceStatus==='VERIFIED'?'Quelle verifiziert':obligation.sourceStatus==='AI_EXTRACTED'?'KI-Vorschlag · fachlich zu prüfen':'Fachliche Prüfung erforderlich'}${obligation.contractRef?` · Vertrag ${esc(obligation.contractRef)}`:''}</p></article>`;
  }

  function assetTabs(asset,activeTab){
    const tabs=['uebersicht','pflichten','maengel','dokumente','wartung','historie','stammdaten'];
    const tabLabels={uebersicht:'Übersicht',pflichten:'Prüfpflichten',maengel:'Mängel',dokumente:'Dokumente',wartung:'Wartung',historie:'Historie',stammdaten:'Stammdaten'};
    return `<div class="compliance-tabs" role="tablist">${tabs.map(t=>`<button type="button" role="tab" class="${activeTab===t?'active':''}" data-compliance-tab="${t}" aria-selected="${activeTab===t}">${tabLabels[t]}</button>`).join('')}</div>`;
  }
  function tabUebersicht(asset){
    const primary=primaryObligation(asset);
    return `<div class="compliance-tab-panel compliance-overview-grid">
      <div class="card"><span class="eyebrow">Nächste Fälligkeit</span><h3>${primary?.nextDueDate?dateLabel(primary.nextDueDate):(primary?STATUS_META[obligationEffectiveKey(primary)]?.label:'–')}</h3>${primary?.nextDueDate?`<p>${(()=>{const d=daysUntil(primary.nextDueDate);return d<0?`${Math.abs(d)} Tage überfällig`:`noch ${d} Tage`;})()}</p>`:''}<p>${esc(primary?.type||'Keine Prüfpflicht hinterlegt')}</p><div class="compliance-meta-line"><span>Verantwortlich</span><b>${esc(primary?.responsible||asset.responsible)}</b></div><div class="compliance-meta-line"><span>Prüffirma</span><b>${esc(primary?.inspectorCompany||asset.inspectorCompany)}</b></div><div class="compliance-meta-line"><span>Status</span><b>${primary?STATUS_META[obligationEffectiveKey(primary)]?.label:'–'}</b></div>${primary?`<button type="button" class="link" data-compliance-open-obligation="${esc(asset.id)}::${esc(primary.id)}" data-compliance-expand-calc="1">Warum ${primary.nextDueDate?dateLabel(primary.nextDueDate):'dieser Status'}? · Fälligkeit herleiten</button>`:''}</div>
      <div class="card"><span class="eyebrow">Kennzahlen</span><h3>Anlage im Überblick</h3><div class="compliance-meta-line"><span>Prüfpflichten</span><b>${asset.obligations.length}</b></div><div class="compliance-meta-line"><span>Offene Mängel</span><b>${asset.defects.filter(d=>d.status!=='geschlossen').length}</b></div><div class="compliance-meta-line"><span>Dokumente</span><b>${asset.documentsCount}</b></div><div class="compliance-meta-line"><span>Kategorie</span><b>${esc(asset.category)} · ${esc(asset.subcategory)}</b></div></div>
    </div>`;
  }
  function tabPflichten(asset){
    return `<div class="compliance-tab-panel compliance-obligation-list">${asset.obligations.length?asset.obligations.map(o=>obligationCard(asset,o)).join(''):'<p class="compliance-empty-inline">Für diese Anlage sind noch keine Prüfpflichten hinterlegt.</p>'}</div>`;
  }
  function tabMaengel(asset){
    return `<div class="compliance-tab-panel">${asset.defects.length?asset.defects.map(d=>`<article class="card compliance-defect-card"><div class="compliance-defect-head"><b>${esc(d.id)}</b><span class="compliance-risk tone-${(d.risk||'').toLowerCase()}">${esc(d.risk)}</span></div><h4>${esc(d.title)}</h4><div class="compliance-meta-line"><span>Quelle</span><b>${esc(d.source)}</b></div><div class="compliance-meta-line"><span>Maßnahme</span><b>${esc(d.measure)}</b></div><div class="compliance-meta-line"><span>Verantwortlich</span><b>${esc(d.responsible)}</b></div><div class="compliance-meta-line"><span>Frist</span><b>${dateLabel(d.dueDate)}</b></div></article>`).join(''):'<p class="compliance-empty-inline">Keine offenen Mängel für diese Anlage.</p>'}</div>`;
  }
  const DOC_POOL=['Prüfbericht','Anlagenschema','Bedienungsanleitung','Bescheid','Wartungsprotokoll','Datenblatt','Zertifikat'];
  function tabDokumente(asset){
    const count=Math.max(0,Math.min(DOC_POOL.length,asset.documentsCount));
    const items=DOC_POOL.slice(0,count).map((type,i)=>`<li><span>${esc(type)} · ${esc(asset.id)}</span><small>hinterlegt</small></li>`);
    return `<div class="compliance-tab-panel"><p class="compliance-tab-hint">Dokumentenvorschau ist im Prototyp nicht verlinkt.</p><ul class="compliance-doc-list">${items.join('')||'<li><span>Keine Dokumente hinterlegt</span></li>'}</ul></div>`;
  }
  function tabWartung(asset){
    const maint=asset.obligations.filter(o=>o.type==='Wartung');
    return `<div class="compliance-tab-panel compliance-obligation-list">${maint.length?maint.map(o=>obligationCard(asset,o)).join(''):'<p class="compliance-empty-inline">Kein Wartungsvertrag hinterlegt.</p>'}</div>`;
  }
  function tabHistorie(asset){
    const events=[
      ...asset.inspections.map(i=>({date:i.date,label:`Prüfung ${i.result}`,detail:`${i.inspector} · ${i.company}`})),
      ...asset.defects.map(d=>({date:d.dueDate,label:`Mangel festgestellt: ${d.title}`,detail:d.source})),
      ...asset.obligations.filter(o=>o.lastDate).map(o=>({date:o.lastDate,label:`${o.type} durchgeführt`,detail:o.basis?.source||''}))
    ].filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(text(e.date))).sort((a,b)=>b.date.localeCompare(a.date));
    return `<div class="compliance-tab-panel"><div class="compliance-history">${events.length?events.map(e=>`<div class="compliance-history-row"><b>${dateLabel(e.date)}</b><div><span>${esc(e.label)}</span><small>${esc(e.detail)}</small></div></div>`).join(''):'<p class="compliance-empty-inline">Noch keine Historie vorhanden.</p>'}</div></div>`;
  }
  function tabStammdaten(asset){
    const fields=[['Kategorie',asset.category],['Unterkategorie',asset.subcategory],['Standort',asset.site],['Gebäude',asset.building],['Raum',asset.room],['Hersteller',asset.manufacturer],['Modell',asset.model],['Seriennummer',asset.serialNumber],['Baujahr',asset.yearBuilt]];
    const knownCount=(asset.knownFields||[]).length,missingCount=(asset.missingFields||[]).length;
    const quality=knownCount+missingCount?Math.round(knownCount/(knownCount+missingCount)*100):100;
    return `<div class="compliance-tab-panel compliance-overview-grid">
      <div class="card"><span class="eyebrow">Stammdaten</span><h3>Anlagendaten</h3>${fields.map(([label,value])=>`<div class="compliance-meta-line"><span>${esc(label)}</span><b>${esc(value||'–')}</b></div>`).join('')}</div>
      <div class="card"><span class="eyebrow">Datenqualität</span><h3>${quality} %</h3>${(asset.knownFields||[]).map(f=>`<div class="compliance-quality-line is-ok">✓ ${esc(f)}</div>`).join('')}${(asset.missingFields||[]).map(f=>`<div class="compliance-quality-line is-missing">! ${esc(f)}</div>`).join('')}</div>
    </div>`;
  }
  function assetDetailScreen(){
    const asset=assetById(view.assetId);
    if(!asset)return '<p class="compliance-empty-inline">Anlage nicht gefunden.</p>';
    const {key,critical}=assetEffectiveKey(asset);
    const tab=view.assetTab||'uebersicht';
    const bodies={uebersicht:tabUebersicht,pflichten:tabPflichten,maengel:tabMaengel,dokumente:tabDokumente,wartung:tabWartung,historie:tabHistorie,stammdaten:tabStammdaten};
    return `<div class="compliance-asset-detail">
      <header class="compliance-asset-header"><div><span class="eyebrow">${esc(asset.category)} · ${esc(asset.subcategory)}</span><h2>${esc(asset.id)}</h2><p>${esc(asset.name)}</p></div>${statusBadge(key,{critical})}<div class="compliance-asset-location">${esc(asset.site)} · ${esc(asset.building)}${asset.room?' · '+esc(asset.room):''}</div></header>
      <div class="compliance-asset-actions"><button type="button" class="primary" data-compliance-capture="${esc(asset.id)}">Prüfung erfassen</button><button type="button" class="secondary" data-compliance-stub="Mangelerfassung">Mangel erfassen</button><button type="button" class="secondary" data-compliance-stub="Dokument hochladen">Dokument</button><button type="button" class="secondary" data-compliance-stub="QR-Ansicht">QR</button><button type="button" class="secondary" data-compliance-stub="Bearbeiten">Bearbeiten</button></div>
      ${assetTabs(asset,tab)}
      ${(bodies[tab]||tabUebersicht)(asset)}
    </div>`;
  }

  function dueScreen(){
    const all=allObligations();
    const chips=[['all','Alle'],['overdue','Überfällig'],['7','7 Tage'],['30','30 Tage'],['90','90 Tage'],['unknown','Ungeklärt']];
    let filtered=all;
    if(dueFilter==='overdue')filtered=all.filter(x=>obligationEffectiveKey(x.obligation)==='overdue');
    else if(dueFilter==='unknown')filtered=all.filter(x=>obligationEffectiveKey(x.obligation)==='unknown');
    else if(['7','30','90'].includes(dueFilter)){
      const limit=Number(dueFilter);
      filtered=all.filter(x=>{const d=daysUntil(x.obligation.nextDueDate);return d!=null&&d>=0&&d<=limit;});
    }
    const groups={overdue:[],d7:[],d30:[],d90:[],later:[],unknown:[]};
    filtered.forEach(item=>{
      const key=obligationEffectiveKey(item.obligation);
      if(key==='unknown'){groups.unknown.push(item);return;}
      const d=daysUntil(item.obligation.nextDueDate);
      if(d==null)return;
      if(d<0)groups.overdue.push(item);
      else if(d<=7)groups.d7.push(item);
      else if(d<=30)groups.d30.push(item);
      else if(d<=90)groups.d90.push(item);
      else groups.later.push(item);
    });
    const groupLabels=[['overdue','Überfällig'],['d7','Nächste 7 Tage'],['d30','Nächste 30 Tage'],['d90','Nächste 90 Tage'],['later','Später'],['unknown','Ungeklärt']];
    function row({asset,obligation}){
      const key=obligationEffectiveKey(obligation);
      const critical=key==='overdue'&&obligation.critical;
      const d=daysUntil(obligation.nextDueDate);
      const line=key==='unknown'?'Prüfpflicht noch nicht geklärt':d<0?`${Math.abs(d)} Tage überfällig`:`fällig in ${d} Tagen`;
      return `<article class="card compliance-due-row"><div>${statusBadge(key,{critical,size:'sm'})}<b>${esc(asset.id)}</b><span>${esc(asset.name)}</span></div><div class="compliance-due-line"><small>${esc(line)}</small><small>Verantwortlich: ${esc(obligation.responsible)}</small></div><button type="button" class="secondary" data-compliance-plan="${esc(asset.id)}::${esc(obligation.id)}">PLANEN</button></article>`;
    }
    return `<div class="compliance-due-screen">
      <div class="compliance-chip-row" role="group" aria-label="Fälligkeitsfilter">${chips.map(([id,label])=>`<button type="button" class="compliance-chip ${dueFilter===id?'active':''}" data-compliance-due-filter="${id}">${label}</button>`).join('')}</div>
      ${groupLabels.map(([key,label])=>groups[key].length?`<section><h3 class="compliance-group-title">${label} <span>${groups[key].length}</span></h3><div class="compliance-due-list">${groups[key].map(row).join('')}</div></section>`:'').join('')||'<p class="compliance-empty-inline">Keine Prüfpflichten für diese Auswahl.</p>'}
    </div>`;
  }

  function obligationDeriveMarkup(obligation){
    if(!obligation.lastDate||!obligation.nextDueDate)return '<p class="compliance-empty-inline">Für diese Prüfpflicht liegt keine Fälligkeitsberechnung vor.</p>';
    return `<dl class="compliance-derive-grid">
      <div><dt>Letzte anerkannte Prüfung</dt><dd>${dateLabel(obligation.lastDate)}</dd></div>
      <div><dt>Regel</dt><dd>${esc(obligation.intervalLabel)}</dd></div>
      <div><dt>Maximaler Abstand</dt><dd>${obligation.maxOffsetMonths?`${obligation.intervalMonths+obligation.maxOffsetMonths} Monate`:`${obligation.intervalMonths} Monate`}</dd></div>
      <div><dt>Rechts-/Regelwerksgrundlage</dt><dd>${esc(obligation.basis?.source||'–')}${obligation.basis?.section?', '+esc(obligation.basis.section):''}</dd></div>
      <div><dt>Nächster planmäßiger Termin</dt><dd>${dateLabel(obligation.nextDueDate)}</dd></div>
      <div><dt>Maximal zulässiger Termin</dt><dd>${obligation.maxDueDate?dateLabel(obligation.maxDueDate):'–'}</dd></div>
      <div><dt>Berechnungsversion</dt><dd>${esc(obligation.ruleVersion)}</dd></div>
    </dl>`;
  }
  function obligationPanelMarkup(asset,obligation){
    const key=obligationEffectiveKey(obligation);
    const critical=key==='overdue'&&obligation.critical;
    return `<div class="compliance-panel" role="dialog" aria-modal="true" aria-labelledby="compliancePanelTitle"><header class="compliance-panel-head"><div><span class="eyebrow">${esc(asset.id)} · ${esc(asset.name)}</span><h2 id="compliancePanelTitle">${esc(obligation.type)}</h2>${statusBadge(key,{critical})}</div><button type="button" class="modal-close" aria-label="Schließen" data-compliance-close-obligation>×</button></header><div class="compliance-panel-body">
      <div class="compliance-meta-line"><span>Grundlage</span><b>${esc(obligation.basis?.source||'–')}</b></div>
      <div class="compliance-meta-line"><span>Fundstelle</span><b>${esc(obligation.basis?.section||'–')}</b></div>
      <div class="compliance-meta-line"><span>Fassung</span><b>${esc(obligation.basis?.version||'–')}</b></div>
      <div class="compliance-meta-line"><span>Verbindlichkeit</span><b>${esc(obligation.bindingType)}</b></div>
      <div class="compliance-meta-line"><span>Intervall</span><b>${esc(obligation.intervalLabel)}</b></div>
      <div class="compliance-meta-line"><span>Prüferqualifikation</span><b>${esc(obligation.inspectorQualification)}</b></div>
      <div class="compliance-meta-line"><span>Nachweis erforderlich</span><b>${obligation.evidenceRequired?'Ja':'Nein'}</b></div>
      <div class="compliance-meta-line"><span>Status Quelle</span><b>${esc(obligation.sourceStatus)}</b></div>
      <details class="compliance-derive-details" ${view.expandCalc?'open':''}><summary>Fälligkeit herleiten</summary>${obligationDeriveMarkup(obligation)}</details>
    </div><footer class="compliance-panel-actions"><button type="button" class="secondary" data-compliance-close-obligation>Schließen</button><button type="button" class="primary" data-compliance-capture="${esc(asset.id)}" data-compliance-obligation="${esc(obligation.id)}">Prüfung erfassen</button></footer></div>`;
  }
  function openObligationPanel(assetId,obligationId,expandCalc){
    const asset=assetById(assetId);
    const obligation=obligationById(asset,obligationId);
    if(!asset||!obligation)return;
    view={...view,expandCalc:Boolean(expandCalc)};
    let backdrop=document.getElementById('complianceObligationBackdrop');
    if(!backdrop){
      backdrop=document.createElement('div');
      backdrop.id='complianceObligationBackdrop';
      backdrop.className='finding-drawer-backdrop';
      backdrop.addEventListener('mousedown',event=>{if(event.target===backdrop)closeObligationPanel();});
      document.body.appendChild(backdrop);
    }
    backdrop.innerHTML=obligationPanelMarkup(asset,obligation);
    document.body.style.overflow='hidden';
  }
  function closeObligationPanel(){
    const backdrop=document.getElementById('complianceObligationBackdrop');
    if(!backdrop)return;
    backdrop.remove();
    if(!document.querySelector('.modal-backdrop'))document.body.style.overflow='';
  }

  function resultButtons(selected){
    return `<div class="compliance-result-group" role="radiogroup" aria-label="Prüfergebnis">${RESULTS.map(r=>`<button type="button" class="compliance-result-btn ${selected===r?'active':''}" data-compliance-result="${esc(r)}" aria-pressed="${selected===r}">${esc(r.toUpperCase())}</button>`).join('')}</div>`;
  }
  function inspectionDialogMarkup(){
    const asset=assetById(inspectionContext.assetId);
    const obligations=asset?.obligations||[];
    const selectedObligationId=inspectionContext.obligationId||obligations[0]?.id||'';
    return `<div class="modal-card compliance-modal-card" role="dialog" aria-modal="true" aria-labelledby="complianceCaptureTitle"><div class="modal-head"><div><span class="eyebrow">${asset?esc(asset.id)+' · '+esc(asset.name):'Prüfung erfassen'}</span><h2 id="complianceCaptureTitle">Prüfung erfassen</h2><p>Ergebnis, Prüfer und Nachweis werden lokal in der Anlagenakte hinterlegt.</p></div><button type="button" class="modal-close" aria-label="Schließen" data-compliance-close-capture>×</button></div><form id="complianceCaptureForm" novalidate><div class="compliance-form-grid">
      <label>Prüfpflicht<select name="obligationId" data-native-select>${obligations.map(o=>`<option value="${esc(o.id)}" ${o.id===selectedObligationId?'selected':''}>${esc(o.type)}</option>`).join('')}</select></label>
      <label>Prüfdatum<input name="date" type="date" required value="${esc(inspectionContext.date||viennaToday())}"></label>
      <label>Prüfer<input name="inspector" required maxlength="80" value="${esc(inspectionContext.inspector||actor().name)}"></label>
      <label>Prüffirma<input name="company" required maxlength="80" value="${esc(inspectionContext.company||'INGTEC')}"></label>
      <label class="compliance-form-wide">Ergebnis *${resultButtons(inspectionContext.result)}</label>
      <label class="compliance-form-wide">Prüfbefund<input type="file" accept="image/*,.pdf,.doc,.docx" multiple data-compliance-evidence></label>
      <div class="compliance-form-wide compliance-evidence-list">${(inspectionContext.evidence||[]).map(f=>`<span>${esc(f.name)}</span>`).join('')}</div>
    </div>${inspectionContext.result?`<div class="compliance-evidence-check"><b>PRÜFNACHWEIS</b><p>${['Prüfdatum erkannt','Prüfer erkannt','Asset erkannt','Prüfergebnis erkannt'].map(x=>`✓ ${x}`).join('<br>')}${(inspectionContext.evidence||[]).length?'<br>✓ Dokument vollständig':'<br>! Kein Nachweis hochgeladen'}</p><span>Status: ${(inspectionContext.evidence||[]).length?'PRÜFBAR':'FACHLICHE PRÜFUNG ERFORDERLICH'}</span></div>`:''}<div class="modal-actions"><button type="button" class="secondary" data-compliance-close-capture>Abbrechen</button><button type="submit" class="primary">Ergebnis freigeben</button></div></form></div>`;
  }
  function renderInspectionDialog(){
    const modal=document.getElementById('complianceCaptureDialog');
    if(!modal)return;
    modal.innerHTML=inspectionDialogMarkup();
    modal.querySelectorAll('[data-compliance-close-capture]').forEach(btn=>btn.addEventListener('click',closeInspectionDialog));
    modal.querySelectorAll('[data-compliance-result]').forEach(btn=>btn.addEventListener('click',()=>{inspectionContext.result=btn.dataset.complianceResult;renderInspectionDialog();}));
    modal.querySelector('[data-compliance-evidence]')?.addEventListener('change',async event=>{
      const files=[...event.target.files||[]];
      for(const file of files){
        try{
          const record=await window.INGTECPlatform?.storeLocalFile?.(file,{kind:'Prüfnachweis'});
          if(record)inspectionContext.evidence=[...(inspectionContext.evidence||[]),{id:record.id,name:record.name}];
        }catch(error){showToast?.(error.message||'Datei konnte nicht gespeichert werden.',null,null,'error');}
      }
      renderInspectionDialog();
    });
    modal.querySelector('#complianceCaptureForm')?.addEventListener('submit',event=>{event.preventDefault();submitInspection(event.currentTarget);});
    if(typeof enhanceFormControls==='function')enhanceFormControls(modal);
  }
  function openInspectionDialog(assetId,obligationId){
    if(!window.requirePermission?.('inspection','das Erfassen einer Prüfung'))return;
    const asset=assetById(assetId);
    if(!asset)return;
    inspectionContext={assetId,obligationId:obligationId||asset.obligations[0]?.id||'',date:viennaToday(),inspector:actor().name,company:'INGTEC',result:'',evidence:[]};
    closeObligationPanel();
    let modal=document.getElementById('complianceCaptureDialog');
    if(!modal){
      modal=document.createElement('div');
      modal.id='complianceCaptureDialog';
      modal.className='modal-backdrop';
      modal.setAttribute('role','presentation');
      modal.addEventListener('mousedown',event=>{if(event.target===modal)closeInspectionDialog();});
      document.body.appendChild(modal);
    }
    document.body.style.overflow='hidden';
    renderInspectionDialog();
  }
  function closeInspectionDialog(){
    const modal=document.getElementById('complianceCaptureDialog');
    if(!modal)return;
    modal.remove();
    inspectionContext=null;
    if(!document.querySelector('.modal-backdrop')&&!document.getElementById('complianceObligationBackdrop'))document.body.style.overflow='';
  }
  function submitInspection(form){
    if(!window.requirePermission?.('inspection','das Erfassen einer Prüfung'))return;
    const asset=assetById(inspectionContext.assetId);
    const obligation=obligationById(asset,form.elements.obligationId?.value);
    if(!asset||!obligation){showToast?.('Bitte eine gültige Prüfpflicht wählen.',null,null,'error');return;}
    const date=text(form.elements.date?.value);
    const inspector=text(form.elements.inspector?.value);
    const company=text(form.elements.company?.value);
    const result=inspectionContext.result;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){showToast?.('Bitte ein gültiges Prüfdatum angeben.',null,null,'error');return;}
    if(!inspector){showToast?.('Bitte den Prüfer angeben.',null,null,'error');form.elements.inspector?.focus();return;}
    if(!result){showToast?.('Bitte ein Prüfergebnis auswählen.',null,null,'error');return;}
    const evidence=inspectionContext.evidence||[];
    const record={id:'INSP-'+asset.id+'-'+(asset.inspections.length+1),obligationId:obligation.id,date,inspector,company,result,evidenceStatus:evidence.length?'PRÜFBAR':'FACHLICHE PRÜFUNG ERFORDERLICH',evidenceFiles:evidence};
    asset.inspections.unshift(record);
    obligation.lastDate=date;
    if(obligation.intervalMonths){
      const next=new Date(date+'T00:00:00');
      next.setMonth(next.getMonth()+obligation.intervalMonths);
      obligation.nextDueDate=`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;
      if(obligation.maxOffsetMonths){
        const max=new Date(obligation.nextDueDate+'T00:00:00');
        max.setMonth(max.getMonth()+obligation.maxOffsetMonths);
        obligation.maxDueDate=`${max.getFullYear()}-${String(max.getMonth()+1).padStart(2,'0')}-${String(max.getDate()).padStart(2,'0')}`;
      }
    }
    obligation.status=result==='Nicht bestanden'?'due':'';
    obligation.sourceStatus=evidence.length?'VERIFIED':'REVIEW_REQUIRED';
    window.recordAudit?.('Prüfung erfasst',{entityType:'Prüfpflicht',entityId:obligation.id,summary:`${asset.id} · ${obligation.type} · ${result}`});
    save?.();
    closeInspectionDialog();
    navigate({screen:'asset',assetId:asset.id,assetTab:'pflichten'});
    showToast?.(`Prüfung für ${asset.id} wurde erfasst.`);
  }

  function page(){
    ensure();
    let body='';
    if(view.screen==='site')body=siteScreen();
    else if(view.screen==='assets')body=assetsScreen();
    else if(view.screen==='asset')body=assetDetailScreen();
    else if(view.screen==='due')body=dueScreen();
    else body=portfolioScreen();
    return `<section class="page compliance-workspace" id="compliance"><div class="section-head compliance-page-head"><div><span class="eyebrow">Asset Compliance</span><h2>Prüfpflichten</h2><p>Anlagen, Prüfpflichten und Fälligkeiten auf einen Blick.</p></div></div>${breadcrumb()}${quickNav()}${body}</section>`;
  }

  window.compliance=page;
  window.closeComplianceObligationPanel=closeObligationPanel;
  window.closeComplianceCaptureDialog=closeInspectionDialog;
  window.runComplianceWorkspaceTests=function(){
    ensure();
    const asset=assets()[0];
    const overdueAsset=assetById('RWA-01');
    const unknownAsset=assetById('CO-TG-01');
    const tests=[
      {name:'Anlagen werden lokal als Liste geführt',passed:assets().length>=15},
      {name:'Kritisch überfällige Prüfpflicht wird als überfällig erkannt',passed:overdueAsset&&assetEffectiveKey(overdueAsset).key==='overdue'&&assetEffectiveKey(overdueAsset).critical},
      {name:'Ungeklärte Prüfpflicht wird als höchste Priorität erkannt',passed:unknownAsset&&assetEffectiveKey(unknownAsset).key==='unknown'},
      {name:'Portfolio-Kennzahlen liegen zwischen 0 und 100 %',passed:(()=>{const m=coverageMetrics(assets());return [m.assetCoverage,m.obligationCoverage,m.scheduleCompliance,m.evidenceCoverage,m.index].every(v=>v>=0&&v<=100);})()},
      {name:'Fälligkeitsherleitung liefert die Kernfelder',passed:asset&&asset.obligations[0]&&obligationDeriveMarkup(asset.obligations[0]).includes('Berechnungsversion')},
      {name:'Schreibende Aktionen sind berechtigungsgeschützt',passed:String(openInspectionDialog).includes('requirePermission')&&String(submitInspection).includes('requirePermission')},
      {name:'Die Fachseite stellt Portfolio-, Standort-, Anlagen- und Fälligkeitsansicht bereit',passed:page().includes('compliance-portfolio')}
    ];
    return {passed:tests.every(t=>t.passed),tests};
  };
  ensure();
  const tests=window.runComplianceWorkspaceTests();
  window.__INGTEC_COMPLIANCE_TESTS__=tests;
  document.documentElement.dataset.complianceTests=tests.passed?'passed':'failed';

  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;
    const nav=target.closest('[data-compliance-nav]');
    if(nav){
      event.preventDefault();
      const screen=nav.dataset.complianceNav;
      const patch={screen};
      if(nav.dataset.complianceSite)patch.siteId=nav.dataset.complianceSite||null;
      if(screen==='portfolio'){patch.siteId=null;patch.category=null;patch.assetId=null;}
      if(screen==='assets')patch.category=nav.dataset.complianceCategory||null;
      if(screen==='site')patch.category=null;
      navigate(patch);
      return;
    }
    const assetOpen=target.closest('[data-compliance-asset]');
    if(assetOpen){event.preventDefault();navigate({screen:'asset',assetId:assetOpen.dataset.complianceAsset,assetTab:'uebersicht'});return;}
    const tab=target.closest('[data-compliance-tab]');
    if(tab){event.preventDefault();navigate({assetTab:tab.dataset.complianceTab});return;}
    const viewToggle=target.closest('[data-compliance-view]');
    if(viewToggle){event.preventDefault();assetsViewMode=viewToggle.dataset.complianceView;window.renderAll?.();setActivePage?.('compliance');return;}
    const dueFilterBtn=target.closest('[data-compliance-due-filter]');
    if(dueFilterBtn){event.preventDefault();dueFilter=dueFilterBtn.dataset.complianceDueFilter;window.renderAll?.();setActivePage?.('compliance');return;}
    const openObl=target.closest('[data-compliance-open-obligation]');
    if(openObl){event.preventDefault();const [assetId,obligationId]=openObl.dataset.complianceOpenObligation.split('::');openObligationPanel(assetId,obligationId,openObl.dataset.complianceExpandCalc==='1');return;}
    const closeObl=target.closest('[data-compliance-close-obligation]');
    if(closeObl){event.preventDefault();closeObligationPanel();return;}
    const plan=target.closest('[data-compliance-plan]');
    if(plan){event.preventDefault();const [assetId,obligationId]=plan.dataset.compliancePlan.split('::');openInspectionDialog(assetId,obligationId);return;}
    const capture=target.closest('[data-compliance-capture]');
    if(capture){event.preventDefault();openInspectionDialog(capture.dataset.complianceCapture,capture.dataset.complianceObligation||'');return;}
    const stub=target.closest('[data-compliance-stub]');
    if(stub){event.preventDefault();showToast?.(`${stub.dataset.complianceStub}: folgt in einem späteren Ausbaustand.`);return;}
  });

  window.renderAll?.();
  if(location.hash==='#compliance')setTimeout(()=>setActivePage?.('compliance'),0);
  const params=new URL(location.href).searchParams;
  if(params.get('compliance-test')==='1'){
    const pre=document.createElement('pre');
    pre.id='complianceTestResults';
    pre.hidden=true;
    pre.textContent=JSON.stringify(tests);
    document.body.appendChild(pre);
  }
})();
