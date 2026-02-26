"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Plus, Package } from "lucide-react";

export default function ProductsPage() {
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [name, setName] = useState("");
    const [price, setPrice] = useState("");
    const [sku, setSku] = useState("");

    // BR Fiscal Fields
    const [ncm, setNcm] = useState("");
    const [cest, setCest] = useState("");
    const [cfop, setCfop] = useState("");
    const [unit, setUnit] = useState("UN");
    const [icmsOrigin, setIcmsOrigin] = useState("0");
    const [icmsCst, setIcmsCst] = useState("");
    const [pisCst, setPisCst] = useState("");
    const [cofinsCst, setCofinsCst] = useState("");

    const fetchProducts = async () => {
        try {
            const res = await api.get("/products");
            setProducts(res.data.data);
        } catch (err) {
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProducts();
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post("/products", {
                name,
                price: parseFloat(price),
                sku,
                ncm, cest, cfop, unit, icmsOrigin, icmsCst, pisCst, cofinsCst
            });
            setIsModalOpen(false);
            setName(""); setPrice(""); setSku(""); setNcm(""); setCest("");
            setCfop(""); setUnit("UN"); setIcmsOrigin("0"); setIcmsCst("");
            setPisCst(""); setCofinsCst("");
            fetchProducts();
        } catch (err) {
            alert("Erro ao criar produto");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900">Produtos / Serviços</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Itens que serão listados nas suas notas
                    </p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 shadow-sm transition-colors"
                >
                    <Plus className="mr-2 h-4 w-4" /> Novo Produto
                </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden overflow-x-auto">
                {loading ? (
                    <div className="p-8 text-center text-slate-500">Carregando...</div>
                ) : products.length === 0 ? (
                    <div className="p-12 text-center">
                        <Package className="mx-auto h-12 w-12 text-slate-300" />
                        <h3 className="mt-2 text-sm font-semibold text-slate-900">Nenhum produto</h3>
                        <p className="mt-1 text-sm text-slate-500">Cadastre um produto para utilizar nas emissões.</p>
                    </div>
                ) : (
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Nome</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">SKU</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Preço</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {products.map((p) => (
                                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{p.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{p.sku || '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.price)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button className="text-slate-400 hover:text-slate-500">Editar</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-10 overflow-y-auto">
                    <div className="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 transition-opacity" onClick={() => setIsModalOpen(false)}>
                            <div className="absolute inset-0 bg-slate-900 opacity-75"></div>
                        </div>
                        <span className="hidden sm:inline-block sm:h-screen sm:align-middle">&#8203;</span>
                        <div className="inline-block transform overflow-hidden rounded-xl bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle p-6">
                            <h3 className="text-lg font-medium leading-6 text-slate-900 mb-4">Novo Produto</h3>
                            <form onSubmit={handleCreate} className="space-y-4">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="sm:col-span-2">
                                        <label className="block text-sm font-medium text-slate-700">Nome do Produto</label>
                                        <input type="text" required value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Preço (R$)</label>
                                        <input type="number" step="0.01" required value={price} onChange={e => setPrice(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Código SKU / Interno</label>
                                        <input type="text" value={sku} onChange={e => setSku(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Unidade (Ex: UN, KG)</label>
                                        <input type="text" required value={unit} onChange={e => setUnit(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border uppercase" />
                                    </div>

                                    <h4 className="sm:col-span-2 text-sm font-bold text-slate-900 mt-2 border-b pb-1">Tributação (NF-e)</h4>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">NCM</label>
                                        <input type="text" value={ncm} onChange={e => setNcm(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">CEST</label>
                                        <input type="text" value={cest} onChange={e => setCest(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">CFOP Padrão</label>
                                        <input type="text" value={cfop} onChange={e => setCfop(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" placeholder="5102, 6102" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Origem ICMS</label>
                                        <select value={icmsOrigin} onChange={e => setIcmsOrigin(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
                                            <option value="0">0 - Nacional</option>
                                            <option value="1">1 - Estrangeira Importação</option>
                                            <option value="2">2 - Estrangeira Interno</option>
                                        </select>
                                    </div>
                                    <div className="sm:col-span-2 grid grid-cols-3 gap-2">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700">ICMS CST/CSOSN</label>
                                            <input type="text" value={icmsCst} onChange={e => setIcmsCst(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" placeholder="102, 400" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700">PIS CST</label>
                                            <input type="text" value={pisCst} onChange={e => setPisCst(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" placeholder="99, 49" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700">COFINS CST</label>
                                            <input type="text" value={cofinsCst} onChange={e => setCofinsCst(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" placeholder="99, 49" />
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-5 sm:grid sm:grid-cols-2 sm:gap-3">
                                    <button type="submit" className="w-full rounded-md bg-blue-600 px-4 py-2 text-white">Salvar</button>
                                    <button type="button" onClick={() => setIsModalOpen(false)} className="w-full rounded-md border text-slate-700 mt-3 sm:mt-0">Cancelar</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
