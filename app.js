const $=s=>document.querySelector(s);
const API_BASE=(window.NOVAGAS_API_BASE||"").replace(/\/$/,"");
const api=async(path,opt={})=>{opt.headers={...(opt.headers||{}),...(token?{Authorization:"Bearer "+token}:{})}; if(opt.body)opt.headers["Content-Type"]="application/json"; const r=await fetch(API_BASE+"/api"+path,opt); const d=await r.json().catch(()=>({})); if(!r.ok)throw Error(d.error||"Erro"); return d};
let token=localStorage.getItem("ng_token"), me=null;

function toast(msg){const t=$("#toast");t.textContent=msg;t.className="show";setTimeout(()=>t.className="",3000)}
function money(c){return new Intl.NumberFormat("pt-AO",{style:"currency",currency:"AOA",maximumFractionDigits:2}).format((c||0)/100)}
function modal(title,body){const x=document.createElement("div");x.className="modal";x.innerHTML=`<div class="modal-box"><h2>${title}</h2>${body}</div>`;x.onclick=e=>{if(e.target===x)x.remove()};document.body.append(x);return x}
function go(page){document.querySelectorAll(".page").forEach(x=>x.classList.add("hidden"));$("#page-"+page).classList.remove("hidden");document.querySelectorAll(".bottom button").forEach(x=>x.classList.toggle("active",x.dataset.page===page)); ({home:renderHome,invest:renderInvest,team:renderTeam,tasks:renderTasks,account:renderAccount})[page]()}
async function boot(){if(!token){$("#auth").classList.remove("hidden");return}try{me=await api("/me");$("#auth").classList.add("hidden");$("#register").classList.add("hidden");$("#app").classList.remove("hidden");go("home")}catch{localStorage.removeItem("ng_token");token=null;$("#auth").classList.remove("hidden")}}
async function renderHome(){const d=await api("/dashboard");$("#page-home").innerHTML=`
<div class="hero"><small>Olá, ${me.user.name} 👋</small><h2>Resumo da sua conta</h2><div class="balance">${money(d.wallet.available_cents)}</div><small>Saldo disponível</small><div class="actions"><button onclick="deposit()">Depósito</button><button onclick="withdraw()">Retirar</button></div></div>
<div class="grid"><div class="card"><h3>Investido</h3><div class="stat">${money(d.wallet.invested_cents)}</div></div><div class="card"><h3>Bónus</h3><div class="stat">${money(d.wallet.bonus_cents)}</div></div><div class="card"><h3>VIP</h3><div class="stat">VIP ${me.user.vip_level}</div></div><div class="card"><h3>Equipa</h3><div class="stat">${d.referrals}</div><div class="muted2">convidados</div></div></div>
<div class="section-title"><h2>Últimas transações</h2><button class="outline" style="width:auto" onclick="go('account')">Ver tudo</button></div>
<div class="list">${d.transactions.length?d.transactions.slice(0,5).map(t=>`<div class="row"><div><b>${t.type==="deposit"?"Depósito":t.type==="withdrawal"?"Levantamento":"Operação"}</b><div class="muted2">${t.status} · ${t.created_at}</div></div><b class="${t.type==='withdrawal'?'negative':'positive'}">${t.type==='withdrawal'?'-':'+'}${money(t.amount_cents)}</b></div>`).join(""):`<div class="card muted2">Ainda não há transações.</div>`}</div>`}
async function renderInvest(){const [p,d]=await Promise.all([api("/products"),api("/dashboard")]);$("#page-invest").innerHTML=`
<div class="section-title"><h2>Pacotes de investimento</h2><span class="muted2">${money(d.wallet.available_cents)} disponíveis</span></div>
<div class="products">${p.map(x=>`<div class="card product"><span class="tag">${x.category.toUpperCase()}</span><h3>${x.name}</h3><div class="price">${money(x.price_cents)}</div><div class="kv"><div><b>${x.duration_days} dias</b><span>Duração</span></div><div><b>${(x.daily_rate_bps/100).toFixed(2)}%</b><span>Taxa diária configurada</span></div><div><b>${money(x.price_cents + Math.floor(x.price_cents*x.daily_rate_bps/10000*x.duration_days))}</b><span>Retorno estimado</span></div><div><b>${x.max_participation}</b><span>Máx. participações</span></div></div><button class="primary" onclick="invest(${x.id})">Investir</button></div>`).join("")}</div>`}
async function renderTeam(){const d=await api("/team");const inviteLink=`${location.origin}/?ref=${encodeURIComponent(d.code)}`;$("#page-team").innerHTML=`
<div class="card"><h2>Equipa & Convites</h2><p class="muted2">Convide novos utilizadores através do seu código.</p><label>Código de convite<div class="copy"><input id="refCode" value="${d.code}" readonly><button class="outline" style="width:auto" onclick="copy('refCode')">Copiar</button></div></label><label>Link de convite<div class="copy"><input id="refLink" value="${inviteLink}" readonly><button class="outline" style="width:auto" onclick="copy('refLink')">Copiar</button></div></label></div>
<div class="grid"><div class="card"><h3>Nível 1</h3><div class="stat">30%</div><div class="muted2">comissão configurada</div></div><div class="card"><h3>Nível 2</h3><div class="stat">5%</div></div><div class="card"><h3>Nível 3</h3><div class="stat">1%</div></div><div class="card"><h3>Membros</h3><div class="stat">${d.members.length}</div></div></div>
<div class="section-title"><h2>Membros indicados</h2></div><div class="list">${d.members.length?d.members.map(m=>`<div class="row"><div><b>${m.name}</b><div class="muted2">${m.created_at}</div></div><span>Lv. ${m.level}</span></div>`).join(""):`<div class="card muted2">Ainda não há membros indicados.</div>`}</div>`}
async function renderTasks(){const d=await api("/tasks");$("#page-tasks").innerHTML=`<div class="section-title"><h2>Tarefas</h2></div><div class="list">${d.map(t=>`<div class="card"><h3>${t.title}</h3><p class="muted2">${t.description}</p><div style="display:flex;justify-content:space-between;align-items:center"><b class="positive">+ ${money(t.reward_cents)}</b>${t.completed?'<span class="muted2">Concluída ✓</span>':`<button class="outline" style="width:auto" onclick="completeTask(${t.id})">Concluir</button>`}</div></div>`).join("")}</div>`}
async function renderAccount(){const d=await api("/me");me=d;$("#page-account").innerHTML=`<div class="card"><h2>${d.user.name}</h2><div class="muted2">${d.user.phone} · ID ${d.user.id}</div><p><b>VIP ${d.user.vip_level}</b></p></div><div class="grid"><div class="card"><h3>Carteira disponível</h3><div class="stat">${money(d.wallet.available_cents)}</div></div><div class="card"><h3>Carteira investida</h3><div class="stat">${money(d.wallet.invested_cents)}</div></div></div><div class="section-title"><h2>Operações</h2></div><div class="grid"><button class="primary" onclick="deposit()">Depósito</button><button class="primary" onclick="withdraw()">Retirar</button></div><div class="section-title"><h2>Segurança</h2></div><div class="card"><div class="muted2">Use uma palavra-passe forte e não partilhe códigos de acesso. A plataforma nunca deve creditar saldo apenas com informação enviada pelo navegador.</div></div>`}
async function deposit(){const x=modal("Novo depósito",`<label>Valor (Kz)<input id="amount" type="number" min="1000" placeholder="1000"></label><button class="primary" id="send">Criar pedido</button>`);$("#send").onclick=async()=>{try{const r=await api("/deposits",{method:"POST",body:JSON.stringify({amount:Number($("#amount").value)})});x.remove();toast(r.message);renderHome()}catch(e){toast(e.message)}}}
async function withdraw(){const x=modal("Novo levantamento",`<label>Valor (Kz)<input id="amount" type="number" min="1000" placeholder="1000"></label><button class="primary" id="send">Enviar pedido</button>`);$("#send").onclick=async()=>{try{const r=await api("/withdrawals",{method:"POST",body:JSON.stringify({amount:Number($("#amount").value)})});x.remove();toast(r.message);renderHome()}catch(e){toast(e.message)}}}
async function invest(id){try{const r=await api("/investments",{method:"POST",body:JSON.stringify({productId:id})});toast(r.message);renderInvest()}catch(e){toast(e.message)}}
async function completeTask(id){try{const r=await api(`/tasks/${id}/complete`,{method:"POST"});toast(r.message);renderTasks()}catch(e){toast(e.message)}}
function copy(id){navigator.clipboard.writeText($("#"+id).value);toast("Copiado")}
$("#loginForm").onsubmit=async e=>{e.preventDefault();try{const r=await api("/auth/login",{method:"POST",body:JSON.stringify({phone:$("#loginPhone").value,password:$("#loginPassword").value})});token=r.token;localStorage.setItem("ng_token",token);boot()}catch(e){toast(e.message)}};
$("#registerForm").onsubmit=async e=>{e.preventDefault();try{const r=await api("/auth/register",{method:"POST",body:JSON.stringify({name:$("#regName").value,phone:$("#regPhone").value,email:$("#regEmail").value,password:$("#regPassword").value,...(activeReferralCode?{referralCode:activeReferralCode}:{})})});token=r.token;localStorage.setItem("ng_token",token);boot()}catch(e){toast(e.message)}};
$("#showRegister").onclick=()=>{$("#auth").classList.add("hidden");$("#register").classList.remove("hidden")};
$("#showLogin").onclick=()=>{$("#register").classList.add("hidden");$("#auth").classList.remove("hidden")};
$("#logout").onclick=()=>{localStorage.removeItem("ng_token");location.reload()};
document.querySelectorAll(".bottom button").forEach(b=>b.onclick=()=>go(b.dataset.page));
let activeReferralCode="";
async function setupReferral(){
  const raw=new URLSearchParams(location.search).get("ref");
  if(!raw) return;
  const code=raw.trim().toUpperCase();
  if(!/^[A-Z0-9]{8}$/.test(code)) return;
  try{
    const result=await api(`/referrals/validate?code=${encodeURIComponent(code)}`);
    if(result.valid){
      activeReferralCode=code;
      $("#regRef").value=code;
      $("#referralField").classList.remove("hidden");
    }
  }catch{}
}
$("#registerForm").addEventListener("reset",()=>{activeReferralCode="";$("#referralField").classList.add("hidden")});
setupReferral().finally(boot);

function setupPasswordToggles(){document.querySelectorAll(".password-toggle").forEach(btn=>{btn.addEventListener("click",()=>{const input=document.getElementById(btn.dataset.password);if(!input)return;const show=input.type==="password";input.type=show?"text":"password";btn.textContent=show?"🙈":"👁";btn.setAttribute("aria-label",show?"Ocultar palavra-passe":"Mostrar palavra-passe");btn.setAttribute("aria-pressed",String(show));});});}
setupPasswordToggles();
