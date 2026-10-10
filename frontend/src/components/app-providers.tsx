'use client';

import {useEffect, useState} from 'react';
import {Toaster} from 'react-hot-toast';

export function AppProviders({children}:{children:React.ReactNode}) {
  const [theme,setTheme] = useState<'light'|'dark'>('light');
  useEffect(() => {
    const saved = localStorage.getItem('workshop-theme');
    const initial = saved === 'dark' || saved === 'light' ? saved : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    queueMicrotask(() => setTheme(initial));
    document.documentElement.dataset.theme = initial;
  }, []);
  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('workshop-theme', next);
  }
  return <><div className="app-content">{children}</div><button className="theme-toggle" onClick={toggle} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>{theme === 'light' ? '☾' : '☀'} <span>{theme === 'light' ? 'Dark' : 'Light'} mode</span></button><Toaster position="top-center" toastOptions={{duration:3500,style:{background:'var(--panel)',color:'var(--text)',border:'1px solid var(--line)',borderRadius:12,boxShadow:'var(--shadow)'}}}/></>;
}
