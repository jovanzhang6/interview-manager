import { describe, expect, it } from 'vitest';
import {
  computeDropIndex, computeShifts, createDefaultStageDefinitions, createStages, getStageType, hasEnteredInterview,
  hasOffer, getStageId, mergeStageDefinitions, MAX_STAGE_COUNT, MAX_STAGE_NAME_LENGTH, stageProgress, validateStageDefinitions
} from '../src/stages';

describe('流程定义与初始进度', () => {
  it('默认十阶段独立复制，修改一份草稿不影响后续新增', () => {
    const first = createDefaultStageDefinitions();
    first[0].name = '改过的投递';
    first.splice(1, 2);
    const second = createDefaultStageDefinitions();
    expect(second).toHaveLength(10);
    expect(second[0]).toEqual({ name: '投递', type: 'application' });
    expect(second[4].type).toBe('interview');
    expect(second[9].type).toBe('offer');
  });

  it('首阶段为投递时自动通过，第二阶段进入当前状态', () => {
    const stages = createStages([
      { name: '提交申请', type: 'application' },
      { name: '能力交流', type: 'interview' },
      { name: '录用通知', type: 'offer' }
    ]);
    expect(stages.map(stage => stage.status)).toEqual(['pass', 'current', 'pending']);
  });

  it('移走或删除首个投递阶段后，第一阶段作为当前阶段', () => {
    const stages = createStages([
      { name: '电话沟通', type: 'interview' },
      { name: '递交资料', type: 'application' }
    ]);
    expect(stages.map(stage => stage.status)).toEqual(['current', 'pending']);
  });

  it('只有投递的流程已完成，只有面试的流程仍待操作', () => {
    const application = createStages([{ name: '投递', type: 'application' }]);
    expect(application[0].status).toBe('pass');
    expect(hasOffer(application)).toBe(false);
    expect(createStages([{ name: '技术面谈', type: 'interview' }])[0].status).toBe('current');
  });

  it('拒绝空流程、过多阶段、空名称、过长名称和非法类别', () => {
    const invalid = [
      null, [], '流程', [null], [{}], [{ name: '  ' }],
      [{ name: '名'.repeat(MAX_STAGE_NAME_LENGTH + 1) }],
      [{ name: '面试', type: 'invalid' }],
      Array.from({ length: MAX_STAGE_COUNT + 1 }, () => ({ name: '面试' }))
    ];
    for (const value of invalid) expect(validateStageDefinitions(value)).toBeTruthy();
    expect(validateStageDefinitions([{ name: '旧格式面试' }])).toBeNull();
    expect(validateStageDefinitions(Array.from({ length: MAX_STAGE_COUNT }, () => ({ name: '面试' })))).toBeNull();
  });
});

describe('已创建流程的编辑与进度保留', () => {
  const original = [
    { id: 'application', name: '投递', type: 'application', status: 'pass' },
    { id: 'interview', name: '面试', type: 'interview', status: 'current' },
    { id: 'offer', name: '录用', type: 'offer', status: 'pending' }
  ] as const;

  it('历史阶段可改名和类型，未完成阶段按新顺序接续', () => {
    const stages = mergeStageDefinitions(original, [
      { id: 'application', name: '提交申请', type: 'other' },
      { id: 'screening', name: '补充筛选', type: 'other' },
      { id: 'offer', name: '录用通知', type: 'offer' },
      { id: 'interview', name: '专业交流', type: 'interview' }
    ])!;
    expect(stages.map(stage => stage.status)).toEqual(['pass', 'current', 'pending', 'pending']);
    expect(stages[0].name).toBe('提交申请');
    expect(original[1].status).toBe('current');
  });

  it('历史阶段可删除或移动，保留阶段仍按标识保存状态', () => {
    const removed = mergeStageDefinitions(original, [{ id: 'interview', name: '面试', type: 'interview' }]);
    expect(removed.map(stage => stage.status)).toEqual(['current']);
    const moved = mergeStageDefinitions(original, [
      { id: 'interview', name: '面试', type: 'interview' },
      { id: 'application', name: '投递', type: 'application' }
    ]);
    expect(moved.map(stage => stage.status)).toEqual(['current', 'pass']);
    expect(moved[1].id).toBe('application');
  });

  it('删除未通过或已拒绝阶段后，剩余流程重新接续', () => {
    for (const status of ['fail', 'rejected'] as const) {
      const stages = mergeStageDefinitions([
        { id: 'failed', name: '历史面试', type: 'interview', status },
        { id: 'next', name: '下一轮', type: 'interview', status: 'pending' }
      ], [{ id: 'next', name: '下一轮', type: 'interview' }]);
      expect(stages[0].status).toBe('current');
    }
  });

  it('旧阶段标识兼容后首次保存保留历史进度', () => {
    const previous = [{ name: '投递', status: 'pass' }, { name: '一面', status: 'current' }] as const;
    const stages = mergeStageDefinitions(previous, previous.map((stage, index) => ({
      id: getStageId(stage, index), name: stage.name, type: getStageType(stage)
    })))!;
    expect(stages.map(stage => stage.status)).toEqual(['pass', 'current']);
    expect(stages[0].id).toBe('legacy-stage-0');
  });

  it('阶段标识重复或非法时拒绝配置', () => {
    expect(validateStageDefinitions([{ id: 'same', name: '一面' }, { id: 'same', name: '二面' }])).toBeTruthy();
    expect(validateStageDefinitions([{ id: 1, name: '面试' }])).toBeTruthy();
  });
});

