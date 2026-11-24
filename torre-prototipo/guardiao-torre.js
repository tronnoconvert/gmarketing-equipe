/* ===== Guardião de segurança (possível invasão) na Torre =====
   Motor: Guardiao (agencia-os/src/shared/guardiao.js, concatenado antes de ov.js). Este arquivo liga o motor às contas da Torre:
   simulação de invasão (demonstração), pausa automática de TODAS as campanhas ativas (nunca exclui), quarentena (linha/cartão
   preto-vermelho), painel do incidente, vigilância a cada 4 s (reativação → pausa de novo + "reincidência") e saída da quarentena
   (Dono/Admin + SIM + checklist + reativação seletiva com o orçamento de antes do incidente).
   Modo embutido: avisa o Agência OS por postMessage {tipo:'invasao', evento, incidente} (lá tocam a sirene e o banner para todos);
   recebe {tipo:'usuario'}, {tipo:'guardiaoRegras'}, {tipo:'guardiaoSync'} e {tipo:'guardiaoLiberar'}. Isolada: sirene local. */
var GT={est:{},inc:{},regras:{},papel:null,sir:null,sirOn:false,ultimo:null};
function gtLer(){try{const s=JSON.parse(localStorage.getItem('torre-guardiao')||'null');if(s&&!window.EMBED){GT.est=s.est||{};GT.inc=s.inc||{}}}catch(e){}}
function gtSalvar(){if(window.EMBED)return;try{localStorage.setItem('torre-guardiao',JSON.stringify({est:GT.est,inc:GT.inc}))}catch(e){}}
function gtQ(a){const e=GT.est[a.id];return !!(e&&e.quarentena)}
function gtPapel(){if(window.EMBED&&GT.papel)return GT.papel;return ['gabriel','rayane'].includes(S.user)?(S.user==='gabriel'?'dono':'admin'):S.user==='alan'?'gestor_trafego':'leitura'}
const gtDonoAdmin=()=>['dono','admin'].includes(gtPapel());
function gtSnap(a){return Guardiao.adaptadores.torre(a,{agora:NOW().getTime(),autorizados:TEAM.map(t=>t.id),eventos:a.eventosSeg||[],gastoHoras:a.gastoHoras||null})}
function gtCamp(a,id){return a.camps.find(c=>String(c.id)===String(id))}
function gtNo(a,id){for(const c of a.camps){if(String(c.id)===String(id))return c;for(const s of c.sets)if(String(s.id)===String(id))return s}return null}
function gtLog(a,txt){(a.segLog=a.segLog||[]).unshift({quando:NOW(),txt})}

/* verificação (uma conta): aplica as pausas do plano e avisa */
function gtVerificar(a,o={}){
 const r=Guardiao.processar(gtSnap(a),GT.est[a.id]||null,{overrides:GT.regras,incidente:GT.inc[a.id]||null});
 GT.est[a.id]=r.estado;if(r.incidente)GT.inc[a.id]=r.incidente;
 r.acoes.forEach(x=>{if(x.tipo!=='pausar')return;const c=gtCamp(a,x.id);if(c){c.status='Pausada';c.desde=HOJE;gtLog(a,`Guardião pausou “${c.nome}”`)}});
 GT.ultimo=NOW();
 if(r.evento==='invasao'||r.evento==='reincidencia'){
  gtLog(a,r.evento==='invasao'?`Possível invasão detectada: ${r.motivo}. ${r.acoes.length} campanha(s) pausada(s).`:`Reincidência: ${r.motivo}. Pausado de novo.`);
  const inc=GT.inc[a.id];
  if(typeof paraHost==='function')paraHost({tipo:'invasao',evento:r.evento,incidente:inc,conta:{id:a.id,nome:a.nome,act:a.act},pausadas:r.acoes.length});
  if(!window.EMBED)gtSirene(true);
  if(!o.silencioso)toast(`${ic('shield')}<span><b>${r.evento==='invasao'?'Possível invasão':'Reincidência'} em ${esc(a.nome)}.</b> ${r.acoes.length} campanha(s) pausada(s) automaticamente. Conta em quarentena.</span>`,{ms:7000});
 }else if(r.evento==='alerta'&&!o.silencioso){toast(`${ic('alert')}<span>${esc(r.notificacao.titulo)}</span>`,{ms:6000})}
 gtSalvar();if(r.evento&&typeof render==='function')render();return r}
