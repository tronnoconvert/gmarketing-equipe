/* ===== Cadastrar cliente (fluxo em etapas, Monday e Windsor simulados no protótipo) ===== */
const MONDAY_ID={gabriel:68970668,alan:68947216,vitor:76947496,vinicius:80809387,rayane:101255119};
const CAD_GESTORES=[['alan','Allan Vieira'],['vitor','Victor Bragança']];
const NOVAS_WINDSOR=[['2410055231187704','Clínica Vida Nova'],['2410055231190218','Studio Bella Forma'],['2410055231201967','Mercado Bom Preço'],['2410055231215580','Ótica Foco Certo'],['2410055231228843','Escola Saber Kids']];
const windsorContas=()=>[...CONTAS.map(a=>[a.act.slice(4),a.nome]),...NOVAS_WINDSOR];
const ORIG=[['1','1. Agência - primeiro uso'],['2','2. Agência - reaproveitada'],['3','3. BM do cliente - sem corte']];
const STC=['Ativo','Onboarding','Pausado','Encerrado'];
const isoHoje=()=>`${HOJE.getFullYear()}-${pad(HOJE.getMonth()+1)}-${pad(HOJE.getDate())}`;
const cadVazio=()=>({nome:'',empresa:'',gestor:S.user==='vitor'?'vitor':'alan',status:'Ativo',inicio:isoHoje(),looker:'',act:'',origem:'',lerDesde:isoHoje(),ciclo:'',nomeMeta:'',bm:'',meta:'',verba:'',obs:''});
const CAD={step:1,d:null,t:{},w:{st:'vazio'},fase:'form',passos:[],res:null,simFalha:false,dupOk:false,mais:{},vis:new Set([1]),resumo:false};
try{const r=JSON.parse(localStorage.getItem('torre-cad')||'null');if(r&&r.nome!==undefined&&(r.nome||r.act)){CAD.rasc=r}}catch(e){}
function iniCad(){if(CAD.d)return;CAD.d=cadVazio();if(CAD.rasc){CAD.d={...CAD.d,...CAD.rasc};CAD.recuperado=true;if(CAD.d.act)setTimeout(verificarConta,0)}}
const salvarRasc=()=>{try{localStorage.setItem('torre-cad',JSON.stringify(CAD.d))}catch(e){}};
const limparRasc=()=>{try{localStorage.removeItem('torre-cad')}catch(e){}};
const podeCadastrar=()=>Object.keys(MONDAY_ID).includes(S.user);
const normAct=v=>String(v||'').replace(/\s+/g,'').replace(/^act_/i,'');
/* validação */
function erros(step){const d=CAD.d,e={};
 if(step===1){if(d.nome.trim().length<3)e.nome='Informe o nome do cliente (mínimo 3 letras), como aparece no contrato.';if(!d.empresa)e.empresa='Escolha a empresa: Tronno ou G Marketing.';if(!d.gestor)e.gestor='Escolha o gestor responsável.';if(d.looker&&!/^https?:\/\/\S+\.\S+/.test(d.looker))e.looker='Cole o link completo, começando com https://';}
 if(step===2){const n=normAct(d.act);if(!n)e.act='Informe o ID da conta de anúncios (com ou sem act_).';else if(!/^\d+$/.test(n))e.act='O ID tem só números depois de act_. Confira se não colou letras ou traços.';else if(n.length<15||n.length>17)e.act=`O ID costuma ter de 15 a 17 dígitos; este tem ${n.length}. Confira no Gerenciador.`;
  else if(CAD.w.st==='nf')e.act='Essa conta não está liberada no Windsor. Peça acesso ao Gabriel ou confira se o ID tem algum dígito errado.';
  else if(CAD.w.st==='near')e.act='Não achamos esse ID no Windsor. Veja a sugestão abaixo.';
  else if(CAD.w.st==='dup'&&!(CAD.w.exc&&CAD.dupOk))e.act=`Esta conta já está cadastrada para ${CAD.w.conta.nome}.`;
  else if(CAD.w.st==='checking'||CAD.w.st==='vazio')e.act='Aguarde a verificação da conta no Windsor.';
  if(!d.origem)e.origem='Escolha a origem da conta.';if(d.origem!=='3'&&!d.lerDesde)e.lerDesde='Informe a data em que este cliente assumiu a conta.';if(d.origem==='2'&&!(+d.ciclo>=1))e.ciclo='Informe o ciclo da conta (1 = primeiro cliente, 2 = segundo…).';}
 if(step===3){if(d.meta&&(isNaN(parseBR(d.meta))||parseBR(d.meta)<=0))e.meta='Informe o valor em reais, ex.: 12,50.';if(d.verba&&(isNaN(parseBR(d.verba))||parseBR(d.verba)<0))e.verba='Informe o valor em reais, ex.: 50,00.'}
 return e}
