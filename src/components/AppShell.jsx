import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../hooks/useSettings';
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  ShoppingCart, 
  DollarSign, 
  FileBarChart, 
  Settings as SettingsIcon, 
  LogOut, 
  Menu,
  Sun,
  Moon,
  Type,
  Zap,
  Receipt,
  Building2
} from 'lucide-react';

export function AppShell({ children }) {
  const { user, logout, isAdmin } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Theme & Font Sizing states
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

  // Sync settings theme preferences with settings page changes
  useEffect(() => {
    const handleStorageChange = () => {
      const savedTheme = localStorage.getItem('saga_ice_theme');
      if (savedTheme) setIsDarkMode(savedTheme === 'dark');

      const savedTextSize = localStorage.getItem('saga_ice_text_size');
      if (savedTextSize) setTextSize(savedTextSize);
    };
    window.addEventListener('storage', handleStorageChange);
    // Poll theme changes or dispatch custom event for local settings page triggers
    window.addEventListener('theme-changed', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('theme-changed', handleStorageChange);
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} />, adminOnly: false },
    { name: 'Production & Ops', path: '/production', icon: <Zap size={20} />, adminOnly: false },
    { name: 'Inventory', path: '/inventory', icon: <Package size={20} />, adminOnly: false },
    { name: 'Customers', path: '/customers', icon: <Users size={20} />, adminOnly: false },
    { name: 'Sales', path: '/sales', icon: <ShoppingCart size={20} />, adminOnly: false },
    { name: 'Debts', path: '/debts', icon: <DollarSign size={20} />, adminOnly: false },
    { name: 'Expense Ledger', path: '/expenses', icon: <Receipt size={20} />, adminOnly: true },
    { name: 'Client Portal', path: '/client-portal', icon: <Building2 size={20} />, adminOnly: false },
    { name: 'Reports', path: '/reports', icon: <FileBarChart size={20} />, adminOnly: true },
    { name: 'Settings', path: '/settings', icon: <SettingsIcon size={20} />, adminOnly: true }
  ];

  const visibleNavItems = navItems.filter(item => !item.adminOnly || isAdmin);

  const getPageTitle = () => {
    const currentItem = navItems.find(item => item.path === location.pathname);
    return currentItem ? currentItem.name : 'Sagacious Ice';
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 font-sans transition-colors duration-200">
      
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 h-full">
        {/* Branding header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center space-x-3">
          {settings?.logo_url ? (
            <img src={settings.logo_url} alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-navy-600 flex items-center justify-center text-white font-bold text-lg font-heading">
              S
            </div>
          )}
          <div>
            <h1 className="font-heading font-bold text-sm tracking-tight text-slate-900 dark:text-slate-50 leading-none">
              {settings?.company_name || 'Sagacious Ice'}
            </h1>
            <span className="text-[10px] text-navy-500 font-semibold tracking-wider uppercase">
              Factory Admin
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => 
                `flex items-center space-x-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive 
                    ? 'bg-navy-50 dark:bg-navy-950/30 text-navy-600 dark:text-navy-400 font-semibold shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100'
                }`
              }
            >
              {item.icon}
              <span>{item.name}</span>
            </NavLink>
          ))}
        </nav>

        {/* User profile / Logout bottom */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="flex items-center justify-between mb-3 px-2">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {user?.fullName || 'Staff Operator'}
              </span>
              <span className="text-[10px] text-slate-500 capitalize">
                Role: {user?.role || 'user'}
              </span>
            </div>
            {/* Theme Toggle Quick-Action */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Toggle Light/Dark Mode"
            >
              {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center justify-center space-x-2 w-full px-4 py-2 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/40 rounded-xl text-xs font-semibold transition"
          >
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Top Header Bar */}
        <header className="flex items-center justify-between h-16 px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-3 md:space-x-0">
            {/* Mobile Header Branding (Visible on mobile only) */}
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
            <h2 className="hidden md:block text-lg font-bold font-heading text-slate-800 dark:text-slate-100">
              {getPageTitle()}
            </h2>
          </div>

          {/* Right Header items */}
          <div className="flex items-center space-x-4">
            <span className="hidden sm:inline-flex text-xs px-2.5 py-1 rounded-full font-semibold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {user?.role} Access
            </span>
            <div className="md:hidden flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {user?.fullName?.split(' ')[0] || 'User'}
              </span>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition"
                title="Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>

        {/* Page Content Panel */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">
          {children}
        </main>
      </div>

      {/* Bottom Nav Bar - Mobile (Collapses sidebar on desktop) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-around z-40 px-2 shadow-lg">
        {visibleNavItems.slice(0, 5).map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => 
              `flex flex-col items-center justify-center flex-1 py-1 transition-all ${
                isActive 
                  ? 'text-navy-600 dark:text-navy-400 font-semibold' 
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400'
              }`
            }
          >
            {item.icon}
            <span className="text-[10px] mt-0.5">{item.name}</span>
          </NavLink>
        ))}
        {/* Render indicator for settings or reports on mobile if they are admin */}
        {isAdmin && visibleNavItems.length > 5 && (
          <NavLink
            to="/settings"
            className={({ isActive }) => 
              `flex flex-col items-center justify-center flex-1 py-1 transition-all ${
                isActive 
                  ? 'text-navy-600 dark:text-navy-400 font-semibold' 
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400'
              }`
            }
          >
            <SettingsIcon size={20} />
            <span className="text-[10px] mt-0.5">Settings</span>
          </NavLink>
        )}
      </nav>
    </div>
  );
}
