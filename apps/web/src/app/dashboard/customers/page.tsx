"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Plus, Users } from "lucide-react";

interface Customer {
    id: string;
    name: string;
    document: string;
}

export default function CustomersPage() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [name, setName] = useState("");
    const [document, setDocument] = useState("");

    // BR Fiscal Fields
    const [type, setType] = useState("FISICA");
    const [ie, setIe] = useState("");
    const [im, setIm] = useState("");
    const [email, setEmail] = useState("");
    const [zipCode, setZipCode] = useState("");
    const [street, setStreet] = useState("");
    const [number, setNumber] = useState("");
    const [district, setDistrict] = useState("");
    const [city, setCity] = useState("");
    const [state, setState] = useState("");
    const [ibgeCode, setIbgeCode] = useState("");

    const fetchCustomers = async () => {
        try {
            const res = await api.get("/customers");
            setCustomers(res.data.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCustomers();
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post("/customers", {
                name, document, type, ie, im, email,
                zipCode, street, number, district, city, state, ibgeCode
            });
            setIsModalOpen(false);
            setName(""); setDocument(""); setType("FISICA"); setIe(""); setIm(""); setEmail("");
            setZipCode(""); setStreet(""); setNumber(""); setDistrict("");
            setCity(""); setState(""); setIbgeCode("");
            fetchCustomers();
        } catch (err) {
            alert("Erro ao criar cliente");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900">Clientes</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Gerencie as pessoas ou empresas para as quais você emite notas
                    </p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 shadow-sm transition-colors"
                >
                    <Plus className="mr-2 h-4 w-4" /> Novo Cliente
                </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden overflow-x-auto">
                {loading ? (
                    <div className="p-8 text-center text-slate-500">Carregando...</div>
                ) : customers.length === 0 ? (
                    <div className="p-12 text-center">
                        <Users className="mx-auto h-12 w-12 text-slate-300" />
                        <h3 className="mt-2 text-sm font-semibold text-slate-900">Nenhum cliente</h3>
                        <p className="mt-1 text-sm text-slate-500">Você ainda não castrou nenhum cliente.</p>
                    </div>
                ) : (
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                                    Nome
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                                    CPF/CNPJ
                                </th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                                    Ações
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {customers.map((c) => (
                                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-slate-900">{c.name}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-slate-500">{c.document}</div>
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
                    {/* Backdrop */}
                    <div className="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 transition-opacity" onClick={() => setIsModalOpen(false)}>
                            <div className="absolute inset-0 bg-slate-900 opacity-75"></div>
                        </div>
                        <span className="hidden sm:inline-block sm:h-screen sm:align-middle">&#8203;</span>
                        <div className="inline-block transform overflow-hidden rounded-xl bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle p-6">
                            <h3 className="text-lg font-medium leading-6 text-slate-900 mb-4">Novo Cliente</h3>
                            <form onSubmit={handleCreate} className="space-y-4">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="sm:col-span-2">
                                        <label className="block text-sm font-medium text-slate-700">Tipo de Contribuinte</label>
                                        <select value={type} onChange={e => setType(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
                                            <option value="FISICA">Pessoa Física (CPF)</option>
                                            <option value="JURIDICA">Pessoa Jurídica (CNPJ)</option>
                                            <option value="ESTRANGEIRO">Estrangeiro</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Nome / Razão Social</label>
                                        <input type="text" required value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">CPF / CNPJ</label>
                                        <input type="text" required value={document} onChange={e => setDocument(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Inscrição Estadual (IE)</label>
                                        <input type="text" placeholder="Deixe em branco se isento" value={ie} onChange={e => setIe(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Inscrição Municipal (IM)</label>
                                        <input type="text" value={im} onChange={e => setIm(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-sm font-medium text-slate-700">E-mail (Para enviar a NF)</label>
                                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <h4 className="sm:col-span-2 text-sm font-bold text-slate-900 mt-2 border-b pb-1">Endereço de Faturamento</h4>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">CEP</label>
                                        <input type="text" value={zipCode} onChange={e => setZipCode(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Logradouro / Rua</label>
                                        <input type="text" value={street} onChange={e => setStreet(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Número</label>
                                        <input type="text" value={number} onChange={e => setNumber(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Bairro</label>
                                        <input type="text" value={district} onChange={e => setDistrict(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Cidade e UF</label>
                                        <div className="flex gap-2">
                                            <input type="text" value={city} placeholder="Cidade" onChange={e => setCity(e.target.value)} className="mt-1 block w-2/3 rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                            <input type="text" value={state} placeholder="UF" onChange={e => setState(e.target.value)} className="mt-1 block w-1/3 rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border uppercase" maxLength={2} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Cód IBGE Mun.</label>
                                        <input type="text" value={ibgeCode} onChange={e => setIbgeCode(e.target.value)} className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                                    </div>
                                </div>
                                <div className="mt-5 sm:grid sm:grid-cols-2 sm:gap-3">
                                    <button type="submit" className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 sm:col-start-2">Salvar</button>
                                    <button type="button" onClick={() => setIsModalOpen(false)} className="mt-3 w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50 sm:col-start-1 sm:mt-0">Cancelar</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
