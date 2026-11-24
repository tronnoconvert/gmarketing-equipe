/* ===== troca de criativo: "Pedir criativo" (para quem produz) e "Avisar cliente" =====
   Fica tudo no próprio registro da conta (a.crv) para a fila mostrar o status e ninguém pedir duas vezes.
   Dentro do Agência OS (modo embutido) o pedido também vai para a janela-mãe, que cria a tarefa na Operação e notifica a pessoa. */
const CRIADORES_LOCAIS=[{id:'ana',nome:'Ana',papel:'Design de criativos',criativo:true},{id:'carol',nome:'Carol',papel:'Criativos · atendimento',criativo:true}];
const HOST={equipe:null};
const FORMATOS=[['video','Vídeo'],['imagem','Imagem'],['carrossel','Carrossel']];
const PRIORIDADES=[['normal','Normal'],['alta','Alta'],['urgente','Urgente']];
const pessoasCriativo=()=>{if(HOST.equipe&&HOST.equipe.length)return HOST.equipe;const ja=new Set(CRIADORES_LOCAIS.map(x=>x.id));return [...CRIADORES_LOCAIS,...TEAM.filter(t=>!ja.has(t.id)).map(t=>({id:t.id,nome:t.nome,papel:t.papel}))]};
const pessoaCr=id=>pessoasCriativo().find(x=>x.id===id)||{id,nome:id,papel:''};
const primeiroNome=n=>String(n||'').split(' ')[0];
const precisaCriativo=a=>a.acao==='Trocar criativo'||a.fadiga==='Saturado';
const trocaCriativo=a=>a.acao==='Trocar criativo'||!!(a.crv&&(a.crv.pedido||a.crv.avisado));
const crv=a=>a.crv||(a.crv={pedido:null,avisado:null});
function adCansado(a,id){if(id){const x=nodeOf(a,+id);if(x.d)return x}
 const r=a.recs.find(x=>x.tipo==='pause'&&/anúncio/i.test(x.titulo));if(r){const x=nodeOf(a,r.alvo);if(x.d)return{...x,r}}
 const l=a.camps.flatMap(c=>c.sets.flatMap(s=>s.ads.map(d=>({c,s,d})))).filter(x=>x.d.status!=='Pausada');
 l.sort((x,y)=>(y.d.res?y.d.g7/y.d.res:1e9)-(x.d.res?x.d.g7/x.d.res:1e9));return l[0]||{}}
/* sinais de cansaço: com recomendação da IA usa os mesmos números do "Por quê"; sem ela, calcula 7d vs 7d anteriores */
function sinaisFadiga(a){const rec=a.recs.find(x=>x.tipo==='pause'&&/anúncio/i.test(x.titulo));const cur=agg(a,addD(HOJE,-6),HOJE),prv=agg(a,addD(HOJE,-13),addD(HOJE,-7));
 const queda=prv.ctr?Math.max(0,Math.round((1-cur.ctr/prv.ctr)*100)):0;return{freq:rec?(rec.freq||3.4):cur.freq,ctrQueda:rec?(rec.ctrQueda!=null?rec.ctrQueda:38):queda,cpc:a.cpc3||a.cpc7||0,meta:a.meta,porque:rec?rec.motivo:''}}
const fmtLabel=f=>(FORMATOS.find(x=>x[0]===f)||[f,f])[1];
function briefingPadrao(a,x,fmt){const z=sinaisFadiga(a),d=x.d;
 return [`Cliente: ${a.nome} (${a.nicho})`,`Conta: ${a.perfil} · ${a.act}`,d?`Anúncio cansado: “${d.nome}” (${fmtLabel(d.fmt)}) · campanha “${x.c.nome}” · conjunto “${x.s.nome}”`:'Anúncio cansado: a definir com o gestor',
  `Sinais: frequência ${dec(z.freq,1)} · CTR caiu ${z.ctrQueda}% em 7 dias · custo por conversa ${z.cpc?brl2(z.cpc):'—'} (meta ${brl2(z.meta)})`,
  z.porque?`Por quê (IA): ${z.porque}`:'',d?`Referência do anúncio atual: texto “${d.texto}” · título “${d.titulo}” · botão ${d.cta}`:'',
  `O que precisamos: ${fmtLabel(fmt)} novo com outro gancho nos 3 primeiros segundos, mantendo a oferta e o botão ${d?d.cta:'atual'}.`].filter(Boolean).join('\n')}
