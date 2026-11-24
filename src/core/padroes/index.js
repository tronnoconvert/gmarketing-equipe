// padroes/index.js — Central de padrões e regras: catálogo de TUDO que a plataforma usa para decidir (limites, faixas,
// pesos, fórmulas) + valores atuais editáveis. Os módulos leem os valores com padrao(id) em vez de números fixos no código.
//
// Formato de cada entrada (catálogo):
// {
//   id: 'clientes.health.peso.resultado',    // único, com prefixo da seção
//   secao: 'clientes' | 'equipe' | 'operacao' | 'financeiro' | 'webinars' | 'alertas' | 'comercial' | 'acesso'
//        | 'torre' | 'orcamento' | 'recomendacoes' | 'invasao',
//   grupo: 'Health score do cliente',        // subtítulo dentro da seção
//   nome: 'Peso do resultado vs meta',
//   significa: 'O que este padrão representa, em linguagem simples.',
//   calculo: 'Como a plataforma calcula / usa (fórmula legível).',
//   valor: 35,                                // valor padrão (de fábrica)
//   unidade: '%' | 'R$' | 'dias' | 'h' | 'min' | 'x' | 'pts' | 'n' | 'texto' | 'bool',
//   min, max, passo,                          // validação quando editavel
//   editavel: true | false,                   // false = só explicação (regra fixa ou depende de outra tela)
//   ondeUsa: ['Clientes › Health score', 'Minha mesa'],
//   link: '#/clientes',                       // opcional: onde ver o efeito
//   editor: 'motor' | 'guardiao'              // opcional: regras compostas com editor próprio (renderizado pela central)
//   grupoSoma: 'clientes.health.peso'         // opcional: entradas que precisam somar 100 (validação conjunta)
//   menorQue: 'id' | maiorQue: 'id'           // opcional: ordem obrigatória entre dois padrões (ex.: atenção < crítico)
//   opcoes: [[valor, 'rótulo'], …]            // opcional: valor escolhido numa lista (ex.: dia da semana)
//   fonte: { col, id, param }                 // opcional: o valor mora em outro registro (ex.: alertRules.params) — lido e gravado lá
// }
import { db } from '../store.js';
import gestao from './gestao.js';
import trafego from './trafego.js';

const CHAVE = 'padroes';           // settings: { [id]: valor }
const HIST = 'padroesHistorico';   // settings: [{ id, de, para, quem, quando }]

export const CATALOGO = [...gestao, ...trafego];
const porId = new Map(CATALOGO.map(p => [p.id, p]));
const tem = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/** valor guardado em outro registro (fonte) ou undefined */
function lerFonte(p) {
  const f = p && p.fonte; if (!f) return undefined;
  const r = db.get(f.col, f.id); const v = r && r.params ? r.params[f.param] : undefined;
  return v == null ? undefined : v;
}
function gravarFonte(p, v) {
  const f = p.fonte; const r = db.get(f.col, f.id); if (!r) return false;
  db.update(f.col, f.id, { params: { ...(r.params || {}), [f.param]: v } });
  return true;
}

/** valor atual do padrão (override salvo ou valor de fábrica). fallback usado se o id não existir no catálogo. */
export function padrao(id, fallback) {
  const p = porId.get(id);
  if (p && p.fonte) { const v = lerFonte(p); return v === undefined ? p.valor : v; }
  const o = db.config(CHAVE, {}) || {};
  if (tem(o, id)) return o[id];
  return p ? p.valor : fallback;
}
/** todos os valores atuais { id: valor } */
export function valores() { const r = {}; for (const p of CATALOGO) r[p.id] = padrao(p.id); return r; }
export function definicao(id) { return porId.get(id) || null; }
export function alterado(id) {
  const p = porId.get(id); if (!p) return false;
  if (p.fonte) { const v = lerFonte(p); return v !== undefined && v !== p.valor; }
  const o = db.config(CHAVE, {}) || {}; return tem(o, id) && o[id] !== p.valor;
}
/** grava um ou vários valores ({id: valor}); registra histórico e atividade */
export function definir(mudancas, quem) {
  const o = { ...(db.config(CHAVE, {}) || {}) }; const h = (db.config(HIST, []) || []).slice(-499);
  const quando = new Date().toISOString(); const mudou = [];
  db.batch(() => {
    for (const [id, v] of Object.entries(mudancas)) {
      const p = porId.get(id);
      const de = padrao(id);
      if (de === v) continue;
      if (p && p.fonte) { if (!gravarFonte(p, v)) continue; } else if (p && v === p.valor) delete o[id]; else o[id] = v;
      h.push({ id, de, para: v, quem: quem || null, quando }); mudou.push(id);
    }
    if (!mudou.length) return;
    db.setConfig(CHAVE, o, { log: `alterou padrões: ${mudou.map(id => (porId.get(id) || {}).nome || id).join(', ')}` });
    db.setConfig(HIST, h);
  });
  return mudou;
}
export function restaurar(ids, quem) { const m = {}; for (const id of ids) { const p = porId.get(id); if (p) m[id] = p.valor; } definir(m, quem); }
export function historico(id) { const h = db.config(HIST, []) || []; return id ? h.filter(x => x.id === id) : h; }

export const padroes = { CATALOGO, padrao, valores, definicao, alterado, definir, restaurar, historico };
export default padroes;
