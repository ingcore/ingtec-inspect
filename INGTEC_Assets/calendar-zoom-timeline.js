(()=>{
  'use strict';
  const ZOOM_LEVELS=['year','quarter','month','week','day','list'];
  const legacyViews={month:window.calendarMonthView,week:window.calendarWeekView,day:window.calendarDayView,list:window.calendarListView};
  const weekdayLabels=['Mo','Di','Mi','Do','Fr','Sa','So'];
  const DAY_MINUTES=24*60;
  const LUNCH_START=12*60;
  const LUNCH_LATEST_START=13*60;
  const LUNCH_DURATION=30;

  function copyCalendarDate(date){return new Date(date.getFullYear(),date.getMonth(),date.getDate());}
  function boundedInteger(value,min,max,fallback=0){const number=Math.round(Number(value));return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback;}
  function clockMinutes(value,fallback=0){
    const match=/^(\d{2}):(\d{2})$/.exec(String(value||''));
    if(!match)return fallback;
    const hours=Number(match[1]),minutes=Number(match[2]);
    return hours>=0&&hours<24&&minutes>=0&&minutes<60?hours*60+minutes:fallback;
  }
  function clockLabel(value){
    const minutes=Math.max(0,Math.min(DAY_MINUTES,Math.round(Number(value)||0)));
    return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
  }
  function quarterOf(date){return Math.floor(date.getMonth()/3)+1;}
  function monthStart(date){return new Date(date.getFullYear(),date.getMonth(),1);}
  function timelineHeight(start,end){return Math.max(56,Math.min(132,Math.round(Math.max(20,end-start)*.72)));}
  function addTimelineHeight(style,height){return style.slice(0,-1)+';--timeline-height:'+height+'px"';}
  function zoomTarget(mode,direction){
    const current=Math.max(0,ZOOM_LEVELS.indexOf(mode));
    return ZOOM_LEVELS[Math.max(0,Math.min(ZOOM_LEVELS.length-1,current+direction))];
  }
  function hasZoomTarget(direction){return zoomTarget(calendarViewMode,direction)!==calendarViewMode;}
  function refreshCalendarMode(mode){
    if(!ZOOM_LEVELS.includes(mode))return;
    calendarViewMode=mode;
    if(mode==='day')calendarViewDate=copyCalendarDate(calendarSelectedDate);
    calendarRefresh();
  }
  function shiftCalendarMonth(date,amount){return calendarMonthShift(date,amount);}
  function timelineProjectLocation(event){
    const direct=String(event?.location||'').trim();
    if(direct)return direct;
    const projects=[...(state.projects||[]),...(state.completedProjects||[])];
    const project=projects.find(item=>String(item?.id||'')===String(event?.projectId||''));
    return String(project?.address||project?.location||'').trim();
  }
  function timelineLocationKey(value){return String(value||'').toLocaleLowerCase('de-AT').replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
  function timelineIsRemote(event){return /teams|zoom|webex|google meet|online|remote|virtuell/.test([event?.location,event?.videoLink].filter(Boolean).join(' ').toLocaleLowerCase('de-AT'));}
  function timelineIsLunch(event){return /\b(mittag|lunch|mittagspause)\b/i.test(String(event?.title||''));}
  function timelineOccurrenceInterval(entry,value){
    const event=entry.event;
    let start=clockMinutes(event.startTime,9*60);
    let end=clockMinutes(event.endTime,start+60);
    if(String(event.startDate||'')<value)start=0;
    if(String(event.endDate||'')>value)end=DAY_MINUTES;
    if(end<=start)end=Math.min(DAY_MINUTES,start+60);
    return {type:timelineIsLunch(event)?'lunch-event':'event',entry,event,index:entry.index,start,end,location:timelineProjectLocation(event)};
  }
  function timelineTravelAfter(previous,next){
    const from=previous.location;
    const to=next.location;
    const manualMinutes=boundedInteger(previous.event?.travelAfterMinutes,0,480,0);
    const samePlace=from&&to&&timelineLocationKey(from)===timelineLocationKey(to);
    const hasPhysicalRoute=Boolean(from&&to&&!samePlace&&!timelineIsRemote(previous.event)&&!timelineIsRemote(next.event));
    if(!manualMinutes&&!hasPhysicalRoute)return null;
    const route=from&&to?from+' → '+to:(to?'Zum nächsten Termin · '+to:'Zum nächsten Termin');
    if(!manualMinutes)return {type:'travel-pending',entry:previous.entry,index:previous.index,start:previous.end,end:previous.end,route};
    const available=Math.max(0,next.start-previous.end);
    const end=Math.min(next.start,previous.end+manualMinutes);
    return {type:manualMinutes>available?'travel-conflict':'travel',entry:previous.entry,index:previous.index,start:previous.end,end,route,minutes:manualMinutes,available};
  }
  function timelineLunchSuggestion(items){
    const realLunch=items.some(item=>item.type==='lunch-event');
    if(realLunch)return {suggestion:null,unavailable:false};
    const busy=items.filter(item=>item.type==='event'||item.type==='lunch-event'||item.type==='travel'||item.type==='travel-conflict').map(item=>({start:item.start,end:item.end})).sort((a,b)=>a.start-b.start);
    let candidate=LUNCH_START;
    for(const interval of busy){
      if(interval.end<=candidate)continue;
      if(interval.start-candidate>=LUNCH_DURATION&&candidate<=LUNCH_LATEST_START)return {suggestion:{type:'lunch-suggestion',start:candidate,end:candidate+LUNCH_DURATION},unavailable:false};
      candidate=Math.max(candidate,interval.end);
      if(candidate>LUNCH_LATEST_START)return {suggestion:null,unavailable:true};
    }
    return candidate+LUNCH_DURATION<=LUNCH_LATEST_START+LUNCH_DURATION?{suggestion:{type:'lunch-suggestion',start:candidate,end:candidate+LUNCH_DURATION},unavailable:false}:{suggestion:null,unavailable:true};
  }
  function timelineTypeOrder(item){return ({event:0,'lunch-event':1,travel:2,'travel-conflict':2,'travel-pending':3,'lunch-suggestion':4})[item.type]??9;}
  function buildCalendarTimeline(entries,value){
    const allDay=entries.filter(entry=>entry.event?.allDay);
    const appointments=entries.filter(entry=>!entry.event?.allDay).map(entry=>timelineOccurrenceInterval(entry,value)).sort((a,b)=>a.start-b.start||a.end-b.end||String(a.event.title).localeCompare(String(b.event.title),'de'));
    const travel=[];
    for(let index=0;index<appointments.length-1;index++){
      const segment=timelineTravelAfter(appointments[index],appointments[index+1]);
      if(segment)travel.push(segment);
    }
    const lunch=timelineLunchSuggestion([...appointments,...travel]);
    const items=[...appointments,...travel,...(lunch.suggestion?[lunch.suggestion]:[])].sort((a,b)=>a.start-b.start||timelineTypeOrder(a)-timelineTypeOrder(b));
    return {allDay,items,lunchUnavailable:lunch.unavailable,appointmentCount:appointments.length};
  }
  function overviewMonthMarkup(year,month){
    const first=new Date(year,month,1),today=dateValue(new Date()),selected=dateValue(calendarSelectedDate),firstOffset=(first.getDay()+6)%7,daysInMonth=new Date(year,month+1,0).getDate();
    const heading=new Intl.DateTimeFormat('de-AT',{month:'long'}).format(first);
    const cells=[];
    for(let index=0;index<firstOffset;index++)cells.push('<span class="calendar-overview-empty" aria-hidden="true"></span>');
    for(let day=1;day<=daysInMonth;day++){
      const date=new Date(year,month,day),value=dateValue(date),count=calendarEntriesForDate(value).length;
      const classes='calendar-overview-day'+(value===today?' is-today':'')+(value===selected?' is-selected':'')+(count?' has-events':'');
      const label=calendarDayLabel(date)+(count?', '+count+' '+(count===1?'Termin':'Termine'):'');
      cells.push('<button type="button" class="'+classes+'" aria-label="'+escapeHtml(label)+'" title="'+escapeHtml(label)+'" onclick="calendarOverviewSelectDate(\''+value+'\',\'month\')">'+day+'</button>');
    }
    while(cells.length%7)cells.push('<span class="calendar-overview-empty" aria-hidden="true"></span>');
    const monthValue=dateValue(first),monthEvents=Array.from({length:daysInMonth},(_,index)=>calendarEntriesForDate(dateValue(new Date(year,month,index+1))).length).reduce((sum,count)=>sum+count,0);
    return '<article class="calendar-overview-month"><button type="button" class="calendar-overview-month-heading" onclick="calendarOverviewSelectDate(\''+monthValue+'\',\'month\')"><span>'+escapeHtml(heading)+'</span><small>'+monthEvents+' '+(monthEvents===1?'Termin':'Termine')+'</small></button><div class="calendar-overview-weekdays">'+weekdayLabels.map(label=>'<span>'+label+'</span>').join('')+'</div><div class="calendar-overview-days">'+cells.join('')+'</div></article>';
  }
  function calendarYearView(){
    const year=calendarViewDate.getFullYear();
    return '<div class="calendar-overview-scroll"><p class="calendar-overview-caption"><b>Jahresübersicht '+year+'</b> · Ein Tag öffnet die Monatsansicht.</p><div class="calendar-year-grid">'+Array.from({length:12},(_,month)=>overviewMonthMarkup(year,month)).join('')+'</div></div>';
  }
  function calendarQuarterView(){
    const startMonth=Math.floor(calendarViewDate.getMonth()/3)*3,year=calendarViewDate.getFullYear(),quarter=Math.floor(startMonth/3)+1;
    return '<div class="calendar-overview-scroll"><p class="calendar-overview-caption"><b>'+quarter+'. Quartal '+year+'</b> · Ein Tag öffnet die Monatsansicht.</p><div class="calendar-quarter-grid">'+[0,1,2].map(offset=>overviewMonthMarkup(year,startMonth+offset)).join('')+'</div></div>';
  }
  function calendarEventTimelineMarkup(item,value){
    const event=item.event;
    const style=addTimelineHeight(calendarEventStyle(event),timelineHeight(item.start,item.end));
    const details=[item.location,calendarProjectLabel(event.projectId)].filter(Boolean).join(' · ')||'Kein Ort hinterlegt';
    const eventClass=item.type==='lunch-event'?' is-lunch':'';
    return '<li class="calendar-timeline-item is-event'+eventClass+'" '+style+'><time class="calendar-timeline-time">'+clockLabel(item.start)+'<span>'+clockLabel(item.end)+'</span></time><span class="calendar-timeline-rail" aria-hidden="true"><span class="calendar-timeline-dot"></span></span><article class="calendar-timeline-card"><h4><button type="button" onclick="editCalendarOccurrence('+item.index+',\''+value+'\')">'+escapeHtml(event.title)+'</button></h4><p>'+escapeHtml(details)+'</p>'+calendarStatusMarkup(event)+'</article></li>';
  }
  function calendarTravelTimelineMarkup(item,value){
    const planned=item.type==='travel',conflict=item.type==='travel-conflict';
    const typeClass=planned?'is-travel':conflict?'is-conflict':'is-travel-pending';
    const end=planned||conflict?'<span>'+clockLabel(item.end)+'</span>':'';
    const title=planned?'Fahrtzeit · '+item.minutes+' Min.':conflict?'Fahrtzeit · '+item.minutes+' Min. (Konflikt)':'Fahrtzeit einplanen';
    const detail=planned?'Manuell geplant':conflict?'Es fehlen '+Math.max(0,item.minutes-item.available)+' Min. vor dem Folgetermin.':'Für den Tagesablauf fehlt noch eine Fahrzeit.';
    const action=planned?'':conflict?'':'<button type="button" onclick="editCalendarOccurrence('+item.index+',\''+value+'\')">Fahrzeit festlegen</button>';
    return '<li class="calendar-timeline-item '+typeClass+'"><time class="calendar-timeline-time">'+clockLabel(item.start)+end+'</time><span class="calendar-timeline-rail" aria-hidden="true"><span class="calendar-timeline-dot"></span></span><article class="calendar-timeline-card"><h4>'+title+'</h4><p>'+escapeHtml(item.route)+'</p><div class="calendar-timeline-detail"><span>'+detail+'</span>'+action+'</div></article></li>';
  }
  function calendarLunchTimelineMarkup(item,value){
    return '<li class="calendar-timeline-item is-lunch"><time class="calendar-timeline-time">'+clockLabel(item.start)+'<span>'+clockLabel(item.end)+'</span></time><span class="calendar-timeline-rail" aria-hidden="true"><span class="calendar-timeline-dot"></span></span><article class="calendar-timeline-card"><h4>Mittagspause · Vorschlag</h4><p>Konfliktfreies Pausenfenster im Tagesablauf.</p><div class="calendar-timeline-detail"><span>'+LUNCH_DURATION+' Minuten</span><button type="button" onclick="calendarScheduleLunch(\''+value+'\',\''+clockLabel(item.start)+'\','+LUNCH_DURATION+')">Übernehmen</button></div></article></li>';
  }
  function calendarAllDayMarkup(entries,value){
    if(!entries.length)return '';
    return '<div class="calendar-timeline-all-day" aria-label="Ganztägige Termine">'+entries.map(entry=>'<button type="button" '+calendarEventStyle(entry.event)+' onclick="editCalendarOccurrence('+entry.index+',\''+value+'\')">Ganztägig · '+escapeHtml(entry.event.title)+'</button>').join('')+'</div>';
  }
  function calendarZoomControlsMarkup(){
    return '<div class="calendar-zoom-controls" aria-label="Kalenderansicht vergrößern oder verkleinern"><button type="button" aria-label="Ansicht herauszoomen" title="Ansicht herauszoomen" onclick="calendarZoomBy(-1)" '+(!hasZoomTarget(-1)?'disabled':'')+'>−</button><span>Zoom</span><button type="button" aria-label="Ansicht hineinzoomen" title="Ansicht hineinzoomen" onclick="calendarZoomBy(1)" '+(!hasZoomTarget(1)?'disabled':'')+'>+</button></div>';
  }

  calendarViewButtonLabel=window.calendarViewButtonLabel=mode=>({year:'Jahr',quarter:'Quartal',month:'Monat',week:'Woche',day:'Tag',list:'Liste'})[mode]||'Monat';
  calendarViewRangeLabel=window.calendarViewRangeLabel=function(){
    if(calendarViewMode==='year')return String(calendarViewDate.getFullYear());
    if(calendarViewMode==='quarter')return quarterOf(calendarViewDate)+'. Quartal '+calendarViewDate.getFullYear();
    if(calendarViewMode==='week')return calendarWeekLabel(calendarViewDate);
    if(calendarViewMode==='day')return calendarDayLabel(calendarViewDate);
    return (calendarViewMode==='list'?'Liste · ':'')+calendarMonthLabel(calendarViewDate);
  };
  setCalendarViewMode=window.setCalendarViewMode=refreshCalendarMode;
  window.calendarZoomBy=function(direction){
    const next=zoomTarget(calendarViewMode,Number(direction)>0?1:-1);
    if(next!==calendarViewMode)refreshCalendarMode(next);
  };
  moveCalendarView=window.moveCalendarView=function(amount){
    const step=Number(amount)||0;
    if(!step)return;
    if(calendarViewMode==='year'){
      calendarViewDate=shiftCalendarMonth(calendarViewDate,step*12);
      calendarSelectedDate=shiftCalendarMonth(calendarSelectedDate,step*12);
    }else if(calendarViewMode==='quarter'){
      calendarViewDate=shiftCalendarMonth(calendarViewDate,step*3);
      calendarSelectedDate=shiftCalendarMonth(calendarSelectedDate,step*3);
    }else if(calendarViewMode==='month'||calendarViewMode==='list'){
      calendarViewDate=shiftCalendarMonth(calendarViewDate,step);
      calendarSelectedDate=shiftCalendarMonth(calendarSelectedDate,step);
    }else if(calendarViewMode==='week'){
      calendarViewDate=calendarDateShift(calendarViewDate,step*7);
      calendarSelectedDate=calendarDateShift(calendarSelectedDate,step*7);
    }else{
      calendarViewDate=calendarDateShift(calendarViewDate,step);
      calendarSelectedDate=copyCalendarDate(calendarViewDate);
    }
    calendarRefresh();
  };
  window.calendarOverviewSelectDate=function(value,mode){
    const selected=parseDateValue(value);
    calendarSelectedDate=copyCalendarDate(selected);
    calendarViewDate=copyCalendarDate(selected);
    refreshCalendarMode(mode||'month');
  };
  window.calendarYearView=calendarYearView;
  window.calendarQuarterView=calendarQuarterView;
  calendarViewMarkup=window.calendarViewMarkup=function(){
    if(calendarViewMode==='year')return calendarYearView();
    if(calendarViewMode==='quarter')return calendarQuarterView();
    if(calendarViewMode==='week')return legacyViews.week();
    if(calendarViewMode==='day')return legacyViews.day();
    if(calendarViewMode==='list')return legacyViews.list();
    return legacyViews.month();
  };
  window.buildCalendarTimeline=buildCalendarTimeline;
  calendarAgendaMarkup=window.calendarAgendaMarkup=function(){
    const value=dateValue(calendarSelectedDate),entries=calendarEntriesForDate(value),timeline=buildCalendarTimeline(entries,value);
    const body=timeline.items.length?'<ol class="calendar-timeline" aria-label="Zeitachse für '+escapeHtml(calendarDayLabel(calendarSelectedDate))+'">'+timeline.items.map(item=>{
      if(item.type==='event'||item.type==='lunch-event')return calendarEventTimelineMarkup(item,value);
      if(item.type==='lunch-suggestion')return calendarLunchTimelineMarkup(item,value);
      return calendarTravelTimelineMarkup(item,value);
    }).join('')+'</ol>':'<div class="calendar-timeline-empty"><b>Keine zeitgebundenen Termine</b><br>Der Tagesablauf ist noch frei.<br><button type="button" class="primary" style="margin-top:12px" onclick="openCalendarEventForDate(\''+value+'\')">Termin erstellen</button></div>';
    const notice=timeline.lunchUnavailable?'<p class="calendar-timeline-notice">Für eine 30-minütige Mittagspause ist im sichtbaren Tagesablauf kein konfliktfreies Fenster frei.</p>':'';
    return '<aside class="card calendar-agenda-card"><div class="calendar-agenda-head"><span class="eyebrow">Tagesagenda</span><h3>'+escapeHtml(calendarDayLabel(calendarSelectedDate))+'</h3><p>'+timeline.appointmentCount+' '+(timeline.appointmentCount===1?'Termin':'Termine')+'</p><p class="calendar-agenda-subtitle">Zeitachse mit Fahr- und Pausenplanung.</p></div>'+calendarAllDayMarkup(timeline.allDay,value)+body+notice+'</aside>';
  };
  calendarPage=window.calendarPage=function(){
    const modes=ZOOM_LEVELS,modeButtons=modes.map(mode=>'<button type="button" role="tab" aria-selected="'+(calendarViewMode===mode)+'" data-mode="'+mode+'" class="'+(calendarViewMode===mode?'active':'')+'" onclick="setCalendarViewMode(this.dataset.mode)">'+calendarViewButtonLabel(mode)+'</button>').join('');
    const allActive=calendarActiveFilters.size===calendarKinds.length,filters='<button type="button" class="calendar-filter '+(allActive?'active':'')+'" onclick="toggleCalendarFilter(\'all\')">Alle</button>'+calendarKinds.map(kind=>'<button type="button" class="calendar-filter '+(calendarActiveFilters.has(kind.id)?'active':'')+'" style="--filter-color:'+kind.color+'" aria-pressed="'+calendarActiveFilters.has(kind.id)+'" onclick="toggleCalendarFilter(\''+kind.id+'\')">'+escapeHtml(kind.label)+'</button>').join('');
    return '<section class="page" id="calendar"><div class="section-head"><div><h2>Termine</h2><p>Planung und Tagesagenda · de-AT · Europe/Vienna</p></div><div class="calendar-page-actions"><button type="button" class="primary" onclick="openCalendarEventDialog()">+ Neuer Termin</button></div></div><div class="calendar-layout"><div class="card calendar-main-card" data-calendar-zoom-surface><div class="calendar-main-head"><div class="calendar-period-controls"><button type="button" class="secondary" aria-label="Vorheriger Zeitraum" onclick="moveCalendarView(-1)">‹</button><p class="calendar-range-label" aria-live="polite">'+escapeHtml(calendarViewRangeLabel())+'</p><button type="button" class="secondary" aria-label="Nächster Zeitraum" onclick="moveCalendarView(1)">›</button><button type="button" class="calendar-today-button" onclick="goToTodayCalendar()">Heute</button></div><div class="calendar-view-switch" role="tablist" aria-label="Kalenderansicht">'+modeButtons+'</div>'+calendarZoomControlsMarkup()+'</div><div class="calendar-filterbar" aria-label="Terminkategorien filtern"><span>Filter</span>'+filters+'</div>'+calendarViewMarkup()+'</div>'+calendarAgendaMarkup()+'</div></section>';
  };
  const baseOpenCalendarEvent=window.openCalendarEventDialog;
  openCalendarEventDialog=window.openCalendarEventDialog=function(index){
    baseOpenCalendarEvent(index);
    const form=document.getElementById('calendarEventForm');
    if(!form||form.elements.travelAfterMinutes)return;
    const record=Number.isInteger(Number(index))?state.calendarEvents?.[Number(index)]:null;
    const field=document.createElement('label');
    field.className='calendar-travel-field';
    field.innerHTML='Fahrtzeit bis zum folgenden Vor-Ort-Termin (Minuten)<input name="travelAfterMinutes" type="number" min="0" max="480" step="5" inputmode="numeric"><small>0 bedeutet: Die Agenda markiert die Fahrtzeit als noch zu planen. Es werden keine Routen geschätzt.</small>';
    field.querySelector('input').value=String(boundedInteger(record?.travelAfterMinutes,0,480,0));
    const notes=form.elements.notes?.closest('label');
    notes?.parentNode.insertBefore(field,notes);
  };
  window.calendarScheduleLunch=function(value,start,minutes){
    if(typeof window.requirePermission==='function'&&!window.requirePermission('calendar','das Planen einer Mittagspause'))return;
    const duration=boundedInteger(minutes,15,120,LUNCH_DURATION),begin=clockMinutes(start,LUNCH_START),end=begin+duration;
    if(end>DAY_MINUTES)return;
    const existing=(state.calendarEvents||[]).filter(event=>calendarEventOccursOnDate(event,value));
    if(existing.some(event=>timelineIsLunch(event))){showToast('Für diesen Tag ist bereits eine Mittagspause geplant.',null,null,'error');return;}
    const overlaps=existing.some(event=>{
      if(event.allDay)return false;
      const eventStart=clockMinutes(event.startTime,0),eventEnd=Math.max(eventStart+1,clockMinutes(event.endTime,eventStart+60));
      return begin<eventEnd&&end>eventStart;
    });
    if(overlaps){showToast('Die Mittagspause überschneidet sich mit einem Termin.',null,null,'error');return;}
    const now=new Date().toISOString();
    state.calendarEvents.push(normalizeCalendarEvent({id:nextCalendarEventId(),title:'Mittagspause',startDate:value,startTime:clockLabel(begin),endDate:value,endTime:clockLabel(end),allDay:false,calendar:'personal',availability:'booked',repeat:'never',alert:'none',location:'',attendees:'',videoLink:'',notes:'Aus der Tagesagenda eingeplant.',responsible:'',travelAfterMinutes:0,projectId:'',createdAt:now,updatedAt:now},state.calendarEvents.length,new Set(state.calendarEvents.map(event=>event.id))));
    save();
    calendarRefresh();
    showToast('Mittagspause wurde als Termin eingeplant.');
  };
  document.addEventListener('wheel',event=>{
    const surface=event.target.closest?.('[data-calendar-zoom-surface]');
    if(!surface||(!event.ctrlKey&&!event.metaKey)||Math.abs(event.deltaY)<4)return;
    event.preventDefault();
    const direction=event.deltaY<0?1:-1;
    if(!hasZoomTarget(direction))return;
    const now=Date.now();
    if(now-(window.__calendarZoomWheelAt||0)<260)return;
    window.__calendarZoomWheelAt=now;
    window.calendarZoomBy(direction);
  },{passive:false});
  window.runCalendarWorkspaceTests=function(){
    const makeEvent=(title,start,end,location,travelAfterMinutes=0)=>({event:{title,startDate:'2026-08-16',startTime:start,endDate:'2026-08-16',endTime:end,allDay:false,location,travelAfterMinutes,calendar:'customer',repeat:'never'},index:0});
    const planned=buildCalendarTimeline([makeEvent('Kunde A','08:00','09:00','Villach',30),makeEvent('Kunde B','10:00','11:00','Klagenfurt')],'2026-08-16');
    const unplanned=buildCalendarTimeline([makeEvent('Kunde A','08:00','09:00','Villach'),makeEvent('Kunde B','10:00','11:00','Klagenfurt')],'2026-08-16');
    const lunch=buildCalendarTimeline([makeEvent('Vormittag','08:00','09:00','Villach'),makeEvent('Nachmittag','14:00','15:00','Villach')],'2026-08-16');
    const lunchConflict=buildCalendarTimeline([makeEvent('Block','11:45','13:45','Villach')],'2026-08-16');
    const tests=[
      {name:'Zoomstufen decken Jahr bis Liste ab',passed:JSON.stringify(ZOOM_LEVELS)===JSON.stringify(['year','quarter','month','week','day','list'])&&zoomTarget('year',-1)==='year'&&zoomTarget('list',1)==='list'},
      {name:'Zoom wechselt schrittweise zwischen den Ansichten',passed:zoomTarget('quarter',1)==='month'&&zoomTarget('month',-1)==='quarter'&&zoomTarget('day',1)==='list'},
      {name:'Manuell geplante Fahrtzeit erscheint als Zeitblock',passed:planned.items.some(item=>item.type==='travel'&&item.minutes===30)},
      {name:'Fehlende Fahrzeit wird nicht geschätzt',passed:unplanned.items.some(item=>item.type==='travel-pending')&&!unplanned.items.some(item=>item.type==='travel')},
      {name:'Mittagspause wird nur konfliktfrei vorgeschlagen',passed:lunch.items.some(item=>item.type==='lunch-suggestion')&&lunchConflict.lunchUnavailable},
      {name:'Timeline verarbeitet nur übergebene sichtbare Termine',passed:planned.appointmentCount===2&&planned.allDay.length===0}
    ];
    return {passed:tests.every(test=>test.passed),tests};
  };
  window.__INGTEC_CALENDAR_TESTS__=window.runCalendarWorkspaceTests();
  document.documentElement.dataset.calendarTests=window.__INGTEC_CALENDAR_TESTS__.passed?'passed':'failed';
  const activePageBeforeCalendarUpgrade=document.querySelector?.('.page.active')?.id;
  window.renderAll?.();
  if(activePageBeforeCalendarUpgrade==='calendar')window.setActivePage?.('calendar');
})();
