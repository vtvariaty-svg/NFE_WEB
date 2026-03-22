const https = require('https');
const fs = require('fs');

https.get('https://dev.nuvemfiscal.com.br/docs/api/swagger.json', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const j = JSON.parse(data);
        const properties = j.components?.schemas?.['Nfe.DTO.TnfePedidoEmissao']?.properties;
        console.log(properties ? Object.keys(properties) : 'Not found');
    });
}).on('error', (e) => {
    console.error(e.message);
});