const todosErros=()=>({...erros(1),...erros(2),...erros(3)});
/* navegação livre: nenhuma etapa trava; só “Cadastrar” exige tudo. Pendências com etapa e campo para os links do resumo. */
const ROT_CAMPO={nome:'Nome do cliente',empresa:'Empresa',gestor:'Gestor responsável',looker:'Link do Looker Studio',act:'ID da conta de anúncios',origem:'Origem da conta',lerDesde:'Ler dados a partir de',ciclo:'Ciclo da conta',meta:'Meta de custo por conversa',verba:'Verba diária de referência'};
const CAMPO_MAIS={looker:'m1',nomeMeta:'m2',bm:'m2'};
const pendencias=()=>[1,2,3].flatMap(st=>Object.entries(erros(st)).map(([k,m])=>({st,k,m})));
const temDados=n=>{const d=CAD.d;return n===1?!!(d.nome||d.empresa||d.looker):n===2?!!(d.act||d.origem||d.bm):n===3?!!(d.meta||d.verba||d.obs):false};
function estadoPasso(n){if(n===4){const t=pendencias().length;return t?{e:'warn',txt:`${t} pendência${t>1?'s':''}`}:{e:CAD.vis.has(4)?'ok':'novo',txt:'Pronto para cadastrar'}}
 const q=Object.keys(erros(n)).length;if(!CAD.vis.has(n)&&!temDados(n))return{e:'novo',txt:'Não visitada'};return q?{e:'warn',txt:`${q} pendente${q>1?'s':''}`}:{e:'ok',txt:'Completa'}}
function atualizarStepper(){document.querySelectorAll('.stepper li').forEach((li,i)=>{const x=estadoPasso(i+1),n=['Cliente','Conta','Metas','Revisar'][i];li.className=`${i+1===CAD.step?'cur ':''}is-${x.e}`;const b=li.querySelector('button');b.setAttribute('aria-label',`Etapa ${i+1}: ${n} (${x.txt})`);li.querySelector('.sn').innerHTML=x.e==='ok'&&i<3?ic('check'):String(i+1);li.querySelector('small').innerHTML=`${x.e==='warn'?'<i class="sdot"></i>':''}${x.txt}`})}
/* ao sair de uma etapa, as pendências dela viram dicas no próprio campo (não bloqueiam) */
const marcarEtapa=n=>{Object.keys(erros(n)).forEach(k=>CAD.t[k]=true)};
function irEtapa(n){n=Math.max(1,Math.min(4,n));if(n!==CAD.step&&CAD.step<4)marcarEtapa(CAD.step);CAD.step=n;CAD.vis.add(n);CAD.recuperado=false;renderCad();window.scrollTo(0,0)}
function focarCampo(k){const el=document.getElementById('cad-'+k);if(!el)return;const f=el.matches('input,select,textarea,button')?el:el.querySelector('button');if(f){f.scrollIntoView({block:'center'});f.focus({preventScroll:true})}}
function resumoPend(){const P_=pendencias();if(!P_.length)return '';const nomes=['Cliente','Conta','Metas'];
 return `<div class="cpend" id="cad-pend" tabindex="-1" role="${CAD.resumo?'alert':'status'}"><b>${ic('alert')}Falta${P_.length>1?'m':''} ${P_.length} ${P_.length>1?'itens':'item'} para cadastrar</b><span class="hint">Você pode preencher em qualquer ordem. Clique para ir direto ao campo.</span><ul>${P_.map(x=>`<li><button type="button" data-cgo="${x.st}:${x.k}"><span class="cpend-e">${x.st}. ${nomes[x.st-1]}</span><span><b>${ROT_CAMPO[x.k]||x.k}</b> · ${esc(x.m)}</span>${ic('arrowr')}</button></li>`).join('')}</ul></div>`}
/* Windsor (simulado) */
let wT;
function verificarConta(){const n=normAct(CAD.d.act);clearTimeout(wT);CAD.dupOk=false;if(!/^\d{15,17}$/.test(n)){CAD.w={st:'vazio'};return}
 CAD.w={st:'checking'};wT=setTimeout(()=>{const dup=CONTAS.find(a=>a.act.slice(4)===n);const lista=windsorContas();const ok=lista.find(x=>x[0]===n);
  if(dup){CAD.w={st:'dup',conta:dup,exc:CAD.d.origem==='2'&&['Pausado','Encerrado'].includes(dup.contrato)}}
  else if(ok){CAD.w={st:'ok',nome:ok[1]};if(!CAD.d.nomeMeta)CAD.d.nomeMeta=ok[1]}
  else{const near=lista.find(x=>x[0].length===n.length&&[...x[0]].filter((c,i)=>c!==n[i]).length===1);CAD.w=near?{st:'near',id:near[0],nome:near[1]}:{st:'nf'}}
  salvarRasc();renderCad()},900)}
