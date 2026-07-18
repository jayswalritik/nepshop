// Small red count pill — 9+ cap, hidden entirely at 0. Shared across the
// bell button, the mobile-header bell, and the sidebar "Notifications" nav
// tab so all three read the same visual language for the same number.
const UnreadBadge = ({ count, className = '' }) => {
  if (!count) return null;
  return (
    <span className={`bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center leading-none ${className}`}>
      {count > 9 ? '9+' : count}
    </span>
  );
};

export default UnreadBadge;
