/* ===== Padrões e regras (central "Padrões e regras" do Agência OS): limites que a Torre usa para decidir =====
   Valores de fábrica abaixo = catálogo agencia-os/src/core/padroes/trafego.js (ids 'torre.*' e 'orcamento.*').
   Embutida: a janela-mãe envia {tipo:'padroes', valores:{id:valor}} ao carregar e quando o dono/Head muda um padrão.
   Isolada: localStorage 'torre-padroes'. Concatenado ANTES de data.js (o semáforo é calculado na carga). */
const PADROES_FABRICA={
 'torre.semaforo.excelente':.75,'torre.semaforo.bom':1,'torre.semaforo.atencao':1.25,'torre.semaforo.caro':1.5,
 'torre.base3d.minConversas':3,'torre.base.minVerba':20,'torre.contaParada.dias':2,
 'torre.dadosInsuficientes.minDias':3,'torre.dadosInsuficientes.minConversas':10,
 'torre.fila.alertasAgora':2,'torre.fila.atrasadaDias':5,'torre.diasSemOtimizar.alerta':7,'torre.atencao.alertas':2,
 'orcamento.maxMudancasHora':4,'orcamento.aumentoMaxPct':20,'orcamento.minimoDia':6,'orcamento.tetoGastoMin':100};
/* só aceita ids conhecidos com número finito ≥ 0; o resto fica no valor de fábrica */
function padroesLimpos(v){const r={};if(!v||typeof v!=='object')return r;for(const k of Object.keys(PADROES_FABRICA)){const x=v[k];if(typeof x==='number'&&isFinite(x)&&x>=0)r[k]=x}return r}
let PADROES_OV=(()=>{try{return padroesLimpos(JSON.parse(localStorage.getItem('torre-padroes')||'{}'))}catch(e){return{}}})();
const PD=id=>Object.prototype.hasOwnProperty.call(PADROES_OV,id)?PADROES_OV[id]:PADROES_FABRICA[id];
/* régua do semáforo (índice = custo por conversa ÷ meta). Limites fora de ordem → usa os de fábrica */
function regua(){const r=['excelente','bom','atencao','caro'].map(k=>PD('torre.semaforo.'+k));return r.every((x,i)=>!i||x>r[i-1])?r:['excelente','bom','atencao','caro'].map(k=>PADROES_FABRICA['torre.semaforo.'+k])}
function faixaSem(ix){const r=regua();return ix<=r[0]?'exc':ix<=r[1]?'bom':ix<=r[2]?'aten':ix<=r[3]?'caro':'crit'}
/* classificação da conta: 1º parada → 2º sem campanha de mensagem → 3º dados insuficientes → 4º régua (base 3d ou 7d) */
function classificar(a){const s=a.series||[],N=Math.max(1,Math.round(PD('torre.contaParada.dias'))),ult=s.slice(-N);
 const ix0=a.cpc3&&a.meta?a.cpc3/a.meta:null,dias7=s.slice(-7).filter(x=>x.sp>0).length;
 if(ult.length>=N&&ult.every(x=>!x.sp)&&s.some(x=>x.sp>0)){if(!a.parDesde){let i=s.length;while(i>0&&!s[i-1].sp)i--;a.parDesde=s[i]?s[i].d:null}return{sem:'par',indice:ix0,base:null,dias7}}
 if(!a.verbaMsg7&&a.verbaTotal7>0)return{sem:'sem',indice:ix0,base:null,dias7};
 if(dias7<PD('torre.dadosInsuficientes.minDias')||(a.conv7||0)<PD('torre.dadosInsuficientes.minConversas'))return{sem:'ins',indice:ix0,base:null,dias7};
 const mv=PD('torre.base.minVerba');let base=null,ix=null;
 if(a.conv3>=PD('torre.base3d.minConversas')&&a.verbaMsg3>=mv){base='3d';ix=(a.verbaMsg3/a.conv3)/a.meta}
 else if(a.verbaMsg7>=mv&&a.conv7>0){base='7d';ix=(a.verbaMsg7/a.conv7)/a.meta}
 if(ix==null)return{sem:'ins',indice:ix0,base:null,dias7};
 return{sem:faixaSem(ix),indice:ix,base,dias7}}
/* recalcula semáforo, diagnóstico, recomendações e fila depois de mudar os padrões */
function reaplicarPadroes(){if(typeof CONTAS==='undefined')return;
 CONTAS.forEach(a=>{if(a.novo){if(a.indice!=null)a.sem=faixaSem(a.indice);return}const k=classificar(a);a.sem=k.sem;a.indice=k.indice;a.base=k.base;if(typeof diag==='function')a.diag=diag(a)});
 if(typeof gerarRecs==='function')gerarRecs();if(typeof render==='function')render()}
addEventListener('message',e=>{const m=e.data;if(!m||m.tipo!=='padroes'||(window.parent!==window&&e.source!==window.parent))return;
 PADROES_OV=padroesLimpos(m.valores);try{localStorage.setItem('torre-padroes',JSON.stringify(PADROES_OV))}catch(_){}
 reaplicarPadroes()});