/* telas */
const fe=k=>CAD.t[k]?(todosErros()[k]||''):'';
const fld=(k,l,inner,hint='',help='')=>`<div class="cf ${fe(k)?'bad':''}"><label for="cad-${k}">${l}${help?` <button type="button" class="hq" data-tip="${esc(help)}" aria-label="Ajuda">?</button>`:''}</label>${inner}${hint?`<span class="hint">${hint}</span>`:''}<span class="err" id="e-${k}">${fe(k)}</span></div>`;
const inp=(k,ph='',type='text',extra='')=>`<input id="cad-${k}" data-cf="${k}" type="${type}" value="${esc(CAD.d[k])}" placeholder="${ph}" ${extra} autocomplete="off">`;
const chipsF=(k,opts)=>`<div class="cchips" role="radiogroup" id="cad-${k}">${opts.map(o=>`<button type="button" role="radio" class="cchip" data-cset="${k}" data-v="${o[0]}" aria-checked="${CAD.d[k]===o[0]}">${o[1]}</button>`).join('')}</div>`;
function wBox(){const w=CAD.w;if(w.st==='checking')return `<div class="wb chk"><span class="spin"></span>Verificando conta no Windsor…</div>`;
 if(w.st==='ok')return `<div class="wb ok">${ic('check')}<span>Conta encontrada no Windsor: <b>${esc(w.nome)}</b></span></div>`;
 if(w.st==='nf')return `<div class="wb bad">${ic('alert')}<span><b>Conta não liberada no Windsor.</b> Peça acesso à conta no Windsor (fale com o Gabriel) ou confira se o ID tem algum dígito errado.</span></div>`;
 if(w.st==='near')return `<div class="wb warn">${ic('alert')}<span>Esse ID não está no Windsor. Você quis dizer <b>act_${w.id}</b> (${esc(w.nome)})?</span><button type="button" class="btn sm" data-cact="usar">Usar esta conta</button></div>`;
 if(w.st==='dup')return `<div class="wb bad">${ic('lock')}<span><b>Esta conta já está cadastrada para ${esc(w.conta.nome)}</b> (contrato ${w.conta.contrato.toLowerCase()}).${w.exc?' Como a origem é “Agência - reaproveitada” e o cliente antigo está pausado, você pode seguir confirmando a nova data de leitura.':''}</span><button type="button" class="btn sm" data-qopen="${w.conta.id}" data-cact="fechar">Ver cliente existente</button></div>${w.exc?`<label class="ck"><input type="checkbox" id="cad-dupok" ${CAD.dupOk?'checked':''}> Confirmo que este é um novo cliente na conta e que “Ler dados a partir de” (${CAD.d.lerDesde?dt(new Date(CAD.d.lerDesde+'T12:00')):'—'}) está correto.</label>`:''}`;
 return ''}
function etapa1(){return `<div class="cg">${fld('nome','Nome do cliente',inp('nome','Ex.: Clínica Vida Nova'),'Como aparece no contrato. Vira o nome do item no Monday.')}
 ${fld('empresa','Empresa',chipsF('empresa',[['Tronno','Tronno'],['G Marketing','G Marketing']]))}
 ${fld('gestor','Gestor responsável',`<select id="cad-gestor" data-cf="gestor"><option value="">Escolha…</option>${CAD_GESTORES.map(g=>`<option value="${g[0]}" ${CAD.d.gestor===g[0]?'selected':''}>${g[1]}</option>`).join('')}</select>`,'Recebe a notificação no Monday quando o cliente entrar na Torre.')}
 ${fld('status','Status contratual',chipsF('status',STC.map(s=>[s,s])),CAD.d.status!=='Ativo'?`<span class="tx-warn">Este cliente não vai entrar no Painel de Voo enquanto não estiver Ativo.</span>`:'Só clientes Ativos entram no Painel de Voo.')}
 ${fld('inicio','Início do contrato',inp('inicio','','date'),'Recomendado.')}</div>
 ${mais('m1','Mais detalhes',fld('looker','Link do Looker Studio',inp('looker','https://lookerstudio.google.com/…','url'),'Opcional.'))}`}
function etapa2(){const n=normAct(CAD.d.act);return `<div class="cg">${fld('act','ID da conta de anúncios',inp('act','act_1234567890123456','text','inputmode="numeric" spellcheck="false"'),n&&/^\d+$/.test(n)?`Será gravado como <code>act_${n}</code>. Pode colar com ou sem act_, com espaços.`:'Pode colar com ou sem act_.')}
 <div class="cf wide">${wBox()}</div>
 ${fld('origem','Origem da conta',`<select id="cad-origem" data-cf="origem"><option value="">Escolha…</option>${ORIG.map(o=>`<option value="${o[0]}" ${CAD.d.origem===o[0]?'selected':''}>${o[1]}</option>`).join('')}</select>`,'','1: conta nova da agência, nunca usada. 2: conta da agência que já foi de outro cliente (os dados antigos não podem entrar). 3: conta da BM do próprio cliente, todo o histórico vale.')}
 ${fld('lerDesde','Ler dados a partir de',inp('lerDesde','','date'),CAD.d.origem==='3'?'Opcional para BM do cliente: vazio lê o histórico inteiro.':'Sugestão: hoje. Nada antes desta data entra no cálculo.','Data em que este cliente assumiu a conta. Tudo antes dela é ignorado no custo por conversa e no semáforo. Em conta reaproveitada, use o dia em que o novo cliente começou.')}
 ${CAD.d.origem==='2'?fld('ciclo','Ciclo da conta',inp('ciclo','2','number','min="1" step="1"'),'1 = primeiro cliente da conta, 2 = segundo, e assim por diante.'):''}</div>
 ${mais('m2','Mais detalhes',`<div class="cg">${fld('nomeMeta','Nome no Meta (perfil)',inp('nomeMeta','Preenchido ao validar a conta'),'Vem automático do Windsor.')}${fld('bm','Perfil / BM de origem',inp('bm','Ex.: BM G Marketing 02'),'Em qual perfil ou BM a conta está.')}</div>`,!!CAD.d.bm)}
 <p class="hint">Contas de teste neste protótipo: válida <code>act_2410055231187704</code> · com 1 dígito errado <code>act_2410055231187705</code> · fora do Windsor <code>act_9999999999999999</code> · já cadastrada <code>${CONTAS[0].act}</code></p>`}
