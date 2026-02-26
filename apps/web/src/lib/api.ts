import axios from 'axios';

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333',
});

// Request interceptor — attach token + tenant header
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

// Response interceptor — auto-refresh on 401
let isRefreshing = false;
let failedQueue: Array<{ resolve: (value: any) => void; reject: (reason?: any) => void }> = [];

const processQueue = (error: any, token: string | null = null) => {
    failedQueue.forEach(p => {
        if (error) p.reject(error);
        else p.resolve(token);
    });
    failedQueue = [];
};

api.interceptors.response.use(
    response => response,
    async error => {
        const originalRequest = error.config;

        // Skip refresh for auth routes and already-retried requests
        if (error.response?.status === 401 && !originalRequest._retry &&
            !originalRequest.url?.includes('/auth/login') &&
            !originalRequest.url?.includes('/auth/refresh') &&
            !originalRequest.url?.includes('/auth/register')) {

            if (isRefreshing) {
                // Queue requests while refreshing
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(token => {
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    return api(originalRequest);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('nfe_refresh_token') : null;

            if (!refreshToken) {
                // No refresh token — force logout
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('nfe_token');
                    localStorage.removeItem('nfe_user');
                    localStorage.removeItem('nfe_refresh_token');
                    window.location.href = '/login';
                }
                return Promise.reject(error);
            }

            try {
                const res = await axios.post(
                    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333'}/auth/refresh`,
                    { refreshToken }
                );

                const newToken = res.data.token;
                const newRefreshToken = res.data.refreshToken;

                localStorage.setItem('nfe_token', newToken);
                localStorage.setItem('nfe_refresh_token', newRefreshToken);

                api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
                processQueue(null, newToken);

                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                return api(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError, null);
                // Refresh failed — force logout
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('nfe_token');
                    localStorage.removeItem('nfe_user');
                    localStorage.removeItem('nfe_refresh_token');
                    window.location.href = '/login';
                }
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    }
);

export default api;