/* vigilância: contas em quarentena são verificadas a cada 4 s (produção: a cada 2 min na Edge Function guardiao) */
setInterval(()=>{CONTAS.filter(gtQ).forEach(a=>gtVerificar(a,{silencioso:false}))},4000);

/* demonstração: invasor sobe orçamento ×5, adiciona parceiro, cria campanha para outro país; o gasto da última hora dispara */
function gtSimular(a){
 if(!a)return;if(gtQ(a)){toast(`${ic('lock')}<span>${esc(a.nome)} já está em quarentena.</span>`);return}
 const t=NOW().getTime(),hk={id:'meta-9912',nome:'Jhon Ads Pro'},k=t.toString(36);
 const ev=(n,min,x)=>Object.assign({id:`sim-${a.id}-${k}-${n}`,quando:new Date(t-min*60e3).toISOString(),atorId:hk.id,atorNome:hk.nome,via:'api'},x);
 const evs=[ev('admin',9,{tipo:'admin_adicionado',nivel:'conta',depois:'Parceiro “Digital Growth LTDA”'})];
 const c=a.camps.find(x=>x.status!=='Pausada');
 if(c){if(c.cbo){evs.push(ev('orc',6,{tipo:'orcamento',nivel:'campanha',alvoId:String(c.id),alvoNome:c.nome,antes:c.orc,depois:c.orc*5}));c.orc=c.orc*5}
  else{const s=c.sets.find(x=>x.status!=='Pausada')||c.sets[0];if(s){evs.push(ev('orc',6,{tipo:'orcamento',nivel:'conjunto',alvoId:String(s.id),alvoNome:s.nome,antes:s.orc,depois:s.orc*5}));s.orc=s.orc*5}}}
 const nc={id:++NID,tipo:'camp',nome:'[NOVA] Promo Black Week 90% OFF',status:'Ativa',desde:HOJE,obj:'Vendas',cbo:true,orc:900,teto:null,fim:null,lance:'Volume mais alto',g7:0,res:0,
  sets:[{id:++NID,tipo:'set',nome:'Brasil + Portugal · aberto',status:'Ativa',desde:HOJE,orc:0,g7:0,res:0,publico:{min:18,max:65,locais:'Brasil e Portugal',interesses:'Aberto'},boasVindas:'',ads:[]}]};
 a.camps.push(nc);
 evs.push(ev('nova',4,{tipo:'criacao_campanha',nivel:'campanha',alvoId:String(nc.id),alvoNome:nc.nome}),ev('pais',3,{tipo:'segmentacao',nivel:'conjunto',alvoId:String(nc.sets[0].id),alvoNome:nc.sets[0].nome,depois:{paises:['BR','PT']}}));
 a.eventosSeg=(a.eventosSeg||[]).concat(evs);
 const mh=Math.max(1,(a.gastoDia||24)/24),hs=[];for(let h=7*24;h>=1;h--)hs.push({inicio:new Date(t-h*36e5).toISOString(),gasto:mh});hs.push({inicio:new Date(t-30*6e4).toISOString(),gasto:Math.max(120,mh*9)});a.gastoHoras=hs;
 gtLog(a,`Simulação: ${hk.nome} (fora da equipe) mexeu na conta`);
 return gtVerificar(a)}
