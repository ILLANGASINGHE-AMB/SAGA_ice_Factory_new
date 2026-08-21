import React, { useState, useEffect, useRef } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useAuth } from '../context/AuthContext';
import { sendSagaAiMessage } from '../services/sagaAiService';
import { 
  Sparkles, 
  X, 
  Send, 
  Trash2, 
  Copy, 
  Check, 
  Key, 
  Maximize2, 
  Minimize2, 
  ArrowRight 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function SagaAiDrawer({ isOpen, onClose }) {
  const { settings } = useSettings();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const apiKey = settings?.gemini_api_key || localStorage.getItem('saga_gemini_api_key') || '';

  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'model',
      content: "Hello! I am **SAGA AI**, your factory executive assistant. I have full access to analyze all system data including inventory, sales, customer debts, and operating expenses. \n\nHow can I help analyze your plant operations today?",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, isLoading]);

  const quickPrompts = [
    { label: "📊 Profitability & Financials", prompt: "Analyze overall factory business profitability, sales revenues, and major expense overheads." },
    { label: "⚠️ Overdue Customer Debts", prompt: "Identify all customers with overdue debts and list the top owing amounts with phone numbers." },
    { label: "📦 Inventory Stock Alert", prompt: "Summarize manufactured ice, resell stock levels, and waste ratio. Are we running low on anything?" }
  ];

  const handleSend = async (textToSend) => {
    const query = textToSend || input.trim();
    if (!query || isLoading) return;

    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setIsLoading(true);

    try {
      // Send chat history via server-side Edge Proxy (filtering out local system warning messages)
      const apiHistory = newHistory
        .filter(m => !m.isWarning)
        .map(m => ({
          role: m.role === 'model' ? 'model' : 'user',
          content: m.content
        }));

      const reply = await sendSagaAiMessage(apiHistory, apiKey);

      setMessages(prev => [
        ...prev,
        {
          id: Date.now(),
          role: 'model',
          content: reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err) {
      console.error("SAGA AI Error:", err);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now(),
          role: 'model',
          content: `⚠️ **SAGA AI Connection Issue:**\n${err.message}\n\n*Note: Please configure your Gemini API Key in **Admin Settings** or set the GEMINI_API_KEY environment secret on your Supabase Edge Function server.*`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isWarning: true
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: Date.now(),
        role: 'model',
        content: "Chat history cleared. I'm ready to analyze your latest system data!",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  if (!isOpen) return null;

  // Simple Markdown text renderer helper
  const renderFormattedText = (text) => {
    if (!text) return null;

    const lines = text.split('\n');
    return lines.map((line, idx) => {
      // Bold replacement
      const parts = line.split(/(\*\*.*?\*\*)/g);
      const lineContent = parts.map((part, pIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={pIdx} className="font-semibold text-slate-900 dark:text-slate-100">{part.slice(2, -2)}</strong>;
        }
        return part;
      });

      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        return (
          <li key={idx} className="ml-4 list-disc my-1">
            {lineContent}
          </li>
        );
      }

      if (line.trim() === '') {
        return <div key={idx} className="h-2" />;
      }

      return <p key={idx} className="my-0.5 leading-relaxed">{lineContent}</p>;
    });
  };

  return (
    <div className={`fixed z-50 transition-all duration-200 ${
      isExpanded 
        ? 'inset-4 md:inset-8' 
        : 'bottom-4 right-4 left-4 sm:left-auto sm:w-[440px] h-[600px] max-h-[82vh]'
    }`}>
      <div className="flex flex-col h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        
        {/* Header - Clean system UI style */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-navy-50 dark:bg-navy-950/40 text-navy-600 dark:text-navy-400 border border-navy-100 dark:border-navy-900/50 flex items-center justify-center">
              <Sparkles size={18} />
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-heading font-bold text-sm text-slate-900 dark:text-slate-100">
                  SAGA AI
                </h3>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-navy-50 dark:bg-navy-950/40 text-navy-600 dark:text-navy-400 border border-navy-100 dark:border-navy-900/50">
                  Assistant
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {apiKey ? 'Full System Data Connected' : 'Gemini Key Needed'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
              title={isExpanded ? "Collapse Window" : "Expand Window"}
            >
              {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              onClick={handleClearChat}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition"
              title="Clear Conversation"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
              title="Close SAGA AI"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Missing API Key Banner */}
        {!apiKey && (
          <div className="bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-900/50 px-4 py-2 flex items-center justify-between text-xs text-amber-700 dark:text-amber-300">
            <div className="flex items-center space-x-2">
              <Key size={14} className="flex-shrink-0 text-amber-500" />
              <span>Gemini API Key is required to activate SAGA AI.</span>
            </div>
            {isAdmin && (
              <button
                onClick={() => {
                  onClose();
                  navigate('/settings');
                }}
                className="font-semibold underline hover:text-amber-800 dark:hover:text-amber-200 flex items-center space-x-1"
              >
                <span>Add Key</span>
                <ArrowRight size={12} />
              </button>
            )}
          </div>
        )}

        {/* Quick Suggestion Chips */}
        <div className="px-4 py-2.5 bg-slate-50/60 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 flex items-center space-x-2 overflow-x-auto scrollbar-none">
          {quickPrompts.map((item, i) => (
            <button
              key={i}
              onClick={() => handleSend(item.prompt)}
              disabled={isLoading}
              className="whitespace-nowrap px-3 py-1 bg-white dark:bg-slate-800 hover:bg-navy-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-xs rounded-xl border border-slate-200 dark:border-slate-700 transition shadow-xs flex-shrink-0 disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Chat Messages */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs text-slate-800 dark:text-slate-200">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`group relative max-w-[88%] rounded-2xl p-3.5 shadow-xs transition ${
                msg.role === 'user'
                  ? 'bg-navy-600 text-white rounded-tr-xs'
                  : msg.isWarning
                    ? 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200 rounded-tl-xs'
                    : msg.isError
                      ? 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-900 dark:text-red-200 rounded-tl-xs'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700/80 rounded-tl-xs'
              }`}>
                {/* Header for AI messages */}
                {msg.role === 'model' && (
                  <div className="flex items-center justify-between mb-1.5 border-b border-slate-200/60 dark:border-slate-700/60 pb-1">
                    <div className="flex items-center space-x-1.5 font-bold text-[11px] text-navy-600 dark:text-navy-400">
                      <Sparkles size={13} />
                      <span>SAGA AI</span>
                    </div>
                    <button
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="opacity-0 group-hover:opacity-100 transition p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
                      title="Copy Response"
                    >
                      {copiedId === msg.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                    </button>
                  </div>
                )}

                <div className="space-y-1">
                  {renderFormattedText(msg.content)}
                </div>

                <div className={`text-[9px] mt-2 text-right ${
                  msg.role === 'user' ? 'text-navy-200' : 'text-slate-400'
                }`}>
                  {msg.timestamp}
                </div>
              </div>
            </div>
          ))}

          {/* Thinking Indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-xs p-3.5 flex items-center space-x-2.5 text-slate-500">
                <Sparkles className="w-4 h-4 text-navy-600 dark:text-navy-400 animate-spin" />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  SAGA AI is analyzing factory system data...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center space-x-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={apiKey ? "Ask SAGA AI to analyze factory data..." : "Add Gemini API Key in Settings to use SAGA AI"}
              disabled={isLoading}
              className="flex-1 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 rounded-xl px-4 py-2 text-xs border border-slate-200 dark:border-slate-700 focus:border-navy-500 focus:bg-white dark:focus:bg-slate-950 focus:outline-none transition"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-2.5 bg-navy-600 hover:bg-navy-700 text-white rounded-xl transition shadow-xs disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              title="Send Message"
            >
              <Send size={15} />
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
