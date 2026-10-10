'use client';

import {useCallback, useEffect, useState} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import toast from 'react-hot-toast';
import {api, date, Workshop} from '@/lib/api';
import {Brand, ContentSkeleton, Icon, Notice, useAuth} from '@/components/ui';

export default function Archive() {
  const {id} = useParams<{id:string}>();
  const {user,loading} = useAuth();
  const [workshop,setWorkshop] = useState<Workshop|null>(null);
  const [list,setList] = useState<Workshop[]>([]);
  const [error,setError] = useState('');
  const load = useCallback(() => {api<{workshop:Workshop}>(`/workshops/${id}`).then(data=>setWorkshop(data.workshop)).catch(cause=>setError((cause as Error).message))},[id]);
  useEffect(() => {if(!user)return;load();api<{workshops:Workshop[]}>('/workshops/archive/me').then(data=>setList(data.workshops)).catch(()=>{})},[user,load]);
  function download() {
    if(!workshop)return;
    const lines=[`# ${workshop.title}`,'',workshop.description,'',...(workshop.snippets||[]).flatMap((snippet,index)=>[`## ${snippet.title||`Snippet ${index+1}`}`,'','```'+snippet.language,snippet.code,'```',''])];
    const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/markdown'}));
    const link=document.createElement('a');link.href=url;link.download=`${workshop.title.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-archive.md`;link.click();URL.revokeObjectURL(url);toast.success('Archive downloaded');
  }
  return <div className="archive-redesign"><header className="archive-header"><Brand/><Link href="/" className="back">← Workspace</Link></header><div className="archive-layout"><main className="archive-content"><nav className="archive-quick-nav" aria-label="Past workshops"><span>Past workshops</span>{list.map(item=><Link className={item._id===id?'selected':''} href={`/dashboard/archive/${item._id}`} key={item._id}>{item.title}</Link>)}</nav>{loading||(!workshop&&!error)?<ContentSkeleton/>:workshop?<><div className="archive-intro"><div><span className="eyebrow">WORKSHOP ARCHIVE · {date(workshop.createdAt)}</span><h1>{workshop.title}</h1><p>{workshop.description}</p></div><button className="button outline" onClick={download}><Icon name="download" size={17}/> Download notes</button></div><div className="archive-count"><Icon name="code" size={18}/><span>{workshop.snippets?.length||0} saved snippets</span></div><div className="archive-steps">{workshop.snippets?.length?workshop.snippets.map((snippet,index)=><article className="archive-step" key={snippet._id}><div className="archive-step-number">{String(index+1).padStart(2,'0')}</div><div className="archive-step-content"><div className="archive-step-top"><span>{snippet.language.toUpperCase()}</span><time>{new Date(snippet.createdAt).toLocaleString()}</time></div><h2>{snippet.title||`Code snippet ${index+1}`}</h2><div className="code-window"><div className="code-window-top"><span className="window-dots"><i/><i/><i/></span><span>{snippet.language}</span></div><pre><code>{snippet.code}</code></pre></div></div></article>):<div className="empty"><h3>No saved code yet</h3><p>This workshop has no snippets in its archive.</p></div>}</div></>:<Notice>{error}</Notice>}</main></div></div>;
}
