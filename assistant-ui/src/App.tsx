import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import TextareaAutosize from 'react-textarea-autosize';
import { Toaster, toast } from 'react-hot-toast';
import { 
    FaBars, 
    FaTrash, 
    FaCog, 
    FaPlus, 
    FaCopy, 
    FaCheck, 
    FaPencilAlt, 
    FaInbox, 
    FaSyncAlt, 
    FaChevronDown, 
    FaPaperclip, 
    FaTimes 
} from 'react-icons/fa';

import 'katex/dist/katex.min.css';
import './index.css';

// --- TYPE DEFINITIONS ---
interface MessagePart {
    type: 'text' | 'image_url';
    text?: string;
    image_url?: { url: string };
}

// Type guard for image parts
const isImagePart = (part: MessagePart): part is MessagePart & { type: 'image_url'; image_url: { url: string } } => {
    return part.type === 'image_url' && !!part.image_url;
};

// Type guard for text parts
const isTextPart = (part: MessagePart): part is MessagePart & { type: 'text'; text: string } => {
    return part.type === 'text' && typeof part.text === 'string';
};

type MessageContent = string | MessagePart[];

interface Message {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: MessageContent;
}

interface SavedChat {
    id: number;
    title: string;
    persona_id: string;
}

interface Profile {
    name: string;
    key_facts: string[];
    main_goals: string[];
}

interface Persona {
    id: string;
    name: string;
    personality: string;
    avatar: string;
    greeting: string;
    title: string;
}

type AvatarState = 'idle' | 'thinking';
type SearchProvider = 'brave' | 'ddgs';

interface ModalAction {
    text: string;
    onClick: () => void;
    className?: string;
}

interface ModalContent {
    title: string;
    message: string;
    actions: ModalAction[];
    onCancel: () => void;
}

type SettingsTab = 'persona' | 'profile' | 'search' | 'appearance';

interface Confirmation {
    type: 'search' | 'memory';
    query?: string;
    summary?: string;
}

interface Settings {
    isAnimated: boolean;
    webSearchEnabled: boolean;
    provider: SearchProvider;
}

// --- CONSTANTS ---
const API_BASE_URL = "http://localhost:8000";
const DEFAULT_PERSONA_ID = 'assistant';
const getInitialMessages = (greeting?: string): Message[] => [
    { role: 'system', content: 'You are a helpful and intelligent AI assistant.' },
    { role: 'assistant', content: greeting || 'Hello! How can I help you today?' },
];


