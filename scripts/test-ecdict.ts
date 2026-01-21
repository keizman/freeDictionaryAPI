/**
 * Test Script for ECDICT Module
 * Verifies the TypeScript port works correctly
 */

import ECDictDB, { parseExchange, parsePos, parseTag, stripWord } from '../src/modules/ecdict';

const DB_PATH = './data/ecdict.db';

async function test() {
    console.log('='.repeat(60));
    console.log('ECDICT Module Test');
    console.log('='.repeat(60));
    console.log('');

    // Test stripWord
    console.log('1. Testing stripWord()');
    console.log(`   stripWord("Hello, World!") => "${stripWord("Hello, World!")}"`);
    console.log(`   stripWord("long-time") => "${stripWord("long-time")}"`);
    console.log(`   stripWord("it's") => "${stripWord("it's")}"`);
    console.log('');

    // Test parseExchange
    console.log('2. Testing parseExchange()');
    const exchange = parseExchange('d:perceived/p:perceived/3:perceives/i:perceiving');
    console.log(`   Input: "d:perceived/p:perceived/3:perceives/i:perceiving"`);
    console.log(`   Output:`, JSON.stringify(exchange, null, 4));
    console.log('');

    // Test parsePos
    console.log('3. Testing parsePos()');
    const pos = parsePos('n:46/v:54');
    console.log(`   Input: "n:46/v:54"`);
    console.log(`   Output:`, JSON.stringify(pos));
    console.log('');

    // Test parseTag
    console.log('4. Testing parseTag()');
    const tag = parseTag('zk gk cet4 cet6 toefl');
    console.log(`   Input: "zk gk cet4 cet6 toefl"`);
    console.log(`   Output:`, JSON.stringify(tag));
    console.log('');

    // Open database
    console.log('5. Opening database...');
    const db = new ECDictDB(DB_PATH, true);
    console.log(`   Word count: ${db.count().toLocaleString()}`);
    console.log('');

    // Test query
    console.log('6. Testing query()');
    const testWords = ['hello', 'package', 'run', 'beautiful', 'nonexistentword123'];
    for (const word of testWords) {
        const result = db.query(word);
        if (result) {
            console.log(`   "${word}": found`);
            console.log(`      phonetic: ${result.phonetic}`);
            console.log(`      translation: ${result.translation?.substring(0, 60)}...`);
            console.log(`      exchange: ${result.exchange || '(none)'}`);
            if (result.exchange) {
                const parsed = parseExchange(result.exchange);
                console.log(`      parsed exchange:`, JSON.stringify(parsed));
            }
        } else {
            console.log(`   "${word}": NOT FOUND`);
        }
        console.log('');
    }

    // Test match
    console.log('7. Testing match()');
    const matches = db.match('pack', 5);
    console.log(`   Matching "pack" (limit 5):`);
    for (const m of matches) {
        console.log(`      ${m.id}: ${m.word}`);
    }
    console.log('');

    // Test isValidResult
    console.log('8. Testing isValidResult()');
    const validRecord = db.query('hello');
    const invalidRecord = db.query('nonexistentword123');
    console.log(`   isValidResult(query("hello")): ${db.isValidResult(validRecord)}`);
    console.log(`   isValidResult(query("nonexistent")): ${db.isValidResult(invalidRecord)}`);
    console.log('');

    // Close
    db.close();

    console.log('='.repeat(60));
    console.log('All tests completed!');
    console.log('='.repeat(60));
}

test().catch(console.error);