/* demonstração: o invasor reativa uma campanha pausada → na próxima verificação o Guardião pausa de novo */
function gtSimularReativacao(a){const inc=GT.inc[a.id];if(!inc||!gtQ(a))return;
 const p=inc.pausados.map(x=>gtCamp(a,x.id)).find(c=>c&&c.status==='Pausada');if(!p){toast('Nada pausado para reativar.');return}
 p.status='Ativa';const t=NOW().getTime();
 a.eventosSeg=(a.eventosSeg||[]).concat([{id:`sim-${a.id}-${t.toString(36)}-reat`,quando:new Date(t).toISOString(),atorId:'meta-9912',atorNome:'Jhon Ads Pro',via:'api',tipo:'status',nivel:'campanha',alvoId:String(p.id),alvoNome:p.nome,depois:'ativo'}]);
 gtLog(a,`Simulação: Jhon Ads Pro reativou “${p.nome}”`);render();
 toast(`${ic('alert')}<span>“${esc(p.nome)}” foi reativada por alguém de fora. O Guardião confere a conta a cada poucos segundos…</span>`,{ms:4000})}

/* reaplica um incidente vindo do Agência OS (recarregou a Torre): pausa o que foi pausado e marca a quarentena */
function gtReaplicar(inc){const a=conta(inc.contaId);if(!a)return;
 (inc.pausados||[]).forEach(p=>{const c=gtCamp(a,p.id);if(!c)return;c.status='Pausada';if(p.cbo&&p.orcAtual!=null)c.orc=p.orcAtual;(p.conjuntos||[]).forEach(s=>{const x=c.sets.find(y=>String(y.id)===s.id);if(x&&!p.cbo&&s.orcAtual!=null)x.orc=s.orcAtual})});
 GT.inc[a.id]=inc;GT.est[a.id]=Object.assign(Guardiao.estadoInicial(a.id),GT.est[a.id]||{},{quarentena:true,incidenteId:inc.id,desde:inc.abertoEm})}
/* aplica o plano de reativação (orçamento antes de ativar) e encerra a quarentena */
function gtAplicarPlano(a,plano){(plano.acoes||[]).forEach(x=>{const n=gtNo(a,x.id);if(!n)return;if(x.tipo==='orcamento')n.orc=x.para;if(x.tipo==='ativar'){n.status='Ativa';n.desde=HOJE}})}
function gtEncerrar(a,plano,quem,checklist){const s=Guardiao.sairQuarentena(GT.est[a.id],GT.inc[a.id],{quem,quando:NOW().getTime(),checklist,plano});GT.est[a.id]=s.estado;GT.inc[a.id]=s.incidente;a.eventosSeg=[];a.gastoHoras=null;gtSirene(false);gtSalvar();return s}