function etapa3(){const semMeta=!CAD.d.meta;return `<div class="cg">${fld('meta','Meta de custo por conversa (R$)',inp('meta','Ex.: 12,50','text','inputmode="decimal"'),semMeta?'<span class="tx-warn">Sem meta, a Torre usa R$ 8,00 e marca o cliente como “sem meta”.</span>':'Base do semáforo: índice = custo por conversa ÷ meta.')}
 ${fld('verba','Verba diária de referência (R$)',inp('verba','Ex.: 50,00','text','inputmode="decimal"'),'Opcional.')}</div>
 ${fld('obs','Observações',`<textarea id="cad-obs" data-cf="obs" rows="3" placeholder="Algo que o gestor precisa saber sobre este cliente">${esc(CAD.d.obs)}</textarea>`,`Vamos acrescentar: “Cadastrado via plataforma por ${esc(ME().nome)} em ${dt(NOW())} ${hm(NOW())}”.`)}`}
function blocoRev(step,titulo,linhas){return `<section class="rv"><div class="rv-h"><b>${titulo}</b><button type="button" class="btn sm" data-cstep="${step}">Editar</button></div><dl>${linhas.map(l=>`<dt>${l[0]}</dt><dd>${l[1]||'<span class="hint">—</span>'}</dd>`).join('')}</dl></section>`}
function colunas(){const d=CAD.d,n=normAct(d.act),g=MONDAY_ID[d.gestor];const ob=(d.obs?d.obs+'\n':'')+`Cadastrado via plataforma por ${ME().nome} em ${dt(NOW())} ${hm(NOW())}`;
 const cad={color_mm63caj4:{label:d.empresa},multiple_person_mm63w9m8:{personsAndTeams:[{id:g,kind:'person'}]},color_mm63r82j:{label:d.status},...(d.inicio?{date_mm63bqs0:{date:d.inicio}}:{}),...(d.looker?{link_mm63cct:{url:d.looker,text:d.nome}}:{}),text_mm6360vb:'act_'+n,color_mm64fmef:{label:(ORIG.find(o=>o[0]===d.origem)||['',''])[1]},...(d.lerDesde?{date_mm64cwdh:{date:d.lerDesde}}:{}),...(d.origem==='2'?{numeric_mm64n9mw:String(d.ciclo)}:{}),text_mm64xrz7:d.nomeMeta,...(d.bm?{text_mm644crf:d.bm}:{}),...(d.meta?{numeric_mm63p9n9:String(parseBR(d.meta))}:{}),...(d.verba?{numeric_mm63pak8:String(parseBR(d.verba))}:{}),long_text_mm63gadf:{text:ob},color_mm64vrm9:{label:'⏳ Pendente - enviar ao Painel'}};
 const pv={text_mm63b2fj:n,color_mm63n37d:{label:d.empresa},multiple_person_mm63fts:{personsAndTeams:[{id:g,kind:'person'}]},...(d.lerDesde?{date_mm64zpvs:{date:d.lerDesde}}:{}),...(d.looker?{link_mm63t1k0:{url:d.looker,text:d.nome}}:{}),text_mm64sh6t:d.nomeMeta,numeric_mm64z6b7:'0',color_mm63r5g8:{label:'⚪ Dados insuficientes'},color_mm63kvm1:{label:'Aguardar dados'},color_mm64n65h:{label:'⏳ Aguardando revisão'}};return{cad,pv,ob}}
