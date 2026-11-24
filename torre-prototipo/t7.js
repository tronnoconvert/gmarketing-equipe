// t7: Guardião de segurança — simular invasão → todas as campanhas ativas pausadas, quarentena (linha preta-vermelha),
// tentativa de reativação pausada de novo (reincidência), saída com SIM + checklist reativando só as escolhidas com o orçamento de antes.
const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();let fails=0;const F=(...m)=>{fails++;console.log('FALHA',...m)};const ok=(...m)=>console.log('ok',...m);
 for(const [w,h] of [[1366,820],[390,844]]){
 const ctx=await b.newContext({viewport:{width:w,height:h}});const p=await ctx.newPage();await p.route(/fonts\./,r=>r.abort());
 const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto('file://'+path.join(__dirname,'torre-controle.html'));await p.waitForTimeout(300);await p.evaluate(()=>localStorage.removeItem('torre-guardiao'));await p.reload();await p.waitForTimeout(400);
 if(!await p.evaluate(()=>typeof Guardiao==='object'&&Guardiao.REGRAS_PADRAO.length===11))F('motor Guardiao ausente');else ok(w,'motor Guardiao no build');
 // gestor não vê o botão de simulação; dono vê
 await p.selectOption('#user','vitor');await p.waitForTimeout(150);
 if(await p.$('[data-gt="simular"]'))F('gestor vê simulação');else ok('simulação escondida para gestor');
 await p.selectOption('#user','gabriel');await p.waitForTimeout(150);
 if(!await p.isVisible('[data-gt="simular"]'))F('dono não vê "Simular invasão"');else ok('dono vê "Simular invasão (demonstração)"');
 const id=await p.$eval('[data-gt="simular"]',x=>+x.dataset.a);
 const antes=await p.evaluate(i=>{const a=conta(i);return{ativas:a.camps.filter(c=>c.status!=='Pausada').map(c=>c.id),n:a.camps.length,orc:Object.fromEntries(a.camps.map(c=>[c.id,c.cbo?c.orc:c.sets.filter(s=>s.status!=='Pausada').reduce((x,s)=>x+s.orc,0)]))}},id);
 await p.click('[data-gt="simular"]');await p.waitForTimeout(400);
 const r=await p.evaluate(i=>{const a=conta(i);return{quar:gtQ(a),ativas:a.camps.filter(c=>c.status!=='Pausada').length,n:a.camps.length,inc:GT.inc[i]}},id);
 if(!r.quar)F('conta não entrou em quarentena');else ok('quarentena');
 if(r.ativas!==0)F('ficou campanha ativa',r.ativas);else ok('todas as campanhas ativas pausadas');
 if(r.n!==antes.n+1)F('campanha excluída ou nova não registrada',r.n,antes.n);else ok('nenhuma campanha excluída (+1 do invasor, pausada)');
 if(r.inc.pausados.length!==antes.ativas.length+1||!r.inc.pausados.some(x=>x.criadaNoIncidente))F('registro do que foi pausado',r.inc.pausados.length);else ok('incidente registra o que pausou');
 const txt=await p.evaluate(()=>document.body.textContent);
 if(!/Quarentena · possível invasão/i.test(txt)||!/Pausado pelo Guardião/.test(txt))F('painel do incidente');else ok('painel do incidente na conta');
 if(!await p.$('.gt-fx')||(!(w<700)&&!await p.$(`tr.r.quar[data-open="${id}"]`))||(w<700&&!await p.$(`.cd.quar[data-open="${id}"]`)))F('linha/cartão preto-vermelho');else ok('linha/cartão em quarentena + faixa');
 await p.screenshot({path:path.join(__dirname,`g-${w}.png`),fullPage:false});
 // equipe não consegue reativar pelo botão normal
 await p.evaluate(()=>{S.tab='campanhas';render()});await p.waitForTimeout(150);
 const c0=r.inc.pausados[0].id;
 await p.evaluate(c=>{const b=document.querySelector(`[data-act="pausar"][data-n="${c}"]`);b&&b.click()},+c0);await p.waitForTimeout(200);
 if(await p.evaluate(()=>!document.querySelector('#modal').hidden))F('reativação pela equipe abriu confirmação');else ok('reativação bloqueada em quarentena');
 await p.evaluate(()=>{S.tab='painel';render()});
 // invasor reativa → vigilância pausa de novo
 await p.click('[data-gt="reativar"]');await p.waitForTimeout(200);
 if(await p.evaluate(i=>conta(i).camps.filter(c=>c.status!=='Pausada').length,id)!==1)F('simulação de reativação');
 await p.waitForTimeout(4600);
 const rr=await p.evaluate(i=>({ativas:conta(i).camps.filter(c=>c.status!=='Pausada').length,re:GT.inc[i].reincidencias.length}),id);
 if(rr.ativas!==0||rr.re!==1)F('reincidência não pausou de novo',rr);else ok('reativação pausada de novo (reincidência)');
 // saída: gestor não libera
 await p.selectOption('#user','alan');await p.waitForTimeout(150);
 await p.evaluate(i=>{S.open=i;render()},id);await p.waitForTimeout(150);
 await p.click('[data-gt="liberar"]',{force:true});await p.waitForTimeout(150);
 if(await p.evaluate(()=>!document.querySelector('#modal').hidden))F('gestor abriu liberação');else ok('liberação só Dono/Admin');
 await p.selectOption('#user','rayane');await p.waitForTimeout(150);await p.evaluate(i=>{S.open=i;render()},id);
 await p.click('[data-gt="liberar"]');await p.waitForTimeout(200);
 // sem checklist → erro
 await p.fill('#gt-sim','SIM');await p.click('#modal [data-m="1"]');await p.waitForTimeout(100);
 if(!/Confirme todos os itens/.test(await p.textContent('#gt-err')))F('checklist não exigido');else ok('checklist obrigatório');
 await p.$$eval('input[name="gt-ck"]',l=>l.forEach(x=>x.checked=true));
 await p.fill('#gt-sim','sim');await p.click('#modal [data-m="1"]');await p.waitForTimeout(100);
 if(!/SIM/.test(await p.textContent('#gt-err')))F('aceitou "sim" minúsculo');else ok('exige SIM');
 // reativar só a 1ª campanha original, restaurando orçamento
 const sel=antes.ativas[0];
 await p.$$eval('input[name="gt-sel"]',(l,s)=>l.forEach(x=>x.checked=+x.value===s),sel);
 await p.fill('#gt-sim','SIM');await p.click('#modal [data-m="1"]');await p.waitForTimeout(300);
 const fim=await p.evaluate(([i,s])=>{const a=conta(i);const c=a.camps.find(x=>x.id===s);return{quar:gtQ(a),ativas:a.camps.filter(x=>x.status!=='Pausada').map(x=>x.id),orc:c.cbo?c.orc:c.sets.filter(x=>x.status!=='Pausada').reduce((t,x)=>t+x.orc,0),enc:GT.inc[i].estado}},[id,sel]);
 if(fim.quar||fim.enc!=='encerrado')F('não saiu da quarentena',fim);else ok('saiu da quarentena');
 if(fim.ativas.length!==1||fim.ativas[0]!==sel)F('reativou além do escolhido',fim.ativas);else ok('reativou só a campanha escolhida');
 if(Math.abs(fim.orc-antes.orc[sel])>.01)F('orçamento não voltou ao de antes',fim.orc,antes.orc[sel]);else ok('orçamento anterior ao incidente restaurado',fim.orc);
 await p.waitForTimeout(4300);
 if(await p.evaluate(i=>conta(i).camps.filter(c=>c.status!=='Pausada').length,id)!==1)F('Guardião pausou depois de liberar');else ok('após liberar, vigilância não pausa de novo');
 if(errs.length)F('erros',errs);
 await ctx.close()}
 await b.close();console.log('falhas',fails);process.exit(fails?1:0)})();
