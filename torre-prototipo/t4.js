const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();let f=0;const F=(...m)=>{f++;console.log('FALHA',...m)};
for(const file of ['torre-controle.html','torre-controle-escuro.html']){const p=await b.newPage({viewport:{width:1440,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.route(/fonts\./,r=>r.abort());await p.goto('file://'+path.join(__dirname,file));await p.waitForTimeout(500);
 const bg=await p.evaluate(()=>getComputedStyle(document.querySelector('tr.r.par td')).backgroundColor);if(!/rgb\((11, 13, 18|0, 0, 0)\)/.test(bg))F(file,'parada não ficou preta',bg);else console.log(file,'parada preta',bg);
 const qb=await p.evaluate(()=>{const q=document.querySelector('.qi.par');return q?getComputedStyle(q).backgroundColor:'sem item'});console.log(file,'fila parada',qb);
 await p.evaluate(()=>{const a=CONTAS.find(x=>x.sem!=='par'&&x.revisao!=='Revisão com erro'&&x.camps.some(c=>c.status!=='Pausada'&&c.sets.some(s=>s.status!=='Pausada'&&s.ads.filter(d=>d.status!=='Pausada').length>1)));location.hash='c-'+a.id});await p.waitForTimeout(400);
 await p.click('.acc-in [data-tab="campanhas"]');await p.waitForTimeout(150);
 await p.evaluate(()=>{const a=CONTAS.find(x=>location.hash==='#c-'+x.id);a.camps.forEach(c=>{S.exp.add(c.id);c.sets.forEach(s=>S.exp.add(s.id))});render()});await p.waitForTimeout(200);
 const n=await p.evaluate(()=>document.querySelectorAll('.acc-in [data-act="orcad"]').length);if(!n)F('sem botão orçamento no anúncio');
 await p.click('.acc-in [data-act="orcad"] >> nth=0');await p.waitForTimeout(200);const txt=await p.evaluate(()=>document.querySelector('.mbox').innerText);if(!/o orçamento não fica no anúncio/.test(txt))F('nota ausente',txt.slice(0,100));else console.log(file,'nota:',txt.split('\n').find(l=>/não fica no anúncio/.test(l)).slice(0,170));
 await p.screenshot({path:path.join(__dirname,'ad-'+file.replace('.html','.png'))});
 await p.click('[data-q="10"]');await p.click('.mbox [data-m="1"]');await p.waitForTimeout(150);await p.fill('#sim','SIM');await p.click('.mbox [data-m="1"]');await p.waitForTimeout(1100);
 const t=await p.evaluate(()=>document.querySelector('#toasts').innerText);if(!/Aplicado às/.test(t))F('não aplicou',t.slice(-100));
 if(errs.length)F(errs);await p.close()}
await b.close();console.log('falhas',f)})();
