import { type ChannelId, channelById } from "@/lib/channels";

/**
 * 平台剧本领域模型（ADR-0004）：Scenario = {id, name, channelId, steps[]}。
 * 每平台独立剧本、禁跨平台混写。步骤引用两种形态并列（向后兼容已存剧本）：
 * - 事件素材：{eventId, revision} 引用素材库事件的不可变版本；
 * - 内置模板（ADR-0009 纯引用）：{templateId, templateVersion} 钉住选入时
 *   的模板版本，运行时原样发送该版本默认载荷，内容只读不可编辑。
 * 「发的内容 / 期待的回执」运行时经引用解析，不复制载荷（版本不可变，引用安全）。
 */

/** 事件素材步骤：引用素材库事件的一个不可变版本。 */
export type EventStep = {
  eventId: string;
  /** 选入时引用的事件版本号 */
  revision: number;
  /** 发送前等待秒数；旧素材缺省为 0。 */
  wait?: number;
};

/** 内置模板步骤：纯引用（ADR-0009），钉住选入时的模板版本。 */
export type TemplateStep = {
  templateId: string;
  /** 选入时钉住的模板版本标识（模板升版后本步骤仍发该版本） */
  templateVersion: string;
  /** 发送前等待秒数；旧素材缺省为 0。 */
  wait?: number;
};

export type ScenarioStep = EventStep | TemplateStep;

/** 形态判别：true = 模板纯引用步骤；false = 事件素材版本引用步骤。 */
export function isTemplateStep(step: ScenarioStep): step is TemplateStep {
  return "templateId" in step;
}

export type Scenario = {
  id: string;
  name: string;
  channelId: ChannelId;
  steps: ScenarioStep[];
  favorite?: boolean;
  revision?: number;
  failure?: "stop" | "continue";
};

/** 添加步骤时需要的最小事件事实：渠道一致性与最新版本号。 */
export type StepEventRef = {
  id: string;
  channelId: ChannelId;
  revision: number;
};

/** 添加模板步骤时需要的最小模板事实：渠道一致性与版本标识。 */
export type StepTemplateRef = {
  id: string;
  channelId: ChannelId;
  version: string;
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
    steps: [
      ...scenario.steps,
      {
        eventId: event.id,
        revision: event.revision,
        wait: scenario.steps.length ? 0.6 : 0,
      },
    ],
  };
}

/**
 * 添加内置模板步骤：领域层校验渠道一致，追加 {templateId, templateVersion}
 * 纯引用并钉住模板当前版本（ADR-0009：不复制载荷，内容只读）。
 */
export function addTemplateStep(
  scenario: Scenario,
  template: StepTemplateRef,
): Scenario {
  assertSameChannel(scenario.channelId, template.channelId);
  return {
    ...scenario,
    steps: [
      ...scenario.steps,
      {
        templateId: template.id,
        templateVersion: template.version,
        wait: scenario.steps.length ? 0.6 : 0,
      },
    ],
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

/**
 * 显式同步：把指定事件步骤的引用版本号更新为新值，其余步骤不动。
 * 模板步骤为版本钉住（ADR-0009，无「同步到最新」语义），原样返回。
 */
export function withStepRevision(
  scenario: Scenario,
  index: number,
  revision: number,
): Scenario {
  const step = scenario.steps[index];
  if (
    index < 0 ||
    index >= scenario.steps.length ||
    !step ||
    isTemplateStep(step)
  ) {
    return scenario;
  }
  return {
    ...scenario,
    steps: scenario.steps.map((entry, i) =>
      i === index && !isTemplateStep(entry) ? { ...entry, revision } : entry,
    ),
  };
}

/**
 * 保存前整体校验（防绕过 addStep 的路径）：事件步骤引用的事件必须存在且
 * 渠道与剧本一致；模板步骤引用的模板必须已注册、钉住版本在注册表中且渠道
 * 一致（缺失 = 未注册 id / 超前版本）。违例抛可读错误。
 */
export function validateScenario(
  scenario: Scenario,
  events: readonly { id: string; channelId: ChannelId }[],
  templates: readonly StepTemplateRef[] = [],
): void {
  if (!scenario.name.trim()) throw new Error("请填写剧本名称。");
  for (const step of scenario.steps) {
    if (
      step.wait !== undefined &&
      (!Number.isFinite(step.wait) || step.wait < 0 || step.wait > 60)
    )
      throw new Error("发送前等待须为 0 到 60 秒。");
    if (isTemplateStep(step)) {
      const registered = templates.filter(
        (item) => item.id === step.templateId,
      );
      if (registered.length === 0) {
        throw new Error(`步骤引用的内置模板不存在：${step.templateId}。`);
      }
      const matched = registered.find(
        (item) => item.version === step.templateVersion,
      );
      if (!matched) {
        throw new Error(
          `步骤引用的内置模板版本不存在：${step.templateId} v${step.templateVersion}。`,
        );
      }
      if (matched.channelId !== scenario.channelId) {
        throw new Error(
          `剧本渠道为${channelName(scenario.channelId)}，步骤引用了${channelName(matched.channelId)}的内置模板：${step.templateId}。`,
        );
      }
      continue;
    }
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

/** 引用了该事件的剧本列表（事件删除守卫：非空则拒绝删除；模板步骤不引用素材）。 */
export function scenariosReferencingEvent(
  eventId: string,
  scenarios: readonly Scenario[],
): Scenario[] {
  return scenarios.filter((scenario) =>
    scenario.steps.some(
      (step) => !isTemplateStep(step) && step.eventId === eventId,
    ),
  );
}
