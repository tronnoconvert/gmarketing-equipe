// t5: selo único (sem barra de comparação), modo embutido (?embed=1, tema, abas) e troca de criativo (pedir / avisar cliente)
const {chromium}=require('playwright');const path=require('path'),fs=require('fs'),os=require('os');
(async()=>{const b=await chromium.launch();let fails=0;const F=(...m)=>{fails++;console.log('FALHA',...m)};const ok=(...m)=>console.log('ok',...m);
 const ARQ='file://'+path.join(__dirname,'torre-controle.html');
 for(const vp of [{n:'1366',w:1366,h:820},{n:'390',w:390,h:844}]){const mob=vp.w<900;
  const ctx=await b.newContext({viewport:{width:vp.w,height:vp.h}});await ctx.grantPermissions(['clipboard-read','clipboard-write']);const p=await ctx.newPage();
  await p.route(/fonts\./,r=>r.abort());const errs=[];p.on('pageerror',e=>errs.push(e.message));
  // 1) selo único
  await p.goto(ARQ);await p.waitForTimeout(400);
  const selo=await p.evaluate(()=>({sw:!!document.querySelector('.selo-sw'),attr:document.documentElement.hasAttribute('data-selo'),txt:/A · Marcador|B · Etiqueta/.test(document.body.innerText),bg:getComputedStyle(document.querySelector('.pill')).backgroundColor,emb:document.documentElement.dataset.embed||''}));
  if(selo.sw||selo.attr||selo.txt)F(vp.n,'barra de selos ainda existe',selo);else ok(vp.n,'sem barra de selos');
  if(!/rgba\(0, 0, 0, 0\)|transparent/.test(selo.bg))F(vp.n,'selo não é Marcador (tem fundo)',selo.bg);
  if(selo.emb)F('standalone virou embutido');
  if(!await p.isVisible('#side')&&!mob)F(vp.n,'menu lateral sumiu no standalone');
  // 2) pedir criativo (standalone)
  const id=await p.evaluate(()=>CONTAS.find(a=>a.acao==='Trocar criativo'&&prioridade(a)!=null&&escopo().includes(a)).id);
  const btn=`.qi [data-act="crv-pedir"][data-a="${id}"]`;
  if(!await p.$(btn))F(vp.n,'fila sem Pedir criativo');else{
   await p.click(btn);await p.waitForTimeout(150);
   const m=await p.evaluate(()=>({brief:document.querySelector('#cr-brief').value,opts:[...document.querySelectorAll('#cr-para option')].map(o=>o.textContent),prazo:document.querySelector('#cr-prazo').value}));
   if(!/Anúncio cansado/.test(m.brief)||!/frequência/.test(m.brief)||!/Custo|custo por conversa/.test(m.brief))F('briefing incompleto',m.brief);
   if(!m.opts.some(o=>/Carol/.test(o))||!/Ana/.test(m.opts[0]))F('lista de pessoas',m.opts);
   if(m.prazo!=='2026-11-24')F('prazo padrão não é amanhã',m.prazo);
   await p.fill('#cr-brief','curto');await p.click('[data-m="1"]');await p.waitForTimeout(100);
   if(!/pelo menos 20/.test(await p.textContent('#e-brief')))F('validação do briefing');
   await p.fill('#cr-prazo','2026-11-01');await p.fill('#cr-brief','Novo vídeo com outro gancho, mesma oferta e botão.');await p.click('[data-m="1"]');await p.waitForTimeout(100);
   if(!/antes de hoje/.test(await p.textContent('#e-prazo')))F('validação do prazo');
   await p.fill('#cr-prazo','2026-11-26');await p.selectOption('#cr-para','carol');await p.click('[data-m="1"]');await p.waitForTimeout(250);
   const st=await p.evaluate(i=>document.querySelector(`.qi [data-act="crv-pedir"][data-a="${i}"]`).closest('.qi').innerText,id);
   if(!/Criativo pedido a Carol · prazo 26\/11/.test(st))F(vp.n,'status do pedido na fila',st.slice(0,200));else ok(vp.n,'pedido na fila');
   const t=await p.textContent('#toasts');if(!/No Agência OS isso cria a tarefa/.test(t))F('toast standalone',t);
   const au=await p.evaluate(i=>AUD.filter(x=>x.conta===i).pop().oque,id);if(!/Pediu criativo novo a @Carol/.test(au))F('auditoria do pedido',au);
   // pedir de novo mostra o pedido existente
   await p.click(btn);await p.waitForTimeout(120);if(!/Criativo já pedido/.test(await p.textContent('.mbox')))F('pediu duas vezes sem aviso');await p.keyboard.press('Escape');
   // avisar cliente
   await p.click(`.qi [data-act="crv-avisar"][data-a="${id}"]`);await p.waitForTimeout(120);
   const msg=await p.inputValue('#av-msg');if(!/Oi, /.test(msg)||!/material novo/.test(msg))F('mensagem ao cliente',msg);
   await p.click('[data-m="1"]');await p.waitForTimeout(250);
   const st2=await p.evaluate(i=>document.querySelector(`.qi [data-act="crv-avisar"][data-a="${i}"]`).closest('.qi').innerText,id);if(!/Cliente avisado hoje/.test(st2))F(vp.n,'status cliente avisado',st2.slice(0,200));else ok(vp.n,'cliente avisado');
   const clip=await p.evaluate(()=>navigator.clipboard.readText().catch(()=>''));if(clip&&!/material novo/.test(clip))F('não copiou',clip.slice(0,60));
   // desfazer o aviso
   await p.click('#toasts .toast:last-child button');await p.waitForTimeout(150);
   const st3=await p.evaluate(i=>document.querySelector(`.qi [data-act="crv-avisar"][data-a="${i}"]`).closest('.qi').innerText,id);if(/Cliente avisado hoje/.test(st3))F('desfazer aviso');
   // card da IA dentro da conta
   await p.evaluate(i=>location.hash='c-'+i,id);await p.waitForTimeout(300);const root=mob?'#full ':'.acc-in ';
   if(!await p.$(root+'.crv-rec [data-act="crv-pedir"]'))F(vp.n,'card da IA sem Pedir criativo');
   await p.click(root+'[data-tab="campanhas"]');await p.waitForTimeout(120);
  }
  // 3) modo embutido via ?embed=1&tema=escuro
  await p.goto(ARQ+'?embed=1&tema=escuro');await p.waitForTimeout(400);
  const e=await p.evaluate(()=>({emb:document.documentElement.dataset.embed,tema:document.documentElement.dataset.tema,side:getComputedStyle(document.querySelector('.side')).display,bell:getComputedStyle(document.querySelector('#bell-w')).display,tema2:getComputedStyle(document.querySelector('.tema')).display,tabs:[...document.querySelectorAll('#etabs .etab')].map(x=>x.textContent.replace(/\d+/g,'').trim()),w:document.documentElement.scrollWidth}));
  if(e.emb!=='1'||e.tema!=='escuro')F('embed/tema pela URL',e);if(e.side!=='none'||e.bell!=='none'||e.tema2!=='none')F('embutido ainda mostra menu/sino/tema',e);
  for(const n of ['Quadro principal','Precisa de atenção','Contas silenciosas','Cadastrar cliente','Auditoria'])if(!e.tabs.includes(n))F('aba faltando',n,e.tabs);
  if(e.w>vp.w+1)F(vp.n,'overflow embutido',e.w);else ok(vp.n,'embutido',e.tabs.join(' | '));
  await p.click('#etabs [data-view="atencao"]');await p.waitForTimeout(150);if(await p.evaluate(()=>S.view)!=='atencao')F('aba Precisa de atenção');
  await p.click('#etabs [data-act="auditoria"]');await p.waitForTimeout(150);if(!/Auditoria/.test(await p.textContent('.mbox')))F('aba Auditoria');await p.keyboard.press('Escape');
  await p.click('#etabs [data-cad]');await p.waitForTimeout(200);if(!await p.evaluate(()=>S.cad))F('aba Cadastrar');
  // 4) dentro de um iframe: tema por postMessage e ponte do pedido
  const host=path.join(os.tmpdir(),'torre-host-t5.html');
  fs.writeFileSync(host,`<!doctype html><meta charset="utf-8"><body style="margin:0"><iframe id="f" src="${ARQ}?embed=1&tema=claro" style="width:100vw;height:100vh;border:0"></iframe><script>window.MSGS=[];addEventListener('message',e=>{const d=e.data;MSGS.push(d);if(d&&d.tipo==='pronto'){e.source.postMessage({tipo:'equipe',pessoas:[{id:'t-carla',nome:'Carla Dias',papel:'Design',criativo:true},{id:'t-elisa',nome:'Elisa Rocha',papel:'Copy',criativo:true},{id:'t-ana',nome:'Ana Souza',papel:'Tráfego'}]},'*')}if(d&&d.tipo==='pedidoCriativo')e.source.postMessage({tipo:'pedidoCriativoOk',ref:d.ref,tarefaId:'tk-x1',paraNome:'Carla Dias'},'*')});<\/script>`);
  await p.goto('file://'+host);await p.waitForTimeout(900);const fr=p.frame({url:/torre-controle/});
  if(!fr)F('iframe não carregou');else{
   const pr=await p.evaluate(()=>MSGS.map(m=>m.tipo));if(!pr.includes('pronto'))F('iframe não avisou pronto',pr);
   await p.evaluate(()=>document.getElementById('f').contentWindow.postMessage({tipo:'tema',tema:'escuro'},'*'));await p.waitForTimeout(150);
   if(await fr.evaluate(()=>document.documentElement.dataset.tema)!=='escuro')F('tema por postMessage');else ok(vp.n,'tema por postMessage');
   const id2=await fr.evaluate(()=>CONTAS.find(a=>a.acao==='Trocar criativo'&&prioridade(a)!=null).id);
   await fr.click(`.qi [data-act="crv-pedir"][data-a="${id2}"]`);await fr.waitForTimeout(150);
   const op=await fr.evaluate(()=>[...document.querySelectorAll('#cr-para option')].map(o=>o.value));if(op[0]!=='t-carla')F('equipe do Agência OS não chegou',op);
   await fr.click('[data-m="1"]');await fr.waitForTimeout(300);
   const sent=await p.evaluate(()=>MSGS.find(m=>m&&m.tipo==='pedidoCriativo'));
   if(!sent||sent.para!=='t-carla'||!sent.briefing||!sent.cliente||!sent.prazo||!sent.formato)F('mensagem pedidoCriativo',sent);else ok(vp.n,'pedido enviado à janela-mãe',sent.cliente,sent.prazo);
   const tt=await fr.textContent('#toasts');if(!/Tarefa criada na Operação para Carla Dias/.test(tt))F('confirmação da janela-mãe',tt);
   const st=await fr.evaluate(i=>document.querySelector(`.qi [data-act="crv-pedir"][data-a="${i}"]`).closest('.qi').innerText,id2);if(!/Criativo pedido a Carla · prazo 24\/11 · tarefa criada/.test(st))F('status com tarefa',st.slice(0,200));
   await fr.click(`.qi [data-act="crv-avisar"][data-a="${id2}"]`);await fr.waitForTimeout(120);await fr.click('[data-m="1"]');await fr.waitForTimeout(250);
   if(!await p.evaluate(()=>MSGS.some(m=>m&&m.tipo==='clienteAvisado'&&m.mensagem)))F('mensagem clienteAvisado');
  }
  if(errs.length)F(vp.n,'ERROS JS',errs.slice(0,4));
  await ctx.close()}
 await b.close();console.log('falhas',fails)})();
