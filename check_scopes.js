const fs = require('fs');
const swagger = JSON.parse(fs.readFileSync('nuvem.json', 'utf8'));

console.log('Scopes for /empresas/{cpf_cnpj}/certificado PUT:');
const endpoint = swagger.paths['/empresas/{cpf_cnpj}/certificado']?.put;
if (endpoint) {
    console.log(JSON.stringify(endpoint.security, null, 2));
}

console.log('\nScopes for /empresas POST:');
const epEmpresas = swagger.paths['/empresas']?.post;
if (epEmpresas) {
    console.log(JSON.stringify(epEmpresas.security, null, 2));
}