function etapa4(){const d=CAD.d,e=todosErros(),n=normAct(d.act),C=colunas();const ok=!Object.keys(e).length;
 return `<div class="rvg">${blocoRev(1,'Cliente',[['Nome',esc(d.nome)],['Empresa',d.empresa],['Gestor',(CAD_GESTORES.find(g=>g[0]===d.gestor)||['',''])[1]],['Status contratual',d.status],['Início do contrato',d.inicio?dt(new Date(d.inicio+'T12:00')):''],['Looker',d.looker?'Informado':'']])}
 ${blocoRev(2,'Conta de anúncios',[['ID',n?`<code>act_${n}</code>`:''],['Validação',CAD.w.st==='ok'?`<span class="tx-good">Conta encontrada no Windsor: ${esc(CAD.w.nome)}</span>`:`<span class="dn">${esc(e.act||'—')}</span>`],['Origem',(ORIG.find(o=>o[0]===d.origem)||['',''])[1]],['Ler dados a partir de',d.lerDesde?dt(new Date(d.lerDesde+'T12:00')):(d.origem==='3'?'Histórico inteiro':'')],...(d.origem==='2'?[['Ciclo',d.ciclo]]:[]),['Nome no Meta',esc(d.nomeMeta)],['Perfil / BM',esc(d.bm)]])}
 ${blocoRev(3,'Metas',[['Meta custo/conversa',d.meta?brl2(parseBR(d.meta)):'<span class="tx-warn">Sem meta (usa R$ 8,00)</span>'],['Verba diária de referência',d.verba?brl2(parseBR(d.verba)):''],['Observações',esc(C.ob).replace(/\n/g,'<br>')]])}</div>
 ${ok?(d.status!=='Ativo'?`<div class="wb warn">${ic('alert')}<span>Status <b>${d.status}</b>: o cliente será salvo no Cadastro do Monday, mas só entra no Painel de Voo quando estiver Ativo.</span></div>`:''):resumoPend()}
 <details class="dev"><summary>Para o desenvolvimento: o que será enviado ao Monday</summary><p class="hint">No sistema real isto roda no servidor (tokens MONDAY_API_TOKEN e WINDSOR_API_KEY nunca no navegador). Cadastro: board 18425955775. Painel de Voo: board 18425955783. Autor no Monday: ${ME().nome} (${MONDAY_ID[S.user]}).</p><pre>// create_item · Cadastro
${esc(JSON.stringify(C.cad,null,1))}

// create_item · Painel de Voo (só se Ativo)
${esc(JSON.stringify(C.pv,null,1))}</pre><label class="ck"><input type="checkbox" id="cad-falha" ${CAD.simFalha?'checked':''}> Simular Windsor fora do ar nos passos 3 e 4 (teste)</label></details>`}
function mais(id,t,html,abrirPadrao){const o=CAD.mais[id]??abrirPadrao??false;return `<div class="maisw"><button type="button" class="maisb" data-cmais="${id}" aria-expanded="${o}">${ic('chev')}${t}</button>${o?`<div class="maisc">${html}</div>`:''}</div>`}
function cadHTML(){iniCad();
 if(!podeCadastrar())return `<div class="cadw"><div class="wb bad">${ic('lock')}<span>Cadastrar cliente é liberado só para Gabriel Leão, Rayane Leão, Allan Vieira, Victor Bragança e Vinícius Leão. Troque em “Ver como” para testar.</span></div><button class="btn" data-cact="fechar">${ic('arrowr')}Voltar para a Torre</button></div>`;
 const head=`<div class="cad-top"><button class="btn ghost" data-cact="fechar">← Torre de Controle</button><div><h1>Cadastrar cliente</h1><p class="hint">Grava no Cadastro do Monday e coloca o cliente na Torre na hora, com os primeiros números do Meta.</p></div></div>`;
 if(CAD.fase==='run'||CAD.fase==='ok')return `<div class="cadw">${head}<div class="runw"><section class="glass runl"><h3>${CAD.fase==='ok'?'Concluído':'Cadastrando…'}</h3><ol class="steps">${CAD.passos.map(p=>`<li class="${p.st}"><span class="sti">${p.st==='run'?'<span class="spin"></span>':p.st==='ok'?ic('check'):p.st==='err'?ic('alert'):p.st==='skip'?'–':''}</span><span>${p.t}${p.det?`<small>${p.det}</small>`:''}</span></li>`).join('')}</ol></section>${CAD.fase==='ok'?sucesso():''}</div></div>`;
 const st=CAD.step,nomes=['Cliente','Conta','Metas','Revisar'];const tudo=!Object.keys(todosErros()).length;
 return `<div class="cadw">${head}${CAD.recuperado?`<div class="wb">${ic('clock')}<span>Rascunho recuperado de onde você parou.</span><button type="button" class="btn sm" data-cact="limpar">Começar do zero</button></div>`:''}
 <ol class="stepper" aria-label="Etapas do cadastro (todas podem ser abertas a qualquer momento)">${nomes.map((n,i)=>{const x=estadoPasso(i+1);return `<li class="${i+1===st?'cur ':''}is-${x.e}"><button type="button" data-cstep="${i+1}"${i+1===st?' aria-current="step"':''} aria-label="Etapa ${i+1}: ${n} (${x.txt})"><span class="sn">${x.e==='ok'&&i<3?ic('check'):i+1}</span><span class="sx"><b>${n}</b><small>${x.e==='warn'?'<i class="sdot"></i>':''}${x.txt}</small></span></button></li>`}).join('')}</ol>
 <section class="glass cadf"><h2>${['Dados do cliente','Conta de anúncios no Meta','Metas do cliente','Revise e confirme'][st-1]}</h2>${CAD.resumo&&st<4?resumoPend():''}${[etapa1,etapa2,etapa3,etapa4][st-1]()}
 <div class="cad-act"><button type="button" class="btn" data-cact="${st===1?'fechar':'voltar'}">${st===1?'Cancelar':'Voltar'}</button><span class="hint">Rascunho salvo automaticamente neste navegador.</span>${st<4?`<button type="button" class="btn pri" data-cact="avancar">Continuar</button>`:`<button type="button" class="btn pri" data-cact="cadastrar"${tudo?'':' aria-describedby="cad-pend"'}>${ic('check')}Cadastrar e colocar na Torre</button>`}</div></section></div>`}
