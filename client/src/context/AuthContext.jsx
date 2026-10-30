import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const storedUser = localStorage.getItem('lemikura_user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
        setLoading(false);
    }, []);

    const login = async (email, password) => {
        try {
            const response = await api.post('/api/auth.php?action=login', { email, password });
            if (response.data.success) {
                setUser(response.data.user);
                localStorage.setItem('lemikura_user', JSON.stringify(response.data.user));
                return { success: true };
            }
            return { success: false, error: response.data.error };
        } catch (error) {
            console.error("Login Error:", error);
            return { success: false, error: error.response?.data?.error || 'Login failed' };
        }
    };

    const register = async (name, email, password, extraOptions = {}) => {
        try {
            const response = await api.post('/api/auth.php?action=register', { name, email, password, ...extraOptions });
            if (response.data.success) {
                return { success: true };
            }
            return { success: false, error: response.data.error };
        } catch (error) {
            return { success: false, error: error.response?.data?.error || 'Registration failed' };
        }
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('lemikura_user');
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
