const tg=window.Telegram?.WebApp;
tg?.ready(); tg?.expand();
let token=localStorage.getItem("rx_token"), me=null, page="home";
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(s){const x=$("#toast");x.textContent=s;x.style.display="block";clearTimeout(window.tt);window.tt=setTimeout(()=>x.style.display="none",2200)}
async function api(url,opt={}){
  opt.headers={...(opt.headers||{}),...(token?{Authorization:"Bearer "+token}:{}),"Content-Type":"application/json"};
  const r=await fetch(url,opt), d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.error||"Ошибка");
  return d;
}
async function auth(){
  if(!tg?.initData){ $("#content").innerHTML=`<div class="hero"><h1>Открой в Telegram</h1><p class="muted">Mini App должен быть открыт из Telegram.</p></div>`;return false;}
  try{
    if(!token){const d=await api("/api/auth",{method:"POST",body:JSON.stringify({initData:tg.initData})});token=d.token;localStorage.setItem("rx_token",token);}
    me=(await api("/api/me")).user; render(); return true;
  }catch(e){
    localStorage.removeItem("rx_token");token=null;
    let health="";
    try{const h=await fetch("/api/health").then(r=>r.json());health=`<p class="muted">Сервер: ${h.ok?"OK":"ERROR"} • BOT_TOKEN: ${h.telegramBotTokenConfigured?"настроен":"НЕ НАСТРОЕН"}</p>`}catch{}
    $("#content").innerHTML=`<div class="hero"><h1>Не удалось войти</h1><p>${esc(e.message)}</p>${health}<button class="primary" onclick="location.reload()">Повторить</button></div>`;
    return false;
  }
}
function setPage(p){page=p;render()}
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>setPage(b.dataset.page));
function render(){
  $("#balance").textContent=me.tokens.toLocaleString("ru-RU");
  $("#adminNav").hidden=String(me.tg_id)!=="8801927709";
  document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  const views={home:home,shop:shop,profile:profile,leaderboard:leaderboard,rules:rules,admin:admin};
  $("#content").innerHTML=views[page]?.()||home();
}
const gameDefs=[
 ["roulette","🎡 Рулетка","Красное, чёрное, зелёное или число"],
 ["slots","🎰 Слоты","Три одинаковых символа"],
 ["blackjack","🃏 21","Игра против дилера"],
 ["coinflip","🪙 Монетка","Орёл или решка"],
 ["dice","🎲 Кубик","Угадай число 1–6"],
 ["hilo","📈 Hi-Lo","Выше или ниже"],
 ["baccarat","♠️ Баккара","Игрок, банкир или ничья"],
 ["oddEven","🔢 Чёт/Нечёт","Угадай сторону"],
 ["lucky7","7️⃣ Lucky 7","Поймай семёрку"],
 ["plinko","🔴 Шары / Plinko","Шар падает по пирамидке"],
 ["crash","🚀 Crash","Угадай множитель 2x"],
 ["random","🎁 Random Room","Фиксированный виртуальный банк"]
];
function home(){
 return `<div class="hero"><h1>🎰 RoyaleX</h1><p class="muted">12 игр • единый баланс • только виртуальные токены</p><button class="primary" onclick="daily()">🎁 Забрать +15</button></div>
 <div class="grid">${gameDefs.map(g=>`<button class="game" onclick="openGame('${g[0]}')"><b>${g[1]}</b><span>${g[2]}</span></button>`).join("")}</div>`;
}
async function daily(){try{const d=await api("/api/daily",{method:"POST"});me.tokens=d.tokens;render();toast(`+${d.bonus} токенов`)}catch(e){toast(e.message)}}
function betInput(){return `<label>Ставка</label><input id="bet" type="number" min="5" step="1" value="10">`}
function openGame(g){
 const titles=Object.fromEntries(gameDefs.map(x=>[x[0],x[1]])); let controls="";
 if(g==="coinflip")controls=`<select id="choice"><option value="heads">Орёл</option><option value="tails">Решка</option></select>`;
 if(g==="dice")controls=`<select id="choice">${[1,2,3,4,5,6].map(x=>`<option>${x}</option>`).join("")}</select>`;
 if(g==="roulette")controls=`<div class="roulette">${["red","black","green","0","1","2","3","4","5","6","7","8","9","10","11","12"].map(x=>`<button class="${x}" onclick="rouletteChoice('${x}')">${x==="red"?"🔴":x==="black"?"⚫":x==="green"?"🟢":x}</button>`).join("")}</div>`;
 if(g==="hilo")controls=`<select id="guess"><option value="higher">Выше</option><option value="lower">Ниже</option></select>`;
 if(g==="baccarat")controls=`<select id="choice"><option value="player">Игрок</option><option value="banker">Банкир</option><option value="tie">Ничья</option></select>`;
 if(g==="oddEven")controls=`<select id="choice"><option value="even">Чёт</option><option value="odd">Нечёт</option></select>`;
 if(g==="random")return randomRoom();
 $("#content").innerHTML=`<button class="secondary" onclick="setPage('home')">← Игры</button><div class="card"><h2>${titles[g]}</h2>${betInput()}${controls}<button class="primary" onclick="play('${g}')">Играть</button><div id="gameResult"></div></div>`;
}
window.rouletteChoice=async c=>{ $("#bet")?.focus(); $("#choice")?.remove(); $("#gameResult").innerHTML=`<p class="muted">Выбрано: ${esc(c)}</p><button class="primary" onclick="play('roulette','${c}')">Крутить рулетку</button>`; };
async function play(g,forced){
 try{
  const bet=Number($("#bet").value); let body={bet};
  if(g==="coinflip"||g==="dice"||g==="baccarat"||g==="oddEven")body.choice=$("#choice").value;
  if(g==="hilo")body.guess=$("#guess").value;
  if(forced)body.choice=forced;
  const d=await api("/api/game/"+g,{method:"POST",body:JSON.stringify(body)});
  me.tokens=d.tokens;
  let text=d.payout>0?`<div class="result win">🎉 +${d.payout} токенов</div>`:`<div class="result lose">😢 Проигрыш</div>`;
  if(d.reels)text+=`<div class="slot">${d.reels.join(" ")}</div>`;
  if(d.outcome)text+=`<p>Выпало: ${d.outcome}</p>`;
  if(d.roll)text+=`<p>Выпало: ${d.roll}</p>`;
  if(d.number)text+=`<p>Число: ${d.number}</p>`;
  if(d.player!==undefined)text+=`<p>Ты: ${d.player} • Дилер: ${d.dealer}</p>`;
  if(d.a)text+=`<p>${d.a} → ${d.b}</p>`;
  if(d.winner)text+=`<p>Победитель: ${d.winner}</p>`;
  if(d.multiplier)text+=`<p>Множитель: ${d.multiplier}x</p>`;
  $("#gameResult").innerHTML=text;$("#balance").textContent=me.tokens.toLocaleString("ru-RU");
 }catch(e){toast(e.message)}
}
function randomRoom(){
 $("#content").innerHTML=`<button class="secondary" onclick="setPage('home')">← Игры</button><div class="card"><h2>🎁 Random Room #1</h2><p>Фиксированная ставка: <b>100 токенов</b>.</p><p class="muted">Демо-комната выбирает победителя из участников. Все токены виртуальные.</p><button class="primary" onclick="toast('Комнаты будут подключены к серверной очереди в следующем релизе')">Войти за 100</button></div>`;
}
function profile(){
 const s=me.stats||{};
 return `<div class="card"><h2>👤 ${esc(me.first_name||me.username||"Игрок")}</h2><p class="muted">@${esc(me.username||"без username")} • ID ${me.tg_id}</p><div class="stats">
 <div class="stat"><span>Баланс</span><b>🪙 ${me.tokens}</b></div><div class="stat"><span>Игр</span><b>${s.games||0}</b></div>
 <div class="stat"><span>Поставлено</span><b>${s.wagered||0}</b></div><div class="stat"><span>Выиграно</span><b>${s.won||0}</b></div>
 <div class="stat"><span>Проиграно</span><b>${s.lost||0}</b></div><div class="stat"><span>Лучший выигрыш</span><b>${s.biggest_win||0}</b></div></div>
 <p class="muted">Токены не имеют денежной стоимости и не могут быть выведены.</p></div>`;
}
async function shop(){
 const d=await api("/api/shop");$("#content").innerHTML=`<div class="hero"><h2>🛒 Магазин</h2><p class="muted">Покупай игровые украшения и виртуальные бустеры.</p></div>${d.items.map(i=>`<div class="card shopitem"><div><b>${esc(i.name)}</b><p class="muted">${esc(i.desc)}</p><b>🪙 ${i.price}</b></div><button onclick="buy('${i.key}')">Купить</button></div>`).join("")}`;
}
async function buy(k){try{const d=await api("/api/shop/buy",{method:"POST",body:JSON.stringify({key:k})});me.tokens=d.tokens;render();toast("Покупка оформлена")}catch(e){toast(e.message)}}
async function leaderboard(){
 const d=await api("/api/leaderboard");$("#content").innerHTML=`<div class="card"><h2>🏆 Топ игроков</h2>${d.rows.map((x,i)=>`<div class="leader"><span>${i+1}. ${esc(x.first_name||x.username||"Игрок")}</span><b>🪙 ${x.tokens}</b></div>`).join("")}</div>`;
}
function rules(){return `<div class="card"><h2>📜 Правила</h2><p>RoyaleX — развлекательная игра с виртуальными токенами.</p><ul><li>Токены не являются деньгами.</li><li>Токены нельзя вывести, продать или обменять на реальные деньги.</li><li>Не используйте последние деньги в реальной жизни ради подобных развлечений.</li><li>Запрещены попытки взлома, автоматизации, баг-абьюза и мошенничества.</li><li>За нарушение правил аккаунт может быть заблокирован без восстановления игровых бонусов.</li><li>Результаты игр генерируются сервером случайным образом.</li></ul></div>`}
async function admin(){
 if(String(me.tg_id)!=="8801927709")return `<div class="card"><h2>Нет доступа</h2></div>`;
 $("#content").innerHTML=`<div class="card"><h2>⚙️ Админ-панель</h2><input id="search" placeholder="ID / username / имя"><button class="primary" onclick="adminSearch()">Поиск</button><div id="adminUsers"></div></div>
 <div class="card"><h3>Настройки игр</h3><input id="minBet" type="number" placeholder="Мин. ставка"><input id="maxBet" type="number" placeholder="Макс. ставка"><button class="primary" onclick="saveSettings()">Сохранить</button></div>`;
 adminSearch();
}
async function adminSearch(){
 const q=encodeURIComponent($("#search")?.value||"");const d=await api("/api/admin/users?q="+q);
 $("#adminUsers").innerHTML=d.rows.map(u=>`<div class="card"><b>${esc(u.first_name||"")} @${esc(u.username||"")}</b><p>ID: ${u.tg_id} • 🪙 ${u.tokens}</p><input id="grant_${u.id}" type="number" placeholder="+/- токены"><button class="secondary" onclick="grant(${u.id})">Изменить баланс</button><button class="${u.blocked?"primary":"danger"}" onclick="block(${u.id},${!u.blocked})">${u.blocked?"Разблокировать":"Заблокировать"}</button></div>`).join("");
}
async function grant(id){try{const amount=Number($("#grant_"+id).value);await api("/api/admin/grant",{method:"POST",body:JSON.stringify({id,amount})});toast("Баланс изменён");adminSearch()}catch(e){toast(e.message)}}
async function block(id,b){try{await api("/api/admin/block",{method:"POST",body:JSON.stringify({id,blocked:b})});adminSearch()}catch(e){toast(e.message)}}
async function saveSettings(){try{await api("/api/admin/settings",{method:"POST",body:JSON.stringify({minBet:Number($("#minBet").value),maxBet:Number($("#maxBet").value)})});toast("Сохранено")}catch(e){toast(e.message)}}
auth();
