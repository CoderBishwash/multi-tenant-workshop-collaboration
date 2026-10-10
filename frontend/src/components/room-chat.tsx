'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api, ChatMessage, downloadChatFile, uploadChatFile } from '@/lib/api';
import toast from 'react-hot-toast';
import {ContentSkeleton} from '@/components/ui';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPT = '.png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.zip,.docx,.xlsx,.pptx';

export function RoomChat({ roomId, userId, active }: { roomId: string; userId: string; active: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const cursor = useRef('');
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const fetching = useRef(false);

  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const suffix = cursor.current ? `?after=${cursor.current}` : '';
      const result = await api<{ messages: ChatMessage[] }>(`/workshops/${roomId}/chat${suffix}`);
      if (result.messages.length) {
        cursor.current = result.messages[result.messages.length - 1]._id;
        setMessages(current => {
          const seen = new Set(current.map(item => item._id));
          return [...current, ...result.messages.filter(item => !seen.has(item._id))];
        });
      }
      setError('');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
      fetching.current = false;
    }
  }, [roomId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      const result = await api<{ message: ChatMessage }>(`/workshops/${roomId}/chat`, {
        method: 'POST', body: JSON.stringify({ text: draft.trim() }),
      });
      setDraft('');
      setMessages(current => current.some(item => item._id === result.message._id) ? current : [...current, result.message]);
      setError('');
    } catch (cause) {
      setError((cause as Error).message);
    } finally { setBusy(false); }
  }

  async function attach(file?: File) {
    if (!file || busy) return;
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      setError('Choose a file up to 10 MB.');
      return;
    }
    setBusy(true);
    try {
      const result = await uploadChatFile(roomId, file);
      setMessages(current => current.some(item => item._id === result.message._id) ? current : [...current, result.message]);
      setError('');
      toast.success('File shared');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function download(file: NonNullable<ChatMessage['attachment']>) {
    try { await downloadChatFile(roomId, file); }
    catch (cause) { setError((cause as Error).message); }
  }

  return <section className="room-chat" aria-label="Room chat">
    <div className="room-chat-heading"><div><div className="eyebrow">ROOM CONVERSATION</div><h1>Chat &amp; files<span className="accent">.</span></h1><p>Share questions, links, and resources with everyone in the room.</p></div><span className="chat-count">{messages.length} messages</span></div>
    <div className="chat-messages" role="log" aria-live="polite">
      {loading ? <ContentSkeleton/> : messages.length === 0 ? <div className="chat-empty"><strong>Start the conversation</strong><span>Messages and shared files will appear here.</span></div> : messages.map(item => <article className={`chat-message ${item.sender?._id === userId ? 'mine' : ''}`} key={item._id}>
        <span className="chat-avatar">{item.sender?.name?.charAt(0).toUpperCase() || '?'}</span>
        <div className="chat-message-main"><div className="chat-message-meta"><strong>{item.sender?._id === userId ? 'You' : item.sender?.name || 'Participant'}</strong><time>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>{item.text && <p>{item.text}</p>}{item.attachment?.fileId && <button className="chat-file" onClick={() => void download(item.attachment!)}><span>↓</span><span><strong>{item.attachment.name}</strong><small>{(item.attachment.size / 1024).toFixed(0)} KB · Download</small></span></button>}</div>
      </article>)}
      <div ref={bottom}/>
    </div>
    {error && <div className="chat-error" role="alert">{error}</div>}
    {active ? <form className="chat-compose" onSubmit={send}><input ref={fileInput} hidden type="file" accept={ACCEPT} onChange={event => void attach(event.target.files?.[0])}/><button type="button" className="chat-attach" title="Attach a file (up to 10 MB)" aria-label="Attach a file" disabled={busy} onClick={() => fileInput.current?.click()}>＋</button><input aria-label="Message" maxLength={5000} placeholder="Write a message to the room…" value={draft} onChange={event => setDraft(event.target.value)}/><button className="chat-send" disabled={busy || !draft.trim()}>{busy ? 'Sending…' : 'Send →'}</button></form> : <div className="chat-ended">This room has ended. You can still read the conversation and download files.</div>}
  </section>;
}
