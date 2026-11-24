// t8: central "Padrões e regras" — postMessage {tipo:'padroes'} muda o semáforo (régua, conta parada, dados insuficientes),
// os limites de orçamento (mudanças por hora, mínimo por dia) e persiste em localStorage 'torre-padroes' (Torre isolada).
const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();let fails=0;const F=(...m)=>{fails++;console.log('FALHA',...m)};const ok=(...m)=>console.log('ok',...m);
 const ctx=await b.newContext({viewport:{width:1366,height:820}});const p=await ctx.newPage();await p.route(/fonts\./,r=>r.abort());
 const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto('file://'+path.join(__dirname,'torre-controle.html'));await p.waitForTimeout(300);await p.evaluate(()=>localStorage.removeItem('torre-padroes'));await p.reload();await p.waitForTimeout(400);
 const post=async v=>{await p.evaluate(v=>window.postMessage({tipo:'padroes',valores:v},'*'),v);await p.waitForTimeout(250)};
 const sem=id=>p.evaluate(i=>conta(i).sem,id);
 // 1) valores de fábrica: nada muda em relação ao desenho original das contas
 const r0=await p.evaluate(()=>({igual:CONTAS.every(a=>a.sem===a.alvo),pd:[PD('torre.semaforo.atencao'),PD('orcamento.maxMudancasHora'),PD('orcamento.minimoDia')].join()}));
 if(!r0.igual)F('semáforo de fábrica mudou');else ok('padrões de fábrica = semáforo original das 30 contas');
 if(r0.pd!=='1.25,4,6')F('valores de fábrica',r0.pd);else ok('fábrica: Atenção até 1,25 · 4 mudanças/hora · mínimo R$ 6');
 // 2) Atenção 1,25 → 1,10: contas com índice entre 1,10 e 1,25 passam de Atenção para Caro
 const mov=await p.evaluate(()=>CONTAS.filter(a=>a.sem==='aten'&&a.indice>1.10).map(a=>a.id));
 const fica=await p.evaluate(()=>CONTAS.filter(a=>a.sem==='aten'&&a.indice<=1.10).map(a=>a.id));
 if(!mov.length||!fica.length)F('massa de teste',mov,fica);
 await post({'torre.semaforo.atencao':1.10});
 const r1=await p.evaluate(([m,f])=>({m:m.map(i=>conta(i).sem),f:f.map(i=>conta(i).sem),ls:JSON.parse(localStorage.getItem('torre-padroes')||'{}')['torre.semaforo.atencao'],
  linha:(document.querySelector(`tr.r[data-open="${m[0]}"]`)||{}).innerText||'',diag:conta(m[0]).diag}),[mov,fica]);
 if(!r1.m.every(s=>s==='caro'))F('Atenção 1,10 não virou Caro',r1.m);else ok(`Atenção até 1,10: contas ${mov.join(', ')} passaram de Atenção para Caro`);
 if(!r1.f.every(s=>s==='aten'))F('conta abaixo de 1,10 mudou',r1.f);else ok('conta com índice ≤ 1,10 continua em Atenção');
 if(!/Caro/.test(r1.linha))F('linha da tabela não mostra Caro',r1.linha.slice(0,120));else ok('tabela re-renderizada com Caro');
 if(!/\(Caro\)/.test(r1.diag))F('diagnóstico não atualizado',r1.diag);else ok('diagnóstico recalculado');
 if(r1.ls!==1.1)F('localStorage torre-padroes',r1.ls);else ok('padrão gravado em localStorage torre-padroes');
 // persistência na Torre isolada
 await p.reload();await p.waitForTimeout(400);
 if(await sem(mov[0])!=='caro')F('padrão não persistiu no recarregamento');else ok('ao recarregar a Torre isolada usa torre-padroes');
 // régua fora de ordem → fábrica
 await post({'torre.semaforo.atencao':0.5});
 if(await sem(mov[0])!=='aten')F('régua fora de ordem deveria usar a de fábrica');else ok('régua fora de ordem é ignorada (usa a de fábrica)');
 // 3) conta parada e dados insuficientes
 await post({});
 const par=await p.evaluate(()=>CONTAS.filter(a=>a.sem==='par').map(a=>({id:a.id,zeros:(()=>{let n=0;for(let i=a.series.length-1;i>=0&&!a.series[i].sp;i--)n++;return n})()})));
 const curta=par.reduce((x,y)=>x.zeros<y.zeros?x:y),longa=par.reduce((x,y)=>x.zeros>y.zeros?x:y);
 await post({'torre.contaParada.dias':curta.zeros+1});
 const r3=[await sem(curta.id),await sem(longa.id)];
 if(r3[0]==='par'||r3[1]!=='par')F('conta parada dias',curta,longa,r3);else ok(`Conta parada com ${curta.zeros+1} dias: conta ${curta.id} (${curta.zeros} dias sem gasto) sai de "Conta parada", conta ${longa.id} continua`);
 await post({'torre.dadosInsuficientes.minConversas':30});
 const r4=await p.evaluate(()=>({ins:CONTAS.filter(a=>a.sem==='ins').map(a=>a.id),ok:CONTAS.filter(a=>a.sem==='ins').every(a=>a.conv7<30||a.series.slice(-7).filter(x=>x.sp>0).length<3)}));
 if(r4.ins.length<2||!r4.ok)F('dados insuficientes 30 conversas',r4);else ok(`mínimo de 30 conversas: ${r4.ins.length} contas em Dados insuficientes`);
 // 4) limite de mudanças de orçamento por hora 4 → 2 (modal e "Fazer agora")
 await post({});await p.selectOption('#user','alan');await p.waitForTimeout(150);
 const alvo=await p.evaluate(()=>{const a=CONTAS.find(x=>x.id>3&&x.sem==='bom'&&x.camps.some(c=>c.cbo&&c.status!=='Pausada'));const c=a.camps.find(c=>c.cbo&&c.status!=='Pausada');const n=NOW().getTime();BL[c.id]=[n-20*60e3,n-8*60e3];return{a:a.id,c:c.id}});
 await p.evaluate(({a,c})=>modalOrcamento(conta(a),c),alvo);await p.waitForTimeout(150);
 const m4=await p.evaluate(()=>({aberto:!!document.querySelector('#o-v'),txt:(document.querySelector('.mbox')||{}).innerText||''}));
 if(!m4.aberto||!/2\/4/.test(m4.txt))F('com 4/hora e 2 usadas o modal deveria abrir',m4.txt.slice(0,200));else ok('4 por hora: 2 usadas, modal abre ("Mudanças nesta hora: 2/4")');
 // mínimo por dia vem do padrão
 await p.fill('#o-v','5,00');await p.waitForTimeout(80);
 if(!/R\$\s?6,00/.test(await p.textContent('#o-e')))F('mínimo R$ 6 de fábrica');
 await p.evaluate(()=>fecharModal());
 await post({'orcamento.maxMudancasHora':2,'orcamento.minimoDia':50});
 await p.evaluate(({a,c})=>modalOrcamento(conta(a),c),alvo);await p.waitForTimeout(150);
 const m5=await p.evaluate(()=>({aberto:!!document.querySelector('#o-v'),toast:[...document.querySelectorAll('.toast')].map(t=>t.innerText).join(' | ')}));
 if(m5.aberto||!/no máximo 2 mudanças/.test(m5.toast))F('limite 2/hora não aplicado',m5);else ok('2 por hora: bloqueado com aviso "no máximo 2 mudanças… por hora"');
 await p.evaluate(({c})=>{BL[c]=[NOW().getTime()-5*60e3]},alvo);
 await p.evaluate(({a,c})=>modalOrcamento(conta(a),c),alvo);await p.waitForTimeout(150);
 await p.fill('#o-v','40,00');await p.waitForTimeout(80);
 const e6=await p.textContent('#o-e');if(!/R\$\s?50,00/.test(e6))F('mínimo por dia 50',e6);else ok('orçamento mínimo por dia R$ 50 aplicado na validação');
 await p.evaluate(()=>fecharModal());
 // 5) volta ao padrão de fábrica
 await post({});
 if(!await p.evaluate(()=>CONTAS.every(a=>a.sem===a.alvo)&&PD('orcamento.maxMudancasHora')===4))F('restaurar fábrica');else ok('valores vazios restauram a fábrica');
 await p.evaluate(()=>localStorage.removeItem('torre-padroes'));
 if(errs.length)F('erros',errs);
 await b.close();console.log('falhas',fails);process.exit(fails?1:0)})();
