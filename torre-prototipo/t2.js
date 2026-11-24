const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();let f=0;const F=(...m)=>{f++;console.log('FALHA',...m)};
for(const vp of [{w:1366,h:860},{w:390,h:844}]){const p=await b.newPage({viewport:{width:vp.w,height:vp.h}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.route(/fonts\./,r=>r.abort());await p.goto('file://'+path.join(__dirname,'torre-controle.html'));await p.waitForTimeout(500);
 const id=await p.evaluate(()=>CONTAS.find(a=>a.form&&a.sem!=='par'&&a.camps.some(c=>c.obj==='Formulário')).id);
 await p.evaluate(id=>location.hash='c-'+id,id);await p.waitForTimeout(400);const root=vp.w<900?'#full ':'.acc-in ';
 // criativo campeão
 await p.click(root+'.champ');await p.waitForTimeout(1500);
 const med=await p.evaluate(()=>{const v=document.querySelector('.mbox video');if(v)return{video:true,t:v.currentTime,paused:v.paused,src:v.currentSrc.slice(0,15)};return{img:!!document.querySelector('.mbox .ig-m img')}});console.log(vp.w,'criativo campeão',JSON.stringify(med));
 if(med.video&&!(med.t>0))F('vídeo não tocou',med);
 await p.screenshot({path:`c-${vp.w}.png`});await p.keyboard.press('Escape');
 // abrir vídeo explicitamente
 await p.click(root+'[data-tab="campanhas"]');await p.waitForTimeout(150);
 const vid=await p.evaluate(()=>{const a=CONTAS.find(x=>location.hash==='#c-'+x.id);for(const c of a.camps)for(const s of c.sets)for(const d of s.ads)if(d.fmt==='video')return{c:c.id,s:s.id,d:d.id};});
 await p.evaluate(v=>{S.exp.add(v.c);S.exp.add(v.s);render()},vid);await p.waitForTimeout(150);
 await p.click(`${root}[data-act="criativo"][data-n="${vid.d}"] >> nth=0`);await p.waitForTimeout(1500);
 const vv=await p.evaluate(()=>{const v=document.querySelector('.mbox video');return v?{t:v.currentTime,src:v.currentSrc.slice(5,15),err:v.error&&v.error.code}:null});console.log(vp.w,'vídeo',JSON.stringify(vv));if(!vv||!(vv.t>0))F('vídeo não reproduziu',vv);
 await p.screenshot({path:`v-${vp.w}.png`});await p.keyboard.press('Escape');
 // leads
 await p.click(root+'[data-tab="leads"]');await p.waitForTimeout(200);
 const n=await p.evaluate(r=>document.querySelectorAll(r+'.lt tbody tr').length,root);if(!n)F('sem leads');
 await p.selectOption(root+'.lead-st >> nth=0','qualificado');await p.waitForTimeout(150);
 const au=await p.evaluate(()=>AUD[AUD.length-1].oque);if(!/Qualificado/.test(au))F('auditoria lead',au);
 await p.click(root+'[data-lst="qualificado"]');await p.waitForTimeout(150);const q=await p.evaluate(r=>[...document.querySelectorAll(r+'.lead-st')].every(s=>s.value==='qualificado'),root);if(!q)F('filtro lead');
 console.log(vp.w,'leads linhas',n);await p.screenshot({path:`l-${vp.w}.png`});
 const ow=await p.evaluate(()=>document.documentElement.scrollWidth);if(ow>vp.w+1)F('overflow',ow);
 if(errs.length)F('erros',errs);await p.close()}
await b.close();console.log('falhas',f)})();
