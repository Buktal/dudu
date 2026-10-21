const en = document.documentElement.lang === "en";
const t = (zh, english) => en ? english : zh;
const root = document.getElementById("demo");
const scenarios = [
  { channel: t("微信公众号", "WeChat"), name: t("林女士", "Lin"), initials: "L", subject: t("订单进度咨询", "Order status"), message: t("您好，请问如何查询订单进度？", "Hello, how can I check my order status?"), reply: t("您好，您可以在订单详情页查看最新进度。如需进一步核实，请提供订单编号。", "You can find the latest status on the order details page. Please share your order number if you need further assistance."), tag: t("订单咨询", "Order enquiry"), note: t("希望了解订单查询方式。", "Needs help finding order status.") },
  { channel: "Telegram", name: t("陈先生", "Chen"), initials: "C", subject: t("桌面端使用咨询", "Desktop app enquiry"), message: t("请问可以在浏览器中使用工作台吗？", "Can I use the agent workspace in a browser?"), reply: t("可以。工作台支持浏览器访问；桌面端需要通过源码构建。部署说明中提供了运行步骤。", "Yes. The workspace runs in a browser. The desktop app is built from source; the setup guide explains the steps."), tag: t("使用咨询", "Product enquiry"), note: t("优先使用浏览器访问。", "Prefers browser access.") },
  { channel: "WhatsApp", name: t("周女士", "Zhou"), initials: "Z", subject: t("部署方式咨询", "Deployment enquiry"), message: t("我们希望自行部署，可以使用自己的服务器吗？", "Can we deploy DuDu on our own servers?"), reply: t("可以。DuDu 支持自行部署。请先阅读部署指南，并根据需要配置渠道账号及授权。", "Yes. DuDu supports self-hosting. Start with the deployment guide, then configure channel accounts and authorization."), tag: t("部署咨询", "Deployment enquiry"), note: t("评估自托管方案。", "Evaluating self-hosting.") },
];
let current = 0;
let stage = 0;
let sent = false;
let profile = false;
const $ = selector => root.querySelector(selector);
const choices = [...root.querySelectorAll("[data-demo-channel]")];
const steps = [...root.querySelectorAll("[data-demo-step]")];
const captions = [
  t("可先选择渠道，再点击“下一步：查看会话”。也可直接选择上方任一步骤。", "Choose a channel, then select “Next: open conversation”. You can also select any step above."),
  t("会话已打开。阅读来信后，点击“下一步：模拟发送回复”。", "The conversation is open. Read the message, then select “Next: send sample reply”."),
  t("示例回复已添加到消息记录。下一步，查看来访资料。", "The sample reply has been added. Next, review the visitor details."),
  t("查看来访标签与内部备注，了解如何保留接待上下文。", "Review visitor tags and internal notes to preserve context."),
];

function render() {
  const item = scenarios[current];
  choices.forEach((button, i) => button.setAttribute("aria-pressed", String(i === current)));
  steps.forEach((button, i) => {
    if (i === stage) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
    button.classList.toggle("complete", i < stage);
  });
  $("#demo-caption").textContent = captions[stage];
  $("#demo-back").disabled = stage === 0;
  $("#demo-next").textContent = [t("下一步：查看会话", "Next: open conversation"), t("下一步：模拟发送回复", "Next: send sample reply"), t("下一步：查看来访资料", "Next: view visitor details"), t("重新体验", "Restart tour")][stage];
  $("#demo-avatar").textContent = item.initials;
  $("#demo-visitor").textContent = item.name;
  $("#demo-channel-label").textContent = item.channel;
  $("#demo-subject").textContent = item.subject;
  $("#demo-preview").textContent = item.message;
  $("#demo-conversation").hidden = stage === 0;
  $("#demo-empty").hidden = stage > 0;
  $("#demo-incoming").textContent = item.message;
  $("#demo-reply").textContent = item.reply;
  $("#demo-reply-row").hidden = !sent;
  $("#demo-draft").textContent = item.reply;
  $("#demo-send").disabled = sent;
  $("#demo-send").textContent = sent ? t("已模拟发送", "Simulated reply sent") : t("模拟发送回复", "Send sample reply");
  $("#demo-profile").hidden = !profile;
  $("#demo-profile-toggle").setAttribute("aria-expanded", String(profile));
  $("#demo-profile-toggle").disabled = !sent;
  $("#demo-tag").textContent = item.tag;
  $("#demo-note").textContent = item.note;
  $("#demo-open").setAttribute("aria-pressed", String(stage > 0));
}

function selectStage(next) {
  stage = next;
  sent = stage >= 2;
  profile = stage === 3;
  render();
  $(".demo-main").scrollTop = 0;
  $("#demo-status").textContent = stage === 3
    ? t("导览已完成。可返回任一步骤、切换渠道或重新体验。", "Tour complete. Return to any step, choose another channel or restart.")
    : captions[stage];
}

steps.forEach((button, i) => button.addEventListener("click", () => selectStage(i)));
$("#demo-next").addEventListener("click", () => selectStage((stage + 1) % steps.length));
$("#demo-back").addEventListener("click", () => selectStage(stage - 1));
choices.forEach((button, i) => button.addEventListener("click", () => {
  current = i;
  selectStage(0);
}));
$("#demo-open").addEventListener("click", () => selectStage(1));
$("#demo-send").addEventListener("click", () => selectStage(2));
$("#demo-profile-toggle").addEventListener("click", () => selectStage(profile ? 2 : 3));
$("#demo-reset").addEventListener("click", () => {
  current = 0;
  selectStage(0);
});
$("#demo-interactive").hidden = false;
render();
