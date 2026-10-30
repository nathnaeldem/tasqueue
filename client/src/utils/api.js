import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.PROD ? '' : '/api', // Production uses relative path, Dev uses localhost:8000
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use((config) => {
    const storedUser = localStorage.getItem('lemikura_user');
    if (!storedUser) {
        return config;
    }

    try {
        const user = JSON.parse(storedUser);
        if (user?.id) {
            config.headers['X-User-Id'] = String(user.id);
        }
    } catch (error) {
        console.error('Failed to parse stored user for request headers', error);
    }

    return config;
});

export default api;
