// tests/live/mfa.mjs — teste REAL da verificação em duas etapas (TOTP) contra a produção: dono temporário, enroll, verify (aal2),
// novo login fica aal1, RPC continua ok, código errado recusado; apaga tudo. Uso: NODE_USE_ENV_PROXY=1 node tests/live/mfa.mjs
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
const REF='hzonfbqsjxiwfmjywdlw', SUPA=`https://${REF}.supabase.co`;
const ANON=(readFileSync(new URL('../../public/config.js', import.meta.url),'utf8').match(/supabaseAnonKey:\s*'([^']+)'/)||[])[1];
const lit=v=>`'${String(v).replace(/'/g,"''")}'`;
const sql=async q=>{const r=await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`,{method:'POST',headers:{Authorization:'Bearer proxy-injected','Content-Type':'application/json'},body:JSON.stringify({query:q})});const t=await r.text();if(!r.ok)throw new Error(t);return JSON.parse(t)};
const b32=s=>{const A='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of s.replace(/=+$/,''))bits+=A.indexOf(c).toString(2).padStart(5,'0');const o=[];for(let i=0;i+8<=bits.length;i+=8)o.push(parseInt(bits.slice(i,i+8),2));return Buffer.from(o)};
const totp=sec=>{const c=Buffer.alloc(8);c.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',b32(sec)).update(c).digest();const o=h[19]&15;return String((h.readUInt32BE(o)&0x7fffffff)%1e6).padStart(6,'0')};
const jwtAal=t=>JSON.parse(Buffer.from(t.split('.')[1],'base64url').toString()).aal;
const SUF=randomBytes(4).toString('hex'),ORG=`mfa-${SUF}`,id=randomUUID(),email=`mfa-${SUF}@mfa-teste.invalid`,senha=`Mfa-${randomBytes(10).toString('hex')}-9z`;
let ok=0,n=0;const ck=(m,c,d='')=>{n++;if(c)ok++;console.log(`${c?'✓':'✗'} ${m} ${d}`)};
try{
await sql(`begin; insert into public.orgs(id,nome) values(${lit(ORG)},'MFA teste');
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change) values ('00000000-0000-0000-0000-000000000000',${lit(id)},'authenticated','authenticated',${lit(email)},extensions.crypt(${lit(senha)},extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
insert into auth.identities (id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values (gen_random_uuid(),${lit(id)},${lit(id)},jsonb_build_object('sub',${lit(id)},'email',${lit(email)}),'email',now(),now(),now());
insert into public.profiles(user_id,org_id,papel,team_id,app_user_id,ativo) values(${lit(id)},${lit(ORG)},'dono','t-mfa','u-mfa',true); commit;`);
const login=async()=>(await (await fetch(`${SUPA}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:ANON,'Content-Type':'application/json'},body:JSON.stringify({email,password:senha})})).json()).access_token;
const api=(p,tok,body)=>fetch(`${SUPA}/auth/v1/${p}`,{method:'POST',headers:{apikey:ANON,Authorization:`Bearer ${tok}`,'Content-Type':'application/json'},body:JSON.stringify(body||{})}).then(async r=>({s:r.status,j:await r.json().catch(()=>null)}));
let t=await login(); ck('login senha = aal1',jwtAal(t)==='aal1');
const en=await api('factors',t,{factor_type:'totp',friendly_name:'Teste'}); ck('enroll TOTP devolve QR SVG',en.s===200&&/<svg/.test(en.j.totp.qr_code),en.s+' '+String(en.j.totp&&en.j.totp.qr_code).slice(0,30));
const ch=await api(`factors/${en.j.id}/challenge`,t); const vf=await api(`factors/${en.j.id}/verify`,t,{challenge_id:ch.j.id,code:totp(en.j.totp.secret)});
ck('verify com código do app -> aal2',vf.s===200&&jwtAal(vf.j.access_token)==='aal2');
t=await login(); ck('novo login com senha fica aal1 (app pede código)',jwtAal(t)==='aal1');
const rpc=await fetch(`${SUPA}/rest/v1/rpc/ler_records`,{method:'POST',headers:{apikey:ANON,Authorization:`Bearer ${vf.j.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({p_apos:'',p_limite:5})});
ck('RPC ler_records continua funcionando em aal2',rpc.status===200,`HTTP ${rpc.status}`);
const ch2=await api(`factors/${en.j.id}/challenge`,t); const bad=await api(`factors/${en.j.id}/verify`,t,{challenge_id:ch2.j.id,code:'000000'}); ck('código errado recusado',bad.s>=400);
}catch(e){console.error(e.message);n++}
finally{await sql(`begin; delete from public.records where org_id=${lit(ORG)}; delete from public.profiles where org_id=${lit(ORG)}; delete from auth.users where email like '%@mfa-teste.invalid'; delete from public.orgs where id=${lit(ORG)}; commit;`);
const c=await sql(`select (select count(*) from auth.users where email like '%@mfa-teste.invalid') u,(select count(*) from auth.mfa_factors f where not exists(select 1 from auth.users x where x.id=f.user_id)) f`);ck('limpeza',c[0].u==0&&c[0].f==0,JSON.stringify(c[0]));}
console.log(`${ok}/${n}`);
