import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import TaskCard from '../components/TaskCard';
import api from '../utils/api';
import { GoTasklist, GoSignOut } from "react-icons/go";

const StaffDashboard = () => {
    const { user, logout } = useAuth();
    const [tasks, setTasks] = useState([]);

    const fetchTasks = async () => {
        try {
            const res = await api.get(`/api/tasks.php?role=staff&user_id=${user.id}`);
            if (res.data.success) {
                setTasks(res.data.tasks);
            }
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        if (user) fetchTasks();
    }, [user]);

    return (
        <div className="flex min-h-screen bg-[#f3f2f1]">
            <aside className="w-64 bg-white border-r border-[#e1dfdd] flex-shrink-0 flex flex-col">
                <div className="p-4 border-b border-[#e1dfdd]">
                    <h1 className="text-xl font-bold text-[#0078d4]">My Portal</h1>
                </div>
                <nav className="flex-1 overflow-y-auto py-2">
                    <div className="w-full nav-link active">
                        <GoTasklist /> My Tasks
                    </div>
                </nav>
                <div className="p-4 border-t border-[#e1dfdd]">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-[#0078d4] text-white flex items-center justify-center text-xs">
                            {user.name.charAt(0)}
                        </div>
                        <div className="text-sm truncate font-medium">{user.name}</div>
                    </div>
                    <button onClick={logout} className="text-xs text-[#0078d4] hover:underline flex items-center gap-1">
                        <GoSignOut /> Sign out
                    </button>
                </div>
            </aside>

            <main className="flex-1 p-8 overflow-y-auto">
                <h2 className="ms-list-header flex items-center gap-2"><GoTasklist /> My Tasks</h2>
                {tasks.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        No tasks assigned to you.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {tasks.map(task => (
                            <TaskCard key={task.id} task={task} role="staff" onUpdate={fetchTasks} user={user} />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default StaffDashboard;
