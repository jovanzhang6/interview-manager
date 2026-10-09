import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import type { Server } from 'http';

// ===== 环境准备：必须在动态 import 服务端模块之前设置 =====
// database.ts 在模块加载时读取 DATA_DIR 求值数据库路径，auth.ts 在模块加载时读取 JWT_SECRET
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'im-api-test-'));
process.env.DATA_DIR = dataDir;
process.env.JWT_SECRET = 'test-secret-for-vitest';
process.env.NODE_ENV = 'test';

const { initDatabase, closeDatabase, getDatabase } = await import('../server/database');
const authRoutes = (await import('../server/auth')).default;
const interviewRoutes = (await import('../server/routes')).default;

let server: Server | undefined;
let baseURL = '';

// ===== 测试工具 =====
async function registerAndLogin(username: string, password = 'password123'): Promise<string> {
  const res = await fetch(`${baseURL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (res.status === 409) {
    const login = await fetch(`${baseURL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return ((await login.json()) as any).token;
  }
  return ((await res.json()) as any).token;
}

function auth(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

function validStages() {
  return ['投递', '测评', '笔试', '简历评估', '一面', '二面', '三面', 'HR面', 'Offer评估', '正式offer']
    .map((name, i) => ({ name, status: i === 0 ? 'current' : 'pending' }));
}

async function createInterview(token: string, company: string, position: string, url?: string) {
  const res = await fetch(`${baseURL}/api/interviews`, {
    method: 'POST',
    headers: auth(token),
    body: JSON.stringify({ company, position, url })
  });
  expect(res.status).toBe(201);
  return (await res.json()) as any;
}

beforeAll(async () => {
  await initDatabase();

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/interviews', interviewRoutes);

  await new Promise<void>(resolve => {
    server = app.listen(0, () => resolve());
  });
  baseURL = `http://127.0.0.1:${(server!.address() as any).port}`;
});

afterAll(async () => {
  server?.close();
  closeDatabase();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// ===== 认证 =====
describe('认证接口', () => {
  it('注册成功返回 201 与 token', async () => {
    const res = await fetch(`${baseURL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'password123' })
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.user.username).toBe('alice');
    expect(body.user.role).toBe('user');
  });

  it('重复注册返回 409', async () => {
    const res = await fetch(`${baseURL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'password123' })
    });
    expect(res.status).toBe(409);
  });

  it('无 token 访问面试接口返回 401', async () => {
    const res = await fetch(`${baseURL}/api/interviews`);
    expect(res.status).toBe(401);
  });

  it('用户被删除后其 token 立即失效（幽灵 token 防护）', async () => {
    const bobToken = await registerAndLogin('bob');
    expect(bobToken).toBeTruthy();

    // admin 登录并删除 bob
    const adminLogin = await fetch(`${baseURL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const adminToken = ((await adminLogin.json()) as any).token;
    const users = ((await (await fetch(`${baseURL}/api/auth/users`, { headers: auth(adminToken) })).json()) as any).users;
    const bobId = users.find((u: any) => u.username === 'bob').id;
    const del = await fetch(`${baseURL}/api/auth/users/${bobId}`, {
      method: 'DELETE',
      headers: auth(adminToken)
    });
    expect(del.status).toBe(200);

    // bob 的旧 token 应立即失效
    const res = await fetch(`${baseURL}/api/interviews`, { headers: auth(bobToken) });
    expect(res.status).toBe(401);
  });
});

// ===== 面试记录 CRUD 与阶段流转 =====
describe('面试记录 CRUD', () => {
  let token = '';

  beforeAll(async () => {
    token = await registerAndLogin('carol');
  });

  it('创建记录：投递自动通过、测评进行中，url 持久化', async () => {
    const item = await createInterview(token, '腾讯', 'pcg qq', 'https://careers.tencent.com/1');
    expect(item.id).toBeTruthy();
    expect(item.stages[0].status).toBe('pass');
    expect(item.stages[1].status).toBe('current');
    expect(item.stages[2].status).toBe('pending');
    expect(item.stages).toHaveLength(10);
    expect(item.url).toBe('https://careers.tencent.com/1');
  });

  it('列表返回已创建的记录', async () => {
    const list = (await (await fetch(`${baseURL}/api/interviews`, { headers: auth(token) })).json()) as any[];
    expect(list).toHaveLength(1);
    expect(list[0].company).toBe('腾讯');
  });

  it('编辑记录：改职位、清空 url', async () => {
    const list = (await (await fetch(`${baseURL}/api/interviews`, { headers: auth(token) })).json()) as any[];
    const res = await fetch(`${baseURL}/api/interviews/${list[0].id}`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify({ company: '腾讯', position: '微信前端', url: '' })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.position).toBe('微信前端');
    expect(body.url).toBeUndefined();
  });

  it('阶段流转 pass：当前阶段通过、下一阶段变 current，响应包含 url（回归：不丢失链接字段）', async () => {
    const list = (await (await fetch(`${baseURL}/api/interviews`, { headers: auth(token) })).json()) as any[];

    // 先恢复 url 再流转，验证响应携带 url
    await fetch(`${baseURL}/api/interviews/${list[0].id}`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify({ company: '腾讯', position: '微信前端', url: 'https://careers.tencent.com/1' })
    });

    // 创建后投递已自动通过，当前阶段为测评（索引 1）
    const res = await fetch(`${baseURL}/api/interviews/${list[0].id}/stage`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify({ stageIndex: 1, status: 'pass' })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stages[1].status).toBe('pass');
    expect(body.stages[2].status).toBe('current');
    expect(body.url).toBe('https://careers.tencent.com/1');
    expect(body.lastVisitedAt).toBeUndefined();
  });

  it('已通过的历史阶段不允许操作，返回校验错误', async () => {
    const list = (await (await fetch(`${baseURL}/api/interviews`, { headers: auth(token) })).json()) as any[];
    const res = await fetch(`${baseURL}/api/interviews/${list[0].id}/stage`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify({ stageIndex: 0, status: 'pass' })
    });
    expect(res.status).toBe(400);
  });

  it('非法状态值与非法阶段索引返回 400', async () => {
    const list = (await (await fetch(`${baseURL}/api/interviews`, { headers: auth(token) })).json()) as any[];
    const id = list[0].id;

    const bad1 = await fetch(`${baseURL}/api/interviews/${id}/stage`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify({ stageIndex: 1, status: 'hack' })
    });
    expect(bad1.status).toBe(400);

    const bad2 = await fetch(`${baseURL}/api/interviews/${id}/stage`, {
      method: 'PATCH',
      headers: auth(token),
      body: JSON.stringify({ stageIndex: 99, status: 'pass' })
    });
    expect(bad2.status).toBe(400);
  });

  it('删除记录', async () => {
    const item = await createInterview(token, '临时公司', '临时职位');
    const res = await fetch(`${baseURL}/api/interviews/${item.id}`, {
      method: 'DELETE',
      headers: auth(token)
    });
    expect(res.status).toBe(200);
    const list = (await (await fetch(`${baseURL}/api/interviews`, { headers: auth(token) })).json()) as any[];
    expect(list.find((i: any) => i.id === item.id)).toBeUndefined();
  });
});

// ===== 用户数据隔离 =====
describe('用户数据隔离', () => {
  it('用户无法查看或操作他人的记录', async () => {
    const tokenA = await registerAndLogin('dave');
    const tokenB = await registerAndLogin('eve');
    const item = await createInterview(tokenA, '保密公司', '保密职位');

    const listB = (await (await fetch(`${baseURL}/api/interviews`, { headers: auth(tokenB) })).json()) as any[];
    expect(listB.find((i: any) => i.id === item.id)).toBeUndefined();

    const patch = await fetch(`${baseURL}/api/interviews/${item.id}/stage`, {
      method: 'PATCH',
      headers: auth(tokenB),
      body: JSON.stringify({ stageIndex: 0, status: 'pass' })
    });
    expect(patch.status).toBe(404);
  });
});

// ===== visit-company：公司维度批量访问标记（新接口） =====
describe('visit-company 批量访问标记', () => {
  let token = '';

  beforeAll(async () => {
    token = await registerAndLogin('frank');
    await createInterview(token, '腾讯', 'pcg qq', 'https://t.com/pcg');
    await createInterview(token, '腾讯', '微信事业群', 'https://t.com/wx');
    await createInterview(token, '阿里', '后端', 'https://a.com/be');
  });

  it('访问一次公司，该公司全部岗位记录同步更新访问时间，其他公司不受影响', async () => {
    const res = await fetch(`${baseURL}/api/interviews/visit-company`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ company: '腾讯' })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(2);
    expect(body.lastVisitedAt).toBeTruthy();

    const list = (await (await fetch(`${baseURL}/api/interviews`, { headers: auth(token) })).json()) as any[];
    const tx = list.filter((i: any) => i.company === '腾讯');
    expect(new Set(tx.map((i: any) => i.lastVisitedAt))).toEqual(new Set([body.lastVisitedAt]));
    const ali = list.find((i: any) => i.company === '阿里');
    expect(ali.lastVisitedAt).toBeUndefined();
  });

  it('公司名含首尾空格时按 trim 后匹配', async () => {
    const res = await fetch(`${baseURL}/api/interviews/visit-company`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ company: ' 腾讯 ' })
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).updated).toBe(2);
  });

  it('不存在的公司返回 404', async () => {
    const res = await fetch(`${baseURL}/api/interviews/visit-company`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ company: '不存在公司' })
    });
    expect(res.status).toBe(404);
  });

  it('空公司名返回 400', async () => {
    const res = await fetch(`${baseURL}/api/interviews/visit-company`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ company: '   ' })
    });
    expect(res.status).toBe(400);
  });
});

// ===== pin-company：公司维度置顶（新接口） =====
describe('pin-company 公司置顶', () => {
  let token = '';

  beforeAll(async () => {
    token = await registerAndLogin('henry');
    await createInterview(token, '置顶公司', '岗位a', 'https://p.com/a');
    await createInterview(token, '置顶公司', '岗位b');
    await createInterview(token, '普通公司', '岗位c');
  });

  it('置顶后该公司全部岗位记录 pinned=true，其他公司不受影响', async () => {
    const res = await fetch(`${baseURL}/api/interviews/pin-company`, {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify({ company: '置顶公司', pinned: true })
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).updated).toBe(2);

    const list = (await (await fetch(`${baseURL}/api/interviews`, { headers: auth(token) })).json()) as any[];
    const pinnedItems = list.filter((i: any) => i.company === '置顶公司');
    expect(pinnedItems.every((i: any) => i.pinned === true)).toBe(true);
    expect(list.find((i: any) => i.company === '普通公司').pinned).toBe(false);
  });

  it('取消置顶后 pinned=false', async () => {
    const res = await fetch(`${baseURL}/api/interviews/pin-company`, {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify({ company: '置顶公司', pinned: false })
    });
    expect(res.status).toBe(200);
    const list = (await (await fetch(`${baseURL}/api/interviews`, { headers: auth(token) })).json()) as any[];
    expect(list.filter((i: any) => i.company === '置顶公司').every((i: any) => i.pinned === false)).toBe(true);
  });

  it('不存在的公司返回 404，非法 pinned 参数返回 400', async () => {
    const res404 = await fetch(`${baseURL}/api/interviews/pin-company`, {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify({ company: '不存在', pinned: true })
    });
    expect(res404.status).toBe(404);

    const res400 = await fetch(`${baseURL}/api/interviews/pin-company`, {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify({ company: '置顶公司', pinned: 'yes' })
    });
    expect(res400.status).toBe(400);
  });

  it('导出接口包含 pinned 字段', async () => {
    await fetch(`${baseURL}/api/interviews/pin-company`, {
      method: 'PUT',
      headers: auth(token),
      body: JSON.stringify({ company: '置顶公司', pinned: true })
    });
    const data = (await (await fetch(`${baseURL}/api/interviews/export`, { headers: auth(token) })).json()) as any[];
    expect(data.find((i: any) => i.company === '置顶公司').pinned).toBe(true);
    expect(data.find((i: any) => i.company === '普通公司').pinned).toBe(false);
  });

  it('导入带 pinned 字段的数据可持久化（旧格式无该字段默认 false）', async () => {
    const res = await fetch(`${baseURL}/api/interviews/import`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({
        mode: 'overwrite',
        data: [
          { company: '导入置顶', position: 'x', stages: validStages(), pinned: true },
          { company: '导入普通', position: 'y', stages: validStages() }
        ]
      })
    });
    expect(res.status).toBe(200);
    const list = (await (await fetch(`${baseURL}/api/interviews`, { headers: auth(token) })).json()) as any[];
    expect(list.find((i: any) => i.company === '导入置顶').pinned).toBe(true);
    expect(list.find((i: any) => i.company === '导入普通').pinned).toBe(false);
  });
});

// ===== 管理员接口（统计/角色）与改密码 =====
describe('管理员接口与改密码', () => {
  it('admin/stats 返回全平台统计（回归：SQL 双引号字符串曾致 500）', async () => {
    const adminToken = await registerAndLogin('admin', 'admin123');
    const res = await fetch(`${baseURL}/api/interviews/admin/stats`, { headers: auth(adminToken) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats.totalUsers).toBeGreaterThanOrEqual(1);
    expect(typeof body.stats.totalInterviews).toBe('number');
    expect(typeof body.stats.recentUsers).toBe('number');
  });

  it('普通用户访问 admin 接口返回 403', async () => {
    const userToken = await registerAndLogin('iris');
    const res = await fetch(`${baseURL}/api/interviews/admin/stats`, { headers: auth(userToken) });
    expect(res.status).toBe(403);
  });

  it('修改角色与修改密码接口可用（回归：SQL 双引号字符串曾致 500）', async () => {
    const adminToken = await registerAndLogin('admin', 'admin123');
    const jackToken = await registerAndLogin('jack');
    const users = ((await (await fetch(`${baseURL}/api/auth/users`, { headers: auth(adminToken) })).json()) as any).users;
    const jackId = users.find((u: any) => u.username === 'jack').id;

    const roleRes = await fetch(`${baseURL}/api/auth/users/${jackId}/role`, {
      method: 'PUT',
      headers: auth(adminToken),
      body: JSON.stringify({ role: 'admin' })
    });
    expect(roleRes.status).toBe(200);

    const pwdRes = await fetch(`${baseURL}/api/auth/password`, {
      method: 'PUT',
      headers: auth(jackToken),
      body: JSON.stringify({ oldPassword: 'password123', newPassword: 'newpass456' })
    });
    expect(pwdRes.status).toBe(200);
  });
});

// ===== 导入/导出 =====
describe('数据导入', () => {
  let token = '';

  beforeAll(async () => {
    token = await registerAndLogin('grace');
  });

  function importItem(id?: string, status?: string) {
    return {
      ...(id ? { id } : {}),
      company: '导入公司',
      position: '导入职位',
      stages: validStages(),
      ...(status ? { status } : {})
    };
  }

  it('合并模式：同 id 记录跳过不覆盖，新记录导入', async () => {
    const existing = await createInterview(token, '已有公司', '已有职位');
    const res = await fetch(`${baseURL}/api/interviews/import`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({
        mode: 'merge',
        data: [
          importItem(existing.id),
          importItem()
        ]
      })
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).count).toBe(1);

    const list = (await (await fetch(`${baseURL}/api/interviews`, { headers: auth(token) })).json()) as any[];
    expect(list).toHaveLength(2);
    // 同 id 记录未被覆盖：公司名保持"已有公司"
    expect(list.find((i: any) => i.id === existing.id).company).toBe('已有公司');
  });

  it('覆盖模式：清空原有数据后导入', async () => {
    const res = await fetch(`${baseURL}/api/interviews/import`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ mode: 'overwrite', data: [importItem()] })
    });
    expect(res.status).toBe(200);
    const list = (await (await fetch(`${baseURL}/api/interviews`, { headers: auth(token) })).json()) as any[];
    expect(list).toHaveLength(1);
  });

  it('非法数据返回 400：非数组、空流程、非法阶段状态、非法记录状态', async () => {
    const cases = [
      { data: 'not-array' },
      { data: [{ company: 'x', position: 'y', stages: [] }] },
      { data: [{ company: 'x', position: 'y', stages: validStages().map(s => ({ ...s, status: 'hack' })) }] },
      { data: [importItem(undefined, 'hack')] }
    ];
    for (const body of cases) {
      const res = await fetch(`${baseURL}/api/interviews/import`, {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify(body)
      });
      expect(res.status).toBe(400);
    }
  });
});

describe('自定义面试流程', () => {
  let token = '';

  beforeAll(async () => {
    token = await registerAndLogin('custom_timeline');
  });

  async function createCustom(stages: unknown, position = '自定义岗位') {
    return fetch(`${baseURL}/api/interviews`, {
      method: 'POST',
      headers: auth(token),
      body: JSON.stringify({ company: '独立流程公司', position, stages })
    });
  }

  async function setStage(id: string, stageIndex: number, status: string) {
    return fetch(`${baseURL}/api/interviews/${id}/stage`, {
      method: 'PATCH', headers: auth(token), body: JSON.stringify({ stageIndex, status })
    });
  }

  it('同公司不同岗位保存各自流程，后续新增仍使用默认十阶段', async () => {
    const definitions = [
      { name: ' 提交申请 ', type: 'application', status: 'pending' },
      { name: '专业能力交流', type: 'interview', status: 'pass' },
      { name: '正式录用', type: 'offer', status: 'pass' }
    ];
    const custom = await createCustom(definitions);
    expect(custom.status).toBe(201);
    const item = (await custom.json()) as any;
    expect(item.stages.map((stage: any) => stage.name)).toEqual(['提交申请', '专业能力交流', '正式录用']);
    expect(item.stages.map((stage: any) => stage.status)).toEqual(['pass', 'current', 'pending']);
    const defaultItem = await createInterview(token, '独立流程公司', '默认流程岗位');
    expect(defaultItem.stages).toHaveLength(10);
    const list = (await (await fetch(`${baseURL}/api/interviews`, { headers: auth(token) })).json()) as any[];
    expect(list.find(record => record.id === item.id).stages).toEqual(item.stages);
    expect(list.find(record => record.id === defaultItem.id).stages).toHaveLength(10);
  });

  it('删除投递阶段后从第一阶段开始，单阶段通过后不再生成当前阶段', async () => {
    const response = await createCustom([{ name: '技术交流', type: 'interview' }]);
    expect(response.status).toBe(201);
    const item = (await response.json()) as any;
    expect(item.stages[0].status).toBe('current');
    const passed = await fetch(`${baseURL}/api/interviews/${item.id}/stage`, {
      method: 'PATCH', headers: auth(token), body: JSON.stringify({ stageIndex: 0, status: 'pass' })
    });
    expect(passed.status).toBe(200);
    expect(((await passed.json()) as any).stages).toEqual([{ id: item.stages[0].id, name: '技术交流', type: 'interview', status: 'pass' }]);
  });

  it('超过十阶段的流程可以按配置顺序通过或跳过，直至完成', async () => {
    const definitions = Array.from({ length: 12 }, (_, index) => ({ name: `交流${index + 1}`, type: 'interview' }));
    const response = await createCustom(definitions);
    expect(response.status).toBe(201);
    const item = (await response.json()) as any;
    for (let index = 0; index < definitions.length; index++) {
      const status = index % 2 === 0 ? 'pass' : 'skip';
      const updated = await fetch(`${baseURL}/api/interviews/${item.id}/stage`, {
        method: 'PATCH', headers: auth(token), body: JSON.stringify({ stageIndex: index, status })
      });
      expect(updated.status).toBe(200);
      const body = (await updated.json()) as any;
      expect(body.stages[index].status).toBe(status);
      if (index + 1 < definitions.length) expect(body.stages[index + 1].status).toBe('current');
      else expect(body.stages.some((stage: any) => stage.status === 'current')).toBe(false);
    }
  });

  it('失败或拒绝后流程终结，不自动推进下一阶段', async () => {
    for (const status of ['fail', 'rejected']) {
      const item = (await (await createCustom([
        { name: '技术面谈', type: 'interview' }, { name: '人事面谈', type: 'interview' }
      ])).json()) as any;
      const response = await fetch(`${baseURL}/api/interviews/${item.id}/stage`, {
        method: 'PATCH', headers: auth(token), body: JSON.stringify({ stageIndex: 0, status })
      });
      expect(response.status).toBe(200);
      expect(((await response.json()) as any).stages.map((stage: any) => stage.status)).toEqual([status, 'pending']);
    }
  });

  it('未通过或已拒绝可以更正为通过或跳过，并接续下一阶段', async () => {
    for (const stoppedStatus of ['fail', 'rejected']) {
      for (const correctedStatus of ['pass', 'skip']) {
        const item = (await (await createCustom([
          { name: '提交申请', type: 'application' },
          { name: '技术面谈', type: 'interview' },
          { name: '录用通知', type: 'offer' }
        ])).json()) as any;
        expect((await setStage(item.id, 1, stoppedStatus)).status).toBe(200);
        const response = await setStage(item.id, 1, correctedStatus);
        expect(response.status).toBe(200);
        const corrected = (await response.json()) as any;
        expect(corrected.stages.map((stage: any) => stage.status)).toEqual(['pass', correctedStatus, 'current']);
        expect(corrected.stages.map((stage: any) => stage.id)).toEqual(item.stages.map((stage: any) => stage.id));
        expect(corrected.createdAt).toBe(item.createdAt);
        const list = (await (await fetch(`${baseURL}/api/interviews`, { headers: auth(token) })).json()) as any[];
        expect(list.find(record => record.id === item.id).stages).toEqual(corrected.stages);
      }
    }
  });

  it('未通过和已拒绝可以反复更改或恢复进行中，再继续正常流转', async () => {
    for (const stoppedStatus of ['fail', 'rejected']) {
      const item = (await (await createCustom([
        { name: '技术面谈', type: 'interview' }, { name: '人事面谈', type: 'interview' }
      ])).json()) as any;
      for (const status of [stoppedStatus, 'fail', 'rejected', stoppedStatus]) {
        const stopped = await setStage(item.id, 0, status);
        expect(stopped.status).toBe(200);
        expect(((await stopped.json()) as any).stages.map((stage: any) => stage.status)).toEqual([status, 'pending']);
      }
      // 后续阶段仍须按流程接续，不能在恢复前直接操作。
      expect((await setStage(item.id, 1, 'pass')).status).toBe(400);
      expect((await setStage(item.id, 0, 'pending')).status).toBe(400);
      const resumed = await setStage(item.id, 0, 'current');
      expect(resumed.status).toBe(200);
      expect(((await resumed.json()) as any).stages.map((stage: any) => stage.status)).toEqual(['current', 'pending']);
      const passed = await setStage(item.id, 0, 'pass');
      expect(passed.status).toBe(200);
      expect(((await passed.json()) as any).stages.map((stage: any) => stage.status)).toEqual(['pass', 'current']);
    }
  });

  it('最后一个阶段更正后可以恢复进行中或完成，不生成额外阶段', async () => {
    for (const stoppedStatus of ['fail', 'rejected']) {
      for (const correctedStatus of ['current', 'pass', 'skip']) {
        const item = (await (await createCustom([{ name: '最终面谈', type: 'interview' }])).json()) as any;
        expect((await setStage(item.id, 0, stoppedStatus)).status).toBe(200);
        const response = await setStage(item.id, 0, correctedStatus);
        expect(response.status).toBe(200);
        expect(((await response.json()) as any).stages.map((stage: any) => stage.status)).toEqual([correctedStatus]);
        if (correctedStatus !== 'current') {
          expect((await setStage(item.id, 0, 'fail')).status).toBe(400);
        }
      }
    }
  });

  it('按实际流程长度拒绝越界和非整数索引，拒绝回写待进行状态', async () => {
    const item = (await (await createCustom([{ name: '面试', type: 'interview' }])).json()) as any;
    for (const stageIndex of [-1, 1, 9, 1.5, '0', null]) {
      const response = await fetch(`${baseURL}/api/interviews/${item.id}/stage`, {
        method: 'PATCH', headers: auth(token), body: JSON.stringify({ stageIndex, status: 'pass' })
      });
      expect(response.status).toBe(400);
    }
    for (const status of ['pending', 'current']) {
      const response = await fetch(`${baseURL}/api/interviews/${item.id}/stage`, {
        method: 'PATCH', headers: auth(token), body: JSON.stringify({ stageIndex: 0, status })
      });
      expect(response.status).toBe(400);
    }
  });

  it('空流程、非法名称与类别返回校验错误，三十阶段可以创建', async () => {
    const invalid = [
      [], null, '流程', [null], [{}], [{ name: '  ' }],
      [{ name: '名'.repeat(31) }], [{ name: '面试', type: 'invalid' }],
      Array.from({ length: 31 }, () => ({ name: '面试', type: 'interview' }))
    ];
    for (const stages of invalid) expect((await createCustom(stages)).status).toBe(400);
    expect((await createCustom(Array.from({ length: 30 }, () => ({ name: '面试', type: 'interview' })))).status).toBe(201);
  });

  it('自定义流程导出再导入保留名称、类别、顺序和进度', async () => {
    const item = (await (await createCustom([
      { name: '技术交流', type: 'interview' }, { name: '意向书', type: 'offer' }, { name: '入职材料', type: 'other' }
    ])).json()) as any;
    await fetch(`${baseURL}/api/interviews/${item.id}/stage`, {
      method: 'PATCH', headers: auth(token), body: JSON.stringify({ stageIndex: 0, status: 'pass' })
    });
    const exported = (await (await fetch(`${baseURL}/api/interviews/export`, { headers: auth(token) })).json()) as any[];
    const saved = exported.find(record => record.id === item.id);
    await fetch(`${baseURL}/api/interviews/${item.id}`, { method: 'DELETE', headers: auth(token) });
    const imported = await fetch(`${baseURL}/api/interviews/import`, {
      method: 'POST', headers: auth(token), body: JSON.stringify({ data: [saved] })
    });
    expect(imported.status).toBe(200);
    expect(((await imported.json()) as any).count).toBe(1);
    const list = (await (await fetch(`${baseURL}/api/interviews`, { headers: auth(token) })).json()) as any[];
    expect(list.find(record => record.id === item.id).stages).toEqual(saved.stages);
  });

  it('旧格式的九阶段和十阶段导入均可读取，旧类别自动兼容', async () => {
    const response = await fetch(`${baseURL}/api/interviews/import`, {
      method: 'POST', headers: auth(token), body: JSON.stringify({ data: [
        { company: '兼容公司', position: '九阶段', stages: validStages().slice(0, 9) },
        { company: '兼容公司', position: '十阶段', stages: validStages() }
      ] })
    });
    expect(response.status).toBe(200);
    const list = (await (await fetch(`${baseURL}/api/interviews`, { headers: auth(token) })).json()) as any[];
    expect(list.find(record => record.position === '九阶段').stages).toHaveLength(9);
    expect(list.find(record => record.position === '十阶段').stages[9].type).toBe('offer');
  });
});

describe('已创建面试记录的流程编辑', () => {
  let token = '';
  const definitions = [
    { name: '投递', type: 'application' }, { name: '技术交流', type: 'interview' },
    { name: '人事交流', type: 'interview' }, { name: '录用通知', type: 'offer' }
  ];

  beforeAll(async () => {
    token = await registerAndLogin('edit_timeline');
  });

  async function newRecord(stages = definitions) {
    const response = await fetch(`${baseURL}/api/interviews`, {
      method: 'POST', headers: auth(token), body: JSON.stringify({ company: '编辑测试公司', position: '测试岗位', url: 'https://example.com/jobs', stages })
    });
    expect(response.status).toBe(201);
    return (await response.json()) as any;
  }

  async function save(item: any, stages: any[]) {
    return fetch(`${baseURL}/api/interviews/${item.id}`, {
      method: 'PATCH', headers: auth(token), body: JSON.stringify({ company: item.company, position: item.position, url: item.url, stages })
    });
  }

  it('新增和导出的阶段拥有稳定标识，重新读取仍一致', async () => {
    const item = await newRecord();
    const ids = item.stages.map((stage: any) => stage.id);
    expect(ids.every((id: unknown) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(4);
    const list = (await (await fetch(`${baseURL}/api/interviews/export`, { headers: auth(token) })).json()) as any[];
    expect(list.find(record => record.id === item.id).stages.map((stage: any) => stage.id)).toEqual(ids);
  });

  it('改名和类型、调整未完成顺序并插入阶段，历史状态与其他岗位保留', async () => {
    const item = await newRecord();
    const sibling = await newRecord();
    const progressed = await fetch(`${baseURL}/api/interviews/${item.id}/stage`, {
      method: 'PATCH', headers: auth(token), body: JSON.stringify({ stageIndex: 1, status: 'pass' })
    });
    expect(progressed.status).toBe(200);
    const advanced = (await progressed.json()) as any;
    const edited = [
      { ...advanced.stages[0], name: '已提交申请', type: 'other', status: 'pending' },
      { ...advanced.stages[1], name: '专业能力交流', status: 'pending' },
      { id: 'new-screening', name: '材料核验', type: 'other', status: 'pass' },
      advanced.stages[3], advanced.stages[2]
    ];
    const response = await save(item, edited);
    expect(response.status).toBe(200);
    const updated = (await response.json()) as any;
    expect(updated.stages.map((stage: any) => stage.status)).toEqual(['pass', 'pass', 'current', 'pending', 'pending']);
    expect(updated.stages[1].id).toBe(advanced.stages[1].id);
    expect(updated.stages[1].name).toBe('专业能力交流');
    expect(updated.url).toBe(item.url);
    expect(updated.createdAt).toBe(item.createdAt);
    const list = (await (await fetch(`${baseURL}/api/interviews`, { headers: auth(token) })).json()) as any[];
    expect(list.find(record => record.id === item.id).stages).toEqual(updated.stages);
    expect(list.find(record => record.id === sibling.id).stages).toEqual(sibling.stages);
  });

  it('历史阶段可删除、移动或替换，保留阶段的状态不会错位', async () => {
    const cases = [
      { edit: (item: any) => item.stages.slice(1), statuses: ['current', 'pending', 'pending'] },
      { edit: (item: any) => [item.stages[1], item.stages[0], ...item.stages.slice(2)], statuses: ['current', 'pass', 'pending', 'pending'] },
      { edit: (item: any) => [{ ...item.stages[0], id: 'replacement' }, ...item.stages.slice(1)], statuses: ['current', 'pending', 'pending', 'pending'] }
    ];
    for (const testCase of cases) {
      const item = await newRecord();
      const edited = testCase.edit(item);
      const response = await save(item, edited);
      expect(response.status).toBe(200);
      const updated = (await response.json()) as any;
      expect(updated.stages.map((stage: any) => stage.id)).toEqual(edited.map((stage: any) => stage.id));
      expect(updated.stages.map((stage: any) => stage.status)).toEqual(testCase.statuses);
      const list = (await (await fetch(`${baseURL}/api/interviews`, { headers: auth(token) })).json()) as any[];
      expect(list.find(record => record.id === item.id).stages).toEqual(updated.stages);
    }
  });

  it('删除当前阶段后接续下一阶段，后续流转使用新顺序', async () => {
    const item = await newRecord();
    const response = await save(item, [item.stages[0], item.stages[3], item.stages[2]]);
    expect(response.status).toBe(200);
    const updated = (await response.json()) as any;
    expect(updated.stages.map((stage: any) => stage.status)).toEqual(['pass', 'current', 'pending']);
    const skipped = await fetch(`${baseURL}/api/interviews/${item.id}/stage`, {
      method: 'PATCH', headers: auth(token), body: JSON.stringify({ stageIndex: 1, status: 'skip' })
    });
    expect(skipped.status).toBe(200);
    expect(((await skipped.json()) as any).stages[2].status).toBe('current');
  });

  it('已跳过阶段保留历史状态，也可删除', async () => {
    const item = await newRecord();
    const skipped = (await (await fetch(`${baseURL}/api/interviews/${item.id}/stage`, {
      method: 'PATCH', headers: auth(token), body: JSON.stringify({ stageIndex: 1, status: 'skip' })
    })).json()) as any;
    const response = await save(item, skipped.stages.map((stage: any, index: number) => ({
      ...stage, name: index === 1 ? '免除的技术交流' : stage.name, status: 'pending'
    })));
    expect(response.status).toBe(200);
    const updated = (await response.json()) as any;
    expect(updated.stages.map((stage: any) => stage.status)).toEqual(['pass', 'skip', 'current', 'pending']);
    expect(updated.stages[1].name).toBe('免除的技术交流');
    const removed = await save(item, [updated.stages[0], ...updated.stages.slice(2)]);
    expect(removed.status).toBe(200);
    expect(((await removed.json()) as any).stages.map((stage: any) => stage.status)).toEqual(['pass', 'current', 'pending']);
  });

  it('已通过阶段可移到未完成阶段之后，接续时跳过已有结果', async () => {
    const item = await newRecord();
    const response = await save(item, [item.stages[1], item.stages[2], item.stages[0], item.stages[3]]);
    expect(response.status).toBe(200);
    expect(((await response.json()) as any).stages.map((stage: any) => stage.status)).toEqual(['current', 'pending', 'pass', 'pending']);
    for (const stageIndex of [0, 1]) {
      const progressed = await fetch(`${baseURL}/api/interviews/${item.id}/stage`, {
        method: 'PATCH', headers: auth(token), body: JSON.stringify({ stageIndex, status: 'pass' })
      });
      expect(progressed.status).toBe(200);
      const updated = (await progressed.json()) as any;
      expect(updated.stages[2].status).toBe('pass');
      expect(updated.stages[stageIndex === 0 ? 1 : 3].status).toBe('current');
    }
  });

  it('删除未通过或已拒绝阶段可恢复流程，保留它们时仍为终结状态', async () => {
    for (const status of ['fail', 'rejected']) {
      const item = await newRecord();
      const stopped = (await (await fetch(`${baseURL}/api/interviews/${item.id}/stage`, {
        method: 'PATCH', headers: auth(token), body: JSON.stringify({ stageIndex: 1, status })
      })).json()) as any;
      const response = await save(item, [stopped.stages[0], ...stopped.stages.slice(2)]);
      expect(response.status).toBe(200);
      const updated = (await response.json()) as any;
      expect(updated.stages.map((stage: any) => stage.status)).toEqual(['pass', 'current', 'pending']);
    }
  });

  it('失败结果移到末尾后更正，应接续排在前面的待进行阶段', async () => {
    const item = await newRecord();
    const stopped = (await (await fetch(`${baseURL}/api/interviews/${item.id}/stage`, {
      method: 'PATCH', headers: auth(token), body: JSON.stringify({ stageIndex: 1, status: 'fail' })
    })).json()) as any;
    const reordered = await save(item, [stopped.stages[2], stopped.stages[0], stopped.stages[3], stopped.stages[1]]);
    expect(reordered.status).toBe(200);
    const corrected = await fetch(`${baseURL}/api/interviews/${item.id}/stage`, {
      method: 'PATCH', headers: auth(token), body: JSON.stringify({ stageIndex: 3, status: 'pass' })
    });
    expect(corrected.status).toBe(200);
    expect(((await corrected.json()) as any).stages.map((stage: any) => stage.status)).toEqual(['current', 'pass', 'pending', 'pass']);
  });

  it('失败和拒绝记录编辑后保留结果，手动更正时按新流程接续', async () => {
    for (const status of ['fail', 'rejected']) {
      const item = await newRecord();
      const stopped = (await (await fetch(`${baseURL}/api/interviews/${item.id}/stage`, {
        method: 'PATCH', headers: auth(token), body: JSON.stringify({ stageIndex: 1, status })
      })).json()) as any;
      const response = await save(item, [
        stopped.stages[0], { ...stopped.stages[1], name: '历史面试' },
        { id: `new-${status}`, name: '新增待办', type: 'other' }, ...stopped.stages.slice(2)
      ]);
      expect(response.status).toBe(200);
      const updated = (await response.json()) as any;
      expect(updated.stages[1].status).toBe(status);
      expect(updated.stages.some((stage: any) => stage.status === 'current')).toBe(false);
      const corrected = await fetch(`${baseURL}/api/interviews/${item.id}/stage`, {
        method: 'PATCH', headers: auth(token), body: JSON.stringify({ stageIndex: 1, status: 'pass' })
      });
      expect(corrected.status).toBe(200);
      const continued = (await corrected.json()) as any;
      expect(continued.stages.map((stage: any) => stage.status)).toEqual(['pass', 'pass', 'current', 'pending', 'pending']);
      expect(continued.stages[2].id).toBe(`new-${status}`);
    }
  });

  it('旧数据库中的无标识阶段首次编辑仍保留状态', async () => {
    const item = await newRecord();
    const legacyStages = item.stages.map((stage: any) => ({ name: stage.name, status: stage.status }));
    getDatabase().prepare('UPDATE interviews SET stages = ? WHERE id = ?').run(JSON.stringify(legacyStages), item.id);
    const response = await save(item, legacyStages.map((stage: any, index: number) => ({
      ...stage, id: `legacy-stage-${index}`, type: definitions[index].type, name: index === 1 ? '改名后的面试' : stage.name
    })));
    expect(response.status).toBe(200);
    const updated = (await response.json()) as any;
    expect(updated.stages.map((stage: any) => stage.status)).toEqual(['pass', 'current', 'pending', 'pending']);
    expect(updated.stages[0].id).toBe('legacy-stage-0');
    expect(updated.stages[1].name).toBe('改名后的面试');
  });

  it('编辑校验拒绝空流程、缺失标识、重复标识、非法类别', async () => {
    const item = await newRecord();
    const invalid = [
      [], definitions,
      [item.stages[0], { ...item.stages[1], id: item.stages[0].id }],
      [{ ...item.stages[0], type: 'invalid' }, ...item.stages.slice(1)]
    ];
    for (const stages of invalid) expect((await save(item, stages)).status).toBe(400);
  });

  it('其他用户不能编辑记录或其流程', async () => {
    const item = await newRecord();
    const otherToken = await registerAndLogin('edit_other_user');
    const response = await fetch(`${baseURL}/api/interviews/${item.id}`, {
      method: 'PATCH', headers: auth(otherToken), body: JSON.stringify({ company: item.company, position: item.position, stages: item.stages })
    });
    expect(response.status).toBe(404);
  });
});
