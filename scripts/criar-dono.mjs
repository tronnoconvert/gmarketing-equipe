#!/usr/bin/env node
// scripts/criar-dono.mjs — cria (uma vez) os primeiros acessos de Dono/Admin no Supabase, sem e-mail.
// Chama a Edge Function admin-invite (acao "bootstrap") com o segredo BOOTSTRAP_SECRET e mostra a senha provisória
// UMA vez. No primeiro acesso o app obriga a pessoa a criar a própria senha.
//
// Uso (no computador, na pasta do projeto):
//   BOOTSTRAP_SECRET='o-mesmo-valor-salvo-no-supabase' node scripts/criar-dono.mjs --nome "Gabriel Leão" --email gabriel@seudominio.com.br --papel dono
//   BOOTSTRAP_SECRET='...' node scripts/criar-dono.mjs --nome "Rayane Leão" --email rayane@seudominio.com.br --papel admin
//
// Regras do servidor: só funciona enquanto a agência tem menos de 2 donos/admins; rodar de novo com o mesmo e-mail
// (antes da pessoa criar a senha) gera outra senha provisória. Depois de criar os dois, apague o segredo
// BOOTSTRAP_SECRET em Supabase › Edge Functions › Secrets (o bootstrap fica desligado).
// URL e anon key vêm de public/config.js (valores públicos). Opcional: --url https://xxxx.supabase.co --anon eyJ... --org gmarketing
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, l) => (a.startsWith('--') ? [...acc, [a.slice(2), l[i + 1] && !l[i + 1].startsWith('--') ? l[i + 1] : 'true']] : acc), []));
const sair = (msg, cod = 1) => { console.error(msg); process.exit(cod); };

const cfg = fs.existsSync(path.join(ROOT, 'public/config.js')) ? fs.readFileSync(path.join(ROOT, 'public/config.js'), 'utf8') : '';
const doCfg = k => (cfg.match(new RegExp(`${k}:\\s*'([^']+)'`)) || [])[1];
const url = (args.url || process.env.SUPABASE_URL || doCfg('supabaseUrl') || '').replace(/\/$/, '');
const anon = args.anon || process.env.SUPABASE_ANON_KEY || doCfg('supabaseAnonKey');
const segredo = process.env.BOOTSTRAP_SECRET;
const { nome, email } = args; const papel = args.papel || 'dono';

if (!url || !anon) sair('Faltam supabaseUrl/supabaseAnonKey (public/config.js ou --url/--anon).');
if (!segredo) sair('Defina a variável BOOTSTRAP_SECRET com o mesmo valor salvo em Supabase › Edge Functions › Secrets.');
if (!nome || !email) sair('Uso: BOOTSTRAP_SECRET=... node scripts/criar-dono.mjs --nome "Nome Sobrenome" --email pessoa@dominio.com --papel dono|admin');
if (!['dono', 'admin'].includes(papel)) sair('--papel precisa ser dono ou admin.');

const res = await fetch(`${url}/functions/v1/admin-invite`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${anon}`, apikey: anon, 'Content-Type': 'application/json', 'x-bootstrap-secret': segredo },
  body: JSON.stringify({ acao: 'bootstrap', nome, email, papel, orgId: args.org || undefined }),
}).catch(e => sair(`Não foi possível conectar ao Supabase: ${e.message}`));
const out = await res.json().catch(() => ({}));
if (!res.ok || !out.senha) sair(`Erro ${res.status}: ${out.erro || JSON.stringify(out)}`);

if (args.json === 'true') { console.log(JSON.stringify(out)); process.exit(0); }
console.log(`\nAcesso ${out.reemitida ? '(senha provisória nova) ' : ''}de ${nome} (${papel}) pronto.`);
console.log(`  E-mail: ${email}`);
console.log(`  Senha provisória: ${out.senha}`);
console.log('\nEnvie a senha só para a pessoa (WhatsApp, mensagem privada). No primeiro acesso ela cria a própria senha.');
console.log('Esta senha não aparece de novo. Depois de criar os dois donos, apague BOOTSTRAP_SECRET no Supabase.\n');