function sucesso(){const r=CAD.res;if(!r)return'';if(!r.painel)return `<section class="glass okc"><span class="okc-i">${ic('check')}</span><h2>${esc(r.nome)} foi salvo no Cadastro</h2><p>Status <b>${r.status}</b>: o cliente entra no Painel de Voo quando passar para Ativo.</p><p class="hint">Item no Cadastro do Monday: #${r.idCad}</p><div class="row"><button class="btn pri" data-cact="novo">${ic('plus')}Cadastrar outro cliente</button><button class="btn" data-cact="fechar">Voltar para a Torre</button></div></section>`;
 const a=r.conta;return `<section class="glass okc"><span class="okc-i">${ic('check')}</span><h2>${esc(a.nome)} está na Torre de Controle</h2><div class="okc-n">${semPill(a)}<span><b>${a.cpc3||a.cpc7?brl2(a.cpc3||a.cpc7):'—'}</b><small>custo por conversa (base ${a.base||'—'})</small></span><span><b>${a.conv7}</b><small>conversas em 7 dias</small></span><span><b>${brl2(a.verbaTotal7)}</b><small>verba total 7d</small></span></div>${r.falhaW?`<div class="wb warn">${ic('alert')}<span>Cliente cadastrado. Os números aparecem na próxima rodada automática (até 1 h).</span></div>`:''}<p class="hint">A análise completa (alertas, tarefas e mensagem ao cliente) roda automaticamente às 6h. Itens no Monday: Cadastro #${r.idCad} · Painel de Voo #${r.idPv}. ${esc(P(a.gest).nome)} foi avisado no Monday.</p><div class="row"><button class="btn pri" data-qopen="${a.id}" data-cact="fechar">${ic('arrowr')}Abrir no Painel de Voo</button><button class="btn" data-cact="novo">${ic('plus')}Cadastrar outro cliente</button></div></section>`}
/* cadastro (simulação dos passos do servidor) */
function calcular(a,serie){const d=CAD.d,ler=d.lerDesde?new Date(d.lerDesde+'T00:00'):null;const s=serie.filter(x=>!ler||x.d>=ler);const l7=s.slice(-7),l3=s.filter(x=>(HOJE-x.d)/DIA<3);const sum=(arr,k)=>arr.reduce((t,x)=>t+x[k],0);
 const vA7=sum(l7,'spA'),vB7=sum(l7,'spB'),c7=sum(l7,'msgs'),vA3=sum(l3,'spA'),c3=sum(l3,'msgs'),tot7=vA7+vB7,tot3=sum(l3,'spA')+sum(l3,'spB');const meta=d.meta?parseBR(d.meta):8;
 Object.assign(a,{verbaMsg7:vA7,conv7:c7,cpc7:c7?vA7/c7:null,verbaMsg3:vA3,conv3:c3,cpc3:c3?vA3/c3:null,verbaTotal7:tot7,gastoDia:tot7/7,meta});
 let sem,op='OK',base=null,ix=null;if(tot7===0||tot3===0){sem='par';op='Sem gasto no período';a.parDesde=addD(HOJE,-2)}else if(vA7===0&&c7===0){sem='sem';op='Sem campanha de mensagem'}
 else{const mv=PD('torre.base.minVerba');if(c3>=PD('torre.base3d.minConversas')&&vA3>=mv){base='3d';ix=(vA3/c3)/meta}else if(vA7>=mv&&c7>0){base='7d';ix=(vA7/c7)/meta}if(ix==null)sem='ins';else sem=faixaSem(ix)}
 Object.assign(a,{sem,statusOp:op,indice:ix,base,revisao:'Revisão feita'});
 a.diag=`[${dm(HOJE)}] Cadastro inicial via plataforma. ${ix!=null?`Custo/conversa (base ${base}): ${brl2(base==='3d'?a.cpc3:a.cpc7)} vs meta ${brl2(meta)} → índice ${dec(ix,2)}.`:SEMF[sem][0]+'.'} Mensagem 7d: ${brl2(vA7)} / ${c7} conversas; 3d: ${brl2(vA3)} / ${c3} conversas. Verba total conta 7d ${brl2(tot7)}.${d.meta?'':' Cliente sem meta: usando R$ 8,00.'}`}
function novaConta(){const d=CAD.d,n=normAct(d.act),id=Math.max(...CONTAS.map(a=>a.id))+1,R=rng(+n.slice(-6)),meta=d.meta?parseBR(d.meta):8,ref=d.verba?parseBR(d.verba):40+R()*90,ix=.55+R()*1.3;
 const serie=[];for(let k=29;k>=0;k--){const day=addD(HOJE,-k),spA=Math.round(ref*(.85+R()*.3)*100)/100,spB=Math.round(ref*.18*(.7+R()*.6)*100)/100;serie.push({d:day,sp:spA,spA,spB,impr:Math.round(spA/22*1000),reach:Math.round(spA/22*1000/1.2),clicks:Math.round(spA/22*1000*.014),msgs:Math.max(0,Math.round(spA/(meta*ix*(.9+R()*.2)))),leads:0,v3:Math.round(spA*9)})}
 const a={id,nome:d.nome.trim(),nicho:'Novo cliente',contato:d.nome.trim().split(' ')[0],gest:d.gestor,empresa:d.empresa,meta,ref,alvo:'ins',act:'act_'+n,perfil:'@'+(d.nomeMeta||d.nome).toLowerCase().normalize('NFD').replace(/[^a-z]/g,'').slice(0,16),lerDesde:d.lerDesde?new Date(d.lerDesde+'T00:00'):addD(HOJE,-90),form:false,series:serie.map(x=>({...x})),camps:[],aud:[],recs:[],contrato:d.status,
  sem:'ins',statusOp:'OK',revisao:'Aguardando',execucao:`${dm(HOJE)} ${hm(NOW())} · cadastro`,atualizado:`${dm(HOJE)}, ${hm(NOW())}`,fadiga:'Aguardando 06:00',health:50,varCPC:0,diasSem:0,churn:'—',acao:'Aguardar dados',alertas:0,ultAlerta:null,cpc1:null,ultMsg:null,msg:'A mensagem ao cliente é gerada na rotina das 06:00.',diag:'Aguardando dados do Meta.',conv3:0,conv7:0,verbaMsg3:0,verbaMsg7:0,verbaTotal7:0,gastoDia:0,cpc3:null,cpc7:null,indice:null,leads7:0,cpl7:null,novo:true};
 const c={id:++NID,tipo:'camp',nome:`[MSG] Campanha principal | ${a.nome}`,status:'Ativa',desde:addD(HOJE,-20),obj:'Mensagens',cbo:true,orc:Math.round(ref/5)*5,teto:null,fim:null,lance:'Volume mais alto',g7:0,res:0,share:1,sets:[{id:++NID,tipo:'set',nome:'Público aberto · Advantage+',status:'Ativa',desde:addD(HOJE,-20),orc:0,g7:0,res:0,publico:{min:25,max:55,locais:'Região do cliente',interesses:'automático'},boasVindas:'Olá! Como podemos ajudar?',ads:[{id:++NID,tipo:'ad',nome:'Reels · apresentação',status:'Ativa',texto:`Conheça a ${a.nome}. Fale com a gente pelo WhatsApp.`,titulo:'Fale pelo WhatsApp',descricao:'Resposta rápida',cta:'Enviar mensagem',fmt:'video',mid:1+id%3,g7:0,res:0}]}]};a.camps.push(c);return{a,serie}}
