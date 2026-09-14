(() => {
'use strict';
// ================= helpers =================
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TZ = 'Asia/Seoul';
const T = v => typeof v==='number'?v:new Date(v).getTime();
const fmtDate = ts => new Date(T(ts)).toLocaleDateString('ko-KR', {timeZone:TZ, year:'numeric', month:'2-digit', day:'2-digit'}).replace(/\. /g,'.').replace(/\.$/,'');
const fmtTime = ts => new Date(T(ts)).toLocaleTimeString('ko-KR', {timeZone:TZ, hour:'2-digit', minute:'2-digit', hour12:false});
const fmtDT = ts => fmtDate(ts) + ' ' + fmtTime(ts);
const dayKey = ts => { const p = new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(T(ts))); const g=t=>p.find(x=>x.type===t).value; return `${g('year')}-${g('month')}-${g('day')}`; };
const todayKey = () => dayKey(Date.now());
const rel = ts => { const d = Date.now()-T(ts); if (d<60e3) return '방금'; if (d<3600e3) return Math.floor(d/60e3)+'분 전'; if (d<86400e3) return Math.floor(d/3600e3)+'시간 전'; if (d<7*86400e3) return Math.floor(d/86400e3)+'일 전'; return fmtDate(ts); };
const fmtBytes = b => b<1024?b+' B':b<1048576?(b/1024).toFixed(0)+' KB':(b/1048576).toFixed(1)+' MB';
const dayLabel = k => { const [y,m,d]=k.split('-').map(Number); const dt=new Date(y,m-1,d); const dow='일월화수목금토'[dt.getDay()]; return `${y}년 ${m}월 ${d}일 (${dow})`; };
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('show'),2400); }
const ls = { get(k,d){ try{ const v=localStorage.getItem(k); return v==null?d:JSON.parse(v);}catch{return d;} }, set(k,v){ try{localStorage.setItem(k,JSON.stringify(v));}catch{} } };
const COLORS = ['#3B6B4F','#5B4E8C','#A8552E','#2F6F8F','#8C3F5A','#6E7A2C','#B07C1F','#3F3F3F'];
const STATUSES = [ {k:'draft',l:'초안',c:'var(--s-draft)'},{k:'review',l:'검토 중',c:'var(--s-review)'},{k:'revise',l:'수정 필요',c:'var(--s-revise)'},{k:'done',l:'완료',c:'var(--s-done)'} ];
const CATS = ['공지','원고 논의','분석·결과','참고자료','일반'];
const EV_TYPES = { meeting:{l:'미팅',c:'var(--accent)'}, deadline:{l:'마감',c:'var(--s-revise)'}, memo:{l:'메모',c:'var(--s-draft)'} };
const COMMENT_KINDS = { say:'의견', q:'질문', fix:'수정 요청', ok:'확인' };
const EMAIL_DOMAIN = 'member.coauthor.local';

// ================= config / client =================
const CFG = window.APP_CONFIG || {};
document.title = CFG.SITE_NAME || '공동집필실';
$('#auth-title').textContent = CFG.SITE_NAME || '공동집필실';
$('.brand h1').textContent = CFG.SITE_NAME || '공동집필실';
$('#brand-sub').textContent = CFG.SITE_SUB || '연구 협업 공간';
let sb = null;
let bootErr=''; try { if(!window.supabase) throw new Error('접속 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로 고침하세요.'); if(!/^https:\/\/.+\.supabase\.co/.test(CFG.SUPABASE_URL||'')||!CFG.SUPABASE_ANON_KEY||/여기에/.test(CFG.SUPABASE_ANON_KEY)) throw new Error('config.js 에 Supabase 주소와 anon 키를 먼저 넣어주세요.'); sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY); } catch(e){ console.error(e); bootErr=e.message; }

// ================= state =================
let me = null; // {id, name, color, username}
const profiles = {}; // id -> {name,color,username,last_seen}
const state = { chat:[], chatLimit:300, posts:[], comments:[], openPost:null, tasks:[], files:[], refs:[], events:[], cat:'전체', calMonth:null, calSel:null, quote:null, replyTo:null };
const seen = ls.get('coauthor.seen', {chat:0, board:0});
let currentView = 'home';
const pname = id => profiles[id]?.name || '(탈퇴)';
const pcolor = id => profiles[id]?.color || '#6B7A86';
function avatar(name, color, extra=''){ return `<div class="avatar ${extra}" style="background:${color||'#6B7A86'}" title="${esc(name)}">${esc((name||'?').trim().slice(0,1))}</div>`; }
const av = id => avatar(pname(id), pcolor(id));
function linkify(text){ return esc(text).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/#(\d{1,5})\b/g,(m,n)=>`<a href="#" data-post-num="${n}">#${n}</a>`); }
function errMsg(e){ return e?.message || e?.error_description || String(e); }

// ================= AUTH =================
let authMode='login';
function setAuthMode(m){ authMode=m; $('#tab-login').classList.toggle('active',m==='login'); $('#tab-signup').classList.toggle('active',m==='signup'); $('#au-name-wrap').hidden=m!=='signup'; $('#au-code-wrap').hidden=m!=='signup'; $('#auth-go').textContent=m==='login'?'로그인':'가입하고 입장'; $('#au-pw').autocomplete=m==='login'?'current-password':'new-password'; $('#auth-err').hidden=true; }
$('#tab-login').onclick=()=>setAuthMode('login'); $('#tab-signup').onclick=()=>setAuthMode('signup');
$('#auth-form').onsubmit=async e=>{
e.preventDefault(); const err=$('#auth-err'); err.hidden=true; const btn=$('#auth-go'); btn.disabled=true;
const raw=$('#au-id').value.trim().toLowerCase(), password=$('#au-pw').value; const username=raw.includes('@')?raw.split('@')[0]:raw; const email=raw.includes('@')?raw:`${raw}@${EMAIL_DOMAIN}`;
try{
if(!sb) throw new Error(bootErr);
if(authMode==='signup'){
const display_name=$('#au-name').value.trim(); const code=$('#au-code').value.trim();
if(!display_name) throw new Error('표시 이름을 입력해 주세요.');
const {data:ok, error:ce}=await sb.rpc('check_invite_code',{code}); if(ce) throw ce; if(!ok) throw new Error('가입 코드가 맞지 않습니다.');
const color=COLORS[Math.floor(Math.random()*COLORS.length)];
const {data, error}=await sb.auth.signUp({email, password, options:{data:{username, display_name, color}}});
if(error) throw error;
if(!data.session) throw new Error('가입은 되었지만 자동 로그인이 안 됐습니다. Supabase 설정에서 "Confirm email"을 끄고 다시 로그인해 보세요.');
} else {
const {error}=await sb.auth.signInWithPassword({email, password});
if(error) throw new Error(/invalid/i.test(error.message)?'아이디 또는 비밀번호가 맞지 않습니다.':error.message);
}
}catch(ex){ err.textContent=errMsg(ex); err.hidden=false; }
btn.disabled=false;
};
$('#me-logout').onclick=async()=>{ await sb.auth.signOut(); location.reload(); };
$('#me-change').onclick=()=>openProfileModal();
function openProfileModal(){
modal(`<h3>프로필</h3><p class="lead">표시 이름과 색을 바꿉니다. 아이디(${esc(me.username)})는 바꿀 수 없습니다.</p>
<form id="prof-form"><div class="field"><label>표시 이름</label><input class="input" id="pf-name" value="${esc(me.name)}" maxlength="20" required></div>
<div class="field"><label>내 색</label><div class="swatches" id="swatches">${COLORS.map(c=>`<button type="button" data-c="${c}" class="${c===me.color?'sel':''}" style="background:${c}"></button>`).join('')}</div></div>
<div class="field"><label>새 비밀번호 (바꿀 때만 입력)</label><input class="input" type="password" id="pf-pw" minlength="6" autocomplete="new-password"></div>
<div class="actions"><button type="button" class="btn ghost" id="pf-cancel">취소</button><button type="submit" class="btn primary">저장</button></div></form>`, close=>{
let color=me.color; $$('#swatches button').forEach(b=>b.onclick=()=>{ $$('#swatches button').forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); color=b.dataset.c; });
$('#pf-cancel').onclick=close;
$('#prof-form').onsubmit=async e=>{ e.preventDefault(); const name=$('#pf-name').value.trim(); const pw=$('#pf-pw').value;
const {error}=await sb.from('profiles').update({display_name:name,color}).eq('id',me.id); if(error) return toast(errMsg(error));
if(pw){ const {error:pe}=await sb.auth.updateUser({password:pw}); if(pe) return toast(errMsg(pe)); }
me.name=name; me.color=color; profiles[me.id]={...profiles[me.id],name,color}; renderMe(); renderAll(); toast('저장했습니다'); close(); };
});
}
function renderMe(){ $('#me-name').textContent=me.name; const a=$('#me-avatar'); a.textContent=me.name.slice(0,1); a.style.background=me.color; $('#home-greet').textContent=`${me.name}님, 안녕하세요`; }
async function heartbeat(){ if(!me) return; sb.from('profiles').update({last_seen:new Date().toISOString()}).eq('id',me.id).then(()=>{}); }

