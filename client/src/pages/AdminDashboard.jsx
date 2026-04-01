import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import TaskCard from '../components/TaskCard';
import api from '../utils/api';
import { GoGraph, GoPlus, GoPerson, GoTasklist, GoSignOut, GoTrophy, GoClockFill, GoCheckCircleFill, GoAlertFill } from "react-icons/go";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts';

const COLORS = ['#0078d4', '#107c10', '#ffb900', '#d83b01', '#8764b8', '#00bcf2'];

const TASK_TYPES = [
    'Site Report / መስክ ሪፖርት',
    'ማራዘሚያ ፈቃድ (ለተጀመረ ግንባታ)',
    'ማራዘሚያ ፈቃድ (ላልተጀመረ ግንባታ)',
    'እድሳት ፈቃድ',
    'Commencement Permit / ማስጀመሪያ ፈቃድ'
];

const WOREDAS = ['02', '03', '04', '05', '06', '08', '09', '10', '13', '14'];

const AdminDashboard = () => {
    const { user, logout, register } = useAuth();
    const [tasks, setTasks] = useState([]);
    const [users, setUsers] = useState([]);
    const [newTask, setNewTask] = useState({
        task_type: TASK_TYPES[0],
        woreda: '',
        description: ''
    });
    // Views: 'dashboard' (analytics), 'assign-task' (list), 'create', 'create-user'
    // Default view is now 'dashboard' (formerly analytics)
    const [view, setView] = useState('dashboard');
    const [analyticsData, setAnalyticsData] = useState(null);
    const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'staff' });
    const [editingUser, setEditingUser] = useState(null); // Track user being edited
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);
    const [manualUser, setManualUser] = useState('');

    // Track if this is the first-ever task assignment
    const [isFirstTaskEver, setIsFirstTaskEver] = useState(false);
    
    // Toggle for manual vs automatic assignment
    const [isManualMode, setIsManualMode] = useState(false);

    // Filters for task list
    const [filters, setFilters] = useState({
        task_type: '',
        woreda: '',
        status: '',
        sortBy: 'created_at' // or 'completed_at'
    });

    const fetchTasks = async () => {
        try {
            const res = await api.get('/api/tasks.php?role=manager');
            if (res.data.success) {
                setTasks(res.data.tasks);
                // Check if any task has ever been assigned
                const assignedCount = res.data.tasks.filter(t => t.assigned_to !== null).length;
                setIsFirstTaskEver(assignedCount === 0);
            }
        } catch (e) { console.error(e); }
    };

    const fetchUsers = async () => {
        try {
            const res = await api.get('/api/users.php');
            if (res.data.success) setUsers(res.data.users);
        } catch (e) { console.error(e); }
    }

    const fetchAnalytics = async () => {
        try {
            const res = await api.get('/api/analytics.php');
            if (res.data.success) setAnalyticsData(res.data.data);
        } catch (e) { console.error(e); }
    }

    useEffect(() => {
        fetchTasks();
        fetchUsers();
    }, []);

    useEffect(() => {
        if (view === 'dashboard') fetchAnalytics();
    }, [view]);

    const handleCreateTask = async (e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append('task_type', newTask.task_type);
        formData.append('woreda', newTask.woreda);
        formData.append('description', newTask.description);
        formData.append('created_by', user.id);
        formData.append('action', 'create');

        if (newTask.attachment) {
            formData.append('attachment', newTask.attachment);
        }

        try {
            await api.post('/api/tasks.php?action=create', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setNewTask({ task_type: TASK_TYPES[0], woreda: '', description: '', attachment: null });
            setView('assign-task');
            fetchTasks();
        } catch (e) { alert('Error creating task'); }
    };

    const handleAutoAssign = async (taskId) => {
        try {
            await api.post('/api/tasks.php?action=assign', {
                task_id: taskId,
                target_user_id: null // Force fairness algorithm
            });
            fetchTasks();
        } catch (e) { alert('Error auto-assigning task'); }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        try {
            if (editingUser) {
                // Update existing user
                const res = await api.post('/api/users.php?action=update', {
                    user_id: editingUser.id,
                    name: newUser.name,
                    email: newUser.email,
                    password: newUser.password || null,
                    role: newUser.role
                });
                if (res.data.success) {
                    alert('User updated successfully');
                    setEditingUser(null);
                    setNewUser({ name: '', email: '', password: '', role: 'staff' });
                    fetchUsers();
                } else {
                    alert(res.data.error || 'Failed to update user');
                }
            } else {
                // Create new user
                const res = await register(newUser.name, newUser.email, newUser.password);
                if (res.success) {
                    alert('User created successfully');
                    setNewUser({ name: '', email: '', password: '', role: 'staff' });
                    fetchUsers();
                } else {
                    alert(res.error);
                }
            }
        } catch (e) { alert('Failed to save user'); }
    };

    const startEdit = (userToEdit) => {
        setEditingUser(userToEdit);
        setNewUser({
            name: userToEdit.name,
            email: userToEdit.email,
            password: '',
            role: userToEdit.role
        });
    };

    const cancelEdit = () => {
        setEditingUser(null);
        setNewUser({ name: '', email: '', password: '', role: 'staff' });
    };

    const handleDeleteUser = async (userId) => {
        if (!confirm('Are you sure you want to delete this user? Their assigned tasks will be unassigned.')) return;

        try {
            const res = await api.post('/api/users.php?action=delete', { user_id: userId });
            if (res.data.success) {
                alert(res.data.message || 'User deleted successfully');
                fetchUsers();
                fetchTasks(); // Refresh tasks to show unassigned ones
            } else {
                alert(res.data.error || 'Failed to delete user');
            }
        } catch (e) { alert('Failed to delete user'); }
    };

    const openAssignModal = (taskId) => {
        setSelectedTask(taskId);
        setManualUser('');
        setAssignModalOpen(true);
    }

    const handleAssign = async (isManual) => {
        const payload = { task_id: selectedTask };
        if (isManual && manualUser) payload.target_user_id = manualUser;
        try {
            const res = await api.post('/api/tasks.php?action=assign', payload);
            if (res.data.success) {
                setAssignModalOpen(false);
                fetchTasks();
            } else {
                alert(res.data.error || 'Assignment failed');
            }
        } catch (e) { alert('Assignment failed'); }
    };

    const formatTime = (seconds) => {
        if (!seconds) return 'N/A';
        const num = parseFloat(seconds);
        if (num < 60) return `${Math.round(num)}s`;
        if (num < 3600) return `${Math.round(num / 60)}m`;
        return `${(num / 3600).toFixed(1)}h`;
    }

    // Prepare chart data
    const getStatusPieData = () => {
        if (!analyticsData?.status_distribution) return [];
        return analyticsData.status_distribution.map(s => ({
            name: s.status.charAt(0).toUpperCase() + s.status.slice(1),
            value: parseInt(s.count)
        }));
    };

    const getStaffBarData = () => {
        if (!analyticsData?.staff_stats) return [];
        return analyticsData.staff_stats.map(s => ({
            name: s.name.split(' ')[0],
            Completed: parseInt(s.total_completed) || 0,
            Pending: parseInt(s.total_pending) || 0,
            Ongoing: parseInt(s.total_ongoing) || 0,
        }));
    };

    const getPerformanceData = () => {
        if (!analyticsData?.staff_stats) return [];
        return analyticsData.staff_stats.map(s => ({
            name: s.name.split(' ')[0],
            acceptTime: s.avg_accept_time ? Math.round(parseFloat(s.avg_accept_time) / 60) : 0,
            completeTime: s.avg_complete_time ? Math.round(parseFloat(s.avg_complete_time) / 60) : 0,
        }));
    };

    const getTrendData = () => {
        if (!analyticsData?.tasks_per_day || !analyticsData?.completed_per_day) return [];
        const combined = {};
        analyticsData.tasks_per_day.forEach(d => {
            combined[d.date] = { date: d.date, created: parseInt(d.count), completed: 0 };
        });
        analyticsData.completed_per_day.forEach(d => {
            if (combined[d.date]) combined[d.date].completed = parseInt(d.count);
            else combined[d.date] = { date: d.date, created: 0, completed: parseInt(d.count) };
        });
        return Object.values(combined).sort((a, b) => a.date.localeCompare(b.date));
    };

    const getLeaderboard = () => {
        if (!analyticsData?.staff_stats) return [];
        return [...analyticsData.staff_stats]
            .sort((a, b) => (parseInt(b.total_completed) || 0) - (parseInt(a.total_completed) || 0))
            .slice(0, 5);
    };

    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex min-h-screen bg-[#f3f2f1] overflow-hidden">
            {/* Mobile Header */}
            <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-[#e1dfdd] p-4 flex items-center justify-between z-50 h-16">
                <h1 className="text-lg font-bold text-[#0078d4]">Lemikura</h1>
                <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-gray-600">
                    <GoTasklist size={24} />
                </button>
            </div>

            {/* Sidebar with Overlay for Mobile */}
            {sidebarOpen && (
                <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)}></div>
            )}

            <aside className={`
                fixed lg:static inset-y-0 left-0 w-64 bg-white border-r border-[#e1dfdd] flex flex-col z-50 transform transition-transform duration-300 ease-in-out
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                <div className="p-4 border-b border-[#e1dfdd] h-16 flex items-center">
                    <h1 className="text-xl font-bold text-[#0078d4]">Lemikura Admin</h1>
                </div>
                <nav className="flex-1 overflow-y-auto py-2">
                    {/* ... nav items ... */}
                    <button onClick={() => { setView('dashboard'); setSidebarOpen(false); }} className={`w-full nav-link ${view === 'dashboard' ? 'active' : ''}`}>
                        <GoGraph /> Dashboard
                    </button>
                    <button onClick={() => { setView('assign-task'); setSidebarOpen(false); }} className={`w-full nav-link ${view === 'assign-task' ? 'active' : ''}`}>
                        <GoTasklist /> Assign Task
                    </button>
                    <button onClick={() => { setView('create'); setSidebarOpen(false); }} className={`w-full nav-link ${view === 'create' ? 'active' : ''}`}>
                        <GoPlus /> Create Task
                    </button>
                    <button onClick={() => { setView('create-user'); setSidebarOpen(false); }} className={`w-full nav-link ${view === 'create-user' ? 'active' : ''}`}>
                        <GoPerson /> Create User
                    </button>
                </nav>
                <div className="p-4 border-t border-[#e1dfdd]">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-[#0078d4] text-white flex items-center justify-center text-xs font-bold">
                            {user.name.charAt(0)}
                        </div>
                        <div className="text-sm truncate font-medium">{user.name}</div>
                    </div>
                    <button onClick={logout} className="text-xs text-[#0078d4] hover:underline flex items-center gap-1">
                        <GoSignOut /> Sign out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-4 lg:p-8 overflow-y-auto pt-20 lg:pt-8 h-screen">
                {/* ... existing content ... */}


                {view === 'create' && (
                    <div className="max-w-2xl bg-white p-8 rounded shadow-sm">
                        <h2 className="ms-list-header flex items-center gap-2"><GoPlus /> Create New Task</h2>
                        <form onSubmit={handleCreateTask} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold mb-1">Task Type</label>
                                    <select
                                        className="w-full p-2 border border-[#8a8886] focus:border-[#0078d4] outline-none"
                                        value={newTask.task_type}
                                        onChange={e => setNewTask({ ...newTask, task_type: e.target.value })}
                                        required
                                    >
                                        {TASK_TYPES.map(type => (
                                            <option key={type} value={type}>{type}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold mb-1">Woreda</label>
                                    <select
                                        className="w-full p-2 border border-[#8a8886] focus:border-[#0078d4] outline-none"
                                        value={newTask.woreda}
                                        onChange={e => setNewTask({ ...newTask, woreda: e.target.value })}
                                    >
                                        <option value="">Select Woreda (Optional)</option>
                                        {WOREDAS.map(w => (
                                            <option key={w} value={w}>Woreda {w}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1">Description</label>
                                <textarea className="w-full p-2 border border-[#8a8886] focus:border-[#0078d4] outline-none" rows="4" value={newTask.description} onChange={e => setNewTask({ ...newTask, description: e.target.value })} required />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1">Attachment (Optional)</label>
                                <input type="file" className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#0078d4]/10 file:text-[#0078d4] hover:file:bg-[#0078d4]/20" onChange={e => setNewTask({ ...newTask, attachment: e.target.files[0] })} />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setView('assign-task')} className="ms-btn-secondary px-4 py-1.5">Cancel</button>
                                <button type="submit" className="ms-btn px-4 py-1.5">Create Task</button>
                            </div>
                        </form>
                    </div>
                )}

                {view === 'create-user' && (
                    <div className="space-y-6">
                        <h2 className="ms-list-header flex items-center gap-2"><GoPerson /> User Management</h2>

                        {/* Create User Form */}
                        <div className="bg-white p-6 rounded shadow-sm">
                            <h3 className="text-lg font-semibold mb-4">{editingUser ? 'Edit User' : 'Create New User'}</h3>
                            <form onSubmit={handleCreateUser} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold mb-1">Full Name</label>
                                        <input className="w-full p-2 border border-[#8a8886] focus:border-[#0078d4] outline-none" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} required />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold mb-1">Email</label>
                                        <input type="email" className="w-full p-2 border border-[#8a8886] focus:border-[#0078d4] outline-none" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} required />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold mb-1">Password {editingUser && '(leave blank to keep current)'}</label>
                                        <input type="password" className="w-full p-2 border border-[#8a8886] focus:border-[#0078d4] outline-none" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} required={!editingUser} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold mb-1">Role</label>
                                        <select className="w-full p-2 border border-[#8a8886] focus:border-[#0078d4] outline-none" value={newUser.role || 'staff'} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                                            <option value="staff">Staff</option>
                                            <option value="manager">Manager</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    {editingUser && (
                                        <button type="button" onClick={cancelEdit} className="px-4 py-1.5 border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
                                    )}
                                    <button type="submit" className="ms-btn px-4 py-1.5">{editingUser ? 'Update User' : 'Create User'}</button>
                                </div>
                            </form>
                        </div>

                        {/* Users List */}
                        <div className="bg-white rounded shadow-sm overflow-hidden">
                            <div className="p-4 border-b bg-gray-50">
                                <h3 className="font-semibold">Existing Users</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 border-b">
                                        <tr>
                                            <th className="text-left p-3 font-semibold text-gray-600">Name</th>
                                            <th className="text-left p-3 font-semibold text-gray-600">Email</th>
                                            <th className="text-left p-3 font-semibold text-gray-600">Role</th>
                                            <th className="text-left p-3 font-semibold text-gray-600">Telegram</th>
                                            <th className="text-right p-3 font-semibold text-gray-600">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map(u => (
                                            <tr key={u.id} className="border-b hover:bg-gray-50">
                                                <td className="p-3">{u.name}</td>
                                                <td className="p-3">{u.email}</td>
                                                <td className="p-3">
                                                    <span className={`text-xs px-2 py-1 rounded ${u.role === 'manager' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                        {u.role}
                                                    </span>
                                                </td>
                                                <td className="p-3">
                                                    {u.telegram_chat_id ? (
                                                        <span className="text-xs text-green-600">✓ Linked</span>
                                                    ) : (
                                                        <span className="text-xs text-gray-400">Not linked</span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => startEdit(u)} className="text-xs px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600">Edit</button>
                                                        <button onClick={() => handleDeleteUser(u.id)} className="text-xs px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600" disabled={u.id === 1}>Delete</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {view === 'dashboard' && analyticsData && (
                    <div className="space-y-6">
                        <h2 className="ms-list-header flex items-center gap-2"><GoGraph /> Dashboard</h2>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="ms-card flex items-center gap-4">
                                <div className="w-12 h-12 rounded-lg bg-[#0078d4]/10 flex items-center justify-center text-[#0078d4]">
                                    <GoTasklist size={24} />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-[#323130]">{analyticsData.summary?.total_tasks || 0}</p>
                                    <p className="text-xs text-[#605e5c]">Total Tasks</p>
                                </div>
                            </div>
                            <div className="ms-card flex items-center gap-4">
                                <div className="w-12 h-12 rounded-lg bg-[#107c10]/10 flex items-center justify-center text-[#107c10]">
                                    <GoCheckCircleFill size={24} />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-[#323130]">{analyticsData.summary?.completed_tasks || 0}</p>
                                    <p className="text-xs text-[#605e5c]">Completed</p>
                                </div>
                            </div>
                            <div className="ms-card flex items-center gap-4">
                                <div className="w-12 h-12 rounded-lg bg-[#ffb900]/10 flex items-center justify-center text-[#ffb900]">
                                    <GoClockFill size={24} />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-[#323130]">{formatTime(analyticsData.summary?.overall_avg_accept)}</p>
                                    <p className="text-xs text-[#605e5c]">Avg. Accept</p>
                                </div>
                            </div>
                            <div className="ms-card flex items-center gap-4">
                                <div className="w-12 h-12 rounded-lg bg-[#8764b8]/10 flex items-center justify-center text-[#8764b8]">
                                    <GoPerson size={24} />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-[#323130]">{analyticsData.staff_count || 0}</p>
                                    <p className="text-xs text-[#605e5c]">Staff Members</p>
                                </div>
                            </div>
                        </div>

                        {/* Charts Row 1 */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Task Status Pie Chart */}
                            <div className="ms-card">
                                <h3 className="font-semibold text-[#323130] mb-4">Task Status Distribution</h3>
                                <ResponsiveContainer width="100%" height={250}>
                                    <PieChart>
                                        <Pie
                                            data={getStatusPieData()}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={90}
                                            paddingAngle={3}
                                            dataKey="value"
                                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                        >
                                            {getStatusPieData().map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Staff Workload Bar Chart */}
                            <div className="ms-card">
                                <h3 className="font-semibold text-[#323130] mb-4">Staff Workload</h3>
                                <ResponsiveContainer width="100%" height={250}>
                                    <BarChart data={getStaffBarData()} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e1dfdd" />
                                        <XAxis type="number" />
                                        <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
                                        <Tooltip />
                                        <Legend />
                                        <Bar dataKey="Completed" stackId="a" fill="#107c10" />
                                        <Bar dataKey="Ongoing" stackId="a" fill="#0078d4" />
                                        <Bar dataKey="Pending" stackId="a" fill="#ffb900" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Charts Row 2 */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Performance Comparison */}
                            <div className="ms-card">
                                <h3 className="font-semibold text-[#323130] mb-4">Response Time (Minutes)</h3>
                                <ResponsiveContainer width="100%" height={250}>
                                    <BarChart data={getPerformanceData()}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e1dfdd" />
                                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                        <YAxis />
                                        <Tooltip formatter={(value) => `${value} min`} />
                                        <Legend />
                                        <Bar dataKey="acceptTime" name="Avg Accept Time" fill="#0078d4" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="completeTime" name="Avg Complete Time" fill="#107c10" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Task Trends */}
                            <div className="ms-card">
                                <h3 className="font-semibold text-[#323130] mb-4">Task Trends (Last 7 Days)</h3>
                                <ResponsiveContainer width="100%" height={250}>
                                    <AreaChart data={getTrendData()}>
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

                        {/* Leaderboard & Performance Table */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Leaderboard */}
                            <div className="ms-card">
                                <h3 className="font-semibold text-[#323130] mb-4 flex items-center gap-2">
                                    <GoTrophy className="text-[#ffb900]" /> Top Performers
                                </h3>
                                <div className="space-y-3">
                                    {getLeaderboard().map((s, i) => (
                                        <div key={s.id} className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${i === 0 ? 'bg-[#ffb900]' : i === 1 ? 'bg-[#a8a8a8]' : i === 2 ? 'bg-[#cd7f32]' : 'bg-[#605e5c]'}`}>
                                                {i + 1}
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm font-medium text-[#323130]">{s.name}</p>
                                                <p className="text-xs text-[#605e5c]">{s.total_completed || 0} tasks completed</p>
                                            </div>
                                        </div>
                                    ))}
                                    {getLeaderboard().length === 0 && (
                                        <p className="text-sm text-gray-500">No data yet</p>
                                    )}
                                </div>
                            </div>

                            {/* Detailed Table */}
                            <div className="ms-card lg:col-span-2">
                                <h3 className="font-semibold text-[#323130] mb-4">Detailed Performance</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-[#faf9f8] border-b border-[#e1dfdd]">
                                            <tr>
                                                <th className="p-3 font-semibold">Staff</th>
                                                <th className="p-3 font-semibold text-center">Assigned</th>
                                                <th className="p-3 font-semibold text-center">Completed</th>
                                                <th className="p-3 font-semibold text-center">Completion %</th>
                                                <th className="p-3 font-semibold text-right">Avg Accept</th>
                                                <th className="p-3 font-semibold text-right">Avg Complete</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {analyticsData.staff_stats?.map(stat => {
                                                const rate = stat.total_assigned > 0
                                                    ? Math.round((stat.total_completed / stat.total_assigned) * 100)
                                                    : 0;
                                                return (
                                                    <tr key={stat.id} className="border-b border-[#e1dfdd] hover:bg-[#f3f2f1]">
                                                        <td className="p-3 font-medium">{stat.name}</td>
                                                        <td className="p-3 text-center">{stat.total_assigned}</td>
                                                        <td className="p-3 text-center text-[#107c10] font-medium">{stat.total_completed}</td>
                                                        <td className="p-3 text-center">
                                                            <div className="w-full bg-gray-200 rounded-full h-2">
                                                                <div className="bg-[#0078d4] h-2 rounded-full" style={{ width: `${rate}%` }}></div>
                                                            </div>
                                                            <span className="text-xs text-gray-500">{rate}%</span>
                                                        </td>
                                                        <td className="p-3 text-right font-mono text-[#0078d4]">{formatTime(stat.avg_accept_time)}</td>
                                                        <td className="p-3 text-right font-mono text-[#107c10]">{formatTime(stat.avg_complete_time)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {view === 'dashboard' && !analyticsData && (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-center text-gray-500">
                            <div className="w-8 h-8 border-4 border-gray-300 border-t-[#0078d4] rounded-full animate-spin mx-auto mb-4"></div>
                            Loading dashboard...
                        </div>
                    </div>
                )}

                {view === 'assign-task' && (
                    <div>
                        <div className="flex flex-col md:flex-row md:items-center justify-between mb-4">
                            <h2 className="ms-list-header flex items-center gap-2 mb-0"><GoTasklist /> Assign Task</h2>
                            
                            <div className="flex items-center gap-3 mt-2 md:mt-0 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-200">
                                <span className={`text-xs font-bold transition-colors ${!isManualMode ? 'text-[#107c10]' : 'text-gray-400'}`}>Auto Mode</span>
                                <button
                                    onClick={() => setIsManualMode(!isManualMode)}
                                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isManualMode ? 'bg-[#ffb900]' : 'bg-[#107c10]'}`}
                                    role="switch"
                                    aria-checked={isManualMode}
                                >
                                    <span
                                        aria-hidden="true"
                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isManualMode ? 'translate-x-5' : 'translate-x-0'}`}
                                    />
                                </button>
                                <span className={`text-xs font-bold transition-colors ${isManualMode ? 'text-[#d89d00]' : 'text-gray-400'}`}>Manual Mode</span>
                            </div>
                        </div>

                        {/* Filters */}
                        <div className="bg-white p-4 rounded shadow-sm mb-4">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold mb-1">Task Type</label>
                                    <select
                                        className="w-full text-sm p-2 border border-gray-300 rounded focus:border-[#0078d4] outline-none"
                                        value={filters.task_type}
                                        onChange={(e) => setFilters({ ...filters, task_type: e.target.value })}
                                    >
                                        <option value="">All Types</option>
                                        {TASK_TYPES.map(type => (
                                            <option key={type} value={type}>{type}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1">Woreda</label>
                                    <select
                                        className="w-full text-sm p-2 border border-gray-300 rounded focus:border-[#0078d4] outline-none"
                                        value={filters.woreda}
                                        onChange={(e) => setFilters({ ...filters, woreda: e.target.value })}
                                    >
                                        <option value="">All Woredas</option>
                                        {WOREDAS.map(w => (
                                            <option key={w} value={w}>Woreda {w}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1">Status</label>
                                    <select
                                        className="w-full text-sm p-2 border border-gray-300 rounded focus:border-[#0078d4] outline-none"
                                        value={filters.status}
                                        onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                                    >
                                        <option value="">All Status</option>
                                        <option value="draft">Draft</option>
                                        <option value="pending">Pending</option>
                                        <option value="ongoing">Ongoing</option>
                                        <option value="completed">Completed</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1">Sort By</label>
                                    <select
                                        className="w-full text-sm p-2 border border-gray-300 rounded focus:border-[#0078d4] outline-none"
                                        value={filters.sortBy}
                                        onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
                                    >
                                        <option value="created_at">Recently Created</option>
                                        <option value="completed_at">Recently Completed</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {tasks.length === 0 ? (
                            <div className="ms-card text-center py-12 text-gray-500">
                                No tasks created yet. Click "Create Task" to get started.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {tasks
                                    .filter(t => !filters.task_type || t.task_type === filters.task_type)
                                    .filter(t => !filters.woreda || t.woreda === filters.woreda)
                                    .filter(t => !filters.status || t.status === filters.status)
                                    .sort((a, b) => {
                                        if (filters.sortBy === 'completed_at') {
                                            const dateA = a.completed_at ? new Date(a.completed_at) : new Date(0);
                                            const dateB = b.completed_at ? new Date(b.completed_at) : new Date(0);
                                            return dateB - dateA; // Newest first
                                        }
                                        // Default: sort by created_at
                                        return new Date(b.created_at) - new Date(a.created_at);
                                    })
                                    .map(task => (
                                        <div key={task.id} className="relative group">
                                            <TaskCard task={task} role="manager" user={user} onUpdate={fetchTasks} />
                                            {/* Show Assign button on ALL unassigned tasks */}
                                            {!task.assigned_to && (
                                                <div className="absolute top-4 right-4">
                                                    <button
                                                        onClick={() => (isFirstTaskEver || isManualMode) ? openAssignModal(task.id) : handleAutoAssign(task.id)}
                                                        className={`ms-btn text-xs px-3 ${isManualMode ? 'bg-[#ffb900] hover:bg-[#e0a300] text-black border-none' : ''}`}
                                                    >
                                                        {(isFirstTaskEver || isManualMode) ? 'Assign (Manual)' : 'Auto-Assign'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Assignment Modal */}
            {assignModalOpen && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                    <div className="bg-white w-[400px] p-6 shadow-xl rounded-sm">
                        <h3 className="text-lg font-semibold mb-4">Assign Task</h3>
                        <div className="mb-6">
                            <label className="block text-sm font-semibold mb-2">Select Staff Member</label>
                            <select
                                className="w-full p-2 border border-[#8a8886] outline-none text-sm"
                                value={manualUser}
                                onChange={(e) => setManualUser(e.target.value)}
                            >
                                <option value="">-- Auto (Fairness Algorithm) --</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">Leave empty to auto-assign based on fairness.</p>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setAssignModalOpen(false)} className="ms-btn-secondary px-4 py-1.5">Cancel</button>
                            <button onClick={() => handleAssign(!!manualUser)} className="ms-btn px-4 py-1.5">
                                {manualUser ? 'Assign to Selected' : 'Auto Assign'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;
