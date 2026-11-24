// Administração › Integrações — só o STATUS das chaves do servidor. Nunca há campo para digitar chave secreta no navegador.
import { INTEGRACOES, statusDemo, copiar } from './comum.js';

let cacheServidor = null; // {quando, status:{ENV: bool}, erro}

function statusServidor(it) {
  if (!cacheServidor) return { estado: 'off', rotulo: 'Não verificado', detalhe: 'Clique em "Verificar agora".', configurado: false };
  if (cacheServidor.erro) return { estado: 'err', rotulo: 'Sem resposta', detalhe: cacheServidor.erro, configurado: false };
  const s = cacheServidor.status || {};
  const tem = l => l && l.every(k => s[k]);
  const ok = tem(it.envs) || tem(it.alt);
  const parcial = !ok && [...it.envs, ...(it.alt || [])].some(k => s[k]);
  return { estado: ok ? 'ok' : parcial ? 'warn' : 'off', rotulo: ok ? 'Configurado' : parcial ? 'Incompleto' : 'Não configurado', detalhe: parcial ? 'Falta pelo menos uma variável.' : '', configurado: ok, verificadoEm: cacheServidor.quando };
}

export function render(ctx) {
  const { ui, fmt, db } = ctx; const esc = fmt.esc;
  const demo = db.mode === 'demo';
  const lista = INTEGRACOES.map(it => ({ it, st: demo ? statusDemo(it) : statusServidor(it) }));
  const ok = lista.filter(x => x.st.estado === 'ok').length;
  const err = lista.filter(x => x.st.estado === 'err').length;
  const ultima = demo ? (db.config('admin.integracoes', {}) || {})._ultima : cacheServidor && cacheServidor.quando;

  const cards = lista.map(({ it, st }) => `<article class="card m-int">
<header class="m-int-h"><span class="m-int-ic">${ui.ic(it.icone)}</span><div class="m-int-t"><h3>${esc(it.nome)}</h3><p class="mut sm">${esc(it.uso)}</p></div></header>
<div class="m-int-st">${ui.led(st.estado, st.rotulo)}${st.detalhe ? `<span class="sm ${st.estado === 'err' ? 't-err' : 'mut'}">${esc(st.detalhe)}</span>` : ''}</div>
<dl class="m-int-env"><dt>Variáveis no servidor</dt><dd>${it.envs.map(e => `<code>${esc(e)}</code>`).join(' ')}${it.opc ? ` <span class="mut sm">opcional:</span> ${it.opc.map(e => `<code>${esc(e)}</code>`).join(' ')}` : ''}</dd>
${it.alt ? `<dt>ou, alternativa</dt><dd>${it.alt.map(e => `<code>${esc(e)}</code>`).join(' ')}</dd>` : ''}
<dt>Usada pela função</dt><dd><code>${esc(it.funcao)}</code></dd></dl>
<footer class="m-int-f">${ui.btn({ rotulo: 'Como configurar', icone: 'help', sm: true, tipo: 'ghost', attrs: { 'data-m-int-como': it.id } })}</footer></article>`).join('');

  return `${ui.aviso({ tipo: 'info', titulo: 'Chaves ficam no servidor (variáveis de ambiente das Edge Functions).', texto: 'Esta tela mostra apenas se cada integração está configurada. Nenhuma chave secreta é digitada, guardada ou exibida no navegador. Para trocar uma chave, use "supabase secrets set" (veja "Como configurar").' })}
${ui.card({ titulo: 'Integrações do servidor', sub: `${ok} de ${lista.length} configuradas${err ? ` · ${err} com erro` : ''}${demo ? ' · simulado no modo demonstração' : ''}`,
    acoes: `<span class="mut sm m-int-at">${ultima ? `Verificado ${ui.rel(ultima)}` : 'Ainda não verificado'}</span>${ui.btn({ rotulo: 'Verificar agora', icone: 'refresh', sm: true, attrs: { 'data-m-int-verificar': '' } })}${ui.btn({ rotulo: 'Ver na Torre', sm: true, tipo: 'ghost', href: '#/torre' })}`,
    corpo: `<div class="m-int-g">${cards}</div>` })}`;
}

