import { describe, it, expect } from 'vitest';
import { filterInterviews, groupByCompany, sortGroups, isGroupTerminated, isInterviewTerminated } from '../src/utils/grouping';
import type { Interview } from '../src/types';

function makeStages(passed: number, currentAt: number): Interview['stages'] {
  return Array.from({ length: 10 }, (_, i) => ({
    name: `阶段${i}`,
    status: i < passed ? 'pass' : i === currentAt ? 'current' : 'pending'
  }));
}

function makeItem(overrides: Partial<Interview> & { id: string; company: string; position: string }): Interview {
  return {
    stages: makeStages(0, 0),
    status: 'active',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides
  } as Interview;
}

describe('自定义流程的分组与排序', () => {
  it('阶段数不同的岗位和公司按完成比例排序', () => {
    const short = makeItem({ id: '短', company: '短流程公司', position: '短流程', stages: [
      { name: '投递', status: 'pass' }, { name: '面试', type: 'interview', status: 'current' }
    ] });
    const long = makeItem({ id: '长', company: '长流程公司', position: '长流程', stages: makeStages(4, 4) });
    expect(sortGroups(groupByCompany([long, short]), 'progress').map(group => group.company))
      .toEqual(['短流程公司', '长流程公司']);
    expect(groupByCompany([long, { ...short, company: long.company }])[0].items.map(item => item.id)).toEqual(['短', '长']);
  });

  it('最后一个面试通过不作为录用，已有失败仍判定终结', () => {
    const item = makeItem({ id: '失败', company: '公司', position: '岗位', stages: [
      { name: '筛选', type: 'other', status: 'fail' },
      { name: '面试', type: 'interview', status: 'pass' }
    ] });
    expect(isInterviewTerminated(item)).toBe(true);
  });

  it('录用阶段不在最后时仍正确识别，旧十阶段同样兼容', () => {
    const item = makeItem({ id: '录用', company: '公司', position: '岗位', stages: [
      { name: '意向书', type: 'offer', status: 'pass' },
      { name: '材料核验', type: 'other', status: 'fail' }
    ] });
    expect(isInterviewTerminated(item)).toBe(false);
    expect(isInterviewTerminated(makeItem({ id: '旧', company: '公司', position: '旧岗位', stages: offerStages() }))).toBe(false);
  });
});

describe('filterInterviews 搜索过滤', () => {
  const data: Interview[] = [
    makeItem({ id: '1', company: '腾讯', position: '前端工程师' }),
    makeItem({ id: '2', company: '阿里巴巴', position: '后端开发' }),
    makeItem({ id: '3', company: 'tencent', position: 'tester' })
  ];

  it('按公司名匹配（不区分大小写）', () => {
    expect(filterInterviews(data, 'TENCENT').map(i => i.id)).toEqual(['3']);
  });

  it('按职位名匹配', () => {
    expect(filterInterviews(data, '前端').map(i => i.id)).toEqual(['1']);
  });

  it('中文关键词匹配', () => {
    expect(filterInterviews(data, '阿里').map(i => i.id)).toEqual(['2']);
  });

  it('空查询返回全部', () => {
    expect(filterInterviews(data, '   ')).toHaveLength(3);
  });

  it('无命中返回空数组', () => {
    expect(filterInterviews(data, '字节跳动')).toHaveLength(0);
  });
});

