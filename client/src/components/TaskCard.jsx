import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { GoDownload, GoComment, GoPaperclip, GoX } from 'react-icons/go';

const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:8000';

const TaskCard = ({ task, role, onUpdate, user }) => {
    const [uploading, setUploading] = useState(false);
    const [evidenceFile, setEvidenceFile] = useState(null);
    const [showChat, setShowChat] = useState(false);
    const [comments, setComments] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [chatFile, setChatFile] = useState(null);
    const [sendingComment, setSendingComment] = useState(false);

    // Separate attachments by type
    const briefAttachments = (task.attachments || []).filter(a => a.file_type === 'brief');
    const evidenceAttachments = (task.attachments || []).filter(a => a.file_type === 'evidence');

    const handleCompleteWithFile = async () => {
        setUploading(true);
        const formData = new FormData();
        formData.append('task_id', task.id);
        formData.append('status', 'completed');
        formData.append('user_id', task.assigned_to);

        if (evidenceFile) {
            formData.append('evidence', evidenceFile);
        }

        try {
            await api.post('/api/tasks.php?action=update_status', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            onUpdate();
        } catch (e) {
            alert('Failed to complete task');
        } finally {
            setUploading(false);
            setEvidenceFile(null);
        }
    };

    const handleStatusChange = async (newStatus) => {
        try {
            await api.post('/api/tasks.php?action=update_status', {
                task_id: task.id,
                status: newStatus,
                user_id: task.assigned_to
            });
            onUpdate();
        } catch (e) {
            alert('Failed to update status');
        }
    };

    const fetchComments = async () => {
        try {
            const res = await api.get(`/api/comments.php?task_id=${task.id}`);
            if (res.data.success) setComments(res.data.comments);
        } catch (e) { console.error(e); }
    };

    const sendComment = async () => {
        if (!newMessage.trim() && !chatFile) return;
        setSendingComment(true);

        const formData = new FormData();
        formData.append('task_id', task.id);
        formData.append('user_id', user?.id);
        formData.append('message', newMessage);
        if (chatFile) formData.append('attachment', chatFile);

        try {
            const res = await api.post('/api/comments.php', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data.success) {
                setComments([...comments, res.data.comment]);
                setNewMessage('');
                setChatFile(null);
            }
        } catch (e) { console.error(e); }
        finally { setSendingComment(false); }
    };

    useEffect(() => {
        if (showChat) fetchComments();
    }, [showChat]);

    const statusColors = {
        draft: 'bg-gray-100 text-gray-600',
        pending: 'bg-yellow-100 text-yellow-800',
        ongoing: 'bg-blue-100 text-blue-800',
        completed: 'bg-green-100 text-green-800',
    };

    return (
        <div className="ms-card flex flex-col h-full relative">
            <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                    <h3 className="font-bold text-lg text-[#323130] mb-1">{task.task_type}</h3>
                    {task.woreda && (
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                            Woreda {task.woreda}
                        </span>
                    )}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[task.status]}`}>
                    {task.status}
                </span>
            </div>

            <p className="text-sm text-[#605e5c] flex-grow mb-4">{task.description}</p>

            {/* Brief/Instruction Attachments */}
            {briefAttachments.length > 0 && (
                <div className="mb-3 p-2 bg-blue-50 rounded-lg">
                    <p className="text-xs font-semibold text-blue-700 mb-1">📋 Task Instructions:</p>
                    {briefAttachments.map(att => (
                        <a
                            key={att.id}
                            href={`${API_BASE}/api/uploads/${att.file_path}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                            <GoDownload /> {att.file_path.split('_').slice(1).join('_') || att.file_path}
                        </a>
                    ))}
                </div>
            )}

            {/* Evidence Attachments (for completed) */}
            {evidenceAttachments.length > 0 && (
                <div className="mb-3 p-2 bg-green-50 rounded-lg">
                    <p className="text-xs font-semibold text-green-700 mb-1">✅ Submitted Evidence:</p>
                    {evidenceAttachments.map(att => (
                        <a
                            key={att.id}
                            href={`${API_BASE}/api/uploads/${att.file_path}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-green-600 hover:underline"
                        >
                            <GoDownload /> {att.file_path.split('_').slice(1).join('_') || att.file_path}
                        </a>
                    ))}
                </div>
            )}

            {role === 'manager' && task.assignee_name && (
                <div className="text-xs text-gray-500 pt-2 border-t border-gray-100">
                    Assigned to: <strong>{task.assignee_name}</strong>
                </div>
            )}

            {/* Admin Delete Button */}
            {role === 'manager' && (
                <div className="mt-auto pt-2">
                    <button
                        onClick={async () => {
                            if (!confirm('Are you sure you want to delete this task? This action cannot be undone.')) return;
                            try {
                                await api.post('/api/tasks.php?action=delete', { task_id: task.id });
                                onUpdate();
                            } catch (e) {
                                alert('Failed to delete task');
                            }
                        }}
                        className="text-xs px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 w-full"
                    >
                        Delete Task
                    </button>
                </div>
            )}

            {role === 'staff' && (
                <div className="mt-auto pt-4 border-t border-gray-100 space-y-2">
                    {task.status === 'pending' && (
                        <button onClick={() => handleStatusChange('ongoing')} className="ms-btn w-full">
                            Accept Task
                        </button>
                    )}
                    {task.status === 'ongoing' && (
                        <div className="space-y-2">
                            <label className="block w-full text-xs text-gray-500 cursor-pointer hover:text-blue-600">
                                <span className="mb-1 block">📎 Attach Evidence (Optional)</span>
                                <input
                                    type="file"
                                    className="text-xs w-full"
                                    onChange={(e) => setEvidenceFile(e.target.files[0])}
                                    disabled={uploading}
                                />
                            </label>
                            {evidenceFile && (
                                <p className="text-xs text-green-600">📄 {evidenceFile.name}</p>
                            )}
                            <button
                                onClick={handleCompleteWithFile}
                                className="ms-btn w-full py-2"
                                disabled={uploading}
                            >
                                {uploading ? 'Submitting...' : 'Mark Complete'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Admin Controls */}
            {role === 'manager' && task.status !== 'draft' && task.status !== 'completed' && (
                <div className="mt-auto pt-4 border-t border-gray-100 space-y-2">
                    {task.status === 'pending' && (
                        <button
                            onClick={() => handleStatusChange('ongoing')}
                            className="ms-btn-secondary w-full text-xs py-1.5"
                        >
                            Mark as Ongoing
                        </button>
                    )}
                    {(task.status === 'pending' || task.status === 'ongoing') && (
                        <button
                            onClick={() => handleStatusChange('completed')}
                            className="ms-btn w-full text-xs py-1.5"
                        >
                            Mark as Completed
                        </button>
                    )}
                </div>
            )}

            {/* Chat Toggle Button */}
            <button
                onClick={() => setShowChat(!showChat)}
                className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-[#0078d4] hover:bg-gray-100 rounded"
                title="Task Chat"
            >
                <GoComment size={16} />
            </button>

            {/* Chat Modal */}
            {showChat && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white w-full max-w-md rounded-lg shadow-xl flex flex-col max-h-[80vh]">
                        {/* Header */}
                        <div className="p-4 border-b flex justify-between items-center">
                            <h4 className="font-semibold">Task Chat</h4>
                            <button onClick={() => setShowChat(false)} className="text-gray-400 hover:text-gray-600">
                                <GoX size={20} />
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                            {comments.length === 0 && (
                                <p className="text-sm text-gray-400 text-center">No messages yet.</p>
                            )}
                            {comments.map(c => (
                                <div
                                    key={c.id}
                                    className={`p-3 rounded-lg max-w-[80%] ${c.user_id == user?.id
                                        ? 'bg-[#0078d4] text-white ml-auto'
                                        : 'bg-white border'
                                        }`}
                                >
                                    <p className={`text-xs font-semibold mb-1 ${c.user_id == user?.id ? 'text-blue-200' : 'text-gray-500'}`}>
                                        {c.user_name} ({c.user_role})
                                    </p>
                                    <p className="text-sm">{c.message}</p>
                                    {c.attachment_path && (
                                        <a
                                            href={`${API_BASE}/api/uploads/comments/${c.attachment_path}`}
                                            target="_blank"
                                            className={`flex items-center gap-1 text-xs mt-2 ${c.user_id == user?.id ? 'text-blue-200' : 'text-blue-600'}`}
                                        >
                                            <GoPaperclip /> Download Attachment
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Input */}
                        <div className="p-3 border-t bg-white">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Type a message..."
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && sendComment()}
                                    className="flex-1 p-2 border rounded-lg text-sm outline-none focus:border-[#0078d4]"
                                />
                                <label className="p-2 border rounded-lg cursor-pointer hover:bg-gray-50">
                                    <GoPaperclip className="text-gray-400" />
                                    <input type="file" className="hidden" onChange={(e) => setChatFile(e.target.files[0])} />
                                </label>
                                <button
                                    onClick={sendComment}
                                    disabled={sendingComment}
                                    className="px-4 py-2 bg-[#0078d4] text-white rounded-lg text-sm font-medium hover:bg-[#106ebe] disabled:opacity-50"
                                >
                                    Send
                                </button>
                            </div>
                            {chatFile && (
                                <p className="text-xs text-green-600 mt-1">📎 {chatFile.name}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TaskCard;
