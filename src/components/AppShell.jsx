import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../hooks/useSettings';
import { SagaAiDrawer } from './SagaAiDrawer';
import { GlobalSearchModal } from './GlobalSearchModal';
import { 
  LayoutDashboard,
  Package,
  Users,
  Contact,
  Truck,
  ShoppingCart,
  DollarSign, 
  FileBarChart, 
  Settings as SettingsIcon, 
  LogOut, 
  Menu,
  Sun,
  Moon,
  Receipt,
  Sparkles,
  Search,
  Landmark,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronLeft,
  ChevronRight,
  Route
} from 'lucide-react';

export function AppShell({ children }) {
  const { user, logout, isAdmin } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();

  // Collapsible sidebar state (saved in localStorage)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('saga_sidebar_collapsed');
    if (saved !== null) return saved === 'true';
    // Auto-collapse if tablet screen width
    return typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerWidth <= 1180;
  });

  // SAGA AI Drawer, Mobile Menu & Global Search states
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(
    settings?.ai_enabled !== undefined 
      ? settings.ai_enabled 
      : (localStorage.getItem('saga_ai_enabled') !== 'false')
  );

  // Global ⌘K / Ctrl+K keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (settings?.ai_enabled !== undefined) {
      setAiEnabled(settings.ai_enabled);
    }
  }, [settings]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('saga_sidebar_collapsed', String(next));
      return next;
    });
  };
  
  // Theme & Font Sizing & AI Toggle states
  const [isDarkMode, setIsDarkMode] = useState(
    localStorage.getItem('saga_ice_theme') === 'dark' ||
    (!localStorage.getItem('saga_ice_theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );
  
  const [textSize, setTextSize] = useState(
    localStorage.getItem('saga_ice_text_size') || 'medium' // 'small', 'medium', 'large'
  );

  // Apply Theme & Font Sizing
  useEffect(() => {
    // Apply theme
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('saga_ice_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('saga_ice_theme', 'light');
    }
    window.dispatchEvent(new Event('theme-changed'));
  }, [isDarkMode]);

  useEffect(() => {
    // Apply text size CSS variable
    const sizeMap = {
      small: '14px',
      medium: '16px',
      large: '18px'
    };
    document.documentElement.style.setProperty('--text-base-size', sizeMap[textSize]);
    localStorage.setItem('saga_ice_text_size', textSize);
  }, [textSize]);

  // Sync settings preferences with settings page changes
  useEffect(() => {
    const handleStorageChange = () => {
      const savedTheme = localStorage.getItem('saga_ice_theme');
      if (savedTheme) setIsDarkMode(savedTheme === 'dark');

      const savedTextSize = localStorage.getItem('saga_ice_text_size');
      if (savedTextSize) setTextSize(savedTextSize);

      const savedAiEnabled = localStorage.getItem('saga_ai_enabled');
      if (savedAiEnabled !== null) setAiEnabled(savedAiEnabled !== 'false');
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('theme-changed', handleStorageChange);
    window.addEventListener('ai-enabled-changed', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('theme-changed', handleStorageChange);
      window.removeEventListener('ai-enabled-changed', handleStorageChange);
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} />, adminOnly: false },
    { name: 'Inventory', path: '/inventory', icon: <Package size={20} />, adminOnly: false },
    { name: 'Customers', path: '/customers', icon: <Users size={20} />, adminOnly: false },
    { name: 'Employees', path: '/employees', icon: <Contact size={20} />, adminOnly: false },
    { name: 'Vehicles', path: '/vehicles', icon: <Truck size={20} />, adminOnly: false },
    { name: 'Transport', path: '/transport', icon: <Route size={20} />, adminOnly: false },
    { name: 'Sales', path: '/sales', icon: <ShoppingCart size={20} />, adminOnly: false },
    { name: 'Debts', path: '/debts', icon: <DollarSign size={20} />, adminOnly: false },
    { name: 'Expenses', path: '/expenses', icon: <Receipt size={20} />, adminOnly: false },
    { name: 'Cash & Bank Details', path: '/cash-bank', icon: <Landmark size={20} />, adminOnly: false },
    { name: 'Reports', path: '/reports', icon: <FileBarChart size={20} />, adminOnly: true },
    { name: 'Settings', path: '/settings', icon: <SettingsIcon size={20} />, adminOnly: false }
  ];

  const visibleNavItems = navItems.filter(item => !item.adminOnly || isAdmin);

  const getPageTitle = () => {
    const currentItem = navItems.find(item =>
      item.path === location.pathname || location.pathname.startsWith(`${item.path}/`)
    );
    return currentItem ? currentItem.name : 'Sagacious Ice';
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 font-sans transition-colors duration-200">
      
      {/* Sidebar - Desktop & Tablet & Mobile Landscape (Collapsible Icon Rail) */}
      <aside 
        className={`hidden md:flex flex-col ${
          isSidebarCollapsed ? 'w-20' : 'w-64'
        } bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 h-full transition-all duration-300 select-none z-30 shrink-0`}
      >
        {/* Branding header */}
        <div className={`p-4 ${isSidebarCollapsed ? 'px-3 justify-center' : 'px-5'} border-b border-slate-200 dark:border-slate-800 flex items-center justify-between`}>
          <div className="flex items-center space-x-3 overflow-hidden">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="Logo" className="w-8 h-8 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-navy-600 flex items-center justify-center text-white font-bold text-lg font-heading shrink-0 shadow-sm">
                S
              </div>
            )}
            {!isSidebarCollapsed && (
              <div className="truncate">
                <h1 className="font-heading font-bold text-sm tracking-tight text-slate-900 dark:text-slate-50 leading-none truncate">
                  {settings?.company_name || 'Sagacious Ice'}
                </h1>
                <span className="text-[10px] text-navy-500 font-semibold tracking-wider uppercase">
                  Factory Admin
                </span>
              </div>
            )}
          </div>

          {/* Toggle Sidebar Width Button */}
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar (More Workspace Space)"}
            aria-label="Toggle Sidebar"
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-2.5 sm:p-3 space-y-1 overflow-y-auto touch-scroll">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={isSidebarCollapsed ? item.name : undefined}
              className={({ isActive }) => 
                `flex items-center ${
                  isSidebarCollapsed ? 'justify-center px-0 py-2.5' : 'space-x-3 px-3.5 py-2.5'
                } rounded-xl text-sm font-medium transition-all duration-200 group relative ${
                  isActive 
                    ? 'bg-navy-50 dark:bg-sky-500/10 text-navy-600 dark:text-sky-400 font-semibold shadow-sm border border-navy-100 dark:border-sky-500/20'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                }`
              }
            >
              <div className="shrink-0">
                {item.icon}
              </div>
              {!isSidebarCollapsed && <span className="truncate">{item.name}</span>}
              
              {/* Tooltip for collapsed state */}
              {isSidebarCollapsed && (
                <div className="fixed left-20 ml-2 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-50 whitespace-nowrap">
                  {item.name}
                </div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User profile / Logout bottom */}
        <div className={`p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur-md ${isSidebarCollapsed ? 'flex flex-col items-center space-y-2' : ''}`}>
          {!isSidebarCollapsed ? (
            <>
              <div className="flex items-center justify-between mb-2.5 px-1">
                <div className="flex flex-col truncate pr-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                    {user?.fullName || 'Staff Operator'}
                  </span>
                  <span className="text-[10px] text-slate-500 capitalize font-medium">
                    Role: {user?.role || 'user'}
                  </span>
                </div>
                {/* Theme Toggle Quick-Action */}
                <button
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition shrink-0"
                  title="Toggle Light/Dark Mode"
                >
                  {isDarkMode ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} />}
                </button>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center justify-center space-x-2 w-full px-3 py-2 bg-slate-100 dark:bg-slate-800/80 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700/60 hover:border-rose-300 dark:hover:border-rose-800/60 rounded-xl text-xs font-semibold transition-all duration-200"
              >
                <LogOut size={14} />
                <span>Logout</span>
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center space-y-2">
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                title="Toggle Light/Dark Mode"
              >
                {isDarkMode ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} />}
              </button>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                title="Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Top Header Bar - Optimized Compact Height for Landscape */}
        <header className="flex items-center justify-between h-13 sm:h-14 md:h-14 px-4 sm:px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0 z-20">
          <div className="flex items-center space-x-3">
            {/* Mobile Header Branding (Visible on portrait mobile only) */}
            <div className="flex md:hidden items-center space-x-2">
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="Logo" className="w-6 h-6 rounded object-cover" />
              ) : (
                <div className="w-6 h-6 rounded bg-navy-600 flex items-center justify-center text-white font-bold text-xs font-heading">
                  S
                </div>
              )}
              <span className="font-heading font-bold text-xs text-slate-900 dark:text-slate-100">
                {settings?.company_name || 'Sagacious'}
              </span>
            </div>
            <h2 className="hidden md:block text-base sm:text-lg font-bold font-heading text-slate-800 dark:text-slate-100 tracking-tight">
              {getPageTitle()}
            </h2>
          </div>

          {/* Right Header items */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Global Search Button */}
            <button
              onClick={() => setIsSearchOpen(true)}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 text-xs font-medium transition min-h-[36px]"
              title="Search System (⌘K)"
            >
              <Search size={14} />
              <span className="hidden sm:inline">Search...</span>
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded shadow-2xs">
                ⌘K
              </kbd>
            </button>

            <span className="hidden sm:inline-flex text-xs px-2.5 py-1 rounded-full font-semibold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {user?.role} Access
            </span>
            <div className="md:hidden flex items-center space-x-1.5">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {user?.fullName?.split(' ')[0] || 'User'}
              </span>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition min-h-[36px] min-w-[36px] flex items-center justify-center"
                title="Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>

        {/* Page Content Panel - Landscape Optimized Padding */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 pb-20 md:pb-6 landscape:pb-4 touch-scroll">
          {children}
        </main>
      </div>

      {/* Bottom Nav Bar - Mobile Portrait Only (Hidden on landscape to preserve height) */}
      <nav className="md:hidden landscape:hidden fixed bottom-0 left-0 right-0 h-14 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-around z-40 px-1 shadow-lg">
        {visibleNavItems.slice(0, 4).map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => 
              `flex flex-col items-center justify-center flex-1 py-1 transition-all ${
                isActive 
                  ? 'text-navy-600 dark:text-sky-400 font-semibold' 
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400'
              }`
            }
          >
            {item.icon}
            <span className="text-[10px] mt-0.5">{item.name}</span>
          </NavLink>
        ))}

        {/* More Menu Trigger */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
            isMobileMenuOpen ? 'text-navy-600 dark:text-sky-400 font-semibold' : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <Menu size={20} />
          <span className="text-[10px] mt-0.5">More</span>
        </button>
      </nav>

      {/* Mobile More Navigation Bottom Sheet */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}>
          <div 
            className="bg-white dark:bg-slate-900 rounded-t-2xl p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 shadow-2xl max-h-[75vh] overflow-y-auto touch-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-heading font-bold text-base text-slate-900 dark:text-slate-100">All Factory Modules</h3>
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {visibleNavItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) => 
                    `flex items-center space-x-3 p-2.5 sm:p-3 rounded-xl text-xs font-medium transition-all ${
                      isActive 
                        ? 'bg-navy-50 dark:bg-sky-500/10 text-navy-600 dark:text-sky-400 font-bold border border-navy-100 dark:border-sky-500/20' 
                        : 'bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                    }`
                  }
                >
                  {item.icon}
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Global Search Modal */}
      <GlobalSearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      {/* Floating SAGA AI Assistant Button & Drawer (Only if AI is enabled) */}
      {aiEnabled && (
        <>
          <div className="fixed bottom-16 sm:bottom-6 right-4 sm:right-6 landscape:bottom-5 z-40">
            <button
              type="button"
              onClick={() => setIsAiOpen(!isAiOpen)}
              className="flex items-center space-x-2 px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-full bg-navy-600 hover:bg-navy-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 border border-navy-500/20 active:scale-95"
              title="Open SAGA AI Assistant"
            >
              <Sparkles size={16} className="text-white shrink-0" />
              <span className="font-heading font-bold text-xs tracking-wide">
                SAGA AI
              </span>
            </button>
          </div>

          <SagaAiDrawer isOpen={isAiOpen} onClose={() => setIsAiOpen(false)} />
        </>
      )}
    </div>
  );
}

