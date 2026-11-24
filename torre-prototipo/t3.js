const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();let f=0;const F=(...m)=>{f++;console.log('FALHA',...m)},ok=(...m)=>console.log('ok',...m);
for(const [file,vp] of [['torre-controle.html',{w:1366,h:900}],['torre-controle-escuro.html',{w:390,h:844}]]){
 const ctx=await b.newContext({viewport:{width:vp.w,height:vp.h}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.route(/fonts\./,r=>r.abort());await p.goto('file://'+path.join(__dirname,file));await p.waitForTimeout(500);
 const tema=await p.evaluate(()=>document.documentElement.dataset.tema);console.log(vp.w,'tema',tema);
 // permissão
 await p.selectOption('#user','carol');await p.waitForTimeout(150);await p.evaluate(()=>location.hash='cadastro');await p.waitForTimeout(250);
 const blk=await p.evaluate(()=>document.querySelector('#board').innerText);if(!/liberado só para/.test(blk))F('Carol acessou cadastro');else ok(vp.w,'Carol bloqueada');
 await p.selectOption('#user','alan');await p.waitForTimeout(200);
 const n0=await p.evaluate(()=>CONTAS.length);
 // etapa 1
 // navegação livre: pula da etapa 1 direto para a 4 (Revisar) com tudo vazio
 const nv=await p.evaluate(()=>document.querySelector('.stepper li:nth-child(3)').className+'|'+document.querySelector('.stepper li:nth-child(3)').innerText);if(!/is-novo/.test(nv)||!/Não visitada/.test(nv))F('etapa não visitada no stepper',nv);
 await p.click('[data-cstep="4"]');await p.waitForTimeout(120);if(await p.evaluate(()=>CAD.step)!==4)F('não pulou para a etapa 4');else ok(vp.w,'pulou da etapa 1 para a 4 sem preencher');
 const s1=await p.evaluate(()=>document.querySelector('.stepper li:nth-child(1)').className+'|'+document.querySelector('.stepper li:nth-child(1)').innerText);if(!/is-warn/.test(s1)||!/\d+ pendentes?/.test(s1))F('etapa 1 sem "N pendentes"',s1);
 if(!(await p.evaluate(()=>!!document.querySelector('.cadf .cpend [data-cgo]'))))F('revisão sem lista de pendências');
 if(await p.evaluate(()=>document.querySelector('[data-cact="cadastrar"]').disabled))F('Cadastrar não deve ficar desabilitado');
 await p.click('[data-cact="cadastrar"]');await p.waitForTimeout(150);
 if(await p.evaluate(()=>CONTAS.length)!==n0)F('cadastrou com pendências');
 const pend=await p.evaluate(()=>document.querySelector('#cad-pend')?.innerText||'');if(!/Nome do cliente/.test(pend)||!/ID da conta de anúncios/.test(pend)||!/Origem da conta/.test(pend))F('resumo incompleto',pend.slice(0,200));else ok(vp.w,'Cadastrar bloqueado com resumo de pendências');
 await p.click('[data-cgo="2:origem"]');await p.waitForTimeout(120);const fo=await p.evaluate(()=>[CAD.step,document.activeElement&&document.activeElement.id]);if(fo[0]!==2||fo[1]!=='cad-origem')F('link do resumo não abriu a etapa/campo',fo);
 await p.click('[data-cstep="1"]');await p.waitForTimeout(100);
 await p.click('[data-cact="avancar"]');await p.waitForTimeout(100);if(await p.evaluate(()=>CAD.step)!==2)F('Continuar não avançou com etapa vazia');
 await p.click('[data-cact="voltar"]');await p.waitForTimeout(100);
 const e1=await p.evaluate(()=>[...document.querySelectorAll('.cf .err')].filter(x=>x.textContent).length);if(e1<2)F('dicas da etapa 1 ao voltar',e1);
 await p.fill('#cad-nome','Clínica Vida Nova');await p.click('[data-cset="empresa"][data-v="Tronno"]');await p.click('[data-cact="avancar"]');await p.waitForTimeout(100);
 // etapa 2
 const step=await p.evaluate(()=>CAD.step);if(step!==2)F('não avançou para etapa 2',step);
 await p.fill('#cad-act','act_9999999999999999');await p.waitForTimeout(1200);let w=await p.evaluate(()=>CAD.w.st);if(w!=='nf')F('fora do Windsor',w);
 await p.fill('#cad-act','act_2410055231187705');await p.waitForTimeout(1200);w=await p.evaluate(()=>CAD.w);if(w.st!=='near')F('sugestão',w);else{await p.click('[data-cact="usar"]');await p.waitForTimeout(1200);}
 w=await p.evaluate(()=>CAD.w);if(w.st!=='ok')F('conta válida',w);else ok(vp.w,'Windsor ok:',w.nome);
 const nm=await p.evaluate(()=>CAD.d.nomeMeta);if(!nm)F('nome no Meta não preencheu');
 await p.selectOption('#cad-origem','1');await p.click('[data-cact="avancar"]');await p.waitForTimeout(100);
 // etapa 3
 await p.fill('#cad-meta','12,50');await p.fill('#cad-verba','60');await p.click('[data-cact="avancar"]');await p.waitForTimeout(150);
 // etapa 4
 const rv=await p.evaluate(()=>document.querySelector('.cadf').innerText);if(!/Conta encontrada no Windsor/.test(rv))F('revisão sem validação');if(!/Cadastrado via plataforma por Allan Vieira/.test(rv))F('autoria');
 const dis=await p.evaluate(()=>document.querySelector('[data-cact="cadastrar"]').disabled);if(dis)F('botão cadastrar desabilitado');if(/Faltam? \d/.test(rv))F('ainda há pendências',rv.slice(0,200));
 await p.click('[data-cact="cadastrar"]');await p.waitForTimeout(300);const run=await p.evaluate(()=>document.querySelector('.steps').innerText);if(!/Salvando cadastro/.test(run))F('passos');
 await p.waitForTimeout(5200);const okt=await p.evaluate(()=>document.querySelector('.okc')?.innerText||'');if(!/está na Torre de Controle/.test(okt))F('sucesso',okt.slice(0,80));else ok(vp.w,'sucesso:',okt.split('\n').slice(0,3).join(' | '));
 const n1=await p.evaluate(()=>CONTAS.length);if(n1!==n0+1)F('não entrou no Painel',n0,n1);
 const nova=await p.evaluate(()=>{const a=CONTAS[CONTAS.length-1];return{sem:a.sem,cpc:a.cpc3||a.cpc7,diag:a.diag}});ok(vp.w,'semáforo inicial',JSON.stringify(nova).slice(0,200));
 await p.click('.okc [data-qopen]');await p.waitForTimeout(500);const aberto=await p.evaluate(()=>S.open);if(!aberto)F('abrir no painel');
 // duplicidade
 await p.evaluate(()=>location.hash='cadastro');await p.waitForTimeout(200);await p.click('[data-cact="novo"]').catch(()=>{});await p.waitForTimeout(100);
 await p.evaluate(()=>{CAD.d=null;CAD.rasc=null;CAD.fase='form';CAD.step=1;render()});
 await p.fill('#cad-nome','Teste duplicado');await p.click('[data-cset="empresa"][data-v="G Marketing"]');await p.click('[data-cact="avancar"]');await p.waitForTimeout(100);
 await p.fill('#cad-act','act_2410055231187704');await p.waitForTimeout(1200);w=await p.evaluate(()=>CAD.w.st);if(w!=='dup')F('duplicidade',w);else ok(vp.w,'duplicidade bloqueada');
 // pausado não entra
 await p.evaluate(()=>{CAD.d=null;CAD.rasc=null;CAD.fase='form';CAD.step=1;CAD.w={st:'vazio'};render()});
 await p.fill('#cad-nome','Studio Bella Forma');await p.click('[data-cset="empresa"][data-v="G Marketing"]');await p.click('[data-cset="status"][data-v="Pausado"]');await p.click('[data-cact="avancar"]');await p.waitForTimeout(100);
 await p.fill('#cad-act','2410 0552 3119 0218');await p.waitForTimeout(1200);await p.selectOption('#cad-origem','3');await p.click('[data-cact="avancar"]');await p.waitForTimeout(100);await p.click('[data-cact="avancar"]');await p.waitForTimeout(100);
 const n2=await p.evaluate(()=>CONTAS.length);await p.click('[data-cact="cadastrar"]');await p.waitForTimeout(3500);
 const n3=await p.evaluate(()=>CONTAS.length);const pt=await p.evaluate(()=>document.querySelector('.okc')?.innerText||'');if(n3!==n2||!/salvo no Cadastro/.test(pt))F('pausado',n2,n3,pt.slice(0,60));else ok(vp.w,'pausado salvo só no Cadastro');
 await p.click('[data-cact="fechar"]');await p.waitForTimeout(300);
 const ow=await p.evaluate(()=>document.documentElement.scrollWidth);if(ow>vp.w+1)F('overflow',ow);
 if(errs.length)F('ERROS',errs.slice(0,3));await ctx.close()}
await b.close();console.log('falhas',f)})();
