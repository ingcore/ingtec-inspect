/* INGTEC report PDF generator – dependency-free and offline capable. */
(()=>{
  'use strict';

  const PAGE={width:595.28,height:841.89,left:48,right:547,top:793,bottom:50};
  const CP1252={
    '€':128,'‚':130,'ƒ':131,'„':132,'…':133,'†':134,'‡':135,'ˆ':136,'‰':137,'Š':138,'‹':139,'Œ':140,'Ž':142,
    '‘':145,'’':146,'“':147,'”':148,'•':149,'–':150,'—':151,'˜':152,'™':153,'š':154,'›':155,'œ':156,'ž':158,'Ÿ':159
  };

  const clean=value=>String(value==null?'':value).replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
  const number=value=>Number(value).toFixed(2);

  function winAnsi(character){
    const code=character.codePointAt(0);
    if(code>=32&&code<=126)return code;
    if(code>=160&&code<=255)return code;
    return CP1252[character]??63;
  }

  function literal(value){
    let output='';
    for(const character of clean(value)){
      const byte=winAnsi(character);
      if(byte===40||byte===41||byte===92)output+='\\'+String.fromCharCode(byte);
      else if(byte>=32&&byte<=126)output+=String.fromCharCode(byte);
      else output+='\\'+byte.toString(8).padStart(3,'0');
    }
    return output;
  }

  function wrap(value,limit=88){
    const words=clean(value).split(' ').filter(Boolean);
    if(!words.length)return [''];
    const lines=[];
    let line='';
    for(let word of words){
      while(word.length>limit){
        if(line){lines.push(line);line='';}
        lines.push(word.slice(0,limit));
        word=word.slice(limit);
      }
      const candidate=line?line+' '+word:word;
      if(candidate.length<=limit)line=candidate;
      else{if(line)lines.push(line);line=word;}
    }
    if(line)lines.push(line);
    return lines;
  }

  function textCommand({x,y,size,font='F1',text,color='0.10 0.12 0.15'}){
    return color+' rg\nBT\n/'+font+' '+number(size)+' Tf\n1 0 0 1 '+number(x)+' '+number(y)+' Tm\n('+literal(text)+') Tj\nET\n';
  }

  function ruleCommand(y,color='0.78 0.88 0.34'){
    return color+' RG\n1.4 w\n'+number(PAGE.left)+' '+number(y)+' m\n'+number(PAGE.right)+' '+number(y)+' l\nS\n';
  }

  function buildDocument(model){
    const source=model&&typeof model==='object'?model:{};
    const pages=[];
    let commands=[];
    let y=PAGE.top;

    function startPage(){
      commands=[];
      pages.push(commands);
      y=PAGE.top;
      if(pages.length>1){
        commands.push(textCommand({x:PAGE.left,y,font:'F2',size:8.5,text:source.runningTitle||source.title||'INGTEC Bericht',color:'0.31 0.39 0.03'}));
        commands.push(ruleCommand(y-8,'0.85 0.88 0.78'));
        y-=25;
      }
    }

    function reserve(height){
      if(y-height<PAGE.bottom)startPage();
    }

    function line(value,{size=10.5,font='F1',color='0.10 0.12 0.15',gap=4}={}){
      const height=size*1.42+gap;
      reserve(height);
      commands.push(textCommand({x:PAGE.left,y,size,font,text:value,color}));
      y-=height;
    }

    function paragraph(value,options={}){
      const size=options.size??10.5;
      const limit=options.limit??88;
      for(const row of wrap(value,limit))line(row,{...options,size});
    }

    function heading(value){
      reserve(34);
      y-=7;
      line(value,{size:13.5,font:'F2',color:'0.19 0.28 0.03',gap:6});
    }

    startPage();
    line(source.title||'INGTEC Bericht',{size:23,font:'F2',color:'0.19 0.28 0.03',gap:4});
    if(source.subtitle)line(source.subtitle,{size:11,font:'F1',color:'0.35 0.42 0.48',gap:5});
    commands.push(ruleCommand(y-2));
    y-=18;
    if(source.meta)paragraph(source.meta,{size:9.5,color:'0.30 0.35 0.40',gap:2});
    if(source.score){
      y-=5;
      paragraph(source.score,{size:12,font:'F2',color:'0.23 0.34 0.04',gap:3});
    }
    if(source.note){
      y-=5;
      paragraph(source.note,{size:9.5,color:'0.24 0.29 0.34',gap:2});
    }

    for(const section of Array.isArray(source.sections)?source.sections:[]){
      heading(section?.title||'Abschnitt');
      if(section?.intro)paragraph(section.intro,{size:9.5,color:'0.31 0.36 0.41',gap:2});
      const rows=Array.isArray(section?.rows)?section.rows:[];
      if(!rows.length){paragraph('Keine Einträge vorhanden.',{size:10,color:'0.36 0.41 0.46'});continue;}
      for(const row of rows){
        if(row?.title)paragraph(row.title,{size:10.5,font:'F2',color:'0.12 0.16 0.19',gap:1});
        for(const detail of Array.isArray(row?.details)?row.details:[]){
          const isRich=detail&&typeof detail==='object';
          paragraph(isRich?detail.text:detail,{size:isRich&&detail.size||9.5,font:isRich&&detail.bold?'F2':'F1',color:(isRich&&detail.color)||'0.30 0.35 0.40',gap:1,limit:91});
        }
        y-=3;
      }
    }

    if(source.footer){
      y-=4;
      paragraph(source.footer,{size:8.5,color:'0.38 0.43 0.48',gap:1,limit:94});
    }

    pages.forEach((page,index)=>{
      page.push(ruleCommand(39,'0.85 0.88 0.78'));
      page.push(textCommand({x:PAGE.left,y:26,size:8,font:'F1',text:'INGTEC Inspect · Seite '+(index+1)+' von '+pages.length,color:'0.42 0.46 0.50'}));
    });
    return pages.map(page=>page.join(''));
  }

  function buildPdf(streams){
    const pageCount=Math.max(1,streams.length);
    const pageRefs=Array.from({length:pageCount},(_,index)=>5+index*2);
    const objects=[
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids ['+pageRefs.map(ref=>ref+' 0 R').join(' ')+'] /Count '+pageCount+' >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
    ];

    streams.forEach((stream,index)=>{
      const pageRef=pageRefs[index];
      const contentRef=pageRef+1;
      objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents '+contentRef+' 0 R >>');
      objects.push('<< /Length '+stream.length+' >>\nstream\n'+stream+'endstream');
    });

    let output='%PDF-1.4\n%INGTEC\n';
    const offsets=[0];
    objects.forEach((object,index)=>{
      offsets.push(output.length);
      output+=(index+1)+' 0 obj\n'+object+'\nendobj\n';
    });
    const xref=output.length;
    output+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
    offsets.slice(1).forEach(offset=>{output+=String(offset).padStart(10,'0')+' 00000 n \n';});
    output+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
    return output;
  }

  function create(model){
    const pdf=buildPdf(buildDocument(model));
    return new Blob([pdf],{type:'application/pdf'});
  }

  function download(model,filename){
    const blob=create(model);
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download=(clean(filename)||'INGTEC_Bericht')+'.pdf';
    link.style.display='none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    return blob;
  }

  window.INGTECPdf=Object.freeze({create,download});
})();
