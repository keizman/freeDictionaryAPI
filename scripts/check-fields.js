// Check ECDICT field statistics
const db = require('better-sqlite3')('./data/ecdict.db');

console.log('='.repeat(50));
console.log('ECDICT Database Field Statistics');
console.log('='.repeat(50));

const total = db.prepare('SELECT COUNT(*) as c FROM stardict').get().c;
console.log(`\nTotal words: ${total.toLocaleString()}\n`);

const fields = [
    ['phonetic', 'phonetic IS NOT NULL AND phonetic != ""'],
    ['translation', 'translation IS NOT NULL AND translation != ""'],
    ['definition', 'definition IS NOT NULL AND definition != ""'],
    ['pos', 'pos IS NOT NULL AND pos != ""'],
    ['exchange', 'exchange IS NOT NULL AND exchange != ""'],
    ['tag', 'tag IS NOT NULL AND tag != ""'],
    ['collins > 0', 'collins > 0'],
    ['oxford = 1', 'oxford = 1'],
    ['bnc > 0', 'bnc > 0'],
    ['frq > 0', 'frq > 0'],
    ['detail', 'detail IS NOT NULL AND detail != ""'],
    ['audio', 'audio IS NOT NULL AND audio != ""'],
];

for (const [name, condition] of fields) {
    const count = db.prepare(`SELECT COUNT(*) as c FROM stardict WHERE ${condition}`).get().c;
    const pct = ((count / total) * 100).toFixed(1);
    console.log(`${name.padEnd(15)}: ${count.toLocaleString().padStart(12)} (${pct}%)`);
}

// Sample audio field
console.log('\n--- Sample records with audio field ---');
const withAudio = db.prepare('SELECT word, audio FROM stardict WHERE audio IS NOT NULL AND audio != "" LIMIT 5').all();
if (withAudio.length > 0) {
    withAudio.forEach(r => console.log(`  ${r.word}: ${r.audio}`));
} else {
    console.log('  (No records with audio URL found)');
}

// Sample detail field
console.log('\n--- Sample records with detail field ---');
const withDetail = db.prepare('SELECT word, detail FROM stardict WHERE detail IS NOT NULL AND detail != "" LIMIT 3').all();
if (withDetail.length > 0) {
    withDetail.forEach(r => console.log(`  ${r.word}: ${r.detail.substring(0, 100)}...`));
} else {
    console.log('  (No records with detail field found)');
}

db.close();
