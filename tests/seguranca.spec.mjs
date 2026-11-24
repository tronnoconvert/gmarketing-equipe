// tests/seguranca.spec.mjs — Guardião de segurança ponta a ponta: invasão simulada na Torre (iframe) → alerta SUPREMO no app,
// banner em tela cheia + sirene para gestor de tráfego, dono e admin (não para produção), banner fica até alguém assumir,
// "Assumir incidente" para a sirene de todos, reincidência reabre, liberação com SIM + checklist reativa na Torre.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const SHOTS = process.env.SHOTS || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'shots-seguranca');

export const viewports = [[1366, 900], [390, 844]];

export default async function (t) {
  const { page, ok, step } = t;
  const shot = async n => { if (process.env.SHOTS !== '0') await page.screenshot({ path: path.join(SHOTS, `${n}-${t.vp.w}.png`) }).catch(() => {}); };
  const entrar = async email => {
    await t.sair();
    await page.fill('#lg-email', email); await page.fill('#lg-senha', 'demo123'); await page.click('.lg-go');
    await page.waitForSelector('#view', { timeout: 5000 }); await page.waitForTimeout(250);
  };
  const sir = () => page.evaluate(() => window.AOS_SIRENE.estado());
  const banner = () => page.$('#aos-inv');
  const torre = async () => {
    await page.waitForFunction(() => { const f = document.querySelector('.m-torre-voo-host iframe'); try { return f.contentWindow.Guardiao && f.contentDocument.querySelector('#board'); } catch (e) { return false; } }, null, { timeout: 10000 });
    return page.frames().find(f => /torre-controle/.test(f.url()));
  };

  step('dono simula invasão na Torre');
  await t.login();
  ok(await page.evaluate(() => !!window.AOS_INVASAO && !!window.AOS_SIRENE), 'módulos de invasão e sirene carregados');
  ok(!(await banner()), 'sem incidente, sem banner');
  await t.ir('#/torre/voo');
  let fr = await torre();
  await page.waitForTimeout(300);
  ok(await fr.evaluate(() => !!document.querySelector('[data-gt="simular"]')), 'Torre mostra "Simular invasão" para o dono (papel enviado pelo app)');
  const contaId = await fr.evaluate(() => { const b = document.querySelector('[data-gt="simular"]'); const id = +b.dataset.a; b.click(); return id; });
  await page.waitForSelector('#aos-inv', { timeout: 4000 });
  await page.waitForTimeout(200);
  const txt = await page.textContent('#aos-inv');
  ok(/POSSÍVEL INVASÃO — Conta .+ pausada automaticamente/.test(txt), 'banner "POSSÍVEL INVASÃO — Conta … pausada automaticamente"');
  ok(/O que foi detectado/.test(txt) && /O que foi pausado/.test(txt) && /Assumir incidente/.test(txt) && /Ver detalhes/.test(txt) && /Silenciar neste aparelho/.test(txt), 'banner com detectado, pausado e os 3 botões');
  ok((await sir()).tocando, 'sirene tocando para o dono');
  const reg = await page.evaluate(() => {
    const db = window.AOS.db; const a = db.list('alerts', x => x.tipo === 'invasao')[0];
    const n = db.list('notifications', x => x.tipo === 'invasao' && x.prioridade === 'critica' && x.refId === (a && a.id)).map(x => x.para).sort();
    return { a: a && { area: a.area, sev: a.severidade, inc: a.incidente.estado, pausados: a.incidente.pausados.length }, n, run: db.list('routineRuns', r => r.routineId === 'r-guardiao' && r.incidenteId === (a && a.id)).length };
  });
  ok(reg.a && reg.a.area === 'Segurança' && reg.a.sev === 'err' && reg.a.inc === 'aberto' && reg.a.pausados >= 2, `alerta de segurança gravado (${JSON.stringify(reg.a)})`);
  ok(reg.n.includes('u-ana') && reg.n.includes('u-gabriel') && reg.n.includes('u-rayane') && !reg.n.includes('u-carla') && !reg.n.includes('u-bruno'), `notificação crítica para gestores + dono + admin, não para produção/CS (${reg.n})`);
  ok(reg.run === 1, 'execução registrada na rotina Guardião de segurança');
  ok(await fr.evaluate(id => gtQ(conta(id)) && conta(id).camps.every(c => c.status === 'Pausada'), contaId), 'conta da Torre pausada e em quarentena');
  await shot('banner');

  step('banner fica até alguém assumir');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok(!!(await banner()), 'Esc não fecha o alerta supremo');
  await page.click('[data-inv-detalhes]'); await page.waitForTimeout(100);
  ok(await page.isVisible('#aos-inv .inv-det'), '"Ver detalhes" mostra próximos passos');
  await page.click('[data-inv-silenciar]'); await page.waitForTimeout(100);
  ok(!(await sir()).tocando && !!(await banner()), 'silenciar para só a sirene deste aparelho; o banner continua');
  await t.ir('#/cockpit'); await page.reload(); await page.waitForSelector('#view'); await page.waitForTimeout(300);
  ok(!!(await banner()) && !(await sir()).tocando, 'recarregou: banner volta, silêncio local mantido');

  step('gestora de tráfego e admin recebem; produção não');
  await entrar('ana@agencia.demo');
  ok(!!(await banner()) && (await sir()).tocando, 'Ana (gestora de tráfego): banner + sirene');
  await entrar('rayane@agencia.demo');
  ok(!!(await banner()) && (await sir()).tocando, 'Rayane (admin): banner + sirene');
  await entrar('carla@agencia.demo');
  ok(!(await banner()) && !(await sir()).tocando, 'Carla (produção): sem banner e sem sirene');
  ok(!(await page.$('#aos-inv-fx')), 'produção também não vê a faixa de quarentena');

  step('assumir para a sirene de todos');
  await entrar('ana@agencia.demo');
  await page.click('[data-inv-assumir]'); await page.waitForTimeout(250);
  ok(!(await banner()) && !(await sir()).tocando, 'Ana assumiu: banner some e sirene para');
  ok(await page.isVisible('#aos-inv-fx') && /assumido por Ana/i.test(await page.textContent('#aos-inv-fx')), 'faixa "em quarentena · assumido por Ana"');
  ok(await page.evaluate(() => window.AOS.db.list('notifications', n => n.subtipo === 'assumido' && n.para === 'u-gabriel').length === 1), 'dono avisado de quem assumiu');
  await entrar('gabriel@agencia.demo');
  ok(!(await banner()) && !(await sir()).tocando, 'para o dono também: sem banner e sem sirene depois de assumido');
  await shot('faixa');

  step('reincidência reabre o alerta');
  await t.ir('#/torre/voo'); fr = await torre(); await page.waitForTimeout(400);
  ok(await fr.evaluate(id => gtQ(conta(id)), contaId), 'Torre continua em quarentena');
  await fr.evaluate(id => { S.open = id; render(); }, contaId); await page.waitForTimeout(150);
  await fr.evaluate(() => document.querySelector('[data-gt="reativar"]').click());
  await page.waitForSelector('#aos-inv', { timeout: 7000 });
  ok(/REINCIDÊNCIA/.test(await page.textContent('#aos-inv')) && (await sir()).tocando, 'reativação pelo invasor → pausa de novo, banner "REINCIDÊNCIA" e sirene (mesmo quem silenciou antes)');
  ok(await fr.evaluate(id => conta(id).camps.every(c => c.status === 'Pausada'), contaId), 'Torre pausou de novo');
  await page.click('[data-inv-assumir]'); await page.waitForTimeout(250);

  step('Alertas: incidente, regra e liberação com SIM + checklist');
  await t.ir('#/alertas');
  ok(await page.isVisible('.m-alertas-i.is-seg') && /Segurança/.test(await page.textContent('.m-alertas-i.is-seg')), 'incidente no feed com área Segurança');
  await t.ir('#/alertas/regras');
  ok(/Possível invasão \(pausa automática\)/.test(await page.textContent('#view')), 'regra "Possível invasão (pausa automática)" em Regras');
  await shot('regras');
  await page.click('[data-seg-editar]'); await page.waitForSelector('.m-alertas-sege');
  await page.fill('[name="gasto-pico:fator"]', '0'); await page.click('.mbox [data-ok]'); await page.waitForTimeout(150);
  ok(await page.isVisible('.mb-err') && /Corrija/.test(await page.textContent('.mb-err')), 'limite inválido é recusado com mensagem');
  await page.fill('[name="gasto-pico:fator"]', '6'); await page.click('.mbox [data-ok]'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => (window.AOS.db.config('guardiaoRegras', {})['gasto-pico'] || {}).params.fator === 6), 'limites gravados em settings guardiaoRegras');
  ok(await fr.evaluate(() => GT.regras['gasto-pico'] && GT.regras['gasto-pico'].params.fator === 6), 'Torre recebeu os limites novos');
  const incId = await page.evaluate(() => window.AOS.db.list('alerts', x => x.tipo === 'invasao')[0].id);
  await t.ir(`#/alertas?incidente=${incId}`); await page.waitForSelector('.inv-dr', { timeout: 3000 });
  ok(/Antes do incidente/.test(await page.textContent('.inv-dr')), 'gaveta do incidente com orçamento antes → no incidente');
  await shot('gaveta');
  await page.evaluate(() => document.querySelectorAll('.toasts > *, .toast').forEach(x => x.remove()));
  await page.click('[data-inv-liberar]'); await page.waitForSelector('.inv-sq');
  await page.fill('input[name="sim"]', 'SIM'); await page.click('.mbox [data-ok]'); await page.waitForTimeout(150);
  ok(/Confirme todos os itens/.test(await page.textContent('.mb-err')), 'checklist obrigatório');
  await page.$$eval('input[name="ck"]', l => l.forEach(x => { x.checked = true; }));
  await page.fill('input[name="sim"]', 'sim'); await page.click('.mbox [data-ok]'); await page.waitForTimeout(150);
  ok(/SIM/.test(await page.textContent('.mb-err')), '"sim" minúsculo recusado');
  await shot('liberar');
  await page.fill('input[name="sim"]', 'SIM'); await page.click('.mbox [data-ok]'); await page.waitForTimeout(400);
  const fim = await page.evaluate(id => { const a = window.AOS.db.get('alerts', id); return { est: a.incidente.estado, res: a.resolvido, reat: (a.incidente.reativadas || []).length }; }, incId);
  ok(fim.est === 'encerrado' && fim.res && fim.reat >= 1, `incidente encerrado com campanhas reativadas (${JSON.stringify(fim)})`);
  ok(!(await page.$('#aos-inv-fx')), 'faixa de quarentena some');
  const tr = await fr.evaluate(id => ({ q: gtQ(conta(id)), ativas: conta(id).camps.filter(c => c.status !== 'Pausada').map(c => c.nome) }), contaId);
  ok(!tr.q && tr.ativas.length >= 1 && !tr.ativas.some(n => /NOVA/.test(n)), `Torre liberada: reativou só as campanhas da conta, não a do invasor (${tr.ativas.length})`);

  step('gestor de tráfego não libera');
  await entrar('ana@agencia.demo');
  await page.evaluate(() => { const i = window.AOS.db.list('alerts', x => x.tipo === 'invasao')[0]; window.AOS.db.update('alerts', i.id, { incidente: { ...i.incidente, estado: 'assumido' } }); });
  await page.evaluate(id => window.AOS_INVASAO.abrirIncidente(id), incId); await page.waitForSelector('.inv-dr');
  ok(await page.$eval('[data-inv-liberar]', b => b.disabled), '"Liberar conta…" desabilitado para gestora de tráfego');
  await page.keyboard.press('Escape');
}
