/**
 * Marca as OS que foram criadas/canceladas para TESTAR o sistema, e não para
 * registrar trabalho. Elas continuam existindo — só param de contar nas métricas.
 *
 * Origem concreta: 13 OS canceladas em 21/07 com "Motivo: Teste!" pelo Admin. No
 * gráfico de fluxo elas viravam a semana inteira — 13 das 14 saídas —, e um diretor
 * lendo aquilo concluiria que a equipe encerrou 14 demandas numa semana em que
 * encerrou uma.
 *
 * Por que uma MARCA no dado e não um filtro na tela: reconhecê-las exige ler o texto
 * do cancelamento, e texto escrito por gente dentro de regra de produto é defeito
 * esperando data. A leitura de texto acontece aqui, uma vez, sob revisão — a tela só
 * lê um booleano.
 *
 * Apagar não é opção: a OS cancelada é registro do que aconteceu, inclusive do teste.
 *
 *   node scripts/infra/marcar-os-de-teste.mjs           # ensaio (padrão)
 *   node scripts/infra/marcar-os-de-teste.mjs --apply   # grava
 *   node scripts/infra/marcar-os-de-teste.mjs --desfazer --apply
 */
import process from 'node:process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { resolveCredentialsPath, readServiceAccount } from './shared-auth.mjs';

const APLICAR = process.argv.includes('--apply');
const DESFAZER = process.argv.includes('--desfazer');

// Ancorado no cancelamento COM motivo de teste. Não basta a palavra "teste" solta:
// "trocar a bomba de teste de vazão" é trabalho de verdade.
const MOTIVO_DE_TESTE = /OS\s+cancelada\s+por[^.]*\.\s*Motivo:\s*teste[s!.\s]*$/i;

initializeApp({ credential: cert(readServiceAccount(resolveCredentialsPath())) });
const db = getFirestore();

const snap = await db.collection('tickets').get();
const alvos = [];

snap.forEach(doc => {
  const t = doc.data();
  if (DESFAZER) {
    if (t.excludedFromMetrics) alvos.push({ ref: doc.ref, id: doc.id, motivo: '(desmarcar)' });
    return;
  }
  if (t.excludedFromMetrics) return;
  const historico = Array.isArray(t.history) ? t.history : [];
  const marca = historico.find(entrada => MOTIVO_DE_TESTE.test(String(entrada?.text || '').trim()));
  if (marca) alvos.push({ ref: doc.ref, id: doc.id, motivo: String(marca.text).trim() });
});

console.log(`OS analisadas: ${snap.size}`);
console.log(`${DESFAZER ? 'marcadas a desmarcar' : 'a marcar como teste'}: ${alvos.length}\n`);
alvos.slice(0, 20).forEach(a => console.log(`  ${a.id}  ${a.motivo.slice(0, 70)}`));

if (!APLICAR) {
  console.log('\nENSAIO — nada foi gravado. Para aplicar: --apply');
  process.exit(0);
}

const lote = db.batch();
for (const alvo of alvos) {
  lote.update(alvo.ref, {
    excludedFromMetrics: DESFAZER ? FieldValue.delete() : true,
    excludedFromMetricsReason: DESFAZER ? FieldValue.delete() : 'Cancelada como teste do sistema',
  });
}
await lote.commit();
console.log(`\n${DESFAZER ? 'DESMARCADAS' : 'MARCADAS'}: ${alvos.length}`);
process.exit(0);
