'use client';

import { Suspense, FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api, personId, personName, Workshop } from '@/lib/api';
import { ContentSkeleton, Icon, Loading, Modal, Notice, useAuth } from '@/components/ui';
import { RoomChat } from '@/components/room-chat';

function HostRoom() {
  const { pin } = useParams<{ pin: string }>();
  const id = useSearchParams().get('id');
  const router = useRouter();
  const { user, loading } = useAuth();
  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'roster' | 'requests'>('roster');
  const [view, setView] = useState<'editor' | 'chat'>('editor');
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [busy, setBusy] = useState(false);
  const [deciding, setDeciding] = useState('');
  const [endOpen, setEndOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const result = await api<{ workshop: Workshop }>(`/workshops/${id}`);
      setWorkshop(result.workshop);
      setError('');
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, [id]);

  useEffect(() => {
    if (!user) return;
    void Promise.resolve().then(refresh);
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [user, refresh]);

  async function push(event: FormEvent) {
    event.preventDefault();
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      await api(`/workshops/${id}/snippets`, {
        method: 'POST',
        body: JSON.stringify({ title, code, language }),
      });
      setTitle('');
      setCode('');
      await refresh();
      toast.success('Code shared with the room');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function decide(userId: string, action: 'approve' | 'reject') {
    if (!id) return;
    setDeciding(userId);
    setError('');
    try {
      await api(`/workshops/${id}/join-requests/${userId}/${action}`, { method: 'PATCH' });
      await refresh();
      toast.success(action === 'approve' ? 'Participant approved' : 'Request declined');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setDeciding('');
    }
  }

  async function resolve(errorId: string) {
    if (!id) return;
    try {
      await api(`/workshops/${id}/errors/${errorId}/resolve`, { method: 'PATCH' });
      await refresh();
      toast.success('Marked resolved');
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function end() {
    if (!id) return;
    try {
      await api(`/workshops/${id}/end`, { method: 'PATCH' });
      toast.success('Session ended');
      setEndOpen(false);
      router.push(`/dashboard/archive/${id}`);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  const requests = workshop?.joinRequests?.filter(request => request.user) || [];
  const roomError = !id ? 'Open this room from your dashboard.' : error;

  return <main className="live">
    <header className="live-bar">
      <div><Link href="/">← Workspace</Link><span className="bar-divider"/><strong>{workshop?.title || 'Live room'}</strong><span className="live-pill"><span className="dot"/> LIVE</span></div>
      <div><button className="room-pin-button" onClick={() => navigator.clipboard.writeText(pin).then(() => toast.success('Room PIN copied'))} title="Copy room PIN">PIN <b>{pin}</b> <Icon name="copy" size={14}/></button><button className="button outline small" onClick={() => setEndOpen(true)} disabled={!workshop}>End session</button></div>
    </header>
    {loading || (!workshop && !roomError) ? <div className="room-loading"><ContentSkeleton/><ContentSkeleton/><ContentSkeleton/></div> : workshop ? <div className="host-grid">
      <aside className="roster-panel">
        <div className="panel-heading"><div className="eyebrow">PEOPLE</div><h2>Room access <span>{requests.length}</span></h2></div>
        <div className="roster-tabs"><button className={tab === 'roster' ? 'active' : ''} onClick={() => setTab('roster')}>Roster · {workshop.roster?.length || 0}</button><button className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>Requests · {requests.length}</button></div>
        {tab === 'roster' ? <div className="roster-list">{workshop.roster?.length ? workshop.roster.map((person, index) => <div className="roster-row" key={personId(person)}><span className="avatar">{personName(person).charAt(0) || index + 1}</span><span>{personName(person)}</span><span className="dot"/></div>) : <p>People appear here after joining or being approved.</p>}</div> : <div className="roster-list">{requests.length ? requests.map(request => request.user && <div className="host-request" key={personId(request.user)}><div className="host-request-person"><span className="avatar">{personName(request.user).charAt(0)}</span><strong>{personName(request.user)}</strong></div><small>{request.user.email}</small><div className="host-request-actions"><button disabled={Boolean(deciding)} onClick={() => decide(personId(request.user), 'reject')}>Reject</button><button disabled={Boolean(deciding)} onClick={() => decide(personId(request.user), 'approve')}>Approve</button></div></div>) : <p>No one is waiting to join.</p>}</div>}
        <div className="access-foot"><span className="dot"/> {workshop.approvalRequired ? 'Approval required' : 'Open join'} <Link href="/dashboard">Manage settings</Link></div>
      </aside>
      <section className="editor-panel">
        <div className="panel-heading"><div className="eyebrow">SHARE WITH EVERYONE</div><h2>{view === 'editor' ? 'Live editor' : 'Room chat'}</h2></div>
        <nav className="room-view-tabs" aria-label="Center panel view"><button className={view === 'editor' ? 'active' : ''} onClick={() => setView('editor')}>Live editor</button><button className={view === 'chat' ? 'active' : ''} onClick={() => setView('chat')}>Chat &amp; files</button></nav>
        {view === 'chat' && id && user ? <RoomChat roomId={id} userId={user._id} active={workshop.status === 'active'}/> : <form onSubmit={push} className="editor-form"><div className="editor-controls"><input placeholder="Snippet title (optional)" aria-label="Snippet title" value={title} onChange={event => setTitle(event.target.value)}/><select aria-label="Code language" value={language} onChange={event => setLanguage(event.target.value)}><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="python">Python</option><option value="html">HTML</option><option value="css">CSS</option><option value="text">Text</option></select></div><textarea required spellCheck={false} placeholder="// Write code here, then push it to everyone in the room..." value={code} onChange={event => setCode(event.target.value)}/><div className="editor-footer"><span>{error || `${workshop.snippets?.length || 0} snippets pushed`}</span><button disabled={busy || !code.trim()} className="button primary">{busy ? 'Pushing...' : 'Push code'} <Icon name="arrow"/></button></div></form>}
      </section>
      <aside className="errors-panel"><div className="panel-heading"><div className="eyebrow">HELP REQUESTS</div><h2>Error queue <span>{workshop.errors?.filter(item => !item.resolved).length || 0}</span></h2></div><div className="error-list">{workshop.errors?.some(item => !item.resolved) ? workshop.errors.filter(item => !item.resolved).map(item => <article className="error-item" key={item._id}><div className="error-item-top"><strong>{personName(item.student)}</strong><time>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><pre>{item.errorMessage}</pre>{item.codeBlock && <details><summary>Attached code</summary><pre>{item.codeBlock}</pre></details>}<button onClick={() => resolve(item._id)}><Icon name="check" size={16}/> Mark resolved</button></article>) : <div className="queue-empty"><Icon name="check" size={25}/><h3>All clear</h3><p>Participant errors will appear here.</p></div>}</div></aside>
    </div> : <div className="wrap"><Notice>{roomError || 'Room not found.'}</Notice></div>}
    {endOpen && <Modal title="End this session?" close={() => setEndOpen(false)}><div className="modal-body"><p>Participants can still read the archive, but no one can add new code or messages after you end the room.</p><div className="confirm-actions"><button className="button outline" onClick={() => setEndOpen(false)}>Keep room open</button><button className="button primary" onClick={end}>End session</button></div></div></Modal>}
  </main>;
}

export default function Page() {
  return <Suspense fallback={<Loading/>}><HostRoom/></Suspense>;
}
