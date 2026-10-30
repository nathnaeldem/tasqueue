import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { GoDownload, GoComment, GoPaperclip, GoTrash, GoX } from 'react-icons/go';

const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:8000';

const UTM_ZONE = 37;

const utmToLatLng = (easting, northing, zone = UTM_ZONE, northernHemisphere = true) => {
    const a = 6378137;
    const eccSquared = 0.00669438;
    const k0 = 0.9996;
    const eccPrimeSquared = eccSquared / (1 - eccSquared);
    const e1 = (1 - Math.sqrt(1 - eccSquared)) / (1 + Math.sqrt(1 - eccSquared));
    const x = easting - 500000;
    const y = northernHemisphere ? northing : northing - 10000000;
    const longOrigin = (zone - 1) * 6 - 180 + 3;
    const m = y / k0;
    const mu = m / (a * (1 - eccSquared / 4 - (3 * eccSquared * eccSquared) / 64 - (5 * eccSquared * eccSquared * eccSquared) / 256));
    const phi1Rad = mu
        + ((3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32) * Math.sin(2 * mu)
        + ((21 * e1 * e1) / 16 - (55 * Math.pow(e1, 4)) / 32) * Math.sin(4 * mu)
        + ((151 * Math.pow(e1, 3)) / 96) * Math.sin(6 * mu)
        + ((1097 * Math.pow(e1, 4)) / 512) * Math.sin(8 * mu);
    const sinPhi1 = Math.sin(phi1Rad);
    const cosPhi1 = Math.cos(phi1Rad);
    const tanPhi1 = Math.tan(phi1Rad);
    const n1 = a / Math.sqrt(1 - eccSquared * sinPhi1 * sinPhi1);
    const t1 = tanPhi1 * tanPhi1;
    const c1 = eccPrimeSquared * cosPhi1 * cosPhi1;
    const r1 = (a * (1 - eccSquared)) / Math.pow(1 - eccSquared * sinPhi1 * sinPhi1, 1.5);
    const d = x / (n1 * k0);
    const latRad = phi1Rad - ((n1 * tanPhi1) / r1) * (
        (d * d) / 2
        - ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * eccPrimeSquared) * Math.pow(d, 4)) / 24
        + ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * eccPrimeSquared - 3 * c1 * c1) * Math.pow(d, 6)) / 720
    );
    const lonRad = (
        d
        - ((1 + 2 * t1 + c1) * Math.pow(d, 3)) / 6
        + ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * eccPrimeSquared + 24 * t1 * t1) * Math.pow(d, 5)) / 120
    ) / cosPhi1;

    return {
        lat: (latRad * 180) / Math.PI,
        lng: longOrigin + (lonRad * 180) / Math.PI,
    };
};

const getGoogleMapsUrl = (coordinateX, coordinateY) => {
    const x = Number(coordinateX);
    const y = Number(coordinateY);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return '';
    }

    if (Math.abs(x) <= 90 && Math.abs(y) <= 180) {
        return `https://www.google.com/maps?q=${encodeURIComponent(`${x},${y}`)}`;
    }

    if (x >= 100000 && x <= 1000000 && y >= 0 && y <= 10000000) {
        const { lat, lng } = utmToLatLng(x, y);
        return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
    }

    return '';
};

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

    const hasCoordinates = task.coordinate_x !== null
        && task.coordinate_x !== ''
        && task.coordinate_y !== null
        && task.coordinate_y !== '';
    const mapUrl = hasCoordinates ? getGoogleMapsUrl(task.coordinate_x, task.coordinate_y) : '';
    const createdAtLabel = task.created_at
        ? new Date(task.created_at).toLocaleString()
        : null;

    const handleOpenLocation = () => {
        if (!mapUrl) {
            alert('Task coordinates are invalid');
            return;
        }

        window.open(mapUrl, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="ms-card flex flex-col h-full relative overflow-hidden">
            <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                <button
                    onClick={() => setShowChat(!showChat)}
                    className="p-1.5 text-gray-400 hover:text-[#0078d4] hover:bg-gray-100 rounded"
                    title="Task Chat"
                >
                    <GoComment size={16} />
                </button>
                {role === 'admin' && (
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
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Delete Task"
                    >
                        <GoTrash size={16} />
                    </button>
                )}
            </div>

            <div className="flex justify-between items-start gap-3 mb-2 pr-20">
                <div className="flex-1">
                    <h3 className="font-bold text-lg text-[#323130] mb-1">{task.task_type}</h3>
                    <div className="flex flex-wrap gap-2">
                        {task.woreda && (
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                                Woreda {task.woreda}
                            </span>
                        )}
                        {(task.floor !== null && task.floor !== '' && task.floor !== undefined) && (
                            <span className="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-700">
                                Floor {task.floor}
                            </span>
                        )}
                        {hasCoordinates && (
                            <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 break-all">
                                {task.coordinate_x}, {task.coordinate_y}
                            </span>
                        )}
                    </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${statusColors[task.status]}`}>
                    {task.status}
                </span>
            </div>

            {createdAtLabel && (
                <div className="text-xs text-gray-500 mb-3">
                    Created: {createdAtLabel}
                </div>
            )}

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
                            className="flex items-start gap-1 text-xs text-blue-600 hover:underline break-all"
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
                            className="flex items-start gap-1 text-xs text-green-600 hover:underline break-all"
                        >
                            <GoDownload /> {att.file_path.split('_').slice(1).join('_') || att.file_path}
                        </a>
                    ))}
                </div>
            )}

            {role === 'admin' && task.assignee_name && (
                <div className="text-xs text-gray-500 pt-2 border-t border-gray-100">
                    Assigned to: <strong>{task.assignee_name}</strong>
                </div>
            )}

            {role === 'staff' && (
                <div className="mt-auto pt-4 border-t border-gray-100 space-y-2">
                    {hasCoordinates && (
                        <button
                            onClick={handleOpenLocation}
                            className="ms-btn-secondary w-full text-center block"
                            type="button"
                        >
                            Open Location
                        </button>
                    )}
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
            {role === 'admin' && task.status !== 'draft' && task.status !== 'completed' && (
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
                                    className={`p-3 rounded-lg max-w-[90%] sm:max-w-[80%] break-words ${c.user_id == user?.id
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
                                            className={`flex items-start gap-1 text-xs mt-2 break-all ${c.user_id == user?.id ? 'text-blue-200' : 'text-blue-600'}`}
                                        >
                                            <GoPaperclip /> Download Attachment
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Input */}
                        <div className="p-3 border-t bg-white">
                            <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                    type="text"
                                    placeholder="Type a message..."
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && sendComment()}
                                    className="flex-1 p-2 border rounded-lg text-sm outline-none focus:border-[#0078d4]"
                                />
                                <label className="p-2 border rounded-lg cursor-pointer hover:bg-gray-50 flex items-center justify-center sm:justify-start">
                                    <GoPaperclip className="text-gray-400" />
                                    <input type="file" className="hidden" onChange={(e) => setChatFile(e.target.files[0])} />
                                </label>
                                <button
                                    onClick={sendComment}
                                    disabled={sendingComment}
                                    className="px-4 py-2 bg-[#0078d4] text-white rounded-lg text-sm font-medium hover:bg-[#106ebe] disabled:opacity-50 w-full sm:w-auto"
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
