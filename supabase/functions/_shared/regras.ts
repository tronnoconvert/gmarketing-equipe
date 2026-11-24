// _shared/regras.ts — avaliação pura das 7 regras essenciais (sem I/O; testável com dados do modo demonstração).
import type { Obj } from './supa.ts';

export type Achado = { regraId: string; refCol: string; refId: string; titulo: string; detalhe: string; link: string; respTeam?: string | null };
const DIA = 864e5;
const n = (v: unknown) => (typeof v === 'number' ? v : v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const data = (v: unknown) => { if (!v) return null; const d = new Date(String(v).length === 10 ? `${v}T12:00:00` : String(v)); return isNaN(d.getTime()) ? null : d; };
const brl = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
const p = (r: Obj, k: string, padrao: number) => n((r.params as Record<string, unknown> | undefined)?.[k]) ?? padrao;
const aberta = (s: unknown) => !/pag|quit|cancel/i.test(String(s ?? ''));
const feita = (t: Obj) => t.feito === true || t.concluida === true || /feit|conclu|entreg|done/i.test(String(t.status ?? ''));

/** avalia as 7 regras essenciais sobre os dados da org (nomes de campos tolerantes às variações dos módulos) */
export function avaliar(regras: Obj[], d: Record<string, Obj[]>, agora = Date.now()): Achado[] {
  const out: Achado[] = [];
  const cli = new Map(d.clients.map((c) => [c.id, c]));
  const nomeCli = (id: unknown) => String(cli.get(String(id))?.nome ?? id);
  for (const r of regras) {
    if (r.ativo === false) continue;
    switch (r.id) {
      case 'rg-mrr-score': { // cliente de MRR alto com score caindo
        const mrrMin = p(r, 'mrrMin', 10000), queda = p(r, 'queda', 15);
        for (const c of d.clients) {
          if (c.ativo === false || (n(c.mrr) ?? 0) < mrrMin) continue;
          const tend = Array.isArray(c.tendencia) ? (c.tendencia as unknown[]).map(n).filter((x): x is number => x !== null) : [];
          const h = n(c.health) ?? tend[tend.length - 1]; const delta = n(c.delta30) ?? (tend.length && h !== null ? h - tend[0] : null);
          if (h !== null && delta !== null && -delta >= queda) out.push({ regraId: r.id, refCol: 'clients', refId: c.id, titulo: `${c.nome}: score caiu ${Math.round(-delta)} pts`, detalhe: `Health ${h} · MRR ${brl(n(c.mrr) ?? 0)}`, link: `#/clientes/${c.id}`, respTeam: c.respId as string });
        }
        break;
      }
      case 'rg-entrega': { // entrega atrasada > N dias
        const dias = p(r, 'dias', 2);
        const vistos = new Set<string>(); // tarefas e entregas podem espelhar o mesmo item
        for (const t of [...d.tasks, ...d.deliveries]) {
          const prazo = data(t.prazo); if (!prazo || feita(t)) continue;
          const k = `${t.clientId ?? ''}|${String(t.titulo ?? t.nome ?? t.id).toLowerCase()}`; if (vistos.has(k)) continue; vistos.add(k);
          const atraso = Math.floor((agora - prazo.getTime()) / DIA);
          if (atraso > dias) out.push({ regraId: r.id, refCol: d.tasks.includes(t) ? 'tasks' : 'deliveries', refId: t.id, titulo: `Entrega atrasada ${atraso} dias: ${t.titulo ?? t.nome ?? t.id}`, detalhe: t.clientId ? nomeCli(t.clientId) : 'Interna', link: d.tasks.includes(t) ? `#/operacao/quadro?tarefa=${t.id}` : '#/operacao', respTeam: (t.respId ?? t.responsavel) as string });
        }
        break;
      }
      case 'rg-fatura': { // fatura vencida > N dias
        const dias = p(r, 'dias', 7);
        for (const f of d.invoices) {
          const v = data(f.vencimento); if (!v || f.pagoEm || !aberta(f.status)) continue;
          const atraso = Math.floor((agora - v.getTime()) / DIA);
          if (atraso > dias) out.push({ regraId: r.id, refCol: 'invoices', refId: f.id, titulo: `Fatura vencida: ${f.cliente ?? nomeCli(f.clientId)}`, detalhe: `${brl(n(f.valor) ?? 0)} · ${atraso} dias em atraso`, link: `#/financeiro/receber?cobrar=${f.id}`, respTeam: cli.get(String(f.clientId))?.respId as string });
        }
        break;
      }
      case 'rg-torre': { // rotina ou integração vermelha
        for (const x of d.routines) if (x.estado === 'err') out.push({ regraId: r.id, refCol: 'routines', refId: x.id, titulo: `Rotina "${x.nome}" falhou`, detalhe: String(x.erro ?? 'Veja o log na Torre de Controle.'), link: `#/torre/rotina/${x.id}`, respTeam: (x.respId ?? x.resp) as string });
        for (const x of d.integrations) if (x.estado === 'err' && x.ativo !== false) out.push({ regraId: r.id, refCol: 'integrations', refId: x.id, titulo: `Integração ${x.nome} com erro`, detalhe: String(x.erro ?? x.detalhe ?? 'Reconecte em Torre › Integrações.'), link: '#/torre' });
        break;
      }
      case 'rg-ocupacao': { // pessoa acima de X% por N semanas
        const lim = p(r, 'limite', 100), sem = p(r, 'semanas', 2);
        for (const s of d.teamStats) {
          const hist = Array.isArray(s.historico) ? (s.historico as unknown[]).map((h) => n(typeof h === 'object' && h ? (h as Obj).ocupacao : h)).filter((x): x is number => x !== null) : [];
          const ult = hist.slice(-sem); const oc = n(s.ocupacao);
          if (oc !== null && oc > lim && (ult.length < sem || ult.every((x) => x > lim))) {
            const t = d.team.find((x) => x.id === s.teamId);
            out.push({ regraId: r.id, refCol: 'team', refId: String(s.teamId), titulo: `${t?.nome ?? s.teamId} em ${Math.round(oc)}% de ocupação`, detalhe: `${sem}+ semanas acima de ${lim}%`, link: `#/equipe/${s.teamId}?acao=redistribuir` });
          }
        }
        break;
      }
      case 'rg-renovacao': { // renovação < N dias sem reunião marcada
        const dias = p(r, 'dias', 30);
        for (const c of d.clients) {
          const ren = data(c.renova ?? c.renovacao); if (!ren || c.ativo === false) continue;
          const falta = Math.ceil((ren.getTime() - agora) / DIA);
          if (falta < 0 || falta > dias) continue;
          const reuniao = d.meetings.some((m) => m.clientId === c.id && (data(m.quando)?.getTime() ?? 0) >= agora - DIA && !/cancel/i.test(String(m.status ?? '')));
          if (!reuniao) out.push({ regraId: r.id, refCol: 'clients', refId: c.id, titulo: `${c.nome} renova em ${falta} dias`, detalhe: 'Nenhuma reunião de renovação marcada', link: `#/clientes/${c.id}?acao=agendar`, respTeam: c.respId as string });
        }
        break;
      }
      case 'rg-runway': { // runway < N meses
        const meses = p(r, 'meses', 3);
        const f = d.finance.find((x) => n(x.runway) !== null || n(x.runwayMeses) !== null || (n(x.caixa) !== null && n(x.custoFixo) !== null));
        const rw = f ? (n(f.runway) ?? n(f.runwayMeses) ?? ((n(f.caixa) ?? 0) / Math.max(1, n(f.custoFixo) ?? 1))) : null;
        if (rw !== null && rw < meses) out.push({ regraId: r.id, refCol: 'finance', refId: f!.id, titulo: `Runway de ${rw.toFixed(1).replace('.', ',')} meses`, detalhe: `Abaixo do mínimo de ${meses} meses`, link: '#/financeiro/caixa' });
        break;
      }
    }
  }
  return out;
}

