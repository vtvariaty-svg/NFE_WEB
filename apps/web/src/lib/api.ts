import axios from 'axios';

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333',
});

api.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('nfe_token');
        const userStr = localStorage.getItem('nfe_user');

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        if (userStr) {
            const user = JSON.parse(userStr);
            if (user.tenantId && !config.headers['x-tenant-id']) {
                config.headers['x-tenant-id'] = user.tenantId;
            }
        }
    }
    return config;
});

export default api;
