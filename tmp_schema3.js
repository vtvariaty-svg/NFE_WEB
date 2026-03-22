const https = require('https');

const options = {
    hostname: 'dev.nuvemfiscal.com.br',
    path: '/docs/api/swagger.json',
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
    }
};

https.get(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const j = JSON.parse(data);
            const schema = j.components?.schemas?.['Nfe.DTO.TnfePedidoEmissao']?.properties;
            console.log('--- FOUND PROPERTIES ---');
            console.log(Object.keys(schema || {}));
        } catch (e) {
            console.log("PARSE ERROR. Length:", data.length);
            console.log(data.slice(0, 500));
        }
    });
}).on('error', (e) => {
    console.error(e.message);
});
