// acoes.js — ações de Equipe: redistribuir tarefas, elogio, 1:1, check-in, lançar horas, atualizar meta, avaliar PDI, ativar/desativar acesso.
import { db } from '../../core/store.js';
import { ui } from '../../core/ui.js';
import { notify } from '../../core/notify.js';
import { router } from '../../core/router.js';
import * as fmt from '../../core/fmt.js';
import { TIPOS, rotTipo, nomeCliente, listaClientes, aberta, diasPara, isoDia, hoje0, FATURAVEIS } from '../operacao/base.js';
import { pessoa, ocupacao, capSemanal, reatribuir, horasRestantes, indisponivelAte, estadoOcupacao, userDe, eu, stats, semanasAcima } from '../operacao/lib.js';

const esc = fmt.esc;
const meNome = () => (eu() || {}).nome || 'Alguém';

/* ---------------- redistribuir ---------------- */
function skillScore(p, tipo) { const sk = (TIPOS[tipo] || {}).skills || []; return (p.skills || []).filter(s => sk.includes(s)).length; }
/** sugere receptor por ocupação projetada + skill; evita quem está de férias no prazo e quem passaria de 100% */
export function sugerir(tasks, donoId) {
  const proj = {}; const cand = FATURAVEIS.filter(id => id !== donoId).map(pessoa).filter(p => p.ativo !== false);
  cand.forEach(p => { proj[p.id] = ocupacao(p.id) ?? 100; });
  const out = {};
  tasks.slice().sort((a, b) => a.prazo.localeCompare(b.prazo)).forEach(t => {
    const h = horasRestantes(t);
    let best = null;
    cand.forEach(p => {
      if (indisponivelAte(p, t.prazo)) return;
      const add = (h / capSemanal(p.id)) * 100; const depois = proj[p.id] + add;
      const sk = skillScore(p, t.tipo);
      const score = sk * 40 - Math.max(0, depois - 85) * 3 - depois * 0.4 - (depois > 100 ? 200 : 0);
      if (!best || score > best.score) best = { id: p.id, score, sk, depois };
    });
    if (best) { out[t.id] = best; proj[best.id] += (h / capSemanal(best.id)) * 100; }
  });
  return out;
}
export async function redistribuir(donoId) {
  const dono = pessoa(donoId);
  const lista = db.list('tasks', t => t.respId === donoId && aberta(t) && t.status !== 'aprovacao').sort((a, b) => a.prazo.localeCompare(b.prazo));
  if (!lista.length) { ui.toast(`${dono.nome} não tem tarefas abertas para redistribuir.`, { tipo: 'info' }); return false; }
  const sug = sugerir(lista, donoId);
  const donoSk = t => skillScore(dono, t.tipo) >= 2; // especialidade da pessoa: fica com ela
  const cand = FATURAVEIS.filter(id => id !== donoId).map(pessoa).filter(p => p.ativo !== false);
  const oc0 = ocupacao(donoId);
  const linhas = lista.map(t => {
    const s = sug[t.id]; const marcado = s && t.status === 'afazer' && !donoSk(t) && s.depois <= 100;
    const d = diasPara(t.prazo);
    return `<li class="rd-i"><label class="ck"><input type="checkbox" name="mover" value="${esc(t.id)}"${marcado ? ' checked' : ''}><span class="rd-t"><b>${esc(t.titulo)}</b><small>${esc(nomeCliente(t.clientId))} · ${esc(rotTipo(t.tipo))} · ${fmt.dec(horasRestantes(t), 1)} h · ${d < 0 ? `<span class="t-err">${-d} d de atraso</span>` : `prazo ${fmt.dataCurta(t.prazo)}`}</small></span></label>
<div class="rd-para"><select name="para-${esc(t.id)}" aria-label="Passar ${esc(t.titulo)} para">${cand.map(p => { const ind = indisponivelAte(p, t.prazo); return `<option value="${esc(p.id)}"${s && s.id === p.id ? ' selected' : ''}${ind ? ' disabled' : ''}>${esc(p.nome)} · ${fmt.pct(ocupacao(p.id), 0)}${ind ? ' (férias)' : ''}</option>`; }).join('')}</select>${s ? `<small class="mut">Sugestão: ${esc(fmt.primeiro(pessoa(s.id).nome))}${s.sk ? ` · skill ${esc((TIPOS[t.tipo] || {}).rotulo || '')}` : ' · menor ocupação'}</small>` : ''}</div></li>`;
  }).join('');
  const corpo = `<form class="m-equipe rd" novalidate>
${ui.aviso({ tipo: oc0 > 100 ? 'err' : 'warn', titulo: `${dono.nome} está em ${fmt.pct(oc0, 0)} de ocupação${semanasAcima(donoId) >= 2 ? ` · ${semanasAcima(donoId)}ª semana acima de 100%` : ''}.`, texto: 'Marcamos as tarefas que fogem da especialidade da pessoa e sugerimos quem recebe, pela ocupação e pelas skills. Ajuste à vontade.' })}
<div class="rd-g"><ul class="rd-l">${linhas}</ul><aside class="rd-proj" aria-live="polite"><h3 class="td-h">Ocupação depois da mudança</h3><div class="rd-bars"></div></aside></div></form>`;
  let feito = null;
  await ui.modal({
    titulo: `Redistribuir tarefas de ${fmt.primeiro(dono.nome)}`, sub: 'Quem recebe e quem perde as tarefas é notificado.', corpo, confirmar: 'Redistribuir', largura: 'xl',
    onAbrir: el => {
      const pintar = () => {
        const d = ui.form.ler(el.querySelector('form')); const sel = [].concat(d.mover || []);
        const delta = {}; sel.forEach(id => { const t = lista.find(x => x.id === id); const para = d[`para-${id}`]; const h = horasRestantes(t); delta[donoId] = (delta[donoId] || 0) - h; delta[para] = (delta[para] || 0) + h; });
        const ids = [donoId, ...cand.map(p => p.id)];
        el.querySelector('.rd-bars').innerHTML = ids.map(id => { const a = ocupacao(id); const b = Math.round(a + ((delta[id] || 0) / capSemanal(id)) * 100); const mud = b !== a; return `<div class="rd-b${mud ? ' mud' : ''}"><div class="row between sm"><span class="row" style="gap:6px">${ui.avatar(id, 20)}<b>${esc(fmt.primeiro(pessoa(id).nome))}</b></span><span class="num">${mud ? `${fmt.pct(a, 0)} → <b class="t-${estadoOcupacao(b) === 'info' ? 'ok' : estadoOcupacao(b)}">${fmt.pct(b, 0)}</b>` : fmt.pct(a, 0)}</span></div>${ui.barra(b, { faixas: 'ocupacao', zona: [70, 85], max: 130, rotulo: false, fina: true })}</div>`; }).join('')
          + `<p class="sm mut">${sel.length ? `${fmt.plural(sel.length, 'tarefa')} · ${fmt.dec(-(delta[donoId] || 0), 1)} h saem da agenda de ${esc(fmt.primeiro(dono.nome))}.` : 'Nenhuma tarefa selecionada.'}</p>`;
      };
      el.addEventListener('change', pintar); pintar();
    },
    onConfirmar: el => {
      const d = ui.form.ler(el.querySelector('form')); const sel = [].concat(d.mover || []);
      if (!sel.length) return 'Selecione pelo menos uma tarefa para redistribuir.';
      const oc = ocupacao(donoId);
      const res = []; const porPessoa = {};
      db.batch(() => { sel.forEach(id => { const r = reatribuir(id, d[`para-${id}`], { silencioso: true, motivo: 'redistribuição de carga' }); if (r) { res.push(r); (porPessoa[r.para] || (porPessoa[r.para] = [])).push(r.depois); } }); });
      Object.entries(porPessoa).forEach(([pid, ts]) => notify.enviar({ para: [userDe(pid)], tipo: 'atribuicao', titulo: `${meNome()} passou ${ts.length === 1 ? 'uma tarefa' : `${ts.length} tarefas`} de ${dono.nome} para você`, texto: ts.map(t => `${t.titulo} (${nomeCliente(t.clientId)}, prazo ${fmt.dataCurta(t.prazo)})`).join(' · '), link: `#/operacao/quadro?pessoa=${pid}`, refCol: 'tasks', refId: ts[0].id }));
      notify.enviar({ para: [userDe(donoId)], tipo: 'mensagem', titulo: `${meNome()} redistribuiu ${res.length === 1 ? 'uma tarefa sua' : `${res.length} tarefas suas`}`, texto: `Para aliviar sua carga (${fmt.pct(oc, 0)} → ${fmt.pct(ocupacao(donoId), 0)}): ${res.map(r => `${r.depois.titulo} → ${fmt.primeiro(pessoa(r.para).nome)}`).join(' · ')}`, link: `#/equipe/${donoId}`, refCol: 'team', refId: donoId });
      db.insert('activity', { quem: (eu() || {}).id, quemNome: meNome(), oque: `redistribuiu ${res.length} tarefa(s) de ${dono.nome}`, col: 'tasks', refId: donoId, quando: new Date().toISOString() });
      feito = { res, oc, depois: ocupacao(donoId) };
      return true;
    },
  });
  router.setQuery({ acao: null });
  if (feito) {
    ui.toast(`${fmt.plural(feito.res.length, 'tarefa redistribuída', 'tarefas redistribuídas')} · ${fmt.primeiro(dono.nome)} ${fmt.pct(feito.oc, 0)} → ${fmt.pct(feito.depois, 0)}.`, {
      desfazer: () => db.batch(() => feito.res.forEach(r => { db.insert('tasks', r.antes); if (r.antesEnt) db.insert('deliveries', r.antesEnt); [[r.de, r.horas], [r.para, -r.horas]].forEach(([id, h]) => { const s = stats(id); if (s) db.update('teamStats', s.id, { ajusteH: Math.round(((s.ajusteH || 0) + h) * 10) / 10 }); }); })),
    });
  }
  return !!feito;
}

