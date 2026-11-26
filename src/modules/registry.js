// registry.js — módulos na ordem do menu. Cada módulo exporta default { id, titulo, icone, grupo, rota, routes, render, mount?, contador?, busca? }.
import mesa from './mesa/index.js';
import cockpit from './cockpit/index.js';
import financeiro from './financeiro/index.js';
import clientes from './clientes/index.js';
import operacao from './operacao/index.js';
import equipe from './equipe/index.js';
import torre from './torre/index.js';
import comercial from './comercial/index.js';
import alertas from './alertas/index.js';
import webinars from './webinars/index.js';
import campanha from './campanha/index.js';
import notificacoes from './notificacoes/index.js';
import padroes from './padroes/index.js';
import admin from './admin/index.js';
import conta from './conta/index.js';

export default [mesa, cockpit, financeiro, clientes, operacao, equipe, torre, comercial, alertas, webinars, campanha, notificacoes, padroes, admin, conta];
