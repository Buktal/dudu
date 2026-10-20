// 2026-10-21: disposable Console → callback → Desk HTTP/WebSocket acceptance.
// Run only against a Server started with a dudu_review_console_* database.
// DUDU_CONSOLE_QA=true node docs/design/dudu-console/verify-live.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

assert.equal(process.env.DUDU_CONSOLE_QA, 'true', 'Explicit QA opt-in is required');
const origin = process.env.DUDU_CONSOLE_QA_ORIGIN ?? 'http://127.0.0.1:8080';
assert.equal(new URL(origin).hostname, '127.0.0.1', 'QA uses the local test Server');
const companyId = process.env.DUDU_CONSOLE_QA_COMPANY ?? '876520';
const password = 'console-qa-only-2026';
const callbackToken = 'console-qa-callback-only';
const sockets = [];

async function api(path, { method = 'GET', body, token, code = 0 } = {}) {
  const response = await fetch(`${origin}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200, `${method} ${path}: HTTP status`);
  const result = await response.json();
  assert.equal(result.code, code, `${method} ${path}: ${result.msg}`);
  return result;
}
const write = (path, body, token, method = 'POST', code = 0) => api(path, { method, body, token, code });
const consoleLogin = username => write('/console/login', { companyId, username, password });
const deskLogin = username => write('/desk/login', { companyId, username, password });

function deskSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${origin.replace('http:', 'ws:')}/ws/desk`);
    sockets.push(socket);
    const frames = [];
    const listeners = new Set();
    const timer = setTimeout(() => reject(new Error('Desk authentication timeout')), 10000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'auth', token })));
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Desk socket failed')); });
    socket.addEventListener('message', ({ data }) => {
      const frame = JSON.parse(String(data));
      frames.push(frame);
      for (const check of listeners) check();
      if (frame.type === 'ready') {
        clearTimeout(timer);
        resolve({
          frames,
          next(type, from = frames.length) {
            return new Promise((done, fail) => {
              const deadline = setTimeout(() => { listeners.delete(check); fail(new Error(`Missing Desk ${type}`)); }, 10000);
              function check() {
                const match = frames.slice(from).find(f => f.type === type);
                if (match) { clearTimeout(deadline); listeners.delete(check); done(match); }
              }
              listeners.add(check);
              check();
            });
          },
        });
      }
    });
  });
}

