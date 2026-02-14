
const fs = require('fs');
const fg = require('api-dylux');
const axios = require('axios');
const yts = require("yt-search");
const { igdl } = require("btch-downloader");
const util = require('util');
const fetch = require('node-fetch');
const { exec } = require('child_process');
const path = require('path');
const chalk = require('chalk');
const { writeFile } = require('./library/utils');

// =============== COLORS ===============
const colors = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    white: "\x1b[37m",
    cyan: "\x1b[36m",
    yellow: "\x1b[33m",
    magenta: "\x1b[35m",
    bgGreen: "\x1b[42m",
};

// =============== HELPERS ===============
function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
}

function stylishReply(text) {
    return `\`\`\`\n${text}\n\`\`\``;
}

function checkFFmpeg() {
    return new Promise((resolve) => {
        exec("ffmpeg -version", (err) => resolve(!err));
    });
}

// ======= Dummy jidDecode for safety =======
function jidDecode(jid) {
    const [user, server] = jid.split(':');
    return { user, server };
}

// =============== MAIN FUNCTION ===============
module.exports = async function handleCommand(nato, m, command, isGroup, isAdmin, groupAdmins,isBotAdmins,groupMeta,config) {

    // ======= Safe JID decoding =======
    nato.decodeJid = (jid) => {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {};
            return decode.user && decode.server ? `${decode.user}@${decode.server}` : jid;
        } else return jid;
    };
    const from = nato.decodeJid(m.key.remoteJid);
    const sender = m.key.participant || m.key.remoteJid;
    const participant = nato.decodeJid(m.key.participant || from);
    const pushname = m.pushName || "Unknown User";
    const chatType = from.endsWith('@g.us') ? 'Group' : 'Private';
    const chatName = chatType === 'Group' ? (groupMeta?.subject || 'Unknown Group') : pushname;
// Safe owner check
const botNumber = nato.user.id.split(":")[0] + "@s.whatsapp.net";
const senderJid = m.key.participant || m.key.remoteJid;
const isOwner = senderJid === botNumber;
    const reply = (text) => nato.sendMessage(from, { text: stylishReply(text) }, { quoted: m });

    const ctx = m.message.extendedTextMessage?.contextInfo || {};
    const quoted = ctx.quotedMessage;
    const quotedSender = nato.decodeJid(ctx.participant || from);
    const mentioned = ctx.mentionedJid?.map(nato.decodeJid) || [];

    const body = m.message.conversation || m.message.extendedTextMessage?.text || '';
    const args = body.trim().split(/ +/).slice(1);
    const text = args.join(" ");

    const time = new Date().toLocaleTimeString();
    