function msgClientePadrao(a,x){const n=a.contato.replace(/^(Dra?\.|Eng\.|Profa?\.)\s/,''),z=sinaisFadiga(a),d=x.d,f=d&&d.fmt==='video'?'2 ou 3 vídeos curtos (15 a 30 s, gravados no celular mesmo)':'4 ou 5 fotos novas (produto, equipe ou bastidores)';
 return `Oi, ${n}! Tudo bem?\nO anúncio “${d?d.nome:'principal'}” já rodou bastante e o público cansou dele: cada pessoa viu em média ${dec(z.freq,1)} vezes e os cliques caíram ${z.ctrQueda}% na última semana. Por isso o custo por conversa subiu para ${z.cpc?brl2(z.cpc):'acima da meta'} (a meta é ${brl2(z.meta)}).\nPara voltar ao normal precisamos de material novo: ${f}. Pode mandar por aqui até ${dt(addD(HOJE,2))}?\nAssim que chegar, a gente sobe os anúncios novos no mesmo dia. Obrigado!`}
function statusCrvHTML(a,cls='qi-st'){const v=a.crv;if(!v||(!v.pedido&&!v.avisado))return'';const p=v.pedido,hoje=d=>d&&iso(d)===iso(HOJE);
 return `<small class="${cls}">${p?`<span class="crv-ok">${ic('check')}Criativo pedido a ${esc(primeiroNome(p.paraNome))} · prazo ${dm(p.prazo)}${p.tarefa?' · tarefa criada':''}</span>`:''}${v.avisado?`<span class="crv-ok">${ic('chat')}Cliente avisado ${hoje(v.avisado)?'hoje':'em '+dt(v.avisado)}</span>`:''}</small>`}
function botoesCrvHTML(a,adId){const v=crv(a),n=adId?` data-n="${adId}"`:'';
 return `<button class="btn sm" data-act="crv-pedir" data-a="${a.id}"${n} ${v.pedido?`data-tip="Já pedido a ${esc(v.pedido.paraNome)} · prazo ${dt(v.pedido.prazo)}"`:''}>${ic(v.pedido?'check':'users')}${v.pedido?'Pedido feito':'Pedir criativo'}</button><button class="btn sm" data-act="crv-avisar" data-a="${a.id}"${n}>${ic(v.avisado?'check':'chat')}${v.avisado?'Cliente avisado':'Avisar cliente'}</button>`}
