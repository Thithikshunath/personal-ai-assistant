import { useState, useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import TextareaAutosize from 'react-textarea-autosize';
import { Toaster, toast } from 'react-hot-toast';
import { FaBars, FaTrash, FaCog, FaPlus, FaCopy, FaCheck, FaPencilAlt } from 'react-icons/fa';

import 'katex/dist/katex.min.css';
import './index.css';

// --- TYPE DEFINITIONS ---
type Message = { role: 'user' | 'assistant' | 'system' | 'tool'; content: string };
type Confirmation = { type: 'search'; query: string } | { type: 'memory'; summary: string };
type SavedChat = { id: number; title: string };
type Profile = { name: string; key_facts: string[]; main_goals: string[] };
type AvatarState = 'idle' | 'thinking';
type SearchProvider = 'brave' | 'ddgs';

// --- CONSTANTS ---
const API_BASE_URL = "http://localhost:8000";
const INITIAL_MESSAGES: Message[] = [
    { role: 'system', content: 'You are a helpful and intelligent AI assistant.' },
    { role: 'assistant', content: 'Hello! How can I help you today?' },
];

// --- HELPER COMPONENTS ---
const CodeBlock = ({ node, inline, className, children, ...props }: any) => {
    const [isCopied, setIsCopied] = useState(false);
    const match = /language-(\w+)/.exec(className || '');
    const codeText = String(children).replace(/\n$/, '');
    const handleCopy = () => { navigator.clipboard.writeText(codeText); setIsCopied(true); toast.success("Copied!"); setTimeout(() => setIsCopied(false), 2000); };
    return !inline && match ? (
        <div className="code-block-wrapper">
            <button className="copy-code-btn" onClick={handleCopy}>{isCopied ? <FaCheck /> : <FaCopy />}</button>
            <SyntaxHighlighter style={atomDark} language={match[1]} PreTag="div" {...props}>{codeText}</SyntaxHighlighter>
        </div>
    ) : <code className={className} {...props}>{children}</code>;
};

const SettingsModal = ({ isOpen, onClose, persona, setPersona, profile, setProfile, onSave, settings, setSettings }: any) => {
    if (!isOpen) return null;
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2>Personalization Settings</h2>
                <div className="setting-section">
                    <h3>Assistant Persona</h3> <p>Define how your assistant should behave.</p>
                    <TextareaAutosize className="settings-textarea" value={persona} onChange={(e) => setPersona(e.target.value)} minRows={5} />
                </div>
                <div className="setting-section">
                    <h3>Your Profile</h3> <p>Help your assistant remember key facts about you.</p>
                    <label>Your Name</label>
                    <input type="text" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
                    <label>Key Facts About You (one per line)</label>
                    <TextareaAutosize className="settings-textarea" value={profile.key_facts.join('\n')} onChange={(e) => setProfile({ ...profile, key_facts: e.target.value.split('\n') })} minRows={3} />
                </div>
                <div className="setting-section">
                    <h3>Web Search</h3>
                    <div className="toggle-switch-wrapper">
                        <label>Enable Web Search</label>
                        <label className="toggle-switch"><input type="checkbox" checked={settings.webSearchEnabled} onChange={() => setSettings({ ...settings, webSearchEnabled: !settings.webSearchEnabled })} /><span className="slider"></span></label>
                    </div>
                    <div className={`radio-group ${!settings.webSearchEnabled ? 'disabled' : ''}`}>
                        <label><input type="radio" value="brave" checked={settings.provider === 'brave'} onChange={(e) => setSettings({ ...settings, provider: e.target.value as SearchProvider })} disabled={!settings.webSearchEnabled} /> Brave API</label>
                        <label><input type="radio" value="ddgs" checked={settings.provider === 'ddgs'} onChange={(e) => setSettings({ ...settings, provider: e.target.value as SearchProvider })} disabled={!settings.webSearchEnabled} /> DuckDuckGo</label>
                    </div>
                </div>
                <div className="setting-section">
                    <h3>Appearance</h3>
                    <div className="toggle-switch-wrapper">
                        <label>Animated Aurora Background</label>
                        <label className="toggle-switch"><input type="checkbox" checked={settings.isAnimated} onChange={() => setSettings({ ...settings, isAnimated: !settings.isAnimated })} /><span className="slider"></span></label>
                    </div>
                </div>
                <div className="modal-actions">
                    <button onClick={onClose} className="btn-secondary">Cancel</button>
                    <button onClick={onSave} className="btn-primary">Save Changes</button>
                </div>
            </div>
        </div>
    );
};

