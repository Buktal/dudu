import { BookOpenIcon, PlayIcon, SaveIcon, SquareIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { SaveAsDialog } from "@/components/entity-dialogs";
import { EntityHeader } from "@/components/entity-header";
import { IconButton } from "@/components/icon-button";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { selectConnection, setConnectionChannel } from "@/features/connections";
import { useAppDispatch, useAppSelector } from "@/hooks/use-app-store";
import { errorMessage } from "@/lib/errors";
import { setView } from "@/stores/app-slice";
import { resolveEditorFields } from "../definitions/resolve";
import { latestVersion } from "../model";
import { parseWireDraft, wireDraftText } from "../payload";
import { schemaById } from "../schemas";
import { selectSchemaUserDefinition } from "../selectors";
import * as actions from "../stores/events-slice";
import { CustomFieldDialog } from "./custom-field-dialog";
import { DictionaryDialog } from "./dictionary-dialog";
import { EventFields } from "./event-fields";
import { EventExpectedFields, EventRawEditor } from "./event-payload-tabs";
import { EventRoute } from "./event-route";

export type EventEditorSlots = {
  onDirectDispatch: () => void;
  dispatchSending: boolean;
  dispatchDisabled?: boolean;
  dispatchStopping?: boolean;
  footer: ReactNode;
  referencingScenarioNames: string[];
  onDeleteEvent: (eventId: string) => Promise<void>;
  onStopDispatch?: () => void;
};
type TabKey = "form" | "raw" | "expect";

export function EventEditor({ slots }: { slots?: EventEditorSlots }) {
  const dispatch = useAppDispatch();
  const state = useAppSelector((root) => root.events);
  const draft = state.draft;
  const connection = useAppSelector((root) =>
    draft ? selectConnection(root.connections, draft.channelId) : undefined,
  );
  const [tab, setTab] = useState<TabKey>("form");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [dictionary, setDictionary] = useState<string | null>(null);
  const [customField, setCustomField] = useState(false);
  if (!draft) return null;
  const schema = schemaById(draft.schemaId);
  const event = state.items.find((item) => item.id === draft.id);
  const latest = event && latestVersion(event);
  const definition = selectSchemaUserDefinition(state, draft.schemaId);
  const fields = resolveEditorFields(schema, definition?.fields, draft.payload);
  const dirty = actions.selectDraftDirty(state);
  const raw = state.rawText ?? wireDraftText(schema, draft.payload);
  const applyRaw = () => {
    try {
      dispatch(actions.setDraftPayload(parseWireDraft(schema, raw)));
      setError("");
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    }
  };
  const changeTab = (value: TabKey) => {
    if (tab === "raw" && state.rawText != null && !applyRaw()) return;
    setTab(value);
  };
  const save = async () => {
    if (state.rawText != null && !applyRaw()) {
      setTab("raw");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await dispatch(actions.saveEvent()).unwrap();
      toast.add({
        title: "事件已保存",
        description: draft.name,
        type: "success",
      });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => changeTab(value as TabKey)}
      className="flex min-h-0 flex-1 flex-col gap-0"
    >
      <EntityHeader
        name={draft.name}
        label="事件"
        onNameChange={(name) => dispatch(actions.setDraftName(name))}
        channel={draft.channelId}
        kicker={schema.name}
        dirty={dirty}
        saved={!!event}
        revision={latest?.revision}
        favorite={draft.favorite}
        onFavorite={() => dispatch(actions.toggleEventFavorite())}
        actions={
          <>
            <Button variant="ghost" onClick={() => setCopying(true)}>
              另存为
            </Button>
            <Button
              variant={dirty ? "secondary" : "outline"}
              disabled={saving || !dirty}
              onClick={() => void save()}
            >
              {saving ? (
                <Spinner aria-label="正在保存" data-icon="inline-start" />
              ) : (
                <SaveIcon aria-hidden="true" data-icon="inline-start" />
              )}
              {saving ? "正在保存…" : "保存事件"}
            </Button>
            {slots ? (
              <Button
                variant={slots.dispatchSending ? "destructive" : "default"}
                disabled={
                  slots.dispatchSending
                    ? slots.dispatchStopping || !slots.onStopDispatch
                    : slots.dispatchDisabled
                }
                onClick={() => {
                  if (slots.dispatchSending) {
                    slots.onStopDispatch?.();
                    return;
                  }
                  if (state.rawText != null && !applyRaw()) {
                    setTab("raw");
                    return;
                  }
                  slots.onDirectDispatch();
                }}
              >
                {slots.dispatchSending ? (
                  <SquareIcon aria-hidden="true" data-icon="inline-start" />
                ) : (
                  <PlayIcon aria-hidden="true" data-icon="inline-start" />
                )}
                {slots.dispatchStopping
                  ? "正在停止…"
                  : slots.dispatchSending
                    ? "停止运行"
                    : "发送一次"}
              </Button>
            ) : null}
          </>
        }
      />
      <EventRoute
        channel={draft.channelId}
        url={connection?.url}
        expectedStatus={draft.expected.status}
        onConfigure={() => {
          dispatch(setConnectionChannel(draft.channelId));
          dispatch(setView("connections"));
        }}
        onExpected={() => changeTab("expect")}
      />
      <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-card px-5 lg:px-7">
        <TabsList
          variant="line"
          className="h-11 min-w-0"
          aria-label="参数编辑方式"
        >
          <TabsTrigger value="form">
            字段编辑{" "}
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
              {fields.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="raw">
            完整报文{" "}
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
              {schema.wire.toUpperCase()}
            </span>
          </TabsTrigger>
          <TabsTrigger value="expect">期望回执</TabsTrigger>
        </TabsList>
        <IconButton label="管理字段说明" onClick={() => setDictionary("")}>
          <BookOpenIcon aria-hidden="true" />
        </IconButton>
      </div>
      {error ? (
        <Notice role="alert" className="mb-4" variant="destructive">
          {error}
        </Notice>
      ) : null}
      <TabsContent
        value="form"
        className="min-h-0 flex-1 overflow-y-auto p-5 lg:p-7"
      >
        <EventFields
          schema={schema}
          draft={draft}
          fields={fields}
          fieldInputs={state.fieldInputs}
          onDescribe={setDictionary}
          onAdd={() => setCustomField(true)}
        />
      </TabsContent>
      <TabsContent
        value="raw"
        className="min-h-0 flex-1 overflow-y-auto p-5 lg:p-7"
      >
        <EventRawEditor
          schema={schema}
          raw={raw}
          onChange={(value) => dispatch(actions.setDraftRawText(value))}
          onApply={applyRaw}
          onError={setError}
        />
      </TabsContent>
      <TabsContent
        value="expect"
        className="min-h-0 flex-1 overflow-y-auto p-5 lg:p-7"
      >
        <EventExpectedFields
          expected={draft.expected}
          onChange={(value) => dispatch(actions.setDraftExpected(value))}
        />
      </TabsContent>
      {slots?.footer}
      {copying ? (
        <SaveAsDialog
          label="事件"
          name={draft.name}
          onSave={(name) => dispatch(actions.saveEventAs(name)).unwrap()}
          onClose={() => setCopying(false)}
        />
      ) : null}
      {dictionary !== null ? (
        <DictionaryDialog
          schema={schema}
          payload={draft.payload}
          userDefinition={definition}
          initialPath={dictionary || null}
          onClose={() => setDictionary(null)}
        />
      ) : null}
      {customField ? (
        <CustomFieldDialog
          schema={schema}
          payload={draft.payload}
          onAdd={(payload) => dispatch(actions.setDraftPayload(payload))}
          onClose={() => setCustomField(false)}
        />
      ) : null}
    </Tabs>
  );
}