/* saída da quarentena (na Torre): Dono/Admin, checklist, campanhas (antes → no incidente), restaurar orçamento, SIM */
function gtLiberar(a){const inc=GT.inc[a.id];if(!inc)return;
 if(!gtDonoAdmin())return toast(`${ic('lock')}<span>Só Dono ou Admin podem tirar a conta da quarentena.</span>`);
 const L=Guardiao.planoReativacao(inc,{selecionadas:inc.pausados.map(p=>p.id),restaurar:true}).linhas;
 const m=abrirModal(`<span class="lbl">${esc(a.nome)} · quarentena</span><h2>Liberar a conta</h2><p class="hint">Só as campanhas que o Guardião pausou podem voltar. Confira a segurança antes.</p>
 <fieldset class="gt-fs"><legend>1. Checklist de segurança</legend>${Guardiao.CHECKLIST.map(c=>`<label class="gt-ck"><input type="checkbox" name="gt-ck" value="${c.id}"><span>${esc(c.rotulo)}</span></label>`).join('')}</fieldset>
 <fieldset class="gt-fs"><legend>2. Campanhas para reativar</legend>${L.map(l=>`<div class="gt-li"><label class="gt-ck"><input type="checkbox" name="gt-sel" value="${l.id}" ${l.criadaNoIncidente?'':'checked'}><span><b>${esc(l.nome)}</b>${l.criadaNoIncidente?'<small class="dn">Criada durante o incidente — confirme com o cliente</small>':''}<small>Orçamento: ${brl2(l.orcAntes)} antes → <b class="${l.alterado?'dn':''}">${brl2(l.orcAtual)}</b> no incidente</small></span></label>${l.alterado?`<label class="gt-ck sm"><input type="checkbox" name="gt-rest" value="${l.id}" checked><span>Restaurar orçamento anterior ao incidente (${brl2(l.orcAntes)})</span></label>`:''}</div>`).join('')}</fieldset>
 <div class="fld"><label for="gt-sim">3. Digite <b>SIM</b> para confirmar</label><input id="gt-sim" autocomplete="off" placeholder="SIM" style="max-width:140px"></div><p class="err" id="gt-err" role="alert" hidden></p>
 <div class="m-act"><button class="btn" data-m="0">Cancelar</button><button class="btn pri" data-m="1">Liberar e reativar</button></div>`);
 m.querySelector('[data-m="0"]').onclick=fecharModal;
 m.querySelector('[data-m="1"]').onclick=()=>{const ck=Object.fromEntries(Guardiao.CHECKLIST.map(c=>[c.id,!!m.querySelector(`input[name="gt-ck"][value="${c.id}"]:checked`)]));
  const sel=[...m.querySelectorAll('input[name="gt-sel"]:checked')].map(x=>x.value),rest=Object.fromEntries(L.map(l=>[l.id,!l.alterado||!!m.querySelector(`input[name="gt-rest"][value="${l.id}"]:checked`)]));
  const err=t=>{const e=m.querySelector('#gt-err');e.textContent=t;e.hidden=false};
  const v=Guardiao.validarSaida({papel:gtPapel(),confirmacao:m.querySelector('#gt-sim').value,checklist:ck});if(!v.ok)return err(v.erros.papel||v.erros.checklist||v.erros.confirmacao);
  const plano=Guardiao.planoReativacao(inc,{selecionadas:sel,restaurar:rest});if(!plano.ok)return err(plano.erros.join(' '));
  gtAplicarPlano(a,plano);const s=gtEncerrar(a,plano,{userId:S.user,nome:ME().nome},ck);
  gtLog(a,`${ME().nome} liberou a conta (SIM + checklist): ${plano.acoes.filter(x=>x.tipo==='ativar').length} campanha(s) reativada(s)`);
  if(typeof paraHost==='function')paraHost({tipo:'quarentenaEncerrada',incidente:s.incidente,plano,checklist:ck});
  fecharModal();render();toast(`${ic('check')}<span>${esc(a.nome)} saiu da quarentena. ${plano.acoes.filter(x=>x.tipo==='ativar').length} campanha(s) reativada(s)${plano.acoes.some(x=>x.tipo==='orcamento')?' com o orçamento de antes do incidente':''}.</span>`)}}