/* ---------------- elogio ---------------- */
export async function elogio(teamId) {
  const p = pessoa(teamId); let ok = null;
  await ui.modal({
    titulo: `Enviar elogio para ${fmt.primeiro(p.nome)}`, sub: 'Reconhecimento aparece no perfil e a pessoa é notificada.', confirmar: 'Enviar elogio', largura: 'md',
    corpo: `<form novalidate class="stack">${ui.campo({ nome: 'texto', rotulo: 'O que a pessoa fez bem?', tipo: 'textarea', obrigatorio: true, placeholder: 'Seja específico: a entrega, o cliente e o impacto.' })}${ui.campo({ nome: 'publico', rotulo: 'Mostrar também no feed do time', tipo: 'checkbox', valor: true })}</form>`,
    onConfirmar: el => {
      const r = ui.form.validar(el.querySelector('form'), { texto: 'obrigatorio|min:8' }); if (!r.ok) return false;
      const s = stats(teamId); const fb = { id: `fb-${Date.now().toString(36)}`, tipo: 'elogio', de: (eu() || {}).id, texto: r.dados.texto, quando: new Date().toISOString() };
      if (s) db.update('teamStats', s.id, { feedbacks: (s.feedbacks || []).concat([fb]) });
      notify.enviar({ para: [userDe(teamId)], tipo: 'mensagem', titulo: `👏 ${meNome()} enviou um elogio para você`, texto: r.dados.texto, link: `#/equipe/${teamId}/evolucao`, refCol: 'team', refId: teamId });
      if (r.dados.publico) db.insert('activity', { quem: (eu() || {}).id, quemNome: meNome(), oque: `elogiou ${p.nome}: "${r.dados.texto}"`, col: 'team', refId: teamId, quando: new Date().toISOString() });
      ok = { s, fb }; return true;
    },
  });
  if (ok) ui.toast(`Elogio enviado · ${fmt.primeiro(p.nome)} foi notificada.`, { desfazer: () => { const s = stats(teamId); if (s) db.update('teamStats', s.id, { feedbacks: (s.feedbacks || []).filter(f => f.id !== ok.fb.id) }); } });
}

