/* ===== modo embutido (?embed=1 ou dentro de iframe): o Agência OS cuida de menu, tema, notificações e alertas.
   Aqui sobra só uma faixa de abas no topo com a navegação interna do Painel de Voo. ===== */
const ETAB_IC={principal:'list',meus:'users',atencao:'alert',silenciosas:'clock'};
const ETAB_VIEWS=['principal','meus','atencao','silenciosas'];
const ETAB_NOME={atencao:'Precisa de atenção'};
function etabsRender(){const el=$('#etabs');if(!el||!window.EMBED)return;
 const vs=viewsFor().filter(v=>ETAB_VIEWS.includes(v[0])).map(v=>`<button type="button" class="etab" data-view="${v[0]}" ${!S.cad&&S.view===v[0]?'aria-current="page"':''}>${ic(ETAB_IC[v[0]]||'layers')}${ETAB_NOME[v[0]]||v[1]}<span class="c">${CONTAS.filter(v[2]).length}</span></button>`).join('');
 const pc=podeCadastrar();
 el.innerHTML=vs+`<span class="etab-sep" aria-hidden="true"></span><button type="button" class="etab${pc?'':' dis'}" data-cad="1" ${S.cad?'aria-current="page"':''} ${pc?'':'data-tip="Cadastrar cliente é liberado para Gabriel, Rayane, Allan, Victor e Vinícius."'}>${ic('plus')}Cadastrar cliente</button><button type="button" class="etab" data-act="auditoria">${ic('shield')}Auditoria</button>`;
 const cur=el.querySelector('[aria-current="page"]');if(cur&&el.scrollWidth>el.clientWidth){const l=cur.offsetLeft-el.offsetLeft;if(l<el.scrollLeft||l+cur.offsetWidth>el.scrollLeft+el.clientWidth)el.scrollLeft=Math.max(0,l-24)}}
if(window.EMBED)addEventListener('load',()=>paraHost({tipo:'pronto',tema:document.documentElement.dataset.tema}));