/* ----- interface ----- */
function gtSev(s){return `<span class="gt-sev s-${s}">${{critica:'Crítica',alta:'Alta',media:'Média'}[s]||s}</span>`}
function gtIncHTML(a){const inc=GT.inc[a.id];if(!inc||!gtQ(a))return'';const da=gtDonoAdmin(),nR=(inc.reincidencias||[]).length;
 const tot=p=>p.cbo?[p.orcAntes,p.orcAtual]:[p.conjuntos.filter(s=>s.ativo).reduce((x,s)=>x+(s.orcAntes||0),0),p.conjuntos.filter(s=>s.ativo).reduce((x,s)=>x+(s.orcAtual||0),0)];
 const ass=(inc.assumidoPor||[]).map(x=>x.nome).join(', ');
 return `<section class="gt-inc" role="region" aria-label="Incidente de segurança"><div class="gt-h"><span class="gt-tag"><i></i>Quarentena · possível invasão</span><span class="gt-qd">desde ${hm(new Date(inc.abertoEm))}${nR?` · ${nR} reincidência${nR>1?'s':''}`:''}${ass?` · assumido por ${esc(ass)}`:''}</span></div>
 <h3>Conta pausada automaticamente pelo Guardião</h3><p>Todas as campanhas ativas foram pausadas (nenhuma excluída). Enquanto estiver em quarentena, qualquer reativação ou alteração nova é pausada de novo e avisa toda a equipe.</p>
 <div class="gt-g"><div><h4>Detectado</h4><ul>${inc.achados.slice(0,6).map(x=>`<li>${gtSev(x.severidade)}<span><b>${esc(x.titulo)}</b><small>${esc(x.detalhe)}</small></span></li>`).join('')}</ul></div>
 <div><h4>Pausado pelo Guardião</h4><ul>${inc.pausados.map(p=>{const [an,at]=tot(p),c=gtCamp(a,p.id);return `<li><span class="gt-st ${c&&c.status!=='Pausada'?'on':''}">${c&&c.status!=='Pausada'?'Ativa':'Pausada'}</span><span><b>${esc(p.nome)}</b><small>${brl2(an)} antes → <b class="${at>an?'dn':''}">${brl2(at)}</b>/dia no incidente${p.criadaNoIncidente?' · criada pelo invasor':''}</small></span></li>`}).join('')}</ul></div></div>
 ${(a.segLog||[]).length?`<details class="gt-log"><summary>Registro do Guardião (${a.segLog.length})</summary><ul>${a.segLog.slice(0,12).map(l=>`<li><time>${hm(l.quando)}</time>${esc(l.txt)}</li>`).join('')}</ul></details>`:''}
 <div class="gt-ac">${!window.EMBED&&GT.sirOn?`<button class="btn gt-assumir" data-gt="assumir" data-a="${a.id}">${ic('check')}Assumir incidente</button>`:''}<button class="btn gt-pri${da?'':' dis'}" data-gt="liberar" data-a="${a.id}" ${da?'':'aria-disabled="true" data-tip="Só Dono ou Admin (Gabriel ou Rayane) tiram a conta da quarentena, com SIM e checklist."'}>${ic('lock')}Liberar conta…</button>${da?`<button class="btn gt-sec" data-gt="reativar" data-a="${a.id}">${ic('play')}Simular reativação pelo invasor</button>`:''}${window.EMBED?'<span class="gt-hint">O alerta com sirene foi enviado a todos os gestores, ao dono e aos admins no Agência OS.</span>':''}</div></section>`}
function gtFaixa(){const q=CONTAS.filter(gtQ),da=gtDonoAdmin();
 const quar=q.length?`<section class="gt-fx" role="alert"><span class="gt-tag"><i></i>${q.length} conta${q.length>1?'s':''} em quarentena</span><span class="gt-fx-l">${q.map(a=>`<button class="gt-fx-c" data-qopen="${a.id}"><b>${esc(a.nome)}</b><small>${GT.inc[a.id]?GT.inc[a.id].pausados.length:0} campanhas pausadas · possível invasão</small></button>`).join('')}</span></section>`:'';
 const demo=da?`<section class="glass gt-demo"><span class="gt-ic">${ic('shield')}</span><div><b>Guardião de segurança</b><small>Vigia mudanças bruscas (orçamento, gasto por hora, admin novo, campanha criada fora da equipe…) e pausa a conta sozinho. ${GT.ultimo?`Última verificação ${hm(GT.ultimo)}.`:'Vigiando todas as contas.'}</small></div><button class="btn sm gt-sim" data-gt="simular" data-a="${S.open&&!gtQ(conta(S.open))?S.open:(CONTAS.find(a=>!gtQ(a)&&a.camps.some(c=>c.status!=='Pausada'))||{}).id}">${ic('alert')}Simular invasão (demonstração)</button></section>`:'';
 return quar+demo}
function gtBadge(a){return gtQ(a)?`<span class="gt-b">${ic('lock')}Quarentena</span>`:''}

