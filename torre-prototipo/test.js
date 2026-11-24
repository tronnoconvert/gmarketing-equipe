const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();let fails=0;const F=(...m)=>{fails++;console.log('FALHA',...m)};const ok=(...m)=>console.log('ok',...m);
 for(const vp of [{n:'1366',w:1366,h:820},{n:'1920',w:1920,h:1080},{n:'390',w:390,h:844}]){
  const ctx=await b.newContext({viewport:{width:vp.w,height:vp.h}});await ctx.grantPermissions(['clipboard-read','clipboard-write']);const p=await ctx.newPage();
  await p.route(/fonts\./,r=>r.abort());const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.join(__dirname,'torre-controle.html'));await p.waitForTimeout(500);
  const mob=vp.w<900;const ow=async l=>{const w=await p.evaluate(()=>document.documentElement.scrollWidth);if(w>vp.w+1)F(vp.n,l,'overflow',w)};
  await ow('inicio');
  // perfis
  for(const u of ['alan','vitor','vinicius','carol','franciele','gabriel','rayane']){await p.selectOption('#user',u);await p.waitForTimeout(150);
   const info=await p.evaluate(()=>({view:document.querySelector('.tabs .tab[aria-selected="true"]')?.textContent,n:document.querySelectorAll(innerWidth>900?'tr.r':'.cd').length}));
   if(['vitor','vinicius'].includes(u)&&!/Meus clientes/.test(info.view))F(vp.n,u,'não abriu em Meus clientes',info.view);await ow(u)}
  ok(vp.n,'perfis');
  await p.selectOption('#user','alan');await p.waitForTimeout(150);
  // sanfona: abrir, Esc, abrir, clicar de novo, botão fechar
  const sel=mob?'.cd':'tr.r';
  await p.click(`${sel} >> nth=0`);await p.waitForTimeout(250);
  let open=await p.evaluate(m=>m?!document.querySelector('#full').hidden:!!document.querySelector('tr.acc'),mob);if(!open)F(vp.n,'sanfona não abriu');
  const hash=await p.evaluate(()=>location.hash);if(!/^#c-\d+$/.test(hash))F('hash',hash);
  await p.keyboard.press('Escape');await p.waitForTimeout(150);open=await p.evaluate(m=>m?!document.querySelector('#full').hidden:!!document.querySelector('tr.acc'),mob);if(open)F(vp.n,'Esc não fechou');
  if(!mob){await p.click('tr.r >> nth=1');await p.waitForTimeout(200);await p.click('tr.r.open');await p.waitForTimeout(200);if(await p.$('tr.acc'))F('clique de novo não fechou');
   // só uma aberta
   await p.click('tr.r >> nth=0');await p.waitForTimeout(150);await p.click('tr.r >> nth=3');await p.waitForTimeout(150);const n=await p.evaluate(()=>document.querySelectorAll('tr.acc').length);if(n!==1)F('mais de uma aberta',n);
   // rolagem horizontal com coluna fixa
   const pos=await p.evaluate(()=>{const tw=document.querySelector('.tw');tw.scrollLeft=900;const fx=document.querySelector('tbody tr.r td.fix').getBoundingClientRect().left,twl=tw.getBoundingClientRect().left,acc=document.querySelector('.acc-in').getBoundingClientRect().left;return{fx,twl,acc,more:document.querySelector('.board').classList.contains('more'),sl:tw.scrollLeft}});
   if(Math.abs(pos.fx-pos.twl)>2)F(vp.n,'coluna não fixa',pos);if(Math.abs(pos.acc-pos.twl)>2)F(vp.n,'sanfona rolou junto',pos);ok(vp.n,'coluna fixa e sanfona fixa',JSON.stringify(pos));
   const hdr=await p.evaluate(()=>{const tw=document.querySelector('.tw');tw.scrollTop=400;const th=document.querySelector('thead tr.h th').getBoundingClientRect().top,t=tw.getBoundingClientRect().top;return th-t});if(Math.abs(hdr-28)>3)F('cabeçalho não fixo',hdr);
   await p.click('[data-act="fechar"]');await p.waitForTimeout(150);if(await p.$('tr.acc'))F('botão fechar');
  }
  // ação com SIM (Alan, conta 1)
  await p.evaluate(()=>location.hash='c-1');await p.waitForTimeout(300);
  const root=mob?'#full ':'.acc-in ';
  await p.click(root+'[data-tab="campanhas"]');await p.waitForTimeout(150);
  await p.click(root+'[data-act="pausar"] >> nth=0');await p.waitForTimeout(150);
  const dis0=await p.evaluate(()=>document.querySelector('[data-m="1"]').disabled);if(!dis0)F('confirmar liberado sem SIM');
  await p.fill('#sim','si');const d1=await p.evaluate(()=>document.querySelector('[data-m="1"]').disabled);if(!d1)F('liberou com "si"');
  await p.fill('#sim','sim');const d2=await p.evaluate(()=>document.querySelector('[data-m="1"]').disabled);if(d2)F('não liberou com SIM');
  const ba=await p.evaluate(()=>document.querySelector('.ba-g').innerText.replace(/\n/g,' '));
  await p.click('[data-m="1"]');await p.waitForTimeout(200);const env=await p.evaluate(()=>document.querySelector('#toasts').innerText);if(!/Enviando ao Meta/.test(env))F('sem Enviando',env);
  await p.waitForTimeout(1000);const ap=await p.evaluate(()=>document.querySelector('#toasts').innerText);if(!/Aplicado às/.test(ap))F('sem Aplicado',ap);
  const st=await p.evaluate(r=>document.querySelector(r+'.nd .pill').innerText,root);if(!/Pausada/.test(st))F('não pausou',st);ok(vp.n,'SIM:',ba,'→',st);
  // desfazer também pede SIM
  await p.click('#toasts .toast:last-child button');await p.waitForTimeout(150);const askU=await p.$('#sim');if(!askU)F('desfazer sem confirmação');else{await p.fill('#sim','SIM');await p.click('[data-m="1"]');await p.waitForTimeout(1100);const st2=await p.evaluate(r=>document.querySelector(r+'.nd .pill').innerText,root);if(!/Ativa/.test(st2))F('desfazer falhou',st2)}
  // histórico
  await p.click(root+'[data-tab="historico"]');await p.waitForTimeout(150);const h=await p.evaluate(r=>document.querySelector(r+'.au li').innerText,root);if(!/Allan/.test(h)||!/Desfez/.test(h))F('auditoria',h);
  // limite de 4 mudanças/hora (conta 1, primeiro alvo de orçamento já tem 3)
  await p.click(root+'[data-tab="campanhas"]');await p.waitForTimeout(150);
  const bud=await p.$(root+'[data-act="orcamento"]');
  if(bud){await bud.click();await p.waitForTimeout(150);const txt=await p.evaluate(()=>document.querySelector('.mbox')?.innerText||'');
   if(/3\/4/.test(txt)){await p.click('[data-q="20"]');await p.fill('#o-v',await p.evaluate(()=>document.querySelector('#o-v').value.replace(/\d+,/,m=>String(Math.round(parseInt(m)*1.5))+',')));await p.waitForTimeout(100);
    const w=await p.evaluate(()=>document.querySelector('#o-w').innerText);if(!/20%/.test(w))F('sem aviso +20%',w);
    await p.click('[data-m="1"]');await p.waitForTimeout(150);const avi=await p.evaluate(()=>document.querySelector('.mbox').innerText);if(!/20%/.test(avi))F('aviso não foi para a confirmação');
    await p.fill('#sim','SIM');await p.click('[data-m="1"]');await p.waitForTimeout(1100);
    const b2=await p.$(root+'[data-act="orcamento"]');await b2.click();await p.waitForTimeout(150);const blk=await p.evaluate(()=>document.querySelector('#toasts').innerText);if(!/no máximo 4 mudanças/.test(blk))F('limite não bloqueou',blk);else ok(vp.n,'limite 4/h bloqueou');
   }else F('modal orçamento não mostrou 3/4',txt.slice(0,120))}else F('sem botão orçamento');
  // recomendação IA na conta crítica de Vinícius com Vitor => bloqueio
  await p.keyboard.press('Escape');await p.selectOption('#user','vitor');await p.waitForTimeout(150);
  const vin=await p.evaluate(()=>CONTAS.find(a=>a.gest==='vinicius'&&a.recs.length).id);await p.evaluate(id=>location.hash='c-'+id,vin);await p.waitForTimeout(300);
  const disn=await p.evaluate(r=>document.querySelectorAll(r+'.btn.dis').length,root);if(!disn)F('Vitor sem bloqueio na conta do Vinícius');
  await p.click(root+'.btn.dis >> nth=0',{force:true});await p.waitForTimeout(150);const tb=await p.evaluate(()=>document.querySelector('#toasts').innerText);if(!/Só Vinícius/.test(tb))F('toast permissão',tb.slice(-140));else ok(vp.n,'bloqueio Vitor→Vinícius');
  await p.selectOption('#user','carol');await p.waitForTimeout(150);await p.evaluate(()=>location.hash='c-3');await p.waitForTimeout(300);await p.click(root+'[data-tab="campanhas"]');await p.waitForTimeout(100);
  const cb=await p.evaluate(r=>[document.querySelectorAll(r+'[data-act="pausar"]').length,document.querySelectorAll(r+'[data-act="pausar"].dis').length],root);if(cb[0]!==cb[1])F('Carol executa',cb);else ok(vp.n,'Carol só leitura',cb);
  // IA fazer agora (Alan) conta com rec de orçamento
  await p.selectOption('#user','alan');await p.waitForTimeout(150);const rid=await p.evaluate(()=>CONTAS.find(a=>a.recs.some(r=>r.tipo==='pause')&&a.revisao!=='Revisão com erro').id);await p.evaluate(id=>location.hash='c-'+id,rid);await p.waitForTimeout(300);
  await p.click(root+'[data-act="rec-fazer"] >> nth=0');await p.waitForTimeout(150);await p.fill('#sim','SIM');await p.click('[data-m="1"]');await p.waitForTimeout(1100);
  const via=await p.evaluate(id=>AUD.filter(x=>x.conta===id).pop().via,rid);if(via!=='IA')F('via IA',via);else ok(vp.n,'IA registrada');
  // sininho e alarme
  const al=await p.evaluate(()=>!document.querySelector('#alarm').hidden);if(!al)F('alarme crítico não aparece para Alan');
  await p.keyboard.press('Escape');await p.waitForTimeout(150);await p.click('#bell');await p.waitForTimeout(100);await p.click('.bellp [data-act-al="som"]');await p.waitForTimeout(200);const snd=await p.evaluate(()=>S.sound);if(!snd)F('som não ativou');
  await p.click('#alarm [data-act-al="ciente"]');await p.waitForTimeout(150);const al2=await p.evaluate(()=>document.querySelector('#alarm').hidden);if(!al2)F('ciente não parou');else ok(vp.n,'alarme/ciente');
  await p.selectOption('#user','carol');await p.waitForTimeout(150);const al3=await p.evaluate(()=>document.querySelector('#alarm').hidden);if(!al3)F('Carol recebe alarme');
  // ver todas as colunas e paletas
  
  await p.keyboard.press('Escape');await ow('final');
  if(errs.length)F(vp.n,'ERROS JS',errs.slice(0,4));
  await p.evaluate(()=>{location.hash='quadro'});await p.waitForTimeout(200);await p.selectOption('#user','alan');await p.waitForTimeout(150);
  await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:path.join(__dirname,`t-${vp.n}.png`),fullPage:vp.w<900});
  if(!mob){await p.evaluate(()=>location.hash='c-14');await p.waitForTimeout(300);await p.screenshot({path:path.join(__dirname,`t-${vp.n}-conta.png`)})}else{await p.evaluate(()=>location.hash='c-14');await p.waitForTimeout(300);await p.screenshot({path:path.join(__dirname,`t-${vp.n}-conta.png`)})}
  await ctx.close()}
 await b.close();console.log('falhas:',fails)})();