function cadastrar(){const d=CAD.d,falha=CAD.simFalha;CAD.t={};CAD.fase='run';const ativo=d.status==='Ativo';const gNome=P(d.gestor).nome;
 CAD.passos=[{t:'Salvando cadastro…',st:'wait'},{t:'Criando o cliente no Painel de Voo…',st:ativo?'wait':'skip',det:ativo?'':'Pulado: só clientes Ativos entram no Painel.'},{t:'Buscando os últimos 7 dias no Meta Ads…',st:ativo?'wait':'skip'},{t:'Calculando custo por conversa e semáforo…',st:ativo?'wait':'skip'},{t:'Finalizando…',st:'wait'},{t:`Avisando ${gNome} no Monday`,st:ativo?'wait':'skip'}];
 const res={nome:d.nome.trim(),status:d.status,idCad:18800000000+Math.floor(Math.random()*9e7),painel:ativo};let nc=null;
 const fazer=[()=>{CAD.passos[0].det=`Item criado no Cadastro (#${res.idCad}) com autoria de ${ME().nome}.`},
  ()=>{const n=normAct(d.act);if(CONTAS.some(a=>a.act.slice(4)===n)){throw new Error('Outra pessoa acabou de cadastrar esta conta.')}const r=novaConta();nc=r;CONTAS.push(r.a);res.idPv=18800000000+Math.floor(Math.random()*9e7);CAD.passos[1].det=`Linha criada no Painel de Voo (#${res.idPv}) com semáforo “Dados insuficientes”.`;render()},
  ()=>{if(falha){res.falhaW=true;throw {soft:true,msg:'Windsor não respondeu. O cliente fica com “Dados insuficientes” até a próxima rodada.'}}CAD.passos[2].det=`Conta ${nc.a.act}: 7 dias lidos${d.lerDesde?` a partir de ${dt(new Date(d.lerDesde+'T12:00'))}`:''}.`},
  ()=>{calcular(nc.a,nc.serie);CAD.passos[3].det=`Semáforo: ${SEMF[nc.a.sem][0]}${nc.a.indice!=null?` · índice ${dec(nc.a.indice,2)} (base ${nc.a.base})`:''}.`},
  ()=>{CAD.passos[4].det=ativo?'Cadastro marcado como “Sincronizado”.':'Cadastro salvo. Fica fora do Painel até ficar Ativo.'},
  ()=>{CAD.passos[5].det=`“Novo cliente na Torre: ${res.nome} (cadastrado por ${ME().nome.split(' ')[0]}). Semáforo inicial: ${SEMF[nc.a.sem][0]}.”`}];
 let i=0;const prox=()=>{while(i<CAD.passos.length&&CAD.passos[i].st==='skip')i++;if(i>=CAD.passos.length){if(nc){res.conta=nc.a;AUD.push({conta:nc.a.id,quem:S.user,quando:NOW(),oque:'Cadastrou cliente e colocou na Torre',onde:`${nc.a.nome} · ${nc.a.act}`,antes:'—',depois:`${SEMF[nc.a.sem][0]} · ${d.status}`,via:''})}CAD.res=res;CAD.fase='ok';limparRasc();renderCad();toast(`${ic('check')}<span>${esc(res.nome)} ${res.painel?'está na Torre de Controle':'foi salvo no Cadastro'}.</span>`);return}
  const p=CAD.passos[i];p.st='run';renderCad();setTimeout(()=>{try{fazer[i]();p.st='ok'}catch(err){if(err&&err.soft){p.st='err';p.det=err.msg;if(i===2){CAD.passos[3].st='skip';CAD.passos[3].det='Fica para a próxima rodada automática.'}}else{p.st='err';p.det=(err.message||'Erro')+(i===0?' Nada foi gravado; tente de novo.':' O cadastro foi marcado como “Erro na sincronização”; a rotina rápida tenta de novo na próxima hora.');CAD.fase='ok';CAD.res={...res,painel:false};renderCad();return}}i++;prox()},750)};prox()}
