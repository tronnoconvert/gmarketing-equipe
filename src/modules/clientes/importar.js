// importar.js — Clientes › "Importar planilha (CSV)": validação, prévia e importação da carteira (coleção `clients`).
// Regra de receita: a coluna MRR só é lida para quem vê receita (ctx.veReceita()); para os demais é ignorada,
// o cliente entra com mrrPendente e quem vê receita é avisado para completar.
import * as K from './calc.js';
import { HOJE, SEMANAS, NSEM } from './data.js';

const CAMPOS = [
  { k: 'nome', l: 'Nome', alias: ['nome', 'cliente', 'nome fantasia', 'fantasia', 'empresa', 'razao social', 'razão social'] },
  { k: 'cnpj', l: 'CNPJ', alias: ['cnpj', 'documento'] },
  { k: 'segmento', l: 'Segmento', alias: ['segmento', 'setor', 'nicho', 'ramo'] },
  { k: 'mrr', l: 'MRR', alias: ['mrr', 'mensalidade', 'valor mensal', 'fee', 'valor'], receita: true },
  { k: 'resp', l: 'Responsável', alias: ['responsavel', 'responsável', 'resp', 'gestor', 'respid', 'e-mail do responsavel', 'email responsavel'] },
];
const modelo = rec => (rec
  ? 'nome;cnpj;segmento;mrr;responsavel\r\nLoja Exemplo Ltda.;11.222.333/0001-81;Varejo;4.500,00;ana@agencia.demo\r\nClínica Modelo;;Saúde;3200;Bruno Lima\r\n'
  : 'nome;cnpj;segmento;responsavel\r\nLoja Exemplo Ltda.;11.222.333/0001-81;Varejo;ana@agencia.demo\r\nClínica Modelo;;Saúde;Bruno Lima\r\n');
const CORES = ['#0B6BE8', '#7C5CFC', '#0E9F6E', '#C2700A', '#D9467A', '#0891B2', '#4F46E5', '#B45309', '#047857', '#475569', '#0F766E'];