describe('groupByCompany 公司聚合', () => {
  it('同公司多岗位聚合为一个组，不同公司各自成组', () => {
    const groups = groupByCompany([
      makeItem({ id: '1', company: '腾讯', position: 'pcg qq' }),
      makeItem({ id: '2', company: '腾讯', position: '微信前端' }),
      makeItem({ id: '3', company: '阿里', position: '后端' })
    ]);
    expect(groups).toHaveLength(2);
    const tx = groups.find(g => g.company === '腾讯')!;
    // 组内顺序由组内排序规则决定（见"组内排序"用例），此处只验证聚合完整
    expect([...tx.items.map(i => i.id)].sort()).toEqual(['1', '2']);
  });

  it('公司名仅 trim 后比较，忽略首尾空格差异', () => {
    const groups = groupByCompany([
      makeItem({ id: '1', company: '腾讯', position: 'a' }),
      makeItem({ id: '2', company: ' 腾讯 ', position: 'b' })
    ]);
    expect(groups).toHaveLength(1);
  });

  it('maxProgress 取组内最大进度', () => {
    const groups = groupByCompany([
      makeItem({ id: '1', company: '腾讯', position: 'a', stages: makeStages(1, 1) }),
      makeItem({ id: '2', company: '腾讯', position: 'b', stages: makeStages(4, 4) })
    ]);
    expect(groups[0].maxProgress).toBe(0.4);
  });

  it('latestVisit 取组内最新访问时间', () => {
    const groups = groupByCompany([
      makeItem({ id: '1', company: '腾讯', position: 'a', lastVisitedAt: '2026-09-10T08:00:00.000Z' }),
      makeItem({ id: '2', company: '腾讯', position: 'b', lastVisitedAt: '2026-09-12T08:00:00.000Z' })
    ]);
    expect(groups[0].latestVisit).toBe('2026-09-12T08:00:00.000Z');
  });

  it('url 优先取最近访问过的记录的链接，其次取第一条有链接的', () => {
    const groups = groupByCompany([
      makeItem({ id: '1', company: '腾讯', position: 'a', url: 'https://old.com', lastVisitedAt: '2026-09-10T08:00:00.000Z' }),
      makeItem({ id: '2', company: '腾讯', position: 'b', url: 'https://new.com', lastVisitedAt: '2026-09-12T08:00:00.000Z' }),
      makeItem({ id: '3', company: '腾讯', position: 'c', url: 'https://never.com' })
    ]);
    expect(groups[0].url).toBe('https://new.com');

    const groupsNoVisit = groupByCompany([
      makeItem({ id: '1', company: '字节', position: 'a' }),
      makeItem({ id: '2', company: '字节', position: 'b', url: 'https://byted.com' })
    ]);
    expect(groupsNoVisit[0].url).toBe('https://byted.com');
  });
});

describe('sortGroups 公司维度排序', () => {
  const a = (company: string, overrides: Partial<CompanyGroup>): CompanyGroup => ({
    company,
    items: [],
    maxProgress: 0,
    latestCreatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides
  });

  it('progress：按公司最大进度降序，进度相同按最新投递时间降序', () => {
    const sorted = sortGroups([
      a('甲', { maxProgress: 1, latestCreatedAt: '2026-09-05' }),
      a('乙', { maxProgress: 4, latestCreatedAt: '2026-09-01' }),
      a('丙', { maxProgress: 1, latestCreatedAt: '2026-09-08' })
    ], 'progress');
    expect(sorted.map(g => g.company)).toEqual(['乙', '丙', '甲']);
  });

  it('recentVisit：有访问的按时间降序在前，从未访问的排最后', () => {
    const sorted = sortGroups([
      a('未访问', { latestCreatedAt: '2026-09-09' }),
      a('旧访问', { latestVisit: '2026-09-10T08:00:00.000Z' }),
      a('新访问', { latestVisit: '2026-09-12T08:00:00.000Z' })
    ], 'recentVisit');
    expect(sorted.map(g => g.company)).toEqual(['新访问', '旧访问', '未访问']);
  });

  it('newest / oldest 按公司最新投递时间正反排序', () => {
    const groups = [
      a('老', { latestCreatedAt: '2026-08-01' }),
      a('新', { latestCreatedAt: '2026-09-15' })
    ];
    expect(sortGroups(groups, 'newest').map(g => g.company)).toEqual(['新', '老']);
    expect(sortGroups(groups, 'oldest').map(g => g.company)).toEqual(['老', '新']);
  });

  it('company 按公司名拼音排序且不改原数组', () => {
    const groups = [a('腾讯'), a('阿里巴巴'), a('字节跳动')];
    const sorted = sortGroups(groups, 'company');
    // zh-CN localeCompare 按拼音：阿(ā) < 腾(téng) < 字(zì)
    expect(sorted.map(g => g.company)).toEqual(['阿里巴巴', '腾讯', '字节跳动']);
    expect(groups[0].company).toBe('腾讯');
  });
});