console.log(
  chalk.bgHex('#8B4513').white.bold(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 INCOMING MESSAGE (${time})
👤 From: ${pushname} (${participant})
💬 Chat Type: ${chatType} - ${chatName}
🏷️ Command: ${command || "—"}
💭 Message: ${body || "—"}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
);


// --- 🚨 ANTILINK 2.0 AUTO CHECK ---
if (isGroup && global.antilink && global.antilink[from]?.enabled) {
    const linkPattern = /(https?:\/\/[^\s]+)/gi;
    const bodyText = body || '';

    if (linkPattern.test(bodyText)) {
        const settings = global.antilink[from];
        const groupMeta = await nato.groupMetadata(from);
        const groupAdmins = groupMeta.participants.filter(p => p.admin).map(p => p.id);
        const botNumber = nato.user.id.split(":")[0] + "@s.whatsapp.net";
        const isBotAdmin = groupAdmins.includes(botNumber);
        const isSenderAdmin = groupAdmins.includes(sender);

        if (!isSenderAdmin && isBotAdmin) {
            try {
                await nato.sendMessage(from, { delete: m.key });
                await nato.sendMessage(from, {
                    text: `🚫 *votre à été détecte et supprimer!*\nUser: @${sender.split('@')[0]}\nAction: ${settings.mode.toUpperCase()}`,
                    mentions: [sender],
                });

                if (settings.mode === "kick") {
                    await nato.groupParticipantsUpdate(from, [sender], "remove");
                }
            } catch (err) {
                console.error("Antilink Enforcement Error:", err);
            }
        }
    }
}

// --- 🚫 ANTI-TAG AUTO CHECK ---
if (isGroup && global.antitag && global.antitag[from]?.enabled) {
    const settings = global.antitag[from];
    const groupMeta = await nato.groupMetadata(from);
    const groupAdmins = groupMeta.participants.filter(p => p.admin).map(p => p.id);
    const botNumber = nato.user.id.split(":")[0] + "@s.whatsapp.net";
    const isBotAdmin = groupAdmins.includes(botNumber);
    const isSenderAdmin = groupAdmins.includes(m.sender);

    // Detect if message contains a mention
    const mentionedUsers = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    if (mentionedUsers.length > 0) {
        if (!isSenderAdmin && isBotAdmin) {
            try {
                // 🧹 Delete message
                await nato.sendMessage(from, { delete: m.key });

                // ⚠️ Notify group
                await nato.sendMessage(from, {
                    text: `🚫 *connard il est interdit de tagge autre personne dans ce groupe.!*\nUser:Action: ${settings.mode.toUpperCase()}`,
                    mentions: [m.sender],
                });

                // 🚷 If mode is "kick"
                if (settings.mode === "kick") {
                    await nato.groupParticipantsUpdate(from, [m.sender], "remove");
                }
            } catch (err) {
                console.error("Anti-Tag Enforcement Error:", err);
            }
        }
    }
}

// 🚫 AntiBadWord with Strike System
if (isGroup && global.antibadword?.[from]?.enabled) {
  const badwords = global.antibadword[from].words || [];
  const textMsg = (m.body || "").toLowerCase();
  const found = badwords.find(w => textMsg.includes(w));

  if (found) {
    const botNumber = nato.user.id.split(":")[0] + "@s.whatsapp.net";
    const groupMetadata = await nato.groupMetadata(from);
    const groupAdmins = groupMetadata.participants.filter(p => p.admin).map(p => p.id);
    const isBotAdmin = groupAdmins.includes(botNumber);
    const isSenderAdmin = groupAdmins.includes(m.sender);

    if (!isSenderAdmin) {
      if (isBotAdmin) {
        await nato.sendMessage(from, { delete: m.key });
      }

      global.antibadword[from].warnings[m.sender] =
        (global.antibadword[from].warnings[m.sender] || 0) + 1;

      const warns = global.antibadword[from].warnings[m.sender];
      const remaining = 3 - warns;

      if (warns < 3) {
        await nato.sendMessage(from, {
          text: `⚠️ @${m.sender.split('@')[0]}, bad word detected!\nWord: *${found}*\nWarning: *${warns}/3*\n${remaining} more and you'll be kicked!`,
          mentions: [m.sender],
        });
      } else {
        if (isBotAdmin) {
          await nato.sendMessage(from, {
            text: `🚫 @${m.sender.split('@')[0]} has been kicked for repeated bad words.`,
            mentions: [m.sender],
          });
          await nato.groupParticipantsUpdate(from, [m.sender], "remove");
          delete global.antibadword[from].warnings[m.sender];
        } else {
          await nato.sendMessage(from, {
            text: `🚨 @${m.sender.split('@')[0]} reached 3 warnings, but I need admin rights to kick!`,
            mentions: [m.sender],
          });
        }
      }
    }
  }
}

if (!nato.isPublic && !isOwner) {
    return; // ignore all messages from non-owner when in private mode
}
    try {
        switch (command) {
            // ================= PING =================
            case 'ping':
            case 'alive': {
                const start = Date.now();
                await reply("⏳ ᴘɪɴɢɪɴɢ...");
                const end = Date.now();
                const latency = end - start;
                await reply(`ᴘᴏɴɢ!
 ʟᴀᴛᴇɴᴄʏ: ${latency}ms
ᴜᴘᴛɪᴍᴇ: ${formatUptime(process.uptime())}
 ᴏᴡɴᴇʀ: ᴅᴇᴠ ᴍᴀᴛsᴜ`);
                break;
            }

            // ================= MENU =================
            case 'menu':
            case 'help': {
         await nato.sendMessage(m.chat, { react: { text: `🎅`, key: m.key } });
                const menuText = ` 

┏❐⌜ ᴀᴄᴛɪᴠᴇ ✅ ⌟❐
┃ ᚛ 💻ᴍ@ᴛsᴜ_ᴍᴅ ⚙️ ᚜
┗══════════════❐

🌹 𝗦𝗬𝗦𝗧𝗘𝗠 🌹
┃ ✦ 𝗽𝗶𝗻𝗴
┃ ✦ 𝗽𝘂𝗯𝗹𝗶𝗰
┃ ✦ 𝗽𝗿𝗶𝘃𝗮𝘁𝗲
┗━━━━━━━━━━━━❐

🤖 𝗔𝗡𝗔𝗟𝗬𝗦𝗜𝗦 🤖
┃ ✦ 𝘄𝗲𝗮𝘁𝗵𝗲𝗿
┃ ✦ 𝗰𝗵𝗲𝗰𝗸𝘁𝗶𝗺𝗲
┃ ✦ 𝗴𝗶𝘁𝗰𝗹𝗼𝗻𝗲
┃ ✦ 𝘀𝗮𝘃𝗲
┗━━━━━━━━━━━━❐

👾 𝗠𝗘𝗗𝗜𝗔 👾
┃ ✦ 𝘁𝗶𝗸𝘁𝗼𝗸
┃ ✦ 𝗽𝗹𝗮𝘆
┃ ✦ 𝗶𝗴𝗱𝗹
┃ ✦ 𝗳𝗯
┃ ✦ 𝘃𝗶𝗱𝗲𝗼
┃ ✦ 𝗽𝗹𝗮𝘆𝗱𝗼𝗰
┗━━━━━━━━━━━━❐

🌀 𝗚𝗥𝗢𝗨𝗣 🌀
┃ ✦ 𝗮𝗱𝗱
┃ ✦ 𝗸𝗶𝗰𝗸
┃ ✦ 𝗽𝗿𝗼𝗺𝗼𝘁𝗲
┃ ✦ 𝗱𝗲𝗺𝗼𝘁𝗲
┃ ✦ 𝗮𝗻𝘁𝗶𝗹𝗶𝗻𝗸
┃ ✦ 𝗮𝗻𝘁𝗶𝘁𝗮𝗴
┃ ✦ 𝗮𝗻𝘁𝗶𝗽𝗿𝗼𝗺𝗼𝘁𝗲
┃ ✦ 𝗮𝗻𝘁𝗶𝗱𝗲𝗺𝗼𝘁𝗲
┃ ✦ 𝗮𝗻𝘁𝗶𝗯𝗮𝗱𝘄𝗼𝗿𝗱
┃ ✦ 𝘁𝗮𝗴𝗮𝗹𝗹
┃ ✦ 𝗵𝗶𝗱𝗲𝘁𝗮𝗴
┃ ✦ 𝗰𝗿𝗲𝗮𝘁𝗲𝗴𝗿𝗼𝘂𝗽
┃ ✦ 𝗹𝗲𝗳𝘁
┃ ✦ 𝗺𝘂𝘁𝗲
┃ ✦ 𝘂𝗻𝗺𝘂𝘁𝗲
┃ ✦ 𝘀𝗲𝘁𝗱𝗲𝘀𝗰
┗━━━━━━━━━━━━❐

🎭 𝗖𝗢𝗡𝗩𝗘𝗥𝗧 🎭
┃ ✦ 𝘁𝗼𝗮𝘂𝗱𝗶𝗼
┃ ✦ 𝘁𝗼𝗶𝗺𝗮𝗴𝗲
┗━━━━━━━━━━━━❐

🪇 𝗪𝗔𝗜𝗙𝗨 𝗠𝗘𝗡𝗨 🪇
┃ ✦ 𝘄𝗮𝗶𝗳𝘂
┗━━━━━━━━━━━━❐

> 🦚 ᴅᴇᴠ ᴍ@ᴛsᴜ 🧃
`;
                const videoPath = './media/menu.mp4';
                try {
                    await nato.sendMessage(from, {
                        video: { url: videoPath },
                        caption: stylishReply(menuText),
                        gifPlayback: true
                    }, { quoted: m });
                } catch (err) {
                    console.error('Menu video failed:', err);
                    await reply(menuText);
                }
                await nato.sendMessage(m.chat, {
    audio: { url: 'https://files.catbox.moe/14w29j.mpeg' },
    mimetype: 'audio/mpeg'
  }, { quoted: m })
}
break;
            

            // ================= WEATHER =================
            case 'weather': {
                try {
                    if (!text) return reply("🌍 𝐏𝐥𝐞𝐚𝐬𝐞 𝐩𝐫𝐨𝐯𝐢𝐝𝐞 𝐚 𝐜𝐢𝐭𝐲 𝐨𝐫 𝐭𝐨𝐰𝐧 𝐧𝐚𝐦𝐞!");
                    const response = await fetch(`http://api.openweathermap.org/data/2.5/weather?q=${text}&units=metric&appid=1ad47ec6172f19dfaf89eb3307f74785`);
                    const data = await response.json();
                    if (data.cod !== 200) return reply("❌ 𝐔𝐧𝐚𝐛𝐥𝐞 𝐭𝐨 𝐟𝐢𝐧𝐝 𝐭𝐡𝐚𝐭 𝐥𝐨𝐜𝐚𝐭𝐢𝐨𝐧. 𝐩𝐥𝐞𝐚𝐬𝐞 𝐜𝐡𝐞𝐜𝐤 𝐭𝐡𝐞 𝐬𝐩𝐞𝐥𝐥𝐢𝐧𝐠.");

                    const weatherText = `
🌤️ *𝐰𝐞𝐚𝐭𝐡𝐞𝐫 𝐫𝐞𝐩𝐨𝐫𝐭 𝐟𝐨𝐫 ${data.name}*
🌡️ 𝐭𝐞𝐦𝐩𝐞𝐫𝐚𝐭𝐮𝐫𝐞: ${data.main.temp}°C
🌬️ 𝐟𝐞𝐞𝐥𝐬 𝐥𝐢𝐤𝐞: ${data.main.feels_like}°C
🌧️ 𝐫𝐚𝐢𝐧 𝐯𝐨𝐥𝐮𝐦𝐞: ${data.rain?.['1h'] || 0} mm
☁️ 𝐜𝐥𝐨𝐮𝐝𝐢𝐧𝐞𝐬𝐬: ${data.clouds.all}%
💧 𝐡𝐮𝐦𝐢𝐝𝐢𝐭𝐲: ${data.main.humidity}%
🌪️ 𝐰𝐢𝐧𝐝 𝐬𝐩𝐞𝐞𝐝: ${data.wind.speed} m/s
📝 𝐜𝐨𝐧𝐝𝐢𝐭𝐢𝐨𝐧: ${data.weather[0].description}
🌄 𝐬𝐮𝐧𝐫𝐢𝐬𝐞: ${new Date(data.sys.sunrise*1000).toLocaleTimeString()}
🌅 𝐬𝐮𝐧𝐬𝐞𝐭: ${new Date(data.sys.sunset*1000).toLocaleTimeString()}
`;
                    await reply(weatherText);
                } catch (e) {
                    console.error("𝐰𝐞𝐚𝐭𝐡𝐞𝐫 𝐜𝐨𝐦𝐦𝐚𝐧𝐝 𝐞𝐫𝐫𝐨𝐫:", e);
                    reply("❌ 𝐮𝐧𝐚𝐛𝐥𝐞 𝐭𝐨 𝐫𝐞𝐭𝐫𝐢𝐞𝐯𝐞 𝐰𝐞𝐚𝐭𝐡𝐞𝐫 𝐢𝐧𝐟𝐨𝐫𝐦𝐚𝐭𝐢𝐨𝐧.");
                }
                break;
            }

            // ================= CHECKTIME =================
            case 'checktime':
            case 'time': {
                try {
                    if (!text) return reply("🌍 𝐩𝐥𝐞𝐚𝐬𝐞 𝐩𝐫𝐨𝐯𝐢𝐝𝐞 𝐚 𝐜𝐢𝐭𝐲 𝐨𝐫 𝐜𝐨𝐮𝐧𝐭𝐫𝐲 𝐧𝐚𝐦𝐞 𝐭𝐨 𝐜𝐡𝐞𝐜𝐤 𝐭𝐡𝐞 𝐥𝐨𝐜𝐚𝐥 𝐭𝐢𝐦𝐞.");
                    await reply(`⏳𝐜𝐡𝐞𝐜𝐤𝐢𝐧𝐠 𝐥𝐨𝐜𝐚𝐥 𝐭𝐢𝐦𝐞 𝐟𝐨𝐫 *${text}*...`);
                    const tzRes = await fetch(`https://worldtimeapi.org/api/timezone`);
                    const timezones = await tzRes.json();
                    const match = timezones.find(tz => tz.toLowerCase().includes(text.toLowerCase()));
                    if (!match) return reply(`❌ 𝐜𝐨𝐮𝐥𝐝 𝐧𝐨𝐭 𝐟𝐢𝐧𝐝 𝐭𝐢𝐦𝐞𝐳𝐨𝐧𝐞 𝐟𝐨𝐫 *${text}*.`);
                    const res = await fetch(`https://worldtimeapi.org/api/timezone/${match}`);
                    const data = await res.json();
                    const datetime = new Date(data.datetime);
                    const hours = datetime.getHours();
                    const greeting = hours < 00 ? "🌅 𝐛𝐨𝐧𝐣𝐨𝐮𝐫".,
 hours < 12 ? "🌞 𝐛𝐨𝐧𝐧𝐞 𝐚𝐩𝐫𝐞𝐬 𝐦𝐢𝐝𝐢"., hours< 16 ?"🌙 𝐛𝐨𝐧𝐬𝐨𝐢𝐫";
                    const timeText = `
🕒 𝐥𝐨𝐜𝐚𝐥 𝐭𝐢𝐦𝐞 𝐢𝐧 ${text}
${greeting} 👋
📍 𝐭𝐢𝐦𝐞𝐳𝐨𝐧𝐞: ${data.timezone}
⏰ 𝐭𝐢𝐦𝐞: ${datetime.toLocaleTimeString()}
📆 𝐝𝐚𝐭𝐞: ${datetime.toDateString()}
⏱️ 𝐮𝐩𝐭𝐦𝐞: ${formatUptime(process.uptime())}`;
                    await reply(timeText);
                } catch (e) {
                    console.error("𝐜𝐡𝐞𝐜𝐤𝐭𝐢𝐦𝐞 𝐞𝐫𝐫𝐨𝐫:", e);
                    reply("❌ 𝐮𝐧𝐚𝐛𝐥𝐞 𝐭𝐨 𝐟𝐞𝐭𝐜𝐡 𝐭𝐢𝐦𝐞 𝐟𝐨𝐫 𝐭𝐡𝐚𝐭 𝐜𝐢𝐭𝐲.");
                }
                break;
            }

            // ================= GITCLONE =================
            case 'gitclone': {
                try {
                    if (!args[0]) return reply("❌ Provide a GitHub repo link.");
                    if (!args[0].includes('github.com')) return reply("❌ Not a valid GitHub link!");
                    const regex = /(?:https|git)(?::\/\/|@)github\.com[\/:]([^\/:]+)\/(.+)/i;
                    let [, user, repo] = args[0].match(regex) || [];
                    repo = repo.replace(/.git$/, '');
                    const zipUrl = `https://api.github.com/repos/${user}/${repo}/zipball`;
                    const head = await fetch(zipUrl, { method: 'HEAD' });
                    const contentDisp = head.headers.get('content-disposition');
                    const filenameMatch = contentDisp?.match(/attachment; filename=(.*)/);
                    const filename = filenameMatch ? filenameMatch[1] : `${repo}.zip`;
                    await trashcore.sendMessage(from, { document: { url: zipUrl }, fileName: filename, mimetype: 'application/zip' }, { quoted: m });
                    await reply(`✅ Successfully fetched repository: *${user}/${repo}*`);
                } catch (err) {
                    console.error("gitclone error:", err);
                    await reply("❌ Failed to clone repository.");
                }
                break;
            }


            // ================= SAVE STATUS =================
            case 'save': {
                try {
                    if (!quoted) return reply("❌ Reply to a status message!");
                    const mediaBuffer = await trashcore.downloadMediaMessage(quoted);
                    if (!mediaBuffer) return reply("🚫 Could not download media. It may have expired.");
                    let payload;
                    if (quoted.imageMessage) payload = { image: mediaBuffer, caption: quoted.imageMessage.caption || "📸 𝐬𝐚𝐯𝐞𝐝 𝐬𝐭𝐚𝐭𝐮𝐬 𝐢𝐦𝐚𝐠𝐞", mimetype: "image/jpeg" };
                    else if (quoted.videoMessage) payload = { video: mediaBuffer, caption: quoted.videoMessage.caption || "🎥 𝐬𝐚𝐯𝐞𝐝 𝐬𝐭𝐚𝐭𝐮𝐬 𝐯𝐢𝐝𝐞𝐨", mimetype: "video/mp4" };
                    else return reply("❌ Only image/video statuses are supported!");
                    await nato.sendMessage(m.sender, payload, { quoted: m });
                    await reply("✅ 𝐬𝐭𝐚𝐭𝐮𝐬 𝐬𝐚𝐯𝐞𝐝!");
                } catch (err) {
                    console.error("Save error:", err);
                    reply("❌ Failed to save status.");
                }
                break;
            }

            // ================= IG/FB DL =================
            case 'fb':
            case 'facebook':
            case 'fbdl':
            case 'ig':
            case 'instagram':
            case 'igdl': {
                if (!args[0]) return reply(`🔗 Provide a Facebook or Instagram link!\n\nExample: ${command} <link>`);
                try {
                    const axios = require('axios');
                    const cheerio = require('cheerio');

                    const progressMsg = await trashcore.sendMessage(from, { text: stylishReply("⏳ 𝐅𝐞𝐭𝐜𝐡𝐢𝐧𝐠 𝐦𝐞𝐝𝐢𝐚...𝐩𝐥𝐞𝐚𝐬𝐞 𝐰𝐚𝐢𝐭...!") }, { quoted: m });

                    async function fetchMedia(url) {
                        try {
                            const form = new URLSearchParams();
                            form.append("q", url);
                            form.append("vt", "home");

                            const { data } = await axios.post('https://yt5s.io/api/ajaxSearch', form, {
                                headers: {
                                    "Accept": "application/json",
                                    "X-Requested-With": "XMLHttpRequest",
                                    "Content-Type": "application/x-www-form-urlencoded",
                                },
                            });

                            if (data.status !== "ok") throw new Error("Provide a valid link.");
                            const $ = cheerio.load(data.data);

                            if (/^(https?:\/\/)?(www\.)?(facebook\.com|fb\.watch)\/.+/i.test(url)) {
                                const thumb = $('img').attr("src");
                                let links = [];
                                $('table tbody tr').each((_, el) => {
                                    const quality = $(el).find('.video-quality').text().trim();
                                    const link = $(el).find('a.download-link-fb').attr("href");
                                    if (quality && link) links.push({ quality, link });
                                });
                                if (links.length > 0) return { platform: "facebook", type: "video", thumb, media: links[0].link };
                                if (thumb) return { platform: "facebook", type: "image", media: thumb };
                                throw new Error("Media is invalid.");
                            } else if (/^(https?:\/\/)?(www\.)?(instagram\.com\/(p|reel)\/).+/i.test(url)) {
                                const video = $('a[title="Download Video"]').attr("href");
                                const image = $('img').attr("src");
                                if (video) return { platform: "instagram", type: "video", media: video };
                                if (image) return { platform: "instagram", type: "image", media: image };
                                throw new Error("Media invalid.");
                            } else {
                                throw new Error("Provide a valid URL or link.");
                            }
                        } catch (err) {
                            return { error: err.message };
                        }
                    }

                    const res = await fetchMedia(args[0]);
                    if (res.error) {
                        await nato.sendMessage(from, { react: { text: "❌", key: m.key } });
                        return reply(`⚠️ Error: ${res.error}`);
                    }

                    await nato.sendMessage(from, { text: stylishReply("⏳ 𝐦𝐞𝐝𝐢𝐚 𝐟𝐨𝐮𝐧𝐝! 𝐝𝐨𝐰𝐧𝐥𝐨𝐚𝐝𝐢𝐧𝐠...") }, { quoted: m });

                    if (res.type === "video") {
                        await nato.sendMessage(from, { video: { url: res.media }, caption: stylishReply(`✅ Downloaded video from ${res.platform}!`) }, { quoted: m });
                    } else if (res.type === "image") {
                        await nato.sendMessage(from, { image: { url: res.media }, caption: stylishReply(`✅ Downloaded photo from ${res.platform}!`) }, { quoted: m });
                    }

                    await nato.sendMessage(from, { text: stylishReply("✅ Done!") 