// Copia o motor do Guardião (src/shared/guardiao.js, fonte única) para dentro da Edge Function (o deploy do Supabase
// só envia supabase/functions/**). Rode depois de editar o motor:  node supabase/functions/guardiao/sync-motor.mjs
// tests/guardiao.spec.mjs falha se a cópia estiver desatualizada.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const aqui = path.dirname(fileURLToPath(import.meta.url));
const fonte = fs.readFileSync(path.resolve(aqui, '../../../src/shared/guardiao.js'), 'utf8');
fs.writeFileSync(path.join(aqui, 'motor.js'), '// GERADO por sync-motor.mjs a partir de src/shared/guardiao.js — NÃO EDITE AQUI.\n' + fonte);
console.log('motor.js atualizado (' + fonte.length + ' bytes)');
