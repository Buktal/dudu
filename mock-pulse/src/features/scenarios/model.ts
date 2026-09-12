import { type ChannelId, channelById } from "@/lib/channels";

/**
 * 平台剧本领域模型（ADR-0004）：Scenario = {id, name, channelId, steps[]}。
 * 每平台独立剧本、禁跨平台混写；步骤只引用事件版本（id + revision），
 * 「发的内容 / 期待的回执」运行时经引用解析，不复制载荷（版本不可变，引用安全）。
 */

/** 剧本步骤：引用素材库事件的一个不可变版本。 */
export type ScenarioStep = {
  eventId: string;
  /** 选入时引用的事件版本号 */
  revision: number;
};

export type Scenario = {
  id: string;
  name: string;
  channelId: ChannelId;
  steps: ScenarioStep[];
};

/** 添加步骤时需要的最小事件事实：渠道一致性与最新版本号。 */
export type StepEventRef = {
  id: string;
  channelId: ChannelId;
  revision: number;
};

let idCounter = 0;

export function newScenarioId(): string {
  idCounter += 1;
  return `scn-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

/** 新建剧本：先选渠道，步骤为空。 */
export function createScenario(name: string, channelId: ChannelId): Scenario {
  return { id: newScenarioId(), name, channelId, steps: [] };
}

function channelName(channelId: ChannelId): string {
  return channelById(channelId)?.name ?? channelId;
}

/** 渠道锁定（ADR-0004 禁混写）：步骤事件渠道必须与剧本一致，违例抛可读错误。 */
export function assertSameChannel(
  scenarioChannel: ChannelId,
  eventChannel: ChannelId,
): void {
  if (scenarioChannel !== eventChannel) {
    throw new Error(
      `剧本渠道已锁定为${channelName(scenarioChannel)}，不能添加${channelName(eventChannel)}的事件。`,
    );
  }
}

/** 渠道在添加第一步后锁定：有步骤即拒绝更换。 */
export function assertChannelEditable(scenario: Scenario): void {
  if (scenario.steps.length > 0) {
    throw new Error(
      `已添加步骤，渠道锁定为${channelName(scenario.channelId)}，不能再更换。`,
    );
  }
}

/** 无步骤时更换渠道（新建未定稿阶段）。 */
export function changeChannel(
  scenario: Scenario,
  channelId: ChannelId,
): Scenario {
  assertChannelEditable(scenario);
  return { ...scenario, channelId };
}

/** 添加步骤：领域层校验渠道一致，通过则追加 {eventId, revision} 引用。 */
export function addStep(scenario: Scenario, event: StepEventRef): Scenario {
  assertSameChannel(scenario.channelId, event.channelId);
  return {
    ...scenario,
    steps: [...scenario.steps, { eventId: event.id, revision: event.revision }],
  };
}

/** 上移 / 下移：越界（首步上移、末步下移）为无操作，原样返回。 */
export function moveStep(
  scenario: Scenario,
  index: number,
  delta: -1 | 1,
): Scenario {
  const target = index + delta;
  if (
    index < 0 ||
    index >= scenario.steps.length ||
    target < 0 ||
    target >= scenario.steps.length
  ) {
    return scenario;
  }
  const steps = [...scenario.steps];
  const [moved] = steps.splice(index, 1);
  steps.splice(target, 0, moved);
  return { ...scenario, steps };
}

/** 按位置删除步骤；越界为无操作。同一事件可多次入本，故不用 eventId 定位。 */
export function removeStep(scenario: Scenario, index: number): Scenario {
  if (index < 0 || index >= scenario.steps.length) {
    return scenario;
  }
  return {
    ...scenario,
    steps: scenario.steps.filter((_step, i) => i !== index),
  };
}

/** 显式同步：把指定步骤的引用版本号更新为新值，其余步骤不动。 */
export function withStepRevision(
  scenario: Scenario,
  index: number,
  revision: number,
): Scenario {
  if (index < 0 || index >= scenario.steps.length) {
    return scenario;
  }
  return {
    ...scenario,
    steps: scenario.steps.map((step, i) =>
      i === index ? { ...step, revision } : step,
    ),
  };
}

/**
 * 保存前整体校验（防绕过 addStep 的路径）：每个步骤引用的事件必须存在
 * 且渠道与剧本一致。违例抛可读错误。
 */
export function validateScenario(
  scenario: Scenario,
  events: readonly { id: string; channelId: ChannelId }[],
): void {
  for (const step of scenario.steps) {
    const event = events.find((item) => item.id === step.eventId);
    if (!event) {
      throw new Error(`步骤引用的事件不存在：${step.eventId}。`);
    }
    if (event.channelId !== scenario.channelId) {
      throw new Error(
        `剧本渠道为${channelName(scenario.channelId)}，步骤引用了${channelName(event.channelId)}的事件：${event.id}。`,
      );
    }
  }
}

/** 引用了该事件的剧本列表（事件删除守卫：非空则拒绝删除）。 */
export function scenariosReferencingEvent(
  eventId: string,
  scenarios: readonly Scenario[],
): Scenario[] {
  return scenarios.filter((scenario) =>
    scenario.steps.some((step) => step.eventId === eventId),
  );
}
