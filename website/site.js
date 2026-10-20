import { createSignalScene } from "./scene.js";

const en = document.documentElement.lang === "en";
const text = (zh, english) => en ? english : zh;
document.body.classList.add("enhanced");

// Native buttons with roving focus and the standard horizontal tab keys.
const tabs = [...document.querySelectorAll(".suite-tab")];
function selectTab(index, focus = false) {
  tabs.forEach((tab, i) => {
    const selected = i === index;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    document.getElementById(tab.getAttribute("aria-controls")).hidden = !selected;
  });
  if (focus) tabs[index].focus();
}
tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => selectTab(i));
  tab.addEventListener("keydown", event => {
    const next = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
    if (next !== undefined) {
      event.preventDefault();
      selectTab(next, true);
    }
  });
});
selectTab(0);

const dialog = document.querySelector(".lightbox");
const enlargedImage = dialog.querySelector("img");
document.querySelectorAll("[data-lightbox]").forEach(link => {
  link.addEventListener("click", event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    enlargedImage.src = link.href;
    enlargedImage.alt = link.querySelector("img").alt;
    dialog.showModal();
  });
});
dialog.querySelector("button").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });

const channelButtons = [...document.querySelectorAll("[data-channel]")];
const channelLabel = document.getElementById("receipt-channel");
const message = document.getElementById("receipt-message");
const status = document.getElementById("signal-status");
const tracks = [...document.querySelectorAll(".receipt-track i")];
const motionButton = document.getElementById("motion-toggle");
const preference = matchMedia("(prefers-reduced-motion: reduce)");
const announcement = document.createElement("div");
announcement.className = "sr-only";
announcement.setAttribute("role", "status");
document.querySelector(".scene-controls").append(announcement);
const messages = [
  text("请问如何查询订单进度？", "How can I check my order status?"),
  text("需要补充一份产品使用说明。", "Could you share the product instructions?"),
  text("请问可以更新收件地址吗？", "Can I update my delivery address?"),
  text("桌面端支持哪些操作系统？", "Which operating systems does the desktop app support?"),
  text("希望进一步了解部署方式。", "I'd like to learn about deployment options."),
];
const stages = [
  text("渠道来信 · 示意", "Incoming callback · illustration"),
  text("签名校验 · 示意", "Signature verification · illustration"),
  text("会话持久化 · 示意", "Conversation stored · illustration"),
  text("实时推送 · 示意", "Real-time push · illustration"),
  text("工作台已接收 · 示意", "Received in workspace · illustration"),
];
let paused = preference.matches;
let selected = 0;
let phase = -1;
let userSelected = false;
let manual = false;
const scene = createSignalScene(document.getElementById("signal-canvas"), progress => {
  const next = progress === 1 ? 4 : Math.min(3, Math.floor(progress * 4));
  if (next === phase) return;
  phase = next;
  status.textContent = stages[next];
  tracks.forEach((track, i) => track.classList.toggle("on", i < next));
  if (next === 4 && manual) {
    announcement.textContent = text(
      `${channelLabel.textContent} 示例消息已汇入工作台。`,
      `${channelLabel.textContent} sample message received in the workspace.`,
    );
    manual = false;
  }
});

if (scene) {
  document.body.classList.add("scene-ready");
  motionButton.hidden = false;
  function send(index, fromUser = false) {
    selected = index;
    manual = fromUser;
    phase = -1;
    channelLabel.textContent = channelButtons[index].textContent;
    message.textContent = messages[index];
    channelButtons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === index)));
    scene.send(index);
  }
  function setMotion(value) {
    paused = value;
    motionButton.textContent = paused ? text("恢复动效", "Resume motion") : text("暂停动效", "Pause motion");
    motionButton.setAttribute("aria-pressed", String(paused));
    scene.setPaused(paused);
  }
  channelButtons.forEach((button, i) => button.addEventListener("click", () => {
    userSelected = true;
    send(i, true);
  }));
  motionButton.addEventListener("click", () => {
    setMotion(!paused);
    if (!paused) send(selected);
  });
  preference.addEventListener("change", event => setMotion(event.matches));
  setMotion(paused);
  send(0);
  // Only cycle while the scene is visible, until the visitor chooses a channel.
  setInterval(() => {
    if (!paused && !userSelected && scene.isVisible()) send((selected + 1) % channelButtons.length);
  }, 5200);
}