/* ---------------- 1:1 ---------------- */
export async function registrarUmAUm(teamId) {
  const p = pessoa(teamId); let novo = null;
  await ui.modal({
    titulo: `Registrar 1:1 com ${fmt.primeiro(p.nome)}`, confirmar: 'Salvar 1:1', largura: 'lg',
    corpo: `<form novalidate class="fgrid m-equipe">${ui.campo({ nome: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, valor: isoDia(hoje0()) })}${ui.campo({ nome: 'humor', rotulo: 'Como a pessoa está', tipo: 'select', opcoes: [{ v: 'bem', l: 'Bem' }, { v: 'ok', l: 'Ok' }, { v: 'cansada', l: 'Cansada' }, { v: 'preocupada', l: 'Preocupada' }], valor: 'bem' })}
${ui.campo({ nome: 'notas', rotulo: 'Notas', tipo: 'textarea', obrigatorio: true, cls: 'full', placeholder: 'Principais pontos da conversa' })}${ui.campo({ nome: 'combinados', rotulo: 'Combinados (um por linha)', tipo: 'textarea', cls: 'full', placeholder: 'Ex.: Passar relatórios mensais para o Diego', dica: 'Viram uma lista com caixas de seleção para acompanhar.' })}</form>`,
    onConfirmar: el => {
      const r = ui.form.validar(el.querySelector('form'), { notas: 'obrigatorio|min:5', data: ['obrigatorio', v => (v > isoDia(hoje0()) ? 'Use a data em que a conversa aconteceu.' : '')] }); if (!r.ok) return false;
      const id = `oo-${Date.now().toString(36)}`;
      novo = db.insert('oneOnOnes', { id, teamId, gestorId: (eu() || {}).teamId || 't-gabriel', data: r.dados.data, notas: r.dados.notas, humor: r.dados.humor, combinados: String(r.dados.combinados || '').split('\n').map(x => x.trim()).filter(Boolean).map((texto, i) => ({ id: `${id}-k${i + 1}`, texto, feito: false })) }, { log: `registrou 1:1 com ${p.nome}` });
      notify.enviar({ para: [userDe(teamId)], tipo: 'mensagem', titulo: `${meNome()} registrou o 1:1 de ${fmt.data(r.dados.data)}`, texto: novo.combinados.length ? `Combinados: ${novo.combinados.map(c => c.texto).join(' · ')}` : r.dados.notas, link: `#/equipe/${teamId}/evolucao`, refCol: 'oneOnOnes', refId: id });
      return true;
    },
  });
  if (novo) ui.toast('1:1 registrado e compartilhado com a pessoa.', { desfazer: () => db.remove('oneOnOnes', novo.id) });
}

