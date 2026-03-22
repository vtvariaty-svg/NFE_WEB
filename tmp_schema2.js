const https = require('https');
https.get('https://dev.nuvemfiscal.com.br/docs/api/swagger.json', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const j = JSON.parse(data);
        const schemas = Object.keys(j.components?.schemas || {});
        
        // Find which schema corresponds to TnfePedidoEmissao
        const match = schemas.find(s => s.includes('PedidoEmissao'));
        console.log("Schema achado:", match);
        
        if (match) {
            console.log(Object.keys(j.components.schemas[match].properties).slice(0, 50));
        } else {
            console.log("Nenhum match.");
        }
    });
});
