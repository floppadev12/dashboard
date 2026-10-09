// Registers the /revenue slash command. Run once:
//   DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... npm run discord:register
const appId = process.env.DISCORD_APPLICATION_ID;
const token = process.env.DISCORD_BOT_TOKEN;
if (!appId || !token) {
  console.error("Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN first.");
  process.exit(1);
}
const commands = [{
  name: "revenue",
  description: "Show Robux revenue across your Roblox games",
  options: [{
    name: "period", description: "Which period to show", type: 4, required: false,
    choices: [{ name: "Yesterday", value: 1 }, { name: "Last 7 days", value: 7 }, { name: "Last 30 days", value: 30 }],
  }],
}];
const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
  method: "PUT",
  headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(commands),
});
console.log(res.ok ? "Registered /revenue." : `Failed: HTTP ${res.status} ${await res.text()}`);
