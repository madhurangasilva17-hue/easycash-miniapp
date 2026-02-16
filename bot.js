const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const cors = require("cors");
const fs = require("fs");

const token = "8212401322:AAHU2OQOMofseSdKAVOTz_8cGOvMSU-nVoo";
const BOT_USERNAME = "easycashsrilanka_bot"; // @ නැතුව
const WEBAPP_URL = "https://delightful-marshmallow-185793.netlify.app";

const REF_BONUS = 150; // referral එකකට add වෙන amount

// ✅ IMPORTANT: Railway deploy එකට polling false (server up උනාම startPolling)
const bot = new TelegramBot(token, { polling: false });

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = "./users.json";

function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));
    }
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch (e) {
    return { users: {} };
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function ensureUser(db, userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      balance: 0,
      totalEarnings: 0,
      refBy: null,
      referrals: [],
      createdAt: Date.now(),
    };
  }
  return db.users[userId];
}

function referralLink(userId) {
  return `https://t.me/${BOT_USERNAME}?start=ref_${userId}`;
}

// ✅ /start + referral capture
bot.onText(/\/start(?:\s+(.+))?/, (msg, match) => {
  const userId = String(msg.from.id);
  const payload = match && match[1] ? match[1].trim() : "";

  const db = loadDB();
  const me = ensureUser(db, userId);

  // referral payload: ref_<referrerId>
  if (payload.startsWith("ref_")) {
    const referrerId = payload.replace("ref_", "").trim();

    const isSelf = referrerId === userId;
    const alreadyLinked = me.refBy !== null;

    if (!isSelf && !alreadyLinked) {
      const refUser = ensureUser(db, referrerId);

      // avoid duplicates
      if (!refUser.referrals.includes(userId)) {
        refUser.referrals.push(userId);

        // ✅ Bonus add to referrer
        refUser.totalEarnings += REF_BONUS;
        refUser.balance += REF_BONUS;

        // link new user -> referrer
        me.refBy = referrerId;

        saveDB(db);

        bot.sendMessage(
          msg.chat.id,
          `✅ Referral successful!\nReferrer ට +${REF_BONUS} LKR add කරා ✅`
        );
      }
    }
  }

  saveDB(db);

  // ✅ OPEN WebApp + invite link
  bot.sendMessage(msg.chat.id, "Dashboard open කරන්න 👇", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "OPEN", web_app: { url: WEBAPP_URL } }],
        [{ text: "📌 My Invite Link", url: referralLink(userId) }],
        [{ text: "👥 My Referrals", callback_data: "MY_REF" }],
      ],
    },
  });
});

// ✅ inline callback (My Referrals)
bot.on("callback_query", (q) => {
  const chatId = q.message?.chat?.id;
  const userId = String(q.from.id);

  const db = loadDB();
  const me = ensureUser(db, userId);
  saveDB(db);

  if (q.data === "MY_REF") {
    bot.sendMessage(
      chatId,
      `👥 Referrals: ${me.referrals.length}\n💰 Balance: ${me.balance} LKR\n🏦 Total Earnings: ${me.totalEarnings} LKR\n\n🔗 Link:\n${referralLink(userId)}`
    );
  }

  bot.answerCallbackQuery(q.id).catch(() => {});
});

// ✅ Health check (Railway network config help)
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

// ✅ API for WebApp
app.get("/api/user/:id", (req, res) => {
  const userId = String(req.params.id);
  const db = loadDB();
  const me = ensureUser(db, userId);
  saveDB(db);

  res.json({
    userId,
    balance: me.balance,
    totalEarnings: me.totalEarnings,
    referrals: me.referrals.length,
    refLink: referralLink(userId),
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("API running on port", PORT);

  // ✅ Start bot polling AFTER server is running
  bot.startPolling();
  console.log("Bot polling started ✅ (Referral + Earnings ON)...");
});