function slugCli(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 18) || 'cliente'; }
function numBR(v) {
  if (v === null || v === undefined) return null; let s = String(v).trim().replace(/[R$\s]/g, '');
  if (!s) return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
  const n = Number(s); return Number.isFinite(n) ? n : NaN;
}
/** lê CSV (separador ; ou , detectado pela 1ª linha), com aspas → array de arrays */
export function lerCsv(texto) {
  const t = String(texto || '').replace(/^﻿/, '');
  const prim = t.split(/\r?\n/)[0] || '';
  const sep = (prim.match(/;/g) || []).length >= (prim.match(/,/g) || []).length ? ';' : ',';
  const out = []; let lin = [], cel = '', aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) { if (c === '"') { if (t[i + 1] === '"') { cel += '"'; i++; } else aspas = false; } else cel += c; continue; }
    if (c === '"') aspas = true;
    else if (c === sep) { lin.push(cel); cel = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; lin.push(cel); cel = ''; if (lin.some(x => x.trim() !== '')) out.push(lin); lin = []; }
    else cel += c;
  }
  lin.push(cel); if (lin.some(x => x.trim() !== '')) out.push(lin);
  return out.map(l => l.map(x => x.trim()));
}
function baixar(nome, conteudo) {
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** analisa o CSV e devolve linhas com status de validação */
export function analisar(texto, ctx) {
  const { db, fmt, ui } = ctx;
  const rec = K.veReceita();
  const rows = lerCsv(texto);
  if (!rows.length) return { erro: 'O arquivo está vazio.' };
  const head = rows[0].map(h => fmt.norm(h).trim());
  const idx = {};
  CAMPOS.forEach(c => { const i = head.findIndex(h => c.alias.map(a => fmt.norm(a)).includes(h)); if (i >= 0) idx[c.k] = i; });
  if (idx.nome === undefined) return { erro: `Não encontramos a coluna "nome" no cabeçalho. Use o modelo: ${rec ? 'nome;cnpj;segmento;mrr;responsavel' : 'nome;cnpj;segmento;responsavel'}.` };
  const mrrIgnorado = !rec && idx.mrr !== undefined;
  if (!rec) delete idx.mrr;
  const team = db.list('team', t => t.ativo !== false);
  const existentes = db.list('clients');
  const cnpjs = new Set(existentes.map(c => String(c.cnpj || '').replace(/\D/g, '')).filter(Boolean));
  const nomes = new Set(existentes.map(c => fmt.norm(c.nome || c.fantasia || '')));
  const vistosC = new Set(), vistosN = new Set();
  const linhas = rows.slice(1).slice(0, 500).map((r, i) => {
    const g = k => (idx[k] === undefined ? '' : (r[idx[k]] || '').trim());
    const o = { n: i + 2, nome: g('nome'), cnpj: g('cnpj'), segmento: g('segmento'), mrrTxt: g('mrr'), respTxt: g('resp'), erros: [], avisos: [] };
    if (o.nome.length < 2) o.erros.push('Nome vazio ou muito curto.');
    const dig = o.cnpj.replace(/\D/g, '');
    if (o.cnpj) { if (ui.valida.cnpj(o.cnpj)) o.erros.push('CNPJ inválido.'); else o.cnpj = ui.mascaras.cnpj(dig); }
    if (dig && cnpjs.has(dig)) o.erros.push('CNPJ já cadastrado.');
    else if (dig && vistosC.has(dig)) o.erros.push('CNPJ repetido no arquivo.');
    if (o.nome && nomes.has(fmt.norm(o.nome))) o.erros.push('Cliente com este nome já existe.');
    else if (o.nome && vistosN.has(fmt.norm(o.nome))) o.erros.push('Nome repetido no arquivo.');
    o.mrr = rec && o.mrrTxt ? numBR(o.mrrTxt) : null;
    if (rec) {
      if (Number.isNaN(o.mrr) || (o.mrr !== null && o.mrr < 0)) o.erros.push('MRR inválido (use 4500 ou 4.500,00).');
      else if (o.mrr === null) o.avisos.push('Sem MRR.');
    }
    if (o.respTxt) {
      const q = fmt.norm(o.respTxt);
      const t = team.find(x => x.id === o.respTxt || fmt.norm(x.email) === q || fmt.norm(x.nome) === q || fmt.norm(x.nome).split(' ')[0] === q);
      if (t) { o.respId = t.id; o.respNome = t.nome; } else o.avisos.push(`Responsável "${o.respTxt}" não encontrado; ficará sem responsável.`);
    } else o.avisos.push('Sem responsável.');
    if (!o.segmento) o.avisos.push('Sem segmento.');
    if (dig) vistosC.add(dig); if (o.nome) vistosN.add(fmt.norm(o.nome));
    o.ok = !o.erros.length;
    return o;
  });
  return { linhas, colunas: Object.keys(idx), total: rows.length - 1, cortado: rows.length - 1 > 500, mrrIgnorado, rec };
}

/** abre o modal de importação; devolve a lista de clientes inseridos */
export async function importarClientes(ctx) {
  const { ui, fmt, db, notify } = ctx; const esc = fmt.esc;
  const rec = K.veReceita();
  let analise = null;
  const colunas = rec ? 'nome (obrigatória), cnpj, segmento, mrr, responsavel (nome ou e-mail de alguém da equipe)' : 'nome (obrigatória), cnpj, segmento, responsavel (nome ou e-mail de alguém da equipe)';
  const corpo = `<div class="stack m-clientes-imp">
<ol class="m-clientes-imp-pass"><li><b>Escolha o arquivo</b> ou cole o conteúdo da planilha (CSV com ; ou ,).</li><li><b>Confira a prévia</b>: linhas com erro não são importadas.</li><li><b>Importe</b>. Dá para desfazer logo depois.</li></ol>
<div class="row m-clientes-imp-src"><label class="btn sm m-clientes-imp-file">${ui.ic('upload')}<span>Escolher arquivo .csv</span><input type="file" accept=".csv,text/csv" data-imp-file hidden></label>${ui.btn({ rotulo: 'Baixar modelo', icone: 'download', sm: true, tipo: 'ghost', attrs: { 'data-imp-modelo': '' } })}<span class="mut sm" data-imp-fn></span></div>
<div class="fld"><label for="m-clientes-imp-txt">Conteúdo do CSV</label><textarea id="m-clientes-imp-txt" rows="5" data-imp-txt placeholder="${esc(modelo(rec).split('\r\n').slice(0, 2).join('\n'))}"></textarea>
<p class="fld-d">Colunas aceitas: ${colunas}.${rec ? '' : ' O valor do contrato (MRR) é preenchido depois por quem cuida do financeiro.'}</p></div>
<div data-imp-prev></div></div>`;
  const desenhar = el => {
    const box = el.querySelector('[data-imp-prev]'); const ok = el.querySelector('[data-ok]');
    const txt = el.querySelector('[data-imp-txt]').value;
    if (!txt.trim()) { analise = null; box.innerHTML = ''; ok.disabled = true; ok.textContent = 'Importar'; return; }
    analise = analisar(txt, ctx);
    if (analise.erro) { box.innerHTML = ui.aviso({ tipo: 'err', titulo: 'Não foi possível ler o arquivo.', texto: analise.erro }); ok.disabled = true; return; }
    const v = analise.linhas.filter(l => l.ok).length, e = analise.linhas.length - v;
    ok.disabled = !v; ok.textContent = v ? `Importar ${v} cliente${v > 1 ? 's' : ''}` : 'Nada para importar';
    box.innerHTML = `${analise.mrrIgnorado ? ui.aviso({ tipo: 'info', texto: 'A coluna MRR foi ignorada: valores de contrato são preenchidos por quem cuida do financeiro, que será avisado.' }) : ''}<div class="m-clientes-imp-res row">${ui.led('ok', `${v} prontas`)}${e ? ui.led('err', `${e} com erro`) : ''}<span class="mut sm">${analise.total} linhas lidas${analise.cortado ? ' · só as 500 primeiras' : ''}</span></div>
<div class="tbl-w m-clientes-imp-pv" data-mobile="scroll"><table class="tbl densa"><thead><tr><th>Linha</th><th>Status</th><th>Nome</th><th>CNPJ</th><th>Segmento</th>${rec ? '<th class="n">MRR</th>' : ''}<th>Responsável</th></tr></thead><tbody>
${analise.linhas.map(l => `<tr class="${l.ok ? '' : 'm-clientes-imp-err'}"><td class="num mut">${l.n}</td><td>${l.ok ? ui.led(l.avisos.length ? 'warn' : 'ok', l.avisos.length ? 'Com avisos' : 'Ok') : ui.led('err', 'Erro')}${[...l.erros, ...l.avisos].length ? `<span class="sub">${esc([...l.erros, ...l.avisos].join(' '))}</span>` : ''}</td><td>${esc(l.nome) || '<span class="mut">—</span>'}</td><td class="num">${esc(l.cnpj)}</td><td>${esc(l.segmento)}</td>${rec ? `<td class="n num">${l.mrr !== null && !Number.isNaN(l.mrr) ? fmt.brl(l.mrr) : '—'}</td>` : ''}<td>${esc(l.respNome || l.respTxt || '')}</td></tr>`).join('')}
</tbody></table></div>`;
  };
  let inseridos = [];
  const ok = await ui.modal({
    titulo: 'Importar clientes (CSV)', sub: 'Planilha → carteira de clientes', largura: 'xl', confirmar: 'Importar', corpo,
    onAbrir: el => {
      el.querySelector('[data-ok]').disabled = true;
      const ta = el.querySelector('[data-imp-txt]'); let tm;
      ta.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => desenhar(el), 250); });
      el.querySelector('[data-imp-modelo]').addEventListener('click', () => baixar('modelo-clientes.csv', '﻿' + modelo(rec)));
      el.querySelector('[data-imp-file]').addEventListener('change', e => {
        const f = e.target.files && e.target.files[0]; if (!f) return;
        if (f.size > 2 * 1024 * 1024) { ui.toast('Arquivo maior que 2 MB. Divida em partes.', { tipo: 'err' }); return; }
        const rd = new FileReader();
        rd.onload = () => { ta.value = String(rd.result || ''); el.querySelector('[data-imp-fn]').textContent = f.name; desenhar(el); };
        rd.onerror = () => ui.toast('Não foi possível ler o arquivo. Tente salvar como CSV (UTF-8).', { tipo: 'err' });
        rd.readAsText(f, 'utf-8');
      });
    },
    onConfirmar: () => {
      if (!analise || analise.erro) return 'Cole ou escolha um CSV primeiro.';
      const v = analise.linhas.filter(l => l.ok);
      if (!v.length) return 'Nenhuma linha válida para importar. Corrija os erros na planilha.';
      const renova = K.addDias(HOJE, 365);
      db.batch(() => {
        inseridos = v.map((l, i) => {
          let id = `c-${slugCli(l.nome)}`; let n = 2; while (db.get('clients', id)) id = `c-${slugCli(l.nome)}${n++}`;
          // health neutro até haver dados reais; mesmos campos do cadastro em etapas
          const comps = { resultado: 68, prazo: 90, engajamento: 70, pagamento: 90 };
          const cli = db.insert('clients', {
            id, nome: l.nome, razaoSocial: l.nome, cnpj: l.cnpj || '', segmento: l.segmento || '', mrr: rec ? l.mrr || 0 : 0, ...(rec ? {} : { mrrPendente: true }),
            respId: l.respId || null, equipe: l.respId ? [l.respId] : [], cidade: '',
            desde: HOJE, servicos: [], health: 78, tendencia: [78, 78, 78, 78, 78, 78], noPrazo: 100, pagamento: { estado: 'ok', texto: 'Em dia' }, renova,
            metas: { roas: null, cpl: null, leadsMes: null, faturamento: null }, acessos: [], riscoChurn: 25, atrasadas: 0, ativo: true, status: 'ativo',
            componentes: comps, delta30: 0, baseline: { data: HOJE, roas: null, cpl: null, leadsMes: null, faturamento: null }, registros: [], origem: 'importacao', logoCor: CORES[i % CORES.length],
          });
          db.insert('healthHistory', { id: `hh-${id.slice(2)}`, clientId: id, semanas: SEMANAS, valores: SEMANAS.map((_, j) => (j === NSEM - 1 ? 78 : null)) });
          return cli;
        });
        db.insert('activity', { quem: ctx.real.id, quemNome: ctx.real.nome, oque: `importou ${inseridos.length} clientes por CSV`, col: 'clients', refId: null, quando: new Date().toISOString() });
      });
      return true;
    },
  });
  if (ok && inseridos.length) {
    if (!rec) {
      const adm = K.usuariosReceita().filter(u => !ctx.real || u !== ctx.real.id);
      if (adm.length) notify.enviar({ para: adm, titulo: `Preencher o MRR de ${fmt.plural(inseridos.length, 'cliente importado', 'clientes importados')}`, texto: `${ctx.real ? ctx.real.nome : 'A equipe'} importou ${inseridos.map(c => c.nome).slice(0, 4).join(', ')}${inseridos.length > 4 ? '…' : ''} sem o valor do contrato.`, link: '#/clientes', tipo: 'atribuicao' });
    }
    const ids = inseridos.map(c => c.id);
    ui.toast(`${inseridos.length} cliente${inseridos.length > 1 ? 's importados' : ' importado'} para a carteira.`, { desfazer: () => db.batch(() => ids.forEach(id => { db.remove('clients', id); if (db.get('healthHistory', `hh-${id.slice(2)}`)) db.remove('healthHistory', `hh-${id.slice(2)}`); })) });
  }
  return inseridos;
}
