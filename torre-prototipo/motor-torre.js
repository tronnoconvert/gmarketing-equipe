/* ===== Recomendações da IA = motor único do Agência OS (src/shared/motor-recs.js, concatenado antes deste arquivo) =====
   O adaptador MotorRecs.adaptadores.torre(conta) monta o snapshot; aqui a saída do motor vira o formato de recomendação da Torre
   ({id, status, tipo: budget|pause|publico|msg|criativo|verificar|aguardar, titulo, motivo, alvo, de, para}).
   Regras ajustadas: localStorage 'torre-motor-regras' (Torre isolada) ou postMessage {tipo:'motorRegras', regras} da janela-mãe (Agência OS). */
const MOTOR={ov:(()=>{try{return JSON.parse(localStorage.getItem('torre-motor-regras')||'{}')||{}}catch(e){return{}}})(),log:(()=>{try{return JSON.parse(localStorage.getItem('torre-recs-log')||'[]')||[]}catch(e){return[]}})()};
const TIPO_TORRE={orcamento:'budget',pausar:'pause',publico:'publico',mensagemCliente:'msg',pedirCriativo:'criativo',verificar:'verificar',aguardar:'aguardar'};
function recsDaConta(a){
 const snap=MotorRecs.adaptadores.torre(a,{hoje:HOJE,invDia:x=>invDia(x),orcamentoMinimo:PD('orcamento.minimoDia')});
 const anuncio=id=>{for(const c of snap.campanhas)for(const s of c.conjuntos)for(const d of s.anuncios)if(d.id===id)return d;return null};
 // uma sugestão por regra por conta (a 1ª, que é a mais urgente / do conjunto principal): a fila mostra o que fazer primeiro
 const vistas={};
 return MotorRecs.recomendar(snap,{overrides:MOTOR.ov}).filter(m=>vistas[m.regraId]?false:(vistas[m.regraId]=1)).map((m,i)=>{const t=TIPO_TORRE[m.acao.tipo],alvo=m.alvo.nivel==='conta'?null:m.alvo.id;
  const r={id:a.id*100+i,status:'aberta',tipo:t,motorId:m.id,regraId:m.regraId,titulo:m.titulo,motivo:m.porque,impacto:m.impactoEsperado,prioridade:m.prioridade,confianca:m.confianca,aviso:m.aviso,alvo,_m:m};
  const {s}=alvo?nodeOf(a,alvo):{};
  if(t==='budget'){r.de=m.de;r.para=m.para;r.frase=m.orcamentoDiarioContaDepois.frase}
  else if(t==='pause'){r.de='Ativo';r.para='Pausado';const d=anuncio(alvo);if(d&&d.metricas7d&&d.metricas7dAnterior){const c7=d.metricas7d.cliques/d.metricas7d.impressoes,c0=d.metricas7dAnterior.cliques/d.metricas7dAnterior.impressoes;r.freq=d.metricas7d.frequencia;r.ctrQueda=c0?Math.round((1-c7/c0)*100):null}}
  else if(t==='publico'){r.de=s?`${s.publico.min}–${s.publico.max} anos`:'Público atual';r.para='Público renovado'}
  else if(t==='msg'){r.de='Sem mensagem esta semana';r.para='Mensagem copiada para o WhatsApp'}
  else if(t==='criativo'){r.de='Anúncios cansados';r.para='Criativo novo pedido'}
  else if(t==='verificar'){r.de='A verificar';r.para='Verificado'}
  else{r.de='Poucos dados';r.para='Reavaliar em 3 dias'}
  return r})}
/* gera (ou regera, após mudar as regras) mantendo o que já foi decidido */
function gerarRecs(lista){(lista||CONTAS).forEach(a=>{const ant=a.recs||[],st={};ant.forEach(r=>{if(r.motorId&&r.status!=='aberta')st[r.motorId]=r});
 const novas=recsDaConta(a);novas.forEach(r=>{if(st[r.motorId]){r.status=st[r.motorId].status;delete st[r.motorId]}});
 a.recs=novas.concat(Object.values(st).map((r,i)=>({...r,id:a.id*100+50+i})))})}
/* recomendação aberta que ainda vale (pedido de criativo já feito conta como resolvido) */
function recFeita(a,r){return r.status!=='aberta'||(r.tipo==='criativo'&&!!(a.crv&&a.crv.pedido))}
function recAberta(a){return a.recs.find(r=>!recFeita(a,r))}
/* registro de aprendizado: aceita/recusada/adiada (localStorage + janela-mãe, que grava na coleção recsLog do Agência OS) */
function logRec(a,r,decisao){if(!r||!r._m)return;try{const e={...MotorRecs.registrarDecisao(r._m,decisao,S.user),origem:'torre',contaId:a.id,contaNome:a.nome};MOTOR.log.push(e);localStorage.setItem('torre-recs-log',JSON.stringify(MOTOR.log.slice(-300)));if(typeof paraHost==='function')paraHost({tipo:'recDecisao',entrada:e})}catch(e){}}
gerarRecs();
/* demonstração: um cliente com teto diário sem folga, em que o aumento sugerido passa do teto (o motor avisa) */
(()=>{const a=CONTAS.find(x=>x.sem!=='par'&&!x.tetoDia&&x.recs.some(r=>r.tipo==='budget'&&r.para>r.de));if(!a)return;const t=invDia(a);if(t>0){a.tetoDia=Math.floor(t);gerarRecs([a])}})();
/* regras vindas do Agência OS (modo embutido) */
addEventListener('message',e=>{const m=e.data;if(!m||m.tipo!=='motorRegras'||(window.parent!==window&&e.source!==window.parent))return;
 MOTOR.ov=m.regras&&typeof m.regras==='object'?m.regras:{};try{localStorage.setItem('torre-motor-regras',JSON.stringify(MOTOR.ov))}catch(_){}
 gerarRecs();if(typeof render==='function')render()});
