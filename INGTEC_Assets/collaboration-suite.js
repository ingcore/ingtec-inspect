(()=>{
  'use strict';
  const api=window.INGTECChatV2;
  if(!api)return;

  const esc=value=>typeof window.escapeHtml==='function'?window.escapeHtml(String(value==null?'':value)):String(value==null?'':value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]));
  const text=value=>String(value==null?'':value).trim();
  const items=value=>Array.isArray(value)?value:[];
  const now=()=>api.now?api.now():new Date().toISOString();
  const timestamp=value=>{const number=new Date(value).getTime();return Number.isFinite(number)?number:0;};
  const chat=()=>state.chatV2;
  const accounts=()=>items(api.allAccounts?.());
  const active=()=>api.activeAccount?.()||null;
  const notify=(message,kind='')=>window.showToast?.(message,null,null,kind==='error'?'error':undefined);
  const uid=prefix=>api.identifier?api.identifier(prefix):prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
  const unique=value=>[...new Set(items(value).map(value=>text(value)).filter(Boolean))];
  const ownId=()=>text(active()?.id);
  const managing=()=>Boolean(window.hasRolePermission?.('manageUsers')||window.hasRolePermission?.('manageRoles'));
  const visible=()=>items(api.visibleConversations?.()).filter(conversation=>conversation?.status!=='archived');
  const conversationById=id=>items(chat()?.conversations).find(conversation=>conversation?.id===String(id))||null;
  const accountById=id=>accounts().find(account=>account?.id===String(id))||null;
  const visibleConversationIds=()=>new Set(visible().map(conversation=>text(conversation?.id)).filter(Boolean));
  const visibleConversationById=id=>visible().find(conversation=>conversation?.id===String(id))||null;
  function taskIsVisible(task){
    if(!task||!ownId())return false;
    const conversationId=text(task.conversationId);
    if(conversationId)return visibleConversationIds().has(conversationId);
    const sourceMessageId=text(task.sourceMessageId);
    if(sourceMessageId)return visible().some(conversation=>items(conversation.messages).some(message=>text(message?.id)===sourceMessageId));
    return text(task.createdBy)===ownId()||text(task.ownerId)===ownId();
  }
  const visibleTasks=()=>items(chat()?.tasks).filter(taskIsVisible);
  function meetingIsVisible(meeting){
    if(!meeting||!ownId())return false;
    const account=ownId();
    if(items(meeting.attendeeIds).map(text).includes(account)||text(meeting.createdBy)===account)return true;
    const conversationId=text(meeting.conversationId);
    if(conversationId&&visibleConversationIds().has(conversationId))return true;
    const teamId=text(meeting.teamId);
    return Boolean(teamId&&items(suite().teams).some(team=>text(team?.id)===teamId&&items(team?.memberIds).map(text).includes(account)));
  }
  const visibleMeetings=()=>items(suite().meetings).filter(meetingIsVisible);

  function createChannel(team,{title,description='',kind='standard',memberIds=[],contextLinks=[]}={}){
    const members=unique(memberIds.length?memberIds:team.memberIds);
    const conversation={
      id:uid('CHAT'),
      type:'team_channel',
      title:text(title).slice(0,180)||'Neuer Kanal',
      description:text(description).slice(0,500),
      teamId:team.id,
      channelId:uid('CHANNEL'),
      channelKind:kind==='private'?'private':'standard',
      participantIds:members,
      contextLinks:items(contextLinks),
      audience:'internal',
      externalReleaseRequired:false,
      readAtBy:{},
      messages:[],
      createdAt:now(),
      updatedAt:now(),
      status:'active',
      version:1
    };
    chat().conversations.push(conversation);
    team.channelIds=unique([...(team.channelIds||[]),conversation.id]);
    return conversation;
  }

  function suite(){
    const store=chat();
    if(!store)return {teams:[],meetings:[],presenceByAccountId:{},ui:{area:'teams',detailTab:'posts',search:'',expandedTeams:{}}};
    let changed=false;
    if(!store.collaboration||typeof store.collaboration!=='object'){
      store.collaboration={version:1,teams:[],meetings:[],presenceByAccountId:{},ui:{area:'teams',detailTab:'posts',search:'',expandedTeams:{}}};
      changed=true;
    }
    const data=store.collaboration;
    data.version=2;
    if(!Array.isArray(data.teams)){data.teams=[];changed=true;}
    if(!Array.isArray(data.meetings)){data.meetings=[];changed=true;}
    if(!data.presenceByAccountId||typeof data.presenceByAccountId!=='object'){data.presenceByAccountId={};changed=true;}
    data.ui=data.ui&&typeof data.ui==='object'?data.ui:{};
    if(!['activity','chats','teams','meetings','tasks','files'].includes(data.ui.area)){data.ui.area='teams';changed=true;}
    if(!['posts','tasks','files'].includes(data.ui.detailTab)){data.ui.detailTab='posts';changed=true;}
    data.ui.search=text(data.ui.search).slice(0,160);
    data.ui.expandedTeams=data.ui.expandedTeams&&typeof data.ui.expandedTeams==='object'?data.ui.expandedTeams:{};
    const memberIds=unique(accounts().map(account=>account.id));
    let defaultTeam=data.teams.find(team=>team?.id==='TEAM-INGTEC');
    if(!defaultTeam){
      defaultTeam={id:'TEAM-INGTEC',name:'INGTEC Team',description:'Gemeinsamer Arbeitsbereich für interne Kommunikation, Aufgaben, Dateien und Besprechungen.',memberIds:[...memberIds],ownerIds:ownId()?[ownId()]:[],channelIds:[],autoMembers:true,createdAt:now(),updatedAt:now()};
      data.teams.unshift(defaultTeam);
      changed=true;
    }
    data.teams=data.teams.map(team=>{
      const normalized=team&&typeof team==='object'?team:{};
      normalized.id=text(normalized.id)||uid('TEAM');
      normalized.name=text(normalized.name).slice(0,120)||'Team';
      normalized.description=text(normalized.description).slice(0,500);
      normalized.memberIds=unique(normalized.memberIds);
      normalized.ownerIds=unique(normalized.ownerIds);
      normalized.channelIds=unique(normalized.channelIds);
      normalized.autoMembers=normalized.autoMembers===true;
      if(normalized.autoMembers){
        const next=unique([...normalized.memberIds,...memberIds]);
        if(next.length!==normalized.memberIds.length){normalized.memberIds=next;changed=true;}
      }
      return normalized;
    });
    defaultTeam=data.teams.find(team=>team.id==='TEAM-INGTEC')||data.teams[0];
    items(store.conversations).filter(conversation=>conversation?.type==='team_channel').forEach(conversation=>{
      if(!conversation.teamId){conversation.teamId=defaultTeam.id;changed=true;}
      if(!conversation.channelId){conversation.channelId=uid('CHANNEL');changed=true;}
      if(!conversation.channelKind)conversation.channelKind='standard';
      let team=data.teams.find(item=>item.id===conversation.teamId);
      if(!team){
        team={id:conversation.teamId,name:'Team',description:'',memberIds:unique(conversation.participantIds),ownerIds:[],channelIds:[],createdAt:now(),updatedAt:now()};
        data.teams.push(team);
        changed=true;
      }
      if(!team.channelIds.includes(conversation.id)){team.channelIds.push(conversation.id);changed=true;}
      if(conversation.channelKind!=='private'&&team.autoMembers){
        const next=unique([...conversation.participantIds,...team.memberIds]);
        if(next.length!==conversation.participantIds.length){conversation.participantIds=next;changed=true;}
      }
    });
    const defaults=[
      ['Allgemein','Ankündigungen, Abstimmungen und der gemeinsame Teamalltag.'],
      ['Prüfungen & Projekte','Abstimmungen zu Prüfungen, Befundungen und laufenden Projekten.'],
      ['Wissen & Vorlagen','Fachwissen, Vorlagen und hilfreiche Teamressourcen.']
    ];
    defaults.forEach(([title,description])=>{
      const current=items(store.conversations).find(conversation=>conversation?.type==='team_channel'&&conversation.teamId===defaultTeam.id&&conversation.title===title);
      if(!current){createChannel(defaultTeam,{title,description,memberIds:defaultTeam.memberIds});changed=true;}
    });
    accounts().forEach(account=>{
      const current=text(data.presenceByAccountId[account.id]);
      if(!['available','busy','away','dnd','offline'].includes(current)){
        data.presenceByAccountId[account.id]=account.id===ownId()?'available':'available';
        changed=true;
      }
    });
    data.meetings=items(data.meetings).filter(meeting=>meeting&&text(meeting.id)).map(meeting=>({
      ...meeting,
      id:text(meeting.id),
      title:text(meeting.title).slice(0,180)||'INGTEC-Besprechung',
      conversationId:text(meeting.conversationId),
      teamId:text(meeting.teamId),
      startAt:timestamp(meeting.startAt)?new Date(meeting.startAt).toISOString():now(),
      duration:Math.max(15,Math.min(480,Number(meeting.duration)||30)),
      attendeeIds:unique(meeting.attendeeIds),
      status:['scheduled','active','ended'].includes(text(meeting.status))?text(meeting.status):'scheduled'
    })).slice(0,300);
    if(changed)api.persist?.();
    return data;
  }

  const presenceLabel=status=>({available:'Verfügbar',busy:'Beschäftigt',away:'Abwesend',dnd:'Nicht stören',offline:'Offline'}[status]||'Verfügbar');
  const presence=status=>text(suite().presenceByAccountId?.[status]||'available');
  function avatar(account,extraClass=''){
    const initials=text(account?.name||'INGTEC').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part.charAt(0)).join('').toUpperCase()||'IN';
    const markup=typeof window.accountAvatarMarkup==='function'?window.accountAvatarMarkup(account):account?.photo?'<img src="'+esc(account.photo)+'" alt="">':'<span>'+esc(initials)+'</span>';
    const state=presence(account?.id);
    return '<span class="collab-avatar '+esc(extraClass)+'" aria-label="'+esc((account?.name||'INGTEC')+' · '+presenceLabel(state))+'">'+markup+'<i class="collab-presence-dot '+esc(state)+'" aria-hidden="true"></i></span>';
  }
  function conversationTitle(conversation){
    if(!conversation)return 'Unterhaltung auswählen';
    if(text(conversation.title))return conversation.title;
    if(conversation.type==='direct'){
      const members=items(conversation.participantIds).filter(id=>id!==ownId()).map(id=>accountById(id)?.name).filter(Boolean);
      return members.join(', ')||'Direktchat';
    }
    return conversation.type==='team_channel'?'Kanal':'Unterhaltung';
  }
  function conversationSubtitle(conversation){
    if(!conversation)return '';
    if(conversation.type==='team_channel')return conversation.channelKind==='private'?'Privater Kanal':'Kanal';
    const others=items(conversation.participantIds).filter(id=>id!==ownId()).length;
    return others>1?others+' weitere Mitglieder':'Direktnachricht';
  }
  function latestMessage(conversation){return [...items(conversation?.messages)].filter(message=>!message.deletedAt).sort((a,b)=>timestamp(b.sentAt)-timestamp(a.sentAt))[0]||null;}
  function preview(conversation){
    const message=latestMessage(conversation);
    if(!message)return conversation.description||'Noch keine Beiträge';
    return ((message.senderId===ownId()?'Du':message.senderName||'INGTEC')+': '+(message.text||'Anhang')).replace(/\s+/g,' ').slice(0,78);
  }
  function timeLabel(value){
    const date=new Date(value);
    if(!timestamp(value))return '';
    const diff=Date.now()-date.getTime();
    if(diff<86400000)return new Intl.DateTimeFormat('de-AT',{hour:'2-digit',minute:'2-digit'}).format(date);
    if(diff<604800000)return new Intl.DateTimeFormat('de-AT',{weekday:'short'}).format(date);
    return new Intl.DateTimeFormat('de-AT',{day:'2-digit',month:'2-digit'}).format(date);
  }
  function meetingDate(value){
    const date=new Date(value);
    return timestamp(value)?new Intl.DateTimeFormat('de-AT',{dateStyle:'medium',timeStyle:'short'}).format(date):'Noch nicht terminiert';
  }
  function selectedConversation(){
    const options=visible();
    let selected=options.find(conversation=>conversation.id===chat().selectedConversationId)||null;
    if(!selected)selected=options.find(conversation=>conversation.type==='team_channel')||options[0]||null;
    if(selected&&chat().selectedConversationId!==selected.id)chat().selectedConversationId=selected.id;
    return selected;
  }
  function teamById(id){return suite().teams.find(team=>team.id===String(id))||null;}
  function teamsForCurrentUser(){
    const account=ownId();
    return suite().teams.filter(team=>team.memberIds.includes(account)||managing());
  }
  function channelsForTeam(team){
    return visible().filter(conversation=>conversation.type==='team_channel'&&conversation.teamId===team.id&&conversation.status!=='archived').sort((a,b)=>conversationTitle(a).localeCompare(conversationTitle(b),'de'));
  }
  function matchesSearch(conversation){
    const search=text(suite().ui.search).toLocaleLowerCase('de');
    if(!search)return true;
    const source=[conversationTitle(conversation),preview(conversation),...items(conversation.messages).map(message=>message.text+' '+message.senderName)].join(' ').toLocaleLowerCase('de');
    return source.includes(search);
  }
  function tasksForConversation(conversation){
    if(!conversation)return [];
    const messageIds=new Set(items(conversation.messages).map(message=>message.id));
    return visibleTasks().filter(task=>task?.conversationId===conversation.id||messageIds.has(task?.sourceMessageId));
  }
  function fileEntries(conversation){
    const conversations=conversation?[conversation]:visible();
    return conversations.flatMap(entry=>items(entry.messages).flatMap(message=>items(message.attachments).map(attachment=>({conversation:entry,message,attachment})))).filter(entry=>entry.attachment);
  }
  function unreadForConversation(conversation){return Number(api.unreadCount?.(conversation)||0);}
  function activityEntries(){
    const account=ownId();
    const entries=[];
    const visibleIds=visibleConversationIds();
    items(chat().notifications).filter(notification=>notification?.recipientId===account&&!notification.readAt).forEach(notification=>{
      const conversation=conversationById(notification.conversationId);
      if(!conversation||!visibleIds.has(text(conversation.id)))return;
      const message=conversation?.messages.find(item=>item.id===notification.messageId);
      entries.push({id:notification.id,kind:notification.kind==='mention'?'mention':'message',conversation,message,messageId:notification.messageId,at:notification.createdAt,title:notification.kind==='mention'?'Du wurdest erwähnt':'Neue Nachricht',body:message?.text||conversationTitle(conversation)});
    });
    visible().forEach(conversation=>{
      const count=unreadForConversation(conversation);
      if(count&&!entries.some(entry=>entry.conversation?.id===conversation.id))entries.push({id:'unread-'+conversation.id,kind:'unread',conversation,at:latestMessage(conversation)?.sentAt||conversation.updatedAt,title:count+' ungelesene '+(count===1?'Nachricht':'Nachrichten'),body:conversationTitle(conversation)});
    });
    visibleTasks().filter(task=>task?.ownerId===account&&!/fertig|erledigt|abgeschlossen/i.test(text(task.status))).forEach(task=>entries.push({id:'task-'+task.id,kind:'task',task,at:task.updatedAt||task.createdAt,title:'Aufgabe wartet auf dich',body:task.title}));
    return entries.sort((a,b)=>timestamp(b.at)-timestamp(a.at)).slice(0,100);
  }

  function railMarkup(data){
    const area=data.ui.area;
    const activity=activityEntries().length;
    const unread=Number(api.totalUnread?.()||0);
    const buttons=[
      ['activity','◔','Aktivität',activity],
      ['chats','◉','Chats',unread],
      ['teams','#','Teams',0],
      ['meetings','◷','Termine',0],
      ['tasks','✓','Aufgaben',visibleTasks().filter(task=>!/fertig|erledigt|abgeschlossen/i.test(text(task?.status))).length],
      ['files','▣','Dateien',0]
    ];
    return '<aside class="collab-rail" aria-label="Teamarbeit Bereiche">'+buttons.map(([id,icon,label,count])=>'<button type="button" class="'+(area===id?'active':'')+'" onclick="collabSetArea(\''+id+'\')" aria-current="'+(area===id?'page':'false')+'"><i aria-hidden="true">'+icon+'</i><span>'+label+'</span>'+(count?'<b class="collab-unread">'+esc(count>99?'99+':count)+'</b>':'')+'</button>').join('')+'</aside>';
  }
  function conversationItem(conversation,current,area){
    const direct=conversation.type==='direct';
    const partner=direct?accountById(items(conversation.participantIds).find(id=>id!==ownId())||items(conversation.participantIds)[0]):null;
    const icon=direct?avatar(partner,'compact'):'<span class="collab-channel-symbol" aria-hidden="true">#</span>';
    const unread=unreadForConversation(conversation);
    return '<button type="button" class="collab-conversation '+(current?.id===conversation.id?'active':'')+'" onclick="collabSelectConversation(\''+esc(conversation.id)+'\',\''+area+'\')">'+icon+'<span class="collab-conversation-copy"><b>'+esc(conversationTitle(conversation))+'</b><small>'+esc(preview(conversation))+'</small></span><span class="collab-item-meta"><span>'+esc(timeLabel(conversation.updatedAt))+'</span>'+(unread?'<b class="collab-count">'+esc(unread>99?'99+':unread)+'</b>':'')+'</span></button>';
  }
  function teamMarkup(team,current){
    const data=suite();
    const expanded=data.ui.expandedTeams[team.id]!==false;
    const channels=channelsForTeam(team).filter(matchesSearch);
    return '<div class="collab-team"><button type="button" class="collab-team-title" onclick="collabToggleTeam(\''+esc(team.id)+'\')"><span><i class="collab-team-badge" aria-hidden="true">'+esc(team.name.slice(0,2).toUpperCase())+'</i><b>'+esc(team.name)+'</b></span><i aria-hidden="true">'+(expanded?'⌄':'›')+'</i></button>'+(expanded?'<div class="collab-channel-list">'+channels.map(conversation=>'<button type="button" class="collab-channel '+(current?.id===conversation.id?'active':'')+'" onclick="collabSelectConversation(\''+esc(conversation.id)+'\',\'teams\')"><span class="collab-channel-symbol" aria-hidden="true">#</span><span class="collab-channel-copy"><b>'+esc(conversationTitle(conversation))+'</b><small>'+esc(conversation.description||preview(conversation))+'</small></span>'+(unreadForConversation(conversation)?'<b class="collab-count">'+esc(unreadForConversation(conversation))+'</b>':'')+'</button>').join('')+(managing()?'<button type="button" class="collab-channel" onclick="collabOpenChannelDialog(\''+esc(team.id)+'\')"><span class="collab-channel-symbol" aria-hidden="true">+</span><span class="collab-channel-copy"><b>Kanal hinzufügen</b><small>Neuen Bereich anlegen</small></span></button>':'')+'</div>':'')+'</div>';
  }
  function browserMarkup(data,current){
    const area=data.ui.area;
    const search='<div class="collab-search"><i aria-hidden="true">⌕</i><input type="search" value="'+esc(data.ui.search)+'" placeholder="Suchen" aria-label="Teamarbeit durchsuchen" oninput="collabSetSearch(this.value)"></div>';
    if(area==='chats'){
      const direct=visible().filter(conversation=>conversation.type==='direct'&&matchesSearch(conversation));
      return '<aside class="collab-browser" aria-label="Chats"><div class="collab-browser-head"><div><h3>Chats</h3><small>Direkt- und Gruppenchats</small></div><button type="button" class="primary" onclick="collabOpenConversationDialog()">+ Chat</button></div>'+search+'<div class="collab-browser-scroll"><div class="collab-section-label"><span>Letzte Chats</span></div>'+(direct.length?direct.map(conversation=>conversationItem(conversation,current,'chats')).join(''):'<p class="collab-post-hint">Noch keine Direktchats.</p>')+'</div></aside>';
    }
    if(area==='teams'){
      const teamRows=teamsForCurrentUser();
      return '<aside class="collab-browser" aria-label="Teams und Kanäle"><div class="collab-browser-head"><div><h3>Teams</h3><small>Kanäle und Arbeitsbereiche</small></div>'+(managing()?'<button type="button" class="primary" onclick="collabOpenTeamDialog()">+ Team</button>':'')+'</div>'+search+'<div class="collab-browser-scroll"><div class="collab-section-label"><span>Meine Teams</span></div>'+teamRows.map(team=>teamMarkup(team,current)).join('')+'</div></aside>';
    }
    if(area==='meetings'){
      const meetings=visibleMeetings().filter(meeting=>meeting.status!=='ended').sort((a,b)=>timestamp(a.startAt)-timestamp(b.startAt));
      return '<aside class="collab-browser" aria-label="Besprechungen"><div class="collab-browser-head"><div><h3>Besprechungen</h3><small>Geplant und laufend</small></div><button type="button" class="primary" onclick="collabOpenMeetingDialog()">+ Termin</button></div><div class="collab-browser-scroll">'+(meetings.length?meetings.map(meeting=>'<button type="button" class="collab-conversation" onclick="collabOpenMeetingRoom(\''+esc(meeting.id)+'\')"><span class="collab-activity-icon">◷</span><span class="collab-conversation-copy"><b>'+esc(meeting.title)+'</b><small>'+esc(meetingDate(meeting.startAt))+'</small></span><span class="collab-item-meta"><span>'+esc(meeting.status==='active'?'Live':'Geplant')+'</span></span></button>').join(''):'<p class="collab-post-hint">Keine anstehenden Besprechungen.</p>')+'</div></aside>';
    }
    return '<aside class="collab-browser" aria-label="Teamarbeit"><div class="collab-browser-head"><div><h3>INGTEC Teamarbeit</h3><small>Alles an einem Ort</small></div></div><div class="collab-browser-scroll"><div class="collab-privacy-note"><span aria-hidden="true">🔒</span><div><b>Gemeinsamer Arbeitsbereich</b><br>Chats, Kanäle, Dateien, Aufgaben und Besprechungen bleiben je Team und Berechtigung organisiert.</div></div></div></aside>';
  }

  function attachmentType(attachment){
    const type=text(attachment?.mimeType).toLowerCase();
    if(type.includes('pdf'))return 'PDF';
    if(type.includes('word')||type.includes('document'))return 'DOC';
    if(type.includes('sheet')||type.includes('excel'))return 'XLS';
    if(type.includes('presentation'))return 'PPT';
    if(type.startsWith('image/'))return 'IMG';
    if(type.startsWith('video/'))return 'VID';
    if(type.startsWith('audio/'))return 'AUD';
    return 'DATEI';
  }
  function sizeLabel(value){
    const size=Number(value)||0;
    if(size<1024)return size+' B';
    if(size<1024*1024)return Math.round(size/1024)+' KB';
    return (size/(1024*1024)).toFixed(1)+' MB';
  }
  function postMarkup(conversation,message){
    const own=message.senderId===ownId();
    const author=accountById(message.senderId);
    const reply=message.replyToId?items(conversation.messages).find(entry=>entry.id===message.replyToId):null;
    const reactions=items(message.reactions).filter(reaction=>reaction?.emoji&&items(reaction.accountIds).length);
    const attachments=items(message.attachments);
    const textBody=message.deletedAt?'Diese Nachricht wurde nachvollziehbar gelöscht.':esc(message.text||'').replace(/\n/g,'<br>');
    return '<article class="collab-post '+(own?'own ':'')+(message.deletedAt?'is-deleted ':'')+(message.important?'is-important ':'')+'" oncontextmenu="return chatV2OpenMessageContextMenu(event,\''+esc(conversation.id)+'\',\''+esc(message.id)+'\')" title="Rechtsklick für weitere Aktionen">'+avatar(author,'compact')+'<div class="collab-post-content"><div class="collab-post-meta"><b>'+esc(own?'Du':message.senderName||author?.name||'INGTEC')+'</b><span>'+esc(timeLabel(message.sentAt))+'</span>'+(message.editedAt?'<span>bearbeitet</span>':'')+(message.priority==='Dringend'?'<span class="collab-chip urgent">Dringend</span>':'')+'</div>'+(reply?'<div class="collab-reply">Antwort auf '+esc(reply.senderName||'Nachricht')+': '+esc(reply.text||'').slice(0,120)+'</div>':'')+'<div class="collab-post-text">'+textBody+'</div>'+(attachments.length?'<div class="collab-attachments">'+attachments.map(attachment=>'<button type="button" class="collab-attachment" onclick="chatV2OpenAttachment(\''+esc(conversation.id)+'\',\''+esc(message.id)+'\',\''+esc(attachment.id)+'\')"><i>'+esc(attachmentType(attachment))+'</i><span>'+esc(attachment.name)+'<br><small>'+esc(sizeLabel(attachment.size))+' · '+esc(attachment.status||'gespeichert')+'</small></span></button>').join('')+'</div>':'')+(reactions.length?'<div class="collab-reactions">'+reactions.map(reaction=>'<button type="button" onclick="chatV2ToggleReaction(\''+esc(conversation.id)+'\',\''+esc(message.id)+'\',\''+esc(reaction.emoji)+'\')">'+esc(reaction.emoji)+' '+esc(reaction.accountIds.length)+'</button>').join('')+'</div>':'')+'<div class="collab-post-tools">'+(message.pinnedAt?'Angeheftet · ':'')+'Rechtsklick für Antworten, Aufgaben, Dateien und weitere Aktionen</div></div></article>';
  }
  const composerActionIcons=Object.freeze({
    attachment:'<svg class="collab-composer-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m8.1 12.9 7.1-7.1a3.2 3.2 0 1 1 4.5 4.5l-9.1 9.1a5 5 0 0 1-7.1-7.1l8.5-8.5"/></svg>',
    camera:'<svg class="collab-composer-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4.7 8.2h3.1l1.25-1.9h6l1.25 1.9h3.05A1.7 1.7 0 0 1 21 9.9v7.6a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 17.5V9.9a1.7 1.7 0 0 1 1.7-1.7Z"/><circle cx="12" cy="13.6" r="3.25"/></svg>',
    microphone:'<svg class="collab-composer-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="8.3" y="3" width="7.4" height="11.7" rx="3.7"/><path d="M5.3 11.8a6.7 6.7 0 0 0 13.4 0M12 18.5V21M8.9 21h6.2"/></svg>'
  });
  const composerActionNames=Object.freeze({
    'Datei anfügen':'attachment',
    'Foto aufnehmen':'camera',
    'Sprachnotiz':'microphone'
  });
  function applyComposerActionIcons(root){
    root?.querySelectorAll?.('.collab-composer-actions button[aria-label]').forEach(button=>{
      const icon=composerActionIcons[composerActionNames[button.getAttribute('aria-label')]];
      if(!icon)return;
      button.classList.add('collab-composer-action');
      button.innerHTML=icon;
    });
  }
  function composerMarkup(conversation){
    const composer=chat().composer||{};
    const queued=items(composer.attachments);
    const linked=items(composer.links);
    const reply=composer.replyToId?items(conversation.messages).find(message=>message.id===composer.replyToId):null;
    const note=reply?'Antwort auf '+(reply.senderName||'Nachricht')+': '+(reply.text||'').slice(0,90):linked.length?'Verknüpft mit '+linked.map(link=>link.label||link.id).join(', '):'Nutze @ für Erwähnungen, füge Dateien an oder erstelle direkt Aufgaben.';
    return '<form class="collab-composer" onsubmit="chatV2SendMessage(event)"><input id="chatV2FileInput" type="file" multiple hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.heic,.mp4,.mov,.webm,.m4a,.mp3,.wav,.dwg,.dxf" onchange="chatV2SelectFiles(this.files);this.value=\'\'"><input id="chatV2CameraInput" type="file" hidden accept="image/*" capture="environment" onchange="chatV2SelectFiles(this.files);this.value=\'\'"><div class="collab-composer-context"><span>'+esc(note)+'</span>'+((reply||linked.length)?'<button type="button" onclick="chatV2ClearComposerContext()">Zurücksetzen</button>':'')+'</div><div class="collab-composer-row"><div class="collab-composer-actions"><button type="button" title="Datei anfügen" aria-label="Datei anfügen" onclick="document.getElementById(\'chatV2FileInput\')?.click()">⌁</button><button type="button" title="Foto aufnehmen" aria-label="Foto aufnehmen" onclick="document.getElementById(\'chatV2CameraInput\')?.click()">◉</button><button type="button" title="Sprachnotiz" aria-label="Sprachnotiz" onclick="chatV2ToggleVoice()">◌</button><button type="button" title="Mitglied erwähnen" aria-label="Mitglied erwähnen" onclick="chatV2OpenMentionDialog()">@</button><button type="button" title="Kontext verknüpfen" aria-label="Kontext verknüpfen" onclick="chatV2OpenComposerContextDialog()">⌘</button><button type="button" title="Aufgabe erstellen" aria-label="Aufgabe erstellen" onclick="chatV2OpenComposerWorkDialog()">✓</button></div><textarea name="message" maxlength="2000" aria-label="Nachricht schreiben" placeholder="Nachricht schreiben …" onkeydown="chatV2ComposerKeyDown(event)"></textarea><button type="submit" class="primary collab-composer-send">Senden</button></div>'+(queued.length?'<div class="collab-queued-files">'+queued.map(file=>'<span class="collab-queued-file"><b title="'+esc(file.name)+'">'+esc(file.name)+'</b><button type="button" aria-label="Anhang entfernen" onclick="chatV2RemoveQueuedAttachment(\''+esc(file.id)+'\')">×</button></span>').join('')+'</div>':'')+'<small class="collab-composer-help">Strg/⌘ + Enter sendet · Für weitere Aktionen eine Nachricht rechtsklicken.</small></form>';
  }
  function taskStatus(task){
    const status=text(task?.status).toLocaleLowerCase('de');
    if(/fertig|erledigt|abgeschlossen|done/.test(status))return 'done';
    if(/arbeit|bearbeitung|progress|läuft/.test(status))return 'progress';
    return 'open';
  }
  function taskMarkup(task){
    const owner=accountById(task.ownerId);
    const status=taskStatus(task);
    const labels={open:'Offen',progress:'In Arbeit',done:'Erledigt'};
    return '<article class="collab-task-card" onclick="collabOpenTaskDialog(\''+esc(task.id)+'\')"><div class="collab-task-meta"><span class="collab-chip '+(task.priority==='Dringend'?'urgent':'')+'">'+esc(task.priority||'Normal')+'</span><span>'+esc(task.due?'Fällig: '+task.due:'Ohne Frist')+'</span></div><h4>'+esc(task.title||'Aufgabe')+'</h4><p>'+esc(task.description||'Keine Beschreibung hinterlegt.')+'</p><div class="collab-task-meta"><span>'+esc(owner?.name||'Nicht zugewiesen')+'</span><span class="collab-chip neutral">'+labels[status]+'</span></div><div class="collab-task-actions" onclick="event.stopPropagation()">'+(status!=='progress'?'<button type="button" class="secondary" onclick="collabSetTaskStatus(\''+esc(task.id)+'\',\'In Arbeit\')">Starten</button>':'')+(status!=='done'?'<button type="button" class="secondary" onclick="collabSetTaskStatus(\''+esc(task.id)+'\',\'Erledigt\')">Erledigen</button>':'')+'</div></article>';
  }
  function taskBoardMarkup(taskList,compact=false){
    const columns=[['open','Offen'],['progress','In Arbeit'],['done','Erledigt']];
    return '<div class="collab-task-board">'+columns.map(([id,label])=>{const rows=taskList.filter(task=>taskStatus(task)===id);return '<section class="collab-task-column"><h4>'+label+' <span class="collab-count">'+rows.length+'</span></h4>'+(rows.length?rows.map(taskMarkup).join(''):'<p class="collab-post-hint">Keine Aufgaben.</p>')+'</section>';}).join('')+'</div>';
  }
  function filesMarkup(entries){
    return entries.length?'<div class="collab-file-list">'+entries.map(entry=>'<button type="button" class="collab-file-card" onclick="chatV2OpenAttachment(\''+esc(entry.conversation.id)+'\',\''+esc(entry.message.id)+'\',\''+esc(entry.attachment.id)+'\')"><i class="collab-file-icon">'+esc(attachmentType(entry.attachment))+'</i><span><b>'+esc(entry.attachment.name)+'</b><small>'+esc(conversationTitle(entry.conversation))+' · '+esc(sizeLabel(entry.attachment.size))+' · '+esc(entry.attachment.status||'gespeichert')+'</small></span><i aria-hidden="true">›</i></button>').join('')+'</div>':'<div class="collab-empty"><div><i>▣</i><h3>Noch keine Dateien</h3><p>Füge einer Nachricht Dateien, Fotos, CAD-Pläne oder Sprachnotizen an. Sie erscheinen anschließend hier.</p></div></div>';
  }
  function conversationMain(conversation,data){
    if(!conversation)return '<main class="collab-main"><div class="collab-empty"><div><i>#</i><h3>Team oder Chat auswählen</h3><p>Wähle einen Kanal, starte einen Direktchat oder erstelle ein neues Team.</p></div></div></main>';
    const team=teamById(conversation.teamId);
    const tab=data.ui.detailTab;
    const messages=items(conversation.messages).sort((first,second)=>timestamp(first.sentAt)-timestamp(second.sentAt));
    let content='';
    if(tab==='posts')content='<div class="collab-posts" role="log" aria-live="polite">'+(messages.length?messages.map(message=>postMarkup(conversation,message)).join(''):'<div class="collab-empty"><div><i>✦</i><h3>Starte die Unterhaltung</h3><p>Teile ein Update, erwähne Kolleg*innen oder füge Dateien hinzu.</p></div></div>')+'</div>'+composerMarkup(conversation);
    if(tab==='tasks')content='<div class="collab-tasks"><div class="collab-overview-head"><div><h3>Aufgaben in '+esc(conversationTitle(conversation))+'</h3><p>Aus Beiträgen erzeugte und direkt angelegte Aufgaben.</p></div><button type="button" class="primary" onclick="collabOpenTaskDialog()">+ Aufgabe</button></div>'+taskBoardMarkup(tasksForConversation(conversation))+'</div>';
    if(tab==='files')content='<div class="collab-files"><div class="collab-overview-head"><div><h3>Dateien</h3><p>Dateien und Medien dieses '+(conversation.type==='team_channel'?'Kanals':'Chats')+'.</p></div><button type="button" class="secondary" onclick="document.getElementById(\'chatV2FileInput\')?.click()">Datei anfügen</button></div>'+filesMarkup(fileEntries(conversation))+'</div>';
    const runtime=api.runtimeState?.()||{label:'Lokal gespeichert'};
    return '<main class="collab-main" aria-label="'+esc(conversationTitle(conversation))+'"><div class="collab-main-head"><div class="collab-main-person">'+(conversation.type==='direct'?avatar(accountById(items(conversation.participantIds).find(id=>id!==ownId())||items(conversation.participantIds)[0]),'large'):'<span class="collab-team-badge" style="width:42px;height:42px;border-radius:12px;font-size:19px">#</span>')+'<div><h3>'+esc(conversationTitle(conversation))+'</h3><p>'+esc(conversationSubtitle(conversation))+(team?' · '+esc(team.name):'')+'</p></div></div><div class="collab-main-actions"><span class="collab-runtime" title="'+esc(runtime.label)+'"><i></i>'+esc(runtime.label.startsWith('Entwicklungs')?'Lokal':'Synchronisiert')+'</span><button type="button" class="secondary" title="Mitglieder" onclick="collabOpenMembers(\''+esc(conversation.id)+'\')">♙<span> Mitglieder</span></button><button type="button" class="secondary" title="Besprechung planen" onclick="collabOpenMeetingDialog(\''+esc(conversation.id)+'\')">◷<span> Planen</span></button><button type="button" class="primary" title="Sofortbesprechung" onclick="collabStartMeeting(\'\',\''+esc(conversation.id)+'\')">◉<span> Jetzt treffen</span></button></div></div><nav class="collab-tabs" aria-label="Bereich in '+esc(conversationTitle(conversation))+'"><button type="button" class="'+(tab==='posts'?'active':'')+'" onclick="collabSetDetailTab(\'posts\')">Beiträge</button><button type="button" class="'+(tab==='tasks'?'active':'')+'" onclick="collabSetDetailTab(\'tasks\')">Aufgaben <span>'+tasksForConversation(conversation).filter(task=>taskStatus(task)!=='done').length+'</span></button><button type="button" class="'+(tab==='files'?'active':'')+'" onclick="collabSetDetailTab(\'files\')">Dateien <span>'+fileEntries(conversation).length+'</span></button></nav>'+content+'</main>';
  }
  function activityMain(){
    const entries=activityEntries();
    const cards=entries.map(entry=>{
      const action=entry.task?'collabOpenTaskDialog(this.dataset.taskId)':'collabOpenActivityConversation(this.dataset.conversationId)';
      const target=entry.task?' data-task-id="'+esc(entry.task.id)+'"':' data-conversation-id="'+esc(entry.conversation?.id||'')+'"';
      return '<button type="button" class="collab-activity-card" '+target+' onclick="'+action+'"><i class="collab-activity-icon">'+({mention:'@',message:'✉',unread:'◉',task:'✓'}[entry.kind]||'•')+'</i><span><strong>'+esc(entry.title)+'</strong><span>'+esc(entry.body)+'</span></span><span class="collab-activity-time">'+esc(timeLabel(entry.at))+'</span></button>';
    }).join('');
    return '<main class="collab-main"><div class="collab-main-head"><div class="collab-main-person"><span class="collab-team-badge" style="width:42px;height:42px;border-radius:12px;font-size:19px">◔</span><div><h3>Aktivität</h3><p>Erwähnungen, ungelesene Beiträge und dir zugewiesene Aufgaben.</p></div></div><div class="collab-main-actions"><button type="button" class="secondary" onclick="collabMarkActivityRead()">Alles als gelesen</button></div></div><div class="collab-activity"><div class="collab-overview-head"><div><h3>Für dich</h3><p>'+entries.length+' offene Hinweise</p></div></div>'+(cards||'<div class="collab-empty"><div><i>✓</i><h3>Alles erledigt</h3><p>Du hast keine ungelesenen Beiträge, Erwähnungen oder offenen Aufgaben.</p></div></div>')+'</div></main>';
  }
  function meetingsMain(data){
    const rows=visibleMeetings().filter(meeting=>meeting.status!=='ended').sort((a,b)=>timestamp(a.startAt)-timestamp(b.startAt));
    return '<main class="collab-main"><div class="collab-main-head"><div class="collab-main-person"><span class="collab-team-badge" style="width:42px;height:42px;border-radius:12px;font-size:19px">◷</span><div><h3>Besprechungen</h3><p>Planen, teilnehmen und Termine im Team koordinieren.</p></div></div><div class="collab-main-actions"><button type="button" class="primary" onclick="collabOpenMeetingDialog()">+ Besprechung planen</button></div></div><div class="collab-meetings"><div class="collab-meeting-grid">'+(rows.length?rows.map(meeting=>'<article class="collab-meeting-card"><div class="collab-meeting-meta"><span class="collab-chip '+(meeting.status==='active'?'urgent':'')+'">'+(meeting.status==='active'?'Läuft jetzt':'Geplant')+'</span><span>'+esc(meetingDate(meeting.startAt))+'</span></div><h4>'+esc(meeting.title)+'</h4><p>'+esc(meeting.attendeeIds.length)+' Teilnehmer*innen · '+esc(conversationTitle(visibleConversationById(meeting.conversationId)))+'</p><div class="collab-meeting-actions"><button type="button" class="primary" onclick="collabOpenMeetingRoom(\''+esc(meeting.id)+'\')">'+(meeting.status==='active'?'Beitreten':'Besprechung öffnen')+'</button><button type="button" class="secondary" onclick="collabOpenMeetingDialog(\'\',\''+esc(meeting.id)+'\')">Bearbeiten</button></div></article>').join(''):'<div class="collab-empty"><div><i>◷</i><h3>Keine Besprechung geplant</h3><p>Plane eine Kanal- oder Team-Besprechung mit Teilnehmer*innen und Agenda.</p></div></div>')+'</div></div></main>';
  }
  function tasksMain(){
    const rows=visibleTasks();
    return '<main class="collab-main"><div class="collab-main-head"><div class="collab-main-person"><span class="collab-team-badge" style="width:42px;height:42px;border-radius:12px;font-size:19px">✓</span><div><h3>Aufgaben</h3><p>Dein gemeinsames Aufgabenboard für Chats und Kanäle.</p></div></div><div class="collab-main-actions"><button type="button" class="primary" onclick="collabOpenTaskDialog()">+ Aufgabe</button></div></div><div class="collab-tasks"><div class="collab-overview-head"><div><h3>Alle Aufgaben</h3><p>'+rows.filter(task=>taskStatus(task)!=='done').length+' noch offen</p></div></div>'+taskBoardMarkup(rows)+'</div></main>';
  }
  function filesMain(){
    return '<main class="collab-main"><div class="collab-main-head"><div class="collab-main-person"><span class="collab-team-badge" style="width:42px;height:42px;border-radius:12px;font-size:19px">▣</span><div><h3>Dateien</h3><p>Dateien aus allen Chats und Teams.</p></div></div></div><div class="collab-files"><div class="collab-overview-head"><div><h3>Geteilte Dateien</h3><p>Dateien bleiben an ihrem Chat- oder Kanalkontext nachvollziehbar.</p></div></div>'+filesMarkup(fileEntries())+'</div></main>';
  }
  function appContents(){
    const data=suite();
    const current=selectedConversation();
    const area=data.ui.area;
    const main=area==='activity'?activityMain():area==='meetings'?meetingsMain(data):area==='tasks'?tasksMain():area==='files'?filesMain():conversationMain(current,data);
    return '<div class="collab-workspace"><div class="collab-page-head"><div><span class="eyebrow">INGTEC Collaboration</span><h2>Teamarbeit</h2><p>Chats, Teams, Dateien, Aufgaben und Besprechungen in einem Arbeitsbereich.</p></div><div class="collab-head-actions"><button type="button" class="collab-presence-button" onclick="collabOpenPresenceDialog()"><i class="collab-presence-dot '+esc(presence(ownId()))+'" aria-hidden="true"></i>'+esc(presenceLabel(presence(ownId())))+'</button><button type="button" class="secondary" onclick="collabOpenConversationDialog()">+ Neue Unterhaltung</button></div></div><div class="collab-shell">'+railMarkup(data)+browserMarkup(data,current)+main+'</div><div class="collab-privacy-note"><span aria-hidden="true">🔒</span><div><b>INGTEC Teamarbeit</b><br>Kommunikation, Dateien, Aufgaben und Besprechungen sind nach Teams, Kanälen und Mitgliedschaften organisiert. Für Echtzeit-Mehrbenutzerbetrieb, Video-Streams und Push-Benachrichtigungen wird die vorbereitete zentrale Collaboration-API verwendet.</div></div></div>';
  }
  function renderSuite(){
    const page=document.getElementById('chats');
    if(!page)return;
    if(!page.classList.contains('active')){
      page.classList.remove('collaboration-page');
      delete page.dataset.collaborationSuite;
      return;
    }
    page.classList.add('collaboration-page');
    page.dataset.collaborationSuite='true';
    page.innerHTML=appContents();
    applyComposerActionIcons(page);
    window.enhanceFormControls?.(page);
  }
  function renderSuiteWhenChatActivated(page,render=renderSuite){
    if(!page?.classList.contains('active')||page.dataset.collaborationSuite==='true')return false;
    render();
    return true;
  }
  let observedChatPage=null;
  let chatPageObserver=null;
  function observeChatPageActivation(){
    const page=document.getElementById('chats');
    if(!page||page===observedChatPage||typeof MutationObserver!=='function')return;
    chatPageObserver?.disconnect();
    const observer=new MutationObserver(()=>renderSuiteWhenChatActivated(page));
    observer.observe(page,{attributes:true,attributeFilter:['class']});
    observedChatPage=page;
    chatPageObserver=observer;
  }

  function openModal(id,content,extraClass=''){
    document.getElementById(id)?.remove();
    const modal=document.createElement('div');
    modal.id=id;
    modal.className='modal-backdrop';
    modal.innerHTML='<div class="modal-card '+extraClass+'" role="dialog" aria-modal="true">'+content+'</div>';
    modal.addEventListener('click',event=>{if(event.target===modal)window.collabCloseModal(id);});
    document.body.appendChild(modal);
    document.body.style.overflow='hidden';
    window.enhanceFormControls?.(modal);
  }
  window.collabCloseModal=id=>{document.getElementById(id)?.remove();if(!document.querySelector('.modal-backdrop'))document.body.style.overflow='';};
  const modalHead=(eyebrow,title,description,id)=>'<div class="modal-head"><div><span class="eyebrow">'+esc(eyebrow)+'</span><h2>'+esc(title)+'</h2><p>'+esc(description)+'</p></div><button type="button" class="modal-close" aria-label="Dialog schließen" onclick="collabCloseModal(\''+esc(id)+'\')">×</button></div>';
  const memberChoices=(selected=[],disabled=[])=>accounts().map(account=>'<label class="collab-choice"><input type="checkbox" name="members" value="'+esc(account.id)+'" '+(selected.includes(account.id)?'checked':'')+' '+(disabled.includes(account.id)?'disabled':'')+'><span>'+esc(account.name)+'<small> · '+esc(account.role||'Mitglied')+'</small></span></label>').join('');
  function conversationChoices(){
    return visible().map(conversation=>'<option value="'+esc(conversation.id)+'">'+esc(conversationTitle(conversation))+'</option>').join('');
  }

  window.collabSetArea=area=>{
    const data=suite();
    if(!['activity','chats','teams','meetings','tasks','files'].includes(area))return;
    data.ui.area=area;
    api.persist?.();
    renderSuite();
  };
  window.collabSetSearch=value=>{suite().ui.search=text(value).slice(0,160);renderSuite();};
  window.collabSetDetailTab=tab=>{if(!['posts','tasks','files'].includes(tab))return;suite().ui.detailTab=tab;api.persist?.();renderSuite();};
  window.collabToggleTeam=id=>{const data=suite();data.ui.expandedTeams[id]=data.ui.expandedTeams[id]===false;api.persist?.();renderSuite();};
  window.collabSelectConversation=(id,area='teams')=>{
    const conversation=visibleConversationById(id);
    if(!conversation){notify('Dieser Chat oder Kanal ist nicht verfügbar.','error');return;}
    chat().selectedConversationId=conversation.id;
    suite().ui.area=area;
    if(api.markRead?.(conversation))api.audit?.('Teamarbeit gelesen',{entityId:conversation.id,summary:'Lesestatus wurde aktualisiert.'});
    api.persist?.();
    api.refresh?.();
  };
  window.collabOpenActivityConversation=id=>{if(id)window.collabSelectConversation(id,'teams');};
  window.collabMarkActivityRead=()=>{
    const account=ownId();
    items(chat().notifications).forEach(notification=>{if(notification?.recipientId===account&&!notification.readAt)notification.readAt=now();});
    visible().forEach(conversation=>api.markRead?.(conversation));
    api.persist?.();
    renderSuite();
  };

  window.collabOpenPresenceDialog=()=>{
    const id='collabPresenceModal';
    const status=presence(ownId());
    const choices=[['available','● Verfügbar'],['busy','● Beschäftigt'],['away','● Abwesend'],['dnd','● Nicht stören'],['offline','● Offline']];
    openModal(id,modalHead('Präsenz','Status festlegen','Dein Status ist für Teammitglieder in Chats und Kanälen sichtbar.',id)+'<div class="chat-action-grid">'+choices.map(([value,label])=>'<button type="button" class="'+(status===value?'primary':'secondary')+'" onclick="collabSetPresence(\''+value+'\')">'+esc(label)+'</button>').join('')+'</div>','collab-modal');
  };
  window.collabSetPresence=status=>{
    if(!['available','busy','away','dnd','offline'].includes(status)||!ownId())return;
    suite().presenceByAccountId[ownId()]=status;
    api.audit?.('Teamarbeit-Präsenz geändert',{entityId:ownId(),summary:'Status: '+presenceLabel(status)});
    api.persist?.();
    window.collabCloseModal('collabPresenceModal');
    renderSuite();
  };

  window.collabOpenConversationDialog=()=>{
    const id='collabConversationModal';
    const selected=[ownId()];
    const teamOptions=teamsForCurrentUser().map(team=>'<option value="'+esc(team.id)+'">'+esc(team.name)+'</option>').join('');
    openModal(id,modalHead('Neue Unterhaltung','Chat, Gruppe oder Kanal','Direkt- und Gruppenchats brauchen keinen Fachbezug. Kanäle gehören zu einem Team und bleiben dauerhaft organisiert.',id)+'<form onsubmit="collabCreateConversation(event)"><div class="collab-modal-grid"><label>Art<select name="mode"><option value="direct">Direktchat</option><option value="group">Gruppenchat</option><option value="channel">Teamkanal</option></select></label><label>Team für Kanal<select name="teamId"><option value="">Team wählen</option>'+teamOptions+'</select><small>Nur für Teamkanäle erforderlich.</small></label><label class="wide">Name / Betreff<input name="title" maxlength="180" placeholder="Bei Direktchat optional, bei Gruppe oder Kanal empfohlen"></label><label class="wide">Beschreibung<textarea name="description" maxlength="500" placeholder="Worum geht es in dieser Unterhaltung?"></textarea></label><label class="wide">Mitglieder<div class="collab-choice-list">'+memberChoices(selected,[ownId()])+'</div><small>Für einen Direktchat wähle genau eine weitere Person. Teamkanäle übernehmen die Teammitglieder.</small></label></div><div class="modal-actions"><button type="button" class="secondary" onclick="collabCloseModal(\''+id+'\')">Abbrechen</button><button type="submit" class="primary">Erstellen</button></div></form>','collab-modal');
  };
  window.collabCreateConversation=async event=>{
    event.preventDefault();
    const form=event.currentTarget;
    const mode=text(form.elements.mode.value);
    const title=text(form.elements.title.value).slice(0,180);
    const description=text(form.elements.description.value).slice(0,500);
    let memberIds=unique(Array.from(form.querySelectorAll('input[name="members"]:checked')).map(input=>input.value));
    if(ownId()&&!memberIds.includes(ownId()))memberIds.push(ownId());
    if(mode==='channel'){
      if(!managing()){notify('Nur Admins können neue Teams und Kanäle anlegen.','error');return;}
      const team=teamById(form.elements.teamId.value);
      if(!team){notify('Wähle ein Team für den Kanal aus.','error');return;}
      if(!title){notify('Gib dem Kanal einen Namen.','error');return;}
      const existing=channelsForTeam(team).find(conversation=>conversationTitle(conversation).toLocaleLowerCase('de')===title.toLocaleLowerCase('de'));
      if(existing){window.collabSelectConversation(existing.id,'teams');window.collabCloseModal('collabConversationModal');return;}
      const conversation=createChannel(team,{title,description,memberIds:team.memberIds});
      chat().selectedConversationId=conversation.id;
      suite().ui.area='teams';
      api.audit?.('Teamkanal erstellt',{entityId:conversation.id,summary:'Kanal '+title+' im Team '+team.name+' erstellt.'});
      await api.enqueue?.({operation:'channel.create',payload:{teamId:team.id,conversation}},conversation.id);
    }else{
      const others=memberIds.filter(id=>id!==ownId());
      if(mode==='direct'&&others.length!==1){notify('Für einen Direktchat wähle genau eine weitere Person.','error');return;}
      if(mode==='group'&&others.length<2){notify('Für einen Gruppenchat wähle mindestens zwei weitere Personen.','error');return;}
      const sorted=[...memberIds].sort();
      const existing=visible().find(conversation=>conversation.type==='direct'&&[...items(conversation.participantIds)].sort().join('|')===sorted.join('|'));
      if(existing){window.collabSelectConversation(existing.id,'chats');window.collabCloseModal('collabConversationModal');return;}
      const conversation={id:uid('CHAT'),type:'direct',title:title||(mode==='direct'?(accountById(others[0])?.name||'Direktchat'):'Gruppenchat'),description,participantIds:memberIds,contextLinks:[],audience:'internal',externalReleaseRequired:false,readAtBy:{},messages:[],createdAt:now(),updatedAt:now(),status:'active',version:1};
      chat().conversations.push(conversation);
      chat().selectedConversationId=conversation.id;
      suite().ui.area='chats';
      api.audit?.('Teamarbeit-Unterhaltung erstellt',{entityId:conversation.id,summary:(mode==='group'?'Gruppenchat':'Direktchat')+' erstellt.'});
      await api.enqueue?.({operation:'conversation.create',payload:{conversation}},conversation.id);
    }
    api.persist?.();
    window.collabCloseModal('collabConversationModal');
    api.refresh?.();
  };

  window.collabOpenTeamDialog=()=>{
    if(!managing()){notify('Nur Admins können Teams anlegen.','error');return;}
    const id='collabTeamModal';
    openModal(id,modalHead('Neues Team','Team anlegen','Teams bündeln dauerhafte Kanäle, Mitglieder, Aufgaben und Besprechungen.',id)+'<form onsubmit="collabCreateTeam(event)"><div class="collab-modal-grid"><label class="wide">Teamname<input name="name" maxlength="120" required placeholder="z. B. Prüftechnik Süd"></label><label class="wide">Beschreibung<textarea name="description" maxlength="500" placeholder="Zweck und Zuständigkeit des Teams"></textarea></label><label class="wide">Mitglieder<div class="collab-choice-list">'+memberChoices([ownId()],[ownId()])+'</div></label></div><div class="modal-actions"><button type="button" class="secondary" onclick="collabCloseModal(\''+id+'\')">Abbrechen</button><button type="submit" class="primary">Team anlegen</button></div></form>','collab-modal');
  };
  window.collabCreateTeam=async event=>{
    event.preventDefault();
    const form=event.currentTarget;
    const name=text(form.elements.name.value).slice(0,120);
    if(!name)return;
    if(suite().teams.some(team=>team.name.toLocaleLowerCase('de')===name.toLocaleLowerCase('de'))){notify('Ein Team mit diesem Namen existiert bereits.','error');return;}
    const memberIds=unique([ownId(),...Array.from(form.querySelectorAll('input[name="members"]:checked')).map(input=>input.value)]);
    const team={id:uid('TEAM'),name,description:text(form.elements.description.value).slice(0,500),memberIds,ownerIds:[ownId()],channelIds:[],createdAt:now(),updatedAt:now()};
    suite().teams.push(team);
    const general=createChannel(team,{title:'Allgemein',description:'Gemeinsame Beiträge und Informationen.',memberIds});
    chat().selectedConversationId=general.id;
    suite().ui.area='teams';
    api.audit?.('Team erstellt',{entityId:team.id,summary:'Team '+name+' mit Kanal Allgemein angelegt.'});
    await api.enqueue?.({operation:'workspace.create',payload:{team,conversation:general}},team.id);
    api.persist?.();
    window.collabCloseModal('collabTeamModal');
    api.refresh?.();
  };
  window.collabOpenChannelDialog=teamId=>{
    if(!managing()){notify('Nur Admins können Kanäle anlegen.','error');return;}
    const team=teamById(teamId);
    if(!team)return;
    const id='collabChannelModal';
    openModal(id,modalHead('Neuer Kanal',team.name,'Standardkanäle sind für das ganze Team sichtbar. Private Kanäle erhalten eine eigene Mitgliederliste.',id)+'<form onsubmit="collabCreateChannel(event,\''+esc(team.id)+'\')"><div class="collab-modal-grid"><label>Name<input name="name" maxlength="120" required placeholder="z. B. Terminplanung"></label><label>Sichtbarkeit<select name="kind"><option value="standard">Standard</option><option value="private">Privat</option></select></label><label class="wide">Beschreibung<textarea name="description" maxlength="500"></textarea></label><label class="wide">Mitglieder für privaten Kanal<div class="collab-choice-list">'+memberChoices(team.memberIds,[])+'</div></label></div><div class="modal-actions"><button type="button" class="secondary" onclick="collabCloseModal(\''+id+'\')">Abbrechen</button><button type="submit" class="primary">Kanal erstellen</button></div></form>','collab-modal');
  };
  window.collabCreateChannel=async(event,teamId)=>{
    event.preventDefault();
    const team=teamById(teamId);
    if(!team)return;
    const form=event.currentTarget;
    const title=text(form.elements.name.value).slice(0,120);
    const kind=form.elements.kind.value==='private'?'private':'standard';
    const memberIds=kind==='private'?unique(Array.from(form.querySelectorAll('input[name="members"]:checked')).map(input=>input.value)):team.memberIds;
    if(!title)return;
    const conversation=createChannel(team,{title,description:text(form.elements.description.value).slice(0,500),kind,memberIds});
    chat().selectedConversationId=conversation.id;
    api.audit?.('Kanal erstellt',{entityId:conversation.id,summary:'Kanal '+title+' erstellt.'});
    await api.enqueue?.({operation:'channel.create',payload:{teamId,conversation}},conversation.id);
    api.persist?.();
    window.collabCloseModal('collabChannelModal');
    api.refresh?.();
  };
  window.collabOpenMembers=id=>{
    const conversation=visibleConversationById(id);
    if(!conversation){notify('Dieser Chat oder Kanal ist nicht verfügbar.','error');return;}
    const team=conversation?teamById(conversation.teamId):null;
    const members=team?team.memberIds:items(conversation?.participantIds);
    const modalId='collabMembersModal';
    const manage=Boolean(team&&managing());
    openModal(modalId,modalHead('Mitglieder',team?team.name:conversationTitle(conversation),manage?'Ändere die Teammitglieder. Standardkanäle übernehmen diese Liste automatisch.':'Mitglieder dieses Chats oder Kanals.',modalId)+(manage?'<form onsubmit="collabSaveTeamMembers(event,\''+esc(team.id)+'\')"><div class="collab-choice-list">'+memberChoices(members,[])+'</div><div class="modal-actions"><button type="button" class="secondary" onclick="collabCloseModal(\''+modalId+'\')">Abbrechen</button><button type="submit" class="primary">Mitglieder speichern</button></div></form>':'<div class="collab-choice-list">'+members.map(memberId=>'<div class="collab-choice">'+avatar(accountById(memberId),'compact')+'<span>'+esc(accountById(memberId)?.name||memberId)+'<small> · '+esc(accountById(memberId)?.role||'Mitglied')+'</small></span></div>').join('')+'</div>'),'collab-modal');
  };
  window.collabSaveTeamMembers=async(event,teamId)=>{
    event.preventDefault();
    const team=teamById(teamId);
    if(!team)return;
    const memberIds=unique(Array.from(event.currentTarget.querySelectorAll('input[name="members"]:checked')).map(input=>input.value));
    if(!memberIds.length){notify('Ein Team benötigt mindestens ein Mitglied.','error');return;}
    team.memberIds=memberIds;
    items(chat().conversations).filter(conversation=>conversation.type==='team_channel'&&conversation.teamId===team.id&&conversation.channelKind!=='private').forEach(conversation=>{conversation.participantIds=[...memberIds];});
    api.audit?.('Teammitglieder geändert',{entityId:team.id,summary:memberIds.length+' Mitglieder zugewiesen.'});
    await api.enqueue?.({operation:'workspace.members.patch',payload:{teamId,memberIds}},team.id);
    api.persist?.();
    window.collabCloseModal('collabMembersModal');
    api.refresh?.();
  };

  window.collabOpenMeetingDialog=(conversationId='',meetingId='')=>{
    const id='collabMeetingModal';
    const existing=items(suite().meetings).find(meeting=>meeting.id===meetingId)||null;
    if(meetingId&&(!existing||!meetingIsVisible(existing))){notify('Diese Besprechung ist nicht verfügbar.','error');return;}
    const requestedConversationId=text(conversationId);
    const conversation=requestedConversationId?visibleConversationById(requestedConversationId):(existing?visibleConversationById(existing.conversationId):selectedConversation());
    if(requestedConversationId&&!conversation){notify('Der verknüpfte Chat oder Kanal ist nicht verfügbar.','error');return;}
    if(existing&&text(existing.conversationId)&&!conversation){notify('Diese Besprechung kann nur im verknüpften Chat oder Kanal bearbeitet werden.','error');return;}
    const start=existing?new Date(existing.startAt):new Date(Date.now()+60*60*1000);
    const localDate=start.toISOString().slice(0,10);
    const localTime=start.toTimeString().slice(0,5);
    const selected=existing?.attendeeIds?.length?existing.attendeeIds:items(conversation?.participantIds).length?conversation.participantIds:[ownId()];
    openModal(id,modalHead(existing?'Besprechung bearbeiten':'Besprechung planen',conversation?conversationTitle(conversation):'Teamarbeit','Besprechungen werden im Kalender und im zugehörigen Chat oder Kanal verknüpft.',id)+'<form onsubmit="collabSaveMeeting(event,\''+esc(conversation?.id||'')+'\',\''+esc(existing?.id||'')+'\')"><div class="collab-modal-grid"><label class="wide">Titel<input name="title" maxlength="180" required value="'+esc(existing?.title||((conversation?conversationTitle(conversation)+' – ':'')+'Besprechung'))+'"></label><label>Datum<input name="date" type="date" required value="'+esc(localDate)+'"></label><label>Uhrzeit<input name="time" type="time" required value="'+esc(localTime)+'"></label><label>Dauer<select name="duration"><option value="30" '+(Number(existing?.duration||30)===30?'selected':'')+'>30 Minuten</option><option value="45" '+(Number(existing?.duration)===45?'selected':'')+'>45 Minuten</option><option value="60" '+(Number(existing?.duration)===60?'selected':'')+'>60 Minuten</option><option value="90" '+(Number(existing?.duration)===90?'selected':'')+'>90 Minuten</option></select></label><label>Verknüpfter Chat / Kanal<select name="conversationId"><option value="">Ohne direkten Chat</option>'+conversationChoices().replace('value="'+esc(conversation?.id||'')+'"','value="'+esc(conversation?.id||'')+'" selected')+'</select></label><label class="wide">Agenda / Notiz<textarea name="notes" maxlength="2000">'+esc(existing?.notes||'')+'</textarea></label><label class="wide">Teilnehmer*innen<div class="collab-choice-list">'+memberChoices(selected,[])+'</div></label></div><div class="modal-actions"><button type="button" class="secondary" onclick="collabCloseModal(\''+id+'\')">Abbrechen</button><button type="submit" class="primary">Besprechung speichern</button></div></form>','collab-modal');
  };
  window.collabSaveMeeting=async(event,defaultConversationId,meetingId)=>{
    event.preventDefault();
    const form=event.currentTarget;
    const selectedConversationId=text(form.elements.conversationId.value||defaultConversationId);
    const conversation=selectedConversationId?visibleConversationById(selectedConversationId):null;
    if(selectedConversationId&&!conversation){notify('Der verknüpfte Chat oder Kanal ist nicht verfügbar.','error');return;}
    const start=new Date(text(form.elements.date.value)+'T'+text(form.elements.time.value));
    if(Number.isNaN(start.getTime())){notify('Datum und Uhrzeit sind ungültig.','error');return;}
    const attendees=unique(Array.from(form.querySelectorAll('input[name="members"]:checked')).map(input=>input.value));
    const data=suite();
    let meeting=items(data.meetings).find(item=>item.id===meetingId);
    if(meeting&&!meetingIsVisible(meeting)){notify('Diese Besprechung ist nicht verfügbar.','error');return;}
    const isNew=!meeting;
    if(!meeting){meeting={id:uid('MEETING'),createdAt:now(),createdBy:ownId(),status:'scheduled'};data.meetings.unshift(meeting);}
    Object.assign(meeting,{title:text(form.elements.title.value).slice(0,180),conversationId:conversation?.id||'',teamId:conversation?.teamId||'',startAt:start.toISOString(),duration:Math.max(15,Number(form.elements.duration.value)||30),attendeeIds:attendees,notes:text(form.elements.notes.value).slice(0,2000),updatedAt:now()});
    if(!Array.isArray(state.calendarEvents))state.calendarEvents=[];
    let calendarEvent=state.calendarEvents.find(item=>item?.meetingId===meeting.id);
    const date=text(form.elements.date.value),startTime=text(form.elements.time.value);
    const endDate=new Date(start.getTime()+meeting.duration*60000);
    const endTime=endDate.toTimeString().slice(0,5);
    const eventData={id:calendarEvent?.id||uid('EVT'),meetingId:meeting.id,title:meeting.title,startDate:date,startTime,endDate:endDate.toISOString().slice(0,10),endTime,allDay:false,calendar:'team',availability:'busy',repeat:'never',alert:'15',location:'Online · INGTEC Teamarbeit',attendees:attendees.map(id=>accountById(id)?.name||id).join(', '),videoLink:'ingtec://meeting/'+meeting.id,notes:meeting.notes,conversationId:meeting.conversationId,createdAt:calendarEvent?.createdAt||now(),updatedAt:now()};
    if(calendarEvent)Object.assign(calendarEvent,eventData);else state.calendarEvents.push(eventData);
    api.audit?.(isNew?'Besprechung geplant':'Besprechung bearbeitet',{entityId:meeting.id,summary:meeting.title+' · '+meetingDate(meeting.startAt)});
    await api.enqueue?.({operation:isNew?'meeting.create':'meeting.patch',payload:{meeting}},meeting.id);
    api.persist?.();
    window.collabCloseModal('collabMeetingModal');
    suite().ui.area='meetings';
    api.refresh?.();
  };

  let callStream=null;
  let screenStream=null;
  function stopStream(stream){items(stream?.getTracks?.()).forEach(track=>track.stop());}
  const callIcons={
    microphone:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z"/><path d="M18 11v1a6 6 0 0 1-12 0v-1M12 18v3M9 21h6"/></svg>',
    camera:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 10l4-2v8l-4-2v-4Z"/><rect x="3" y="6" width="12" height="12" rx="3"/></svg>',
    screen:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    hangup:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 14.3a12.2 12.2 0 0 1 13.6 0l1.2.8-2.2 3.4-3.3-1.6.4-2.1a8.8 8.8 0 0 0-5.8 0l.4 2.1-3.3 1.6L4 15.1l1.2-.8Z"/></svg>'
  };
  function setCallControlState(control,active){
    const button=document.querySelector('[data-call-control="'+control+'"]');
    button?.classList.toggle('is-active',Boolean(active));
    button?.setAttribute('aria-pressed',String(Boolean(active)));
  }
  function setPreview(stream){
    const video=document.getElementById('collabMeetingPreview');
    const placeholder=document.getElementById('collabMeetingPlaceholder');
    if(video&&stream){video.srcObject=stream;video.hidden=false;video.play?.().catch(()=>{});if(placeholder)placeholder.hidden=true;}
  }
  window.collabStartMeeting=(meetingId='',conversationId='')=>{
    const data=suite();
    let meeting=items(data.meetings).find(item=>item.id===meetingId)||null;
    if(meeting&&!meetingIsVisible(meeting)){notify('Diese Besprechung ist nicht verfügbar.','error');return;}
    if(!meeting){
      const requestedConversationId=text(conversationId);
      const conversation=requestedConversationId?visibleConversationById(requestedConversationId):selectedConversation();
      if(requestedConversationId&&!conversation){notify('Der verknüpfte Chat oder Kanal ist nicht verfügbar.','error');return;}
      meeting={id:uid('MEETING'),title:(conversation?conversationTitle(conversation)+' – ':'')+'Sofortbesprechung',conversationId:conversation?.id||'',teamId:conversation?.teamId||'',startAt:now(),duration:60,attendeeIds:items(conversation?.participantIds).length?conversation.participantIds:[ownId()],notes:'',status:'active',createdAt:now(),createdBy:ownId()};
      data.meetings.unshift(meeting);
    }
    meeting.status='active';
    meeting.startedAt=meeting.startedAt||now();
    data.activeMeetingId=meeting.id;
    api.audit?.('Besprechung gestartet',{entityId:meeting.id,summary:meeting.title});
    api.persist?.();
    renderSuite();
    window.collabOpenMeetingRoom(meeting.id);
  };
  window.collabOpenMeetingRoom=meetingId=>{
    const meeting=items(suite().meetings).find(item=>item.id===meetingId);
    if(!meeting||!meetingIsVisible(meeting)){notify('Diese Besprechung ist nicht verfügbar.','error');return;}
    if(meeting.status!=='active'){meeting.status='active';suite().activeMeetingId=meeting.id;api.persist?.();}
    const id='collabMeetingRoom';
    openModal(id,modalHead('Besprechung läuft',meeting.title,'Aktiviere Kamera, Mikrofon oder Bildschirmfreigabe für deinen lokalen Besprechungsplatz.',id)+'<div class="collab-stage"><video id="collabMeetingPreview" autoplay muted playsinline hidden></video><div id="collabMeetingPlaceholder" class="collab-stage-placeholder"><i>◉</i><b>Bereit zum Beitreten</b><span>Dein Video wird erst nach deiner Freigabe aktiviert.</span></div></div><div class="collab-call-controls"><button type="button" data-call-control="microphone" aria-pressed="false" onclick="collabToggleMicrophone()"><span class="collab-call-icon">'+callIcons.microphone+'</span><span>Mikrofon</span></button><button type="button" data-call-control="camera" aria-pressed="false" onclick="collabToggleCamera()"><span class="collab-call-icon">'+callIcons.camera+'</span><span>Kamera</span></button><button type="button" data-call-control="screen" aria-pressed="false" onclick="collabShareScreen()"><span class="collab-call-icon">'+callIcons.screen+'</span><span>Bildschirm</span></button><button type="button" class="danger" onclick="collabLeaveMeeting(\''+esc(meeting.id)+'\')"><span class="collab-call-icon">'+callIcons.hangup+'</span><span>Auflegen</span></button></div><p class="collab-call-note">Für eine Live-Mehrpersonenverbindung wird der zentrale Konferenzdienst verwendet. Der lokale Besprechungsplatz kann Kamera, Mikrofon und Bildschirm sicher erst nach deiner Browserfreigabe bereitstellen.</p>','collab-meeting-room');
  };
  window.collabToggleCamera=async()=>{
    try{
      if(!callStream){callStream=await navigator.mediaDevices.getUserMedia({audio:true,video:true});setPreview(callStream);setCallControlState('camera',true);setCallControlState('microphone',true);notify('Kamera und Mikrofon sind für deinen lokalen Besprechungsplatz aktiv.');return;}
      const tracks=callStream.getVideoTracks();
      if(!tracks.length){const video=await navigator.mediaDevices.getUserMedia({video:true});video.getVideoTracks().forEach(track=>callStream.addTrack(track));setPreview(callStream);setCallControlState('camera',true);return;}
      tracks.forEach(track=>{track.enabled=!track.enabled;});
      setCallControlState('camera',tracks[0].enabled);
      notify(tracks[0].enabled?'Kamera aktiviert.':'Kamera deaktiviert.');
    }catch(error){notify('Kamera konnte nicht aktiviert werden: '+(error.message||''),'error');}
  };
  window.collabToggleMicrophone=async()=>{
    try{
      if(!callStream){callStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});setPreview(callStream);setCallControlState('microphone',true);notify('Mikrofon ist aktiv.');return;}
      const tracks=callStream.getAudioTracks();
      if(!tracks.length){const audio=await navigator.mediaDevices.getUserMedia({audio:true});audio.getAudioTracks().forEach(track=>callStream.addTrack(track));setCallControlState('microphone',true);return;}
      tracks.forEach(track=>{track.enabled=!track.enabled;});
      setCallControlState('microphone',tracks[0].enabled);
      notify(tracks[0].enabled?'Mikrofon aktiviert.':'Mikrofon stummgeschaltet.');
    }catch(error){notify('Mikrofon konnte nicht aktiviert werden: '+(error.message||''),'error');}
  };
  window.collabShareScreen=async()=>{
    try{
      if(!navigator.mediaDevices?.getDisplayMedia){notify('Bildschirmfreigabe wird von diesem Browser nicht unterstützt.','error');return;}
      stopStream(screenStream);
      screenStream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
      setPreview(screenStream);
      setCallControlState('screen',true);
      screenStream.getVideoTracks()[0]?.addEventListener('ended',()=>{setCallControlState('screen',false);if(callStream)setPreview(callStream);});
      notify('Bildschirmfreigabe gestartet.');
    }catch(error){if(error?.name!=='NotAllowedError')notify('Bildschirmfreigabe konnte nicht gestartet werden: '+(error.message||''),'error');}
  };
  window.collabLeaveMeeting=meetingId=>{
    const meeting=items(suite().meetings).find(item=>item.id===meetingId);
    if(!meeting||!meetingIsVisible(meeting)){notify('Diese Besprechung ist nicht verfügbar.','error');return;}
    stopStream(callStream);stopStream(screenStream);callStream=null;screenStream=null;
    meeting.status='ended';meeting.endedAt=now();
    suite().activeMeetingId='';
    api.audit?.('Besprechung beendet',{entityId:meetingId,summary:meeting?.title||'Besprechung'});
    api.persist?.();
    window.collabCloseModal('collabMeetingRoom');
    api.refresh?.();
  };

  window.collabOpenTaskDialog=taskId=>{
    const id='collabTaskModal';
    const existing=items(chat().tasks).find(task=>task?.id===taskId)||null;
    if(taskId&&(!existing||!taskIsVisible(existing))){notify('Diese Aufgabe ist nicht verfügbar.','error');return;}
    const conversation=selectedConversation();
    const ownerOptions='<option value="">Nicht zugewiesen</option>'+accounts().map(account=>'<option value="'+esc(account.id)+'" '+(account.id===existing?.ownerId?'selected':'')+'>'+esc(account.name)+'</option>').join('');
    openModal(id,modalHead(existing?'Aufgabe bearbeiten':'Neue Aufgabe',existing?'Änderungen bleiben im Teamarbeitsbereich nachvollziehbar.':'Erstelle eine Aufgabenkarte und ordne sie bei Bedarf dem aktuellen Chat oder Kanal zu.',id)+'<form onsubmit="collabSaveTask(event,\''+esc(existing?.id||'')+'\')"><div class="collab-modal-grid"><label class="wide">Titel<input name="title" maxlength="180" required value="'+esc(existing?.title||'')+'"></label><label class="wide">Beschreibung<textarea name="description" maxlength="4000">'+esc(existing?.description||'')+'</textarea></label><label>Verantwortlich<select name="ownerId">'+ownerOptions+'</select></label><label>Frist<input name="due" type="date" value="'+esc(existing?.due||'')+'"></label><label>Priorität<select name="priority">'+['Normal','Wichtig','Dringend'].map(value=>'<option '+(value===(existing?.priority||'Normal')?'selected':'')+'>'+value+'</option>').join('')+'</select></label><label>Status<select name="status">'+['Offen','In Arbeit','Erledigt'].map(value=>'<option '+(value===(existing?.status||'Offen')?'selected':'')+'>'+value+'</option>').join('')+'</select></label><label class="wide">Chat oder Kanal<select name="conversationId"><option value="">Nicht direkt verknüpft</option>'+conversationChoices().replace('value="'+esc(existing?.conversationId||conversation?.id||'')+'"','value="'+esc(existing?.conversationId||conversation?.id||'')+'" selected')+'</select></label></div><div class="modal-actions"><button type="button" class="secondary" onclick="collabCloseModal(\''+id+'\')">Abbrechen</button><button type="submit" class="primary">Speichern</button></div></form>','collab-modal');
  };
  window.collabSaveTask=async(event,taskId)=>{
    event.preventDefault();
    const form=event.currentTarget;
    let task=items(chat().tasks).find(item=>item?.id===taskId);
    if(task&&!taskIsVisible(task)){notify('Diese Aufgabe ist nicht verfügbar.','error');return;}
    const conversationId=text(form.elements.conversationId.value);
    if(conversationId&&!visibleConversationById(conversationId)){notify('Der verknüpfte Chat oder Kanal ist nicht verfügbar.','error');return;}
    const isNew=!task;
    if(!task){task={id:uid('TASK'),createdAt:now(),createdBy:ownId(),sourceMessageId:''};chat().tasks.unshift(task);}
    Object.assign(task,{title:text(form.elements.title.value).slice(0,180),description:text(form.elements.description.value).slice(0,4000),ownerId:text(form.elements.ownerId.value),due:text(form.elements.due.value),priority:text(form.elements.priority.value)||'Normal',status:text(form.elements.status.value)||'Offen',conversationId,updatedAt:now()});
    api.audit?.(isNew?'Aufgabe erstellt':'Aufgabe geändert',{entityId:task.id,summary:task.title});
    await api.enqueue?.({operation:isNew?'task.create':'task.patch',payload:{task}},task.id);
    api.persist?.();
    window.collabCloseModal('collabTaskModal');
    api.refresh?.();
  };
  window.collabSetTaskStatus=async(taskId,status)=>{
    const task=items(chat().tasks).find(item=>item?.id===taskId);
    if(!task||!taskIsVisible(task)){notify('Diese Aufgabe ist nicht verfügbar.','error');return;}
    task.status=status;
    task.updatedAt=now();
    api.audit?.('Aufgabenstatus geändert',{entityId:task.id,summary:task.title+' → '+status});
    await api.enqueue?.({operation:'task.patch',payload:{task}},task.id);
    api.persist?.();
    api.refresh?.();
  };

  function runCollaborationSuiteTests(){
    const actions=[
      ['Datei anfügen','attachment'],
      ['Foto aufnehmen','camera'],
      ['Sprachnotiz','microphone']
    ];
    const fixture=document.createElement('div');
    fixture.innerHTML='<div class="collab-composer-actions">'+actions.map(([label])=>'<button type="button" aria-label="'+label+'">Alt</button>').join('')+'<button type="button" aria-label="Mitglied erwähnen">@</button></div>';
    applyComposerActionIcons(fixture);
    const buttons=[...fixture.querySelectorAll('button')];
    const startupIconCss=document.getElementById('chat-composer-icon-compat')?.textContent||'';
    const results=[
      {name:'Chat-Aktionen verwenden eindeutige Outline-SVGs',passed:buttons.slice(0,3).every((button,index)=>button.classList.contains('collab-composer-action')&&button.querySelector('svg.collab-composer-icon[viewBox="0 0 24 24"][aria-hidden="true"]')&&button.getAttribute('aria-label')===actions[index][0])},
      {name:'Nur Anhang, Kamera und Mikrofon erhalten neue Symbole',passed:buttons[3]?.textContent==='@'&&!buttons[3]?.classList.contains('collab-composer-action')},
      {name:'Chat-V2-Startansicht verwendet dieselben Symbole',passed:actions.every(([label])=>startupIconCss.includes('[aria-label="'+label+'"]'))},
      {name:'Chat-Suite wird beim ersten Öffnen aktiviert',passed:(()=>{const page=document.createElement('section');page.classList.add('active');let calls=0;const activated=renderSuiteWhenChatActivated(page,()=>{calls+=1;});page.dataset.collaborationSuite='true';return activated&&calls===1&&!renderSuiteWhenChatActivated(page,()=>{calls+=1;})&&calls===1;})()}
    ];
    return {passed:results.every(result=>result.passed),tests:results};
  }
  function rerenderSoon(){setTimeout(renderSuite,0);}
  ['chatV2SelectFiles','chatV2RemoveQueuedAttachment','chatV2ClearComposerContext','chatV2InsertMention','chatV2ToggleVoice'].forEach(name=>{
    const original=window[name];
    if(typeof original!=='function'||original.__collabWrapped)return;
    const wrapped=function(){const result=original.apply(this,arguments);Promise.resolve(result).finally(rerenderSoon);return result;};
    wrapped.__collabWrapped=true;
    window[name]=wrapped;
  });
  const legacyRender=window.renderAll;
  if(!legacyRender.__collaborationSuiteWrapped){
    const wrapped=function(){const result=legacyRender.apply(this,arguments);observeChatPageActivation();renderSuite();return result;};
    wrapped.__collaborationSuiteWrapped=true;
    window.renderAll=wrapped;
  }
  suite();
  const collaborationSuiteTests=runCollaborationSuiteTests();
  window.runCollaborationSuiteTests=runCollaborationSuiteTests;
  window.__INGTEC_COLLABORATION_TESTS__=collaborationSuiteTests;
  document.documentElement.dataset.collaborationTests=collaborationSuiteTests.passed?'passed':'failed';
  observeChatPageActivation();
  renderSuite();
})();
