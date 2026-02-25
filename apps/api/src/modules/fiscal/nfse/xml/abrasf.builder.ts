import { create } from 'xmlbuilder2';
import { InvoiceRequestDTO } from '../adapters/base.adapter.js';

export class AbrasfXmlBuilder {

    /**
     * Builds an unsigned Recibo Provisório de Serviço (RPS) wrapped inside the typical ABRASF EnviarLoteRpsEnvio message.
     */
    static build(payload: InvoiceRequestDTO, companyInfo: any, rpsData: { serie: string; numero: number; dataEmissao: Date }) {
        const idRps = `RPS${rpsData.numero}`;

        // Example standard ABRASF structure
        const doc = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('EnviarLoteRpsEnvio', { xmlns: 'http://www.abrasf.org.br/nfse.xsd' })
            .ele('LoteRps', { Id: 'LOTE1', versao: '2.01' })
            .ele('NumeroLote').txt('1').up()
            .ele('Cnpj').txt(companyInfo.document.replace(/\D/g, '')).up()
            .ele('InscricaoMunicipal').txt(companyInfo.im || '').up()
            .ele('QuantidadeRps').txt('1').up()
            .ele('ListaRps')
            .ele('Rps')
            .ele('InfDeclaracaoPrestacaoServico', { Id: idRps })
            .ele('Rps')
            .ele('IdentificacaoRps')
            .ele('Numero').txt(rpsData.numero.toString()).up()
            .ele('Serie').txt(rpsData.serie).up()
            .ele('Tipo').txt('1').up()
            .up()
            .ele('DataEmissao').txt(rpsData.dataEmissao.toISOString().split('T')[0]).up()
            .ele('Status').txt('1').up() // Normal
            .up() // Rps End
            .ele('Competencia').txt(rpsData.dataEmissao.toISOString().split('T')[0]).up()
            .ele('Servico')
            .ele('Valores')
            .ele('ValorServicos').txt(payload.servico.valores.valorServicos.toFixed(2)).up()
            .ele('ValorDeducoes').txt(payload.servico.valores.valorDeducoes.toFixed(2)).up()
            .ele('ValorPis').txt('0.00').up()
            .ele('ValorCofins').txt('0.00').up()
            .ele('ValorInss').txt('0.00').up()
            .ele('ValorIr').txt('0.00').up()
            .ele('ValorCsll').txt('0.00').up()
            .ele('OutrasRetencoes').txt('0.00').up()
            .ele('ValorIss').txt(payload.servico.valores.valorIss.toFixed(2)).up()
            .ele('Aliquota').txt(payload.servico.valores.aliquota.toFixed(2)).up()
            .ele('DescontoIncondicionado').txt(payload.servico.valores.descontoIncondicionado.toFixed(2)).up()
            .ele('DescontoCondicionado').txt(payload.servico.valores.descontoCondicionado.toFixed(2)).up()
            .up()
            .ele('IssRetido').txt(payload.servico.valores.issRetido ? '1' : '2').up()
            .ele('ItemListaServico').txt(payload.servico.itemListaServico || '01.01').up()
            .ele('CodigoTributacaoMunicipio').txt(payload.servico.codigoServicoMunicipal || '').up()
            .ele('Discriminacao').txt(payload.servico.descricao).up()
            .ele('CodigoMunicipio').txt(payload.servico.cmunIncidencia).up()
            .up() // Servico End
            .ele('Prestador')
            .ele('Cnpj').txt(companyInfo.document.replace(/\D/g, '')).up()
            .ele('InscricaoMunicipal').txt(companyInfo.im || '').up()
            .up()
            .ele('Tomador')
            .ele('IdentificacaoTomador')
            .ele('CpfCnpj')
            // Handle CPF or CNPJ format conditionally based on length
            .ele(payload.tomador.documento.length > 11 ? 'Cnpj' : 'Cpf').txt(payload.tomador.documento.replace(/\D/g, '')).up()
            .up()
            .up()
            .ele('RazaoSocial').txt(payload.tomador.nomeRazao).up()
            .ele('Endereco')
            .ele('Endereco').txt(payload.tomador.endereco.logradouro).up()
            .ele('Numero').txt(payload.tomador.endereco.numero).up()
            .ele('Complemento').txt(payload.tomador.endereco.complemento || '').up()
            .ele('Bairro').txt(payload.tomador.endereco.bairro).up()
            .ele('CodigoMunicipio').txt(payload.tomador.endereco.cmun).up()
            .ele('Uf').txt(payload.tomador.endereco.uf).up()
            .ele('Cep').txt(payload.tomador.endereco.cep.replace(/\D/g, '')).up()
            .up() // Endereco End
            .ele('Contato')
            .ele('Telefone').txt(payload.tomador.telefone?.replace(/\D/g, '') || '').up()
            .ele('Email').txt(payload.tomador.email || '').up()
            .up() // Contato End
            .up() // Tomador End
            .up(); // InfDeclaracaoPrestacaoServico End

        return { idRps, xml: doc.end({ prettyPrint: true }) };
    }
}
