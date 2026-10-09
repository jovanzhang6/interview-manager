import type { Interview } from '../types';
import { hasOffer, stageProgress } from '../stages';

/** 公司聚合组：同一公司的多条记录（多部门/多岗位）归并为一组 */
export interface CompanyGroup {
  company: string;
  /** 组内全部记录 */
  items: Interview[];
  /** 公司置顶：组内任一记录置顶即整体置顶，固定排在最前不参与排序 */
  pinned: boolean;
  /** 公司最大完成比例（未挂岗位的最大值，全挂时为组内真实最大值） */
  maxProgress: number;
  /** 组内最新投递时间 */
  latestCreatedAt: string;
  /** 组内最新访问时间（所有记录中最大值，可能为 undefined） */
  latestVisit?: string;
  /** 公司跳转链接：优先取最近访问过的记录的链接，其次取任意有链接的记录 */
  url?: string;
}

function progressOf(item: Interview): number {
  return stageProgress(item.stages);
}

/** 记录是否已终结：任一阶段未通过或已拒绝，且未拿到录用通知。 */
export function isInterviewTerminated(item: Interview): boolean {
  const killed = item.stages.some(s => s.status === 'fail' || s.status === 'rejected');
  return killed && !hasOffer(item.stages);
}

/** 组内岗位排序：未终结的按进度降序在前（同进度新的在前），已终结的沉到最后（之间按投递时间新→旧） */
function sortItemsWithinGroup(items: Interview[]): Interview[] {
  return [...items].sort((a, b) => {
    const deadA = isInterviewTerminated(a) ? 1 : 0;
    const deadB = isInterviewTerminated(b) ? 1 : 0;
    if (deadA !== deadB) return deadA - deadB;
    if (deadA === 1) return a.createdAt < b.createdAt ? 1 : -1;
    const pa = progressOf(a);
    const pb = progressOf(b);
    if (pa !== pb) return pb - pa;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

function newestVisitOf(items: Interview[]): string | undefined {
  let latest: string | undefined;
  for (const i of items) {
    if (i.lastVisitedAt && (!latest || i.lastVisitedAt > latest)) latest = i.lastVisitedAt;
  }
  return latest;
}

function pickUrl(items: Interview[]): string | undefined {
  // 优先最近访问过的记录的链接（用户上次关注的就是它），否则取任意有链接的记录
  const withUrl = items.filter(i => !!i.url);
  if (withUrl.length === 0) return undefined;
  const visited = withUrl.filter(i => !!i.lastVisitedAt);
  if (visited.length > 0) {
    visited.sort((a, b) => (a.lastVisitedAt! < b.lastVisitedAt! ? 1 : -1));
    return visited[0].url;
  }
  return withUrl[0].url;
}

/** 搜索过滤：公司名或职位名包含关键词（不区分大小写） */
export function filterInterviews(interviews: Interview[], query: string): Interview[] {
  const q = query.trim().toLowerCase();
  if (!q) return interviews;
  return interviews.filter(
    i => i.company.toLowerCase().includes(q) || i.position.toLowerCase().includes(q)
  );
}

/** 按公司分组（公司名 trim 后精确匹配） */
export function groupByCompany(interviews: Interview[]): CompanyGroup[] {
  const map = new Map<string, Interview[]>();
  for (const item of interviews) {
    const key = item.company.trim();
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }

  const groups: CompanyGroup[] = [];
  for (const [company, rawItems] of map) {
    // 挂了的岗位不参与公司进度计算：maxProgress 取未终结岗位的最大进度；
    // 全公司都挂了时取真实最大进度（仅用于全挂公司之间的相对排序）
    const alive = rawItems.filter(i => !isInterviewTerminated(i));
    const pool = alive.length > 0 ? alive : rawItems;
    groups.push({
      company,
      items: sortItemsWithinGroup(rawItems),
      pinned: rawItems.some(i => !!i.pinned),
      maxProgress: Math.max(...pool.map(progressOf)),
      latestCreatedAt: rawItems.reduce(
        (acc, i) => (i.createdAt > acc ? i.createdAt : acc),
        rawItems[0].createdAt
      ),
      latestVisit: newestVisitOf(rawItems),
      url: pickUrl(rawItems)
    });
  }
  return groups;
}

export type SortMode = 'progress' | 'newest' | 'oldest' | 'company' | 'recentVisit';

function applySort(groups: CompanyGroup[], sortBy: SortMode): CompanyGroup[] {
  const sorted = [...groups];
  switch (sortBy) {
    case 'progress':
      sorted.sort(
        (a, b) =>
          b.maxProgress - a.maxProgress ||
          (a.latestCreatedAt < b.latestCreatedAt ? 1 : -1)
      );
      break;
    case 'newest':
      sorted.sort((a, b) => (a.latestCreatedAt < b.latestCreatedAt ? 1 : -1));
      break;
    case 'oldest':
      sorted.sort((a, b) => (a.latestCreatedAt > b.latestCreatedAt ? 1 : -1));
      break;
    case 'company':
      sorted.sort((a, b) => a.company.localeCompare(b.company, 'zh-CN'));
      break;
    case 'recentVisit':
      sorted.sort((a, b) => {
        if (a.latestVisit && b.latestVisit) return a.latestVisit < b.latestVisit ? 1 : -1;
        if (a.latestVisit) return -1;
        if (b.latestVisit) return 1;
        return a.latestCreatedAt < b.latestCreatedAt ? 1 : -1;
      });
      break;
  }
  return sorted;
}

/** 公司是否已全部终结（所有岗位都挂了）：不展示访问提醒，排序固定沉底 */
export function isGroupTerminated(group: CompanyGroup): boolean {
  return group.items.length > 0 && group.items.every(isInterviewTerminated);
}

/** 公司维度排序：置顶组固定最前（不参与排序、不受全挂沉底影响），
 * 其余公司按策略排序，全部岗位都终结的公司排在最后 */
export function sortGroups(groups: CompanyGroup[], sortBy: SortMode): CompanyGroup[] {
  const pinned = groups.filter(g => g.pinned);
  const rest = groups.filter(g => !g.pinned);
  const alive = rest.filter(g => !isGroupTerminated(g));
  const dead = rest.filter(g => isGroupTerminated(g));
  return [...applySort(pinned, sortBy), ...applySort(alive, sortBy), ...applySort(dead, sortBy)];
}
