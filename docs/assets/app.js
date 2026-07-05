
const data = window.V1T_DATA;
function text(s){return String(s ?? '').toLowerCase()}
function renderChallenges(){
  const root=document.getElementById('challenge-root');const search=document.getElementById('search');const modal=document.getElementById('challenge-modal');
  function draw(){
    const q=text(search.value);const items=data.challenges.filter(c=>!q||text(c.name+c.category+c.tags.join(' ')).includes(q));
    const groups=[];const byCat={};items.forEach(c=>{if(!byCat[c.category]){byCat[c.category]=[];groups.push([c.category,byCat[c.category]])}byCat[c.category].push(c)});
    root.innerHTML=groups.map(([cat,cs])=>'<div class="category"><h2>'+cat+'</h2><div class="grid">'+cs.map(c=>'<article class="card" data-id="'+c.id+'"><h3>'+escapeHtml(c.name)+'</h3><span class="points">'+c.value+' pts</span><div class="meta">'+c.solves+' solves · '+c.type+'</div><div class="tags">'+c.tags.map(t=>'<span class="tag">'+escapeHtml(t)+'</span>').join('')+'</div></article>').join('')+'</div></div>').join('');
    root.querySelectorAll('.card').forEach(el=>el.onclick=()=>openChallenge(Number(el.dataset.id)));
  }
  function openChallenge(id){const c=data.challenges.find(x=>x.id===id);modal.innerHTML='<div class="modal-head"><div><h2>'+escapeHtml(c.name)+'</h2><span class="points">'+c.value+' pts</span></div><button class="close" onclick="document.getElementById(\'challenge-modal\').close()">X</button></div><p class="meta">'+escapeHtml(c.category)+' · '+c.solves+' solves</p>'+(c.connection_info?'<h3>Connection</h3><pre>'+escapeHtml(c.connection_info)+'</pre>':'')+'<h3>Description</h3><div class="description">'+c.descriptionHtml+'</div>'+(c.files.length?'<h3>Files</h3><div class="files">'+c.files.map(f=>'<a class="file" href="'+f.url+'" download><span>'+escapeHtml(f.name)+'</span><small>'+f.sha1.slice(0,8)+'</small></a>').join('')+'</div>':'');modal.showModal()}
  search.addEventListener('input',draw);draw();
}
function renderScoreboard(){
 const root=document.getElementById('scoreboard-root');const search=document.getElementById('search');
 function draw(){const q=text(search.value);const rows=data.scoreboard.filter(t=>!q||text(t.name+t.country+t.affiliation).includes(q));root.innerHTML='<div class="table-wrap"><table><thead><tr><th>#</th><th>Team</th><th>Score</th><th>Solves</th><th>Country</th></tr></thead><tbody>'+rows.map(t=>'<tr><td>'+t.pos+'</td><td>'+escapeHtml(t.name)+'</td><td>'+t.score+'</td><td>'+t.solves+'</td><td>'+(t.country||'')+'</td></tr>').join('')+'</tbody></table></div>'}
 search.addEventListener('input',draw);draw();
}
function renderTeams(){
 const root=document.getElementById('teams-root');const search=document.getElementById('search');
 function draw(){const q=text(search.value);const rows=data.teams.filter(t=>!q||text(t.name+t.members.map(m=>m.name).join(' ')).includes(q));root.innerHTML=rows.map(t=>'<article class="card team-card"><h3>#'+t.pos+' '+escapeHtml(t.name)+'</h3><span class="points">'+t.score+' pts</span><div class="meta">'+t.solves+' solves</div><div class="members">'+t.members.map(m=>escapeHtml(m.name)).join(' · ')+'</div></article>').join('')}
 search.addEventListener('input',draw);draw();
}
function escapeHtml(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}