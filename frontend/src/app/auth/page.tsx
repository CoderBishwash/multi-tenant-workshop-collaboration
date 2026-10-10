'use client';

import {FormEvent, Suspense, useState} from 'react';
import Link from 'next/link';
import {useRouter, useSearchParams} from 'next/navigation';
import toast from 'react-hot-toast';
import {api, destination} from '@/lib/api';
import {Brand, Icon, Notice} from '@/components/ui';

function Auth() {
  const router = useRouter();
  const search = useSearchParams();
  const action = search.get('next');
  const [mode, setMode] = useState<'login' | 'register'>(search.get('mode') === 'register' ? 'register' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/auth/${mode}`, {method:'POST',body:JSON.stringify(mode === 'register' ? {name,email,password} : {email,password})});
      toast.success(mode === 'register' ? 'Your account is ready' : 'Welcome back');
      const returnPin = search.get('pin');
      router.replace(action === 'join' && /^[0-9]{4}$/.test(returnPin || '') ? `/?pin=${returnPin}` : destination());
      router.refresh();
    } catch (cause) {
      setError((cause as Error).message);
      toast.error((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth auth-redesign">
    <header className="auth-top"><Brand/><Link href="/" className="back">← Back to workspace</Link></header>
    <div className="auth-center"><div className="auth-intro"><span className="eyebrow">WELCOME IN</span><h1>{mode === 'login' ? 'Good to have you back.' : 'Make room for learning.'}</h1><p>{action === 'join' ? 'Create an account or log in to join the room.' : action === 'create' ? 'Create an account or log in to host a workshop.' : 'Your rooms, code, and conversations are waiting.'}</p></div>
      <div className="auth-card"><div className="tabs" role="tablist" aria-label="Account access"><button role="tab" aria-selected={mode==='login'} className={mode === 'login' ? 'active' : ''} onClick={()=>{setMode('login');setError('')}}>Log in</button><button role="tab" aria-selected={mode==='register'} className={mode === 'register' ? 'active' : ''} onClick={()=>{setMode('register');setError('')}}>Sign up</button></div>
        <form className="auth-form" onSubmit={submit}><h2>{mode === 'login' ? 'Log in to your account' : 'Create your account'}</h2><p>{mode === 'login' ? 'Enter your details to continue.' : 'It takes less than a minute to get started.'}</p>
          {mode === 'register' && <label className="field">Full name<input required minLength={3} maxLength={100} autoComplete="name" placeholder="Alex Morgan" value={name} onChange={event=>setName(event.target.value)}/></label>}
          <label className="field">Email address<input required type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={event=>setEmail(event.target.value)}/></label>
          <label className="field">Password<input required type="password" minLength={mode==='register'?6:1} autoComplete={mode==='register'?'new-password':'current-password'} placeholder="Enter your password" value={password} onChange={event=>setPassword(event.target.value)}/></label>
          {error && <Notice>{error}</Notice>}<button disabled={busy} className="button primary full">{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'} <Icon name="arrow" size={17}/></button>
        </form>
      </div><p className="auth-footnote">A simple space to teach, learn, and build together.</p>
    </div>
  </main>;
}

export default function Page(){return <Suspense fallback={<div className="loading">Loading…</div>}><Auth/></Suspense>}