function comoConfigurar(ctx, id) {
  const { ui, fmt } = ctx; const esc = fmt.esc;
  const it = INTEGRACOES.find(x => x.id === id); if (!it) return;
  const cmd = `supabase secrets set ${it.envs.map(e => `${e}=...`).join(' ')}`;
  const onde = {
    windsor: 'Windsor.ai › Account › API key.', monday: 'monday.com › foto de perfil › Developers › My access tokens.',
    meta: 'Meta for Developers › seu app › Ferramentas › token de acesso do sistema (System User) com ads_read e leads_retrieval.',
    whatsapp: 'Z-API: painel da instância (ID, token e Client-Token de segurança). Twilio: Console › Account SID / Auth Token e o número WhatsApp aprovado.',
    slack: 'Slack › Apps › Incoming Webhooks › Add New Webhook to Workspace › escolha o canal.',
    email: 'Resend › API Keys (e verifique o domínio do remetente). Ou os dados SMTP do seu provedor (porta 465).',
  }[id];
  ui.drawer({
    titulo: `Configurar ${it.nome}`, sub: 'Feito uma vez, no terminal, por quem administra o servidor', largura: 520,
    corpo: `<div class="stack m-int-dr">
<ol class="m-adm-pass">
<li><b>Pegue a chave</b> no serviço: ${esc(onde)}</li>
<li><b>Grave no servidor</b> (nunca no app nem no config.js):<div class="m-adm-senha m-int-cmd"><code>${esc(cmd)}</code>${ui.btn({ rotulo: 'Copiar', icone: 'copy', sm: true, attrs: { 'data-m-int-copiar': cmd } })}</div></li>
${it.alt ? `<li><b>Alternativa:</b> em vez das variáveis acima, use ${it.alt.map(e => `<code>${esc(e)}</code>`).join(', ')}.</li>` : ''}
<li><b>Publique a função de novo</b> se ela já estava no ar: <code>supabase functions deploy ${esc(it.funcao)}</code></li>
<li><b>Volte aqui</b> e clique em "Verificar agora". O LED fica verde quando a variável existe.</li></ol>
${ui.aviso({ tipo: 'warn', titulo: 'Nunca cole a chave em chats, e-mails ou no código.', texto: 'Se uma chave vazar, gere outra no serviço e rode o comando de novo.' })}
<p class="mut sm">Passo a passo completo em docs/DEPLOY.md e supabase/README.md.</p></div>`,
    onAbrir: el => el.addEventListener('click', e => { const b = e.target.closest('[data-m-int-copiar]'); if (b) copiar(b.dataset.mIntCopiar, 'Comando copiado.'); }),
  });
}

async function verificar(ctx) {
  const { db, ui } = ctx;
  const quando = new Date().toISOString();
  if (db.mode === 'demo') {
    const v = Object.assign({}, db.config('admin.integracoes', {}) || {});
    INTEGRACOES.forEach(it => { v[it.id] = { verificadoEm: quando }; }); v._ultima = quando;
    db.setConfig('admin.integracoes', v);
    const st = INTEGRACOES.map(statusDemo); const e = st.filter(s => s.estado === 'err').length;
    ui.toast(e ? `Verificação concluída: ${e} integração com erro.` : 'Verificação concluída (simulada).', { tipo: e ? 'warn' : 'ok' });
    ctx.refresh(); return;
  }
  try {
    const { data, error } = await db.supabase.functions.invoke('admin-invite', { body: { acao: 'status_integracoes' } });
    if (error || !data || data.erro) throw new Error((data && data.erro) || (error && error.message) || 'sem resposta');
    cacheServidor = { quando, status: data.status || {} };
    ui.toast('Status das integrações atualizado.');
  } catch (e) {
    cacheServidor = { quando, erro: `Não foi possível consultar o servidor (${e.message}). Confira se a função admin-invite foi publicada.` };
    ui.toast('Não foi possível consultar o servidor.', { tipo: 'err' });
  }
  ctx.refresh();
}

export function mount(el, ctx) {
  const onClick = e => {
    if (e.target.closest('[data-m-int-verificar]')) { verificar(ctx); return; }
    const c = e.target.closest('[data-m-int-como]'); if (c) comoConfigurar(ctx, c.dataset.mIntComo);
  };
  el.addEventListener('click', onClick);
  if (ctx.db.mode === 'supabase' && !cacheServidor) verificar(ctx);
  return () => el.removeEventListener('click', onClick);
}
