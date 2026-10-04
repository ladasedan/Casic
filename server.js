import "dotenv/config";
import express from "express";
import Database from "better-sqlite3";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";
import { Telegraf, Markup } from "telegraf";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 8080);
const ADMIN_ID = String(process.env.ADMIN_ID || "8801927709");
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
const BOT_TOKEN = String(process.env.BOT_TOKEN || "").trim();

if (!BOT_TOKEN) console.warn("BOT_TOKEN is not set. Web app can still run, but Telegram bot endpoints are disabled.");

const dataDir = path.join(__dirname, "data");
import fs from "fs";
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "royalex.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id TEXT UNIQUE NOT NULL,
  username TEXT DEFAULT '',
  first_name TEXT DEFAULT '',
  tokens INTEGER NOT NULL DEFAULT 100,
  created_at INTEGER NOT NULL,
  last_daily INTEGER DEFAULT 0,
  blocked INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS stats (
  user_id INTEGER PRIMARY KEY,
  games INTEGER DEFAULT 0,
  wagered INTEGER DEFAULT 0,
  won INTEGER DEFAULT 0,
  lost INTEGER DEFAULT 0,
  biggest_win INTEGER DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  item_key TEXT NOT NULL,
  price INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
`);

const defaults = {
  dailyBonus: "15",
  minBet: "5",
  maxBet: "10000",
  rouletteGreenMultiplier: "14",
  rouletteRedBlackMultiplier: "2",
  slotsTripleMultiplier: "8",
  blackjackMultiplier: "2",
  coinflipMultiplier: "2",
  diceMultiplier: "5",
  crashTargetMultiplier: "2",
  plinkoMultiplier: "6"
};
for (const [k,v] of Object.entries(defaults)) {
  db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)").run(k,v);
}

function now(){ return Date.now(); }
function getSetting(k){ return db.prepare("SELECT value FROM settings WHERE key=?").get(k)?.value ?? defaults[k]; }
function intSetting(k){ return Number(getSetting(k)); }

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function sign(user){
  return jwt.sign({ uid:user.id, tg:user.tg_id }, JWT_SECRET, { expiresIn:"7d" });
}
function auth(req,res,next){
  try {
    const h=req.headers.authorization||"";
    const token=h.startsWith("Bearer ")?h.slice(7):"";
    const p=jwt.verify(token,JWT_SECRET);
    const u=db.prepare("SELECT * FROM users WHERE id=?").get(p.uid);
    if(!u) return res.status(401).json({error:"Unauthorized"});
    if(u.blocked) return res.status(403).json({error:"Account blocked"});
    req.user=u; next();
  } catch { res.status(401).json({error:"Unauthorized"}); }
}
function admin(req,res,next){
  if(String(req.user.tg_id)!==ADMIN_ID) return res.status(403).json({error:"Admin only"});
  next();
}
function ensureUser(tg){
  let u=db.prepare("SELECT * FROM users WHERE tg_id=?").get(String(tg.id));
  if(!u){
    const info=db.prepare("INSERT INTO users(tg_id,username,first_name,tokens,created_at,last_daily) VALUES(?,?,?,?,?,0)")
      .run(String(tg.id),tg.username||"",tg.first_name||"",100,now());
    const id=info.lastInsertRowid;
    db.prepare("INSERT INTO stats(user_id) VALUES(?)").run(id);
    db.prepare("INSERT INTO transactions(user_id,amount,reason,created_at) VALUES(?,?,?,?)")
      .run(id,100,"Registration bonus",now());
    u=db.prepare("SELECT * FROM users WHERE id=?").get(id);
  } else {
    db.prepare("UPDATE users SET username=?,first_name=? WHERE id=?").run(tg.username||"",tg.first_name||"",u.id);
    u=db.prepare("SELECT * FROM users WHERE id=?").get(u.id);
  }
  return u;
}
function safeUser(u){
  const s=db.prepare("SELECT * FROM stats WHERE user_id=?").get(u.id);
  return {
    id:u.id,tg_id:u.tg_id,username:u.username,first_name:u.first_name,tokens:u.tokens,
    created_at:u.created_at,last_daily:u.last_daily,blocked:!!u.blocked,stats:s
  };
}
function tx(userId, amount, reason){
  db.prepare("UPDATE users SET tokens=tokens+? WHERE id=?").run(amount,userId);
  db.prepare("INSERT INTO transactions(user_id,amount,reason,created_at) VALUES(?,?,?,?)")
    .run(userId,amount,reason,now());
}
function requireBet(bet){
  if(!Number.isInteger(bet)||bet< intSetting("minBet") || bet>intSetting("maxBet")) throw new Error("Invalid bet");
}
function debit(user, bet, game){
  requireBet(bet);
  const fresh=db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
  if(fresh.tokens<bet) throw new Error("Not enough tokens");
  tx(user.id,-bet,`${game}: bet`);
  db.prepare("UPDATE stats SET games=games+1,wagered=wagered+? WHERE user_id=?").run(bet,user.id);
}
function win(user, bet, payout, game){
  if(payout>0){
    tx(user.id,payout,`${game}: win`);
    db.prepare("UPDATE stats SET won=won+?,biggest_win=MAX(biggest_win,?) WHERE user_id=?").run(payout,payout,user.id);
  } else {
    db.prepare("UPDATE stats SET lost=lost+? WHERE user_id=?").run(bet,user.id);
  }
}
function result(user, bet, payout, extra={}){
  win(user,bet,payout,extra.game||"Game");
  const fresh=db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
  return {ok:true,payout, tokens:fresh.tokens, ...extra};
}

// Telegram WebApp initData verification
function validateInitData(initData){
  if(!initData || !BOT_TOKEN) return null;
  const params=new URLSearchParams(initData);
  const hash=params.get("hash");
  if(!hash) return null;
  params.delete("hash");
  const dataCheck=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");
  const secret=crypto.createHmac("sha256","WebAppData").update(BOT_TOKEN).digest();
  const calc=crypto.createHmac("sha256",secret).update(dataCheck).digest("hex");
  const a=Buffer.from(calc,"hex"), b=Buffer.from(hash,"hex");
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return null;
  const authDate=Number(params.get("auth_date")||0);
  if(!authDate || Math.floor(Date.now()/1000)-authDate>86400) return null;
  try {
    const user=JSON.parse(params.get("user"));
    if(!user?.id) return null;
    return user;
  } catch { return null; }
}

app.get("/api/health", (req,res)=>{
  res.json({
    ok:true,
    telegramBotTokenConfigured:!!BOT_TOKEN,
    webAppUrlConfigured:!!process.env.WEBAPP_URL,
    adminConfigured:!!process.env.ADMIN_ID
  });
});

app.post("/api/auth", (req,res)=>{
  const tg=validateInitData(req.body?.initData);
  if(!tg) return res.status(401).json({error: BOT_TOKEN ? "Invalid Telegram WebApp data. Check BOT_TOKEN and that the Mini App is opened from the bot." : "BOT_TOKEN is not configured on the server"});
  const u=ensureUser(tg);
  res.json({token:sign(u),user:safeUser(u)});
});

app.get("/api/me",auth,(req,res)=>res.json({user:safeUser(req.user)}));

app.post("/api/daily",auth,(req,res)=>{
  const u=db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  const day=24*60*60*1000;
  if(now()-u.last_daily<day) return res.status(400).json({error:"Daily bonus is not ready",remaining:day-(now()-u.last_daily)});
  const bonus=intSetting("dailyBonus");
  db.prepare("UPDATE users SET last_daily=? WHERE id=?").run(now(),u.id);
  tx(u.id,bonus,"Daily bonus");
  res.json({ok:true,bonus,tokens:db.prepare("SELECT tokens FROM users WHERE id=?").get(u.id).tokens});
});

const games = {};

games.coinflip=(u,bet,choice)=>{
  debit(u,bet,"Coin Flip");
  const winIt=Math.random()<0.5;
  const won=(choice==="heads"&&winIt)||(choice==="tails"&&!winIt);
  return result(u,bet,won?bet*2:0,{game:"Coin Flip",outcome:winIt?"heads":"tails"});
};
games.dice=(u,bet,choice)=>{
  debit(u,bet,"Dice");
  const roll=1+Math.floor(Math.random()*6);
  return result(u,bet,roll===Number(choice)?bet*intSetting("diceMultiplier"):0,{game:"Dice",roll});
};
games.roulette=(u,bet,choice)=>{
  debit(u,bet,"Roulette");
  const n=Math.floor(Math.random()*37);
  const color=n===0?"green":(n%2?"red":"black");
  let payout=0;
  if(choice==="red"||choice==="black") payout=color===choice?bet*intSetting("rouletteRedBlackMultiplier"):0;
  else if(choice==="green") payout=color==="green"?bet*intSetting("rouletteGreenMultiplier"):0;
  else if(Number(choice)===n) payout=bet*36;
  return result(u,bet,payout,{game:"Roulette",number:n,color});
};
games.slots=(u,bet)=>{
  debit(u,bet,"Slots");
  const symbols=["🍒","🍋","🍊","🍇","🔔","7️⃣"];
  const reels=[0,1,2].map(()=>symbols[Math.floor(Math.random()*symbols.length)]);
  let payout=0;
  if(reels.every(x=>x===reels[0])) payout=bet*intSetting("slotsTripleMultiplier");
  else if(new Set(reels).size===2) payout=bet;
  return result(u,bet,payout,{game:"Slots",reels});
};
games.blackjack=(u,bet)=>{
  debit(u,bet,"Blackjack");
  const draw=()=>1+Math.floor(Math.random()*10);
  const player=draw()+draw(), dealer=draw()+draw();
  let payout=0;
  if(player<=21 && (dealer>21 || player>dealer)) payout=bet*intSetting("blackjackMultiplier");
  return result(u,bet,payout,{game:"Blackjack",player,dealer});
};
games.hilo=(u,bet,guess)=>{
  debit(u,bet,"Hi-Lo");
  const a=1+Math.floor(Math.random()*13), b=1+Math.floor(Math.random()*13);
  const won=(guess==="higher"&&b>a)||(guess==="lower"&&b<a);
  return result(u,bet,won?Math.floor(bet*1.8):0,{game:"Hi-Lo",a,b});
};
games.baccarat=(u,bet,choice)=>{
  debit(u,bet,"Baccarat");
  const p=1+Math.floor(Math.random()*9), b=1+Math.floor(Math.random()*9);
  const winner=p===b?"tie":p>b?"player":"banker";
  let payout=winner===choice?(choice==="tie"?bet*8:bet*2):0;
  return result(u,bet,payout,{game:"Baccarat",player:p,banker:b,winner});
};
games.oddEven=(u,bet,choice)=>{
  debit(u,bet,"Odd/Even");
  const n=1+Math.floor(Math.random()*100);
  const won=(n%2===0)===(choice==="even");
  return result(u,bet,won?bet*2:0,{game:"Odd/Even",number:n});
};
games.lucky7=(u,bet)=>{
  debit(u,bet,"Lucky 7");
  const n=1+Math.floor(Math.random()*13);
  return result(u,bet,n===7?bet*5:0,{game:"Lucky 7",number:n});
};
games.plinko=(u,bet)=>{
  debit(u,bet,"Plinko");
  const mults=[0,0.5,1,1.5,2,3,6,3,2,1.5,1,0.5,0];
  const idx=Math.floor(Math.random()*mults.length);
  const payout=Math.floor(bet*mults[idx]);
  return result(u,bet,payout,{game:"Plinko",slot:idx,multiplier:mults[idx]});
};
games.crash=(u,bet)=>{
  debit(u,bet,"Crash");
  const r=Math.random();
  const multiplier=r<0.03?10:r<0.12?5:r<0.3?3:r<0.65?2:1;
  const target=Number(reqTargetSafe(u));
  const payout=multiplier>=target?Math.floor(bet*target):0;
  return result(u,bet,payout,{game:"Crash",multiplier,target});
};
function reqTargetSafe(){ return 2; }

app.post("/api/game/:game",auth,(req,res)=>{
  try{
    const fn=games[req.params.game];
    if(!fn) return res.status(404).json({error:"Unknown game"});
    const bet=Number(req.body?.bet);
    const args=[req.user,bet];
    if(req.params.game==="coinflip") args.push(req.body.choice);
    if(req.params.game==="dice") args.push(req.body.choice);
    if(req.params.game==="roulette") args.push(req.body.choice);
    if(req.params.game==="hilo") args.push(req.body.guess);
    if(req.params.game==="baccarat") args.push(req.body.choice);
    if(req.params.game==="oddEven") args.push(req.body.choice);
    const out=fn(...args);
    res.json(out);
  }catch(e){res.status(400).json({error:e.message||"Game error"});}
});

const SHOP=[
  {key:"double_10",name:"x2 на 10 минут",price:250,desc:"Внутриигровой бустер наград"},
  {key:"daily_plus",name:"+25 к следующему бонусу",price:180,desc:"Увеличивает следующий daily-бонус"},
  {key:"lucky_badge",name:"Lucky Badge",price:500,desc:"Редкий значок профиля"},
  {key:"vip_frame",name:"VIP Profile Frame",price:1000,desc:"Украшение профиля"}
];
app.get("/api/shop",auth,(req,res)=>res.json({items:SHOP}));
app.post("/api/shop/buy",auth,(req,res)=>{
  const item=SHOP.find(x=>x.key===req.body?.key);
  if(!item) return res.status(404).json({error:"Item not found"});
  const u=db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  if(u.tokens<item.price) return res.status(400).json({error:"Not enough tokens"});
  tx(u.id,-item.price,`Shop: ${item.name}`);
  db.prepare("INSERT INTO purchases(user_id,item_key,price,created_at) VALUES(?,?,?,?)").run(u.id,item.key,item.price,now());
  res.json({ok:true,tokens:db.prepare("SELECT tokens FROM users WHERE id=?").get(u.id).tokens,item});
});

app.get("/api/leaderboard",auth,(req,res)=>{
  const rows=db.prepare(`SELECT username,first_name,tokens FROM users WHERE blocked=0 ORDER BY tokens DESC LIMIT 20`).all();
  res.json({rows});
});

app.get("/api/settings",auth,(req,res)=>{
  res.json({minBet:intSetting("minBet"),maxBet:intSetting("maxBet"),dailyBonus:intSetting("dailyBonus")});
});

app.get("/api/admin/users",auth,admin,(req,res)=>{
  const q=String(req.query.q||"").trim();
  const rows=q?db.prepare(`SELECT * FROM users WHERE tg_id LIKE ? OR username LIKE ? OR first_name LIKE ? ORDER BY id DESC LIMIT 50`).all(`%${q}%`,`%${q}%`,`%${q}%`)
  :db.prepare(`SELECT * FROM users ORDER BY id DESC LIMIT 50`).all();
  res.json({rows:rows.map(safeUser)});
});
app.post("/api/admin/grant",auth,admin,(req,res)=>{
  const target=db.prepare("SELECT * FROM users WHERE id=? OR tg_id=?").get(req.body.id, String(req.body.id));
  const amount=Number(req.body.amount);
  if(!target||!Number.isInteger(amount)) return res.status(400).json({error:"Invalid"});
  tx(target.id,amount,"Admin adjustment");
  res.json({ok:true,user:safeUser(db.prepare("SELECT * FROM users WHERE id=?").get(target.id))});
});
app.post("/api/admin/settings",auth,admin,(req,res)=>{
  for(const [k,v] of Object.entries(req.body||{})){
    if(!(k in defaults)) continue;
    if(!Number.isFinite(Number(v))) continue;
    db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k,String(v));
  }
  res.json({ok:true});
});
app.post("/api/admin/block",auth,admin,(req,res)=>{
  const target=db.prepare("SELECT * FROM users WHERE id=?").get(Number(req.body.id));
  if(!target) return res.status(404).json({error:"Not found"});
  db.prepare("UPDATE users SET blocked=? WHERE id=?").run(req.body.blocked?1:0,target.id);
  res.json({ok:true});
});

app.use((req,res,next)=>{
  if(req.method==="GET" && !req.path.startsWith("/api/")){
    return res.sendFile(path.join(__dirname,"public","index.html"));
  }
  next();
});

let bot;
if(BOT_TOKEN){
  bot=new Telegraf(BOT_TOKEN);
  bot.start(async ctx=>{
    const url=process.env.WEBAPP_URL;
    const text="🎰 RoyaleX\\n\\nВиртуальная игровая площадка. Токены не имеют денежной стоимости и не выводятся в реальные деньги.";
    if(url) return ctx.reply(text,Markup.inlineKeyboard([[Markup.button.webApp("🎮 Открыть RoyaleX",url)]]));
    return ctx.reply(text);
  });
  bot.command("help",ctx=>ctx.reply("Открой Mini App через кнопку меню бота.\\n\\nВсе токены виртуальные."));
  bot.launch().catch(e=>console.error("Bot launch error:",e));
  process.once("SIGINT",()=>bot.stop("SIGINT"));
  process.once("SIGTERM",()=>bot.stop("SIGTERM"));
}

app.listen(PORT,()=>console.log(`RoyaleX server on :${PORT}`));
