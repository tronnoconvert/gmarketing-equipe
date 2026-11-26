// cockpit/backups.js — card "Backups" do Cockpit (só Dono e Admin). Ver docs/BACKUP-E-RESTAURACAO.md.
// Produção: lê os registros `backupStatus` (nativo | diario | externo | auditoria), gravados SÓ pelo servidor
// (Edge Function backup-diario, GitHub Actions via backup-diario, e a auditoria tests/live/auditoria.mjs).
// O banco só entrega essa coleção a Dono/Admin. Demonstração: status fictícios, todos verdes.
// LED: verde = último sucesso há menos de 26 h · âmbar = 26–50 h · vermelho = mais antigo, falhou ou não existe.
// Backup nativo do Supabase: o app não tem acesso à API de gerenciamento, então quem confere é a auditoria (semanal):
// se ela conferiu nos últimos 8 dias e havia backup com menos de 26 h naquele momento, o LED fica verde.

const H = 3600_000;
export const TIPOS = [
  { id: 'nativo', nome: 'Supabase (nativo)', desc: 'Cópia completa do banco feita pelo Supabase todo dia (guarda 7 dias).' },
  { id: 'diario', nome: 'Exportação diária', desc: 'Todas as tabelas do app em arquivo, no armazenamento privado do Supabase, às 03:10 (35 dias + 1 por mês por 12 meses).' },
  { id: 'externo', nome: 'Cópia externa (GitHub)', desc: 'O arquivo do dia, criptografado, fora do Supabase, às 03:40 (últimos 90).' },
];

export function podeVerBackups(user) { return !!user && ['dono', 'admin'].includes(user.papel); }

/** estado do LED a partir do registro de status (puro; exportado para os testes) */
export function estadoBackup(tipo, s, agora = Date.now()) {
  if (!s) return { estado: 'err', motivo: 'sem registro' };
  if (s.ok === false) return { estado: 'err', motivo: 'última execução falhou' };
  const ultima = Date.parse(tipo === 'nativo' ? (s.ultimoBackupEm || '') : (s.ultimaEm || ''));
  if (!Number.isFinite(ultima)) return { estado: 'err', motivo: 'sem data' };
  let idade = agora - ultima;
  if (tipo === 'nativo') { const conf = Date.parse(s.ultimaEm || ''); if (Number.isFinite(conf) && agora - conf < 8 * 24 * H) idade = Math.max(0, conf - ultima); }
  return { estado: idade < 26 * H ? 'ok' : idade < 50 * H ? 'warn' : 'err', idadeH: Math.round(idade / H) };
}

function demo() {
  const t = h => new Date(Date.now() - h * H).toISOString();
  const cont = { records: 4812, profiles: 9, orgs: 1, perm_padrao: 144, col_modules: 81, auth_users: 9 };
  return {
    nativo: { ok: true, ultimaEm: t(30), ultimoBackupEm: t(29.5), backups: 7 },
    diario: { ok: true, ultimaEm: t(5), bytes: 1_843_200, contagens: cont, dia: t(5).slice(0, 10) },
    externo: { ok: true, ultimaEm: t(4.5), bytes: 1_843_264, arquivos: 34, dia: t(5).slice(0, 10) },
    auditoria: { ok: true, ultimaEm: t(52), pass: 41, fail: 0, total: 41, arquivo: 'docs/auditoria/' },
  };
}

const kb = b => (b == null ? '' : b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function cardBackups(ctx) {
  if (!podeVerBackups(ctx.user)) return '';
  const { ui, fmt, db } = ctx;
  const S = db.dadosDemo ? demo() : Object.fromEntries(['nativo', 'diario', 'externo', 'auditoria'].map(k => [k, db.get('backupStatus', k)]));
  const ajuda = 'Três cópias independentes dos dados da plataforma. Verde = último backup há menos de 26 h · âmbar = 26–50 h · vermelho = mais antigo, falhou ou não existe. Como restaurar: docs/BACKUP-E-RESTAURACAO.md.';
  const nenhum = !S.nativo && !S.diario && !S.externo;
  if (nenhum) return ui.card({ titulo: 'Backups', cls: 'ck-backups', ajuda, corpo: ui.vazio({ icone: 'database', titulo: 'Primeiro backup às 03:10', texto: 'A exportação diária roda às 03:10 e a cópia externa às 03:40. O estado de cada uma aparece aqui.', compacto: true }) });
  const linhas = TIPOS.map(t => {
    const s = S[t.id]; const e = estadoBackup(t.id, s);
    const quando = s ? (t.id === 'nativo' ? s.ultimoBackupEm : s.ultimaEm) : null;
    const det = !s ? (t.id === 'externo' ? 'aguardando a 1ª cópia (03:40)' : t.id === 'nativo' ? 'aguardando a 1ª conferência da auditoria' : 'Primeiro backup às 03:10')
      : s.ok === false ? `falhou ${fmt.rel(s.ultimaEm)}${s.erro ? ` · ${s.erro}` : ''}`
      : [`último: ${fmt.data(quando).slice(0, 5)} às ${fmt.hora(quando)}`, kb(s.bytes),
        s.contagens ? `${fmt.num(s.contagens.records)} registros` : '', s.arquivos ? `${s.arquivos} arquivos` : '', s.backups ? `${s.backups} cópias` : '',
        t.id === 'nativo' && s.ultimaEm ? `conferido ${fmt.data(s.ultimaEm).slice(0, 5)}` : ''].filter(Boolean).join(' · ');
    return `<li data-backup="${t.id}" data-estado="${e.estado}" title="${fmt.esc(t.desc)}">${ui.led(e.estado, false)}<span class="ck-bk-n"><b>${fmt.esc(t.nome)}</b><span class="sm ${e.estado === 'err' ? 't-err' : e.estado === 'warn' ? 't-warn' : 'mut'}">${fmt.esc(det)}</span></span></li>`;
  }).join('');
  const a = S.auditoria;
  const aud = a ? `<li data-backup="auditoria" data-estado="${a.fail ? 'err' : 'ok'}">${ui.led(a.fail ? 'err' : 'ok', false)}<span class="ck-bk-n"><b>Auditoria de segurança</b><span class="sm ${a.fail ? 't-err' : 'mut'}">${fmt.esc(`${fmt.data(a.ultimaEm).slice(0, 5)} às ${fmt.hora(a.ultimaEm)} · ${a.pass} ok · ${a.fail} ${a.fail === 1 ? 'falha' : 'falhas'}${a.arquivo ? ` · detalhes em ${a.arquivo}` : ''}`)}</span></span></li>`
    : `<li data-backup="auditoria" data-estado="off">${ui.led('off', false)}<span class="ck-bk-n"><b>Auditoria de segurança</b><span class="sm mut">ainda não rodou</span></span></li>`;
  const est = TIPOS.map(t => estadoBackup(t.id, S[t.id]).estado);
  const sub = est.every(x => x === 'ok') ? '3 de 3 em dia' : `${est.filter(x => x === 'ok').length} de 3 em dia`;
  return ui.card({ titulo: 'Backups', sub, cls: 'ck-backups', ajuda, corpo: `<ul class="ck-bk">${linhas}${aud}</ul>` });
}