// --- HELPER COMPONENTS ---
const ActionModal = ({ content }: { content: ModalContent | null }) => {
    if (!content) return null;
    return (
        <div className="modal-overlay" onClick={content.onCancel}>
            <div className="modal-content confirmation" onClick={e => e.stopPropagation()}>
                <h2>{content.title}</h2>
                <p>{content.message}</p>
                <div className="modal-actions">
                    <button onClick={content.onCancel} className="btn-secondary">Cancel</button>
                    {content.actions.map((action, index) => (
                        <button key={index} onClick={() => { action.onClick();}} className={action.className || 'btn-primary'}>
                            {action.text}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};


interface CodeBlockProps {
    inline?: boolean;
    className?: string;
    children?: React.ReactNode;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ inline, className, children, ...props }) => {
    const [isCopied, setIsCopied] = useState(false);
    const match = /language-(\w+)/.exec(className || '');
    const codeText = String(children).replace(/\n$/, '');
    
    const handleCopy = () => { 
        navigator.clipboard.writeText(codeText); 
        toast.success("Copied!"); 
        setTimeout(() => setIsCopied(false), 2000); 
    };
    
    return !inline && match ? (
        <div className="code-block-wrapper">
            <button className="copy-code-btn" onClick={handleCopy}>
                {isCopied ? <FaCheck /> : <FaCopy />}
            </button>
            <SyntaxHighlighter 
                style={atomDark} 
                language={match[1]} 
                PreTag="div" 
                {...props}
            >
                {codeText}
            </SyntaxHighlighter>
        </div>
    ) : (
        <code className={className} {...props}>
            {children}
        </code>
    );
};

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    personas: Persona[];
    setPersonas: React.Dispatch<React.SetStateAction<Persona[]>>;
    profile: Profile;
    setProfile: React.Dispatch<React.SetStateAction<Profile>>;
    onSave: () => void;
    settings: {
        isAnimated: boolean;
        webSearchEnabled: boolean;
        provider: SearchProvider;
    };
    setSettings: React.Dispatch<React.SetStateAction<{
        isAnimated: boolean;
        webSearchEnabled: boolean;
        provider: SearchProvider;
    }>>;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ 
    isOpen, 
    onClose, 
    personas, 
    setPersonas, 
    profile, 
    setProfile, 
    onSave, 
    settings, 
    setSettings 
}) => {
    const [activeTab, setActiveTab] = useState<SettingsTab>('persona');
    const [selectedPersonaId, setSelectedPersonaId] = useState<string>(personas[0]?.id || '');

    const tabContentWrapperRef = useRef<HTMLDivElement>(null);
    const tabContentRef = useRef<HTMLDivElement>(null);

    const selectedPersona = personas.find((p: Persona) => p.id === selectedPersonaId);

    useEffect(() => {
        if (!isOpen) return;
        const firstPersona = personas[0];
        if (firstPersona) {
            setSelectedPersonaId(firstPersona.id);
        }
    }, [isOpen]);

    useEffect(() => {
        if (tabContentWrapperRef.current && tabContentRef.current) {
            tabContentWrapperRef.current.style.height = `${tabContentRef.current.scrollHeight}px`;
        }
    }, [activeTab, selectedPersonaId]);

    const handlePersonaChange = (field: 'name' | 'personality' | 'title', value: string) => {
        setPersonas(personas.map((p: Persona) =>
            p.id === selectedPersonaId ? { ...p, [field]: value } : p
        ));
    };

    if (!isOpen) return null;

    const renderContent = () => {
        return (
            <div ref={tabContentRef}>
                {activeTab === 'persona' && (
                    <div className="setting-section">
                        <h3>Assistant Personas</h3>
                        <p>Select a persona to modify its name and personality traits.</p>
                        <div className="persona-selector">
                            {personas.map((p: Persona) => (
                                <div key={p.id} className={`persona-choice ${selectedPersonaId === p.id ? 'active' : ''}`} onClick={() => setSelectedPersonaId(p.id)}>
                                    <img src={p.avatar} alt={p.name} />
                                    <span>{p.name}</span>
                                </div>
                            ))}
                        </div>
                        {selectedPersona && (
                            <div className="persona-editor">
                                <label>Persona Title (e.g., Assistant, Friend)</label>
                                <input type="text" value={selectedPersona.title || ''} onChange={(e) => handlePersonaChange('title', e.target.value)} />
                                <label>Persona Name</label>
                                <input type="text" value={selectedPersona.name} onChange={(e) => handlePersonaChange('name', e.target.value)} />
                                <label>Personality Description</label>
                                <TextareaAutosize className="settings-textarea" value={selectedPersona.personality} onChange={(e) => handlePersonaChange('personality', e.target.value)} minRows={8} />
                            </div>
                        )}
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
                        <div className="toggle-switch-wrapper"><label>Enable Web Search</label><label className="toggle-switch"><input type="checkbox" checked={settings.webSearchEnabled} onChange={() => setSettings({ ...settings, webSearchEnabled: !settings.webSearchEnabled })} /><span className="slider"></span></label></div>
                        <div className={`radio-group ${!settings.webSearchEnabled ? 'disabled' : ''}`}>
                            <label><input type="radio" value="brave" checked={settings.provider === 'brave'} onChange={(e) => setSettings({ ...settings, provider: e.target.value as SearchProvider })} disabled={!settings.webSearchEnabled} /> Brave API</label>
                            <label><input type="radio" value="ddgs" checked={settings.provider === 'ddgs'} onChange={(e) => setSettings({ ...settings, provider: e.target.value as SearchProvider })} disabled={!settings.webSearchEnabled} /> DuckDuckGo</label>
                        </div>
                    </div>
                )}
                {activeTab === 'appearance' && (
                    <div className="setting-section">
                        <h3>Appearance</h3>
                        <div className="toggle-switch-wrapper"><label>Animated Aurora Background</label><label className="toggle-switch"><input type="checkbox" checked={settings.isAnimated} onChange={() => setSettings({ ...settings, isAnimated: !settings.isAnimated })} /><span className="slider"></span></label></div>
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
                <div className="tab-content-wrapper" ref={tabContentWrapperRef}>{renderContent()}</div>
                <div className="modal-actions"><button onClick={onClose} className="btn-secondary">Cancel</button><button onClick={onSave} className="btn-primary">Save Changes</button></div>
            </div>
        </div>
    );
};
function App() {
    // State initialization with proper types
    const [messages, setMessages] = useState<Message[]>(getInitialMessages());
    const [input, setInput] = useState('');
    const [attachedImage, setAttachedImage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
    const [savedChats, setSavedChats] = useState<SavedChat[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [currentChatId, setCurrentChatId] = useState<number | null>(null);
    const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set());
    const [editingMessage, setEditingMessage] = useState<{ index: number; text: string } | null>(null);
    const [modalContent, setModalContent] = useState<ModalContent | null>(null);
    const [isChatModified, setIsChatModified] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [avatarState, setAvatarState] = useState<AvatarState>('idle');
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [currentPersonaId, setCurrentPersonaId] = useState<string>(DEFAULT_PERSONA_ID);
    const [isPersonaLocked, setIsPersonaLocked] = useState(false);
    const [profile, setProfile] = useState<Profile>({ name: '', key_facts: [], main_goals: [] });
    const [tempPersonas, setTempPersonas] = useState<Persona[]>([]);
    const [tempProfile, setTempProfile] = useState<Profile>({ name: '', key_facts: [], main_goals: [] });
    const [settings, setSettings] = useState<Settings>({
        isAnimated: true,
        webSearchEnabled: true,
        provider: 'brave' as SearchProvider
    });
    const [isPersonaSwitcherOpen, setIsPersonaSwitcherOpen] = useState(false);

    const chatWindowRef = useRef<HTMLDivElement>(null);
    const currentPersona = useMemo(() => personas.find(p => p.id === currentPersonaId) || null, [personas, currentPersonaId]);

    // --- EFFECTS ---
    useEffect(() => {
        if (!isPersonaLocked) {
            const selectedPersona = personas.find(p => p.id === currentPersonaId);
            if (selectedPersona) {
                setMessages(getInitialMessages(selectedPersona.greeting));
            }
        }
    }, [currentPersonaId, isPersonaLocked, personas]);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [chatsRes, personasRes, profileRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/chats`),
                    fetch(`${API_BASE_URL}/api/personas`),
                    fetch(`${API_BASE_URL}/api/profile`),
                ]);
                setSavedChats(await chatsRes.json());
                const personasData = await personasRes.json();
                setPersonas(personasData);
                setTempPersonas(personasData);
                // Set initial messages based on default persona's greeting
                const defaultPersona = personasData.find((p: Persona) => p.id === DEFAULT_PERSONA_ID) || personasData[0];
                setMessages(getInitialMessages(defaultPersona?.greeting));

                const profileData = await profileRes.json();
                setProfile(profileData);
                setTempProfile(profileData);
            } catch (error) { 
                console.error('Error details:', error);
                toast.error("Could not load app data from backend."); 
            }
        };

        const loadSettings = () => { const saved = localStorage.getItem('appSettings'); if (saved) setSettings(JSON.parse(saved)); };
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
            const handleApprovalAction = () => {
                handleConfirmation(true);
                handleModalClose();
            };

            const handleDenialAction = () => {
                handleConfirmation(false); 
                handleModalClose();
            };

            setModalContent({
                title: confirmation.type === 'search' ? "Web Search" : "Save Memory",
                message: confirmation.type === 'search'
                    ? `Do you want to search the web for: "${confirmation.query}"?`
                    : `Do you want to save this memory: "${confirmation.summary}"?`,
                actions: [{
                    text: confirmation.type === 'search' ? "Search" : "Save",
                    onClick: handleApprovalAction // Assign the approval handler
                }],
                onCancel: handleDenialAction, // Assign the denial handler
            });
        }
    }, [confirmation]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const switcher = document.querySelector('.persona-switcher');
            if (switcher && !switcher.contains(event.target as Node)) {
                setIsPersonaSwitcherOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredMessages = useMemo(() => messages.filter(msg => msg.role !== 'system' && msg.role !== 'tool' && !JSON.stringify(msg.content).includes('tool_name')), [messages]);

    // --- HANDLER FUNCTIONS ---
    const postRequest = async (body: object) => {
        setIsLoading(true); setAvatarState('thinking'); setConfirmation(null);
        try {
            const response = await fetch(`${API_BASE_URL}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            setMessages(data.history);
            setIsChatModified(true); // Any response from backend means chat has changed
            if (data.confirmation) setConfirmation(data.confirmation);
        } catch (error) {
            console.error('Error details:', error);
            toast.error('An error occurred. Please try again.');
        } finally { setIsLoading(false); setAvatarState('idle'); }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setAttachedImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    // Message handling functions
    const sendMessage = useCallback(async () => {
        const textContent = input.trim();
        if (!textContent && !attachedImage) return;

        let content: Message['content'];
        if (attachedImage) {
            content = [
                { type: 'text', text: textContent },
                { type: 'image_url', image_url: { url: attachedImage } }
            ];
        } else {
            content = textContent;
        }

        const newMessage: Message = { role: 'user', content };
        const newHistory = [...messages, newMessage];
        setMessages(newHistory);
        setInput('');
        setAttachedImage(null);
        setIsPersonaLocked(true);
        await postRequest({ history: newHistory, settings, persona_id: currentPersonaId });
    }, [input, attachedImage, messages, settings, currentPersonaId]);

    const handleConfirmation = useCallback(async (approved: boolean) => {
        if (!confirmation) return;
        const currentConfirmation = confirmation;
        setConfirmation(null);
        const continuation = currentConfirmation.type === 'search'
            ? { action: approved ? 'approved_search' : 'denied_search', query: currentConfirmation.query }
            : { action: approved ? 'save_memory' : 'dont_save_memory', summary: currentConfirmation.summary };
        
        await postRequest({ history: messages, continuation, settings, persona_id: currentPersonaId });
    }, [confirmation, messages, settings, currentPersonaId]);

    const handleModalClose = () => { setModalContent(null); };

    const handleSaveSettings = async () => {
        try {
            await Promise.all([
                fetch(`${API_BASE_URL}/api/personas`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tempPersonas) }),
                fetch(`${API_BASE_URL}/api/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tempProfile) }),
            ]);
            setPersonas(tempPersonas);
            setProfile(tempProfile);
            toast.success("Settings saved!");
            setIsSettingsOpen(false);
        } catch (error) { 
            console.error('Settings save error:', error);
            toast.error("Could not save settings."); 
        }
    };

    const openSettingsModal = () => { setTempPersonas(JSON.parse(JSON.stringify(personas))); setTempProfile(JSON.parse(JSON.stringify(profile))); setIsSettingsOpen(true); };

    const toggleThinkingVisibility = (index: number): void => {
        const newSet = new Set(expandedMessages);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
        setExpandedMessages(newSet);
    };

    const getMessageText = (content: MessageContent): string => {
        if (typeof content === 'string') {
            return content;
        }
        const textPart = content.find((part): part is MessagePart & { type: 'text' } => 
            part.type === 'text' && typeof part.text === 'string'
        );
        return textPart?.text || '';
    };

    const handleSaveChat = async () => {
        const firstUserMessage = messages.find(m => m.role === 'user');
        const title = firstUserMessage 
            ? getMessageText(firstUserMessage.content).substring(0, 40) + '...' 
            : `Chat ${new Date().toLocaleTimeString()}`;
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/chats`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ title, messages, persona_id: currentPersonaId }) 
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const newChat = await response.json();
            setSavedChats(prev => [newChat, ...prev].sort((a, b) => b.id - a.id));
            setCurrentChatId(newChat.id);
            setIsChatModified(false);
            toast.success("Chat saved!");
        } catch (error) {
            console.error('Save chat error:', error);
            toast.error("Error: Could not save chat.");
        }
    };

    const handleUpdateChat = async () => {
        if (!currentChatId) return;
        try {
            const response = await fetch(`${API_BASE_URL}/api/chats/${currentChatId}`, { 
                method: 'PUT', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ messages, persona_id: currentPersonaId }) 
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            setIsChatModified(false);
            toast.success("Chat changes saved!");
        } catch (error: unknown) {
            console.error('Update chat error:', error);
            toast.error("Error: Could not update chat.");
        }
    };

    const handleLoadChat = async (chatId: number) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            setMessages(data.messages);
            setCurrentChatId(chatId);
            setCurrentPersonaId(data.persona_id || DEFAULT_PERSONA_ID);
            setIsPersonaLocked(true);
            setIsChatModified(false);
            setConfirmation(null);
            setExpandedMessages(new Set());
            if (window.innerWidth < 768) setIsSidebarOpen(false);
        } catch (error: unknown) {
            console.error('Load chat error:', error);
            toast.error("Failed to load chat.");
        }
    };

    const handleDeleteChat = async (chatId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setModalContent({
            title: "Delete Chat", 
            message: "Are you sure you want to permanently delete this chat?",
            actions: [{
                text: "Delete", 
                className: "btn-danger", 
                onClick: async () => {
                    try {
                        const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}`, { method: 'DELETE' });
                        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                        setSavedChats(prev => prev.filter(c => c.id !== chatId));
                        if (currentChatId === chatId) handleNewChat(false);
                        toast.success("Chat deleted.");
                    } catch (error: unknown) {
                        console.error('Delete chat error:', error);
                        toast.error("Failed to delete chat.");
                    }
                }
            }],
            onCancel: handleModalClose,
        });
    };

    const startNewChat = () => {
        const persona = personas.find(p => p.id === DEFAULT_PERSONA_ID) || personas[0];
        setMessages(getInitialMessages(persona?.greeting));
        setConfirmation(null);
        setExpandedMessages(new Set());
        setCurrentChatId(null);
        setIsChatModified(false);
        setIsPersonaLocked(false);
        setAttachedImage(null);
        setCurrentPersonaId(DEFAULT_PERSONA_ID);
    };

    const handleNewChat = (promptToSave = true) => {
        const shouldPrompt = (currentChatId === null && messages.length > 2) || (currentChatId !== null && isChatModified);

        if (promptToSave && shouldPrompt) {
            setModalContent({
                title: "Save Changes",
                message: "Do you want to save your current chat before starting a new one?",
                onCancel: handleModalClose,
                actions: [
                    {
                        text: "Don't Save",
                        className: 'btn-danger',
                        onClick: () => {
                            startNewChat();
                            handleModalClose();
                        },
                    },
                    {
                        text: "Save",
                        className: 'btn-primary',
                        onClick: () => {
                            (async () => {
                                if (currentChatId) await handleUpdateChat();
                                else await handleSaveChat();
                                startNewChat();
                                handleModalClose();
                            })();
                        },
                    },
                ],
            });
        } else {
            startNewChat();
        }
    };

    const handleStartEdit = (msgToEdit: Message) => {
        const trueIndex = messages.findIndex(m => m === msgToEdit);
        if (trueIndex > -1) {
            const text = typeof msgToEdit.content === 'string' ? 
                msgToEdit.content : 
                JSON.stringify(msgToEdit.content);
            setEditingMessage({ index: trueIndex, text });
        } else {
            toast.error("Could not find message to edit.");
        }
    };

    const handleSaveOnly = () => {
        if (!editingMessage) return;
        const { index, text } = editingMessage;
        const newHistory = [...messages]; newHistory[index] = { ...newHistory[index], content: text };
        setMessages(newHistory); setEditingMessage(null); setIsChatModified(true); toast.success("Message updated locally.");
    };

    const handleSaveAndRegenerate = async () => {
        if (!editingMessage) return;
        const { index, text } = editingMessage;
        const truncatedHistory = messages.slice(0, index);
        const updatedMessage = { ...messages[index], content: text };
        const newHistory = [...truncatedHistory, updatedMessage];
        setMessages(newHistory); setEditingMessage(null);
        await postRequest({ history: newHistory, settings, persona_id: currentPersonaId });
    };

    const handleDeleteMessage = (msgToDelete: Message) => {
        const trueIndex = messages.findIndex(m => m === msgToDelete);
        if (trueIndex < 0) { toast.error("Could not find message to delete."); return; }
        const isUserMsgFollowedByAssistant = messages[trueIndex]?.role === 'user' && messages[trueIndex + 1]?.role === 'assistant';
        const message = isUserMsgFollowedByAssistant ? "Are you sure you want to delete this message and the assistant's response?" : "Are you sure you want to delete this message?";
        setModalContent({
            title: "Delete Message", message,
            actions: [{
                text: "Delete", className: 'btn-danger', onClick: () => {
                    const newMessages = [...messages]; const deleteCount = isUserMsgFollowedByAssistant ? 2 : 1;
                    newMessages.splice(trueIndex, deleteCount);
                    setMessages(newMessages); setIsChatModified(true); toast.success("Message(s) deleted.");
                }
            }],
            onCancel: handleModalClose,
        });
    };

    const findLastIndex = <T,>(array: T[], predicate: (value: T) => boolean): number => {
        for (let i = array.length - 1; i >= 0; i--) {
            if (predicate(array[i])) {
                return i;
            }
        }
        return -1;
    };

    const handleRegenerateLast = async () => {
        if (isLoading) return;
        const lastUserMessageIndex = findLastIndex(messages, (m: Message) => m.role === 'user');
        if (lastUserMessageIndex > -1) {
            const historyToRegenerate = messages.slice(0, lastUserMessageIndex + 1);
            setMessages(historyToRegenerate);
            await postRequest({ history: historyToRegenerate, settings, persona_id: currentPersonaId });
        } else { 
            toast.error("No user message found to regenerate from."); 
        }
    };

    const handleThinkingContent = (content: MessageContent): { 
        hasThinkTag: boolean;
        thinkingContent: string | null;
        answerContent: string;
    } => {
        const textContent = typeof content === 'string' ? content : getMessageText(content);
        const thinkMatch = textContent.match(/<think>([\s\S]*?)<\/think>/);
        const hasThinkTag = !!thinkMatch;
        
        return {
            hasThinkTag,
            thinkingContent: thinkMatch ? thinkMatch[1].trim() : null,
            answerContent: hasThinkTag ? textContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim() : textContent
        };
    };

    // --- RENDER ---
    if (!currentPersona) return <div>Loading...</div>; // Or a proper loading spinner

    return (
        <div className="app-container">
            <Toaster position="top-center" reverseOrder={false} />
            <ActionModal content={modalContent} />
            <SettingsModal 
                isOpen={isSettingsOpen} 
                onClose={() => setIsSettingsOpen(false)}
                personas={tempPersonas}
                setPersonas={setTempPersonas}
                profile={tempProfile}
                setProfile={setTempProfile}
                onSave={handleSaveSettings}
                settings={settings}
                setSettings={setSettings}
            />
            
            <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <h3>Saved Chats</h3>
                </div>
                <div className="saved-chats-list">
                    {savedChats.length > 0 ? (
                        savedChats.map(chat => (
                            <div 
                                key={chat.id} 
                                className={`saved-chat-item ${currentChatId === chat.id ? 'active' : ''}`} 
                                onClick={() => handleLoadChat(chat.id)}
                            >
                                <span className="chat-title">{chat.title}</span>
                                <button 
                                    onClick={(e) => handleDeleteChat(chat.id, e)} 
                                    className="delete-chat-btn"
                                >
                                    <FaTrash />
                                </button>
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

                        <div className={`persona-switcher ${isPersonaLocked ? 'locked' : ''}`} onClick={() => !isPersonaLocked && setIsPersonaSwitcherOpen(!isPersonaSwitcherOpen)}>
                            <div className="assistant-profile">
                                <img src={currentPersona.avatar} alt="Assistant Avatar" className={`top-bar-avatar ${avatarState === 'thinking' ? 'avatar-thinking-glow' : ''}`} />
                                <div className="assistant-title-wrapper"><span>{currentPersona.title}</span><h2>{currentPersona.name}</h2></div>
                            </div>
                            {!isPersonaLocked && <FaChevronDown className="switcher-arrow" />}
                            {isPersonaSwitcherOpen && !isPersonaLocked && (
                                <div className="persona-dropdown">
                                    {personas.map(p => (
                                        <div key={p.id} className="persona-dropdown-item" onClick={() => { setCurrentPersonaId(p.id); setIsPersonaSwitcherOpen(false); }}>
                                            <img src={p.avatar} alt={p.name} /><span>{p.name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="top-bar-actions">
                            <button title="New Chat" className="icon-button" onClick={() => handleNewChat(true)}><FaPlus /></button>
                            <button title="Settings" className="icon-button" onClick={openSettingsModal}><FaCog /></button>
                        </div>
                    </div>

                    <div className="chat-window" ref={chatWindowRef}>
                        {filteredMessages.map((msg, index) => {
                            const isEditing = editingMessage?.index !== undefined && messages[editingMessage.index] === msg;
                            const isLastMessage = index === filteredMessages.length - 1;
                            const isAssistant = msg.role === 'assistant';
                            const { hasThinkTag, thinkingContent, answerContent } = handleThinkingContent(msg.content);
                            const isExpanded = expandedMessages.has(index);

                            return (
                                <div key={index} className={`message-wrapper ${msg.role}`}>
                                    <img src={isAssistant ? currentPersona.avatar : '/user-avatar.png'} alt={`${msg.role} avatar`} className="chat-avatar" />
                                    <div className="message-bubble">
                                        {isEditing ? (
                                            <div className="edit-view">
                                                <TextareaAutosize className="edit-textarea" value={editingMessage!.text} onChange={(e) => setEditingMessage({ ...editingMessage!, text: e.target.value })} />
                                                <div className="edit-actions"><button onClick={() => setEditingMessage(null)}>Cancel</button><button onClick={handleSaveOnly}>Save</button><button onClick={handleSaveAndRegenerate} className="regenerate">Save & Regenerate</button></div>
                                            </div>
                                        ) : (
                                            <>
                                                    <div className="message-content">
                                                        {typeof msg.content === 'string' ? (
                                                            <ReactMarkdown components={{ code: CodeBlock }} remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                                                                {answerContent}
                                                            </ReactMarkdown>
                                                        ) : (
                                                            msg.content.map((part, partIndex) => {
                                                                if (isTextPart(part)) {
                                                                    return (
                                                                        <ReactMarkdown 
                                                                            key={partIndex} 
                                                                            components={{ code: CodeBlock }} 
                                                                            remarkPlugins={[remarkGfm, remarkMath]} 
                                                                            rehypePlugins={[rehypeKatex]}
                                                                        >
                                                                            {part.text}
                                                                        </ReactMarkdown>
                                                                    );
                                                                }
                                                                if (isImagePart(part)) {
                                                                    return (
                                                                        <img 
                                                                            key={partIndex} 
                                                                            src={part.image_url.url} 
                                                                            alt="User upload" 
                                                                            style={{ maxWidth: '100%', borderRadius: '12px', marginTop: '8px' }} 
                                                                        />
                                                                    );
                                                                }
                                                                return null;
                                                            })
                                                        )}
                                                    </div>
                                                <div className="message-actions">
                                                    <button title="Edit" className="message-action-btn" onClick={() => handleStartEdit(msg)}><FaPencilAlt /></button>
                                                    <button title="Delete" className="message-action-btn delete" onClick={() => handleDeleteMessage(msg)}><FaTrash /></button>
                                                    {isLastMessage && isAssistant && !isLoading && (<button title="Regenerate" className="message-action-btn regenerate" onClick={handleRegenerateLast}><FaSyncAlt /></button>)}
                                                </div>
                                            </>
                                        )}
                                        {hasThinkTag && isExpanded && (<div className="thinking-block"><strong>Thinking Process:</strong><ReactMarkdown>{thinkingContent!}</ReactMarkdown></div>)}
                                        {hasThinkTag && <button onClick={() => toggleThinkingVisibility(index)} className="toggle-thinking-button">{isExpanded ? 'Hide thinking' : 'Show thinking'}</button>}
                                    </div>
                                </div>
                            );
                        })}
                        {isLoading && (<div className="message-wrapper assistant"><img src={currentPersona.avatar} alt="assistant avatar" className="chat-avatar" /><div className="message-bubble"><div className="thinking-dots"><span></span><span></span><span></span></div></div></div>)}
                    </div>
                    <div className="input-area">
                        {attachedImage && (
                            <div className="image-preview">
                                <img src={attachedImage} alt="Preview" />
                                <button onClick={() => setAttachedImage(null)}><FaTimes /></button>
                            </div>
                        )}
                        <TextareaAutosize
                            minRows={1}
                            maxRows={6}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                            placeholder="Ask your assistant or attach an image..."
                            disabled={isLoading || !!confirmation || isSettingsOpen}
                        />
                        <input type="file" id="file-upload" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                        <button className="icon-button attach-btn" onClick={() => document.getElementById('file-upload')?.click()} title="Attach Image">
                            <FaPaperclip />
                        </button>
                        <button onClick={sendMessage} disabled={isLoading || (!input.trim() && !attachedImage) || !!confirmation || isSettingsOpen}>Send</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;