/* ---------------- check-in ---------------- */
export async function checkin(teamId) {
  const hoje = isoDia(hoje0()); const atual = db.find('checkins', c => c.teamId === teamId && c.data === hoje);
  let salvo = null;
  await ui.modal({
    titulo: atual ? 'Editar check-in de hoje' : 'Check-in de hoje', sub: 'Leva 1 minuto. O gestor lê e ajuda com bloqueios.', confirmar: 'Salvar check-in', largura: 'md',
    corpo: `<form novalidate class="stack">${ui.campo({ nome: 'fiz', rotulo: 'O que fiz', tipo: 'textarea', obrigatorio: true, valor: atual && atual.fiz, linhas: 2 })}${ui.campo({ nome: 'farei', rotulo: 'O que farei', tipo: 'textarea', obrigatorio: true, valor: atual && atual.farei, linhas: 2 })}${ui.campo({ nome: 'bloqueios', rotulo: 'Bloqueios', tipo: 'textarea', valor: atual && atual.bloqueios, linhas: 2, placeholder: 'Deixe em branco se não houver', dica: 'Se houver bloqueio, seu gestor é avisado.' })}</form>`,
    onConfirmar: el => {
      const r = ui.form.validar(el.querySelector('form'), { fiz: 'obrigatorio|min:3', farei: 'obrigatorio|min:3' }); if (!r.ok) return false;
      const antes = atual;
      salvo = db.upsert('checkins', { id: atual ? atual.id : `ck-${teamId.slice(2)}-${Date.now().toString(36)}`, teamId, data: hoje, quando: new Date().toISOString(), ...r.dados });
      const ges = pessoa(teamId).gestorId;
      if (r.dados.bloqueios && (!antes || antes.bloqueios !== r.dados.bloqueios) && ges) notify.enviar({ para: [userDe(ges)], tipo: 'alerta', titulo: `${pessoa(teamId).nome} informou um bloqueio`, texto: r.dados.bloqueios, link: '#/equipe/atividade', refCol: 'checkins', refId: salvo.id });
      salvo = { novo: salvo, antes };
      return true;
    },
  });
  if (salvo) ui.toast(salvo.novo.bloqueios ? 'Check-in salvo · gestor avisado sobre o bloqueio.' : 'Check-in salvo.', { desfazer: () => { if (salvo.antes) db.insert('checkins', salvo.antes); else db.remove('checkins', salvo.novo.id); } });
}

