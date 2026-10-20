// QA ONLY: disposable API fixture, never imported by the product or its build.
// node docs/design/dudu-console/browser-fixture.mjs
// Browse http://127.0.0.1:5181 with Vite already running on 127.0.0.1:5180.
import { createServer, request as proxyRequest } from 'node:http';

const stamp = '2026-10-20 12:00:00';
const employees = [
  { userId: '1', username: 'admin', name: '林知夏', role: 'console', status: 1, isInitialAdmin: true, groupIds: [], createTime: stamp, updateTime: stamp },
  { userId: '2', username: 'xiaoyu', name: '陈小雨', role: 'user', status: 1, isInitialAdmin: false, groupIds: ['101'], createTime: stamp, updateTime: stamp },
  { userId: '3', username: 'chenan', name: '周晨安', role: 'user', status: 1, isInitialAdmin: false, groupIds: ['102'], createTime: stamp, updateTime: stamp },
  { userId: '4', username: 'manager', name: '许清和', role: 'console', status: 1, isInitialAdmin: false, groupIds: ['101'], createTime: stamp, updateTime: stamp },
  { userId: '5', username: 'unassigned', name: '未分组管理员', role: 'console', status: 1, isInitialAdmin: false, groupIds: [], createTime: stamp, updateTime: stamp },
];
const groups = [
  { groupId: '101', groupName: '售前咨询', createTime: stamp, updateTime: stamp },
  { groupId: '102', groupName: '售后服务', createTime: stamp, updateTime: stamp },
];
const definitions = [
  ['wechat-mp', '微信公众号', ['token'], ['appId', 'appSecret'], ['token', 'appSecret'], ['appId']],
  ['wechat-mini', '微信小程序', ['token'], ['appId', 'appSecret'], ['token', 'appSecret', 'encodingAesKey'], ['appId']],
  ['wecom', '企业微信', ['corpId', 'token', 'encodingAesKey'], ['corpId', 'corpSecret', 'agentId'], ['token', 'encodingAesKey', 'corpSecret'], ['corpId', 'agentId']],
  ['qq', 'QQ机器人', ['appSecret'], ['appId', 'appSecret'], ['appSecret'], ['appId']],
  ['weibo', '微博', ['appSecret'], ['accessToken'], ['appSecret', 'accessToken'], []],
  ['feishu', '飞书', ['appId', 'verificationToken'], ['appId', 'appSecret'], ['verificationToken', 'encryptKey', 'appSecret'], ['appId']],
  ['alipay', '支付宝生活号', ['appId', 'appPrivateKey', 'alipayPublicKey'], ['appId', 'appPrivateKey', 'alipayPublicKey'], ['appPrivateKey'], ['appId']],
  ['douyin', '抖音', ['clientKey', 'clientSecret'], ['clientKey', 'clientSecret', 'refreshToken'], ['clientSecret', 'refreshToken'], ['clientKey']],
  ['xiaohongshu', '小红书', ['token', 'encodingAesKey', 'appId'], ['appId', 'appSecret'], ['token', 'encodingAesKey', 'appSecret'], ['appId']],
  ['dingtalk', '钉钉', ['token', 'encodingAesKey', 'ownerKey'], ['appKey', 'appSecret', 'agentId'], ['token', 'encodingAesKey', 'appSecret'], ['ownerKey', 'appKey', 'agentId']],
  ['meituan', '美团', ['app_id', 'app_secret'], ['app_id', 'app_secret'], ['app_secret'], ['app_id']],
  ['whatsapp', 'WhatsApp', ['appSecret', 'verifyToken'], ['accessToken', 'phoneNumberId'], ['appSecret', 'verifyToken', 'accessToken'], ['phoneNumberId']],
  ['telegram', 'Telegram', ['secretToken'], ['botToken'], ['secretToken', 'botToken'], []],
].map(([channel, name, receive, send, secret, immutable]) => ({
  channel, name, available: true, restriction: "",
  fields: [...new Set([...receive, ...send, ...secret])].map(key => ({
    key, label: key, secret: secret.includes(key), requiredForReceive: receive.includes(key),
    requiredForSend: send.includes(key), immutableOnceConfigured: immutable.includes(key),
    control: /PrivateKey|PublicKey/.test(key) ? 'textarea' : secret.includes(key) ? 'password' : 'text',
  })),
  notes: ['受控浏览器验收数据，不代表真实渠道已经接通。'],
}));
const accounts = [{ companyChannelId: '501', groupId: '101', channel: 'wechat-mp', accountName: '嘟嘟服务号', credentials: { appId: 'wx-fixture-only', token: 'fixture-only', appSecret: 'fixture-only' }, createTime: stamp, updateTime: stamp }];
let nextId = 600;
const ok = data => ({ code: 0, msg: '操作成功', data });
const fail = (code, msg) => ({ code, msg, data: null });
function page(list, query) {
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  const page = Math.min(Math.max(1, Math.ceil(list.length / pageSize)), Math.max(1, Number(query.page) || 1));
  return { code: 0, msg: '操作成功', list: list.slice((page - 1) * pageSize, page * pageSize), total: list.length, page, pageSize };
}
const publicEmployee = employee => ({ ...employee });
const publicGroup = group => ({ ...group, memberCount: employees.filter(e => e.groupIds.includes(group.groupId)).length, channelAccountCount: accounts.filter(a => a.groupId === group.groupId).length });
function accountView(account, detail = false) {
  const definition = definitions.find(d => d.channel === account.channel);
  const missing = kind => definition.fields.filter(f => f[kind] && !account.credentials[f.key]).map(f => f.key);
  const view = {
    companyChannelId: account.companyChannelId, groupId: account.groupId,
    groupName: groups.find(g => g.groupId === account.groupId)?.groupName ?? '', channel: account.channel,
    accountName: account.accountName, receiveConfigured: !missing('requiredForReceive').length,
    sendConfigured: !missing('requiredForSend').length, missingReceiveFields: missing('requiredForReceive'),
    missingSendFields: missing('requiredForSend'), createTime: account.createTime, updateTime: account.updateTime,
  };
  if (detail) Object.assign(view, {
    callbackUrl: `http://127.0.0.1:5181/api/channels/${account.companyChannelId}/callback`,
    fields: Object.fromEntries(definition.fields.filter(f => !f.secret && account.credentials[f.key]).map(f => [f.key, account.credentials[f.key]])),
    configuredSecretFields: definition.fields.filter(f => f.secret && account.credentials[f.key]).map(f => f.key), notes: definition.notes,
  });
  return view;
}
function dispatch(method, path, query, body, actor) {
  const initial = actor.isInitialAdmin;
  const visible = id => initial || actor.groupIds.includes(id);
  const parts = path.split('/').filter(Boolean);
  if (path === '/profile') return ok({ company: { companyId: '582713', companyName: '嘟嘟体验企业' }, user: { userId: actor.userId, username: actor.username, name: actor.name, role: actor.role, isInitialAdmin: initial }, managedGroupIds: initial ? groups.map(g => g.groupId) : actor.groupIds });
  if (path === '/logout') return ok(null);
  if (path === '/profile/password') return body.oldPassword === 'fixture-only' ? ok(null) : fail(12310, '原密码错误');
  if (path === '/channels') return ok({ channels: definitions });
  if (parts[0] === 'employees') {
    if (!initial) return fail(10106, '无访问权限');
    if (path === '/employees/query') return page(employees.filter(e => (!body.keyword || `${e.name}${e.username}`.includes(body.keyword)) && (body.status === undefined || e.status === body.status) && (!body.role || e.role === body.role)).map(publicEmployee), body);
    if (path === '/employees' && method === 'POST') {
      const employee = { userId: String(nextId++), username: body.username, name: body.name, role: 'user', status: 1, isInitialAdmin: false, groupIds: [], createTime: stamp, updateTime: stamp };
      if (employees.some(e => e.username.toLowerCase() === body.username.toLowerCase())) return fail(12300, '登录名已存在');
      employees.push(employee); return ok(publicEmployee(employee));
    }
    const employee = employees.find(e => e.userId === parts[1]);
    if (!employee) return fail(12100, '数据不存在');
    if (method === 'PUT') {
      if (parts[2] === 'password') return ok(null);
      if (parts[2] === 'role') employee.role = body.role;
      else if (parts[2] === 'status') employee.status = body.status;
      else employee.name = body.name;
    }
    return ok(publicEmployee(employee));
  }
  if (parts[0] === 'user_groups') {
    if (path === '/user_groups/query') return page(groups.filter(g => visible(g.groupId) && (!body.keyword || g.groupName.includes(body.keyword))).map(publicGroup), body);
    if (path === '/user_groups' && method === 'POST') {
      if (!initial) return fail(10106, '无访问权限');
      const group = { groupId: String(nextId++), groupName: body.groupName, createTime: stamp, updateTime: stamp };
      groups.push(group); return ok(publicGroup(group));
    }
    const group = groups.find(g => g.groupId === parts[1] && visible(g.groupId));
    if (!group) return fail(12100, '数据不存在');
    if (parts[2] === 'member_candidates') return page(employees.filter(e => e.status === 1 && !e.isInitialAdmin && !e.groupIds.includes(group.groupId) && (initial || e.role === 'user') && (!query.keyword || `${e.name}${e.username}`.includes(query.keyword))).map(e => ({ userId: e.userId, username: e.username, name: e.name, role: e.role })), query);
    if (parts[2] === 'members') {
      if (parts[3]) {
        const employee = employees.find(e => e.userId === parts[3]);
        if (!employee) return fail(12100, '数据不存在');
        if (!initial && employee.role !== 'user') return fail(10106, '无访问权限');
        employee.groupIds = employee.groupIds.filter(id => id !== group.groupId);
        if (method === 'PUT') employee.groupIds.push(group.groupId);
        return ok({ groupId: group.groupId, userId: employee.userId, member: method === 'PUT' });
      }
      return page(employees.filter(e => e.groupIds.includes(group.groupId)).map(e => ({ userId: e.userId, username: e.username, name: e.name, role: e.role, status: e.status })), query);
    }
    if (method === 'PUT') group.groupName = body.groupName;
    return ok(publicGroup(group));
  }
  if (parts[0] === 'company_channels') {
    if (path === '/company_channels/query') return page(accounts.filter(a => visible(a.groupId) && (!body.groupId || a.groupId === body.groupId) && (!body.channel || a.channel === body.channel) && (!body.keyword || a.accountName.includes(body.keyword))).map(a => accountView(a)), body);
    if (path === '/company_channels' && method === 'POST') {
      if (!visible(body.groupId)) return fail(10106, '无访问权限');
      const account = { companyChannelId: String(nextId++), groupId: body.groupId, accountName: body.accountName, channel: body.channel, credentials: { ...body.fields }, createTime: stamp, updateTime: stamp };
      accounts.push(account); return ok(accountView(account, true));
    }
    const account = accounts.find(a => a.companyChannelId === parts[1] && visible(a.groupId));
    if (!account) return fail(12100, '数据不存在');
    if (method === 'PUT' && parts[2] === 'group') {
      if (!visible(body.groupId)) return fail(10106, '无访问权限');
      account.groupId = body.groupId;
    } else if (method === 'PUT') {
      account.accountName = body.accountName;
      Object.assign(account.credentials, body.credentialChanges.set);
      for (const key of body.credentialChanges.clear) delete account.credentials[key];
    }
    return ok(accountView(account, true));
  }
  return fail(12100, '受控替身未提供此操作');
}
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:5181');
  if (!url.pathname.startsWith('/api/console')) {
    const upstream = proxyRequest({ hostname: '127.0.0.1', port: 5180, path: req.url, method: req.method, headers: req.headers }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
    upstream.on('error', () => { res.writeHead(502); res.end('Start the Console Vite dev server on 5180 first.'); });
    req.pipe(upstream); return;
  }
  let result;
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const path = url.pathname.slice('/api/console'.length);
    if (path === '/login') {
      const actor = employees.find(e => e.username === body.username && e.role === 'console');
      result = actor ? ok({ token: `fixture-${actor.userId}`, expiresAt: Math.floor(Date.now() / 1000) + 3600, profile: dispatch('GET', '/profile', {}, {}, actor).data }) : fail(10104, '账号或密码错误');
    } else {
      const id = (req.headers.authorization ?? '').replace('Bearer fixture-', '');
      const actor = employees.find(e => e.userId === id && e.role === 'console' && e.status === 1);
      result = actor ? dispatch(req.method, path, Object.fromEntries(url.searchParams), body, actor) : fail(10101, '请先登录');
    }
  } catch { result = fail(11000, '受控请求格式错误'); }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(result));
}).listen(5181, '127.0.0.1', () => console.log('QA fixture ONLY: http://127.0.0.1:5181 → Vite :5180. Login admin / manager / unassigned; disposable test data.'));
