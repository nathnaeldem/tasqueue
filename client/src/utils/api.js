import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.PROD ? '' : 'http://localhost:8000', // Production uses relative path, Dev uses localhost:8000
    headers: {
        'Content-Type': 'application/json',
    },
});

export default api;