// ================= nav =================
function go(view){
currentView=view;
$$('.view').forEach(v=>v.classList.toggle('active', v.id==='view-'+view));
$$('#nav button').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
if(view==='chat'){ markSeen('chat'); requestAnimationFrame(scrollChat); setTimeout(()=>$('#chat-input').focus(),50); }
if(view==='board'){ markSeen('board'); }
ls.set('coauthor.view', view);
}
$('#nav').addEventListener('click', e=>{ const b=e.target.closest('button'); if(b) go(b.dataset.view); });
document.addEventListener('click', e=>{ const g=e.target.closest('[data-go]'); if(g){ if(g.tagName==='A') e.preventDefault(); go(g.dataset.go); if(g.dataset.go==='board'&&g.classList.contains('primary')) openPostForm(); } const pn=e.target.closest('[data-post-num]'); if(pn){ e.preventDefault(); const p=state.posts.find(x=>x.num==pn.dataset.postNum); if(p){ go('board'); openPost(p.id);} else toast('해당 번호의 글을 찾지 못했습니다'); } });
function markSeen(k){ seen[k]=Date.now(); ls.set('coauthor.seen',seen); updateBadges(); }
function updateBadges(){
const c = state.chat.filter(m=>T(m.created_at)>seen.chat && m.author!==me?.id).length;
const b = state.posts.filter(p=>T(p.created_at)>seen.board && p.author!==me?.id).length + state.posts.filter(p=>p.last_comment_at&&T(p.last_comment_at)>seen.board&&p.last_comment_by!==me?.id).length;
const bc=$('#badge-chat'), bb=$('#badge-board');
bc.hidden = !c || currentView==='chat'; bc.textContent=c>99?'99+':c;
bb.hidden = !b || currentView==='board'; bb.textContent=b>99?'99+':b;
}

