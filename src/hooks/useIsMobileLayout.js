import { useState, useEffect } from 'react';

// Below this the device is treated as "phone-class" and gets the bottom nav
// instead of the sidebar. We classify by the SMALLER of width/height so that
// rotating a phone into landscape doesn't flip it into the tablet/desktop
// sidebar layout (raw window.innerWidth alone does, since a phone in
// landscape is often wider than 768px).
const MOBILE_BREAKPOINT = 768;

function computeIsMobile() {
  if (typeof window === 'undefined') return false;
  return Math.min(window.innerWidth, window.innerHeight) < MOBILE_BREAKPOINT;
}

export function useIsMobileLayout() {
  const [isMobile, setIsMobile] = useState(computeIsMobile);

  useEffect(() => {
    const handleResize = () => setIsMobile(computeIsMobile());
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return isMobile;
}