// ===== 已挂流程的排序沉底规则 =====
// "挂了"= 任一阶段 fail/rejected 且未拿到 offer；全挂公司不参与排序固定沉底

function failedStages(passed: number): Interview['stages'] {
  return Array.from({ length: 10 }, (_, i) => ({
    name: `阶段${i}`,
    status: i < passed ? 'pass' : i === passed ? 'fail' : 'pending'
  }));
}

function offerStages(): Interview['stages'] {
  return Array.from({ length: 10 }, (_, i) => ({ name: i === 9 ? '正式offer' : `阶段${i}`, status: 'pass' }));
}

describe('已挂记录：公司聚合口径', () => {
  it('maxProgress 只从未挂的岗位中取最大，挂了的岗位不参与', () => {
    const groups = groupByCompany([
      makeItem({ id: '1', company: '腾讯', position: '挂了的', createdAt: '2026-09-01', stages: failedStages(3) }),
      makeItem({ id: '2', company: '腾讯', position: '活着的', createdAt: '2026-09-02', stages: makeStages(1, 1) })
    ]);
    // 挂了的岗位进度 3 不计入，公司进度取活着的 1
    expect(groups[0].maxProgress).toBe(0.1);
  });

  it('拿到 offer 的记录不算挂，正常参与公司进度', () => {
    const groups = groupByCompany([
      makeItem({ id: '1', company: '腾讯', position: '有offer', stages: offerStages() }),
      makeItem({ id: '2', company: '腾讯', position: '挂了的', stages: failedStages(5) })
    ]);
    expect(groups[0].maxProgress).toBe(1);
  });

  it('全公司都挂了时进度取真实最大值（仅用于全挂公司之间的相对排序）', () => {
    const groups = groupByCompany([
      makeItem({ id: '1', company: '腾讯', position: 'a', stages: failedStages(2) }),
      makeItem({ id: '2', company: '腾讯', position: 'b', stages: failedStages(6) })
    ]);
    expect(groups[0].maxProgress).toBe(0.6);
  });

  it('组内排序：未挂的按进度降序在前，挂了的沉到最后', () => {
    const groups = groupByCompany([
      makeItem({ id: '1', company: '腾讯', position: '挂了', createdAt: '2026-09-01', stages: failedStages(3) }),
      makeItem({ id: '2', company: '腾讯', position: '进度低', createdAt: '2026-09-02', stages: makeStages(1, 1) }),
      makeItem({ id: '3', company: '腾讯', position: '进度高', createdAt: '2026-09-03', stages: makeStages(2, 2) })
    ]);
    expect(groups[0].items.map(i => i.id)).toEqual(['3', '2', '1']);
  });

  it('isGroupTerminated：全部岗位挂了为 true，仍有活岗位为 false', () => {
    const allDead = groupByCompany([
      makeItem({ id: '1', company: '腾讯', position: 'a', stages: failedStages(2) }),
      makeItem({ id: '2', company: '腾讯', position: 'b', stages: failedStages(4) })
    ]);
    expect(isGroupTerminated(allDead[0])).toBe(true);

    const hasAlive = groupByCompany([
      makeItem({ id: '1', company: '字节', position: 'a', stages: failedStages(2) }),
      makeItem({ id: '2', company: '字节', position: 'b', stages: makeStages(1, 1) })
    ]);
    expect(isGroupTerminated(hasAlive[0])).toBe(false);
  });

  it('公司置顶：组内任一记录置顶即整体置顶', () => {
    const groups = groupByCompany([
      makeItem({ id: '1', company: '腾讯', position: 'a', pinned: true }),
      makeItem({ id: '2', company: '腾讯', position: 'b' })
    ]);
    expect(groups[0].pinned).toBe(true);
  });
});

