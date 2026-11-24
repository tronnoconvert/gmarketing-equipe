// foto.js — foto do colaborador (campo `foto` do registro `team`, data URL 256×256 JPEG).
// Usado em Administração › Equipe (cadastro/edição) e no perfil da pessoa (botão da câmera no avatar).
// ui.avatar() já mostra `pessoa.foto` em todo o app; sem foto, ficam as iniciais.
import { ui } from '../../core/ui.js';
import { db } from '../../core/store.js';
import * as fmt from '../../core/fmt.js';

const TIPOS = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX = 8 * 1024 * 1024;

/** valida, recorta o centro em quadrado e reduz para 256×256 JPEG (usa ui.lerFoto quando o core oferece) */
export function lerFoto(file) {
  if (typeof ui.lerFoto === 'function') return ui.lerFoto(file);
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('Nenhum arquivo escolhido. Selecione uma foto.')); return; }
    if (!TIPOS.includes(String(file.type).toLowerCase())) { reject(new Error('Formato não suportado. Envie uma foto JPG, PNG ou WebP.')); return; }
    if (file.size > MAX) { reject(new Error('A foto tem mais de 8 MB. Escolha uma imagem menor ou reduza a resolução.')); return; }
    const url = URL.createObjectURL(file); const im = new Image();
    im.onload = () => {
      try {
        const s = Math.min(im.naturalWidth, im.naturalHeight); const cv = document.createElement('canvas'); cv.width = cv.height = 256;
        const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256);
        g.drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, 0, 0, 256, 256);
        resolve(cv.toDataURL('image/jpeg', 0.85));
      } catch (e) { reject(new Error('Não foi possível processar a imagem. Tente outra foto.')); } finally { URL.revokeObjectURL(url); }
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não conseguimos abrir esta imagem. Ela pode estar corrompida; tente outra.')); };
    im.src = url;
  });
}

const preview = (p, foto) => ui.avatar({ ...p, foto: foto || null, nome: p.nome || 'Nova pessoa', avatarCor: p.avatarCor || '#64748B' }, 72);

/** HTML do campo de foto (pré-visualização redonda + Enviar/Remover). p = registro team (ou {nome}) */
export function campoFotoHtml(p, foto) {
  return `<div class="m-eq-foto" data-foto-campo>
<div class="m-eq-foto-pv" data-foto-drop tabindex="-1" title="Arraste uma foto para cá">${preview(p, foto)}<span class="m-eq-foto-dz" aria-hidden="true">${ui.ic('upload')}</span></div>
<div class="m-eq-foto-a"><div class="row">
<label class="btn sm">${ui.ic('upload')}<span data-foto-rot>${foto ? 'Trocar foto' : 'Enviar foto'}</span><input type="file" accept="image/jpeg,image/png,image/webp" data-foto-file class="sr"></label>
<button type="button" class="btn sm ghost" data-foto-remover${foto ? '' : ' hidden'}>${ui.ic('trash')}<span>Remover foto</span></button></div>
<p class="fld-d">JPG, PNG ou WebP até 8 MB. Recortamos o centro em quadrado. Também dá para arrastar a imagem até o círculo.</p>
<p class="fld-err" role="alert" data-foto-err hidden></p></div></div>`;
}

/** liga os eventos do campo; estado = { foto } é atualizado no lugar. pessoa() devolve nome/cor atuais para a prévia */
export function ligarCampoFoto(raiz, estado, pessoa) {
  const box = raiz.querySelector('[data-foto-campo]'); if (!box) return;
  const err = box.querySelector('[data-foto-err]');
  const desenhar = () => {
    box.querySelector('[data-foto-drop]').innerHTML = `${preview(pessoa(), estado.foto)}<span class="m-eq-foto-dz" aria-hidden="true">${ui.ic('upload')}</span>`;
    box.querySelector('[data-foto-remover]').hidden = !estado.foto;
    box.querySelector('[data-foto-rot]').textContent = estado.foto ? 'Trocar foto' : 'Enviar foto';
  };
  const usar = async file => {
    err.hidden = true; box.classList.add('carregando');
    try { estado.foto = await lerFoto(file); estado.mudou = true; desenhar(); }
    catch (e) { err.innerHTML = `${ui.ic('alert-circle')}${fmt.esc(e.message || 'Não foi possível usar esta imagem.')}`; err.hidden = false; }
    finally { box.classList.remove('carregando'); }
  };
  box.querySelector('[data-foto-file]').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) usar(f); });
  box.querySelector('[data-foto-remover]').addEventListener('click', () => { estado.foto = null; estado.mudou = true; err.hidden = true; desenhar(); });
  const dz = box.querySelector('[data-foto-drop]');
  dz.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('arrastando'); });
  dz.addEventListener('dragleave', () => box.classList.remove('arrastando'));
  dz.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('arrastando'); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) usar(f); });
  estado.redesenhar = desenhar;
}

/** quem pode trocar a foto de teamId: a própria pessoa, ou dono/admin */
export function podeTrocarFoto(real, teamId) {
  if (!real) return false;
  return real.teamId === teamId || ['dono', 'admin'].includes(real.papel);
}

/** modal "Foto do perfil" (perfil em Equipe) — salva em team.foto, registra atividade, toast com Desfazer */
export async function trocarFoto(ctx, teamId) {
  const p = db.get('team', teamId); if (!p) return;
  const real = ctx.real || ctx.user;
  if (!podeTrocarFoto(real, teamId)) { ui.toast('Só a própria pessoa ou um administrador pode trocar esta foto.', { tipo: 'warn' }); return; }
  const eu = real.teamId === teamId;
  const estado = { foto: p.foto || null, mudou: false };
  const antes = p.foto || null;
  const ok = await ui.modal({
    titulo: eu ? 'Sua foto' : `Foto de ${p.nome}`, sub: 'Aparece no lugar das iniciais em todo o app (quadro da Operação, clientes, comentários).', largura: 'sm', confirmar: 'Salvar foto',
    corpo: campoFotoHtml(p, estado.foto),
    onAbrir: el => ligarCampoFoto(el, estado, () => p),
    onConfirmar: () => (estado.mudou ? true : 'Nada mudou. Envie uma foto ou remova a atual.'),
  });
  if (!ok) return;
  db.update('team', teamId, { foto: estado.foto }, { log: estado.foto ? (eu ? 'atualizou a própria foto' : `atualizou a foto de ${p.nome}`) : (eu ? 'removeu a própria foto' : `removeu a foto de ${p.nome}`) });
  ui.toast(estado.foto ? 'Foto salva. Ela já aparece no app.' : 'Foto removida. Voltamos às iniciais.', { desfazer: () => db.update('team', teamId, { foto: antes }) });
}