function App() {
    // --- STATE MANAGEMENT ---
    const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
    const [savedChats, setSavedChats] = useState<SavedChat[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [currentChatId, setCurrentChatId] = useState<number | null>(null);
    const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set());
    const [editingMessage, setEditingMessage] = useState<{ index: number; text: string } | null>(null);
    const chatWindowRef = useRef<HTMLDivElement>(null);

    // Settings & Personalization State
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [avatarState, setAvatarState] = useState<AvatarState>('idle');
    const [persona, setPersona] = useState('');
    const [profile, setProfile] = useState<Profile>({ name: '', key_facts: [], main_goals: [] });
    const [tempPersona, setTempPersona] = useState('');
    const [tempProfile, setTempProfile] = useState<Profile>({ name: '', key_facts: [], main_goals: [] });

    const [settings, setSettings] = useState({
        isAnimated: true,
        webSearchEnabled: true,
        provider: 'brave' as SearchProvider,
    });

    // --- EFFECTS ---
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [chatsRes, personaRes, profileRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/chats`),
                    fetch(`${API_BASE_URL}/api/persona`),
                    fetch(`${API_BASE_URL}/api/profile`),
                ]);
                setSavedChats(await chatsRes.json());
                const personaData = await personaRes.json();
                setPersona(personaData.persona);
                setTempPersona(personaData.persona);
                const profileData = await profileRes.json();
                setProfile(profileData);
                setTempProfile(profileData);
            } catch (error) {
                toast.error("Could not load app data from backend.");
            }
        };

        const loadSettings = () => {
            const saved = localStorage.getItem('appSettings');
            if (saved) setSettings(JSON.parse(saved));
        };

        fetchInitialData();
        loadSettings();
    }, []);

    useEffect(() => {
        localStorage.setItem('appSettings', JSON.stringify(settings));
        if (settings.isAnimated) document.body.classList.add('aurora-bg');
        else document.body.classList.remove('aurora-bg');
    }, [settings]);

    useEffect(() => { if (chatWindowRef.current) chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight; }, [messages, isLoading]);

    const filteredMessages = useMemo(() => messages.filter(msg => msg.role !== 'system' && msg.role !== 'tool' && !msg.content.includes('tool_name')), [messages]);

    // --- HANDLER FUNCTIONS ---
    const postRequest = async (body: object) => {
        setIsLoading(true); setAvatarState('thinking'); setConfirmation(null);
        try {
            const response = await fetch(`${API_BASE_URL}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            setMessages(data.history);
            if (data.confirmation) setConfirmation(data.confirmation);
        } catch (error) {
            toast.error('An error occurred. Please try again.');
        } finally { setIsLoading(false); setAvatarState('idle'); }
    };

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;
        const newHistory = [...messages, { role: 'user', content: input }];
        setMessages(newHistory);
        setInput('');
        await postRequest({ history: newHistory, settings });
    };

    const handleConfirmation = async (approved: boolean) => {
        if (!confirmation) return;
        let continuation = {};
        if (confirmation.type === 'search') {
            continuation = { action: approved ? 'approved_search' : 'denied_search', query: confirmation.query };
        } else if (confirmation.type === 'memory') {
            continuation = { action: approved ? 'save_memory' : 'dont_save_memory', summary: confirmation.summary };
        }
        await postRequest({ history: messages, continuation, settings });
    };

    const handleSaveSettings = async () => {
        try {
            await Promise.all([
                fetch(`${API_BASE_URL}/api/persona`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ persona: tempPersona }) }),
                fetch(`${API_BASE_URL}/api/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tempProfile) }),
            ]);
            setPersona(tempPersona);
            setProfile(tempProfile);
            toast.success("Settings saved!");
            setIsSettingsOpen(false);
        } catch (error) { toast.error("Could not save settings."); }
    };

    const openSettingsModal = () => { setTempPersona(persona); setTempProfile(profile); setIsSettingsOpen(true); };

    const toggleThinkingVisibility = (index: number) => {
        const newSet = new Set(expandedMessages);
        newSet.has(index) ? newSet.delete(index) : newSet.add(index);
        setExpandedMessages(newSet);
    };

    const handleSaveChat = async () => {
        const firstUserMessage = messages.find(m => m.role === 'user');
        const title = firstUserMessage ? firstUserMessage.content.substring(0, 40) + '...' : `Chat ${new Date().toLocaleTimeString()}`;
        try {
            const response = await fetch(`${API_BASE_URL}/api/chats`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, messages }) });
            const newChat = await response.json();
            setSavedChats(prev => [newChat, ...prev].sort((a, b) => b.id - a.id));
            setCurrentChatId(newChat.id);
            toast.success("Chat saved!");
        } catch (error) { toast.error("Error: Could not save chat."); }
    };

    const handleLoadChat = async (chatId: number) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}`);
            const data = await response.json();
            setMessages(data.messages);
            setCurrentChatId(chatId);
            setConfirmation(null);
            setExpandedMessages(new Set());
            if (window.innerWidth < 768) setIsSidebarOpen(false);
        } catch (error) { toast.error("Failed to load chat."); }
    };

    const handleDeleteChat = async (chatId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm("Are you sure?")) {
            try {
                await fetch(`${API_BASE_URL}/api/chats/${chatId}`, { method: 'DELETE' });
                setSavedChats(prev => prev.filter(c => c.id !== chatId));
                if (currentChatId === chatId) handleNewChat(false);
            } catch (error) { toast.error("Failed to delete chat."); }
        }
    };

    const handleNewChat = (promptToSave = true) => {
        const isUnsaved = currentChatId === null && messages.length > 2;
        if (promptToSave && isUnsaved && window.confirm("Save current chat first?")) {
            handleSaveChat();
        }
        setMessages(INITIAL_MESSAGES);
        setConfirmation(null);
        setExpandedMessages(new Set());
        setCurrentChatId(null);
    };

    const handleStartEdit = (msg: Message, index: number) => setEditingMessage({ index, text: msg.content });

    const handleSaveEdit = async () => {
        if (!editingMessage) return;
        const { index, text } = editingMessage;
        const truncatedHistory = messages.slice(0, index);
        const updatedMessage = { ...messages[index], content: text };
        const newHistory = [...truncatedHistory, updatedMessage];

        setMessages(newHistory);
        setEditingMessage(null);

        if (updatedMessage.role === 'user') {
            await postRequest({ history: newHistory, settings });
        }
    };

    // --- RENDER ---
    return (
        <div className="app-container">
            <Toaster position="top-center" reverseOrder={false} />
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} persona={tempPersona} setPersona={setTempPersona} profile={tempProfile} setProfile={setTempProfile} onSave={handleSaveSettings} settings={settings} setSettings={setSettings} />

            <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-header"><h3>Saved Chats</h3></div>
                <div className="saved-chats-list">
                    {savedChats.map(chat => (
                        <div key={chat.id} className={`saved-chat-item ${currentChatId === chat.id ? 'active' : ''}`} onClick={() => handleLoadChat(chat.id)}>
                            <span className="chat-title">{chat.title}</span>
                            <button onClick={(e) => handleDeleteChat(chat.id, e)} className="delete-chat-btn"><FaTrash /></button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="main-content">
                <div className="chat-container">
                    <div className="top-bar">
                        <button className="icon-button" onClick={() => setIsSidebarOpen(!isSidebarOpen)}><FaBars /></button>
                        <div className="assistant-profile">
                            <img src={`/assistant-avatar-${avatarState}.png`} alt="Assistant Avatar" className="top-bar-avatar" />
                            <div className="assistant-title-wrapper">
                                <span>Assistant</span><h2>My AI Assistant</h2>
                            </div>
                        </div>
                        <button className="icon-button" onClick={openSettingsModal}><FaCog /></button>
                        <button className="new-chat-button" onClick={() => handleNewChat(true)}><FaPlus /> New Chat</button>
                    </div>
                    <div className="chat-window" ref={chatWindowRef}>
                        {filteredMessages.map((msg, index) => {
                            const isEditing = editingMessage?.index === index;
                            const hasThinkTag = msg.role === 'assistant' && /<think>[\s\S]*?<\/think>/.test(msg.content);
                            const isExpanded = expandedMessages.has(index);
                            let thinkingContent: string | null = null;
                            let answerContent = msg.content;
                            if (hasThinkTag) {
                                thinkingContent = msg.content.replace(/<\/?think>/g, '').trim();
                                answerContent = msg.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                            }

                            return (
                                <div key={index} className={`message-wrapper ${msg.role}`}>
                                    <img src={msg.role === 'assistant' ? '/assistant-avatar-idle.png' : '/user-avatar.png'} alt={`${msg.role} avatar`} className="chat-avatar" />
                                    <div className="message-bubble">
                                        {isEditing ? (
                                            <div className="edit-view">
                                                <TextareaAutosize className="edit-textarea" value={editingMessage.text} onChange={(e) => setEditingMessage({ ...editingMessage, text: e.target.value })} />
                                                <div className="edit-actions">
                                                    <button onClick={() => setEditingMessage(null)}>Cancel</button>
                                                    <button onClick={handleSaveEdit}>Save</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="message-content">
                                                <ReactMarkdown components={{ code: CodeBlock }} remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{answerContent}</ReactMarkdown>
                                                <button className="edit-btn" onClick={() => handleStartEdit(msg, index)}><FaPencilAlt /></button>
                                            </div>
                                        )}
                                        {hasThinkTag && isExpanded && (<div className="thinking-block"><strong>Thinking Process:</strong><ReactMarkdown>{thinkingContent!}</ReactMarkdown></div>)}
                                        {hasThinkTag && <button onClick={() => toggleThinkingVisibility(index)} className="toggle-thinking-button">{isExpanded ? 'Hide thinking' : 'Show thinking'}</button>}
                                    </div>
                                </div>
                            );
                        })}
                        {isLoading && (<div className="message-wrapper assistant"><img src="/assistant-avatar-idle.png" alt="assistant avatar" className="chat-avatar" /><div className="message-bubble"><div className="thinking-dots"><span></span><span></span><span></span></div></div></div>)}
                    </div>
                    {confirmation ? (
                        <div className="confirmation-box">
                            <p>{confirmation.type === 'search' ? `Allow search for: "${confirmation.query}"?` : `Save memory: "${confirmation.summary}"?`}</p>
                            <button onClick={() => handleConfirmation(true)}>Yes</button>
                            <button onClick={() => handleConfirmation(false)}>No</button>
                        </div>
                    ) : (
                        <div className="input-area">
                            <TextareaAutosize minRows={1} maxRows={6} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Ask your assistant..." disabled={isLoading} />
                            <button onClick={sendMessage} disabled={isLoading || !input.trim()}>Send</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;