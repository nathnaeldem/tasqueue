import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import TaskCard from '../components/TaskCard';
import api from '../utils/api';
import { GoTasklist, GoSignOut, GoGraph, GoClockFill, GoCheckCircleFill } from "react-icons/go";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';

const COLORS = ['#0078d4', '#107c10', '#ffb900', '#d83b01', '#8764b8'];

const formatInputDate = (value) => {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getDefaultDateRange = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 29);
    return {
        startDate: formatInputDate(start),
        endDate: formatInputDate(end),
    };
};

const parseDurationSeconds = (value) => {
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? num : null;
};

const formatTime = (seconds) => {
    const num = parseDurationSeconds(seconds);
    if (num === null) return 'N/A';
    if (num < 60) return `${Math.round(num)}s`;
    if (num < 3600) return `${Math.round(num / 60)}m`;
    return `${(num / 3600).toFixed(1)}h`;
};

const StaffDashboard = () => {
    const { user, logout } = useAuth();
    const [tasks, setTasks] = useState([]);
    const [analyticsData, setAnalyticsData] = useState(null);
    const [analyticsRange, setAnalyticsRange] = useState(getDefaultDateRange);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);
    const [downloadingReport, setDownloadingReport] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const analyticsQueryString = useMemo(() => {
        const params = new URLSearchParams();
        if (analyticsRange.startDate) params.set('date_start', analyticsRange.startDate);
        if (analyticsRange.endDate) params.set('date_end', analyticsRange.endDate);
        return params.toString();
    }, [analyticsRange.endDate, analyticsRange.startDate]);

    const fetchTasks = async () => {
        try {
            const res = await api.get('/api/tasks.php');
            if (res.data.success) {
                setTasks(res.data.tasks);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const fetchAnalytics = async () => {
        setAnalyticsLoading(true);
        try {
            const res = await api.get(`/api/analytics.php${analyticsQueryString ? `?${analyticsQueryString}` : ''}`);
            if (res.data.success) {
                setAnalyticsData(res.data.data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setAnalyticsLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            fetchTasks();
        }
    }, [user]);

    useEffect(() => {
        if (user) {
            fetchAnalytics();
        }
    }, [analyticsQueryString, user]);

    const refreshAll = async () => {
        await Promise.all([fetchTasks(), fetchAnalytics()]);
    };

    const handleDownloadExcel = async () => {
        if (!analyticsRange.startDate || !analyticsRange.endDate) {
            alert('Choose a valid date range first');
            return;
        }

        setDownloadingReport(true);
        try {
            const res = await api.get(`/api/analytics_export.php${analyticsQueryString ? `?${analyticsQueryString}` : ''}`, {
                responseType: 'blob',
            });
            const disposition = res.headers['content-disposition'] || '';
            const matchedName = disposition.match(/filename="?([^";]+)"?/i);
            const fallbackName = `my-analytics-report-${analyticsRange.startDate}-to-${analyticsRange.endDate}.xlsx`;
            const fileName = matchedName?.[1] || fallbackName;
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error(e);
            alert('Failed to download report');
        } finally {
            setDownloadingReport(false);
        }
    };

    const pendingTasks = tasks.filter(task => task.status === 'pending');
    const ongoingTasks = tasks.filter(task => task.status === 'ongoing');
    const completedTasks = tasks.filter(task => task.status === 'completed');
    const analyticsSummary = analyticsData?.all_time_summary || {};
    const summaryCompletionRate = analyticsSummary.completion_rate ?? (
        analyticsSummary.total_tasks
            ? Math.round(((Number(analyticsSummary.completed_tasks) || 0) / Number(analyticsSummary.total_tasks)) * 100)
            : 0
    );

    const statusPieData = (analyticsData?.status_distribution || []).map((item) => ({
        name: item.status?.charAt(0).toUpperCase() + item.status?.slice(1),
        value: parseInt(item.count, 10) || 0,
    }));

    const trendData = (() => {
        const combined = {};
        for (let i = 6; i >= 0; i -= 1) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const key = date.toISOString().slice(0, 10);
            combined[key] = {
                sortKey: key,
                date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                created: 0,
                completed: 0,
            };
        }
        (analyticsData?.tasks_per_day || []).forEach((item) => {
            if (!combined[item.date]) {
                combined[item.date] = { sortKey: item.date, date: item.date, created: 0, completed: 0 };
            }
            combined[item.date].created = parseInt(item.count, 10) || 0;
        });
        (analyticsData?.completed_per_day || []).forEach((item) => {
            if (!combined[item.date]) {
                combined[item.date] = { sortKey: item.date, date: item.date, created: 0, completed: 0 };
            }
            combined[item.date].completed = parseInt(item.count, 10) || 0;
        });
        return Object.values(combined)
            .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
            .map(({ sortKey, ...rest }) => rest);
    })();

    const workloadData = [
        { name: 'Pending', value: pendingTasks.length, fill: '#ffb900' },
        { name: 'Ongoing', value: ongoingTasks.length, fill: '#0078d4' },
        { name: 'Completed', value: completedTasks.length, fill: '#107c10' },
    ];

    return (
        <div className="flex min-h-screen bg-[#f3f2f1] overflow-hidden">
            <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-[#e1dfdd] p-4 flex items-center justify-between z-50 h-16">
                <h1 className="text-lg font-bold text-[#0078d4]">Lemikura</h1>
                <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-gray-600">
                    <GoTasklist size={24} />
                </button>
            </div>

            {sidebarOpen && (
                <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)}></div>
            )}

            <aside className={`
                fixed lg:static inset-y-0 left-0 w-64 bg-white border-r border-[#e1dfdd] flex flex-col z-50 transform transition-transform duration-300 ease-in-out
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                <div className="p-4 border-b border-[#e1dfdd] h-16 flex items-center">
                    <h1 className="text-xl font-bold text-[#0078d4]">Lemikura Portal</h1>
                </div>
                <nav className="flex-1 overflow-y-auto py-2">
                    <button onClick={() => setSidebarOpen(false)} className="w-full nav-link active text-left">
                        <GoGraph /> My Dashboard
                    </button>
                </nav>
                <div className="p-4 border-t border-[#e1dfdd]">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-[#0078d4] text-white flex items-center justify-center text-xs">
                            {user.name.charAt(0)}
                        </div>
                        <div className="text-sm truncate font-medium">{user.name}</div>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">{user.department_name || 'Department'}</p>
                    <button onClick={logout} className="text-xs text-[#0078d4] hover:underline flex items-center gap-1">
                        <GoSignOut /> Sign out
                    </button>
                </div>
            </aside>

            <main className="flex-1 p-4 lg:p-8 overflow-y-auto pt-20 lg:pt-8 h-screen">
                <div className="space-y-6">
                    <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
                        <div>
                            <h2 className="ms-list-header flex items-center gap-2 mb-1"><GoGraph /> My Analytics</h2>
                            <p className="text-sm text-[#605e5c]">Track your task performance and download your own report.</p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                            <label className="text-sm text-[#605e5c]">
                                <span className="block text-xs font-semibold mb-1">Start Date</span>
                                <input
                                    type="date"
                                    className="w-full p-2 border border-[#8a8886] outline-none rounded bg-white"
                                    value={analyticsRange.startDate}
                                    onChange={(e) => setAnalyticsRange(prev => ({ ...prev, startDate: e.target.value }))}
                                />
                            </label>
                            <label className="text-sm text-[#605e5c]">
                                <span className="block text-xs font-semibold mb-1">End Date</span>
                                <input
                                    type="date"
                                    className="w-full p-2 border border-[#8a8886] outline-none rounded bg-white"
                                    value={analyticsRange.endDate}
                                    onChange={(e) => setAnalyticsRange(prev => ({ ...prev, endDate: e.target.value }))}
                                />
                            </label>
                            <button onClick={handleDownloadExcel} disabled={downloadingReport} className="ms-btn px-4 py-2 w-full md:w-auto text-sm disabled:opacity-50">
                                {downloadingReport ? 'Downloading...' : 'Download XLSX'}
                            </button>
                        </div>
                    </div>

                    <p className="text-sm text-[#605e5c]">Showing analytics for {analyticsData?.range?.label || `${analyticsRange.startDate} - ${analyticsRange.endDate}`}</p>

                    {analyticsLoading && (
                        <div className="ms-card text-sm text-gray-500">Refreshing analytics...</div>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                        <div className="ms-card flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-[#0078d4]/10 flex items-center justify-center text-[#0078d4]">
                                <GoTasklist size={24} />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-[#323130]">{analyticsSummary.total_tasks || 0}</p>
                                <p className="text-xs text-[#605e5c]">Total Tasks</p>
                            </div>
                        </div>
                        <div className="ms-card flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-[#107c10]/10 flex items-center justify-center text-[#107c10]">
                                <GoCheckCircleFill size={24} />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-[#323130]">{analyticsSummary.completed_tasks || 0}</p>
                                <p className="text-xs text-[#605e5c]">Completed</p>
                            </div>
                        </div>
                        <div className="ms-card flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-[#ffb900]/10 flex items-center justify-center text-[#ffb900]">
                                <GoClockFill size={24} />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-[#323130]">{analyticsSummary.pending_tasks || pendingTasks.length}</p>
                                <p className="text-xs text-[#605e5c]">Pending</p>
                            </div>
                        </div>
                        <div className="ms-card flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-[#0078d4]/10 flex items-center justify-center text-[#0078d4]">
                                <GoClockFill size={24} />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-[#323130]">{analyticsSummary.ongoing_tasks || ongoingTasks.length}</p>
                                <p className="text-xs text-[#605e5c]">Ongoing</p>
                            </div>
                        </div>
                        <div className="ms-card flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-[#8764b8]/10 flex items-center justify-center text-[#8764b8]">
                                <GoGraph size={24} />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-[#323130]">{summaryCompletionRate}%</p>
                                <p className="text-xs text-[#605e5c]">Completion Rate</p>
                            </div>
                        </div>
                        <div className="ms-card flex items-center gap-4">
                            <div className="w-12 h-12 rounded-lg bg-[#d83b01]/10 flex items-center justify-center text-[#d83b01]">
                                <GoClockFill size={24} />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-[#323130]">{formatTime(analyticsSummary.overall_avg_accept)}</p>
                                <p className="text-xs text-[#605e5c]">Avg Accept</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="ms-card">
                            <h3 className="font-semibold text-[#323130] mb-4">Task Status Distribution</h3>
                            <ResponsiveContainer width="100%" height={260}>
                                <PieChart>
                                    <Pie
                                        data={statusPieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={90}
                                        paddingAngle={3}
                                        dataKey="value"
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    >
                                        {statusPieData.map((entry, index) => (
                                            <Cell key={`staff-pie-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="ms-card">
                            <h3 className="font-semibold text-[#323130] mb-4">Task Trends</h3>
                            <ResponsiveContainer width="100%" height={260}>
                                <AreaChart data={trendData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e1dfdd" />
                                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Area type="monotone" dataKey="created" name="Created" stroke="#0078d4" fill="#0078d4" fillOpacity={0.3} />
                                    <Area type="monotone" dataKey="completed" name="Completed" stroke="#107c10" fill="#107c10" fillOpacity={0.3} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="ms-card">
                        <h3 className="font-semibold text-[#323130] mb-4">Current Workload</h3>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={workloadData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e1dfdd" />
                                <XAxis dataKey="name" />
                                <YAxis allowDecimals={false} />
                                <Tooltip />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                    {workloadData.map((entry, index) => (
                                        <Cell key={`staff-bar-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <h3 className="ms-list-header flex items-center gap-2 mb-4"><GoTasklist /> Non-Completed Tasks</h3>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-semibold text-[#323130]">Pending Tasks</h4>
                                        <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800">{pendingTasks.length}</span>
                                    </div>
                                    {pendingTasks.length === 0 ? (
                                        <div className="ms-card text-sm text-gray-500">No pending tasks.</div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-4">
                                            {pendingTasks.map(task => (
                                                <TaskCard key={task.id} task={task} role="staff" onUpdate={refreshAll} user={user} />
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-semibold text-[#323130]">Ongoing Tasks</h4>
                                        <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">{ongoingTasks.length}</span>
                                    </div>
                                    {ongoingTasks.length === 0 ? (
                                        <div className="ms-card text-sm text-gray-500">No ongoing tasks.</div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-4">
                                            {ongoingTasks.map(task => (
                                                <TaskCard key={task.id} task={task} role="staff" onUpdate={refreshAll} user={user} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="ms-list-header flex items-center gap-2 mb-4"><GoCheckCircleFill /> Completed Tasks</h3>
                            {completedTasks.length === 0 ? (
                                <div className="ms-card text-sm text-gray-500">No completed tasks yet.</div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                    {completedTasks.map(task => (
                                        <TaskCard key={task.id} task={task} role="staff" onUpdate={refreshAll} user={user} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default StaffDashboard;
