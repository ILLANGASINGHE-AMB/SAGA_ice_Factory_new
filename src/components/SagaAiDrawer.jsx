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
  Bot, 
  Maximize2, 
  Minimize2, 
  ArrowRight, 
  Cpu, 
  TrendingUp, 
  AlertTriangle, 
  Wrench, 
  PackageSearch 
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
      content: "Hello! I am **SAGA AI**, your intelligent factory executive assistant. I have full real-time access to analyze all system data including inventory, sales, customer debts, freezing energy efficiency, operating expenses, and machinery maintenance. \n\nHow can I help optimize your plant operations today?",
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
    { label: "⚡ Freezing Cost Efficiency", prompt: "Evaluate freezing production batches, electricity vs diesel energy costs, and average cost per cube." },
    { label: "🔧 Equipment Maintenance", prompt: "Check machinery maintenance logs and alert me about any equipment due for service or currently offline." },
    { label: "📦 Inventory Stock Alert", prompt: "Summarize manufactured ice, resell stock levels, and waste ratio. Are we running low on anything?" }
  ];

  const handleSend = async (textToSend) => {
    const query = textToSend || input.trim();
    if (!query || isLoading) return;

    if (!apiKey) {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now(),
          role: 'user',
          content: query,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        },
        {
          id: Date.now() + 1,
          role: 'model',
          content: "⚠️ **Gemini API Key missing!** \n\nPlease go to **Admin Settings** page to configure your Gemini API key before using SAGA AI.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isWarning: true
        }
      ]);
      setInput('');
      return;
    }

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
      // Send chat history (filtering out local system warning messages)
      const apiHistory = newHistory
        .filter(m => !m.isWarning)
        .map(m => ({ role: m.role, content: m.content }));

      const replyText = await sendSagaAiMessage(apiHistory, apiKey);

      setMessages(prev => [
        ...prev,
        {
          id: Date.now(),
          role: 'model',
          content: replyText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now(),
          role: 'model',
          content: `❌ **SAGA AI Analysis Error:** ${err.message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isError: true
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
    <div className={`fixed z-50 transition-all duration-300 ${
      isExpanded 
        ? 'inset-4 md:inset-10' 
        : 'bottom-4 right-4 left-4 sm:left-auto sm:w-[460px] h-[640px] max-h-[85vh]'
    }`}>
      <div className="flex flex-col h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-navy-900 via-slate-900 to-navy-950 text-white border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-tr from-navy-600 via-blue-500 to-cyan-400 p-0.5 shadow-lg shadow-blue-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Cpu className="w-5 h-5 text-cyan-400 animate-pulse" />
              </div>
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-950" />
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-heading font-extrabold text-base tracking-wide bg-gradient-to-r from-white via-slate-100 to-cyan-200 bg-clip-text text-transparent">
                  SAGA AI
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  System Intelligence
                </span>
              </div>
              <p className="text-[11px] text-slate-400 flex items-center space-x-1">
                <span>{apiKey ? 'Full System Data Access Enabled' : 'Gemini Key Needed'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-xl transition"
              title={isExpanded ? "Collapse Window" : "Expand Window"}
            >
              {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              onClick={handleClearChat}
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800/60 rounded-xl transition"
              title="Clear Conversation"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-xl transition"
              title="Close SAGA AI"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Missing API Key Banner */}
        {!apiKey && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 flex items-center justify-between text-xs text-amber-600 dark:text-amber-400">
            <div className="flex items-center space-x-2">
              <Key size={14} className="flex-shrink-0" />
              <span>Gemini API Key is required to activate SAGA AI.</span>
            </div>
            {isAdmin && (
              <button
                onClick={() => {
                  onClose();
                  navigate('/settings');
                }}
                className="font-semibold underline hover:text-amber-500 flex items-center space-x-1"
              >
                <span>Add Key</span>
                <ArrowRight size={12} />
              </button>
            )}
          </div>
        )}

        {/* Quick Suggestion Chips */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 flex items-center space-x-2 overflow-x-auto scrollbar-none">
          <span className="text-[11px] font-semibold text-slate-400 flex items-center space-x-1 flex-shrink-0 pr-1">
            <Sparkles size={12} className="text-cyan-500" />
            <span>Quick Prompts:</span>
          </span>
          {quickPrompts.map((item, i) => (
            <button
              key={i}
              onClick={() => handleSend(item.prompt)}
              disabled={isLoading}
              className="whitespace-nowrap px-3 py-1 bg-white dark:bg-slate-800 hover:bg-navy-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-xs rounded-full border border-slate-200 dark:border-slate-700 transition shadow-xs flex-shrink-0 disabled:opacity-50"
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
                    ? 'bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 rounded-tl-xs'
                    : msg.isError
                      ? 'bg-red-500/10 border border-red-500/30 text-red-900 dark:text-red-200 rounded-tl-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700/60 rounded-tl-xs'
              }`}>
                {/* Header for AI messages */}
                {msg.role === 'model' && (
                  <div className="flex items-center justify-between mb-1.5 border-b border-slate-200 dark:border-slate-700/60 pb-1">
                    <div className="flex items-center space-x-1.5 font-bold text-[11px] text-cyan-600 dark:text-cyan-400">
                      <Bot size={13} />
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
              <div className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-xs p-3.5 flex items-center space-x-3 text-slate-500">
                <Cpu className="w-4 h-4 text-cyan-500 animate-spin" />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  SAGA AI is analyzing full factory database...
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
              className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 rounded-xl px-4 py-2.5 text-xs border border-transparent focus:border-navy-500 dark:focus:border-cyan-500 focus:bg-white dark:focus:bg-slate-950 focus:outline-none transition"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-2.5 bg-gradient-to-r from-navy-600 to-blue-600 hover:from-navy-700 hover:to-blue-700 text-white rounded-xl transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
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
