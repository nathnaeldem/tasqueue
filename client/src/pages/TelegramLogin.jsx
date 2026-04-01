import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import WebApp from '@twa-dev/sdk';

const TelegramLogin = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');

    useEffect(() => {
        if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.ready();
        }
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setStatus('');

        const tgUser = WebApp.initDataUnsafe?.user || window.Telegram?.WebApp?.initDataUnsafe?.user;

        if (!tgUser) {
            const raw = window.Telegram?.WebApp?.initData;
            setStatus(`Error: No User Detected. Raw: ${raw ? 'Present' : 'Missing'}`);
            setLoading(false);
            return;
        }

        try {
            // New endpoint specifically for Telegram linking
            const res = await api.post('/api/telegram_link.php', {
                email,
                password,
                telegram_chat_id: tgUser.id,
                telegram_username: tgUser.username
            });

            if (res.data.success) {
                setStatus('✅ Successfully Linked!');
                WebApp.showAlert('Account Linked Successfully! You will now receive notifications here.');
                WebApp.close();
            } else {
                setStatus('❌ ' + (res.data.error || 'Login failed'));
            }
        } catch (error) {
            setStatus('❌ Network/Server Error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f3f2f1] p-4">
            <div className="w-full max-w-sm bg-white p-6 rounded-2xl shadow-xl">
                <div className="text-center mb-6">
                    <h1 className="text-xl font-bold text-[#0078d4]">Lemikura</h1>
                    <p className="text-sm text-gray-500">Connect your account</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
                        <input
                            type="email"
                            className="w-full p-3 rounded-lg border border-gray-200 bg-gray-50 outline-none focus:border-[#0078d4] focus:ring-2 focus:ring-[#0078d4]/10 transition-all"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="staff@lemikura.gov"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Password</label>
                        <input
                            type="password"
                            className="w-full p-3 rounded-lg border border-gray-200 bg-gray-50 outline-none focus:border-[#0078d4] focus:ring-2 focus:ring-[#0078d4]/10 transition-all"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 bg-[#0078d4] text-white font-semibold rounded-lg shadow-lg shadow-blue-500/30 active:scale-95 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Linking...' : 'Link Account'}
                    </button>

                    {status && (
                        <div className={`text-center text-sm p-2 rounded ${status.includes('Error') || status.includes('❌') ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'}`}>
                            {status}
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};

export default TelegramLogin;
