import { useEffect, useState } from "react";
import { useConsoleQuery } from "@/api/console-query";
import { usePagedQuery } from "@/api/paged-query";
import { ErrorState, LoadingState, Message } from "@/components/feedback";
import { TextField } from "@/components/form-field";
import { QueryView } from "@/components/query-view";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AccountDetailPanel, ConfigurationStatus } from "./AccountDetailPanel";
import { AccountEditor } from "./AccountEditor";
import { type AccountFilters, channelApi } from "./api";
export function ChannelAccountsPage({
  selectedId,
  creating,
  groupId,
  onSelect,
  onCreate,
}: {
  selectedId: string | null;
  creating: boolean;
  groupId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (creating: boolean) => void;
}) {
  const catalog = useConsoleQuery(channelApi.catalog, []);
  const groups = useConsoleQuery(channelApi.groups, []);
  const query = usePagedQuery(channelApi.query, {
    page: 1,
    pageSize: 20,
    groupId: groupId ?? undefined,
  } as AccountFilters);
  const [keyword, setKeyword] = useState("");
  const [channel, setChannel] = useState("");
  const [group, setGroup] = useState(groupId ?? "");
  const [notice, setNotice] = useState("");
  const { setFilter } = query;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 路由参数变化时同步筛选；setFilter 是分页机制每次渲染的新函数。
  useEffect(() => {
    setGroup(groupId ?? "");
    setFilter({ groupId: groupId ?? undefined });
  }, [groupId]);
  if (catalog.loading || groups.loading) return <LoadingState />;
  if (catalog.error || groups.error)
    return (
      <ErrorState
        message={catalog.error ?? groups.error ?? "读取失败"}
        retry={() => {
          catalog.refresh();
          groups.refresh();
        }}
      />
    );
  const definitions = catalog.data?.channels ?? [];
  const options = groups.data ?? [];
  return (
    <div className="flex flex-col gap-5">
      {notice && <Message>{notice}</Message>}
      <QueryView
        query={query}
        empty={{
          defaultCopy: {
            title: "还没有渠道账号",
            description: options.length
              ? "接入渠道账号后，在渠道平台配置回调并验证。"
              : "请联系初始管理员分配用户组后接入渠道账号。",
          },
          filteredCopy: {
            title: "没有符合条件的账号",
            description: "调整筛选条件后重试。",
          },
        }}
        filters={
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              query.setFilter({
                keyword: keyword.trim() || undefined,
                channel: channel || undefined,
                groupId: group || undefined,
              });
            }}
          >
            <TextField
              label="账号名称"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索账号名称"
            />
            <label className="grid gap-2 text-sm">
              渠道
              <select
                className="h-9 rounded-lg border bg-background px-3"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                <option value="">全部渠道</option>
                {definitions.map((d) => (
                  <option key={d.channel} value={d.channel}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              用户组
              <select
                className="h-9 max-w-60 rounded-lg border bg-background px-3"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
              >
                <option value="">全部可管理组</option>
                {options.map((g) => (
                  <option key={g.groupId} value={g.groupId}>
                    {g.groupName} · {g.groupId}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="outline">
              筛选
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setKeyword("");
                setChannel("");
                setGroup("");
                query.reset();
              }}
            >
              重置
            </Button>
          </form>
        }
        actions={
          <>
            <Button
              variant="outline"
              disabled={query.loading}
              onClick={query.refresh}
            >
              刷新
            </Button>
            <Button disabled={!options.length} onClick={() => onCreate(true)}>
              接入渠道账号
            </Button>
          </>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>账号</TableHead>
              <TableHead>渠道</TableHead>
              <TableHead>所属用户组</TableHead>
              <TableHead>配置情况</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.list.map((a) => (
              <TableRow key={a.companyChannelId}>
                <TableCell>
                  <span className="font-medium">{a.accountName}</span>
                  <p className="text-xs text-muted-foreground">
                    {a.companyChannelId}
                  </p>
                </TableCell>
                <TableCell>
                  {definitions.find((d) => d.channel === a.channel)?.name ??
                    a.channel}
                </TableCell>
                <TableCell>{a.groupName}</TableCell>
                <TableCell>
                  <ConfigurationStatus account={a} />
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSelect(a.companyChannelId)}
                  >
                    查看详情
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </QueryView>
      {creating && (
        <AccountEditor
          definitions={definitions}
          groups={options}
          initialGroup={groupId}
          onClose={() => onCreate(false)}
          onUnavailable={() => {
            onCreate(false);
            query.refresh();
          }}
          onSaved={(a) => {
            onCreate(false);
            onSelect(a.companyChannelId);
            setNotice("参数已保存，请在渠道平台配置并验证。");
            query.refresh();
          }}
        />
      )}
      {selectedId && (
        <AccountDetailPanel
          key={selectedId}
          id={selectedId}
          definitions={definitions}
          groups={options}
          onClose={() => onSelect(null)}
          onChanged={() => {
            setNotice("参数已保存，请在渠道平台配置并验证。");
            query.refresh();
            groups.refresh();
          }}
        />
      )}
    </div>
  );
}
