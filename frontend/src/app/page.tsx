'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { api, date, JoinRequest, JoinResult, MyWorkshops, personId, personName, Workshop } from '@/lib/api';
import { Empty, Header, Icon, Loading, Modal, Notice, useAuth } from '@/components/ui';

const emptyRooms: MyWorkshops = { owned: [], joined: [], pending: [] };

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth(false);
  const router = useRouter();
  const [rooms, setRooms] = useState<MyWorkshops>(emptyRooms);
  const [requestCounts, setRequestCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [discover, setDiscover] = useState<Workshop[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(true);
  const [discoverError, setDiscoverError] = useState('');
  const [query, setQuery] = useState('');
  const [roomView, setRoomView] = useState<'hosting' | 'joined' | 'pending' | 'archive'>('hosting');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pin, setPin] = useState('');
  const [joining, setJoining] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createdRoom, setCreatedRoom] = useState<{ _id: string; pin: string } | null>(null);
  const [manageRoom, setManageRoom] = useState<Workshop | null>(null);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [manageError, setManageError] = useState('');
  const [managing, setManaging] = useState(false);
  const [deciding, setDeciding] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api<MyWorkshops>('/workshops/mine');
      setRooms(data);
      setError('');
      const counts = await Promise.all(data.owned.filter(room => room.status === 'active').map(async room => {
        try {
          const result = await api<{ requests: JoinRequest[] }>(`/workshops/${room._id}/join-requests`);
          return [room._id, result.requests.length] as const;
        } catch {
          return [room._id, 0] as const;
        }
      }));
      setRequestCounts(Object.fromEntries(counts));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void Promise.resolve().then(load);
    const timer = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(timer);
  }, [user, load]);

  // Pending approvals are checked separately so another person's decision appears without a refresh.
  useEffect(() => {
    if (!user || loading || rooms.pending.length === 0) return;
    const pendingIds = new Set(rooms.pending.map(room => room._id));
    let active = true;
    let checking = false;
    const check = async () => {
      if (checking || !active) return;
      checking = true;
      try {
        const latest = await api<MyWorkshops>('/workshops/mine');
        if (!active) return;
        const approved = latest.joined.find(room => pendingIds.has(room._id));
        if (approved) {
          setRooms(latest);
          setRoomView('joined');
          toast.success(`You can now enter ${approved.title}`);
        } else if (latest.pending.length !== pendingIds.size || latest.pending.some(room => !pendingIds.has(room._id))) {
          setRooms(latest);
        }
      } catch {
        // The regular dashboard refresh reports API errors.
      } finally {
        checking = false;
      }
    };
    const timer = window.setInterval(() => void check(), 1000);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [user, loading, rooms.pending]);

  useEffect(() => {
    api<{workshops:Workshop[]}>('/workshops').then(data => setDiscover(data.workshops)).catch(cause => setDiscoverError((cause as Error).message)).finally(() => setDiscoverLoading(false));
    const pendingPin = new URLSearchParams(window.location.search).get('pin');
    if (pendingPin && /^[0-9]{4}$/.test(pendingPin)) queueMicrotask(() => setPin(pendingPin));
  }, []);

  async function join(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setJoining(true);
    try {
      const result = await api<JoinResult>('/workshops/join', {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
      if (result.status === 'pending') {
        toast.success('Request sent to the host');
        setSuccess('Request sent. The room creator will decide whether to let you in.');
        setPin('');
        await load();
      } else {
        router.push(`/session/live/${pin}?id=${result.workshopId}`);
      }
    } catch (cause) {
      toast.error((cause as Error).message);
      setError((cause as Error).message);
    } finally {
      setJoining(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setManageError('');
    setCreating(true);
    try {
      const result = await api<{ workshop: { _id: string; pin: string } }>('/workshops', {
        method: 'POST',
        body: JSON.stringify({ title, description, approvalRequired }),
      });
      setCreatedRoom(result.workshop);
      toast.success('Room created');
      setTitle('');
      setDescription('');
      await load();
      void api<{workshops:Workshop[]}>('/workshops').then(data => setDiscover(data.workshops)).catch(() => {});
    } catch (cause) {
      toast.error((cause as Error).message);
      setManageError((cause as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function openManage(room: Workshop) {
    setManageRoom(room);
    setManageError('');
    setRequests([]);
    setManaging(true);
    try {
      const result = await api<{ requests: JoinRequest[] }>(`/workshops/${room._id}/join-requests`);
      setRequests(result.requests);
    } catch (cause) {
      setManageError((cause as Error).message);
    } finally {
      setManaging(false);
    }
  }

  async function decide(room: Workshop, requesterId: string, action: 'approve' | 'reject') {
    setDeciding(requesterId);
    setManageError('');
    try {
      await api(`/workshops/${room._id}/join-requests/${requesterId}/${action}`, { method: 'PATCH' });
      const result = await api<{ requests: JoinRequest[] }>(`/workshops/${room._id}/join-requests`);
      setRequests(result.requests);
      await load();
      toast.success(action === 'approve' ? 'Participant approved' : 'Request declined');
    } catch (cause) {
      setManageError((cause as Error).message);
    } finally {
      setDeciding('');
    }
  }

  async function changeApproval(room: Workshop, enabled: boolean) {
    setManaging(true);
    setManageError('');
    try {
      await api(`/workshops/${room._id}/join-settings`, {
        method: 'PATCH',
        body: JSON.stringify({ approvalRequired: enabled }),
      });
      setManageRoom({ ...room, approvalRequired: enabled });
      toast.success('Join settings updated');
      await load();
    } catch (cause) {
      setManageError((cause as Error).message);
    } finally {
      setManaging(false);
    }
  }

  const activeOwned = rooms.owned.filter(room => room.status === 'active');
  const activeJoined = rooms.joined.filter(room => room.status === 'active');
  const archived = [...rooms.owned, ...rooms.joined].filter(room => room.status === 'archived');
  const filtered = useMemo(() => discover.filter(room => `${room.title} ${room.description} ${room.mentor?.name || ''}`.toLowerCase().includes(query.toLowerCase())), [discover, query]);

  function requireAccount(action: 'create' | 'join') {
    router.push(`/auth?mode=register&next=${action}${action === 'join' && pin ? `&pin=${pin}` : ''}`);
  }

  function exploreAction(room: Workshop) {
    if (user && loading) return <span className="explore-action-status">Checking access…</span>;
    const owned = user && activeOwned.find(item => item._id === room._id);
    if (owned?.pin) return <Link className="row-open" href={`/session/host/${owned.pin}?id=${owned._id}`}>Open room <Icon name="arrow" size={16}/></Link>;
    const joined = user && activeJoined.find(item => item._id === room._id);
    if (joined) return <Link className="row-open" href={`/session/live/room?id=${joined._id}`}>Open room <Icon name="arrow" size={16}/></Link>;
    if (user && rooms.pending.some(item => item._id === room._id)) return <span className="room-pending explore-action-status">Waiting for approval</span>;
    return <button onClick={()=>{document.querySelector<HTMLInputElement>('.join-action input')?.focus();document.getElementById('overview')?.scrollIntoView({behavior:'smooth'})}}>Join with PIN <Icon name="arrow" size={16}/></button>;
  }

  return <><Header/><main className="new-home" id="overview">
    <section className="dashboard-welcome" aria-labelledby="welcome-title">
      <div><span className="eyebrow"><span className="dot"/> YOUR WORKSHOP SPACE</span><h1 id="welcome-title">{user ? <>Welcome back, <em>{user.name.split(' ')[0]}.</em></> : <>A good place to <em>learn together.</em></>}</h1><p>Join a live workshop, share your own work, and keep every room in one place.</p></div>
      <a href="#explore" className="welcome-browse">Browse live workshops <Icon name="arrow" size={17}/></a>
    </section>
    <section className="action-grid" aria-label="Get started">
      <article className="action-card join-action"><div className="action-card-top"><span className="action-icon"><Icon name="users" size={22}/></span><span className="action-index">01 / JOIN</span></div><div><h2>Join a room</h2><p>Enter the four-digit PIN shared by your host.</p></div><form onSubmit={user ? join : event=>{event.preventDefault();requireAccount('join')}}><input required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} aria-label="Four digit room PIN" placeholder="0000" value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,'').slice(0,4))}/><button className="button primary" disabled={joining||authLoading}>{joining?'Checking…':'Join room'} <Icon name="arrow" size={16}/></button></form><small>{user ? 'The host may need to approve your request.' : 'You can browse first. Sign up when you join.'}</small></article>
      <article className="action-card host-action"><div className="action-card-top"><span className="action-icon"><Icon name="plus" size={22}/></span><span className="action-index">02 / HOST</span></div><div><h2>Host a workshop</h2><p>Create a room for your group, share the PIN, and teach live.</p></div><button className="button outline" disabled={authLoading} onClick={()=>user?(setCreatedRoom(null),setManageError(''),setCreateOpen(true)):requireAccount('create')}>Create a room <Icon name="arrow" size={16}/></button><small>Keep code, questions, and notes together.</small></article>
    </section>
    {error&&<Notice>{error}</Notice>}{success&&<div className="success-notice" role="status"><Icon name="check" size={18}/>{success}</div>}
      {!authLoading && user && <section className="workspace-section" id="my-rooms"><div className="workspace-section-head"><div><span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>My rooms</h2></div><span className="section-total">{activeOwned.length + activeJoined.length} active</span></div>{loading ? <DashboardSkeleton/> : <><div className="room-filter" role="tablist" aria-label="My rooms"><button role="tab" aria-selected={roomView==='hosting'} className={roomView==='hosting'?'active':''} onClick={()=>setRoomView('hosting')}>Hosting <span>{activeOwned.length}</span></button><button role="tab" aria-selected={roomView==='joined'} className={roomView==='joined'?'active':''} onClick={()=>setRoomView('joined')}>Joined <span>{activeJoined.length}</span></button><button role="tab" aria-selected={roomView==='pending'} className={roomView==='pending'?'active':''} onClick={()=>setRoomView('pending')}>Pending <span>{rooms.pending.length}</span></button><button role="tab" aria-selected={roomView==='archive'} className={roomView==='archive'?'active':''} onClick={()=>setRoomView('archive')}>Archive <span>{archived.length}</span></button></div><div className="room-list" role="tabpanel">{roomView==='hosting' ? (activeOwned.length ? activeOwned.map(room=><article className="room-row" key={room._id}><span className="room-row-icon"><Icon name="code" size={20}/></span><div className="room-row-info"><span className="room-row-kicker">HOSTING · PIN {room.pin}</span><h3>{room.title}</h3><p>{room.description}</p></div><div className="room-row-actions"><span>{room.roster?.length || 0} participants</span><button onClick={()=>openManage(room)}>Manage {requestCounts[room._id]>0 && <b>{requestCounts[room._id]}</b>}</button><Link href={`/session/host/${room.pin}?id=${room._id}`} className="row-open">Open room <Icon name="arrow" size={16}/></Link></div></article>) : <Empty title="No rooms hosted yet" description="Create a room to share live code and invite people with a PIN." action={<button className="button primary" onClick={()=>setCreateOpen(true)}>Create a room</button>}/>) : roomView==='joined' ? (activeJoined.length ? activeJoined.map(room=><article className="room-row" key={room._id}><span className="room-row-icon"><Icon name="users" size={20}/></span><div className="room-row-info"><span className="room-row-kicker">JOINED · {room.mentor?.name || 'Host'}</span><h3>{room.title}</h3><p>{room.description}</p></div><div className="room-row-actions"><Link href={`/session/live/room?id=${room._id}`} className="row-open">Enter room <Icon name="arrow" size={16}/></Link></div></article>) : <Empty title="No rooms joined yet" description="Use a PIN above to join a live workshop."/>) : roomView==='pending' ? (rooms.pending.length ? rooms.pending.map(room=><article className="room-row" key={room._id}><span className="room-row-icon"><Icon name="users" size={20}/></span><div className="room-row-info"><span className="room-row-kicker">AWAITING APPROVAL</span><h3>{room.title}</h3><p>{room.description}</p></div><span className="room-pending">Waiting for host</span></article>) : <Empty title="No pending requests" description="Rooms waiting for host approval will appear here."/>) : (archived.length ? archived.map(room=><article className="room-row" key={room._id}><span className="room-row-icon"><Icon name="code" size={20}/></span><div className="room-row-info"><span className="room-row-kicker">ARCHIVED · {date(room.createdAt)}</span><h3>{room.title}</h3><p>{room.description}</p></div><div className="room-row-actions"><Link href={`/dashboard/archive/${room._id}`} className="row-open">View notes <Icon name="arrow" size={16}/></Link></div></article>) : <Empty title="No archived rooms" description="Finished workshops and their saved code will appear here."/>)}</div></>}</section>}
      <section className="workspace-section explore-panel" id="explore"><div className="explore-toolbar"><div className="workspace-section-head"><div><span className="eyebrow">FIND SOMETHING NEW</span><h2>Explore live workshops</h2><p>Discover a room to join, or reopen one you already belong to.</p></div></div><label className="directory-search"><Icon name="search" size={19}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search by topic or host" aria-label="Search workshops"/>{query && <button onClick={()=>setQuery('')} aria-label="Clear search">×</button>}</label></div>{discoverLoading ? <DashboardSkeleton/> : discoverError ? <Notice>{discoverError}</Notice> : filtered.length ? <div className="explore-list">{filtered.map(room=><div className="explore-item" key={room._id}><article className="explore-row"><span className="explore-avatar">{room.title.charAt(0).toUpperCase()}</span><div><span className="room-row-kicker"><span className="dot"/> LIVE WORKSHOP · {room.mentor?.name || 'Host'}</span><h3>{room.title}</h3><p>{room.description}</p></div>{exploreAction(room)}</article></div>)}</div> : <Empty title={query ? 'No matching workshops' : 'No live workshops yet'} description={query ? 'Try a different topic or host name.' : 'Workshops will appear here when hosts start a room.'} action={query ? <button className="button outline" onClick={()=>setQuery('')}>Clear search</button> : undefined}/>}</section>
      <footer className="workspace-footer"><span>Workshop Space</span><span>Learn together, one room at a time.</span></footer>
  </main>

  {createOpen && <Modal title={createdRoom ? 'Your room is ready' : 'Create a room'} close={() => setCreateOpen(false)}>
    {createdRoom ? <div className="modal-body room-created"><span className="created-icon"><Icon name="check" size={26}/></span><p>Share this PIN with the people you want to invite.</p><div className="created-pin">{createdRoom.pin}</div><div className="created-actions"><button className="button outline" onClick={() => navigator.clipboard.writeText(createdRoom.pin).then(() => toast.success('PIN copied'))}>Copy PIN</button><Link className="button primary" href={`/session/host/${createdRoom.pin}?id=${createdRoom._id}`}>Open room <Icon name="arrow"/></Link></div></div> : <form className="modal-body" onSubmit={create}>
      <p>Anyone with an account can create a room. You&apos;ll control the code feed and admission settings.</p>
      <label className="field">Room title<input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Build a React app"/></label>
      <label className="field">Description<textarea required maxLength={2000} rows={4} value={description} onChange={event => setDescription(event.target.value)} placeholder="What will everyone learn?"/></label>
      <label className="approval-option"><input type="checkbox" checked={approvalRequired} onChange={event => setApprovalRequired(event.target.checked)}/><span><strong>Approve people before they join</strong><small>PIN holders send a request. You choose who enters.</small></span></label>
      {manageError && <Notice>{manageError}</Notice>}
      <button className="button primary full" disabled={creating}>{creating ? 'Creating...' : 'Create room & generate PIN'} <Icon name="arrow"/></button>
    </form>}
  </Modal>}

  {manageRoom && <Modal title={`Manage access · ${manageRoom.title}`} close={() => setManageRoom(null)}>
    <div className="modal-body">
      <label className="approval-option"><input type="checkbox" checked={Boolean(manageRoom.approvalRequired)} disabled={managing} onChange={event => changeApproval(manageRoom, event.target.checked)}/><span><strong>Approve people before they join</strong><small>{manageRoom.approvalRequired ? 'New PIN holders wait for your decision.' : 'Anyone with the PIN joins immediately.'}</small></span></label>
      <div className="requests-heading"><div><div className="eyebrow">ADMISSION QUEUE</div><h3>Join requests</h3></div><span>{requests.length}</span></div>
      {managing ? <Loading/> : requests.length ? <div className="request-list">{requests.map(request => request.user && <div className="request-row" key={personId(request.user)}><span className="request-avatar">{personName(request.user).charAt(0)}</span><span className="request-person"><strong>{personName(request.user)}</strong><small>{request.user?.email}</small></span><div className="request-actions"><button disabled={Boolean(deciding)} onClick={() => decide(manageRoom, personId(request.user), 'reject')}>Reject</button><button disabled={Boolean(deciding)} className="approve" onClick={() => decide(manageRoom, personId(request.user), 'approve')}>Approve</button></div></div>)}</div> : <div className="requests-empty">No one is waiting to join this room.</div>}
      {manageError && <Notice>{manageError}</Notice>}
      <p className="settings-hint">Resolve all pending requests before switching to open join.</p>
    </div>
  </Modal>}
  </>;
}
function DashboardSkeleton(){return <div className="skeleton-grid" aria-label="Loading workshops">{[1,2,3].map(item => <div className="skeleton-card" key={item}><span/><span/><span/></div>)}</div>}
