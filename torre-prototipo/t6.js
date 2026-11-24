// t6: recomendações vêm do motor único (MotorRecs): formato, "Por quê", fila, teto, regras via localStorage e via postMessage, registro de decisões
const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();let fails=0;const F=(...m)=>{fails++;console.log('FALHA',...m)};const ok=(...m)=>console.log('ok',...m);
 const ARQ='file://'+path.join(__dirname,'torre-controle.html');
 const ctx=await b.newContext({viewport:{width:1366,height:820}});const p=await ctx.newPage();await p.route(/fonts\./,r=>r.abort());
 const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(ARQ);await p.waitForTimeout(400);await p.evaluate(()=>{localStorage.removeItem('torre-motor-regras');localStorage.removeItem('torre-recs-log')});await p.reload();await p.waitForTimeout(400);
 const r=await p.evaluate(()=>({motor:typeof MotorRecs==='object'&&MotorRecs.REGRAS_PADRAO.length,todas:CONTAS.flatMap(a=>a.recs).every(x=>x.motorId&&x._m&&x.motivo===x._m.porque&&['agora','hoje','semana'].includes(x.prioridade)),
  tipos:[...new Set(CONTAS.flatMap(a=>a.recs.map(x=>x.tipo)))].sort().join(','),regras:[...new Set(CONTAS.flatMap(a=>a.recs.map(x=>x.regraId)))].length,
  budget:CONTAS.flatMap(a=>a.recs).filter(x=>x.tipo==='budget').every(x=>typeof x.de==='number'&&typeof x.para==='number'&&/A conta passa a investir/.test(x.frase)),
  teto:CONTAS.some(a=>a.tetoDia&&a.recs.some(x=>x.tipo==='budget'&&x._m.orcamentoDiarioContaDepois.excedeTeto)),
  fila:CONTAS.filter(a=>prioridade(a)===0).every(a=>a.sem==='par'||a.alertas>=2||a.revisao==='Revisão com erro'||a.statusOp==='Pagamento pendente'||(recFila(a)&&recFila(a).prioridade==='agora'))}));
 if(r.motor!==10)F('MotorRecs ausente',r.motor);else ok('motor único carregado');
 if(!r.todas)F('recomendação fora do formato do motor');else ok('todas as recomendações vêm do motor, Por quê = porque do motor');
 if(!/budget/.test(r.tipos)||!/pause/.test(r.tipos)||!/criativo/.test(r.tipos)||!/msg/.test(r.tipos)||r.regras<6)F('variedade de regras',r.tipos,r.regras);else ok('tipos',r.tipos,'regras',r.regras);
 if(!r.budget)F('orçamento sem frase do orçamento diário');else ok('frase do orçamento diário');
 if(!r.teto)F('demonstração de teto excedido');else ok('teto excedido avisado');
 if(!r.fila)F('prioridade "Agora" não bate com o motor');else ok('fila usa a prioridade do motor');
 // Por quê na fila
 const pq=await p.evaluate(()=>{const b=document.querySelector('.qi [data-qwhy]');if(!b)return null;const id=+b.dataset.qwhy;b.click();const a=CONTAS.find(x=>x.id===id);return{txt:document.getElementById('qw-'+id).innerText,esperado:recFila(a).motivo}});
 if(!pq||!pq.txt.includes(pq.esperado.slice(0,40)))F('Por quê da fila',pq);else ok('Por quê da fila mostra o motor');
 // regras via localStorage (Torre isolada)
 await p.evaluate(()=>localStorage.setItem('torre-motor-regras',JSON.stringify({'escalar-verba':{ativo:false}})));await p.reload();await p.waitForTimeout(400);
 if(await p.evaluate(()=>CONTAS.some(a=>a.recs.some(x=>x.regraId==='escalar-verba'))))F('regra desligada no localStorage ainda gera');else ok('localStorage torre-motor-regras desliga regra');
 // regras via postMessage (Agência OS)
 await p.evaluate(()=>window.postMessage({tipo:'motorRegras',regras:{}},'*'));await p.waitForTimeout(250);
 const pm=await p.evaluate(()=>({volta:CONTAS.some(a=>a.recs.some(x=>x.regraId==='escalar-verba')),ls:localStorage.getItem('torre-motor-regras')}));
 if(!pm.volta||pm.ls!=='{}')F('postMessage motorRegras',pm);else ok('postMessage motorRegras regera recomendações');
 // fazer agora (orçamento) com SIM + registro de aprendizado
 await p.selectOption('#user','alan');await p.waitForTimeout(150);
 const id=await p.evaluate(()=>CONTAS.find(a=>a.recs.some(x=>x.tipo==='budget'&&x.status==='aberta')&&a.revisao!=='Revisão com erro'&&a.statusOp==='OK').id);
 await p.evaluate(i=>location.hash='c-'+i,id);await p.waitForTimeout(300);
 const det=await p.evaluate(()=>document.body.innerText);if(!/Impacto esperado/.test(det))F('detalhe sem impacto esperado');else ok('impacto esperado no detalhe');
 const rid=await p.evaluate(i=>CONTAS.find(a=>a.id===i).recs.find(x=>x.tipo==='budget'&&x.status==='aberta').id,id);
 await p.click(`[data-act="rec-fazer"][data-r="${rid}"]`);await p.waitForTimeout(150);
 const mt=await p.textContent('.mbox');if(!/SIM/.test(mt))F('sem confirmação SIM');
 await p.fill('#sim','SIM');await p.click('[data-m="1"]');await p.waitForTimeout(1100);
 const lg=await p.evaluate(r=>JSON.parse(localStorage.getItem('torre-recs-log')||'[]').filter(e=>e.decisao==='aceita'&&e.regraId).length,rid);
 if(lg<1)F('registro de aprendizado');else ok('decisão aceita no torre-recs-log');
 if(errs.length)F('erros',errs);
 await b.close();console.log('falhas',fails);process.exit(fails?1:0)})();