/* janela-mãe (Agência OS) */
const paraHost=m=>{if(!window.EMBED||window.parent===window)return false;try{window.parent.postMessage(m,/^https?:/.test(location.protocol)?location.origin:'*');return true}catch(e){return false}};
const PEND={};
function modalPedir(a,adId){const x=adCansado(a,adId),v=crv(a);
 if(v.pedido&&!PEND.forcar){const p=v.pedido;const m=abrirModal(`<span class="lbl">${esc(a.nome)}</span><h2>Criativo já pedido</h2><p>Pedido a <b>${esc(p.paraNome)}</b> em ${dt(p.quando)} às ${hm(p.quando)} · prazo <b>${dt(p.prazo)}</b> · ${fmtLabel(p.formato)} · prioridade ${p.prioridade}.${p.tarefa?' A tarefa já está na Operação do Agência OS.':''}</p><div class="wa" style="white-space:pre-wrap">${esc(p.briefing)}</div><div class="m-act"><button class="btn" data-m="novo">Pedir outro</button><button class="btn pri" data-m="0">Fechar</button></div>`);
  m.querySelector('[data-m="0"]').onclick=fecharModal;m.querySelector('[data-m="novo"]').onclick=()=>{fecharModal();PEND.forcar=true;modalPedir(a,adId);PEND.forcar=false};return}
 const ps=pessoasCriativo(),cr=ps.filter(p=>p.criativo),out=ps.filter(p=>!p.criativo),fmt0=x.d&&x.d.fmt||'video';
 const opt=p=>`<option value="${esc(p.id)}">${esc(p.nome)}${p.papel?' · '+esc(p.papel):''}</option>`;
 const m=abrirModal(`<span class="lbl">${esc(a.nome)}${x.d?' · '+esc(x.d.nome):''}</span><h2>Pedir criativo novo</h2><p class="hint">Quem produz recebe o pedido com o briefing pronto${window.EMBED?' e a tarefa entra na Operação do Agência OS':''}. Fica registrado na auditoria da conta.</p>
 <div class="crv-g"><div class="fld"><label for="cr-para">Para quem</label><select id="cr-para">${cr.length?`<optgroup label="Fazem criativos">${cr.map(opt).join('')}</optgroup><optgroup label="Outras pessoas da equipe">${out.map(opt).join('')}</optgroup>`:ps.map(opt).join('')}</select></div>
 <div class="fld"><label for="cr-prazo">Prazo</label><input id="cr-prazo" type="date" value="${iso(addD(HOJE,1))}" min="${iso(HOJE)}"><span class="err" id="e-prazo"></span></div>
 <div class="fld"><label for="cr-fmt">Formato</label><select id="cr-fmt">${FORMATOS.map(f=>`<option value="${f[0]}" ${f[0]===fmt0?'selected':''}>${f[1]}</option>`).join('')}</select></div>
 <div class="fld"><label for="cr-pri">Prioridade</label><select id="cr-pri">${PRIORIDADES.map(p=>`<option value="${p[0]}" ${p[0]===(a.sem==='crit'?'urgente':'alta')?'selected':''}>${p[1]}</option>`).join('')}</select></div></div>
 <div class="fld"><label for="cr-brief">Briefing <span class="hint">· preenchido com os dados da conta, pode editar</span></label><textarea id="cr-brief" rows="8">${esc(briefingPadrao(a,x,fmt0))}</textarea><span class="err" id="e-brief"></span></div>
 <div class="m-act"><button class="btn" data-m="0">Cancelar</button><button class="btn pri" data-m="1">${ic('check')}Pedir criativo</button></div>`);
 m.querySelector('.mbox').classList.add('wide');
 let editou=false;$('#cr-brief').addEventListener('input',()=>{editou=true});
 $('#cr-fmt').addEventListener('change',()=>{if(!editou)$('#cr-brief').value=briefingPadrao(a,x,$('#cr-fmt').value)});
 m.querySelector('[data-m="0"]').onclick=fecharModal;
 m.querySelector('[data-m="1"]').onclick=()=>{const prazo=$('#cr-prazo').value,brief=$('#cr-brief').value.trim();let ok=true;
  const pz=prazo?new Date(prazo+'T12:00'):null;$('#e-prazo').textContent=!pz||isNaN(pz)?'Escolha a data de entrega.':pz<HOJE?`O prazo não pode ser antes de hoje (${dt(HOJE)}).`:'';if($('#e-prazo').textContent)ok=false;
  $('#e-brief').textContent=brief.length<20?'Escreva um briefing com pelo menos 20 caracteres.':'';if(brief.length<20)ok=false;if(!ok)return;
  const para=pessoaCr($('#cr-para').value),ped={ref:'pc-'+a.id+'-'+Date.now(),para:para.id,paraNome:para.nome,prazo:pz,formato:$('#cr-fmt').value,prioridade:$('#cr-pri').value,briefing:brief,anuncio:x.d?x.d.nome:'',quando:NOW(),quem:S.user,tarefa:null};
  fecharModal();registrarPedido(a,ped)}}
function registrarPedido(a,ped){const v=crv(a),antes=v.pedido;v.pedido=ped;
 const au={conta:a.id,quem:S.user,quando:ped.quando,oque:`Pediu criativo novo a @${primeiroNome(ped.paraNome)}`,onde:`${a.nome}${ped.anuncio?' · '+ped.anuncio:''}`,antes:'Anúncio cansado',depois:`${fmtLabel(ped.formato)} · prazo ${dt(ped.prazo)} · prioridade ${ped.prioridade}`,via:''};AUD.push(au);render();
 const enviou=paraHost({tipo:'pedidoCriativo',ref:ped.ref,cliente:a.nome,conta:a.act,perfil:a.perfil,anuncio:ped.anuncio,para:ped.para,prazo:iso(ped.prazo),formato:ped.formato,briefing:ped.briefing,prioridade:ped.prioridade});
 const t=toast(`${ic(enviou?'spark':'check')}<span>${enviou?`Enviando pedido para <b>${esc(ped.paraNome)}</b> no Agência OS…`:`Criativo pedido a <b>${esc(ped.paraNome)}</b> · prazo ${dt(ped.prazo)}. No Agência OS isso cria a tarefa na Operação e avisa ${esc(primeiroNome(ped.paraNome))}.`}</span><button>Desfazer</button>`,{ms:enviou?0:8000});
 PEND[ped.ref]={t,a};if(enviou)setTimeout(()=>{if(PEND[ped.ref]&&PEND[ped.ref].t===t&&!ped.tarefa){t.querySelector('span').innerHTML=`Pedido registrado aqui. O Agência OS não respondeu; confira a Operação.`;setTimeout(()=>t.remove(),6000)}},5000);
 t.querySelector('button').onclick=()=>{t.remove();v.pedido=antes;const i=AUD.indexOf(au);if(i>=0)AUD.splice(i,1);if(enviou)paraHost({tipo:'pedidoCriativoDesfazer',ref:ped.ref});delete PEND[ped.ref];render();toast(`${ic('check')}<span>Pedido de criativo desfeito.</span>`)}}
