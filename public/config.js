// config.js — configuração de PRODUÇÃO do Gmarketing (projeto Supabase gmarketing-equipe, ref hzonfbqsjxiwfmjywdlw).
// Estes valores são PÚBLICOS por design: a anon key só abre o que o RLS do banco libera para quem está logado.
// NUNCA coloque aqui a service_role key, tokens do Meta/monday/Windsor/WhatsApp ou qualquer segredo.
// Modo demonstração: `AOS_DEMO=1 npm run build` (os testes fazem isso) troca este arquivo por um vazio no dist/,
// e o arquivo único de prévia (dist/agencia-os.html) nunca carrega este arquivo — os dois rodam com dados fictícios.
window.AOS_CONFIG = Object.assign({
  supabaseUrl: 'https://hzonfbqsjxiwfmjywdlw.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6b25mYnFzanhpd2Ztanl3ZGx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1NTkyMjYsImV4cCI6MjExMTEzNTIyNn0.KHerQwyKmT52WOKs3ZeSXjyg_oZCihQ0LJTF-c4ziS4',
  orgId: 'gmarketing',
  seedDemo: false,   // produção começa vazia: nada de dados fictícios no banco real
  realtime: true,
}, window.AOS_CONFIG || {});
