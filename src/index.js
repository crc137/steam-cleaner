const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function cookies(env) {return {cookie: `sessionid=${env.SESSIONID}; steamLoginSecure=${env.STEAM_LOGIN_SECURE}`,sessionid: env.SESSIONID}}

async function scrapePages(env, baseUrl, regex) {
  const found = new Set();
  const c = cookies(env);
  for (let p = 1; p <= 200; p++) {
    const res = await fetch(`${baseUrl}?p=${p}`, {headers: { cookie: c.cookie, "user-agent": "Mozilla/5.0" }});
    if (!res.ok) break;
    const html = await res.text();
    const matches = [...html.matchAll(regex)];
    let added = 0;
    for (const m of matches) {if (!found.has(m[1])) { found.add(m[1]); added++; }}
    if (added === 0) break;
    await sleep(1000);
  }
  return [...found];
}

async function postForm(env, url, extra) {
  const c = cookies(env);
  const body = new URLSearchParams({ sessionid: c.sessionid, ...extra });
  return fetch(url, {method: "POST",headers: {cookie: c.cookie,"content-type": "application/x-www-form-urlencoded","user-agent": "Mozilla/5.0"},body: body.toString()});
}

async function run(env) {
  const dryRun = env.DRY_RUN === "1";
  const log = [];
  const c = cookies(env);
  const meRes = await fetch("https://steamcommunity.com/my", {headers: { cookie: c.cookie }, redirect: "follow"});
  const meUrl = meRes.url;
  log.push(`me: ${meUrl}`);
  const friends = await scrapePages(env,`${meUrl}/friends`,/profiles\/(\d{17})/g);
  log.push(`friends found: ${friends.length}`);
  const groups = await scrapePages(env,`${meUrl}/groups`,/steamcommunity\.com\/groups\/([A-Za-z0-9_-]+)/g);
  log.push(`groups found: ${groups.length}`);

  const removedFriends = [];
  const leftGroups = [];

  if (!dryRun) {
    for (const sid of friends) {
      const r = await postForm(env, "https://steamcommunity.com/actions/RemoveFriendAjax", { steamid: sid });
      if (r.ok) removedFriends.push(sid);
      log.push(`remove friend ${sid}: ${r.status}`);
      await sleep(1500);
    }
    for (const g of groups) {
      const r = await postForm(env, `https://steamcommunity.com/groups/${g}`, { action: "leaveGroup" });
      if (r.ok) leftGroups.push(g);
      log.push(`leave group ${g}: ${r.status}`);
      await sleep(1500);
    }
  }

  return {dryRun,friends: friends.length,groups: groups.length,removedFriends: removedFriends.length,leftGroups: leftGroups.length,log};
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/run") return new Response("steam-cleaner");
    if (request.headers.get("Authorization") !== `Bearer ${env.RUN_TOKEN}`) {return new Response("forbidden", { status: 403 })}
    const result = await run(env);
    return new Response(JSON.stringify(result, null, 2), {headers: { "content-type": "application/json" }});
  },
};
