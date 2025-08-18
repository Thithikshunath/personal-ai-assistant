import { useState, useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import TextareaAutosize from 'react-textarea-autosize';
import { Toaster, toast } from 'react-hot-toast';
import { FaBars, FaTrash, FaCog, FaPlus, FaCopy, FaCheck, FaPencilAlt, FaInbox, FaSyncAlt } from 'react-icons/fa';

import 'katex/dist/katex.min.css';
import './index.css';

// --- TYPE DEFINITIONS ---
type Message = { role: 'user' | 'assistant' | 'system' | 'tool'; content: string };
type Confirmation = { type: 'search'; query: string } | { type: 'memory'; summary: string };
type SavedChat = { id: number; title: string };
type Profile = { name: string; key_facts: string[]; main_goals: string[] };
type AvatarState = 'idle' | 'thinking';
type SearchProvider = 'brave' | 'ddgs';
type ModalContent = {
    title: string;
    message: string;
    confirmText: string;
    onConfirm: () => void;
    confirmClass?: 'btn-primary' | 'btn-danger';
};
type SettingsTab = 'persona' | 'profile' | 'search' | 'appearance';

// --- CONSTANTS ---
const API_BASE_URL = "http://localhost:8000";
const INITIAL_MESSAGES: Message[] = [
    { role: 'system', content: 'You are a helpful and intelligent AI assistant.' },
    { role: 'assistant', content: 'Hello! How can I help you today?' },
];

// --- HELPER COMPONENTS ---

const ConfirmationModal = ({ content, onClose }: { content: ModalContent, onClose: () => void }) => {
    if (!content) return null;
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content confirmation" onClick={e => e.stopPropagation()}>
                <h2>{content.title}</h2>
                <p>{content.message}</p>
                <div className="modal-actions">
                    <button onClick={onClose} className="btn-secondary">Cancel</button>
                    <button onClick={() => { content.onConfirm(); onClose(); }} className={content.confirmClass || 'btn-primary'}>
                        {content.confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

const CodeBlock = ({ node, inline, className, children, ...props }: any) => {
    const [isCopied, setIsCopied] = useState(false);
    const match = /language-(\w+)/.exec(className || '');
    const codeText = String(children).replace(/\n$/, '');
    const handleCopy = () => { navigator.clipboard.writeText(codeText); toast.success("Copied!"); setTimeout(() => setIsCopied(false), 2000); };
    return !inline && match ? (
        <div className="code-block-wrapper">
            <button className="copy-code-btn" onClick={handleCopy}>{isCopied ? <FaCheck /> : <FaCopy />}</button>
            <SyntaxHighlighter style={atomDark} language={match[1]} PreTag="div" {...props}>{codeText}</SyntaxHighlighter>
        </div>
    ) : <code className={className} {...props}>{children}</code>;
};

const SettingsModal = ({ isOpen, onClose, persona, setPersona, profile, setProfile, onSave, settings, setSettings }: any) => {
    const [activeTab, setActiveTab] = useState<SettingsTab>('persona');
    const tabContentWrapperRef = useRef<HTMLDivElement>(null);
    const tabContentRef = useRef<HTMLDivElement>(null);

    // This effect runs when the active tab changes to animate the height
    useEffect(() => {
        if (tabContentWrapperRef.current && tabContentRef.current) {
            const wrapperEl = tabContentWrapperRef.current;
            const contentEl = tabContentRef.current;
            // Set the wrapper height to match the new content's height
            wrapperEl.style.height = `${contentEl.scrollHeight}px`;
        }
    }, [activeTab]);


    if (!isOpen) return null;

    const renderContent = () => {
        // We wrap the content in a div with a ref so we can measure it
        return (
            <div ref={tabContentRef}>
                {activeTab === 'persona' && (
                    <div className="setting-section">
                        <h3>Assistant Persona</h3> <p>Define how your assistant should behave. Provide detailed instructions, context, and constraints.</p>
                        <TextareaAutosize className="settings-textarea" value={persona} onChange={(e) => setPersona(e.target.value)} minRows={10} />
                    </div>
                )}
                {activeTab === 'profile' && (
                    <div className="setting-section">
                        <h3>Your Profile</h3> <p>Help your assistant remember key facts about you to personalize its responses.</p>
                        <label>Your Name</label>
                        <input type="text" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
                        <label>Key Facts About You (one per line)</label>
                        <TextareaAutosize className="settings-textarea" value={profile.key_facts.join('\n')} onChange={(e) => setProfile({ ...profile, key_facts: e.target.value.split('\n') })} minRows={5} />
                    </div>
                )}
                {activeTab === 'search' && (
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
                )}
                {activeTab === 'appearance' && (
                    <div className="setting-section">
                        <h3>Appearance</h3>
                        <div className="toggle-switch-wrapper">
                            <label>Animated Aurora Background</label>
                            <label className="toggle-switch"><input type="checkbox" checked={settings.isAnimated} onChange={() => setSettings({ ...settings, isAnimated: !settings.isAnimated })} /><span className="slider"></span></label>
                        </div>
                    </div>
                )}
            </div>
        )
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="tabs-nav">
                    <button className={`tab-button ${activeTab === 'persona' ? 'active' : ''}`} onClick={() => setActiveTab('persona')}>Persona</button>
                    <button className={`tab-button ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>Profile</button>
                    <button className={`tab-button ${activeTab === 'search' ? 'active' : ''}`} onClick={() => setActiveTab('search')}>Search</button>
                    <button className={`tab-button ${activeTab === 'appearance' ? 'active' : ''}`} onClick={() => setActiveTab('appearance')}>Appearance</button>
                </div>
                <div className="tab-content-wrapper" ref={tabContentWrapperRef}>
                    {renderContent()}
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
    const [modalContent, setModalContent] = useState<ModalContent | null>(null);
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

    useEffect(() => {
        if (confirmation) {
            setModalContent({
                title: confirmation.type === 'search' ? "Web Search" : "Save Memory",
                message: confirmation.type === 'search'
                    ? `Do you want to search the web for: "${confirmation.query}"?`
                    : `Do you want to save this memory: "${confirmation.summary}"?`,
                confirmText: confirmation.type === 'search' ? "Search" : "Save",
                confirmClass: 'btn-primary',
                onConfirm: () => handleConfirmation(true),
            });
        }
    }, [confirmation]);


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
        const currentConfirmation = confirmation;
        setConfirmation(null);

        let continuation = {};
        if (currentConfirmation.type === 'search') {
            continuation = { action: approved ? 'approved_search' : 'denied_search', query: currentConfirmation.query };
        } else if (currentConfirmation.type === 'memory') {
            continuation = { action: approved ? 'save_memory' : 'dont_save_memory', summary: currentConfirmation.summary };
        }
        await postRequest({ history: messages, continuation, settings });
    };

    const handleModalClose = () => {
        if (confirmation) {
            handleConfirmation(false);
        }
        setModalContent(null);
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
        setModalContent({
            title: "Delete Chat",
            message: "Are you sure you want to permanently delete this chat?",
            confirmText: "Delete",
            confirmClass: 'btn-danger',
            onConfirm: async () => {
                try {
                    await fetch(`${API_BASE_URL}/api/chats/${chatId}`, { method: 'DELETE' });
                    setSavedChats(prev => prev.filter(c => c.id !== chatId));
                    if (currentChatId === chatId) handleNewChat(false);
                    toast.success("Chat deleted.");
                } catch (error) { toast.error("Failed to delete chat."); }
            }
        });
    };

    const handleNewChat = (promptToSave = true) => {
        const isUnsaved = currentChatId === null && messages.length > 2;
        const startNewChat = () => {
            setMessages(INITIAL_MESSAGES);
            setConfirmation(null);
            setExpandedMessages(new Set());
            setCurrentChatId(null);
        };

        if (promptToSave && isUnsaved) {
            setModalContent({
                title: "Save Chat",
                message: "Do you want to save your current chat before starting a new one?",
                confirmText: "Save",
                confirmClass: 'btn-primary',
                onConfirm: () => {
                    handleSaveChat().then(() => startNewChat());
                },
            });
        } else {
            startNewChat();
        }
    };

    const handleStartEdit = (msgToEdit: Message) => {
        const trueIndex = messages.findIndex(m => m === msgToEdit);
        if (trueIndex > -1) {
            setEditingMessage({ index: trueIndex, text: msgToEdit.content });
        } else {
            toast.error("Could not find message to edit.");
        }
    };

    const handleSaveOnly = () => {
        if (!editingMessage) return;
        const { index, text } = editingMessage;
        const newHistory = [...messages];
        newHistory[index] = { ...newHistory[index], content: text };
        setMessages(newHistory);
        setEditingMessage(null);
        toast.success("Message updated locally.");
    };

    const handleSaveAndRegenerate = async () => {
        if (!editingMessage) return;
        const { index, text } = editingMessage;
        const truncatedHistory = messages.slice(0, index);
        const updatedMessage = { ...messages[index], content: text };
        const newHistory = [...truncatedHistory, updatedMessage];

        setMessages(newHistory);
        setEditingMessage(null);

        const isUserMessage = updatedMessage.role === 'user';
        const isLastAssistantMessage = updatedMessage.role === 'assistant' && index === messages.length - 1;

        if (isUserMessage || isLastAssistantMessage) {
            await postRequest({ history: newHistory, settings });
        }
    };

    const handleDeleteMessage = (msgToDelete: Message) => {
        const trueIndex = messages.findIndex(m => m === msgToDelete);
        if (trueIndex < 0) {
            toast.error("Could not find message to delete.");
            return;
        }

        const isUserMsgFollowedByAssistant =
            messages[trueIndex]?.role === 'user' &&
            messages[trueIndex + 1]?.role === 'assistant';

        const message = isUserMsgFollowedByAssistant
            ? "Are you sure you want to delete this message and the assistant's response?"
            : "Are you sure you want to delete this message?";

        setModalContent({
            title: "Delete Message",
            message: message,
            confirmText: "Delete",
            confirmClass: 'btn-danger',
            onConfirm: () => {
                const newMessages = [...messages];
                const deleteCount = isUserMsgFollowedByAssistant ? 2 : 1;
                newMessages.splice(trueIndex, deleteCount);
                setMessages(newMessages);
                toast.success("Message(s) deleted.");
            },
        });
    };

    const handleRegenerateLast = async () => {
        if (isLoading) return;
        const lastUserMessageIndex = messages.findLastIndex(m => m.role === 'user');
        if (lastUserMessageIndex > -1) {
            const historyToRegenerate = messages.slice(0, lastUserMessageIndex + 1);
            setMessages(historyToRegenerate);
            await postRequest({ history: historyToRegenerate, settings });
        } else {
            toast.error("No user message found to regenerate from.");
        }
    };

    // --- RENDER ---
    return (
        <div className="app-container">
            <Toaster position="top-center" reverseOrder={false} />
            <ConfirmationModal content={modalContent} onClose={handleModalClose} />
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} persona={tempPersona} setPersona={setTempPersona} profile={tempProfile} setProfile={setTempProfile} onSave={handleSaveSettings} settings={settings} setSettings={setSettings} />

            <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-header"><h3>Saved Chats</h3></div>
                <div className="saved-chats-list">
                    {savedChats.length > 0 ? (
                        savedChats.map(chat => (
                            <div key={chat.id} className={`saved-chat-item ${currentChatId === chat.id ? 'active' : ''}`} onClick={() => handleLoadChat(chat.id)}>
                                <span className="chat-title">{chat.title}</span>
                                <button onClick={(e) => handleDeleteChat(chat.id, e)} className="delete-chat-btn"><FaTrash /></button>
                            </div>
                        ))
                    ) : (
                        <div className="empty-chats-placeholder">
                            <FaInbox />
                            <p>No saved chats yet.</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="main-content">
                <div className="chat-container">
                    <div className="top-bar">
                        <button className="icon-button" onClick={() => setIsSidebarOpen(!isSidebarOpen)}><FaBars /></button>
                        <div className="assistant-profile">
                            <img src={`/assistant-avatar-idle.png`} alt="Assistant Avatar" className={`top-bar-avatar ${avatarState === 'thinking' ? 'avatar-thinking-glow' : ''}`} />
                            <div className="assistant-title-wrapper">
                                <span>Assistant</span><h2>My AI Assistant</h2>
                            </div>
                        </div>
                        <button className="icon-button" onClick={openSettingsModal}><FaCog /></button>
                        <button className="new-chat-button" onClick={() => handleNewChat(true)}><FaPlus /> New Chat</button>
                    </div>
                    <div className="chat-window" ref={chatWindowRef}>
                        {filteredMessages.map((msg, index) => {
                            const isEditing = editingMessage?.index !== undefined && messages[editingMessage.index] === msg;
                            const isLastMessage = index === filteredMessages.length - 1;
                            const isAssistant = msg.role === 'assistant';

                            const hasThinkTag = isAssistant && /<think>[\s\S]*?<\/think>/.test(msg.content);
                            const isExpanded = expandedMessages.has(index);
                            let thinkingContent: string | null = null;
                            let answerContent = msg.content;
                            if (hasThinkTag) {
                                thinkingContent = msg.content.match(/<think>([\s\S]*?)<\/think>/)?.[1].trim() ?? null;
                                answerContent = msg.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                            }

                            return (
                                <div key={index} className={`message-wrapper ${msg.role}`}>
                                    <img src={isAssistant ? '/assistant-avatar-idle.png' : '/user-avatar.png'} alt={`${msg.role} avatar`} className="chat-avatar" />
                                    <div className="message-bubble">
                                        {isEditing ? (
                                            <div className="edit-view">
                                                <TextareaAutosize className="edit-textarea" value={editingMessage!.text} onChange={(e) => setEditingMessage({ ...editingMessage!, text: e.target.value })} />
                                                <div className="edit-actions">
                                                    <button onClick={() => setEditingMessage(null)}>Cancel</button>
                                                    <button onClick={handleSaveOnly}>Save</button>
                                                    <button onClick={handleSaveAndRegenerate} className="regenerate">Save & Regenerate</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="message-content">
                                                    <ReactMarkdown components={{ code: CodeBlock }} remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{answerContent}</ReactMarkdown>
                                                </div>
                                                <div className="message-actions">
                                                    <button title="Edit" className="message-action-btn" onClick={() => handleStartEdit(msg)}><FaPencilAlt /></button>
                                                    <button title="Delete" className="message-action-btn delete" onClick={() => handleDeleteMessage(msg)}><FaTrash /></button>
                                                    {isLastMessage && isAssistant && !isLoading && (
                                                        <button title="Regenerate" className="message-action-btn regenerate" onClick={handleRegenerateLast}><FaSyncAlt /></button>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                        {hasThinkTag && isExpanded && (<div className="thinking-block"><strong>Thinking Process:</strong><ReactMarkdown>{thinkingContent!}</ReactMarkdown></div>)}
                                        {hasThinkTag && <button onClick={() => toggleThinkingVisibility(index)} className="toggle-thinking-button">{isExpanded ? 'Hide thinking' : 'Show thinking'}</button>}
                                    </div>
                                </div>
                            );
                        })}
                        {isLoading && (<div className="message-wrapper assistant"><img src="/assistant-avatar-idle.png" alt="assistant avatar" className="chat-avatar" /><div className="message-bubble"><div className="thinking-dots"><span></span><span></span><span></span></div></div></div>)}
                    </div>

                    <div className="input-area">
                        <TextareaAutosize minRows={1} maxRows={6} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Ask your assistant..." disabled={isLoading || !!confirmation} />
                        <button onClick={sendMessage} disabled={isLoading || !input.trim() || !!confirmation}>Send</button>
                    </div>

                </div>
            </div>
        </div>
    );
}

export default App;