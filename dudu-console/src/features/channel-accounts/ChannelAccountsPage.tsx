import { useEffect, useState } from "react";
import { useConsoleQuery } from "@/api/console-query";
import { ErrorState, LoadingState, Message } from "@/components/feedback";
import { FilterBar } from "@/components/filter-bar";
import { FilterSelect, RefreshButton } from "@/components/page-parts";
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
import { useAccounts } from "./account-data";
import { channelApi } from "./api";
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
  const query = useAccounts({
    page: 1,
    pageSize: 20,
    groupId: groupId ?? undefined,
  });
  const [notice, setNotice] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 路由参数变化时同步筛选，已应用值一致时不再触发（避免挂载期多余请求）；setGroup 是数据模块每次渲染的新函数。
  useEffect(() => {
    if (query.groupId !== (groupId ?? undefined))
      query.setGroup(groupId ?? "all");
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
          <FilterBar
            label="渠道账号筛选"
            searchLabel="搜索账号名称"
            placeholder="搜索账号名称"
            value={query.keyword}
            hasConditions={
              query.channel !== undefined || query.groupId !== undefined
            }
            onSearch={query.setKeyword}
            onReset={query.reset}
          >
            <FilterSelect<string | "all">
              label="渠道"
              value={query.channel ?? "all"}
              options={[
                { value: "all", label: "全部渠道" },
                ...definitions.map((d) => ({
                  value: d.channel,
                  label: d.name,
                })),
              ]}
              onChange={query.setChannel}
            />
            <FilterSelect<string | "all">
              label="用户组"
              value={query.groupId ?? "all"}
              options={[
                { value: "all", label: "全部可管理组" },
                ...options.map((g) => ({
                  value: g.groupId,
                  label: `${g.groupName} · ${g.groupId}`,
                })),
              ]}
              onChange={query.setGroup}
            />
          </FilterBar>
        }
        actions={
          <>
            <RefreshButton loading={query.loading} onClick={query.refresh} />
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
          onUnavailable={() => onCreate(false)}
          onSaved={(a) => {
            onCreate(false);
            onSelect(a.companyChannelId);
            setNotice("参数已保存，请在渠道平台配置并验证。");
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
          notify={(message) => setNotice(message)}
        />
      )}
    </div>
  );
}
