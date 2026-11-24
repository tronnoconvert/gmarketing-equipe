// Administração › Equipe — cadastro de colaboradores (coleção `team`; único lugar que cria registros de equipe), com foto.
import { campoFotoHtml, ligarCampoFoto } from '../equipe/foto.js';
const AREAS = ['Diretoria', 'Tráfego', 'Social', 'Design', 'Copy', 'Dev', 'Atendimento', 'Comercial', 'Financeiro', 'Conteúdo', 'Operações'];
const CORES = ['#0B6BE8', '#7C5CFC', '#0E9F6E', '#D9467A', '#C2700A', '#0891B2', '#4F46E5', '#B45309', '#047857', '#475569'];
const SUGESTOES = ['Meta Ads', 'Google Ads', 'TikTok Ads', 'Social media', 'Design', 'Criativos', 'Motion', 'Copy', 'Roteiros', 'Sites', 'CRM', 'Integrações', 'Atendimento', 'CS', 'Onboarding', 'Análise de dados', 'Planejamento', 'Vendas', 'Propostas', 'Financeiro'];

export function statusDe(t) {
  if (t.ativo === false) return 'desligado';
  if (t.status === 'ferias') return 'ferias';
  return 'ativo';
}
function statusHtml(t, ui, fmt) {
  const s = statusDe(t);
  if (s === 'desligado') return ui.led('off', t.desligadoEm ? `Desligado em ${fmt.data(t.desligadoEm)}` : 'Desligado');
  if (s === 'ferias') return ui.led('warn', t.statusAte ? `Férias até ${fmt.dataCurta(t.statusAte)}` : 'Férias');
  return ui.led('ok', 'Ativo');
}
function slug(nome) { return String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().split(/\s+/)[0].replace(/[^a-z0-9]/g, '') || 'pessoa'; }

