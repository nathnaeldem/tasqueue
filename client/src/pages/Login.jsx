import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Login = () => {
    const { login } = useAuth();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const res = await login(formData.email, formData.password);

        setLoading(false);

        if (res.success) {
            navigate('/dashboard');
        } else {
            setError(res.error || 'Login failed');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f3f2f1]">
            <div className="w-full max-w-[400px] bg-white p-10 shadow-lg select-none">

                <div className="mb-6">
                    <h1 className="text-2xl font-semibold mb-1 text-[#323130]">Sign in</h1>
                    <p className="text-sm text-[#605e5c]">Lemikura Municipality</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        type="email"
                        className="w-full p-2 border border-[#605e5c] focus:border-[#0078d4] outline-none text-sm placeholder-[#605e5c]"
                        placeholder="Email, phone, or Skype"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                    />

                    <input
                        type="password"
                        className="w-full p-2 border border-[#605e5c] focus:border-[#0078d4] outline-none text-sm placeholder-[#605e5c]"
                        placeholder="Password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required
                    />

                    {error && (
                        <div className="text-xs text-red-600">
                            {error}
                        </div>
                    )}

                    <div className="pt-4 flex justify-end">
                        <button
                            type="submit"
                            className="ms-btn px-8 py-1.5"
                            disabled={loading}
                        >
                            Sign in
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Login;
