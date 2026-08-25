import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../hooks/useSettings';
import { useToast } from '../components/Toast';
import { Button } from '../components/Button';
import { User, Lock, LogIn, Snowflake } from 'lucide-react';

export function LoginPage() {
  const { login } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      toast.success("Welcome back!");
      navigate('/');
    } catch (err) {
      setError(err.message || 'Failed to login');
    } finally {
      setIsLoading(false);
    }
  };

  // Company Name parser for split typography
  const companyName = settings?.company_name || 'Sagacious Ice Factory';
  const words = companyName.split(' ');
  const firstWord = words[0] || 'Sagacious';
  const restWords = words.slice(1).join(' ') || 'Ice Factory';

  return (
    <div className="min-h-screen w-screen bg-[#80c5ff] bg-gradient-to-br from-[#cbe5ff] via-[#66b3ff] to-[#3399ff] flex items-center justify-center p-6 relative overflow-hidden font-sans select-none">
      
      {/* Decorative white/light-blue blur circles to match the visual glow effect */}
      <div className="absolute top-0 right-0 w-[450px] h-[450px] bg-white/30 rounded-full blur-[110px] pointer-events-none translate-x-1/4 -translate-y-1/4" />
      <div className="absolute -bottom-20 -left-20 w-[400px] h-[400px] bg-white/20 rounded-full blur-[100px] pointer-events-none" />
      
      {/* Main Centered Sign-In Card */}
      <div className="w-full max-w-[420px] landscape:max-w-[620px] bg-white rounded-[28px] sm:rounded-[36px] shadow-2xl p-6 sm:p-10 landscape:p-6 flex flex-col landscape:flex-row items-center space-y-5 sm:space-y-8 landscape:space-y-0 landscape:space-x-8 relative z-10 border border-white/20">
        
        {/* Branding Area (Logo & Split Typography) */}
        <div className="flex flex-col items-center text-center space-y-2 landscape:w-5/12 shrink-0">
          {settings?.logo_url ? (
            <img 
              src={settings.logo_url} 
              alt="Company Logo" 
              className="w-16 h-16 sm:w-24 sm:h-24 landscape:w-16 landscape:h-16 object-cover" 
            />
          ) : (
            <div className="text-[#005cbf] flex items-center justify-center">
              <Snowflake size={48} className="stroke-[1.5] animate-pulse sm:w-16 sm:h-16" />
            </div>
          )}

          <div className="flex flex-col items-center">
            <h1 className="text-2xl sm:text-3xl landscape:text-2xl font-extrabold font-heading tracking-wider text-[#003366] uppercase leading-none">
              {firstWord}
            </h1>
            <div className="flex items-center justify-center w-full my-1.5 space-x-2">
              <div className="h-[1.5px] w-6 sm:w-8 bg-[#005cbf]" />
              <span className="text-[10px] font-bold tracking-widest text-[#005cbf] uppercase">
                {restWords}
              </span>
              <div className="h-[1.5px] w-6 sm:w-8 bg-[#005cbf]" />
            </div>
            <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 tracking-wider">
              Pure Ice. Pure Quality.
            </p>
          </div>
        </div>

        {/* Credentials Form */}
        <div className="w-full landscape:w-7/12 flex flex-col space-y-3 sm:space-y-4">
          <form className="w-full space-y-3.5 sm:space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-semibold text-center">
                {error}
              </div>
            )}

            {/* Email / Username Field */}
            <div className="flex flex-col space-y-1">
              <label className="text-[10px] font-bold text-slate-500 tracking-widest uppercase text-left">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User size={15} />
                </div>
                <input
                  type="text"
                  required
                  placeholder="Username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-[#f0f4f8] hover:bg-[#e4ebf3] focus:bg-white border border-transparent focus:border-blue-500/25 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none transition shadow-inner min-h-[40px]"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="flex flex-col space-y-1">
              <label className="text-[10px] font-bold text-slate-500 tracking-widest uppercase text-left">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock size={15} />
                </div>
                <input
                  type="password"
                  required
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-[#f0f4f8] hover:bg-[#e4ebf3] focus:bg-white border border-transparent focus:border-blue-500/25 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none transition shadow-inner min-h-[40px]"
                />
              </div>
            </div>

            {/* Sign In button */}
            <Button
              type="submit"
              className="w-full py-2.5 rounded-xl font-bold bg-[#005cbf] hover:bg-[#004a9b] text-white flex items-center justify-center space-x-2 shadow-md shadow-blue-500/10 hover:scale-[1.01] transition-all duration-200 min-h-[42px]"
              isLoading={isLoading}
            >
              <LogIn size={16} />
              <span>Sign In</span>
            </Button>
          </form>

          {/* Credentials hints */}
          <div className="text-[10px] text-slate-400 font-semibold tracking-wider pt-2 border-t border-slate-100 w-full text-center">
            Admin: admin/admin | User: user/user
          </div>
        </div>

      </div>


    </div>
  );
}
