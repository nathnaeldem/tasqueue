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

const WOREDAS = ['02', '03', '04', '05', '06', '08', '09', '10', '13', '14'];
const DATES_PER_PAGE = 3;

const getPageNumbers = (current, total) => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = [1];
    if (current > 3) pages.push('...');
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 2) pages.push('...');
    pages.push(total);
    return pages;
};

const formatDateLabel = (dateStr) => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const formatDateTimeLabel = (value) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString();
};

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

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sanitizeFileName = (value) => String(value ?? 'report')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .toLowerCase() || 'report';

const AdminDashboard = () => {
    const { user, logout, register } = useAuth();
    const [tasks, setTasks] = useState([]);
    const [users, setUsers] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [taskTypes, setTaskTypes] = useState([]);
    const [roles, setRoles] = useState([]);
    const [newTask, setNewTask] = useState({
        task_type: '',
        woreda: '',
        floor: '',
        coordinate_x: '',
        coordinate_y: '',
        description: ''
    });
    // Views: 'dashboard' (analytics), 'assign-task' (list), 'create', 'create-user', 'task-types'
    const [view, setView] = useState('dashboard');
    const [analyticsData, setAnalyticsData] = useState(null);
    const [analyticsRange, setAnalyticsRange] = useState(getDefaultDateRange);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);
    const [downloadingReport, setDownloadingReport] = useState(false);
    const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'staff', department_id: user?.is_super_admin ? '' : String(user?.department_id ?? '') });
    const [newType, setNewType] = useState('');
    const [newRole, setNewRole] = useState({ name: '', is_admin: false });
    const [newDepartmentName, setNewDepartmentName] = useState('');
    const [scopeDepartmentId, setScopeDepartmentId] = useState(user?.is_super_admin ? '' : String(user?.department_id ?? ''));
    const [editingUser, setEditingUser] = useState(null); // Track user being edited
    const [editingDepartmentId, setEditingDepartmentId] = useState(null);
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState(null);
    const [manualUser, setManualUser] = useState('');
    const [currentTaskPage, setCurrentTaskPage] = useState(1);
    const [userSearch, setUserSearch] = useState({ department_id: '', name: '', email: '' });
    const [perfSort, setPerfSort] = useState({ key: null, dir: 'asc' });

    // Track if this is the first-ever task assignment
    const [isFirstTaskEver, setIsFirstTaskEver] = useState(false);
    
    // Toggle for manual vs automatic assignment
    const [isManualMode, setIsManualMode] = useState(false);

    // Filters for task list
    const [filters, setFilters] = useState({
        task_type: '',
        woreda: '',
        floor: '',
        description: '',
        assigned_to: '',
        status: '',
        sortBy: 'created_at' // or 'completed_at'
    });

    const assignableUsers = users.filter(u => {
        const matchingRole = roles.find(r => r.name === u.role);
        return !matchingRole?.is_admin;
    });

    const selectedTaskRecord = tasks.find(task => task.id === selectedTask);
    const manualAssignableUsers = assignableUsers.filter(u => !selectedTaskRecord || !selectedTaskRecord.department_id || u.department_id === selectedTaskRecord.department_id);
    const scopeQuery = user?.is_super_admin === true && scopeDepartmentId ? `?department_id=${scopeDepartmentId}` : '';
    const scopePayload = user?.is_super_admin === true && scopeDepartmentId ? { department_id: scopeDepartmentId } : {};
    const currentDepartmentName = user?.is_super_admin === true
        ? departments.find(department => String(department.id) === String(scopeDepartmentId))?.name || 'All Departments'
        : user?.department_name || 'Department';
    const analyticsParams = new URLSearchParams();
    if (user?.is_super_admin === true && scopeDepartmentId) {
        analyticsParams.set('department_id', scopeDepartmentId);
    }
    if (analyticsRange.startDate) {
        analyticsParams.set('date_start', analyticsRange.startDate);
    }
    if (analyticsRange.endDate) {
        analyticsParams.set('date_end', analyticsRange.endDate);
    }
    const analyticsQueryString = analyticsParams.toString();
    const normalizedDescriptionSearch = filters.description.trim().toLowerCase();
    const filteredTasks = tasks
        .filter(t => !filters.task_type || t.task_type === filters.task_type)
        .filter(t => !filters.floor || String(t.floor ?? '') === String(filters.floor))
        .filter(t => !filters.woreda || t.woreda === filters.woreda)
        .filter(t => !normalizedDescriptionSearch || (t.description || '').toLowerCase().includes(normalizedDescriptionSearch))
        .filter(t => !filters.assigned_to || (filters.assigned_to === 'unassigned' ? !t.assigned_to : String(t.assigned_to) === filters.assigned_to))
        .filter(t => !filters.status || t.status === filters.status)
        .sort((a, b) => {
            if (filters.sortBy === 'completed_at') {
                const dateA = a.completed_at ? new Date(a.completed_at) : new Date(0);
                const dateB = b.completed_at ? new Date(b.completed_at) : new Date(0);
                return dateB - dateA;
            }
            return new Date(b.created_at) - new Date(a.created_at);
        });
    const dateGroups = (() => {
        const map = new Map();
        filteredTasks.forEach(t => {
            const key = t.created_at ? t.created_at.split('T')[0] : 'unknown';
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(t);
        });
        return Array.from(map, ([key, tasks]) => ({ dateKey: key, dateLabel: formatDateLabel(key), tasks }));
    })();
    const totalDatePages = Math.max(1, Math.ceil(dateGroups.length / DATES_PER_PAGE));
    const safePage = Math.min(currentTaskPage, totalDatePages);
    const paginatedDateGroups = dateGroups.slice((safePage - 1) * DATES_PER_PAGE, safePage * DATES_PER_PAGE);
    const paginatedTasks = paginatedDateGroups.flatMap(g => g.tasks);
    const pageDateLabel = paginatedDateGroups.map(g => g.dateLabel).join(', ');
    const pageNumbers = getPageNumbers(safePage, totalDatePages);

    const filteredUsers = users.filter(u => {
        if (userSearch.department_id && String(u.department_id) !== userSearch.department_id) return false;
        if (userSearch.name && !(u.name || '').toLowerCase().includes(userSearch.name.toLowerCase())) return false;
        if (userSearch.email && !(u.email || '').toLowerCase().includes(userSearch.email.toLowerCase())) return false;
        return true;
    });
    const staffStatsRaw = analyticsData?.staff_stats || [];
    const completedTaskDetails = analyticsData?.completed_task_details || [];

    const staffStats = (() => {
        if (!perfSort.key) return staffStatsRaw;
        const sorted = [...staffStatsRaw];
        const { key, dir } = perfSort;
        sorted.sort((a, b) => {
            let va = a[key];
            let vb = b[key];
            if (key === 'completion_rate') {
                va = getCompletionRate(a.total_completed, a.total_assigned);
                vb = getCompletionRate(b.total_completed, b.total_assigned);
            }
            if (va == null) va = '';
            if (vb == null) vb = '';
            if (typeof va === 'string') va = va.toLowerCase();
            if (typeof vb === 'string') vb = vb.toLowerCase();
            if (va < vb) return dir === 'asc' ? -1 : 1;
            if (va > vb) return dir === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    })();

    const handlePerfSort = (key) => {
        setPerfSort(prev => {
            if (prev.key === key) {
                return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
            }
            return { key, dir: 'asc' };
        });
    };

    const renderSortArrow = (key) => {
        if (perfSort.key !== key) {
            return <span className="ml-1 text-gray-300">↕</span>;
        }
        return <span className="ml-1 text-[#0078d4]">{perfSort.dir === 'asc' ? '↑' : '↓'}</span>;
    };
    const allTimeSummary = analyticsData?.all_time_summary || {};
    const summaryCompletionRate = allTimeSummary.total_tasks
        ? Math.round(((Number(allTimeSummary.completed_tasks) || 0) / Number(allTimeSummary.total_tasks)) * 100)
        : 0;

    const fetchDepartments = async () => {
        try {
            const res = await api.get('/api/departments.php');
            if (res.data.success) {
                setDepartments(res.data.departments);
            }
        } catch (e) { console.error(e); }
    };

    const fetchTaskTypes = async () => {
        try {
            const res = await api.get(`/api/task_types.php${scopeQuery}`);
            if (res.data.success) {
                setTaskTypes(res.data.task_types);
                if (res.data.task_types.length > 0 && !newTask.task_type) {
                    setNewTask(prev => ({ ...prev, task_type: res.data.task_types[0].name }));
                }
            }
        } catch (e) { console.error(e); }
    };

    const handleCreateTaskType = async (e) => {
        e.preventDefault();
        if (user?.is_super_admin === true && !scopeDepartmentId) {
            alert('Select a department scope before creating a task type.');
            return;
        }
        try {
            const res = await api.post('/api/task_types.php?action=create', { name: newType, ...scopePayload });
            if (res.data.success) {
                setNewType('');
                fetchTaskTypes();
            } else {
                alert(res.data.error || 'Failed to create task type');
            }
        } catch (e) { alert('Failed to create task type'); }
    };

    const handleDeleteTaskType = async (id) => {
        if (!confirm('Are you sure you want to delete this task type?')) return;
        try {
            const res = await api.post('/api/task_types.php?action=delete', { id });
            if (res.data.success) {
                fetchTaskTypes();
            } else {
                alert(res.data.error || 'Failed to delete task type');
            }
        } catch (e) { alert('Failed to delete task type'); }
    };

    const fetchRoles = async () => {
        try {
            const res = await api.get('/api/roles.php');
            if (res.data.success) {
                setRoles(res.data.roles);
            }
        } catch (e) { console.error(e); }
    };

    const handleCreateRole = async (e) => {
        e.preventDefault();
        try {
            const res = await api.post('/api/roles.php?action=create', newRole);
            if (res.data.success) {
                setNewRole({ name: '', is_admin: false });
                fetchRoles();
            } else {
                alert(res.data.error || 'Failed to create role');
            }
        } catch (e) { alert('Failed to create role'); }
    };

    const handleDeleteRole = async (id) => {
        if (!confirm('Are you sure you want to delete this role?')) return;
        try {
            const res = await api.post('/api/roles.php?action=delete', { id });
            if (res.data.success) {
                fetchRoles();
            } else {
                alert(res.data.error || 'Failed to delete role');
            }
        } catch (e) { alert('Failed to delete role'); }
    };

    const fetchTasks = async () => {
        try {
            const res = await api.get(`/api/tasks.php${scopeQuery}`);
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
            const res = await api.get(`/api/users.php${scopeQuery}`);
            if (res.data.success) setUsers(res.data.users);
        } catch (e) { console.error(e); }
    }

    const fetchAnalytics = async () => {
        setAnalyticsLoading(true);
        try {
            const res = await api.get(`/api/analytics.php${analyticsQueryString ? `?${analyticsQueryString}` : ''}`);
            if (res.data.success) setAnalyticsData(res.data.data);
        } catch (e) {
            console.error(e);
        } finally {
            setAnalyticsLoading(false);
        }
    };

    useEffect(() => {
        fetchTaskTypes();
        fetchTasks();
        fetchUsers();
    }, [scopeDepartmentId]);

    useEffect(() => {
        fetchRoles();
        if (user?.is_super_admin === true) fetchDepartments();
    }, [user?.is_super_admin]);

    useEffect(() => {
        if (view === 'dashboard') fetchAnalytics();
    }, [view, scopeDepartmentId, analyticsRange.startDate, analyticsRange.endDate]);

    useEffect(() => {
        setCurrentTaskPage(1);
    }, [filters, tasks.length, scopeDepartmentId]);

    const handleCreateTask = async (e) => {
        e.preventDefault();
        if (user?.is_super_admin === true && !scopeDepartmentId) {
            alert('Select a department scope before creating a task.');
            return;
        }
        const formData = new FormData();
        formData.append('task_type', newTask.task_type);
        formData.append('woreda', newTask.woreda);
        formData.append('floor', newTask.floor);
        formData.append('coordinate_x', newTask.coordinate_x);
        formData.append('coordinate_y', newTask.coordinate_y);
        formData.append('description', newTask.description);
        formData.append('action', 'create');
        if (user?.is_super_admin && scopeDepartmentId) {
            formData.append('department_id', scopeDepartmentId);
        }

        if (newTask.attachment) {
            formData.append('attachment', newTask.attachment);
        }

        try {
            await api.post('/api/tasks.php?action=create', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setNewTask({ task_type: taskTypes.length > 0 ? taskTypes[0].name : '', woreda: '', floor: '', coordinate_x: '', coordinate_y: '', description: '', attachment: null });
            setView('assign-task');
            fetchTasks();
        } catch (e) { alert('Error creating task'); }
    };

    const handleAutoAssign = async (taskId) => {
        try {
            await api.post('/api/tasks.php?action=assign', {
                task_id: taskId,
                target_user_id: null
            });
            fetchTasks();
        } catch (e) { alert('Error auto-assigning task'); }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        const targetDepartmentId = user?.is_super_admin === true
            ? Number(newUser.department_id || 0)
            : Number(user.department_id || 0);

        if (!targetDepartmentId && (user?.is_super_admin !== true || newUser.role !== 'super_admin')) {
            alert('Department is required');
            return;
        }

        try {
            if (editingUser) {
                const res = await api.post('/api/users.php?action=update', {
                    user_id: editingUser.id,
                    name: newUser.name,
                    email: newUser.email,
                    password: newUser.password || null,
                    role: newUser.role,
                    department_id: targetDepartmentId
                });
                if (res.data.success) {
                    alert('User updated successfully');
                    setEditingUser(null);
                    setNewUser({ name: '', email: '', password: '', role: 'staff', department_id: user?.is_super_admin === true ? (scopeDepartmentId || '') : String(user?.department_id ?? '') });
                    fetchUsers();
                    if (user?.is_super_admin === true) fetchDepartments();
                } else {
                    alert(res.data.error || 'Failed to update user');
                }
            } else {
                const res = await register(newUser.name, newUser.email, newUser.password, {
                    role: newUser.role,
                    department_id: targetDepartmentId
                });
                if (res.success) {
                    alert('User created successfully');
                    setNewUser({ name: '', email: '', password: '', role: 'staff', department_id: user?.is_super_admin === true ? (scopeDepartmentId || '') : String(user?.department_id ?? '') });
                    fetchUsers();
                    if (user?.is_super_admin === true) fetchDepartments();
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
            role: userToEdit.role,
            department_id: userToEdit.department_id ? String(userToEdit.department_id) : ''
        });
    };

    const cancelEdit = () => {
        setEditingUser(null);
        setNewUser({ name: '', email: '', password: '', role: 'staff', department_id: user?.is_super_admin === true ? (scopeDepartmentId || '') : String(user?.department_id ?? '') });
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

    const handleFreezeUser = async (userId, currentlyFrozen) => {
        const action = currentlyFrozen ? 'unfreeze' : 'freeze';
        const label = currentlyFrozen ? 'unfreeze' : 'freeze';
        if (!confirm(`Are you sure you want to ${label} this user?`)) return;

        try {
            const res = await api.post(`/api/users.php?action=${action}`, { user_id: userId });
            if (res.data.success) {
                fetchUsers();
            } else {
                alert(res.data.error || `Failed to ${label} user`);
            }
        } catch (e) { alert(`Failed to ${label} user`); }
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

    const handleCreateDepartment = async (e) => {
        e.preventDefault();
        try {
            const action = editingDepartmentId ? 'update' : 'create';
            const payload = editingDepartmentId
                ? { id: editingDepartmentId, name: newDepartmentName, is_active: true }
                : { name: newDepartmentName };
            const res = await api.post(`/api/departments.php?action=${action}`, payload);
            if (res.data.success) {
                setNewDepartmentName('');
                setEditingDepartmentId(null);
                fetchDepartments();
            } else {
                alert(res.data.error || `Failed to ${editingDepartmentId ? 'update' : 'create'} department`);
            }
        } catch (e) { alert(`Failed to ${editingDepartmentId ? 'update' : 'create'} department`); }
    };

    const startEditDepartment = (department) => {
        setEditingDepartmentId(department.id);
        setNewDepartmentName(department.name);
    };

    const cancelEditDepartment = () => {
        setEditingDepartmentId(null);
        setNewDepartmentName('');
    };

    const handleDeleteDepartment = async (departmentId) => {
        if (!confirm('Are you sure you want to delete this department?')) return;

        try {
            const res = await api.post('/api/departments.php?action=delete', { id: departmentId });
            if (res.data.success) {
                if (String(scopeDepartmentId) === String(departmentId)) {
                    setScopeDepartmentId('');
                }
                fetchDepartments();
            } else {
                alert(res.data.error || 'Failed to delete department');
            }
        } catch (e) { alert('Failed to delete department'); }
    };

    const getCompletionRate = (completed, assigned) => {
        const completedNum = Number(completed) || 0;
        const assignedNum = Number(assigned) || 0;
        return assignedNum > 0 ? Math.round((completedNum / assignedNum) * 100) : 0;
    };

    const formatTime = (seconds) => {
        const num = parseDurationSeconds(seconds);
        if (num === null) return 'N/A';
        if (num < 60) return `${Math.round(num)}s`;
        if (num < 3600) return `${Math.round(num / 60)}m`;
        return `${(num / 3600).toFixed(1)}h`;
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
            const fallbackName = `task-report-${sanitizeFileName(currentDepartmentName)}-${analyticsRange.startDate}-to-${analyticsRange.endDate}.xlsx`;
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
        return analyticsData.staff_stats
            .map(s => ({
                name: s.name.split(' ')[0],
                Completed: parseInt(s.total_completed) || 0,
                Pending: parseInt(s.total_pending) || 0,
                Ongoing: parseInt(s.total_ongoing) || 0,
            }))
            .sort((a, b) => (b.Completed - a.Completed) || a.name.localeCompare(b.name));
    };

    const getPerformanceData = () => {
        if (!analyticsData?.staff_stats) return [];
        return analyticsData.staff_stats
            .map(s => ({
                name: s.name.split(' ')[0],
                acceptTime: parseDurationSeconds(s.avg_accept_time),
                completeTime: parseDurationSeconds(s.avg_complete_time),
                totalCompleted: parseInt(s.total_completed) || 0,
            }))
            .filter(s => s.acceptTime !== null || s.completeTime !== null)
            .map(s => ({
                ...s,
                acceptTime: s.acceptTime !== null ? Math.round(s.acceptTime / 60) : 0,
                completeTime: s.completeTime !== null ? Math.round(s.completeTime / 60) : 0,
            }))
            .sort((a, b) => (b.totalCompleted - a.totalCompleted) || a.name.localeCompare(b.name));
    };

    const getTrendData = () => {
        if (!analyticsData?.tasks_per_day || !analyticsData?.completed_per_day) return [];
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
        analyticsData.tasks_per_day.forEach(d => {
            if (!combined[d.date]) {
                combined[d.date] = { sortKey: d.date, date: d.date, created: 0, completed: 0 };
            }
            combined[d.date].created = parseInt(d.count) || 0;
        });
        analyticsData.completed_per_day.forEach(d => {
            if (!combined[d.date]) {
                combined[d.date] = { sortKey: d.date, date: d.date, created: 0, completed: 0 };
            }
            combined[d.date].completed = parseInt(d.count) || 0;
        });
        return Object.values(combined)
            .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
            .map(({ sortKey, ...rest }) => rest);
    };

    const getLeaderboard = () => {
        if (!analyticsData?.staff_stats) return [];
        return [...analyticsData.staff_stats]
            .sort((a, b) => {
                const diffA = (parseInt(a.total_assigned) || 0) - (parseInt(a.total_completed) || 0);
                const diffB = (parseInt(b.total_assigned) || 0) - (parseInt(b.total_completed) || 0);
                if (diffA !== diffB) return diffA - diffB;
                const acceptA = parseDurationSeconds(a.avg_accept_time) ?? Number.MAX_SAFE_INTEGER;
                const acceptB = parseDurationSeconds(b.avg_accept_time) ?? Number.MAX_SAFE_INTEGER;
                return acceptA - acceptB;
            })
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
                    <h1 className="text-xl font-bold text-[#0078d4]">{user?.is_super_admin ? 'Lemikura Super Admin' : 'Lemikura Admin'}</h1>
                </div>
                <nav className="flex-1 overflow-y-auto py-2">
                    {/* ... nav items ... */}
                    <button onClick={() => { setView('dashboard'); setSidebarOpen(false); }} className={`w-full nav-link ${view === 'dashboard' ? 'active' : ''}`}>
                        <GoGraph /> Dashboard
                    </button>
                    {user?.is_super_admin === true && (
                        <button onClick={() => { setView('departments'); setSidebarOpen(false); }} className={`w-full nav-link ${view === 'departments' ? 'active' : ''}`}>
                            <GoAlertFill /> Departments
                        </button>
                    )}
                    <button onClick={() => { setView('assign-task'); setSidebarOpen(false); }} className={`w-full nav-link ${view === 'assign-task' ? 'active' : ''}`}>
                        <GoTasklist /> Assign Task
                    </button>
                    <button onClick={() => { setView('create'); setSidebarOpen(false); }} className={`w-full nav-link ${view === 'create' ? 'active' : ''}`}>
                        <GoPlus /> Create Task
                    </button>
                    <button onClick={() => { setView('create-user'); setSidebarOpen(false); }} className={`w-full nav-link ${view === 'create-user' ? 'active' : ''}`}>
                        <GoPerson /> Manage Users
                    </button>
                    <button onClick={() => { setView('task-types'); setSidebarOpen(false); }} className={`w-full nav-link ${view === 'task-types' ? 'active' : ''}`}>
                        <GoTasklist /> Task Types
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

                {user?.is_super_admin === true && view !== 'departments' && (
                    <div className="mb-4 bg-white p-4 rounded shadow-sm flex flex-col sm:flex-row gap-3 sm:items-end sm:justify-between">
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Department Scope</p>
                            <p className="text-sm text-[#323130]">Current scope: {currentDepartmentName}</p>
                        </div>
                        <div className="w-full sm:w-72">
                            <label className="block text-sm font-semibold mb-1">Choose Department</label>
                            <select
                                className="w-full p-2 border border-[#8a8886] focus:border-[#0078d4] outline-none rounded"
                                value={scopeDepartmentId}
                                onChange={e => setScopeDepartmentId(e.target.value)}
                            >
                                <option value="">All Departments</option>
                                {departments.map(department => (
                                    <option key={department.id} value={String(department.id)}>{department.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}

                {view === 'departments' && user?.is_super_admin === true && (
                    <div className="space-y-6">
                        <h2 className="ms-list-header flex items-center gap-2"><GoAlertFill /> Departments</h2>

                        <div className="w-full max-w-2xl bg-white p-4 sm:p-8 rounded shadow-sm">
                            <form onSubmit={handleCreateDepartment} className="flex flex-col sm:flex-row gap-2">
                                <input
                                    type="text"
                                    className="flex-1 p-2 border border-[#8a8886] focus:border-[#0078d4] outline-none rounded"
                                    placeholder="Enter department name..."
                                    value={newDepartmentName}
                                    onChange={e => setNewDepartmentName(e.target.value)}
                                    required
                                />
                                {editingDepartmentId && (
                                    <button type="button" onClick={cancelEditDepartment} className="ms-btn-secondary px-4 py-2 w-full sm:w-auto">Cancel</button>
                                )}
                                <button type="submit" className="ms-btn px-4 py-2 w-full sm:w-auto">{editingDepartmentId ? 'Update Department' : 'Create Department'}</button>
                            </form>
                        </div>

                        <div className="bg-white rounded shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm whitespace-nowrap min-w-[860px]">
                                    <thead className="bg-gray-50 border-b">
                                        <tr>
                                            <th className="text-left p-3 font-semibold text-gray-600">Department</th>
                                            <th className="text-center p-3 font-semibold text-gray-600">Admins</th>
                                            <th className="text-center p-3 font-semibold text-gray-600">Staff</th>
                                            <th className="text-center p-3 font-semibold text-gray-600">Task Types</th>
                                            <th className="text-center p-3 font-semibold text-gray-600">Tasks</th>
                                            <th className="text-center p-3 font-semibold text-gray-600">Status</th>
                                            <th className="text-right p-3 font-semibold text-gray-600">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {departments.map(department => (
                                            <tr key={department.id} className="border-b hover:bg-gray-50">
                                                <td className="p-3 font-medium">{department.name}</td>
                                                <td className="p-3 text-center">{department.admin_count ?? 0}</td>
                                                <td className="p-3 text-center">{department.staff_count ?? 0}</td>
                                                <td className="p-3 text-center">{department.task_type_count ?? 0}</td>
                                                <td className="p-3 text-center">{department.task_count ?? 0}</td>
                                                <td className="p-3 text-center">
                                                    <span className={`text-xs px-2 py-1 rounded ${department.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                                        {department.is_active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-right">
                                                    <div className="flex flex-col sm:flex-row justify-end gap-2">
                                                        <button onClick={() => startEditDepartment(department)} className="text-xs px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600">Edit</button>
                                                        <button onClick={() => handleDeleteDepartment(department.id)} className="text-xs px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600" disabled={department.id === 1}>
                                                            Delete
                                                        </button>
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


                {view === 'task-types' && (
                    <div className="w-full max-w-2xl bg-white p-4 sm:p-8 rounded shadow-sm">
                        <h2 className="ms-list-header flex items-center gap-2 mb-6"><GoTasklist /> Manage Task Types</h2>
                        
                        <form onSubmit={handleCreateTaskType} className="mb-8 flex flex-col sm:flex-row gap-2">
                            <input 
                                type="text" 
                                className="flex-1 p-2 border border-[#8a8886] focus:border-[#0078d4] outline-none rounded" 
                                placeholder="Enter new task type name..." 
                                value={newType} 
                                onChange={e => setNewType(e.target.value)} 
                                required 
                            />
                            <button type="submit" className="ms-btn px-4 py-2 w-full sm:w-auto">Add Type</button>
                        </form>

                        <div className="overflow-x-auto border border-[#e1dfdd] rounded">
                            <table className="w-full text-left text-sm whitespace-nowrap min-w-[400px]">
                                <thead className="bg-[#faf9f8] border-b border-[#e1dfdd]">
                                    <tr>
                                        <th className="p-3 font-semibold">Task Type Name</th>
                                        <th className="p-3 font-semibold text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {taskTypes.map(type => (
                                        <tr key={type.id} className="border-b border-[#e1dfdd] hover:bg-[#f3f2f1]">
                                            <td className="p-3">{type.name}</td>
                                            <td className="p-3 text-right">
                                                <button 
                                                    onClick={() => handleDeleteTaskType(type.id)} 
                                                    className="text-xs px-3 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {taskTypes.length === 0 && (
                                        <tr>
                                            <td colSpan="2" className="p-4 text-center text-gray-500">No task types found. Add one above.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {view === 'create' && (
                    <div className="w-full max-w-2xl bg-white p-4 sm:p-8 rounded shadow-sm">
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
                                        {taskTypes.map(type => (
                                            <option key={type.id} value={type.name}>{type.name}</option>
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
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold mb-1">Floor</label>
                                    <input
                                        type="number"
                                        min="0"
                                        className="w-full p-2 border border-[#8a8886] focus:border-[#0078d4] outline-none"
                                        value={newTask.floor}
                                        onChange={e => setNewTask({ ...newTask, floor: e.target.value })}
                                        placeholder="e.g. 3"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold mb-1">X Coordinate</label>
                                    <input
                                        type="number"
                                        step="any"
                                        className="w-full p-2 border border-[#8a8886] focus:border-[#0078d4] outline-none"
                                        value={newTask.coordinate_x}
                                        onChange={e => setNewTask({ ...newTask, coordinate_x: e.target.value })}
                                        placeholder="Latitude / X"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold mb-1">Y Coordinate</label>
                                    <input
                                        type="number"
                                        step="any"
                                        className="w-full p-2 border border-[#8a8886] focus:border-[#0078d4] outline-none"
                                        value={newTask.coordinate_y}
                                        onChange={e => setNewTask({ ...newTask, coordinate_y: e.target.value })}
                                        placeholder="Longitude / Y"
                                    />
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
                            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
                                <button type="button" onClick={() => setView('assign-task')} className="ms-btn-secondary px-4 py-1.5 w-full sm:w-auto">Cancel</button>
                                <button type="submit" className="ms-btn px-4 py-1.5 w-full sm:w-auto">Create Task</button>
                            </div>
                        </form>
                    </div>
                )}

                {view === 'create-user' && (
                    <div className="space-y-6">
                        <h2 className="ms-list-header flex items-center gap-2"><GoPerson /> User Management</h2>

                        {/* Create User Form */}
                        <div className="bg-white p-4 sm:p-6 rounded shadow-sm">
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
                                        <select className="w-full p-2 border border-[#8a8886] focus:border-[#0078d4] outline-none" value={newUser.role || ''} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                                            {roles.filter(r => user?.is_super_admin === true || !r.is_admin).map(r => (
                                                <option key={r.id} value={r.name}>{r.name} {r.is_admin ? '(Admin)' : ''}</option>
                                            ))}
                                            {roles.filter(r => user?.is_super_admin === true || !r.is_admin).length === 0 && <option value="staff">staff</option>}
                                        </select>
                                    </div>
                                </div>
                                {user?.is_super_admin === true && (
                                    <div>
                                        <label className="block text-sm font-semibold mb-1">Department</label>
                                        <select className="w-full p-2 border border-[#8a8886] focus:border-[#0078d4] outline-none" value={newUser.department_id || ''} onChange={e => setNewUser({ ...newUser, department_id: e.target.value })} required>
                                            <option value="">Select Department</option>
                                            {departments.map(department => (
                                                <option key={department.id} value={String(department.id)}>{department.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                                    {editingUser && (
                                        <button type="button" onClick={cancelEdit} className="px-4 py-1.5 border border-gray-300 rounded hover:bg-gray-50 w-full sm:w-auto">Cancel</button>
                                    )}
                                    <button type="submit" className="ms-btn px-4 py-1.5 w-full sm:w-auto">{editingUser ? 'Update User' : 'Create User'}</button>
                                </div>
                            </form>
                        </div>

                        {/* Roles Management UI under User Management */}
                        {user?.is_super_admin === true && (
                        <div className="bg-white p-4 sm:p-6 rounded shadow-sm">
                            <h3 className="text-lg font-semibold mb-4">Manage User Roles</h3>
                            <form onSubmit={handleCreateRole} className="mb-4 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                                <input 
                                    type="text" 
                                    className="flex-1 p-2 border border-[#8a8886] focus:border-[#0078d4] outline-none rounded" 
                                    placeholder="Enter new role name..." 
                                    value={newRole.name} 
                                    onChange={e => setNewRole({ ...newRole, name: e.target.value })} 
                                    required 
                                />
                                <label className="flex items-center gap-2 text-sm sm:whitespace-nowrap">
                                    <input 
                                        type="checkbox" 
                                        checked={newRole.is_admin} 
                                        onChange={e => setNewRole({ ...newRole, is_admin: e.target.checked })} 
                                    />
                                    Has Admin Access?
                                </label>
                                <button type="submit" className="ms-btn px-4 py-2 w-full sm:w-auto">Add Role</button>
                            </form>
                            
                            <div className="overflow-x-auto border border-[#e1dfdd] rounded">
                                <table className="w-full text-left text-sm whitespace-nowrap min-w-[500px]">
                                    <thead className="bg-[#faf9f8] border-b border-[#e1dfdd]">
                                        <tr>
                                            <th className="p-3 font-semibold">Role Name</th>
                                            <th className="p-3 font-semibold text-center">Type</th>
                                            <th className="p-3 font-semibold text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {roles.map(role => (
                                            <tr key={role.id} className="border-b border-[#e1dfdd] hover:bg-[#f3f2f1]">
                                                <td className="p-3">{role.name}</td>
                                                <td className="p-3 text-center">
                                                    {role.is_admin ? (
                                                        <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700">Admin</span>
                                                    ) : (
                                                        <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">Assignee</span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-right">
                                                    <button 
                                                        onClick={() => handleDeleteRole(role.id)} 
                                                        disabled={role.name === 'department_admin' || role.name === 'staff'}
                                                        className={`text-xs px-3 py-1 rounded ${role.name === 'department_admin' || role.name === 'staff' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        )}

                        {/* Users List */}
                        <div className="bg-white rounded shadow-sm overflow-hidden">
                            <div className="p-4 border-b bg-gray-50">
                                <h3 className="font-semibold mb-3">Existing Users</h3>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    {user?.is_super_admin && (
                                        <select
                                            className="p-2 border border-[#8a8886] text-sm outline-none"
                                            value={userSearch.department_id}
                                            onChange={e => setUserSearch({ ...userSearch, department_id: e.target.value })}
                                        >
                                            <option value="">All Departments</option>
                                            {departments.map(d => (
                                                <option key={d.id} value={String(d.id)}>{d.name}</option>
                                            ))}
                                        </select>
                                    )}
                                    <input
                                        className="p-2 border border-[#8a8886] text-sm outline-none flex-1"
                                        placeholder="Search by name..."
                                        value={userSearch.name}
                                        onChange={e => setUserSearch({ ...userSearch, name: e.target.value })}
                                    />
                                    <input
                                        className="p-2 border border-[#8a8886] text-sm outline-none flex-1"
                                        placeholder="Search by email..."
                                        value={userSearch.email}
                                        onChange={e => setUserSearch({ ...userSearch, email: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm whitespace-nowrap min-w-[600px]">
                                    <thead className="bg-gray-50 border-b">
                                        <tr>
                                            <th className="text-left p-3 font-semibold text-gray-600">Name</th>
                                            <th className="text-left p-3 font-semibold text-gray-600">Email</th>
                                            {user?.is_super_admin && <th className="text-left p-3 font-semibold text-gray-600">Department</th>}
                                            <th className="text-left p-3 font-semibold text-gray-600">Role</th>
                                            <th className="text-left p-3 font-semibold text-gray-600">Telegram</th>
                                            <th className="text-left p-3 font-semibold text-gray-600">Status</th>
                                            <th className="text-right p-3 font-semibold text-gray-600">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredUsers.map(u => (
                                            <tr key={u.id} className="border-b hover:bg-gray-50">
                                                <td className="p-3">{u.name}</td>
                                                <td className="p-3">{u.email}</td>
                                                {user?.is_super_admin && <td className="p-3">{u.department_name || 'Unassigned'}</td>}
                                                <td className="p-3">
                                                    <span className={`text-xs px-2 py-1 rounded ${(u.is_super_admin || roles.find(role => role.name === u.role)?.is_admin) ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                        {u.is_super_admin ? 'super_admin' : u.role}
                                                    </span>
                                                </td>
                                                <td className="p-3">
                                                    {u.telegram_chat_id ? (
                                                        <span className="text-xs text-green-600">✓ Linked</span>
                                                    ) : (
                                                        <span className="text-xs text-gray-400">Not linked</span>
                                                    )}
                                                </td>
                                                <td className="p-3">
                                                    {u.frozen ? (
                                                        <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700">Frozen</span>
                                                    ) : (
                                                        <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">Active</span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-right">
                                                    <div className="flex flex-col sm:flex-row justify-end gap-2">
                                                        <button onClick={() => startEdit(u)} className="text-xs px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600">Edit</button>
                                                        <button onClick={() => handleFreezeUser(u.id, u.frozen)} className={`text-xs px-3 py-1 text-white rounded ${u.frozen ? 'bg-green-500 hover:bg-green-600' : 'bg-orange-500 hover:bg-orange-600'}`} disabled={u.is_super_admin}>{u.frozen ? 'Unfreeze' : 'Freeze'}</button>
                                                        <button onClick={() => handleDeleteUser(u.id)} className="text-xs px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600" disabled={u.is_super_admin}>Delete</button>
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
                        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
                            <div>
                                <h2 className="ms-list-header flex items-center gap-2 mb-1"><GoGraph /> Dashboard</h2>
                                <p className="text-sm text-[#605e5c]">Scope: {currentDepartmentName}</p>
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
                        <p className="text-sm text-[#605e5c]">Showing analytics for {analyticsData.range?.label || `${analyticsRange.startDate} - ${analyticsRange.endDate}`}</p>

                        {analyticsLoading && (
                            <div className="ms-card text-sm text-gray-500">Refreshing analytics...</div>
                        )}

                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                            <div className="ms-card flex items-center gap-4">
                                <div className="w-12 h-12 rounded-lg bg-[#0078d4]/10 flex items-center justify-center text-[#0078d4]">
                                    <GoTasklist size={24} />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-[#323130]">{allTimeSummary.total_tasks || 0}</p>
                                    <p className="text-xs text-[#605e5c]">Total Tasks</p>
                                </div>
                            </div>
                            <div className="ms-card flex items-center gap-4">
                                <div className="w-12 h-12 rounded-lg bg-[#107c10]/10 flex items-center justify-center text-[#107c10]">
                                    <GoCheckCircleFill size={24} />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-[#323130]">{allTimeSummary.completed_tasks || 0}</p>
                                    <p className="text-xs text-[#605e5c]">Completed</p>
                                </div>
                            </div>
                            <div className="ms-card flex items-center gap-4">
                                <div className="w-12 h-12 rounded-lg bg-[#d83b01]/10 flex items-center justify-center text-[#d83b01]">
                                    <GoGraph size={24} />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-[#323130]">{summaryCompletionRate}%</p>
                                    <p className="text-xs text-[#605e5c]">Completion Rate</p>
                                </div>
                            </div>
                            <div className="ms-card flex items-center gap-4">
                                <div className="w-12 h-12 rounded-lg bg-[#ffb900]/10 flex items-center justify-center text-[#ffb900]">
                                    <GoClockFill size={24} />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-[#323130]">{formatTime(allTimeSummary.overall_avg_accept)}</p>
                                    <p className="text-xs text-[#605e5c]">Avg. Accept</p>
                                </div>
                            </div>
                            <div className="ms-card flex items-center gap-4">
                                <div className="w-12 h-12 rounded-lg bg-[#8764b8]/10 flex items-center justify-center text-[#8764b8]">
                                    <GoClockFill size={24} />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-[#323130]">{formatTime(allTimeSummary.overall_avg_complete)}</p>
                                    <p className="text-xs text-[#605e5c]">Avg. Complete</p>
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
                                    <table className="w-full text-left text-sm whitespace-nowrap min-w-[760px]">
                                        <thead className="bg-[#faf9f8] border-b border-[#e1dfdd]">
                                            <tr>
                                                <th className="p-3 font-semibold cursor-pointer select-none hover:text-[#0078d4]" onClick={() => handlePerfSort('name')}>Staff{renderSortArrow('name')}</th>
                                                {user?.is_super_admin === true && <th className="p-3 font-semibold cursor-pointer select-none hover:text-[#0078d4]" onClick={() => handlePerfSort('department_name')}>Department{renderSortArrow('department_name')}</th>}
                                                <th className="p-3 font-semibold text-center cursor-pointer select-none hover:text-[#0078d4]" onClick={() => handlePerfSort('total_assigned')}>Assigned{renderSortArrow('total_assigned')}</th>
                                                <th className="p-3 font-semibold text-center cursor-pointer select-none hover:text-[#0078d4]" onClick={() => handlePerfSort('total_completed')}>Completed{renderSortArrow('total_completed')}</th>
                                                <th className="p-3 font-semibold text-center cursor-pointer select-none hover:text-[#0078d4]" onClick={() => handlePerfSort('completion_rate')}>Completion %{renderSortArrow('completion_rate')}</th>
                                                <th className="p-3 font-semibold text-right cursor-pointer select-none hover:text-[#0078d4]" onClick={() => handlePerfSort('avg_accept_time')}>Avg Accept{renderSortArrow('avg_accept_time')}</th>
                                                <th className="p-3 font-semibold text-right cursor-pointer select-none hover:text-[#0078d4]" onClick={() => handlePerfSort('avg_complete_time')}>Avg Complete{renderSortArrow('avg_complete_time')}</th>
                                                <th className="p-3 font-semibold text-right cursor-pointer select-none hover:text-[#0078d4]" onClick={() => handlePerfSort('last_completed_at')}>Last Completed{renderSortArrow('last_completed_at')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {staffStats.map(stat => {
                                                const rate = getCompletionRate(stat.total_completed, stat.total_assigned);
                                                return (
                                                    <tr key={stat.id} className="border-b border-[#e1dfdd] hover:bg-[#f3f2f1]">
                                                        <td className="p-3 font-medium">{stat.name}</td>
                                                        {user?.is_super_admin === true && <td className="p-3">{stat.department_name || 'Unassigned'}</td>}
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
                                                        <td className="p-3 text-right text-xs text-[#605e5c]">{formatDateTimeLabel(stat.last_completed_at)}</td>
                                                    </tr>
                                                );
                                            })}
                                            {staffStats.length === 0 && (
                                                <tr>
                                                    <td colSpan={user?.is_super_admin === true ? 8 : 7} className="p-4 text-center text-gray-500">No staff analytics available yet.</td>
                                                </tr>
                                            )}
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
                            
                            <div className="flex flex-wrap items-center justify-center gap-3 mt-2 md:mt-0 bg-white px-4 py-2 rounded-2xl shadow-sm border border-gray-200">
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
                            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-7 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold mb-1">Task Type</label>
                                    <select
                                        className="w-full text-sm p-2 border border-gray-300 rounded focus:border-[#0078d4] outline-none"
                                        value={filters.task_type}
                                        onChange={(e) => setFilters({ ...filters, task_type: e.target.value })}
                                    >
                                        <option value="">All Types</option>
                                        {taskTypes.map(type => (
                                            <option key={type.id} value={type.name}>{type.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1">Search Description</label>
                                    <input
                                        type="text"
                                        className="w-full text-sm p-2 border border-gray-300 rounded focus:border-[#0078d4] outline-none"
                                        value={filters.description}
                                        onChange={(e) => setFilters({ ...filters, description: e.target.value })}
                                        placeholder="Search task description"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1">Floor</label>
                                    <input
                                        type="number"
                                        min="0"
                                        className="w-full text-sm p-2 border border-gray-300 rounded focus:border-[#0078d4] outline-none"
                                        value={filters.floor}
                                        onChange={(e) => setFilters({ ...filters, floor: e.target.value })}
                                        placeholder="All Floors"
                                    />
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
                                    <label className="block text-xs font-semibold mb-1">Assigned User</label>
                                    <select
                                        className="w-full text-sm p-2 border border-gray-300 rounded focus:border-[#0078d4] outline-none"
                                        value={filters.assigned_to}
                                        onChange={(e) => setFilters({ ...filters, assigned_to: e.target.value })}
                                    >
                                        <option value="">All Users</option>
                                        <option value="unassigned">Unassigned</option>
                                        {assignableUsers.map(u => (
                                            <option key={u.id} value={String(u.id)}>{u.name}</option>
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

                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 text-sm text-gray-600">
                            <span>{filteredTasks.length} task(s) across {dateGroups.length} day(s) — {pageDateLabel}</span>
                            <span>Page {safePage} of {totalDatePages}</span>
                        </div>

                        {filteredTasks.length === 0 ? (
                            <div className="ms-card text-center py-12 text-gray-500">
                                No tasks match the current filters.
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {paginatedTasks.map(task => (
                                        <div key={task.id} className="relative group">
                                            <TaskCard task={task} role="admin" user={user} onUpdate={fetchTasks} />
                                            {!task.assigned_to && (
                                                <div className="absolute top-4 right-12 sm:right-4">
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
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6">
                                    <button
                                        onClick={() => setCurrentTaskPage(prev => Math.max(1, prev - 1))}
                                        disabled={safePage === 1}
                                        className="ms-btn-secondary px-4 py-2 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Previous
                                    </button>
                                    <div className="flex flex-wrap items-center justify-center gap-2">
                                        {pageNumbers.map((page, idx) =>
                                            page === '...' ? (
                                                <span key={`ellipsis-${idx}`} className="px-2 text-gray-400">...</span>
                                            ) : (
                                                <button
                                                    key={page}
                                                    onClick={() => setCurrentTaskPage(page)}
                                                    className={`px-3 py-1.5 rounded text-sm border ${safePage === page ? 'bg-[#0078d4] text-white border-[#0078d4]' : 'bg-white text-[#323130] border-gray-300 hover:bg-gray-50'}`}
                                                >
                                                    {page}
                                                </button>
                                            )
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setCurrentTaskPage(prev => Math.min(totalDatePages, prev + 1))}
                                        disabled={safePage === totalDatePages}
                                        className="ms-btn-secondary px-4 py-2 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Next
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Assignment Modal */}
                {assignModalOpen && (
                    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                        <div className="bg-white w-full max-w-[400px] p-6 shadow-xl rounded-sm">
                            <h3 className="text-lg font-semibold mb-4">Assign Task</h3>
                            <div className="mb-6">
                                <label className="block text-sm font-semibold mb-2">Select Staff Member</label>
                                <select
                                    className="w-full p-2 border border-[#8a8886] outline-none text-sm"
                                    value={manualUser}
                                    onChange={(e) => setManualUser(e.target.value)}
                                >
                                    <option value="">-- Auto (Fairness Algorithm) --</option>
                                    {manualAssignableUsers.map(u => (
                                        <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                                    ))}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">Leave empty to auto-assign based on fairness.</p>
                            </div>
                            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
                                <button onClick={() => setAssignModalOpen(false)} className="ms-btn-secondary px-4 py-1.5 w-full sm:w-auto">Cancel</button>
                                <button onClick={() => handleAssign(!!manualUser)} className="ms-btn px-4 py-1.5 w-full sm:w-auto">
                                    {manualUser ? 'Assign to Selected' : 'Auto Assign'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default AdminDashboard;