try {
  const platform = (await write('/admin/login', { username: 'Admin', password: 'admin' })).data.token;
  await write('/admin/companies', {
    companyId, companyName: 'Console真实联调评审企业',
    adminInit: { username: 'owner', name: '初始管理员', password },
  }, platform);
  const owner = (await consoleLogin('owner')).data.token;
  const employee = (await write('/console/employees', { username: 'agent', name: '联调员工', password }, owner)).data;
  const manager = (await write('/console/employees', { username: 'manager', name: '组管理员', password }, owner)).data;
  await write(`/console/employees/${manager.userId}/role`, { role: 'console' }, owner, 'PUT');
  const emptyManager = (await consoleLogin('manager')).data;
  assert.deepEqual(emptyManager.profile.managedGroupIds, []);
  assert.equal((await write('/console/user_groups/query', {}, emptyManager.token)).total, 0);
  const source = (await write('/console/user_groups', { groupName: '源组' }, owner)).data;
  const target = (await write('/console/user_groups', { groupName: '目标组' }, owner)).data;
  await write(`/console/user_groups/${source.groupId}/members/${employee.userId}`, undefined, owner, 'PUT');
  await write(`/console/user_groups/${source.groupId}/members/${manager.userId}`, undefined, owner, 'PUT');
  const scoped = (await consoleLogin('manager')).data.token;
  await write('/console/employees/query', {}, scoped, 'POST', 10106);
  const account = (await write('/console/company_channels', {
    groupId: source.groupId, channel: 'wechat-mp', accountName: '联调公众号', fields: { token: callbackToken },
  }, owner)).data;
  assert.equal(account.receiveConfigured, true);
  assert.equal(account.sendConfigured, false);
  assert.deepEqual(account.configuredSecretFields, ['token']);
  assert.equal(JSON.stringify(account).includes(callbackToken), false, 'Secret never reads back');
  const detailResponse = await fetch(`${origin}/api/console/company_channels/${account.companyChannelId}`, {
    headers: { Authorization: `Bearer ${owner}` },
  });
  assert.match(detailResponse.headers.get('cache-control') ?? '', /no-store/);
  await write(`/console/company_channels/${account.companyChannelId}`, {
    accountName: '联调公众号', credentialChanges: { set: {}, clear: ['token'] },
  }, owner, 'PUT', 12200);
  await write(`/console/company_channels/${account.companyChannelId}/group`, { groupId: target.groupId }, scoped, 'PUT', 12100);
  const deskToken = (await deskLogin('agent')).data.token;
  const socket = await deskSocket(deskToken);
  const timestamp = '1792512000';
  const nonce = 'console-qa';
  const signature = createHash('sha1').update([callbackToken, timestamp, nonce].sort().join('')).digest('hex');
  const callback = `${origin}/api/channels/${account.companyChannelId}/callback?timestamp=${timestamp}&nonce=${nonce}&signature=${signature}`;
  const incoming = socket.next('message');
  const response = await fetch(callback, {
    method: 'POST', headers: { 'Content-Type': 'application/xml' },
    body: '<xml><ToUserName>qa-account</ToUserName><FromUserName>qa-visitor</FromUserName><CreateTime>1792512000</CreateTime><MsgType>text</MsgType><Content>Console闭环测试来信</Content><MsgId>qa-live-1</MsgId></xml>',
  });
  assert.equal(response.status, 200);
  const message = await incoming;
  const before = (await write('/desk/visitors/query', {}, deskToken)).data;
  assert.equal(before.items.length, 1);
  const visitorId = before.items[0].id;
  const historyBefore = (await api(`/desk/visitors/${visitorId}/messages`, { token: deskToken })).data;
  const accessChanged = socket.next('access-changed');
  await write(`/console/company_channels/${account.companyChannelId}/group`, { groupId: target.groupId }, owner, 'PUT');
  await accessChanged;
  assert.equal((await api('/desk/profile', { token: deskToken })).data.access.accounts.length, 0);
  await api(`/desk/visitors/${visitorId}`, { token: deskToken, code: 10106 });
  await write(`/console/user_groups/${target.groupId}/members/${employee.userId}`, undefined, owner, 'PUT');
  const after = (await write('/desk/visitors/query', {}, deskToken)).data;
  assert.equal(after.items.length, 1);
  assert.equal(after.items[0].id, visitorId);
  const historyAfter = (await api(`/desk/visitors/${visitorId}/messages`, { token: deskToken })).data;
  assert.deepEqual(historyAfter, historyBefore, 'Moving preserves message identities and history');
  const disabled = socket.next('access-changed');
  await write(`/console/employees/${employee.userId}/status`, { status: 0 }, owner, 'PUT');
  await disabled;
  await api('/desk/profile', { token: deskToken, code: 10102 });
  await write(`/console/employees/${employee.userId}/status`, { status: 1 }, owner, 'PUT');
  await write('/console/profile/password', { oldPassword: 'wrong-password', newPassword: 'changed-qa-only' }, owner, 'PUT', 12310);
  await write('/console/logout', undefined, owner);
  assert.equal((await api('/console/profile', { token: owner })).data.user.username, 'owner', 'Stateless logout contract');
  console.log(JSON.stringify({ result: 'passed', companyId, sourceGroupId: source.groupId, targetGroupId: target.groupId, employeeId: employee.userId, accountId: account.companyChannelId, visitorId, messageType: message.type }, null, 2));
} finally {
  for (const socket of sockets) socket.close();
}