/* ---------------- horas ---------------- */
export async function lancarHoras(teamId) {
  const cart = ((stats(teamId) || {}).carteira || []).map(c => c.clientId);
  const ops = [{ v: '_', l: 'Interno (não faturável)' }].concat(listaClientes().sort((a, b) => cart.includes(b.id) - cart.includes(a.id)).map(c => ({ v: c.id, l: c.nome })));
  let novo = null;
  await ui.modal({
    titulo: 'Lançar horas', sub: pessoa(teamId).nome, confirmar: 'Lançar', largura: 'md',
    corpo: `<form novalidate class="fgrid">${ui.campo({ nome: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true, valor: isoDia(hoje0()) })}${ui.campo({ nome: 'horas', rotulo: 'Horas', tipo: 'number', obrigatorio: true, attrs: { min: '0.25', max: '12', step: '0.25' }, placeholder: 'Ex.: 2,5' })}${ui.campo({ nome: 'clientId', rotulo: 'Cliente', tipo: 'select', obrigatorio: true, opcoes: ops, placeholder: 'Escolha…', cls: 'full' })}${ui.campo({ nome: 'desc', rotulo: 'O que foi feito', obrigatorio: true, cls: 'full', placeholder: 'Ex.: Otimização de campanhas' })}</form>`,
    onConfirmar: el => {
      const r = ui.form.validar(el.querySelector('form'), { horas: ['obrigatorio', v => (v > 0 && v <= 12 ? '' : 'Informe entre 0,25 e 12 horas por lançamento.')], data: ['obrigatorio', 'data', v => (v > isoDia(hoje0()) ? 'Não é possível lançar horas no futuro.' : '')], desc: 'obrigatorio|min:3' }); if (!r.ok) return false;
      const c = r.dados.clientId === '_' ? null : r.dados.clientId;
      novo = db.insert('timeEntries', { teamId, clientId: c, data: r.dados.data, horas: r.dados.horas, faturavel: !!c, desc: r.dados.desc }, { log: `lançou ${fmt.dec(r.dados.horas, 1)} h${c ? ` em ${nomeCliente(c)}` : ''}` });
      return true;
    },
  });
  if (novo) ui.toast(`${fmt.dec(novo.horas, 1).replace(',0', '')} h lançadas.`, { desfazer: () => db.remove('timeEntries', novo.id) });
}

/* ---------------- metas / PDI ---------------- */
export async function atualizarMeta(id) {
  const g = db.get('goals', id); if (!g) return; let antes = null;
  await ui.modal({
    titulo: 'Atualizar progresso', sub: g.titulo, confirmar: 'Salvar', largura: 'sm',
    corpo: `<form novalidate class="stack">${ui.campo({ nome: 'atual', rotulo: `Valor atual (${g.unidade})`, tipo: 'number', obrigatorio: true, valor: g.atual, attrs: { step: 'any' }, dica: `Início ${fmt.dec(g.inicio, g.inicio % 1 ? 1 : 0)} · alvo ${fmt.dec(g.alvo, g.alvo % 1 ? 1 : 0)} ${g.unidade}` })}</form>`,
    onConfirmar: el => { const r = ui.form.validar(el.querySelector('form'), { atual: ['obrigatorio', v => (v == null || isNaN(v) || v < 0 ? 'Informe um número válido.' : '')] }); if (!r.ok) return false; antes = g; db.update('goals', id, { atual: r.dados.atual }, { log: `atualizou a meta "${g.titulo}"` }); return true; },
  });
  if (antes) ui.toast('Progresso atualizado.', { desfazer: () => db.insert('goals', antes) });
}
export async function avaliarPdi(teamId) {
  const s = stats(teamId); if (!s) return; let antes = null;
  const sel = (n, v) => `<select name="${n}" aria-label="Nível">${[1, 2, 3, 4, 5].map(i => `<option value="${i}"${i === v ? ' selected' : ''}>${i}</option>`).join('')}</select>`;
  await ui.modal({
    titulo: 'Avaliar competências (PDI)', sub: pessoa(teamId).nome, confirmar: 'Salvar avaliação', largura: 'md',
    corpo: `<form novalidate class="m-equipe pdi-f"><div class="pdi-fh sm mut"><span>Competência</span><span>Atual</span><span>Alvo</span></div>${(s.pdi || []).map(c => `<div class="pdi-fr"><b>${esc(c.comp)}</b>${sel(`n-${c.id}`, c.nivel)}${sel(`a-${c.id}`, c.alvo)}</div>`).join('')}<p class="sm mut">Escala: 1 iniciante · 3 autônomo · 5 referência para o time.</p></form>`,
    onConfirmar: el => { const d = ui.form.ler(el.querySelector('form')); antes = s.pdi; db.update('teamStats', s.id, { pdi: s.pdi.map(c => ({ ...c, nivel: Number(d[`n-${c.id}`]), alvo: Math.max(Number(d[`n-${c.id}`]), Number(d[`a-${c.id}`])) })) }, { log: `avaliou o PDI de ${pessoa(teamId).nome}` }); return true; },
  });
  if (antes) ui.toast('Avaliação salva.', { desfazer: () => db.update('teamStats', s.id, { pdi: antes }) });
}