/* render e eventos */
function renderCad(){const a=document.activeElement,id=a&&a.id,ss=a&&a.selectionStart;render();if(id){const n=document.getElementById(id);if(n){n.focus();try{if(ss!=null&&n.setSelectionRange)n.setSelectionRange(ss,ss)}catch(e){}}}}
function abrirCad(){S.cad=true;S.open=null;try{history.replaceState(null,'','#cadastro')}catch(e){}render();window.scrollTo(0,0)}
function fecharCad(){S.cad=false;try{history.replaceState(null,'','#quadro')}catch(e){}render()}
document.addEventListener('click',e=>{const t=e.target;
 const c=t.closest('[data-cad]');if(c){e.preventDefault();e.stopPropagation();if(!c.classList.contains('dis'))abrirCad();else toast(`${ic('lock')}<span>${esc(c.dataset.tip)}</span>`);return}
 if(!S.cad)return;
 const cs=t.closest('[data-cset]');if(cs){CAD.d[cs.dataset.cset]=cs.dataset.v;CAD.t[cs.dataset.cset]=true;salvarRasc();renderCad();return}
 const st=t.closest('[data-cstep]');if(st){irEtapa(+st.dataset.cstep);return}
 const go=t.closest('[data-cgo]');if(go){const [n,k]=go.dataset.cgo.split(':');if(CAMPO_MAIS[k])CAD.mais[CAMPO_MAIS[k]]=true;CAD.t[k]=true;irEtapa(+n);focarCampo(k);return}
 const m=t.closest('[data-cmais]');if(m){CAD.mais[m.dataset.cmais]=m.getAttribute('aria-expanded')!=='true';renderCad();return}
 const a=t.closest('[data-cact]');if(a){const k=a.dataset.cact;
  if(k==='fechar'){fecharCad();return}
  if(k==='voltar'){irEtapa(CAD.step-1);return}
  if(k==='avancar'){irEtapa(CAD.step+1);return}
  if(k==='usar'){CAD.d.act='act_'+CAD.w.id;verificarConta();CAD.t.act=true;salvarRasc();renderCad();return}
  if(k==='limpar'){CAD.d=cadVazio();CAD.w={st:'vazio'};CAD.t={};CAD.recuperado=false;CAD.step=1;CAD.vis=new Set([1]);CAD.resumo=false;limparRasc();renderCad();return}
  if(k==='novo'){CAD.d=cadVazio();CAD.w={st:'vazio'};CAD.t={};CAD.step=1;CAD.vis=new Set([1]);CAD.resumo=false;CAD.fase='form';CAD.res=null;CAD.dupOk=false;renderCad();return}
  if(k==='cadastrar'){const pend=pendencias();if(pend.length){[1,2,3].forEach(marcarEtapa);CAD.resumo=true;renderCad();const b=document.getElementById('cad-pend');if(b){b.scrollIntoView({block:'center'});b.focus({preventScroll:true})}toast(`${ic('alert')}<span>Faltam ${pend.length} ${pend.length>1?'itens':'item'} para cadastrar. Veja a lista na revisão.</span>`);return}CAD.resumo=false;cadastrar();return}}
},true);
document.addEventListener('input',e=>{const t=e.target;if(!S.cad||!t.dataset||!t.dataset.cf)return;const k=t.dataset.cf;CAD.d[k]=t.value;salvarRasc();atualizarStepper();
 if(k==='act'){verificarConta();CAD.t.act=normAct(t.value).length>=15;renderCad();return}
 const el=document.getElementById('e-'+k);if(el&&CAD.t[k]){const m=todosErros()[k]||'';el.textContent=m;t.closest('.cf').classList.toggle('bad',!!m)}
 if(k==='meta'){/* atualiza aviso sem meta */}});
document.addEventListener('change',e=>{const t=e.target;if(!S.cad)return;
 if(t.dataset&&t.dataset.cf){const k=t.dataset.cf;CAD.d[k]=t.value;salvarRasc();if(t.tagName!=='SELECT'&&t.type!=='date')return;CAD.t[k]=true;if(k==='origem'&&CAD.w.st==='dup')verificarConta();renderCad();return}
 if(t.id==='cad-dupok'){CAD.dupOk=t.checked;renderCad()}if(t.id==='cad-falha'){CAD.simFalha=t.checked}});
document.addEventListener('focusout',e=>{const t=e.target;if(S.cad&&t.dataset&&t.dataset.cf&&!CAD.t[t.dataset.cf]&&t.value){CAD.t[t.dataset.cf]=true;const el=document.getElementById('e-'+t.dataset.cf);if(el){const m=todosErros()[t.dataset.cf]||'';el.textContent=m;t.closest('.cf').classList.toggle('bad',!!m)}}});

function aplicaTema(t){document.documentElement.dataset.tema=t;$$('[data-tema-set]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.temaSet===t));if(!window.EMBED){try{localStorage.setItem('torre-tema',t)}catch(e){}}}
document.addEventListener('click',e=>{const b=e.target.closest('[data-tema-set]');if(b){aplicaTema(b.dataset.temaSet);render()}},true);
setTimeout(()=>aplicaTema(document.documentElement.dataset.tema||'claro'),0);