// ================= modal =================
function modal(html, onMount){
const root=$('#modal-root'); root.innerHTML=`<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
root.firstElementChild.addEventListener('click',e=>{ if(e.target===root.firstElementChild) close(); });
const close=()=>{ root.innerHTML=''; document.removeEventListener('keydown',onKey); };
const onKey=e=>{ if(e.key==='Escape') close(); }; document.addEventListener('keydown',onKey);
onMount(close);
}
function confirmModal(title, lead, onOk){ modal(`<h3>${esc(title)}</h3><p class="lead">${esc(lead)}</p><div class="actions"><button class="btn ghost" id="cm-no">취소</button><button class="btn primary" id="cm-ok">삭제</button></div>`, close=>{ $('#cm-no').onclick=close; $('#cm-ok').onclick=async()=>{ await onOk(); close(); }; }); }
async function run(promise, okMsg){ const {error, data}=await promise; if(error){ console.error(error); toast('저장하지 못했습니다: '+errMsg(error)); return null; } if(okMsg) toast(okMsg); return data ?? true; }

// ================= data loading =================
async function loadProfiles(){ const {data}=await sb.from('profiles').select('*'); for(const k in profiles) delete profiles[k]; (data||[]).forEach(p=>profiles[p.id]={name:p.display_name,color:p.color,username:p.username,last_seen:p.last_seen,approved:p.approved,role:p.role}); renderOnline(); renderAdmin(); }
async function loadChat(){ const {data}=await sb.from('messages').select('*').order('id',{ascending:false}).limit(state.chatLimit); state.chat=(data||[]).reverse(); renderChat(); renderHome(); updateBadges(); }
async function loadPosts(){ const {data}=await sb.from('posts').select('*, comments(count)').order('created_at',{ascending:false}).limit(500); state.posts=(data||[]).map(p=>({...p, commentCount:p.comments?.[0]?.count||0})); const {data:lc}=await sb.from('comments').select('post_id,author,created_at').order('created_at',{ascending:false}).limit(200); (lc||[]).forEach(c=>{ const p=state.posts.find(x=>x.id===c.post_id); if(p&&!p.last_comment_at){ p.last_comment_at=c.created_at; p.last_comment_by=c.author; } }); renderBoard(); renderHome(); updateBadges(); if(state.openPost){ const p=state.posts.find(x=>x.id===state.openPost); if(p) renderPostDetail(p); else closePost(); } }
async function loadComments(){ if(!state.openPost) return; const {data}=await sb.from('comments').select('*').eq('post_id',state.openPost).order('created_at'); state.comments=data||[]; const p=state.posts.find(x=>x.id===state.openPost); if(p){ p.commentCount=state.comments.length; renderPostDetail(p); } }
async function loadTasks(){ const {data}=await sb.from('tasks').select('*').order('sort').order('created_at'); state.tasks=data||[]; renderKanban(); renderHome(); }
async function loadFiles(){ const {data}=await sb.from('files').select('*').order('created_at',{ascending:false}); state.files=data||[]; renderFiles(); renderHome(); }
async function loadRefs(){ const {data}=await sb.from('refs').select('*').order('created_at',{ascending:false}); state.refs=data||[]; renderRefs(); }
async function loadEvents(){ const {data}=await sb.from('events').select('*').order('date').order('time'); state.events=data||[]; renderCal(); renderHome(); }
function subscribeRealtime(){
const map={messages:loadChat, posts:loadPosts, comments:()=>{loadComments(); loadPosts();}, tasks:loadTasks, files:loadFiles, refs:loadRefs, events:loadEvents, profiles:()=>{loadProfiles(); renderAll();}};
const ch=sb.channel('coauthor');
Object.entries(map).forEach(([table,fn])=>ch.on('postgres_changes',{event:'*',schema:'public',table},()=>fn()));
ch.subscribe(status=>{ if(status==='SUBSCRIBED') setConn('ok','연결됨 · 실시간 동기화'); else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT') setConn('bad','실시간 연결 끊김 — 새로 고침하세요'); });
}

// ================= CHAT =================
$('#chat-older').onclick=()=>{ state.chatLimit+=500; loadChat(); toast('이전 메시지를 더 불러옵니다'); };
function renderChat(){
const box=$('#chat-scroll'); const atBottom = box.scrollHeight-box.scrollTop-box.clientHeight<80;
if(!state.chat.length){ box.innerHTML=`<div class="empty" style="margin:auto">아직 메시지가 없습니다. 첫 인사를 건네보세요.</div>`; return; }
let html='', lastDay=null, lastAuthor=null, lastTs=0;
for(const m of state.chat){
const day=dayKey(m.created_at), ts=T(m.created_at);
if(day!==lastDay){ html+=`<div class="day-sep">${dayLabel(day)}</div>`; lastDay=day; lastAuthor=null; }
const mine = m.author===me?.id; const cont = m.author===lastAuthor && ts-lastTs<5*60e3;
html+=`<div class="msg ${mine?'mine':''} ${cont?'cont':''}" data-mid="${m.id}">${av(m.author)}<div class="body"><div class="who">${esc(pname(m.author))}</div><div class="bubble-row"><div class="bubble">${linkify(m.text)}</div><span class="tm">${fmtTime(ts)}</span></div></div></div>`;
lastAuthor=m.author; lastTs=ts;
}
box.innerHTML=html; if(atBottom||currentView!=='chat') scrollChat();
if(currentView==='chat') markSeen('chat');
}
function scrollChat(){ const box=$('#chat-scroll'); box.scrollTop=box.scrollHeight; }
async function sendChat(){
const ta=$('#chat-input'); const text=ta.value.trim(); if(!text) return;
ta.value=''; ta.style.height='auto';
const {error}=await sb.from('messages').insert({author:me.id, text});
if(error){ ta.value=text; toast('전송하지 못했습니다: '+errMsg(error)); }
}
$('#chat-send').onclick=sendChat;
$('#chat-input').addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){ e.preventDefault(); sendChat(); } });
$('#chat-input').addEventListener('input',e=>{ const t=e.target; t.style.height='auto'; t.style.height=Math.min(160,t.scrollHeight)+'px'; });
$('#chat-scroll').addEventListener('contextmenu',e=>{ const m=e.target.closest('.msg.mine'); if(!m) return; e.preventDefault(); confirmModal('이 메시지를 삭제할까요?','',()=>run(sb.from('messages').delete().eq('id',m.dataset.mid),'삭제했습니다')); });

// ================= BOARD =================
function renderCatTabs(){ $('#cat-tabs').innerHTML=['전체',...CATS].map(c=>`<button class="${state.cat===c?'active':''}" data-cat="${c}">${c}</button>`).join(''); }
$('#cat-tabs').onclick=e=>{ const b=e.target.closest('button'); if(b){ state.cat=b.dataset.cat; renderBoard(); } };
$('#post-search').oninput=renderBoard;
function renderBoard(){
renderCatTabs();
const q=$('#post-search').value.trim().toLowerCase();
let list=state.posts.filter(p=>(state.cat==='전체'||p.cat===state.cat)&&(!q||(p.title+' '+p.body).toLowerCase().includes(q)));
list.sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||T(b.created_at)-T(a.created_at));
$('#post-empty').hidden=!!list.length;
$('#post-rows').innerHTML=list.map(p=>`<tr class="clickable" data-id="${p.id}"><td class="num">${p.num??''}</td><td><div class="title">${p.pinned?'<span class="pin">📌</span>':''}${esc(p.title)}${p.commentCount?`<span class="cnt">[${p.commentCount}]</span>`:''}</div>${T(p.created_at)>seen.board&&p.author!==me?.id?'<span class="chip accent">새 글</span>':''}</td><td class="w"><span class="chip">${esc(p.cat)}</span></td><td class="w">${esc(pname(p.author))}</td><td class="dt">${fmtDate(p.created_at)}</td></tr>`).join('');
}
$('#post-rows').onclick=e=>{ const tr=e.target.closest('tr[data-id]'); if(tr) openPost(Number(tr.dataset.id)); };
$('#post-new').onclick=()=>openPostForm();
function openPostForm(p){
modal(`<h3>${p?'글 수정':'새 글'}</h3><p class="lead">논의 주제, 원고 일부, 자료 링크 등 무엇이든 올려두고 댓글로 이어가세요.</p>
<form id="post-form"><div class="grid2"><div class="field"><label>분류</label><select class="input" id="pf-cat">${CATS.map(c=>`<option ${p?.cat===c?'selected':''}>${c}</option>`).join('')}</select></div><div class="field"><label>&nbsp;</label><label style="display:flex;gap:6px;align-items:center;color:var(--ink);font-size:14px"><input type="checkbox" id="pf-pin" ${p?.pinned?'checked':''}> 상단 고정</label></div></div>
<div class="field"><label>제목</label><input class="input" id="pf-title" required value="${esc(p?.title||'')}"></div>
<div class="field"><label>내용</label><textarea class="input" id="pf-body" style="min-height:220px">${esc(p?.body||'')}</textarea></div>
<div class="actions"><button type="button" class="btn ghost" id="pf-cancel">취소</button><button type="submit" class="btn primary">${p?'저장':'올리기'}</button></div></form>`, close=>{
$('#pf-cancel').onclick=close;
$('#post-form').onsubmit=async e=>{ e.preventDefault();
const data={title:$('#pf-title').value.trim(), body:$('#pf-body').value, cat:$('#pf-cat').value, pinned:$('#pf-pin').checked};
if(!data.title) return;
if(p){ if(await run(sb.from('posts').update({...data, edited_at:new Date().toISOString()}).eq('id',p.id),'수정했습니다')) close(); }
else { const num=(Math.max(0,...state.posts.map(x=>x.num||0)))+1; const row=await run(sb.from('posts').insert({...data, num, author:me.id}).select().single(),'글을 올렸습니다'); if(row){ close(); await loadPosts(); openPost(row.id); } }
};
setTimeout(()=>$('#pf-title').focus(),50);
});
}
function openPost(id){
state.openPost=id; state.quote=null; state.replyTo=null; state.comments=[];
$('#board-list').hidden=true; $('#board-detail').hidden=false;
const p=state.posts.find(x=>x.id===id); if(p) renderPostDetail(p);
loadComments();
$('#view-board .view-body').scrollTop=0;
}
function closePost(){ state.openPost=null; state.comments=[]; $('#board-list').hidden=false; $('#board-detail').hidden=true; renderBoard(); }
function renderPostDetail(p){
const draft = $('#cf-text')?.value || '';
const kind = $('input[name=cf-kind]:checked')?.value || 'say';
const byParent={}; for(const c of state.comments){ (byParent[c.parent_id||'root'] ||= []).push(c); }
const renderC=(c,depth)=>`<div class="comment ${depth?'reply':''}" id="c-${c.id}">${av(c.author)}<div class="c-body"><div class="c-head"><b>${esc(pname(c.author))}</b>${c.kind&&c.kind!=='say'?`<span class="tag ${c.kind}">${COMMENT_KINDS[c.kind]||''}</span>`:''}<span class="tm">${fmtDT(c.created_at)}</span></div>${c.quote?`<div class="quote">“${esc(c.quote)}”</div>`:''}<div class="text">${linkify(c.text)}</div><div class="c-tools"><button data-reply="${c.id}">답글</button><button data-quote="${c.id}">인용</button>${c.author===me?.id?`<button data-del="${c.id}">삭제</button>`:''}</div></div></div>` + (byParent[c.id]||[]).map(x=>renderC(x,depth+1)).join('');
const commentsHtml=(byParent.root||[]).map(c=>renderC(c,0)).join('');
const replyTarget = state.replyTo ? state.comments.find(c=>c.id===state.replyTo) : null;
$('#board-detail').innerHTML=`<button class="btn ghost back" id="post-back">‹ 목록으로</button>
<article class="post-article"><div class="row" style="gap:6px"><span class="chip">${esc(p.cat)}</span>${p.pinned?'<span class="chip accent">고정</span>':''}<span class="chip mono">#${p.num??''}</span></div><h3>${esc(p.title)}</h3>
<div class="meta">${av(p.author)}<b>${esc(pname(p.author))}</b><span class="mono">${fmtDT(p.created_at)}</span>${p.edited_at?`<span class="small">(수정 ${rel(p.edited_at)})</span>`:''}</div>
<div class="content">${linkify(p.body)}</div>
<div class="tools"><button class="btn sm" id="post-quote-sel">선택한 문장 인용해 댓글</button>${p.author===me?.id?`<button class="btn sm" id="post-edit">수정</button><button class="btn sm" id="post-del">삭제</button>`:''}</div></article>
<section class="comments"><h4>댓글 <span class="cnt">${state.comments.length}</span></h4>${commentsHtml||'<div class="muted small" style="padding:8px 0">첫 댓글을 남겨보세요. 본문의 문장을 드래그해 선택한 뒤 “인용”하면 어느 부분에 대한 의견인지 분명해집니다.</div>'}
<form class="comment-form" id="comment-form">
${replyTarget?`<div class="quoting">↳ <b>${esc(pname(replyTarget.author))}</b>님 댓글에 답글<button type="button" id="cf-unreply" aria-label="답글 취소">✕</button></div>`:''}
${state.quote?`<div class="quoting">“${esc(state.quote.slice(0,140))}${state.quote.length>140?'…':''}”<button type="button" id="cf-unquote" aria-label="인용 취소">✕</button></div>`:''}
<div class="kind-pick">${Object.entries(COMMENT_KINDS).map(([k,l])=>`<label><input type="radio" name="cf-kind" value="${k}" ${k===kind?'checked':''}>${l}</label>`).join('')}</div>
<textarea class="input" id="cf-text" placeholder="의견을 남겨주세요 (Ctrl+Enter 등록)" style="min-height:76px">${esc(draft)}</textarea>
<div class="row" style="justify-content:flex-end"><button type="submit" class="btn primary">댓글 등록</button></div>
</form></section>`;
$('#post-back').onclick=closePost;
$('#post-edit')?.addEventListener('click',()=>openPostForm(p));
$('#post-del')?.addEventListener('click',()=>confirmModal('이 글을 삭제할까요?','댓글도 함께 삭제됩니다.',async()=>{ if(await run(sb.from('posts').delete().eq('id',p.id),'삭제했습니다')) closePost(); }));
$('#post-quote-sel').onclick=()=>{ const s=window.getSelection()?.toString().trim(); if(!s){ toast('본문에서 인용할 문장을 먼저 드래그해 선택하세요'); return; } state.quote=s; renderPostDetail(p); $('#cf-text').focus(); };
$('#cf-unquote')?.addEventListener('click',()=>{state.quote=null; renderPostDetail(p);});
$('#cf-unreply')?.addEventListener('click',()=>{state.replyTo=null; renderPostDetail(p);});
$$('#board-detail [data-reply]').forEach(b=>b.onclick=()=>{ state.replyTo=Number(b.dataset.reply); renderPostDetail(p); $('#cf-text').focus(); });
$$('#board-detail [data-quote]').forEach(b=>b.onclick=()=>{ const c=state.comments.find(x=>x.id===Number(b.dataset.quote)); state.quote=c.text; state.replyTo=c.id; renderPostDetail(p); $('#cf-text').focus(); });
$$('#board-detail [data-del]').forEach(b=>b.onclick=()=>confirmModal('댓글을 삭제할까요?','',()=>run(sb.from('comments').delete().eq('id',Number(b.dataset.del)))));
const form=$('#comment-form');
form.onsubmit=async e=>{ e.preventDefault(); const text=$('#cf-text').value.trim(); if(!text) return;
const c={post_id:p.id, author:me.id, text, kind:$('input[name=cf-kind]:checked').value, quote:state.quote||null, parent_id:state.replyTo||null};
$('#cf-text').value='';
if(await run(sb.from('comments').insert(c))){ state.quote=null; state.replyTo=null; loadComments(); }
};
$('#cf-text').addEventListener('keydown',e=>{ if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); form.requestSubmit(); } });
}

// ================= PAPER BOARD =================
function renderKanban(){
const today=todayKey();
$('#kanban').innerHTML=STATUSES.map(s=>{
const cards=state.tasks.filter(t=>t.status===s.k);
return `<div class="col" data-status="${s.k}"><div class="col-head" style="--c:${s.c}"><span>${s.l}</span><span class="n">${cards.length}</span></div>
${cards.map(t=>`<div class="tcard" draggable="true" data-id="${t.id}"><div class="ch">${esc(t.chapter||'')}</div><div class="tt">${esc(t.title)}</div>${t.note?`<div class="nt">${esc(t.note)}</div>`:''}<div class="ft"><span class="owner">${t.owner?av(t.owner)+esc(pname(t.owner)):'<span class="muted">담당 미정</span>'}</span>${t.due?`<span class="due ${t.due<today&&s.k!=='done'?'over':''}">${t.due.slice(5).replace('-','/')}</span>`:''}</div></div>`).join('')}
<button class="col-add" data-add="${s.k}">+ 카드</button></div>`;
}).join('');
$$('#kanban .tcard').forEach(c=>{
c.addEventListener('dragstart',e=>{ e.dataTransfer.setData('text/plain',c.dataset.id); c.classList.add('dragging'); });
c.addEventListener('dragend',()=>c.classList.remove('dragging'));
c.onclick=()=>openTaskForm(state.tasks.find(t=>t.id===Number(c.dataset.id)));
});
$$('#kanban .col').forEach(col=>{
col.addEventListener('dragover',e=>{ e.preventDefault(); col.classList.add('drop'); });
col.addEventListener('dragleave',()=>col.classList.remove('drop'));
col.addEventListener('drop',async e=>{ e.preventDefault(); col.classList.remove('drop'); const id=Number(e.dataTransfer.getData('text/plain')); const t=state.tasks.find(x=>x.id===id); if(!t||t.status===col.dataset.status) return; t.status=col.dataset.status; renderKanban(); await run(sb.from('tasks').update({status:col.dataset.status, updated_at:new Date().toISOString()}).eq('id',id), `“${t.title}” → ${STATUSES.find(s=>s.k===col.dataset.status).l}`); });
});
$$('#kanban [data-add]').forEach(b=>b.onclick=()=>openTaskForm(null,b.dataset.add));
}
$('#task-new').onclick=()=>openTaskForm();
function openTaskForm(t, status='draft'){
const members=Object.entries(profiles).filter(([id,m])=>m.approved);
modal(`<h3>${t?'카드 편집':'카드 추가'}</h3><p class="lead">논문의 한 부분(장·절·표·그림) 단위로 카드를 만들면 진행이 한눈에 보입니다.</p>
<form id="task-form"><div class="grid2"><div class="field"><label>장(章) / 구분</label><input class="input" id="tf-ch" list="ch-list" value="${esc(t?.chapter||'')}" placeholder="Ⅲ. 연구방법"><datalist id="ch-list">${['초록','Ⅰ. 서론','Ⅱ. 이론적 배경','Ⅲ. 연구방법','Ⅳ. 연구결과','Ⅴ. 논의 및 결론','참고문헌','표·그림','투고 준비'].map(c=>`<option value="${c}">`).join('')}</datalist></div><div class="field"><label>담당</label><select class="input" id="tf-owner"><option value="">미정</option>${members.map(([id,m])=>`<option value="${id}" ${t?.owner===id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></div></div>
<div class="field"><label>할 일</label><input class="input" id="tf-title" required value="${esc(t?.title||'')}" placeholder="연구 참여자 선정 기준·절차 작성"></div>
<div class="grid2"><div class="field"><label>마감</label><input class="input" type="date" id="tf-due" value="${esc(t?.due||'')}"></div><div class="field"><label>상태</label><div class="status-pick">${STATUSES.map(s=>`<label><input type="radio" name="tf-status" value="${s.k}" ${(t?.status||status)===s.k?'checked':''}>${s.l}</label>`).join('')}</div></div></div>
<div class="field"><label>메모</label><textarea class="input" id="tf-note" style="min-height:70px">${esc(t?.note||'')}</textarea></div>
<div class="actions">${t?'<button type="button" class="btn ghost" id="tf-del" style="margin-right:auto;color:var(--s-revise)">삭제</button>':''}<button type="button" class="btn ghost" id="tf-cancel">취소</button><button type="submit" class="btn primary">저장</button></div></form>`, close=>{
$('#tf-cancel').onclick=close;
$('#tf-del')?.addEventListener('click',async()=>{ if(await run(sb.from('tasks').delete().eq('id',t.id),'삭제했습니다')) close(); });
$('#task-form').onsubmit=async e=>{ e.preventDefault(); const data={chapter:$('#tf-ch').value.trim(), title:$('#tf-title').value.trim(), owner:$('#tf-owner').value||null, due:$('#tf-due').value||null, status:$('input[name=tf-status]:checked').value, note:$('#tf-note').value.trim(), updated_at:new Date().toISOString()};
if(!data.title) return;
const ok = t ? await run(sb.from('tasks').update(data).eq('id',t.id),'저장했습니다') : await run(sb.from('tasks').insert({...data, sort:state.tasks.length, created_by:me.id}),'카드를 추가했습니다');
if(ok) close(); };
setTimeout(()=>$('#tf-title').focus(),50);
});
}

// ================= FILES =================
function renderFiles(){
const groups={}; for(const f of state.files){ (groups[f.group_name]||={name:f.group_name,items:[]}).items.push(f); }
const arr=Object.values(groups).sort((a,b)=>Math.max(...b.items.map(i=>T(i.created_at)))-Math.max(...a.items.map(i=>T(i.created_at))));
$('#file-empty').hidden=!!arr.length;
$('#file-groups').innerHTML=arr.map(g=>{ const items=g.items.sort((a,b)=>T(b.created_at)-T(a.created_at)); return `<div class="file-group"><div class="fg-head"><h3>${esc(g.name)}</h3><span class="chip">${items.length}개 버전</span></div>
${items.map((f,i)=>`<div class="fv ${i===0?'latest':''}"><div class="ficon">${esc((f.name.split('.').pop()||'').toUpperCase().slice(0,4))}</div><span class="vnum">v${f.version}</span><div style="min-width:0;flex:1"><a class="fname" href="#" data-open="${f.id}">${esc(f.name)}</a>${f.note?`<span class="note">${esc(f.note)}</span>`:''}</div><span class="fmeta">${esc(pname(f.author))} · ${fmtDate(f.created_at)} · ${fmtBytes(f.size)}</span>${f.author===me?.id?`<button class="btn ghost sm" data-fdel="${f.id}" title="삭제">✕</button>`:''}</div>`).join('')}</div>`; }).join('');
$$('#file-groups [data-open]').forEach(a=>a.onclick=async e=>{ e.preventDefault(); const f=state.files.find(x=>x.id===Number(a.dataset.open)); const {data,error}=await sb.storage.from('files').createSignedUrl(f.path, 3600, {download:f.name}); if(error) return toast('파일을 열지 못했습니다: '+errMsg(error)); window.open(data.signedUrl,'_blank'); });
$$('#file-groups [data-fdel]').forEach(b=>b.onclick=()=>{ const f=state.files.find(x=>x.id===Number(b.dataset.fdel)); confirmModal(`“${f.name}” 을 삭제할까요?`,'파일도 함께 지워집니다.',async()=>{ await sb.storage.from('files').remove([f.path]); await run(sb.from('files').delete().eq('id',f.id),'삭제했습니다'); }); });
}
const dz=$('#drop-zone');
$('#file-pick').onclick=()=>$('#file-input').click();
$('#file-input').onchange=e=>{ if(e.target.files[0]) startUpload(e.target.files[0]); e.target.value=''; };
dz.addEventListener('dragover',e=>{e.preventDefault(); dz.classList.add('over');});
dz.addEventListener('dragleave',()=>dz.classList.remove('over'));
dz.addEventListener('drop',e=>{ e.preventDefault(); dz.classList.remove('over'); const f=e.dataTransfer.files[0]; if(f) startUpload(f); });
function startUpload(file){
if(file.size>50*1048576){ toast('50MB를 넘는 파일은 올릴 수 없습니다.'); return; }
const groups=[...new Set(state.files.map(f=>f.group_name))];
const base=file.name.replace(/\.[^.]+$/,'').replace(/[_\-\s]*(v|ver|version|최종|수정|rev)?[\s_\-]*\d+[\s_\-]*$/i,'').trim()||file.name;
const guess=groups.find(g=>g.toLowerCase()===base.toLowerCase())||'';
modal(`<h3>파일 올리기</h3><p class="lead"><b>${esc(file.name)}</b> · ${fmtBytes(file.size)}</p>
<form id="up-form"><div class="field"><label>어느 문서의 버전인가요?</label><select class="input" id="up-group"><option value="__new">새 문서로 등록</option>${groups.map(g=>`<option ${g===guess?'selected':''}>${esc(g)}</option>`).join('')}</select></div>
<div class="field" id="up-newname-wrap" ${guess?'hidden':''}><label>문서 이름 (예: 본 원고, IRB 신청서, 분석 데이터)</label><input class="input" id="up-newname" value="${esc(base)}"></div>
<div class="field"><label>이번 버전에서 바뀐 점</label><textarea class="input" id="up-note" style="min-height:64px" placeholder="교수님 피드백 반영해 연구방법 절차 보완"></textarea></div>
<div class="actions"><button type="button" class="btn ghost" id="up-cancel">취소</button><button type="submit" class="btn primary" id="up-go">올리기</button></div></form>`, close=>{
$('#up-cancel').onclick=close;
$('#up-group').onchange=e=>{ $('#up-newname-wrap').hidden=e.target.value!=='__new'; };
$('#up-form').onsubmit=async e=>{ e.preventDefault(); const sel=$('#up-group').value; const group=sel==='__new'?$('#up-newname').value.trim():sel; if(!group) return;
const btn=$('#up-go'); btn.disabled=true; btn.textContent='올리는 중…';
const version=state.files.filter(f=>f.group_name===group).length+1;
const path=`${me.id}/${Date.now()}_${file.name.replace(/[^\w.\-가-힣]/g,'_')}`;
const {error:ue}=await sb.storage.from('files').upload(path, file, {contentType:file.type||'application/octet-stream'});
if(ue){ btn.disabled=false; btn.textContent='올리기'; return toast('업로드 실패: '+errMsg(ue)); }
if(await run(sb.from('files').insert({group_name:group, name:file.name, path, size:file.size, mime:file.type, version, note:$('#up-note').value.trim(), author:me.id}), `“${group}” v${version} 올렸습니다`)) close(); else { btn.disabled=false; btn.textContent='올리기'; }
};
});
}

// ================= REFS =================
function apa(r){
const authors=(r.authors||'').split(/[,;、]\s*(?![A-Z]\.)/).map(s=>s.trim()).filter(Boolean);
let a = authors.length<=1 ? authors.join('') : authors.length<=20 ? authors.slice(0,-1).join(', ')+(/[가-힣]/.test(authors[0])?', ':', & ')+authors.at(-1) : authors.slice(0,19).join(', ')+', … '+authors.at(-1);
const y=r.year?` (${r.year}).`:' (n.d.).'; const t=r.title||'';
let tail='';
if(r.type==='article'){ tail=` <i>${esc(r.journal||'')}</i>${r.volume?`, <i>${esc(r.volume.replace(/\(.*$/,''))}</i>${/\(/.test(r.volume)?esc(r.volume.slice(r.volume.indexOf('('))):''}`:''}${r.pages?`, ${esc(r.pages)}`:''}.`; }
else if(r.type==='book'){ tail=` <i>${esc(t)}</i>.${r.journal?` ${esc(r.journal)}.`:''}`; }
else if(r.type==='thesis'){ tail=` <i>${esc(t)}</i> [${/박사|Doctoral/i.test(r.note||'')?'박사학위논문':'석사학위논문'}${r.journal?', '+esc(r.journal):''}].`; }
else { tail=` <i>${esc(t)}</i>.${r.journal?` ${esc(r.journal)}.`:''}`; }
const titlePart = r.type==='article' ? ` ${esc(t)}.` : '';
const link = r.doi ? ` ${/^http/.test(r.doi)?esc(r.doi):'https://doi.org/'+esc(r.doi.replace(/^doi:\s*/i,''))}` : '';
return `${esc(a)}${y}${titlePart}${tail}${link}`;
}
function plain(html){ const d=document.createElement('div'); d.innerHTML=html; return d.textContent; }
$('#ref-search').oninput=renderRefs;
function renderRefs(){
const q=$('#ref-search').value.trim().toLowerCase();
const list=state.refs.filter(r=>!q||(r.authors+' '+r.title+' '+(r.note||'')+' '+(r.journal||'')).toLowerCase().includes(q)).sort((a,b)=>plain(apa(a)).localeCompare(plain(apa(b)),'ko'));
$('#ref-empty').hidden=!!list.length; $('#ref-count').textContent=list.length?`${list.length}건 · 저자순 정렬`:'';
$('#ref-list').innerHTML=list.map(r=>`<div class="ref-item" data-id="${r.id}"><div class="apa">${apa(r)}</div><div class="rmeta"><span class="chip">${{article:'학술지',book:'단행본',thesis:'학위논문',web:'웹'}[r.type]||''}</span>${r.where_used?`<span class="chip accent">${esc(r.where_used)}</span>`:''}<span>${esc(pname(r.author))} 추가 · ${fmtDate(r.created_at)}</span><button class="btn sm" data-copy="${r.id}">APA 복사</button><button class="btn ghost sm" data-edit="${r.id}">편집</button>${r.author===me?.id?`<button class="btn ghost sm" data-rdel="${r.id}">삭제</button>`:''}</div>${r.note?`<div class="rnote">${esc(r.note)}</div>`:''}</div>`).join('');
$$('#ref-list [data-copy]').forEach(b=>b.onclick=()=>copy(plain(apa(state.refs.find(r=>r.id===Number(b.dataset.copy)))),'APA 표기를 복사했습니다'));
$$('#ref-list [data-edit]').forEach(b=>b.onclick=()=>openRefForm(state.refs.find(r=>r.id===Number(b.dataset.edit))));
$$('#ref-list [data-rdel]').forEach(b=>b.onclick=()=>confirmModal('이 문헌을 삭제할까요?','',()=>run(sb.from('refs').delete().eq('id',Number(b.dataset.rdel)),'삭제했습니다')));
}
async function copy(text,msg){ try{ await navigator.clipboard.writeText(text); toast(msg); }catch{ toast('복사 권한이 없어 직접 선택해 복사해 주세요'); } }
$('#refs-copy-all').onclick=()=>{ const list=[...state.refs].sort((a,b)=>plain(apa(a)).localeCompare(plain(apa(b)),'ko')); if(!list.length) return toast('복사할 문헌이 없습니다'); copy(list.map(r=>plain(apa(r))).join('\n'),`${list.length}건을 복사했습니다`); };
let editingRef=null;
$('#ref-new').onclick=()=>openRefForm(null);
$('#ref-cancel').onclick=()=>{ $('#ref-form').classList.remove('open'); editingRef=null; };
function openRefForm(r){ editingRef=r; const f=$('#ref-form'); f.classList.add('open');
$('#rf-authors').value=r?.authors||''; $('#rf-year').value=r?.year||''; $('#rf-type').value=r?.type||'article'; $('#rf-title').value=r?.title||''; $('#rf-journal').value=r?.journal||''; $('#rf-volume').value=r?.volume||''; $('#rf-pages').value=r?.pages||''; $('#rf-doi').value=r?.doi||''; $('#rf-where').value=r?.where_used||''; $('#rf-note').value=r?.note||'';
f.scrollIntoView({behavior:'smooth',block:'start'}); $('#rf-authors').focus(); }
$('#ref-form').onsubmit=async e=>{ e.preventDefault();
const data={authors:$('#rf-authors').value.trim(), year:$('#rf-year').value.trim(), type:$('#rf-type').value, title:$('#rf-title').value.trim(), journal:$('#rf-journal').value.trim(), volume:$('#rf-volume').value.trim(), pages:$('#rf-pages').value.trim(), doi:$('#rf-doi').value.trim(), where_used:$('#rf-where').value.trim(), note:$('#rf-note').value.trim()};
const ok = editingRef ? await run(sb.from('refs').update({...data, edited_at:new Date().toISOString()}).eq('id',editingRef.id),'수정했습니다') : await run(sb.from('refs').insert({...data, author:me.id}),'문헌을 추가했습니다');
if(ok){ $('#ref-form').classList.remove('open'); editingRef=null; } };

// ================= CALENDAR =================
state.calMonth = todayKey().slice(0,7);
$('#cal-prev').onclick=()=>shiftMonth(-1); $('#cal-next').onclick=()=>shiftMonth(1);
function shiftMonth(n){ const [y,m]=state.calMonth.split('-').map(Number); const d=new Date(y,m-1+n,1); state.calMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; renderCal(); }
function renderCal(){
const [y,m]=state.calMonth.split('-').map(Number); $('#cal-title').textContent=`${y}년 ${m}월`;
const first=new Date(y,m-1,1), startDow=first.getDay(), days=new Date(y,m,0).getDate(), today=todayKey();
let html='일월화수목금토'.split('').map(d=>`<div class="dow">${d}</div>`).join('');
for(let i=0;i<startDow;i++) html+='<div></div>';
for(let d=1;d<=days;d++){ const k=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; const evs=state.events.filter(e=>e.date===k);
html+=`<button class="day ${k===today?'today':''} ${k===state.calSel?'sel':''}" data-day="${k}"><span>${d}</span><span class="dots">${evs.slice(0,4).map(e=>`<i style="background:${EV_TYPES[e.type]?.c||'var(--accent)'}"></i>`).join('')}</span></button>`; }
$('#cal-grid').innerHTML=html;
$$('#cal-grid .day').forEach(b=>{ b.onclick=()=>{ state.calSel = state.calSel===b.dataset.day?null:b.dataset.day; renderCal(); }; b.ondblclick=()=>openEventForm(null,b.dataset.day); });
let list; if(state.calSel){ list=state.events.filter(e=>e.date===state.calSel); $('#ev-list-title').innerHTML=`${dayLabel(state.calSel)} <button class="btn ghost sm" id="ev-clear-sel">전체 보기</button> <button class="btn sm" id="ev-add-sel">이 날에 추가</button>`; }
else { list=state.events.filter(e=>e.date>=today).slice(0,12); const past=state.events.filter(e=>e.date<today).slice(-3); list=[...past,...list]; $('#ev-list-title').textContent='다가오는 일정 (최근 지난 일정 3건 포함)'; }
$('#ev-clear-sel')?.addEventListener('click',()=>{state.calSel=null; renderCal();});
$('#ev-add-sel')?.addEventListener('click',()=>openEventForm(null,state.calSel));
$('#ev-empty').hidden=!!list.length;
$('#ev-list').innerHTML=list.map(e=>{ const t=EV_TYPES[e.type]||EV_TYPES.memo; const past=e.date<today; return `<div class="ev" style="--c:${t.c};${past?'opacity:.75':''}"><div class="eh"><span class="when">${e.date.slice(5).replace('-','/')}${e.time?' '+e.time.slice(0,5):''}</span><b>${esc(e.title)}</b><span class="chip">${t.l}</span></div>${e.place?`<div class="small muted" style="margin-top:2px">${esc(e.place)}</div>`:''}${e.agenda?`<div class="small" style="margin-top:6px;white-space:pre-wrap">${linkify(e.agenda)}</div>`:''}${(e.decisions||e.todos)?`<div class="minutes">${e.decisions?`<div><span class="lbl">결정사항</span>${linkify(e.decisions)}</div>`:''}${e.todos?`<div><span class="lbl">다음 할 일</span>${linkify(e.todos)}</div>`:''}</div>`:''}<div class="et"><button class="btn ghost sm" data-eedit="${e.id}">${e.type==='meeting'&&!e.decisions?'회의록 작성':'편집'}</button></div></div>`; }).join('');
$$('#ev-list [data-eedit]').forEach(b=>b.onclick=()=>openEventForm(state.events.find(x=>x.id===Number(b.dataset.eedit))));
}
$('#ev-new').onclick=()=>openEventForm(null, state.calSel||todayKey());
function openEventForm(ev, date){
modal(`<h3>${ev?'일정 편집':'일정 추가'}</h3><p class="lead">미팅이면 끝난 뒤 결정사항과 다음 할 일을 채워 회의록으로 남기세요.</p>
<form id="ev-form"><div class="grid2"><div class="field"><label>날짜</label><input class="input" type="date" id="ef-date" required value="${esc(ev?.date||date||'')}"></div><div class="field"><label>시간</label><input class="input" type="time" id="ef-time" value="${esc((ev?.time||'').slice(0,5))}"></div></div>
<div class="grid2"><div class="field"><label>제목</label><input class="input" id="ef-title" required value="${esc(ev?.title||'')}" placeholder="연구방법 초안 검토 미팅"></div><div class="field"><label>유형</label><select class="input" id="ef-type">${Object.entries(EV_TYPES).map(([k,v])=>`<option value="${k}" ${(ev?.type||'meeting')===k?'selected':''}>${v.l}</option>`).join('')}</select></div></div>
<div class="field"><label>장소 / 링크</label><input class="input" id="ef-place" value="${esc(ev?.place||'')}" placeholder="연구실 / Zoom 링크"></div>
<div class="field"><label>안건</label><textarea class="input" id="ef-agenda" style="min-height:60px">${esc(ev?.agenda||'')}</textarea></div>
<div class="field"><label>결정사항 (회의 후)</label><textarea class="input" id="ef-dec" style="min-height:70px">${esc(ev?.decisions||'')}</textarea></div>
<div class="field"><label>다음 할 일 (담당·기한)</label><textarea class="input" id="ef-todo" style="min-height:70px">${esc(ev?.todos||'')}</textarea></div>
<div class="actions">${ev?'<button type="button" class="btn ghost" id="ef-del" style="margin-right:auto;color:var(--s-revise)">삭제</button>':''}<button type="button" class="btn ghost" id="ef-cancel">취소</button><button type="submit" class="btn primary">저장</button></div></form>`, close=>{
$('#ef-cancel').onclick=close;
$('#ef-del')?.addEventListener('click',async()=>{ if(await run(sb.from('events').delete().eq('id',ev.id),'삭제했습니다')) close(); });
$('#ev-form').onsubmit=async e=>{ e.preventDefault(); const data={date:$('#ef-date').value, time:$('#ef-time').value||null, title:$('#ef-title').value.trim(), type:$('#ef-type').value, place:$('#ef-place').value.trim(), agenda:$('#ef-agenda').value.trim(), decisions:$('#ef-dec').value.trim(), todos:$('#ef-todo').value.trim(), updated_at:new Date().toISOString()};
if(!data.title||!data.date) return;
const ok= ev ? await run(sb.from('events').update(data).eq('id',ev.id),'저장했습니다') : await run(sb.from('events').insert({...data, author:me.id}),'일정을 추가했습니다');
if(ok) close(); };
setTimeout(()=>$('#ef-title').focus(),50);
});
}

// ================= HOME =================
function renderHome(){
$('#home-date').textContent=new Date().toLocaleDateString('ko-KR',{timeZone:TZ,year:'numeric',month:'long',day:'numeric',weekday:'long'});
const cnt=k=>state.tasks.filter(t=>t.status===k).length; const total=state.tasks.length;
$('#home-progress').innerHTML=`<div class="d"><b>${cnt('draft')}</b><span>초안</span></div><div class="r"><b>${cnt('review')}</b><span>검토 중</span></div><div class="v"><b>${cnt('revise')}</b><span>수정 필요</span></div><div class="o"><b>${cnt('done')}</b><span>완료</span></div>`;
$('#home-prog-sum').textContent= total?`${total}개 중 ${cnt('done')}개 완료 · ${Math.round(cnt('done')/total*100)}%`:'카드가 없습니다';
const today=todayKey();
const focus=state.tasks.filter(t=>t.status!=='done').sort((a,b)=>(a.due||'9')>(b.due||'9')?1:-1).slice(0,5);
$('#home-tasks').innerHTML=focus.length?focus.map(t=>`<div><div class="t">${t.chapter?`<span class="chip" style="margin-right:6px">${esc(t.chapter)}</span>`:''}${esc(t.title)}</div><div class="m">${STATUSES.find(s=>s.k===t.status)?.l} · ${t.owner?esc(pname(t.owner)):'담당 미정'}${t.due?` · 마감 ${t.due}${t.due<today?' <b style="color:var(--s-revise)">(지남)</b>':''}`:''}</div></div>`).join(''):`<div class="muted small">진행 중인 카드가 없습니다. <a href="#" data-go="paper">논문 진행</a>에서 추가하세요.</div>`;
const recent=[...state.chat].slice(-5).reverse();
$('#home-chat').innerHTML=recent.length?recent.map(m=>`<div class="home-chat-line"><span class="who" style="color:${pcolor(m.author)}">${esc(pname(m.author))}</span><span class="txt">${esc(m.text)}</span><span class="tm small muted mono">${rel(m.created_at)}</span></div>`).join(''):'<div class="muted small">아직 대화가 없습니다.</div>';
const notice=state.posts.find(p=>p.pinned);
$('#home-notice').innerHTML=notice?`<div class="notice-preview" style="cursor:pointer" data-open-post="${notice.id}"><div class="t">📌 ${esc(notice.title)}</div><div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(notice.body.slice(0,120))}</div></div>`:'';
$('#home-notice [data-open-post]')?.addEventListener('click',()=>{ go('board'); openPost(notice.id); });
const posts=state.posts.filter(p=>!p.pinned).slice(0,5);
$('#home-posts').innerHTML=posts.length?posts.map(p=>`<div style="cursor:pointer" data-open-post="${p.id}"><div class="t">${esc(p.title)}${p.commentCount?` <span class="mono small" style="color:var(--accent-text)">[${p.commentCount}]</span>`:''}</div><div class="m">${esc(p.cat)} · ${esc(pname(p.author))} · ${rel(p.created_at)}</div></div>`).join(''):'<div class="muted small">아직 글이 없습니다.</div>';
$$('#home-posts [data-open-post]').forEach(el=>el.onclick=()=>{ go('board'); openPost(Number(el.dataset.openPost)); });
const evs=state.events.filter(e=>e.date>=today).slice(0,4);
$('#home-events').innerHTML=evs.length?evs.map(e=>`<div><div class="t"><span class="mono" style="color:${EV_TYPES[e.type]?.c}">${e.date.slice(5).replace('-','/')}</span> ${esc(e.title)}</div><div class="m">${EV_TYPES[e.type]?.l}${e.time?' · '+e.time.slice(0,5):''}${e.place?' · '+esc(e.place):''}</div></div>`).join(''):'<div class="muted small">예정된 일정이 없습니다.</div>';
const files=state.files.slice(0,4);
$('#home-files').innerHTML=files.length?files.map(f=>`<div><div class="t">${esc(f.group_name)} <span class="mono small" style="color:var(--accent-text)">v${f.version}</span></div><div class="m">${esc(f.name)} · ${esc(pname(f.author))} · ${rel(f.created_at)}</div></div>`).join(''):'<div class="muted small">올린 파일이 없습니다.</div>';
}
function renderAll(){ renderChat(); renderBoard(); renderKanban(); renderFiles(); renderRefs(); renderCal(); renderHome(); updateBadges(); renderOnline(); }
function setConn(cls,msg){ const c=$('#conn'); c.className='status-line '+cls; c.textContent=msg; }
function renderOnline(){ const now=Date.now(); const on=Object.values(profiles).filter(m=>m.approved&&now-T(m.last_seen||0)<3*60e3); $('#online').innerHTML=on.map(m=>`<span class="dot">${esc(m.name)}</span>`).join('')||'<span class="small muted">접속 중인 사람 없음</span>'; }

// ================= ADMIN: 가입 승인 =================
function pendingList(){ return Object.entries(profiles).filter(([id,m])=>!m.approved).map(([id,m])=>({id,...m})); }
function renderAdmin(){
const isAdmin = me?.role==='admin'; const n=pendingList().length;
const btn=$('#admin-btn'); if(btn){ btn.hidden=!isAdmin; btn.textContent = n?`가입 승인 대기 ${n}명`:'회원 관리'; btn.classList.toggle('primary', n>0); }
const card=$('#home-admin'); if(card){ card.hidden=!(isAdmin&&n>0); if(isAdmin&&n>0){ card.innerHTML=`<h3>가입 승인 대기 <span class="chip accent">${n}명</span></h3><div class="list">${pendingList().map(u=>`<div class="row" style="justify-content:space-between"><span><b>${esc(u.name)}</b> <span class="muted small">(${esc(u.username)})</span></span><span class="row" style="gap:6px"><button class="btn sm primary" data-approve="${u.id}">승인</button><button class="btn ghost sm" data-reject="${u.id}">거절</button></span></div>`).join('')}</div>`; bindAdmin(card); } }
}
function bindAdmin(root){
$$('[data-approve]',root).forEach(b=>b.onclick=async()=>{ if(await run(sb.from('profiles').update({approved:true}).eq('id',b.dataset.approve),'승인했습니다')){ await loadProfiles(); if($('#modal-root').children.length) openAdminModal(); } });
$$('[data-reject]',root).forEach(b=>b.onclick=()=>confirmModal('가입을 거절할까요?','이 사람은 사이트에 들어올 수 없게 됩니다.',async()=>{ if(await run(sb.from('profiles').delete().eq('id',b.dataset.reject),'처리했습니다')) await loadProfiles(); }));
}
function openAdminModal(){
const pend=pendingList(); const members=Object.entries(profiles).filter(([id,m])=>m.approved).map(([id,m])=>({id,...m}));
modal(`<h3>회원 관리</h3><p class="lead">가입 신청을 승인하거나 거절합니다. 승인된 회원은 사이트의 모든 내용을 볼 수 있습니다.</p>
<div class="eyebrow" style="margin-bottom:6px">승인 대기 ${pend.length}명</div>
<div class="list" style="margin-bottom:18px">${pend.length?pend.map(u=>`<div class="row" style="justify-content:space-between"><span class="row" style="gap:8px">${avatar(u.name,u.color)}<b>${esc(u.name)}</b> <span class="muted small">(${esc(u.username)})</span></span><span class="row" style="gap:6px"><button class="btn sm primary" data-approve="${u.id}">승인</button><button class="btn ghost sm" data-reject="${u.id}">거절</button></span></div>`).join(''):'<div class="muted small">대기 중인 신청이 없습니다.</div>'}</div>
<div class="eyebrow" style="margin-bottom:6px">회원 ${members.length}명</div>
<div class="list">${members.map(u=>`<div class="row" style="justify-content:space-between"><span class="row" style="gap:8px">${avatar(u.name,u.color)}<b>${esc(u.name)}</b> <span class="muted small">(${esc(u.username)})${u.role==='admin'?' · 관리자':''}</span></span>${u.id!==me.id&&u.role!=='admin'?`<button class="btn ghost sm" data-reject="${u.id}">내보내기</button>`:''}</div>`).join('')}</div>
<div class="actions"><button class="btn" id="adm-close">닫기</button></div>`, close=>{ $('#adm-close').onclick=close; bindAdmin($('#modal-root')); });
}
$('#admin-btn').onclick=openAdminModal;
$('#pending-logout').onclick=async()=>{ await sb.auth.signOut(); location.reload(); };
$('#pending-refresh').onclick=()=>location.reload();

// ================= boot =================
let pendingUnsub=null;
function showPending(p){
$('#app').hidden=true; $('#auth').hidden=false; $('#auth-form').hidden=true; $('.auth-tabs').hidden=true;
$('#auth-sub').innerHTML = p ? `<b>${esc(p.display_name)}</b>님, 가입 신청이 접수되었습니다.<br>관리자가 승인하면 자동으로 입장됩니다. (이 화면을 열어두셔도 되고, 나중에 다시 로그인하셔도 됩니다)` : '가입 정보가 없거나 승인이 거절되었습니다. 관리자에게 문의해 주세요.';
$('#pending-box').hidden=false;
if(pendingUnsub) pendingUnsub();
const ch=sb.channel('pending').on('postgres_changes',{event:'*',schema:'public',table:'profiles'},()=>location.reload()).subscribe();
pendingUnsub=()=>sb.removeChannel(ch);
setInterval(async()=>{ const {data}=await sb.from('profiles').select('approved').eq('id',sb_uid).maybeSingle(); if(data?.approved) location.reload(); }, 15000);
}
let sb_uid=null;
async function enter(session){
sb_uid=session.user.id;
const {data:p}=await sb.from('profiles').select('*').eq('id',session.user.id).maybeSingle();
if(!p || !p.approved){ showPending(p); return; }
me={id:session.user.id, name:p.display_name, color:p.color||COLORS[0], username:p.username, role:p.role||'member'};
$('#auth').hidden=true; $('#app').hidden=false; renderMe();
await loadProfiles();
await Promise.all([loadChat(), loadPosts(), loadTasks(), loadFiles(), loadRefs(), loadEvents()]);
subscribeRealtime(); renderAdmin(); heartbeat(); setInterval(()=>{ heartbeat(); renderOnline(); }, 60e3);
go(ls.get('coauthor.view','home'));
}
(async()=>{
if(!sb){ $('#auth').hidden=false; $('#auth-err').textContent=bootErr; $('#auth-err').hidden=false; return; }
const {data:{session}}=await sb.auth.getSession();
if(session) enter(session); else $('#auth').hidden=false;
sb.auth.onAuthStateChange((ev,s)=>{ if(ev==='SIGNED_IN'&&s&&!me) enter(s); if(ev==='SIGNED_OUT'){ me=null; location.reload(); } });
})();
})();
