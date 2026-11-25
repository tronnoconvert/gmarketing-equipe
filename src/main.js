// main.js — boot do Gmarketing: semente do core, registro dos módulos e início do shell.
import './core/seed-core.js';
import { db } from './core/store.js';
import { auth } from './core/auth.js';
import { perms } from './core/perms.js';
import { router } from './core/router.js';
import { ui } from './core/ui.js';
import { charts } from './core/charts.js';
import * as fmt from './core/fmt.js';
import { notify } from './core/notify.js';
import { shell } from './core/shell.js';
import { padroes } from './core/padroes/index.js';
import { paginaUI } from './core/ui-demo.js';
import modulos from './modules/registry.js';

modulos.forEach(m => shell.registrar(m));
shell.pagina('_ui', paginaUI);

// acesso pelo console (depuração e testes): window.AOS.db.list('clients')
window.AOS = { db, auth, perms, router, ui, charts, fmt, notify, shell, padroes, versao: '1.0.0' };

const iniciar = () => shell.iniciar({ root: document.getElementById('app') });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
