import { useState, useEffect } from 'react';

export function useNow() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // İlk mount anında istemci saatini al
    setNow(new Date());

    const updateTime = () => setNow(new Date());
    const intervalId = setInterval(updateTime, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') updateTime();
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', updateTime);
    window.addEventListener('pageshow', updateTime);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', updateTime);
      window.removeEventListener('pageshow', updateTime);
    };
  }, []);

  return now;
}