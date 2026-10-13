/**
 * desk 实时通道的测试夹具：真实 Socket 边界的来源常量与假 Socket（协议与事件用例
 * 文件共用，各文件按职责引用，不复制）。
 */
export const ORIGIN = "https://desk.example.test";

// 假 Socket：用例直接驱动 open/receive/drop 模拟服务端行为
export class FakeSocket {
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
  }

  open() {
    this.onopen?.();
  }

  receive(frame: unknown) {
    this.onmessage?.({
      data: typeof frame === "string" ? frame : JSON.stringify(frame),
    });
  }

  drop() {
    this.onclose?.();
  }
}
