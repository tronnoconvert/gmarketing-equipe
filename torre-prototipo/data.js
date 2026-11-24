/* ===== utilidades ===== */
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const F0=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}),F2=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const brl=v=>F0.format(Math.round(v)),brl2=v=>F2.format(v),num=v=>Math.round(v).toLocaleString('pt-BR'),dec=(v,d=1)=>(+v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const pct=(v,d=1)=>dec(v*100,d)+'%';
const pad=n=>String(n).padStart(2,'0'),dt=d=>`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`,dm=d=>`${pad(d.getDate())}/${pad(d.getMonth()+1)}`,hm=d=>`${pad(d.getHours())}:${pad(d.getMinutes())}`;
const DIA=864e5,HOJE=new Date(2026,10,23),T0=Date.now(),NOW=()=>new Date(new Date(2026,10,23,21,24).getTime()+(Date.now()-T0));
const addD=(d,n)=>new Date(d.getTime()+n*DIA);
const fmtDias=d=>{const n=Math.round((HOJE-d)/DIA);return n<=0?'hoje':n===1?'há 1 dia':`há ${n} dias`};
function rng(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const parseBR=s=>{s=String(s??'').replace(/R\$|\s|%/g,'');if(!s)return NaN;if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');return Number(s)};
const IC={radar:'<path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"/><path d="M4 6h.01"/><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"/><path d="M16.24 7.76A6 6 0 1 0 8.23 16.67"/><path d="M12 18h.01"/><path d="M17.99 11.66A6 6 0 0 1 15.77 16.67"/><circle cx="12" cy="12" r="2"/><path d="m13.41 10.59 5.66-5.66"/>',
 search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',chev:'<path d="m9 18 6-6-6-6"/>',x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
 check:'<path d="M20 6 9 17l-5-5"/>',alert:'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',lock:'<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
 wallet:'<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
 chat:'<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',target:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',percent:'<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',mouse:'<path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 2.2 8 5.1"/><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/>',
 pause:'<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',play:'<path d="M6 3l14 9-14 9z"/>',copy:'<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
 spark:'<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
 menu:'<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',cols:'<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',filter:'<path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"/>',
 sort:'<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',layers:'<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
 eye:'<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',vol:'<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
 list:'<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',ext:'<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
 home:'<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',chart:'<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',rocket:'<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>',
 shield:'<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>'};
IC.plus='<path d="M5 12h14"/><path d="M12 5v14"/>';IC.arrowr='<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>';IC.zap='<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>';
const ic=(n,c='')=>`<svg class="ic ${c}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]||''}</svg>`;

/* ===== equipe ===== */
const TEAM=[
 {id:'alan',nome:'Allan Vieira',papel:'Head de Tráfego',exec:'all',boost:true,c:['#5AB4FF','#0B6BE8']},
 {id:'vitor',nome:'Victor Bragança',papel:'Gestor de tráfego',exec:'own',c:['#8A5A3C','#4A3122']},
 {id:'vinicius',nome:'Vinícius Leão',papel:'Gestor de tráfego',exec:'own',c:['#64748B','#334155']},
 {id:'carol',nome:'Carol',papel:'Atendimento · só leitura',exec:'none',c:['#94A3B8','#475569']},
 {id:'franciele',nome:'Franciele',papel:'Atendimento · só leitura',exec:'none',c:['#B08A2E','#6B5418']},
 {id:'gabriel',nome:'Gabriel Leão',papel:'Admin · dono',exec:'all',boost:true,c:['#52525B','#18181B']},
 {id:'rayane',nome:'Rayane Leão',papel:'Admin',exec:'all',boost:true,c:['#78716C','#44403C']},
];
const P=id=>TEAM.find(t=>t.id===id);
const av=(id,cls='')=>{const t=P(id);return `<span class="av ${cls}" style="--c1:${t.c[0]};--c2:${t.c[1]}" title="${esc(t.nome)} · ${esc(t.papel)}">${t.nome.slice(0,2).toUpperCase()}</span>`};

/* ===== contas ===== */
const NOMES=['Clínica Dental Sorriso Vivo','Pizzaria Bella Massa','Studio Corpo Ativo','Imobiliária Lar Ideal','Ótica Nova Visão','Moura & Reis Advocacia','Moda Flor de Lis','Pet Shop Focinho Feliz','Fluent Way Idiomas','Construtora Base Forte','Café Raízes do Cerrado','Pele Nobre Dermatologia','Mecânica Pista Livre','Nutri Bruna Faria','Pousada Vale das Águas','Farmácia Saúde em Casa','Barbearia Corte Nobre','Colégio Aprender Mais','Hamburgueria Chapa Quente','Fisio Movimento Pleno','Pilates Essência','Odonto Mais Sorrisos','Estética Bela Forma','Escola de Música Acorde','Ótica Ponto de Vista','Imóveis Morada Nova','Pet Clube Patas','Autoescola Rota Certa','Buffet Doce Festa','Clínica Veterinária Bicho Bom'];
const NICHO=['Odontologia','Alimentação','Fitness','Imóveis','Varejo óptico','Jurídico','Moda','Pet','Educação','Construção','Cafeteria','Dermatologia','Automotivo','Nutrição','Turismo','Farmácia','Beleza masculina','Educação','Alimentação','Fisioterapia','Fitness','Odontologia','Estética','Educação','Varejo óptico','Imóveis','Pet','Educação','Eventos','Veterinária'];
const CONTATO=['Dra. Renata','Marcos','Ana Paula','Fernando','Sérgio','Dr. Henrique','Luana','Patrícia','Thiago','Eng. Ricardo','Tânia','Dra. Juliana','Wagner','Bruna','Cláudio','Márcia','Igor','Profa. Helena','Rodrigo','Dra. Camila','Mariana','Dr. Felipe','Jéssica','Prof. André','Rogério','Paula','Daniela','Sandro','Cristiane','Dr. Eduardo'];
const SEMS=['exc','bom','crit','bom','aten','exc','bom','caro','exc','bom','par','aten','bom','crit','exc','bom','caro','ins','bom','exc','aten','sem','bom','crit','exc','caro','bom','par','aten','exc'];
const ALVO={exc:.66,bom:.9,aten:1.15,caro:1.45,crit:1.95,par:1,sem:1,ins:.95};
const SEMF={crit:['Crítico','bad'],par:['Conta parada','par'],caro:['Caro','caro'],aten:['Atenção','warn'],ins:['Dados insuficientes','ins'],sem:['Sem CP de MSG','sem'],bom:['Bom','ok'],exc:['Excelente','ok']};
const SEV=['crit','par','caro','aten','ins','sem','bom','exc'];
const NDAYS=180;
const CONTAS=NOMES.map((nome,i)=>{
 const id=i+1,R=rng(id*7919+13),alvo=SEMS[i];
 const gest=i%7===3?'alan':i%2?'vinicius':'vitor';
 const meta=[8,9,11,7.5,15,8,10,12,8.5,6.5][i%10]+(i>19?1:0);
 const ref=Math.round((35+R()*220)*100)/100;
 const a={id,nome,nicho:NICHO[i],contato:CONTATO[i],gest,empresa:i%3===0?'Tronno':'G Marketing',meta,ref,alvo,
  act:'act_'+(2310000000000000+id*7349123+Math.floor(R()*9000)).toString(),perfil:'@'+nome.toLowerCase().normalize('NFD').replace(/[^a-z ]/g,'').split(' ').filter(w=>w.length>2).slice(0,2).join(''),
  lerDesde:new Date(2026,[1,3,4,6,7,8,9][i%7],[1,5,10,15][i%4]),form:i%3===1||alvo==='sem',series:[],camps:[],aud:[],recs:[],seed:R()};
 const pStart=alvo==='crit'?1.25:alvo==='caro'?1.1:alvo==='aten'?.95:ALVO[alvo]*1.05;
 const parDesde=alvo==='par'?(i===10?new Date(2026,10,9):new Date(2026,10,20)):null;a.parDesde=parDesde;
 const ctrB=.009+R()*.012,cpmB=18+R()*22,freqB=1.05+R()*.4;
 for(let k=NDAYS-1;k>=0;k--){const d=addD(HOJE,-k),t=Math.max(0,(29-k))/29,wd=d.getDay();
  let idx=(k>29?pStart*(1+.06*Math.sin(k/9)):pStart+(ALVO[alvo]-pStart)*Math.pow(t,1.4))*(.93+R()*.14);
  let sp=a.ref*(.82+R()*.34)*(wd===0?.85:wd===6?.9:1);
  if(parDesde&&d>=parDesde)sp=0;if(alvo==='ins'&&k>1)sp=0;if(a.lerDesde>d)sp=0;
  const impr=sp/cpmB*1000*(.9+R()*.2),reach=impr/(freqB+(k<14&&['aten','crit','caro'].includes(alvo)?.25:0)),clicks=impr*ctrB*(.85+R()*.3);
  let msgs=sp?Math.max(0,Math.round(sp/(meta*idx))):0;let leads=sp&&a.form?Math.round(sp*.3/(meta*1.7)*(.7+R()*.6)):0;
  if(alvo==='sem'){leads=sp?Math.round(sp/(meta*2.2)):0;msgs=0}
  a.series.push({d,sp:Math.round(sp*100)/100,impr:Math.round(impr),reach:Math.round(reach),clicks:Math.round(clicks),msgs,leads,v3:Math.round(impr*(.18+R()*.1))})}
 const last=n=>a.series.slice(-n),S=(arr,k)=>arr.reduce((s,x)=>s+x[k],0);
 a.conv3=S(last(3),'msgs');a.conv7=S(last(7),'msgs');a.verbaMsg3=alvo==='sem'?0:S(last(3),'sp');a.verbaMsg7=alvo==='sem'?0:S(last(7),'sp');
 a.verbaTotal7=S(last(7),'sp')+(i%4===0&&alvo!=='par'?Math.round(a.ref*.14*7*100)/100:0);
 a.cpc3=a.conv3?a.verbaMsg3/a.conv3:null;a.cpc7=a.conv7?a.verbaMsg7/a.conv7:null;a.gastoDia=a.verbaTotal7/7;a.indice=a.cpc3?a.cpc3/meta:null;
 /* semáforo: regras e limites da central de padrões (padroes.js) */{const k=classificar(a);a.sem=k.sem;a.indice=k.indice;a.base=k.base}
 a.contrato=i===10?'Pausado':'Ativo';a.statusOp=i===10?'Sem gasto no período':i===27?'Pagamento pendente':i===23?'Anúncio reprovado':i===21?'Sem campanha de mensagem':'OK';
 a.revisao=i===13?'Revisão com erro':i===17?'Aguardando':'Revisão feita';
 a.execucao=i===13?'23/11 06:00 · falhou':i===17?'agendada 24/11 06:00':'23/11 06:'+pad(1+i%9);
 a.atualizado=`23/11, 21:${pad(2+i%20)}`;
 a.fadiga=[4,13,16,20].includes(i)?'Saturado':[2,7,11,25,28].includes(i)?'Sinal inicial':'OK';
 const hb={exc:[86,95],bom:[72,85],aten:[56,68],caro:[44,55],crit:[21,37],par:[14,29],sem:[58,63],ins:[47,52]}[a.sem];a.health=Math.round(hb[0]+R()*(hb[1]-hb[0]));
 a.varCPC=+({exc:-2-R()*11,bom:-6+R()*11,aten:6+R()*9,caro:11+R()*13,crit:17+R()*24,par:0,sem:2.4,ins:0}[a.sem]).toFixed(1);
 a.diasSem=Math.round({exc:1+R()*2,bom:2+R()*4,aten:5+R()*4,caro:6+R()*4,crit:8+R()*6,par:12+R()*8,sem:4,ins:1}[a.sem]);
 a.churn=a.health<40?'Alto':a.health<60?'Médio':'Baixo';
 a.acao={exc:a.health>=89?'Escalar verba':'Nada a fazer',bom:'Nada a fazer',aten:a.fadiga==='Saturado'?'Trocar criativo':'Revisar público',caro:i===7?'Reduzir verba':'Trocar criativo',crit:i===2?'Falar com o cliente':i===13?'Verificar pixel/evento':'Trocar criativo',par:'Conta parada - verificar',sem:'Falar com o cliente',ins:'Aguardar dados'}[a.sem];
 a.alertas={crit:2+(i%2),par:2,caro:1,aten:i===4?1:0}[a.sem]||0;
 a.ultAlerta=a.alertas?addD(HOJE,-(a.alertas>1?0:1)):null;a.cpc1=a.alertas&&a.cpc3?a.cpc3*(.86+R()*.08):null;
 a.ultMsg=addD(HOJE,-Math.floor(1+R()*9));
 return a});
const conta=id=>CONTAS.find(a=>a.id===+id);
function diag(a){let t='[23/11] ';
 if(a.sem==='par')t+=`Sem gasto desde ${dm(a.parDesde)} (${Math.round((HOJE-a.parDesde)/DIA)} dias). Status no Meta: ${a.statusOp.toLowerCase()}. Nenhuma conversa nos últimos 3 dias.`;
 else if(a.sem==='sem')t+=`Nenhuma campanha de mensagem ativa. A conta gastou ${brl2(a.verbaTotal7)} em 7 dias em campanhas de cadastro no site, que não entram no semáforo.`;
 else if(a.sem==='ins'){const d=a.series.slice(-7).filter(x=>x.sp>0).length;t+=`Conta com ${d} dia${d===1?'':'s'} de veiculação e ${a.conv7} conversas. A Torre só classifica a partir de ${PD('torre.dadosInsuficientes.minDias')} dias e ${PD('torre.dadosInsuficientes.minConversas')} conversas.`}
 else t+=`Custo/conversa (3d): ${brl2(a.cpc3)} vs meta ${brl2(a.meta)} → índice ${dec(a.indice,2)} (${SEMF[a.sem][0]}). Conversas: ${a.conv3} em 3 dias, ${a.conv7} em 7 dias. CPC ${a.varCPC>=0?'+':''}${dec(a.varCPC)}% na semana.`;
 if(a.fadiga==='Saturado')t+=' Fadiga: frequência subindo (1,11→1,24), CTR caindo (1,42%→0,91%), CPC subindo.';
 else if(a.fadiga==='Sinal inicial')t+=' Fadiga: sinal inicial, frequência subindo (1,06→1,12).';
 if(a.statusOp==='Anúncio reprovado')t+=' 2 anúncios reprovados por política de saúde (antes e depois).';
 if(a.revisao==='Revisão com erro')t+=' A revisão das 06:00 falhou: token do Meta expirado.';
 t+=` → Ação: ${a.acao}.`;if(a.alertas)t+=` Alerta ${a.alertas}/3 enviado ${['ao gestor','à coordenação','ao Head de Tráfego (Alan)'][a.alertas-1]}.`;return t}
function msgCli(a){const n=a.contato.replace(/^(Dra?\.|Eng\.|Profa?\.)\s/,'');
 if(a.statusOp==='Pagamento pendente')return `Oi, ${n}! Tudo bem?\nOs anúncios pararam de rodar desde ${dm(a.parDesde)} porque o Meta não conseguiu cobrar o cartão cadastrado.\nConsegue conferir o cartão ou trocar a forma de pagamento? Assim que normalizar, a gente reativa tudo no mesmo dia.`;
 if(a.sem==='par')return `Oi, ${n}! Tudo bem?\nComo combinado, os anúncios estão pausados desde ${dm(a.parDesde)}. Quando quiser retomar, me avisa por aqui que em até 2 horas está tudo no ar de novo.`;
 if(a.sem==='sem')return `Oi, ${n}! Resumo da semana: as campanhas de cadastro investiram ${brl(a.verbaTotal7)} nos últimos 7 dias.\nQue tal testarmos uma campanha de mensagens no WhatsApp? Posso te mandar uma proposta amanhã?`;
 if(a.sem==='ins')return `Oi, ${n}! Os anúncios entraram no ar há 2 dias e já chegaram as primeiras ${a.conv3} conversas. O Meta ainda está aprendendo, então o custo varia um pouco nestes dias. Sexta te mando o primeiro resumo.`;
 if(['exc','bom'].includes(a.sem))return `Oi, ${n}! Resumo da semana:\nForam ${a.conv7} conversas no WhatsApp, com custo médio de ${brl2(a.cpc7)} por conversa${a.cpc7<a.meta?` (meta: ${brl2(a.meta)})`:''}.\n${a.acao==='Escalar verba'?'Como está rendendo bem, sugiro aumentar um pouco o investimento para trazer mais conversas. Posso seguir?':'Seguimos acompanhando de perto. Qualquer dúvida, é só chamar.'}`;
 return `Oi, ${n}! Tudo bem?\nEssa semana o custo por conversa subiu para ${brl2(a.cpc3)} (a meta é ${brl2(a.meta)}). Já estamos ${a.acao==='Trocar criativo'?'trocando os criativos, que cansaram o público':a.acao==='Reduzir verba'?'reduzindo a verba nos conjuntos mais caros':a.acao==='Verificar pixel/evento'?'conferindo a configuração de conversas no Meta':'ajustando o público'}.\n${a.sem==='crit'?'Consegue confirmar se as conversas estão chegando e sendo respondidas no WhatsApp? Isso ajuda muito o resultado.':'Te atualizo na sexta com os números novos.'}`}
CONTAS.forEach(a=>{a.diag=diag(a);a.msg=msgCli(a)});

/* campanhas → conjuntos → anúncios */
const TEMAS=['Oferta principal','Remarketing 30d','Prova social','Bastidores','Depoimentos','Público frio'];
const PUBS=['Público quente · remarketing 30 dias','Interesses · {n}','Semelhante 1% · conversas','Raio 5 km · 25 a 55 anos','Aberto · Advantage+'];
const CTAS=['Enviar mensagem','Saiba mais','Fale conosco','Reservar agora'];
let NID=0;
CONTAS.forEach(a=>{const R=rng(a.id*313+7),n=2+a.id%3;
 for(let i=0;i<n;i++){const cbo=(a.id+i)%2===0,obj=a.sem==='sem'?'Cadastros':'Mensagens';
  let st=i<2?'Ativa':R()<.4?'Pausada':'Em aprendizado';if(a.statusOp==='Anúncio reprovado'&&i===1)st='Com erro';if(a.sem==='par')st='Pausada';if(a.sem==='ins')st='Em aprendizado';
  const desde=st==='Pausada'?(a.parDesde||addD(HOJE,-(3+Math.floor(R()*20)))):addD(HOJE,-(4+Math.floor(R()*70)));
  const c={id:++NID,tipo:'camp',nome:`[${obj==='Mensagens'?'MSG':'CAD'}] ${TEMAS[(a.id+i)%6]} | ${a.nicho}`,status:st,desde,obj,cbo,orc:0,teto:null,fim:null,lance:'Volume mais alto',sets:[]};
  const ns=2+Math.floor(R()*2);
  for(let j=0;j<ns;j++){const sst=st==='Pausada'?'Pausada':j===ns-1&&R()<.3?'Pausada':st==='Com erro'&&j===0?'Com erro':st;
   const s={id:++NID,tipo:'set',nome:PUBS[(i+j+a.id)%5].replace('{n}',a.nicho.toLowerCase()),status:sst,desde,orc:0,publico:{min:[18,25,25,30][j%4],max:[54,44,55,65][j%4],locais:['Raio de 8 km do endereço','Belo Horizonte e região','Contagem, Betim e BH'][j%3],interesses:a.nicho+', '+['bem-estar','família','compras online'][j%3]},boasVindas:`Olá! Que bom falar com você. Quer saber mais sobre ${a.nicho.toLowerCase()}? Responda com seu nome que já te atendemos.`,ads:[]};
   const na=1+Math.floor(R()*3);
   for(let k=0;k<na;k++)s.ads.push({id:++NID,tipo:'ad',nome:`${['Reels','Imagem','Carrossel'][(k+j)%3]} · ${['dor','prova social','oferta direta','bastidores','depoimento'][(a.id+k+j)%5]}`,status:sst==='Pausada'?'Pausada':sst==='Com erro'&&k===0?'Com erro':'Ativa',texto:`${['Chega de adiar.','Você merece esse cuidado.','Condição especial esta semana.'][(k+i)%3]} Fale com a ${a.nome} pelo WhatsApp.`,titulo:['Agende pelo WhatsApp','Condição especial','Fale com a gente'][(k+j)%3],descricao:'Atendimento rápido',cta:CTAS[(k+i)%2===0?0:2],fmt:['video','imagem','carrossel'][(k+j)%3],mid:(a.id+k+j+i)%3+1,g7:0,res:0});
   c.sets.push(s)}
  a.camps.push(c)}
 const ativos=a.camps.filter(c=>c.status!=='Pausada');const w=ativos.map(()=>.5+R()),W=w.reduce((x,y)=>x+y,0)||1;
 a.camps.forEach(c=>{const k=ativos.indexOf(c),sh=k>=0?w[k]/W:0;c.orc=Math.max(10,Math.round(a.ref*sh/5)*5)||Math.round(a.ref*.25/5)*5;c.share=sh;
  const g7=a.sem==='par'?0:(a.verbaTotal7*sh)||0,res=a.sem==='sem'?Math.round(a.conv7*sh):Math.round(a.conv7*sh);c.g7=g7;c.res=a.sem==='sem'?Math.round(g7/(a.meta*2.2)):res;
  const sw=c.sets.map(s=>s.status==='Pausada'?0:.4+R()),SW=sw.reduce((x,y)=>x+y,0)||1;
  c.sets.forEach((s,j)=>{s.g7=g7*sw[j]/SW;s.res=Math.round(c.res*sw[j]/SW);s.orc=c.cbo?0:Math.max(6,Math.round(c.orc*((sw[j]/SW)||.3)/5)*5);
   const aw=s.ads.map(x=>x.status==='Pausada'?0:.3+R()),AW=aw.reduce((x,y)=>x+y,0)||1;s.ads.forEach((x,q)=>{x.g7=s.g7*aw[q]/AW;x.res=Math.round(s.res*aw[q]/AW)})});
  if(c.cbo)c.sets.forEach(s=>s.orc=0)})});
CONTAS.forEach(a=>{if(!a.form||a.sem==='sem'||a.sem==='par')return;const R=rng(a.id*71);const l7=a.series.slice(-7).reduce((s,x)=>s+x.leads,0);const g7=Math.round(l7*a.meta*1.7*(.85+R()*.3)*100)/100;
 const c={id:++NID,tipo:'camp',nome:`[LEAD] Formulário instantâneo | ${a.nicho}`,status:'Ativa',desde:addD(HOJE,-(12+Math.floor(R()*40))),obj:'Formulário',cbo:true,orc:Math.round(g7/7/5)*5||10,teto:null,fim:null,lance:'Volume mais alto',g7,res:l7,sets:[]};
 ['Formulário · interesses '+a.nicho.toLowerCase(),'Formulário · semelhante 1% leads'].forEach((n,j)=>{const sh=j?.4:.6;const s={id:++NID,tipo:'set',nome:n,status:'Ativa',desde:c.desde,orc:0,g7:g7*sh,res:Math.round(l7*sh),publico:{min:25,max:54,locais:'Belo Horizonte e região',interesses:a.nicho},boasVindas:'',ads:[]};
  [0,1].forEach(k=>s.ads.push({id:++NID,tipo:'ad',nome:`${k?'Reels':'Imagem'} · formulário · ${['oferta direta','prova social'][k]}`,status:'Ativa',texto:`Preencha o formulário e receba o contato da ${a.nome} ainda hoje.`,titulo:'Cadastre-se em 1 minuto',descricao:'Sem compromisso',cta:'Cadastre-se',fmt:k?'video':'imagem',mid:(a.id+k)%3+1,g7:s.g7/2,res:Math.round(s.res/2)}));c.sets.push(s)});
 a.camps.push(c);a.verbaTotal7+=g7;a.gastoDia=a.verbaTotal7/7});
CONTAS.forEach(a=>{a.leads7=a.series.slice(-7).reduce((s,x)=>s+x.leads,0);const f=a.camps.find(c=>c.obj==='Formulário'||c.obj==='Cadastros');a.cpl7=a.leads7&&f?f.g7/a.leads7:null});
const budget=c=>c.cbo?c.orc:c.sets.reduce((s,x)=>s+(x.status!=='Pausada'?x.orc:0),0);
function nodeOf(a,id){for(const c of a.camps){if(c.id===id)return{c};for(const s of c.sets){if(s.id===id)return{c,s};for(const d of s.ads)if(d.id===id)return{c,s,d}}}return{}}
/* investimento diário total da conta (campanhas CBO + conjuntos ABO ativos); troca simula um novo valor */
function invDia(a,troca){let t=0;for(const c of a.camps){if(c.status==='Pausada')continue;if(c.cbo)t+=troca&&c.id===troca.id?troca.v:c.orc;else for(const s of c.sets){if(s.status==='Pausada')continue;t+=troca&&s.id===troca.id?troca.v:s.orc}}return Math.round(t*100)/100}
/* teto diário combinado com alguns clientes (fictício) */
CONTAS.forEach(a=>{if(a.id%3===0){const t=invDia(a);if(t>0)a.tetoDia=Math.max(30,Math.ceil(t*1.06/10)*10)}});

/* auditoria */
const AUD=[];
CONTAS.forEach(a=>{const R=rng(a.id*97),c=a.camps[0],d=addD(HOJE,-a.diasSem);d.setHours(9+a.id%8,7+a.id*3%50);
 AUD.push({conta:a.id,quem:a.gest,quando:d,oque:c.cbo?'Orçamento diário da campanha':'Pausou anúncio',onde:c.cbo?c.nome:c.sets[0].nome,antes:c.cbo?brl2(Math.round(c.orc/1.15)):'Ativo',depois:c.cbo?brl2(c.orc):'Pausado',via:R()<.4?'IA':''});
 const d2=addD(d,-5);d2.setHours(14,22);AUD.push({conta:a.id,quem:a.gest,quando:d2,oque:'Editou público',onde:c.sets[c.sets.length-1].nome,antes:'25–54 anos',depois:`${c.sets[c.sets.length-1].publico.min}–${c.sets[c.sets.length-1].publico.max} anos`,via:''})});
/* recomendações da IA: geradas pelo motor único em motor-torre.js (MotorRecs) */
/* notificações (só para quem recebe alertas: Alan e Admins) */
const NOTIF=[
 {id:1,sev:'crit',conta:14,txt:'Revisão das 06:00 falhou: token do Meta expirado. A conta está sem acompanhamento automático.',hora:'06:04',visto:false},
 {id:2,sev:'crit',conta:24,txt:'Custo por conversa 1,9× a meta e 2 anúncios reprovados. 3º alerta da semana.',hora:'06:02',visto:false},
 {id:3,sev:'warn',conta:28,txt:'Pagamento recusado pelo Meta. Anúncios parados desde 20/11.',hora:'ontem 18:40',visto:true},
 {id:4,sev:'warn',conta:6,txt:'Surpresa: gasto de ontem 2,7× acima da média diária, sem aumento de orçamento registrado.',hora:'ontem 23:58',visto:true},
];