/* sirene local (Torre isolada; no Agência OS quem toca é o app) */
function gtSirene(on){GT.sirOn=on;clearInterval(GT.sir);GT.sir=null;if(!on||window.EMBED)return;
 const toque=()=>{try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();if(AC.state!=='running')AC.resume();const t0=AC.currentTime+.02,o=AC.createOscillator(),g=AC.createGain();o.type='sawtooth';for(let i=0;i<8;i++)o.frequency.setValueAtTime(i%2?640:960,t0+i*.4);g.gain.setValueAtTime(.0001,t0);g.gain.exponentialRampToValueAtTime(.25,t0+.05);g.gain.setValueAtTime(.25,t0+3.1);g.gain.exponentialRampToValueAtTime(.0001,t0+3.2);o.connect(g);g.connect(AC.destination);o.start(t0);o.stop(t0+3.25)}catch(e){}};
 toque();GT.sir=setInterval(toque,10000)}

document.addEventListener('click',e=>{const b=e.target.closest('[data-gt]');if(!b)return;e.preventDefault();e.stopPropagation();
 if(b.classList.contains('dis')){toast(`${ic('lock')}<span>${esc(b.dataset.tip||'Sem permissão.')}</span>`);return}
 const a=conta(b.dataset.a),k=b.dataset.gt;
 if(k==='simular'){if(!gtDonoAdmin())return toast(`${ic('lock')}<span>A simulação é só para Dono e Admin.</span>`);const r=gtSimular(a);if(r&&r.evento==='invasao'){S.open=a.id;S.tab='painel';render()}return}
 if(k==='reativar')return gtSimularReativacao(a);
 if(k==='liberar')return gtLiberar(a);
 if(k==='assumir'){GT.inc[a.id]=Guardiao.assumir(GT.inc[a.id],{userId:S.user,nome:ME().nome},NOW().getTime());gtSirene(false);gtSalvar();render();toast(`${ic('check')}<span>Você assumiu o incidente. Sirene desligada.</span>`)}
},true);
/* mensagens do Agência OS */
addEventListener('message',e=>{if(!window.EMBED||e.source!==window.parent)return;const d=e.data;if(!d||typeof d!=='object')return;
 if(d.tipo==='usuario'){GT.papel=typeof d.papel==='string'?d.papel:null;if(typeof render==='function')render();return}
 if(d.tipo==='guardiaoRegras'){GT.regras=d.regras&&typeof d.regras==='object'?d.regras:{};return}
 if(d.tipo==='guardiaoSync'&&Array.isArray(d.incidentes)){let mud=false;d.incidentes.forEach(inc=>{if(!inc||!inc.contaId)return;const a=conta(inc.contaId);if(!a)return;
   if(inc.estado!=='encerrado'){if(!gtQ(a)){gtReaplicar(inc);mud=true}else GT.inc[a.id]=Object.assign({},GT.inc[a.id],{assumidoPor:inc.assumidoPor,estado:inc.estado})}
   else if(gtQ(a)&&GT.inc[a.id]&&GT.inc[a.id].id===inc.id){gtAplicarPlano(a,{acoes:(inc.orcamentosRestaurados||[]).concat((inc.reativadas||[]).map(id=>({tipo:'ativar',id})))});gtEncerrar(a,{acoes:[]},inc.encerradoPor,inc.checklist);mud=true}});
  if(mud&&typeof render==='function')render();return}
 if(d.tipo==='guardiaoLiberar'&&d.plano){const a=conta(d.contaId);if(!a||!gtQ(a))return;gtAplicarPlano(a,d.plano);gtEncerrar(a,d.plano,d.quem||null,d.checklist||null);gtLog(a,'Liberada no Agência OS (SIM + checklist)');render()}});
gtLer();Object.values(GT.inc).forEach(inc=>{if(inc&&inc.estado!=='encerrado')gtReaplicar(inc)});
