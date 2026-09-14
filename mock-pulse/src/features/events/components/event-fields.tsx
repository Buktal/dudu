import {
  BookOpenIcon,
  ChevronDownIcon,
  ClockIcon,
  HashIcon,
  MessageSquareIcon,
  PlusIcon,
  SearchIcon,
  UserIcon,
} from "lucide-react";
import { useState } from "react";
import { Notice } from "@/components/notice";
import { SearchInput } from "@/components/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FieldGroup } from "@/components/ui/field";
import { useAppDispatch } from "@/hooks/use-app-store";
import { cn } from "@/lib/utils";
import type { EditorField } from "../definitions/resolve";
import type { EventDraft } from "../model";
import { getAt } from "../payload";
import type { EventSchema } from "../schemas";
import {
  type EventsState,
  editFieldText,
  setDraftField,
} from "../stores/events-slice";
import { EventFieldInput } from "./event-field-input";

const GROUP_ORDER = [
  "消息内容",
  "用户与身份",
  "会话与时序",
  "回调信封",
  "其他参数",
];

function ParameterGroup({
  name,
  fields,
  fieldInputs,
  defaultOpen,
  searching,
  onChange,
  onDescribe,
  onSync,
}: {
  name: string;
  fields: EditorField[];
  fieldInputs: EventsState["fieldInputs"];
  defaultOpen: boolean;
  searching: boolean;
  onChange: (field: EditorField, text: string) => void;
  onDescribe: (path: string) => void;
  onSync?: () => void;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const open = searching || expanded;
  const GroupIcon = name.includes("消息")
    ? MessageSquareIcon
    : name.includes("用户")
      ? UserIcon
      : name.includes("时序") || name.includes("时间")
        ? ClockIcon
        : HashIcon;
  return (
    <Collapsible open={open} onOpenChange={setExpanded}>
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GroupIcon className="size-4 text-muted-foreground" />
            {name}
            <Badge variant="outline">{fields.length}</Badge>
          </CardTitle>
          <CardAction>
            <CollapsibleTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${open ? "收起" : "展开"}${name}`}
                />
              }
            >
              <ChevronDownIcon
                className={cn("transition-transform", open && "rotate-180")}
              />
            </CollapsibleTrigger>
          </CardAction>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            {onSync ? (
              <div className="flex justify-end">
                <Button size="sm" variant="link" onClick={onSync}>
                  同步两处用户 ID
                </Button>
              </div>
            ) : null}
            <FieldGroup className="gap-5">
              {fields.map((field) => (
                <EventFieldInput
                  key={field.path}
                  field={field}
                  input={fieldInputs?.[field.path]}
                  onChange={(text) => onChange(field, text)}
                  onDescribe={() => onDescribe(field.path)}
                />
              ))}
            </FieldGroup>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export function EventFields({
  schema,
  draft,
  fields,
  fieldInputs,
  onDescribe,
  onAdd,
}: {
  schema: EventSchema;
  draft: EventDraft;
  fields: EditorField[];
  fieldInputs: EventsState["fieldInputs"];
  onDescribe: (path: string) => void;
  onAdd: () => void;
}) {
  const dispatch = useAppDispatch();
  const [query, setQuery] = useState("");
  const keyword = query.trim().toLowerCase();
  const visible = fields.filter((field) =>
    `${field.title} ${field.path} ${field.description}`
      .toLowerCase()
      .includes(keyword),
  );
  const groups = [...new Set(visible.map((field) => field.group))].sort(
    (a, b) => {
      const index = (name: string) =>
        GROUP_ORDER.includes(name)
          ? GROUP_ORDER.indexOf(name)
          : GROUP_ORDER.length;
      return index(a) - index(b);
    },
  );
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          className="min-w-40 flex-1"
          aria-label="查找参数"
          placeholder="查找字段名称或路径"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={query ? () => setQuery("") : undefined}
        />
        <Button size="sm" variant="outline" onClick={onAdd}>
          <PlusIcon data-icon="inline-start" />
          添加参数
        </Button>
      </div>
      {schema.wire === "xml" ? (
        <Notice>
          这里编辑加密前的 XML，发送时自动加密。成员身份使用 UserID。
        </Notice>
      ) : schema.contentString ? (
        <Notice>
          表单展开 content 便于编辑，发送时会自动还原为平台要求的字符串。
        </Notice>
      ) : null}
      {groups.map((group, index) => (
        <ParameterGroup
          key={group}
          name={group}
          fields={visible.filter((field) => field.group === group)}
          fieldInputs={fieldInputs}
          defaultOpen={index < 2}
          searching={!!keyword}
          onChange={(field, text) =>
            dispatch(
              editFieldText({ path: field.path, text, type: field.type }),
            )
          }
          onDescribe={onDescribe}
          onSync={
            group.includes("用户") &&
            draft.channelId === "douyin" &&
            getAt(draft.payload, "content.user_infos[0].open_id") !== undefined
              ? () =>
                  dispatch(
                    setDraftField({
                      path: "content.user_infos[0].open_id",
                      value: getAt(draft.payload, "from_user_id"),
                    }),
                  )
              : undefined
          }
        />
      ))}
      {!groups.length ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>没有找到这个字段</EmptyTitle>
            <EmptyDescription>试试字段路径或中文名称。</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={() => setQuery("")}>
              清除搜索
            </Button>
          </EmptyContent>
        </Empty>
      ) : null}
      <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{visible.length} 个字段 · 修改后可直接发送验证</span>
        <Button size="sm" variant="ghost" onClick={() => onDescribe("")}>
          <BookOpenIcon data-icon="inline-start" />
          管理字段说明
        </Button>
      </p>
    </div>
  );
}
