// config.js — configuração do Agência OS (opcional). Sem supabaseUrl/supabaseAnonKey o app roda em MODO DEMONSTRAÇÃO.
// Estes valores são públicos por design (protegidos por RLS). NUNCA coloque chaves secretas aqui.
window.AOS_CONFIG = Object.assign({
  // supabaseUrl: 'https://xxxx.supabase.co',
  // supabaseAnonKey: 'eyJ...',
  // orgId: 'minha-agencia',
  // seedDemo: false,      // true = semeia dados de exemplo no Supabase quando as coleções estiverem vazias
  // realtime: true,
  // dataVersion: '1',     // mude para forçar o reset dos dados locais do modo demonstração
}, window.AOS_CONFIG || {});