describe('置顶公司排序：固定最前，不参与排序也不受全挂沉底影响', () => {
  const g = (company: string, opts: { pinned?: boolean; dead?: boolean; maxProgress?: number } = {}): CompanyGroup => ({
    company,
    items: [makeItem({ id: company, company, position: 'x', stages: opts.dead ? failedStages(3) : makeStages(1, 1) })],
    pinned: !!opts.pinned,
    maxProgress: opts.maxProgress ?? 1,
    latestCreatedAt: '2026-09-01'
  });

  it('置顶公司排在所有非置顶公司之前', () => {
    const sorted = sortGroups([
      g('普通高进度', { maxProgress: 9 }),
      g('置顶低进度', { pinned: true, maxProgress: 1 })
    ], 'progress');
    expect(sorted.map(x => x.company)).toEqual(['置顶低进度', '普通高进度']);
  });

  it('全挂但置顶的公司不沉底，仍固定最前', () => {
    const sorted = sortGroups([
      g('全挂但置顶', { pinned: true, dead: true, maxProgress: 1 }),
      g('活的普通', { maxProgress: 5 })
    ], 'progress');
    expect(sorted.map(x => x.company)).toEqual(['全挂但置顶', '活的普通']);
  });

  it('多个置顶公司之间按当前排序策略相对排列', () => {
    const sorted = sortGroups([
      g('置顶甲', { pinned: true, maxProgress: 2 }),
      g('置顶乙', { pinned: true, maxProgress: 7 }),
      g('普通', { maxProgress: 9 })
    ], 'progress');
    expect(sorted.map(x => x.company)).toEqual(['置顶乙', '置顶甲', '普通']);
  });
});

describe('已挂记录：公司排序沉底', () => {
  const alive = (company: string, maxProgress: number, latestCreatedAt: string): CompanyGroup => ({
    company,
    items: [makeItem({ id: company, company, position: 'x', createdAt: latestCreatedAt, stages: makeStages(maxProgress, maxProgress) })],
    maxProgress,
    latestCreatedAt
  });

  const dead = (company: string, maxProgress: number, latestCreatedAt: string): CompanyGroup => ({
    company,
    items: [makeItem({ id: company, company, position: 'x', createdAt: latestCreatedAt, stages: failedStages(maxProgress) })],
    maxProgress,
    latestCreatedAt
  });

  it('progress：全挂公司排最后，即使其进度数值更高', () => {
    const sorted = sortGroups([
      dead('全挂高进度', 8, '2026-09-10'),
      alive('活的低进度', 2, '2026-09-01'),
      alive('活的高进度', 5, '2026-09-05')
    ], 'progress');
    expect(sorted.map(g => g.company)).toEqual(['活的高进度', '活的低进度', '全挂高进度']);
  });

  it('progress：两个全挂公司之间按进度降序相对排列', () => {
    const sorted = sortGroups([
      dead('全挂甲', 2, '2026-09-01'),
      alive('活的', 3, '2026-09-01'),
      dead('全挂乙', 6, '2026-09-01')
    ], 'progress');
    expect(sorted.map(g => g.company)).toEqual(['活的', '全挂乙', '全挂甲']);
  });

  it('recentVisit：全挂公司即使访问时间最新也排最后', () => {
    const sorted = sortGroups([
      dead('全挂刚访问', 4, '2026-09-01'),
      alive('活的早访问', 1, '2026-09-01')
    ].map(g => ({ ...g, latestVisit: g.company === '全挂刚访问' ? '2026-09-12T00:00:00.000Z' : '2026-09-08T00:00:00.000Z' })), 'recentVisit');
    expect(sorted.map(g => g.company)).toEqual(['活的早访问', '全挂刚访问']);
  });

  it('newest：全挂公司排最后，活的公司之间仍按最新投递排序', () => {
    const sorted = sortGroups([
      dead('全挂新投递', 4, '2026-09-15'),
      alive('活的旧', 1, '2026-09-01'),
      alive('活的新', 1, '2026-09-10')
    ], 'newest');
    expect(sorted.map(g => g.company)).toEqual(['活的新', '活的旧', '全挂新投递']);
  });

  it('company：全挂公司按公司名排序时同样沉底', () => {
    const sorted = sortGroups([
      dead('阿里巴巴', 4, '2026-09-01'),
      alive('字节跳动', 1, '2026-09-01')
    ], 'company');
    expect(sorted.map(g => g.company)).toEqual(['字节跳动', '阿里巴巴']);
  });
});