function modalAvisar(a,adId){const x=adCansado(a,adId),v=crv(a);
 const m=abrirModal(`<span class="lbl">${esc(a.nome)} · ${esc(a.contato)}</span><h2>Avisar o cliente para trocar o criativo</h2><p class="hint">Mensagem pronta para o WhatsApp. Edite se quiser, copie e cole na conversa com o cliente. Nada é enviado automaticamente.${v.avisado?` Último aviso: ${dt(v.avisado)}.`:''}</p>
 <div class="fld"><label for="av-msg">Mensagem</label><textarea id="av-msg" rows="9">${esc(msgClientePadrao(a,x))}</textarea><span class="err" id="e-msg"></span></div>
 <div class="m-act"><button class="btn" data-m="0">Cancelar</button><button class="btn pri" data-m="1">${ic('copy')}Copiar mensagem</button></div>`);
 m.querySelector('[data-m="0"]').onclick=fecharModal;
 m.querySelector('[data-m="1"]').onclick=()=>{const txt=$('#av-msg').value.trim();if(txt.length<10){$('#e-msg').textContent='Escreva a mensagem antes de copiar.';return}
  const marcar=copiou=>{fecharModal();const antes=v.avisado,ultAntes=a.ultMsg;v.avisado=NOW();a.ultMsg=HOJE;const au={conta:a.id,quem:S.user,quando:NOW(),oque:'Avisou o cliente para trocar o criativo',onde:`${a.nome} · ${a.contato}`,antes:'Cliente sem aviso',depois:'Cliente avisado (WhatsApp)',via:''};AUD.push(au);render();
   const enviou=paraHost({tipo:'clienteAvisado',cliente:a.nome,conta:a.act,anuncio:x.d?x.d.nome:'',contato:a.contato,mensagem:txt,quando:new Date().toISOString()});
   const t=toast(`${ic('check')}<span>${copiou?'Mensagem copiada. Cole no WhatsApp do cliente.':'Não deu para copiar automaticamente: selecione o texto no Histórico ou copie de novo.'} Marcado como <b>cliente avisado hoje</b>${enviou?' e registrado no Agência OS':''}.</span><button>Desfazer</button>`,{ms:8000});
   t.querySelector('button').onclick=()=>{t.remove();v.avisado=antes;a.ultMsg=ultAntes;const i=AUD.indexOf(au);if(i>=0)AUD.splice(i,1);render()}};
  (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(()=>marcar(true),()=>{const ta=$('#av-msg');ta.focus();ta.select();try{marcar(document.execCommand('copy'))}catch(_){marcar(false)}})}}
window.__extraActs=Object.assign(window.__extraActs||{},{
 'crv-pedir':b=>modalPedir(conta(b.dataset.a),b.dataset.n),
 'crv-avisar':b=>modalAvisar(conta(b.dataset.a),b.dataset.n),
});
/* respostas e comandos da janela-mãe */
window.addEventListener('message',e=>{if(!window.EMBED||e.source!==window.parent)return;const d=e.data;if(!d||typeof d!=='object'||typeof d.tipo!=='string')return;
 if(d.tipo==='tema'&&(d.tema==='claro'||d.tema==='escuro')){if(document.documentElement.dataset.tema!==d.tema){aplicaTema(d.tema);render()}return}
 if(d.tipo==='equipe'&&Array.isArray(d.pessoas)){HOST.equipe=d.pessoas.filter(p=>p&&typeof p.id==='string'&&typeof p.nome==='string').slice(0,80).map(p=>({id:p.id,nome:String(p.nome).slice(0,80),papel:String(p.papel||'').slice(0,80),criativo:!!p.criativo}));return}
 if(d.tipo==='pedidoCriativoOk'&&typeof d.ref==='string'){const pd=PEND[d.ref];if(!pd)return;const p=pd.a.crv&&pd.a.crv.pedido;if(p&&p.ref===d.ref){p.tarefa=String(d.tarefaId||'ok');if(d.paraNome)p.paraNome=String(d.paraNome)}render();
  const sp=pd.t.querySelector('span');if(sp)sp.innerHTML=`Tarefa criada na Operação para <b>${esc(p?p.paraNome:'')}</b> · prazo ${p?dt(p.prazo):''}. ${esc(primeiroNome(p?p.paraNome:''))} já recebeu a notificação.`;setTimeout(()=>pd.t.remove(),8000);return}
});
