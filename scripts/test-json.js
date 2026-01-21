// Quick test to verify JSON response is valid
const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/v2/entries/en/hello',
    method: 'GET'
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('✅ Valid JSON!');
            console.log('word:', json.word);
            console.log('source:', json.source);
            console.log('translations:', json.translations.length);
            console.log('definitions:', json.definitions.length);
            console.log('\nFull response:');
            console.log(JSON.stringify(json, null, 2));
        } catch (e) {
            console.log('❌ Invalid JSON:', e.message);
            console.log('Raw data:', data);
        }
    });
});

req.on('error', e => console.error('Request error:', e.message));
req.end();
