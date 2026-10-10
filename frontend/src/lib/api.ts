export type User = {
  _id: string;
  name: string;
  email: string;
  role: 'student' | 'mentor'; // Legacy account label; room permissions use ownership.
};

export type Person = Pick<User, '_id' | 'name' | 'email'>;
export type Snippet = {
  _id: string;
  title?: string;
  code: string;
  language: string;
  createdAt: string;
};
export type WorkshopError = {
  _id: string;
  student: Person | string | null;
  errorMessage: string;
  codeBlock?: string;
  resolved: boolean;
  createdAt: string;
};
export type JoinRequest = { user: Person | null; createdAt: string };
export type Workshop = {
  _id: string;
  title: string;
  description: string;
  mentor?: Pick<User, '_id' | 'name'>;
  status: 'active' | 'archived';
  approvalRequired?: boolean;
  pin?: string;
  roster?: Array<Person | string>;
  joinRequests?: JoinRequest[];
  snippets?: Snippet[];
  errors?: WorkshopError[];
  createdAt: string;
  updatedAt?: string;
};
export type MyWorkshops = {
  owned: Workshop[];
  joined: Workshop[];
  pending: Workshop[];
};
export type JoinResult = {
  workshopId: string;
  status: 'joined' | 'pending';
  message?: string;
};
export type ChatMessage = {
  _id: string;
  sender: Pick<User, '_id' | 'name'>;
  text: string;
  attachment?: { fileId: string; name: string; size: number };
  createdAt: string;
};

const origin = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');

export async function uploadChatFile(roomId: string, file: File): Promise<{ message: ChatMessage }> {
  let res: Response;
  try {
    res = await fetch(`${origin}/api/v1/workshops/${roomId}/chat/files`, {
      method: 'POST', credentials: 'include', body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
    });
  } catch {
    throw new Error('Could not reach the backend. Try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Upload failed (${res.status})`);
  return data;
}

export async function downloadChatFile(roomId: string, file: NonNullable<ChatMessage['attachment']>) {
  const res = await fetch(`${origin}/api/v1/workshops/${roomId}/chat/files/${file.fileId}`, {
    credentials: 'include', cache: 'no-store',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Download failed (${res.status})`);
  }
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${origin}/api/v1${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init.headers },
      cache: 'no-store',
    });
  } catch {
    throw new Error('Could not reach the backend. Start the API server and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data as T;
}

export const date = (value?: string) => value
  ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
  : '—';
export const destination = () => '/dashboard';
export const personName = (person: Person | string | null | undefined) =>
  person && typeof person !== 'string' ? person.name : 'Participant';
export const personId = (person: Person | string | null | undefined) =>
  person && typeof person !== 'string' ? person._id : person || '';