export function render(ctx) {
  const { ui, fmt, db, query } = ctx; const esc = fmt.esc;
  const pode = ctx.can('admin', 'editar');
  const todos = db.list('team').sort((a, b) => (a.ativo === false) - (b.ativo === false) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const f = query.f || '';
  const ativos = todos.filter(t => statusDe(t) !== 'desligado');
  const ferias = todos.filter(t => statusDe(t) === 'ferias');
  const deslig = todos.filter(t => statusDe(t) === 'desligado');
  const linhas = f === 'ferias' ? ferias : f === 'desligados' ? deslig : f === 'todos' ? todos : ativos;
  const fat = ativos.filter(t => t.faturavel);
  const horas = fat.reduce((s, t) => s + (Number(t.horasMes) || 0), 0);
  const custoMes = ativos.reduce((s, t) => s + (Number(t.custoHora) || 0) * (Number(t.horasMes) || 0), 0);
  const custoMedio = fat.length ? fat.reduce((s, t) => s + (Number(t.custoHora) || 0), 0) / fat.length : 0;

  const kpis = `<div class="g-kpi m-adm-kpis">
${ui.kpi({ rotulo: 'Colaboradores ativos', valor: String(ativos.length), comp: ferias.length ? `${ferias.length} de férias` : 'ninguém de férias' })}
${ui.kpi({ rotulo: 'Horas contratadas', valor: fmt.num(horas), comp: `por mês · ${fat.length} faturáveis`, ajuda: 'Soma das horas contratadas por mês de quem trabalha em clientes (faturável).' })}
${ui.kpi({ rotulo: 'Custo/hora médio', valor: fmt.brl2(custoMedio), comp: 'equipe faturável', ajuda: 'Média simples do custo/hora (salário + encargos ÷ horas) da equipe faturável.' })}
${ui.kpi({ rotulo: 'Custo de pessoal/mês', valor: fmt.brlK(custoMes), comp: 'custo/hora × horas', ajuda: 'Estimativa: custo/hora × horas contratadas de todos os ativos. Usado em rentabilidade por cliente.' })}
</div>`;

  const chips = ui.chips([{ id: '', rotulo: 'Ativos', n: ativos.length }, { id: 'ferias', rotulo: 'Férias', n: ferias.length }, { id: 'desligados', rotulo: 'Desligados', n: deslig.length }, { id: 'todos', rotulo: 'Todos', n: todos.length }], f, 'f');
  const tabela = ui.tabela({
    legenda: 'Colaboradores', ordem: { k: 'nome', dir: 'asc' },
    onRowHref: t => `#/admin/equipe?editar=${t.id}`,
    cols: [
      { k: 'nome', l: 'Colaborador', r: t => `<span class="m-adm-pess">${ui.avatar(t, 30)}<span><b>${esc(t.nome)}</b><span class="sub">${esc(t.cargo || '—')}</span></span></span>` },
      { k: 'area', l: 'Área' },
      { k: 'gestorId', l: 'Gestor direto', mobile: false, v: t => (db.get('team', t.gestorId) || {}).nome || '', r: t => { const g = t.gestorId && db.get('team', t.gestorId); return g ? esc(g.nome) : '<span class="mut">—</span>'; } },
      { k: 'custoHora', l: 'Custo/hora', num: true, r: t => (t.custoHora ? fmt.brl2(t.custoHora) : '<span class="mut">—</span>') },
      { k: 'horasMes', l: 'Horas/mês', num: true, r: t => (t.horasMes ? `${fmt.num(t.horasMes)} h` : '<span class="mut">—</span>') },
      { k: 'skills', l: 'Skills', sort: false, mobile: false, r: t => `<span class="m-adm-sk">${(t.skills || []).slice(0, 2).map(s => `<span>${esc(s)}</span>`).join('')}${(t.skills || []).length > 2 ? `<span class="mut" title="${esc(t.skills.slice(2).join(', '))}">+${t.skills.length - 2}</span>` : ''}</span>` },
      { k: 'status', l: 'Status', v: t => statusDe(t), r: t => statusHtml(t, ui, fmt) },
      { k: 'acesso', l: 'Acesso', mobile: false, v: t => (t.userId && db.get('users', t.userId) ? 1 : 0), r: t => { const u = t.userId && db.get('users', t.userId); return u ? (u.ativo === false ? '<span class="mut">Inativo</span>' : esc(ctx.perms.rotuloPapel(u.papel))) : (pode && statusDe(t) !== 'desligado' ? ui.btn({ rotulo: 'Criar acesso', sm: true, tipo: 'link', attrs: { 'data-m-adm-acesso': t.id } }) : '<span class="mut">Sem acesso</span>'); } },
    ],
    linhas,
    vazio: { icone: 'users', titulo: f === 'ferias' ? 'Ninguém de férias' : f === 'desligados' ? 'Nenhum desligamento' : 'Nenhum colaborador', texto: 'Cadastre a equipe para calcular ocupação, horas e rentabilidade.', acao: pode ? { rotulo: 'Novo colaborador', icone: 'plus', attrs: { 'data-m-adm-novo': '' } } : null },
  });
  return `${kpis}
${ui.card({ pad: false, titulo: 'Cadastro de colaboradores', sub: 'Clique numa linha para editar', ajuda: 'Base da equipe usada em ocupação, horas, rentabilidade e escopo de clientes. Ocupação e status do dia a dia ficam em Equipe.',
    acoes: `${ui.btn({ rotulo: 'Ver Equipe', href: '#/equipe', sm: true, tipo: 'ghost' })}${pode ? ui.btn({ rotulo: 'Novo colaborador', icone: 'plus', tipo: 'pri', sm: true, attrs: { 'data-m-adm-novo': '' } }) : ''}`,
    corpo: `<div class="m-adm-bar">${chips}</div>${tabela}` })}`;
}

function formHtml(ctx, t) {
  const { ui, db, fmt } = ctx; const esc = fmt.esc;
  const st = t ? statusDe(t) : 'ativo';
  const gestores = db.list('team', x => x.ativo !== false && (!t || x.id !== t.id)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const areas = [...new Set([...AREAS, ...db.list('team').map(x => x.area).filter(Boolean)])];
  return `<form class="stack m-adm-tf" novalidate>
<div class="fsec-t">Identificação</div>
${campoFotoHtml(t || { nome: 'Nova pessoa', avatarCor: CORES[db.count('team') % CORES.length] }, t && t.foto)}
<div class="fgrid">
${ui.campo({ nome: 'nome', rotulo: 'Nome completo', obrigatorio: true, valor: t && t.nome, placeholder: 'Ex.: Joana Ribeiro' })}
${ui.campo({ nome: 'cargo', rotulo: 'Cargo / função', obrigatorio: true, valor: t && t.cargo, placeholder: 'Ex.: Designer pleno' })}
${ui.campo({ nome: 'area', rotulo: 'Área', tipo: 'select', obrigatorio: true, placeholder: 'Escolha…', valor: t && t.area, opcoes: areas })}
${ui.campo({ nome: 'gestorId', rotulo: 'Gestor direto', tipo: 'select', placeholder: 'Sem gestor', valor: t ? t.gestorId : 't-gabriel', opcoes: gestores.map(g => ({ v: g.id, l: g.nome })) })}
${ui.campo({ nome: 'email', rotulo: 'E-mail', tipo: 'email', obrigatorio: true, valor: t && t.email, placeholder: 'nome@agencia.com.br' })}
${ui.campo({ nome: 'telefone', rotulo: 'WhatsApp', tipo: 'telefone', valor: t && t.telefone, dica: 'Usado nas notificações por WhatsApp.' })}
</div>
<div class="fsec-t">Contrato e custo</div>
<div class="fgrid">
${ui.campo({ nome: 'custoHora', rotulo: 'Custo/hora (R$)', tipo: 'moeda', obrigatorio: true, valor: t ? Number(t.custoHora || 0) : '', ajuda: 'Salário ou retirada + encargos e benefícios, dividido pelas horas do mês.' })}
${ui.campo({ nome: 'horasMes', rotulo: 'Horas contratadas/mês', tipo: 'number', obrigatorio: true, valor: t ? t.horasMes : 160, attrs: { min: 0, max: 240, step: 1 } })}
${ui.campo({ nome: 'desde', rotulo: 'Data de entrada', tipo: 'data', obrigatorio: true, valor: t && t.desde })}
${ui.campo({ nome: 'faturavel', rotulo: 'Trabalha em clientes (faturável)', tipo: 'checkbox', valor: t ? t.faturavel : true, dica: 'Entra no cálculo de ocupação e rentabilidade.' })}
</div>
<div class="fsec-t">Skills</div>
<div class="fld"><label for="m-adm-sk-in">Habilidades</label>
<div class="m-adm-chipin" data-m-adm-skills>${(t && t.skills || []).map(s => `<span class="m-adm-chip" data-v="${esc(s)}">${esc(s)}<button type="button" aria-label="Remover ${esc(s)}" data-m-adm-skx>${ui.ic('x')}</button></span>`).join('')}<input id="m-adm-sk-in" type="text" list="m-adm-sk-dl" placeholder="Digite e tecle Enter" autocomplete="off"></div>
<datalist id="m-adm-sk-dl">${SUGESTOES.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
<p class="fld-d">Até 12 skills. Ajudam a redistribuir tarefas e montar times de cliente.</p></div>
<div class="fsec-t">Status</div>
<div class="m-adm-st">${ui.campo({ nome: 'status', rotulo: 'Status', tipo: 'radio', valor: st, opcoes: [{ v: 'ativo', l: 'Ativo' }, { v: 'ferias', l: 'Férias' }, { v: 'desligado', l: 'Desligado' }] })}</div>
<div class="fgrid" data-m-adm-ferias${st === 'ferias' ? '' : ' hidden'}>
${ui.campo({ nome: 'feriasInicio', rotulo: 'Férias: início', tipo: 'data', valor: t && t.feriasInicio })}
${ui.campo({ nome: 'statusAte', rotulo: 'Férias: volta em', tipo: 'data', valor: t && t.statusAte })}
</div>
</form>`;
}

export async function editar(ctx, id) {
  const { ui, db, fmt, router } = ctx;
  const t = id ? db.get('team', id) : null;
  if (id && !t) { ui.toast('Colaborador não encontrado.', { tipo: 'err' }); return; }
  let skills = t ? (t.skills || []).slice() : [];
  let salvo = null; let antes = t ? { ...t } : null;
  const foto = { foto: (t && t.foto) || null, mudou: false };
  const ok = await ui.modal({
    titulo: t ? `Editar ${t.nome}` : 'Novo colaborador', sub: t ? `${t.cargo || ''}${t.area ? ' · ' + t.area : ''}` : 'Cadastro da equipe', largura: 'lg', confirmar: t ? 'Salvar alterações' : 'Cadastrar colaborador',
    corpo: formHtml(ctx, t),
    onAbrir: el => {
      const nomeIn = el.querySelector('[name="nome"]');
      ligarCampoFoto(el, foto, () => ({ ...(t || { avatarCor: CORES[db.count('team') % CORES.length] }), nome: (nomeIn && nomeIn.value.trim()) || (t && t.nome) || 'Nova pessoa', iniciais: nomeIn && nomeIn.value.trim() ? fmt.iniciais(nomeIn.value) : t && t.iniciais }));
      nomeIn && nomeIn.addEventListener('change', () => { if (!foto.foto && foto.redesenhar) foto.redesenhar(); });
      const box = el.querySelector('[data-m-adm-skills]'); const inp = box.querySelector('input');
      const desenhar = () => { box.querySelectorAll('.m-adm-chip').forEach(c => c.remove()); inp.insertAdjacentHTML('beforebegin', skills.map(s => `<span class="m-adm-chip" data-v="${fmt.esc(s)}">${fmt.esc(s)}<button type="button" aria-label="Remover ${fmt.esc(s)}" data-m-adm-skx>${ui.ic('x')}</button></span>`).join('')); };
      const add = () => { const v = inp.value.trim().replace(/,$/, ''); if (!v) return; if (skills.length >= 12) { ui.toast('Máximo de 12 skills.', { tipo: 'warn' }); return; } if (!skills.some(s => fmt.norm(s) === fmt.norm(v))) skills.push(v.slice(0, 30)); inp.value = ''; desenhar(); };
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); e.stopPropagation(); add(); }
        else if (e.key === 'Backspace' && !inp.value && skills.length) { skills.pop(); desenhar(); }
      });
      inp.addEventListener('change', () => { if (SUGESTOES.includes(inp.value)) add(); });
      box.addEventListener('click', e => { const x = e.target.closest('[data-m-adm-skx]'); if (x) { const v = x.closest('.m-adm-chip').dataset.v; skills = skills.filter(s => s !== v); desenhar(); inp.focus(); } else inp.focus(); });
      el.addEventListener('change', e => { if (e.target.name === 'status') el.querySelector('[data-m-adm-ferias]').hidden = e.target.value !== 'ferias'; });
    },
    onConfirmar: async el => {
      const f = el.querySelector('form');
      const status = (f.querySelector('[name="status"]:checked') || {}).value || 'ativo';
      const hoje = fmt.iso(new Date());
      const r = ui.form.validar(f, {
        nome: ['obrigatorio', 'min:3', 'max:80', v => (/\s/.test(String(v).trim()) ? '' : 'Informe nome e sobrenome.')],
        cargo: 'obrigatorio|min:2|max:60', area: 'obrigatorio',
        email: ['obrigatorio', v => (db.find('team', x => x.id !== id && String(x.email || '').toLowerCase() === String(v).trim().toLowerCase()) ? 'Outro colaborador já usa este e-mail.' : '')],
        custoHora: ['obrigatorio', v => (v === null || isNaN(v) || v < 0 ? 'Informe um valor válido (pode ser R$ 0,00).' : v > 2000 ? 'Valor muito alto para custo/hora. Confira (máx. R$ 2.000).' : '')],
        horasMes: ['obrigatorio', v => (v === null || v < 0 || v > 240 ? 'Use entre 0 e 240 horas por mês.' : '')],
        desde: ['obrigatorio', v => (v && v > hoje ? 'A data de entrada não pode ser no futuro.' : '')],
        feriasInicio: [v => (status === 'ferias' && !v ? 'Informe o início das férias.' : '')],
        statusAte: [(v, d) => (status === 'ferias' && !v ? 'Informe a data de volta.' : status === 'ferias' && v && d.feriasInicio && v < d.feriasInicio ? 'A volta precisa ser depois do início.' : '')],
      });
      if (!r.ok) return false;
      const d = r.dados;
      if (status === 'desligado' && (!t || t.ativo !== false)) {
        const u = t && t.userId && db.get('users', t.userId);
        if (u && u.papel === 'dono' && db.count('users', x => x.ativo !== false && x.papel === 'dono') <= 1) return 'Esta pessoa é o único Dono ativo e não pode ser desligada.';
        const c = await ui.confirmar(`${d.nome} sai das listas de alocação e ocupação.${u && u.ativo !== false ? ' O acesso ao app também será desativado.' : ''} O histórico continua salvo.`, { titulo: `Desligar ${d.nome}?`, confirmar: 'Desligar' });
        if (!c) return false;
      }
      const patch = {
        nome: d.nome.trim(), iniciais: fmt.iniciais(d.nome), cargo: d.cargo.trim(), area: d.area, gestorId: d.gestorId || null, email: d.email.trim().toLowerCase(), telefone: d.telefone || '',
        custoHora: Number(d.custoHora) || 0, horasMes: Number(d.horasMes) || 0, desde: d.desde, faturavel: !!d.faturavel, skills: skills.slice(),
        ativo: status !== 'desligado',
        status: status === 'ferias' ? 'ferias' : (t && t.status && t.status !== 'ferias' ? t.status : 'online'),
        statusAte: status === 'ferias' ? d.statusAte : null, feriasInicio: status === 'ferias' ? d.feriasInicio : null,
        desligadoEm: status === 'desligado' ? (t && t.desligadoEm) || hoje : null,
        foto: foto.foto || null,
      };
      db.batch(() => {
        if (t) {
          salvo = db.update('team', t.id, patch, { log: `atualizou o cadastro de ${patch.nome}${foto.mudou ? (foto.foto ? ' (foto nova)' : ' (removeu a foto)') : ''}` });
          const u = t.userId && db.get('users', t.userId);
          if (u) db.update('users', u.id, Object.assign({ nome: patch.nome, iniciais: patch.iniciais, cargo: patch.cargo }, status === 'desligado' && u.ativo !== false ? { ativo: false, desativadoEm: new Date().toISOString() } : {}), status === 'desligado' && u.ativo !== false ? { log: `desativou o acesso de ${u.nome} (desligamento)` } : {});
        } else {
          let nid = `t-${slug(patch.nome)}`, i = 2; while (db.get('team', nid)) nid = `t-${slug(patch.nome)}${i++}`;
          salvo = db.insert('team', Object.assign({ id: nid, avatarCor: CORES[db.count('team') % CORES.length], papel: null, userId: null }, patch), { log: `cadastrou ${patch.nome} na equipe` });
        }
      });
      return true;
    },
  });
  if (!ok || !salvo) return;
  ctx.refresh();
  if (antes) {
    const userAntes = antes.userId && db.get('users', antes.userId);
    ui.toast(`Cadastro de ${salvo.nome} salvo.`, { desfazer: () => db.batch(() => { db.insert('team', antes); if (userAntes && salvo.ativo === false) db.update('users', userAntes.id, { ativo: true }); }) });
  } else {
    ui.toast(`${salvo.nome} cadastrado na equipe.`, { desfazer: () => db.remove('team', salvo.id, { log: `desfez o cadastro de ${salvo.nome}` }), acao: { rotulo: 'Criar acesso', fn: () => ctx._convidar({ nome: salvo.nome, email: salvo.email, teamId: salvo.id }) } });
  }
}

export function mount(el, ctx) {
  const onClick = e => {
    if (e.target.closest('[data-m-adm-novo]')) { editar(ctx, null); return; }
    const a = e.target.closest('[data-m-adm-acesso]');
    if (a) { e.preventDefault(); e.stopPropagation(); const t = ctx.db.get('team', a.dataset.mAdmAcesso); if (t) ctx._convidar({ nome: t.nome, email: t.email, teamId: t.id, papel: t.papel || '' }); }
  };
  el.addEventListener('click', onClick, true);
  if (ctx.router.query.editar) { const id = ctx.router.query.editar; ctx.router.setQuery({ editar: null }); setTimeout(() => editar(ctx, id), 0); }
  return () => el.removeEventListener('click', onClick, true);
}
