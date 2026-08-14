/** LEITURA PURA — 3. como as OS realmente morrem: quem encerra, de onde, e depois de quanto. */
import fs from 'node:fs';
import admin from 'firebase-admin';
const sa = JSON.parse(fs.readFileSync('./.secrets/os-christus-firebase-adminsdk-fbsvc-e25b841b3e.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
const db = admin.firestore();
const toDate = v => (v?.toDate ? v.toDate() : v ? new Date(v) : null);
const dia = 86400000;

const snap = await db.collection('tickets').get();
const fechadas = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => !t.excludedFromMetrics && ['Encerrada', 'Cancelada'].includes(t.status));

const porQuem = new Map();
const deOnde = new Map();
const atrasos = [];

for (const t of fechadas) {
  const hist = Array.isArray(t.history) ? t.history : [];
  const fech = hist
    .filter(e => /->\s*(Encerrada|Cancelada)|OS cancelada por/i.test(String(e.text || '')))
    .map(e => ({ quando: toDate(e.time), quem: e.sender || '?', texto: String(e.text || '') }))
    .filter(x => x.quando)
    .sort((a, b) => b.quando - a.quando)[0];
  if (!fech) continue;

  porQuem.set(fech.quem, (porQuem.get(fech.quem) || 0) + 1);
  const origem = fech.texto.match(/via chat:\s*([^-]+?)\s*->/i);
  const de = origem ? origem[1].trim() : (/cancelada por/i.test(fech.texto) ? '(cancelamento)' : '?');
  deOnde.set(de, (deOnde.get(de) || 0) + 1);

  // Quanto tempo entre a última fala humana e o encerramento.
  const ultimaHumana = hist
    .filter(e => ['customer', 'internal', 'tech'].includes(String(e.type)))
    .map(e => toDate(e.time))
    .filter(Boolean)
    .sort((a, b) => b - a)[0];
  if (ultimaHumana) atrasos.push(Math.round((fech.quando - ultimaHumana) / dia));
}

console.log(`OS fechadas analisadas: ${fechadas.length}\n`);
console.log('QUEM ENCERRA:');
[...porQuem.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`   ${String(n).padStart(3)}  ${k}`));

console.log('\nDE QUAL ETAPA:');
[...deOnde.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`   ${String(n).padStart(3)}  ${k}`));

const positivos = atrasos.filter(n => n >= 0).sort((a, b) => a - b);
if (positivos.length) {
  const p = q => positivos[Math.floor(positivos.length * q)];
  console.log(`\nDIAS ENTRE A ÚLTIMA FALA E O ENCERRAMENTO (${positivos.length} OS):`);
  console.log(`   mediana ${p(0.5)} · 75% até ${p(0.75)} · máx ${positivos.at(-1)}`);
  console.log(`   encerradas no MESMO dia da última fala: ${positivos.filter(n => n === 0).length}`);
  console.log(`   encerradas 7+ dias depois: ${positivos.filter(n => n >= 7).length}`);
}

// A fila parada: idade na etapa das 97.
const paradas = snap.docs.map(d => d.data()).filter(t => !t.excludedFromMetrics && t.status === 'Aguardando Parecer Técnico');
const idades = paradas.map(t => Math.floor((Date.now() - (toDate(t.stageEnteredAt) || toDate(t.time) || new Date()).getTime()) / dia)).sort((a, b) => a - b);
if (idades.length) {
  const faixa = (min, max) => idades.filter(n => n >= min && n <= max).length;
  console.log(`\nAS ${idades.length} EM PARECER TÉCNICO, por tempo na etapa:`);
  console.log(`   0-7 dias   : ${faixa(0, 7)}`);
  console.log(`   8-15 dias  : ${faixa(8, 15)}`);
  console.log(`   16-30 dias : ${faixa(16, 30)}`);
  console.log(`   31-60 dias : ${faixa(31, 60)}`);
  console.log(`   60+ dias   : ${faixa(61, 9999)}`);
}
process.exit(0);
