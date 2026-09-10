import { Button } from "@/components/ui/button";

function App() {
  return (
    <main className="flex min-h-svh p-6">
      <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
        <div>
          <h1 className="font-medium">dudu-console</h1>
          <p className="text-muted-foreground">
            shadcn 主题已就绪，业务界面待搭建。
          </p>
          <Button className="mt-2">Button</Button>
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          （按 <kbd>d</kbd> 切换深浅色）
        </div>
      </div>
    </main>
  );
}

export default App;
