import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API from '../../utils/api';

const roleConfig = {
  customer: { label: 'Shopping',   icon: '🛍️', route: '/customer/dashboard' },
  seller:   { label: 'Selling',    icon: '🏪', route: '/seller/dashboard' },
  delivery: { label: 'Delivering', icon: '🚚', route: '/delivery/dashboard' },
};

const RoleSwitcher = ({ openDirection = 'down' }) => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

 // Normalize roles (fallback to legacy single role)
  const roles      = user?.roles && user.roles.length ? user.roles : [user?.role];
  const activeRole = user?.activeRole || user?.role;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Don't render for single-role users or admins
  if (!roles || roles.length < 2 || roles.includes('admin')) {
    return null;
  }

  const handleSwitch = async (role) => {
    if (role === activeRole) { setOpen(false); return; }
    setLoading(true);
    try {
      const { data } = await API.post('/auth/switch-role', { role });
      const token = localStorage.getItem('nepshop_token');
      login(data.user, token);
      setOpen(false);
      navigate(roleConfig[role].route);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to switch role');
    } finally {
      setLoading(false);
    }
  };

  const current = roleConfig[activeRole] || roleConfig.customer;

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="w-full flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-all disabled:opacity-60"
      >
        <span>{current.icon}</span>
        <span>{current.label}</span>
        <svg className={`w-3.5 h-3.5 text-gray-400 ml-auto transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className={`absolute left-0 right-0 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50
          ${openDirection === 'up' ? 'bottom-full mb-2' : 'mt-2'}`}>
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Switch Mode</p>
          </div>
          {roles.filter(r => roleConfig[r]).map((role) => {
            const cfg = roleConfig[role];
            const isActive = role === activeRole;
            return (
              <button
                key={role}
                onClick={() => handleSwitch(role)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-all text-left
                  ${isActive ? 'bg-indigo-50 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                <span className="text-lg">{cfg.icon}</span>
                <div className="flex-1">
                  <p className="font-medium">{cfg.label}</p>
                  <p className="text-xs text-gray-400 capitalize">{role} mode</p>
                </div>
                {isActive && <span className="text-indigo-600 text-xs">✓ Active</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RoleSwitcher;