describe('自定义阶段的统计语义', () => {
  it('重命名和移动录用阶段后仍按类别统计', () => {
    expect(hasOffer([
      { name: '入职意向书', type: 'offer', status: 'pass' },
      { name: '背景调查', type: 'other', status: 'current' }
    ])).toBe(true);
    expect(hasOffer([{ name: '最终面试', type: 'interview', status: 'pass' }])).toBe(false);
    expect(hasOffer([{ name: '正式offer', type: 'other', status: 'pass' }])).toBe(false);
  });

  it('旧十阶段数据通过已有名称识别类别', () => {
    expect(getStageType({ name: 'HR面' })).toBe('interview');
    expect(hasOffer([{ name: '正式offer', status: 'pass' }])).toBe(true);
    expect(getStageType({ name: 'Offer评估' })).toBe('other');
  });

  it('面试转化率按类别识别，已跳过的面试不计入', () => {
    expect(hasEnteredInterview([{ name: '专业能力交流', type: 'interview', status: 'current' }])).toBe(true);
    expect(hasEnteredInterview([{ name: '简历筛选', type: 'other', status: 'pass' }])).toBe(false);
    expect(hasEnteredInterview([{ name: '一面', status: 'skip' }])).toBe(false);
  });

  it('不同长度流程按完成比例比较进度，跳过计为已完成', () => {
    expect(stageProgress([
      { name: '资料提交', status: 'pass' },
      { name: '简历筛选', status: 'skip' },
      { name: '技术面试', status: 'current' },
      { name: '录用通知', status: 'pending' }
    ])).toBe(0.5);
    expect(stageProgress([])).toBe(0);
  });
});

describe('拖拽排序的几何计算', () => {
  const rows = [
    { top: 0, height: 50 }, { top: 59, height: 50 }, { top: 118, height: 50 },
    { top: 177, height: 50 }, { top: 236, height: 50 }
  ];

  it('指针在某行中点上方时插入到该行之前', () => {
    // 各行中点：R0=25, R1=84, R2=143, R3=202, R4=261
    expect(computeDropIndex(60, rows, 0)).toBe(0);  // R1 上半：插回原位
    expect(computeDropIndex(120, rows, 0)).toBe(1); // R2 上半：插到 R1 之后
    expect(computeDropIndex(200, rows, 0)).toBe(2); // R3 上半：插到 R2 之后
  });

  it('指针在某行中点下方时插入到该行之后', () => {
    expect(computeDropIndex(100, rows, 0)).toBe(1); // R1 下半越过，落在 R2 之前
    expect(computeDropIndex(170, rows, 0)).toBe(2); // R2 下半越过，落在 R3 之前
    expect(computeDropIndex(270, rows, 0)).toBe(4); // 末行下半：落到末尾
  });

  it('拖过自身中点不改变位置，拖到末行之后落在末尾', () => {
    expect(computeDropIndex(10, rows, 2)).toBe(0);  // R0 上半：插到最前
    expect(computeDropIndex(60, rows, 2)).toBe(1);  // R0 下半：插到 R0 之后
    expect(computeDropIndex(400, rows, 2)).toBe(4);
    expect(computeDropIndex(400, rows, 4)).toBe(4);
  });

  it('上移插入时中间行整体下移让位', () => {
    expect(computeShifts(3, 0, 5, 59)).toEqual([59, 59, 59, null, null]);
  });

  it('下移插入时中间行整体上移让位', () => {
    expect(computeShifts(0, 3, 5, 59)).toEqual([null, -59, -59, -59, null]);
  });

  it('落点与起点相同时所有行都不动', () => {
    expect(computeShifts(2, 2, 5, 59)).toEqual([null, null, null, null, null]);
  });
});
